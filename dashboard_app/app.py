from flask import Flask, request, session, jsonify
from flask_cors import CORS
import os
import polars as pl
from werkzeug.utils import secure_filename
import uuid
from datetime import datetime
import logging
import secrets

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)
# Allow CORS for development with Vite on default port
CORS(app, supports_credentials=True, origins=["http://localhost:5173", "http://127.0.0.1:5173"])
app.secret_key = secrets.token_hex(32)

# --- In-Memory Cache (Replaces large Session Cookies) ---
# Format: { 'session_id': { 'filepath': '...', 'preview': {...} } }
DATA_CACHE = {}

# --- Helpers ---
def add_notification(message, category='info'):
    if 'notifications' not in session:
        session['notifications'] = []
    
    # Add new notification
    new_notif = {
        'message': message,
        'category': category,
        'time': datetime.now().strftime('%H:%M')
    }
    session['notifications'].insert(0, new_notif)
    
    # Keep only last 5
    if len(session['notifications']) > 5:
        session['notifications'] = session['notifications'][:5]
    
    session['has_unread'] = True
    session.modified = True
    return new_notif

# --- Routes ---

@app.route('/api/notifications/read', methods=['POST'])
def mark_notifications_read():
    session['has_unread'] = False
    return jsonify({'status': 'success'})

# Config for uploads
UPLOAD_FOLDER = 'uploads'
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Mock Data for Login (To be replaced with DB later)
USERS = {
    "admin": "password123",
    "user": "bank2024"
}

@app.route('/api/status', methods=['GET'])
def status():
    if 'user' in session:
        return jsonify({'status': 'success', 'user': session['user'], 'has_unread': session.get('has_unread', False), 'notifications': session.get('notifications', [])})
    return jsonify({'status': 'error', 'message': 'Non autorisé'}), 401

@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data:
        return jsonify({'status': 'error', 'message': 'No data provided'}), 400
        
    username = data.get('username')
    password = data.get('password')
    
    if username in USERS and USERS[username] == password:
        session['user'] = username
        session['notifications'] = [] # Reset notifications on new login
        
        # Create a unique cache ID for this user session if not exists
        if 'cache_id' not in session:
            session['cache_id'] = str(uuid.uuid4())
            
        add_notification("Connexion réussie", "success")
        return jsonify({'status': 'success'})
    else:
        add_notification("Échec de connexion", "error")
        return jsonify({'status': 'error', 'message': 'Identifiants incorrects'}), 401

@app.route('/logout', methods=['POST'])
def logout():
    # Clear server cache
    cache_id = session.get('cache_id')
    if cache_id and cache_id in DATA_CACHE:
        del DATA_CACHE[cache_id]
        
    session.pop('user', None)
    session.pop('cache_id', None)
    return jsonify({'status': 'success'})

@app.route('/clear_data', methods=['POST'])
def clear_data():
    if 'user' not in session:
        return jsonify({'status': 'error'}), 401
        
    cache_id = session.get('cache_id')
    if cache_id and cache_id in DATA_CACHE:
        del DATA_CACHE[cache_id]
        add_notification("Données supprimées", "warning")
        
    return jsonify({'status': 'success'})

def process_file_preview(filepath, sheet_name=None, schema_overrides=None):
    try:
        # Check for multiple sheets in Excel
        if filepath.endswith(('.xls', '.xlsx')) and sheet_name is None:
            import pandas as pd
            xl = pd.ExcelFile(filepath)
            if len(xl.sheet_names) > 1:
                return {
                    'requires_sheet_selection': True,
                    'sheets': xl.sheet_names
                }
            sheet_name = xl.sheet_names[0]
            
        if filepath.endswith('.csv'):
            with open(filepath, 'rb') as f:
                df = pl.read_csv(f.read(), ignore_errors=True)
        elif filepath.endswith(('.xls', '.xlsx')):
            if sheet_name:
                df = pl.read_excel(filepath, sheet_name=sheet_name)
            else:
                df = pl.read_excel(filepath)
        else:
            raise ValueError("Format non supporté")
            
        # Apply manual type overrides if provided
        if schema_overrides:
            cast_exprs = []
            for col, target in schema_overrides.items():
                if col in df.columns:
                    current_type = str(df[col].dtype)
                    if target == 'String' and 'String' not in current_type and 'Utf8' not in current_type:
                        cast_exprs.append(pl.col(col).cast(pl.String))
                    elif target == 'Int64' and 'Int' not in current_type:
                        cast_exprs.append(pl.col(col).cast(pl.Int64, strict=False))
                    elif target == 'Float64' and 'Float' not in current_type:
                        cast_exprs.append(pl.col(col).cast(pl.Float64, strict=False))
            if cast_exprs:
                df = df.with_columns(cast_exprs)

        # Extract column info for the UI
        columns_info = []
        for col in df.columns:
            columns_info.append({
                'name': col,
                'dtype': str(df[col].dtype),
                'is_numeric': df[col].dtype.is_numeric()
            })

        limit = 2000 
        safe_df = df.head(limit).select(pl.all().cast(pl.String))
        
        return {
            'requires_sheet_selection': False,
            'columns': [{'title': col, 'field': col} for col in df.columns],
            'columns_info': columns_info,
            'data': safe_df.to_dicts(), 
            'total_rows': df.height,
            'selected_sheet': sheet_name
        }
    except Exception as e:
        logger.error(f"Error processing preview: {e}", exc_info=True)
        return None

def read_cached_df(cache_id):
    if not cache_id or cache_id not in DATA_CACHE:
        return None
    
    item = DATA_CACHE[cache_id]
    filepath = item.get('filepath')
    selected_sheet = item.get('selected_sheet')
    overrides = item.get('schema_overrides', {})
    
    if not filepath or not os.path.exists(filepath):
        return None
        
    try:
        if filepath.endswith('.csv'):
            with open(filepath, 'rb') as f:
                df = pl.read_csv(f.read(), ignore_errors=True)
        elif filepath.endswith(('.xls', '.xlsx')):
            if selected_sheet:
                df = pl.read_excel(filepath, sheet_name=selected_sheet)
            else:
                df = pl.read_excel(filepath)
        else:
            return None
            
        # Apply overrides if they don't match current inference
        if overrides:
            cast_exprs = []
            for col, target in overrides.items():
                if col in df.columns:
                    current_type = str(df[col].dtype)
                    # Simple check: if override starts with Int and current doesn't, or similar
                    if target == 'String' and 'String' not in current_type and 'Utf8' not in current_type:
                        cast_exprs.append(pl.col(col).cast(pl.String))
                    elif target == 'Int64' and 'Int' not in current_type:
                        cast_exprs.append(pl.col(col).cast(pl.Int64, strict=False))
                    elif target == 'Float64' and 'Float' not in current_type:
                        cast_exprs.append(pl.col(col).cast(pl.Float64, strict=False))
            
            if cast_exprs:
                df = df.with_columns(cast_exprs)
        return df
    except Exception as e:
        logger.error(f"Error reading cached df: {e}")
        return None

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'user' not in session:
        return jsonify({'status': 'error', 'message': 'Non autorisé'}), 401
        
    if 'file' not in request.files:
        return jsonify({'status': 'error', 'message': 'Pas de fichier'}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({'status': 'error', 'message': 'Nom de fichier vide'}), 400
        
    try:
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)

        cache_id = str(uuid.uuid4())
        session['cache_id'] = cache_id
        
        preview_data = process_file_preview(filepath)
        
        # Core cache entry initialization
        DATA_CACHE[cache_id] = {
            'filepath': filepath,
            'filename': filename,
            'schema_overrides': {},
            'preview': preview_data,
            'selected_sheet': preview_data.get('selected_sheet') if preview_data else None
        }

        if preview_data and preview_data.get('requires_sheet_selection'):
            # Update cache for multi-sheet scenario
            DATA_CACHE[cache_id]['preview'] = None
            DATA_CACHE[cache_id]['pending_sheets'] = preview_data['sheets']
            return jsonify({
                'status': 'requires_sheet',
                'sheets': preview_data['sheets'],
                'message': 'Plusieurs feuilles détectées.'
            })
        
        new_notif = add_notification(f"Fichier {file.filename} importé", "info")
        
        return jsonify({
            'status': 'success', 
            'message': 'Fichier reçu et traité avec succès !',
            'notification': new_notif
        })
        
    except Exception as e:
        logger.error(f"Error processing file: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': f'Erreur: {str(e)}'}), 500

@app.route('/api/select-sheet', methods=['POST'])
def select_sheet():
    if 'user' not in session:
        return jsonify({'status': 'error', 'message': 'Non autorisé'}), 401
        
    data = request.get_json()
    sheet_name = data.get('sheet_name')
    
    if not sheet_name:
        return jsonify({'status': 'error', 'message': 'Nom de feuille manquant'}), 400
        
    cache_id = session.get('cache_id')
    if not cache_id or cache_id not in DATA_CACHE:
         return jsonify({'status': 'error', 'message': 'Aucun fichier en attente'}), 404
         
    filepath = DATA_CACHE[cache_id].get('filepath')
    if not filepath:
         return jsonify({'status': 'error', 'message': 'Chemin du fichier introuvable'}), 404
         
    try:
        preview_data = process_file_preview(filepath, sheet_name=sheet_name)
        
        # Keep existing overrides if any
        overrides = DATA_CACHE[cache_id].get('schema_overrides', {})
        
        DATA_CACHE[cache_id] = {
            'filepath': filepath,
            'preview': preview_data,
            'selected_sheet': sheet_name,
            'schema_overrides': overrides
        }
        
        new_notif = add_notification(f"Feuille '{sheet_name}' chargée", "info")
        
        return jsonify({
            'status': 'success', 
            'message': 'Feuille chargée avec succès !',
            'notification': new_notif
        })
    except Exception as e:
        logger.error(f"Error loading sheet: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': f'Erreur: {str(e)}'}), 500

@app.route('/api/database/recast', methods=['POST'])
def database_recast():
    if 'user' not in session:
        return jsonify({'status': 'error', 'message': 'Non autorisé'}), 401
    
    cache_id = session.get('cache_id')
    if not cache_id or cache_id not in DATA_CACHE:
         return jsonify({'status': 'error', 'message': 'Aucun fichier en attente'}), 404
         
    filepath = DATA_CACHE[cache_id].get('filepath')
    selected_sheet = DATA_CACHE[cache_id].get('selected_sheet')
    if not filepath or not os.path.exists(filepath):
         return jsonify({'status': 'error', 'message': 'Fichier introuvable'}), 404
         
    data = request.get_json()
    modifications = data.get('modifications', [])
    if not modifications:
        return jsonify({'status': 'success', 'message': 'Aucune modification'})
        
    try:
        # 1. Load the dataframe
        # 1. Load the dataframe safely (avoiding memory mapping)
        if filepath.endswith('.csv'):
            with open(filepath, 'rb') as f:
                df = pl.read_csv(f.read(), ignore_errors=True)
        elif filepath.endswith(('.xls', '.xlsx')):
            if selected_sheet:
                df = pl.read_excel(filepath, sheet_name=selected_sheet)
            else:
                df = pl.read_excel(filepath)
        else:
            return jsonify({'status': 'error', 'message': 'Format non supporté'}), 400
            
        # 2. Apply modifications
        expressions = []
        for mod in modifications:
            col_name = mod['column']
            target_type = mod['type']
            if col_name in df.columns:
                # Clean the column: strip whitespace, handle European decimal commas, remove currency/percent symbols
                clean_col = pl.col(col_name).cast(pl.String).str.strip_chars()
                # Remove spaces between numbers (e.g., "1 000") and common non-numeric chars
                clean_col = clean_col.str.replace_all(r"[^\d.,\-]", "")
                # Final pass: convert comma to dot for parsing
                clean_col = clean_col.str.replace(r",", ".")

                if target_type == 'String':
                    expressions.append(pl.col(col_name).cast(pl.String))
                elif target_type == 'Int64':
                    # Cast to Float first to handle "12.0" as string, then to Int
                    expressions.append(clean_col.cast(pl.Float64, strict=False).cast(pl.Int64, strict=False))
                elif target_type == 'Float64':
                    expressions.append(clean_col.cast(pl.Float64, strict=False))
                    
        if not expressions:
            return jsonify({'status': 'error', 'message': 'Types non supportés'}), 400
            
        # Execute a "Dry-Run" for validation
        test_df = df.with_columns(expressions)
        
        # Validate for impossible conversions (100% data loss)
        for mod in modifications:
            col = mod['column']
            if col in df.columns:
                before_count = df[col].n_unique() - (1 if df[col].null_count() > 0 else 0)
                after_count = test_df[col].n_unique() - (1 if test_df[col].null_count() > 0 else 0)
                
                if before_count > 0 and after_count == 0:
                    return jsonify({
                        'status': 'error', 
                        'message': f"Conversion impossible pour '{col}' : toutes les données seraient perdues (texte incompatible avec un nombre)."
                    }), 400

        # If validation passes, proceed with official conversion
        df = test_df
        
        # Update schema overrides for persistence
        for mod in modifications:
            col = mod['column']
            if col in df.columns:
                if 'schema_overrides' not in DATA_CACHE[cache_id]:
                    DATA_CACHE[cache_id]['schema_overrides'] = {}
                DATA_CACHE[cache_id]['schema_overrides'][col] = mod['type']
        
        # Check for partial data loss warnings
        warnings = []
        for mod in modifications:
            col = mod['column']
            if col in df.columns:
                before_val_count = df.height - df[col].null_count() # Approximate before/after
                # Note: df is already casted here, so we need to compare with original stats if we want precise delta
                # But for a simple warning, we can just check null count after cast
                if df[col].null_count() > (df.height * 0.5):
                    warnings.append(f"Attention: >50% de données nulles dans '{col}' après conversion.")

        # 3. Save back to the file (safely)
        temp_filepath = filepath + ".tmp"
        if filepath.endswith('.csv'):
            df.write_csv(temp_filepath)
        elif filepath.endswith('.xlsx'):
            df.write_excel(temp_filepath, worksheet=selected_sheet or 'Sheet1')
        elif filepath.endswith('.xls'):
            temp_filepath = filepath + 'x.tmp' # Save as xlsx
            df.write_excel(temp_filepath, worksheet=selected_sheet or 'Sheet1')
            
        # Atomic replacement to avoid locking issues
        import shutil
        if os.path.exists(filepath):
            # On Windows, we might need multiple attempts or to rename the old one first
            backup_path = filepath + ".old"
            if os.path.exists(backup_path):
                os.remove(backup_path)
            os.rename(filepath, backup_path)
            os.rename(temp_filepath, filepath)
            os.remove(backup_path)
        else:
            os.rename(temp_filepath, filepath)

        if filepath.endswith('.xls') and not filepath.endswith('.xlsx'):
            new_filepath = filepath + 'x'
            os.rename(filepath, new_filepath)
            DATA_CACHE[cache_id]['filepath'] = new_filepath
            filepath = new_filepath
            
        # 4. Update the preview cache with overrides
        DATA_CACHE[cache_id]['preview'] = process_file_preview(
            filepath, 
            sheet_name=selected_sheet,
            schema_overrides=DATA_CACHE[cache_id].get('schema_overrides')
        )
        
        msg = f"{len(modifications)} variables re-typées"
        if warnings:
            msg += f" ({len(warnings)} alertes)"
        
        new_notif = add_notification(msg, "warning" if warnings else "success")
        
        return jsonify({
            'status': 'success', 
            'message': msg,
            'warnings': warnings,
            'notification': new_notif
        })
        
    except Exception as e:
        logger.error(f"Error recasting columns: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': f'Impossible de convertir: {str(e)}'}), 500

@app.route('/api/database', methods=['GET'])
def database_view():
    if 'user' not in session:
        return jsonify({'status': 'error', 'message': 'Non autorisé'}), 401
        
    data_preview = None
    cache_id = session.get('cache_id')
    
    if cache_id and cache_id in DATA_CACHE:
         data_preview = DATA_CACHE[cache_id].get('preview')
            
    return jsonify({'status': 'success', 'data_preview': data_preview})


@app.route('/api/reports/columns', methods=['GET'])
def reports_columns():
    if 'user' not in session:
        return jsonify({'status': 'error', 'message': 'Non autorisé'}), 401
    
    cache_id = session.get('cache_id')
    columns_info = []
    
    if cache_id:
        df = read_cached_df(cache_id)
        if df is not None:
            for col in df.columns:
                columns_info.append({
                    'name': col,
                    'dtype': str(df[col].dtype),
                    'is_numeric': df[col].dtype.is_numeric()
                })
    
    return jsonify({'status': 'success', 'columns_info': columns_info})


@app.route('/api/chart-data', methods=['POST'])
def chart_data():
    if 'user' not in session:
        return jsonify({'status': 'error', 'message': 'Non autorisé'}), 401
    
    cache_id = session.get('cache_id')
    if not cache_id or cache_id not in DATA_CACHE:
        return jsonify({'status': 'error', 'message': 'Aucune donnée disponible'}), 404
    
    filepath = DATA_CACHE[cache_id].get('filepath')
    if not filepath or not os.path.exists(filepath):
        return jsonify({'status': 'error', 'message': 'Fichier introuvable'}), 404
    
    data = request.get_json()
    x_col = data.get('x_column')
    y_col = data.get('y_column')  # Can be empty for frequency mode
    chart_type = data.get('chart_type', 'bar')
    
    if not x_col:
        return jsonify({'status': 'error', 'message': 'Veuillez sélectionner au moins la variable X'}), 400
    
    try:
        df = read_cached_df(cache_id)
        if df is None:
            return jsonify({'status': 'error', 'message': 'Impossible de lire les données'}), 500
        
        if x_col not in df.columns:
            return jsonify({'status': 'error', 'message': f'Colonne "{x_col}" introuvable'}), 400
        if y_col and y_col not in df.columns:
            return jsonify({'status': 'error', 'message': f'Colonne "{y_col}" introuvable'}), 400
        
        x_is_numeric = df[x_col].dtype.is_numeric()
        y_is_numeric = df[y_col].dtype.is_numeric() if y_col else False
        
        # === FREQUENCY MODE (no Y column) ===
        if not y_col:
            df = df.drop_nulls(subset=[x_col])
            freq_df = df.group_by(x_col).agg(pl.count().alias('count'))
            freq_df = freq_df.sort('count', descending=True).head(30)
            
            labels = [str(row[x_col]) for row in freq_df.to_dicts()]
            values = [int(row['count']) for row in freq_df.to_dicts()]
            
            if chart_type == 'pie':
                pie_data = [{'name': l, 'value': v} for l, v in zip(labels, values)]
                return jsonify({
                    'status': 'success',
                    'chart_type': 'pie',
                    'title': f'Fréquence de {x_col}',
                    'data': pie_data
                })
            else:
                return jsonify({
                    'status': 'success',
                    'chart_type': chart_type,
                    'x_name': x_col,
                    'y_name': 'Nombre d\'occurrences',
                    'labels': labels,
                    'values': values
                })
        
        # === TWO COLUMNS MODE ===
        df = df.drop_nulls(subset=[x_col, y_col])
        
        # --- BOXPLOT ---
        if chart_type == 'boxplot':
            if not y_is_numeric:
                return jsonify({'status': 'error', 'message': 'Le boxplot nécessite une variable Y numérique'}), 400
            
            # Compute statistics per category
            categories = df[x_col].cast(pl.Utf8).unique().sort().to_list()[:30]
            boxplot_data = []
            outliers_data = []
            
            for i, cat in enumerate(categories):
                subset = df.filter(pl.col(x_col).cast(pl.Utf8) == cat)[y_col].drop_nulls()
                if subset.len() == 0:
                    continue
                
                q1 = float(subset.quantile(0.25))
                q2 = float(subset.quantile(0.5))  # median
                q3 = float(subset.quantile(0.75))
                iqr = q3 - q1
                lower_fence = q1 - 1.5 * iqr
                upper_fence = q3 + 1.5 * iqr
                
                # Whiskers: min/max within fences
                within = subset.filter((subset >= lower_fence) & (subset <= upper_fence))
                whisker_low = float(within.min()) if within.len() > 0 else float(subset.min())
                whisker_high = float(within.max()) if within.len() > 0 else float(subset.max())
                
                boxplot_data.append([whisker_low, q1, q2, q3, whisker_high])
                
                # Outliers
                outlier_vals = subset.filter((subset < lower_fence) | (subset > upper_fence)).to_list()
                for val in outlier_vals[:50]:  # limit outliers per category
                    outliers_data.append([i, float(val)])
            
            return jsonify({
                'status': 'success',
                'chart_type': 'boxplot',
                'x_name': x_col,
                'y_name': y_col,
                'categories': categories,
                'data': boxplot_data,
                'outliers': outliers_data
            })
        
        # --- SCATTER ---
        if chart_type == 'scatter':
            scatter_df = df.select([x_col, y_col]).head(5000)
            # Convert to float for numeric, string for categorical
            scatter_data = []
            for row in scatter_df.to_dicts():
                x_val = float(row[x_col]) if x_is_numeric else str(row[x_col])
                y_val = float(row[y_col]) if y_is_numeric else str(row[y_col])
                scatter_data.append([x_val, y_val])
            
            return jsonify({
                'status': 'success',
                'chart_type': 'scatter',
                'x_name': x_col,
                'y_name': y_col,
                'data': scatter_data
            })
        
        # --- PIE ---
        if chart_type == 'pie':
            if y_is_numeric:
                agg_df = df.group_by(x_col).agg(pl.col(y_col).sum().alias('value'))
            else:
                agg_df = df.group_by(x_col).agg(pl.col(y_col).count().alias('value'))
            
            agg_df = agg_df.sort('value', descending=True).head(20)
            
            pie_data = [
                {'name': str(row[x_col]), 'value': float(row['value'])}
                for row in agg_df.to_dicts()
            ]
            
            return jsonify({
                'status': 'success',
                'chart_type': 'pie',
                'title': f'{y_col} par {x_col}',
                'data': pie_data
            })
        
        # --- BAR / LINE / AREA ---
        if y_is_numeric:
            agg_df = df.group_by(x_col).agg(pl.col(y_col).sum().alias('value'))
        else:
            agg_df = df.group_by(x_col).agg(pl.col(y_col).count().alias('value'))
        
        agg_df = agg_df.sort('value', descending=True).head(50)
        
        labels = [str(row[x_col]) for row in agg_df.to_dicts()]
        values = [float(row['value']) for row in agg_df.to_dicts()]
        
        return jsonify({
            'status': 'success',
            'chart_type': chart_type,
            'x_name': x_col,
            'y_name': y_col,
            'labels': labels,
            'values': values
        })
    
    except Exception as e:
        print(f"Error generating chart data: {e}")
        return jsonify({'status': 'error', 'message': f'Erreur: {str(e)}'}), 500


@app.route('/api/pivot-data', methods=['POST'])
def pivot_data():
    if 'user' not in session:
        return jsonify({'status': 'error', 'message': 'Non autorisé'}), 401
    
    cache_id = session.get('cache_id')
    if not cache_id or cache_id not in DATA_CACHE:
        return jsonify({'status': 'error', 'message': 'Aucune donnée disponible'}), 404
    
    filepath = DATA_CACHE[cache_id].get('filepath')
    if not filepath or not os.path.exists(filepath):
        return jsonify({'status': 'error', 'message': 'Fichier introuvable'}), 404
    
    data = request.get_json()
    row_cols = data.get('row_cols', [])
    col_col = data.get('col_col', '')
    value_col = data.get('value_col', '')
    agg_func = data.get('agg_func', 'sum')
    
    if not row_cols or not value_col:
        return jsonify({'status': 'error', 'message': 'Veuillez sélectionner au moins une ligne et une valeur'}), 400
    
    try:
        df = read_cached_df(cache_id)
        if df is None:
            return jsonify({'status': 'error', 'message': 'Impossible de lire les données'}), 500
            
        # Validate columns
        all_cols = row_cols + ([col_col] if col_col else []) + [value_col]
        for c in all_cols:
            if c not in df.columns:
                return jsonify({'status': 'error', 'message': f'Colonne "{c}" introuvable'}), 400
        
        # Map aggregation function
        agg_map = {
            'sum': pl.col(value_col).sum(),
            'mean': pl.col(value_col).mean(),
            'count': pl.col(value_col).count(),
            'min': pl.col(value_col).min(),
            'max': pl.col(value_col).max(),
        }
        agg_expr = agg_map.get(agg_func, pl.col(value_col).sum())
        
        # Drop nulls in relevant columns
        df = df.drop_nulls(subset=all_cols)
        
        # --- Backend Robustness & Scientific Validation ---
        is_numeric = df[value_col].dtype.is_numeric()
        
        if agg_func in ['sum', 'mean'] and not is_numeric:
            return jsonify({'status': 'error', 'message': f'La colonne "{value_col}" doit être numérique pour une agrégation de type {agg_func}'}), 400

        if col_col:
            # Check cardinality of the pivot column to prevent browser crash (Limit to 60)
            cardinality = df[col_col].n_unique()
            if cardinality > 60:
                 return jsonify({'status': 'error', 'message': f'Cardinalité trop élevée ({cardinality}). Le champ "{col_col}" contient trop de modalités différentes pour un pivot lisible.'}), 400
            
            # Pivot table with column header
            # First group by row_cols + col_col, aggregate
            grouped = df.group_by(row_cols + [col_col]).agg(agg_expr.alias('value'))
            
            # Pivot: rows = row_cols, columns = col_col, values = 'value'
            # Note: using 'columns' instead of 'on' for compatibility with Polars < 0.20.31
            pivot_df = grouped.pivot(
                on=col_col,
                index=row_cols,
                values='value'
            )
            
            # Sort by first row col
            pivot_df = pivot_df.sort(row_cols[0])
            
            # Build headers
            value_headers = [c for c in pivot_df.columns if c not in row_cols]
            headers = row_cols + value_headers
            
            # Build rows with totals
            rows = []
            for row in pivot_df.to_dicts():
                r = []
                for h in headers:
                    val = row.get(h)
                    if val is None:
                        r.append(None)
                    elif isinstance(val, float):
                        r.append(round(val, 2))
                    else:
                        r.append(val)
                rows.append(r)
            
            # Compute column totals
            totals = []
            for h in headers:
                if h in row_cols:
                    totals.append('Total' if h == row_cols[0] else '')
                else:
                    col_vals = [row[headers.index(h)] for row in rows if row[headers.index(h)] is not None]
                    if col_vals and all(isinstance(v, (int, float)) for v in col_vals):
                        totals.append(round(sum(col_vals), 2))
                    else:
                        totals.append('')
        else:
            # Simple aggregation without pivot column
            grouped = df.group_by(row_cols).agg(agg_expr.alias(f'{agg_func}({value_col})'))
            grouped = grouped.sort(row_cols[0]).head(200)
            
            headers = list(grouped.columns)
            rows = []
            for row in grouped.to_dicts():
                r = []
                for h in headers:
                    val = row.get(h)
                    if isinstance(val, float):
                        r.append(round(val, 2))
                    else:
                        r.append(val)
                rows.append(r)
            
            # Totals
            totals = []
            for i, h in enumerate(headers):
                if h in row_cols:
                    totals.append('Total' if h == row_cols[0] else '')
                else:
                    col_vals = [row[i] for row in rows if row[i] is not None and isinstance(row[i], (int, float))]
                    totals.append(round(sum(col_vals), 2) if col_vals else '')
        
        return jsonify({
            'status': 'success',
            'headers': [str(h) for h in headers],
            'rows': rows,
            'totals': totals,
            'row_count': len(rows)
        })
    
    except Exception as e:
        print(f"Error generating pivot data: {e}")
        return jsonify({'status': 'error', 'message': f'Erreur: {str(e)}'}), 500


if __name__ == '__main__':
    app.run(debug=True)
