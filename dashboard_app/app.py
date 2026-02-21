from flask import Flask, request, session, jsonify
from flask_cors import CORS
import os
import polars as pl
from werkzeug.utils import secure_filename
import uuid
from datetime import datetime
import logging
import secrets
import math

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
    if 'notifications_history' not in session:
        session['notifications_history'] = []
    
    timestamp = datetime.now().strftime('%H:%M:%S')
    new_notif = {
        'message': message,
        'category': category,
        'time': timestamp
    }
    
    # Toast notifications (last 5)
    session['notifications'].insert(0, new_notif)
    if len(session['notifications']) > 5:
        session['notifications'] = session['notifications'][:5]
    
    # Full History (last 50)
    session['notifications_history'].insert(0, new_notif)
    if len(session['notifications_history']) > 50:
        session['notifications_history'] = session['notifications_history'][:50]
    
    session['has_unread'] = True
    session.modified = True
    return new_notif

def apply_filters(df, filters):
    """
    Applies a dictionary of filters to a Polars DataFrame.
    filters: { 'col_name': value or [values] }
    """
    if not filters:
        return df
    
    for col, value in filters.items():
        if col not in df.columns:
            continue
            
        # Attempt type discovery/casting for the filter value
        dtype = df[col].dtype
        try:
            if isinstance(value, list):
                if dtype.is_numeric():
                    value = [float(v) for v in value]
                df = df.filter(pl.col(col).is_in(value))
            elif value is not None:
                if dtype.is_numeric():
                    target_val = float(value)
                    df = df.filter(pl.col(col) == target_val)
                elif dtype == pl.Boolean:
                    target_val = str(value).lower() == 'true'
                    df = df.filter(pl.col(col) == target_val)
                else:
                    df = df.filter(pl.col(col) == value)
        except:
            # If casting fails, skip filtering for this column rather than crashing
            continue
            
    return df

# --- Routes ---

@app.route('/api/notifications/read', methods=['POST'])
def mark_notifications_read():
    session['has_unread'] = False
    return jsonify({'status': 'success'})

@app.route('/api/notifications/history', methods=['GET'])
def get_notifications_history():
    if 'user' not in session:
        return jsonify({'status': 'error', 'message': 'Non autorisé'}), 401
    return jsonify({
        'status': 'success', 
        'history': session.get('notifications_history', [])
    })

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

def process_file_preview(filepath, sheet_name=None, schema_overrides=None, row_limit=2000):
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

        total_rows = df.height

        # Extract column info for the UI
        columns_info = []
        for col in df.columns:
            columns_info.append({
                'name': col,
                'dtype': str(df[col].dtype),
                'is_numeric': df[col].dtype.is_numeric()
            })

        # Apply limit if row_limit is not None
        if row_limit:
            df_preview = df.head(row_limit)
        else:
            df_preview = df
        
        safe_df = df_preview.select(pl.all().cast(pl.String))
        
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
        
    full_data = True # Always use full data now
    cache_id = session.get('cache_id')
    
    data = request.args # For GET, we might use query params, but better to support JSON too if needed
    filters = session.get('active_filters', {}) # Default to session filters if any
    
    if not cache_id or cache_id not in DATA_CACHE:
        return jsonify({'status': 'success', 'data_preview': None})
    
    # Always return full data for database view now
    if True:
        filepath = DATA_CACHE[cache_id].get('filepath')
        selected_sheet = DATA_CACHE[cache_id].get('selected_sheet')
        overrides = DATA_CACHE[cache_id].get('schema_overrides')
        
        # We don't overwrite the standard 'preview' cache to keep it fast for normal navigation
        full_df = read_cached_df(cache_id)
        if full_df is None: return jsonify({'status': 'error', 'message': 'Erreur de lecture'}), 500
        
        # Apply filters if provided in header or session (for cross-filtering consistency)
        # Note: Database explorer usually shows raw data, but for consistency we can apply global filters
        # full_df = apply_filters(full_df, filters) 
        
        # For database view, let's keep it raw but allow previewing the filtered set if requested
        header_filters = request.headers.get('X-Apply-Filters') == 'true'
        if header_filters:
            full_df = apply_filters(full_df, filters)

        data_preview = {
            'columns': [{'field': c, 'title': c} for c in full_df.columns],
            'columns_info': [{'name': c, 'dtype': str(full_df[c].dtype), 'is_numeric': full_df[c].dtype.is_numeric()} for c in full_df.columns],
            'data': full_df.head(2000).to_dicts(), # Limit frontend display rows for perf
            'total_rows': len(full_df)
        }
        return jsonify({'status': 'success', 'data_preview': data_preview})
    
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
    y_col = data.get('y_column')
    chart_type = data.get('chart_type', 'bar')
    filters = data.get('filters', {}) # NEW: accept filters from frontend
    
    if not x_col:
        return jsonify({'status': 'error', 'message': 'Veuillez sélectionner au moins la variable X'}), 400
    
    try:
        df = read_cached_df(cache_id)
        if df is None:
            return jsonify({'status': 'error', 'message': 'Impossible de lire les données'}), 500
        
        # NEW: Apply Filters
        df = apply_filters(df, filters)
        
        if len(df) == 0:
            return jsonify({'status': 'success', 'data': [], 'message': 'Aucune donnée pour ces filtres', 'labels': [], 'values': []})

        if x_col not in df.columns:
            return jsonify({'status': 'error', 'message': f'Colonne "{x_col}" introuvable'}), 400
        if y_col and y_col not in df.columns:
            return jsonify({'status': 'error', 'message': f'Colonne "{y_col}" introuvable'}), 400
        
        x_is_numeric = df[x_col].dtype.is_numeric()
        y_is_numeric = df[y_col].dtype.is_numeric() if y_col else False
        
        # No more arbitrary small limits
        limit = 5000 # Reasonable upper bound for ECharts performance

        # === FREQUENCY MODE (no Y column) ===
        if not y_col:
            df = df.drop_nulls(subset=[x_col])
            freq_df = df.group_by(x_col).agg(pl.count().alias('count'))
            freq_df = freq_df.sort('count', descending=True).head(limit)
            
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
    col_cols = data.get('col_cols', [])
    # Support for multi-value (Excel style)
    value_cols = data.get('value_cols', []) 
    full_data = True # Always True now
    filters = data.get('filters', {}) # NEW: accept filters
    
    # Backwards compatibility and single-value simplicity
    if not value_cols and data.get('value_col'):
        value_cols = [{'col': data.get('value_col'), 'agg': data.get('agg_func', 'sum')}]
    
    if not row_cols or not value_cols:
        return jsonify({'status': 'error', 'message': 'Sélectionnez au moins une ligne et une valeur'}), 400
    
    try:
        df = read_cached_df(cache_id)
        if df is None: return jsonify({'status': 'error', 'message': 'Erreur de lecture'}), 500
            
        # NEW: Apply Filters
        df = apply_filters(df, filters)
        print(f"Pivot DF after filters: {df.shape}")
        
        if len(df) == 0:
            print("Pivot error: Filtered DF is empty")
            return jsonify({'status': 'success', 'headers': [], 'rows': [], 'totals': [], 'row_count': 0, 'message': 'Filtres trop restrictifs'})

        # Prep aggregations
        agg_exprs = []
        for v in value_cols:
            c, a = v['col'], v['agg']
            # Ensure numeric operations only on numeric-castable columns
            curr = pl.col(c)
            # Try to cast to Float64 for safety if we suspect it's dirty but should be numeric
            if a in ['sum', 'mean', 'max', 'min']:
                curr = curr.cast(pl.Float64, strict=False)

            if a == 'sum': e = curr.sum()
            elif a == 'mean': e = curr.mean()
            elif a == 'count': e = pl.col(c).count()
            elif a == 'min': e = curr.min()
            elif a == 'max': e = curr.max()
            else: e = curr.sum()
            # Alias includes agg type if multi-val
            alias = f"{a}({c})" if len(value_cols) > 1 or col_cols else c
            agg_exprs.append(e.alias(alias))

        def sanitize(v):
            if isinstance(v, float):
                if math.isnan(v) or math.isinf(v): return None
                return round(v, 2)
            return v

        if col_cols:
            # Handle multi-column pivot by combining columns if necessary
            if len(col_cols) > 1:
                col_key = "_pivot_col_key_"
                # Create a combined column for the 'on' parameter
                df = df.with_columns(
                    pl.concat_str([pl.col(c).cast(pl.String) for c in col_cols], separator=" | ").alias(col_key)
                )
                pivot_on = col_key
            else:
                pivot_on = col_cols[0]

            card = df[pivot_on].n_unique()
            if card > (200 if full_data else 60):
                return jsonify({'status': 'error', 'message': f'Trop de colonnes ({card})'}), 400
            
            # Pivot logic
            print(f"Pivoting on: {pivot_on}, Grouping: {row_cols}")
            grouped = df.group_by(row_cols + [pivot_on]).agg(agg_exprs)
            pivoted = grouped.pivot(
                on=pivot_on,
                index=row_cols,
                values=[e.meta.output_name() for e in agg_exprs]
            )
            print(f"Pivot success. Columns: {pivoted.columns}")
            
            # Sort by first row col safely
            if row_cols: pivoted = pivoted.sort(row_cols[0])
            
            headers = list(pivoted.columns)
            rows = []
            for d in pivoted.to_dicts():
                rows.append([sanitize(d.get(h)) for h in headers])
                
            totals = []
            for i, h in enumerate(headers):
                if h in row_cols: totals.append('TOTAL' if i==0 else '')
                else:
                    vals = [r[i] for r in rows if isinstance(r[i], (int, float)) and r[i] is not None]
                    totals.append(sanitize(sum(vals)) if vals else '')
        else:
            summary = df.group_by(row_cols).agg(agg_exprs)
            if row_cols: summary = summary.sort(row_cols[0])
            headers = list(summary.columns)
            rows = []
            for d in summary.to_dicts():
                rows.append([sanitize(d.get(h)) for h in headers])
            
            totals = []
            for i, h in enumerate(headers):
                if h in row_cols: totals.append('TOTAL' if i==0 else '')
                else:
                    vals = [r[i] for r in rows if isinstance(r[i], (int, float)) and r[i] is not None]
                    totals.append(sanitize(sum(vals)) if vals else '')

        return jsonify({
            'status': 'success',
            'headers': [str(h) for h in headers],
            'rows': rows,
            'totals': totals,
            'row_count': len(rows)
        })

    except Exception as e:
        print(f"Pivot error: {e}")
        import traceback; traceback.print_exc()
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/calculated-field', methods=['POST'])
def calculated_field():
    """Create a new calculated column from a formula like 'ColA + ColB * 2'."""
    if 'user' not in session:
        return jsonify({'status': 'error', 'message': 'Non autorisé'}), 401
    
    cache_id = session.get('cache_id')
    if not cache_id or cache_id not in DATA_CACHE:
        return jsonify({'status': 'error', 'message': 'Aucune donnée disponible'}), 404
    
    data = request.get_json()
    new_col_name = data.get('name', '').strip()
    formula = data.get('formula', '').strip()
    
    if not new_col_name:
        return jsonify({'status': 'error', 'message': 'Nom du champ requis'}), 400
    if not formula:
        return jsonify({'status': 'error', 'message': 'Formule requise'}), 400
    
    try:
        df = read_cached_df(cache_id)
        if df is None:
            return jsonify({'status': 'error', 'message': 'Erreur de lecture'}), 500
        
        if new_col_name in df.columns:
            return jsonify({'status': 'error', 'message': f'La colonne "{new_col_name}" existe déjà'}), 400
        
        # Parse formula into a Polars expression safely
        expr = parse_formula(formula, df.columns)
        df = df.with_columns(expr.alias(new_col_name))
        
        # Save back to file
        filepath = DATA_CACHE[cache_id].get('filepath')
        if filepath.endswith('.csv'):
            df.write_csv(filepath)
        elif filepath.endswith(('.xls', '.xlsx')):
            df.write_excel(filepath)
        
        # Refresh the preview cache
        DATA_CACHE[cache_id]['preview'] = process_file_preview(
            filepath, 
            sheet_name=DATA_CACHE[cache_id].get('selected_sheet'),
            schema_overrides=DATA_CACHE[cache_id].get('schema_overrides')
        )
        
        new_notif = add_notification(f'Champ calculé "{new_col_name}" créé avec succès', 'success')
        
        return jsonify({
            'status': 'success',
            'message': f'Colonne "{new_col_name}" créée',
            'notification': new_notif,
            'new_column': {
                'name': new_col_name,
                'dtype': str(df[new_col_name].dtype),
                'is_numeric': df[new_col_name].dtype.is_numeric()
            }
        })
        
    except ValueError as ve:
        return jsonify({'status': 'error', 'message': f'Erreur de formule: {str(ve)}'}), 400
    except Exception as e:
        print(f"Calculated field error: {e}")
        import traceback; traceback.print_exc()
        return jsonify({'status': 'error', 'message': f'Erreur: {str(e)}'}), 500


def parse_formula(formula, valid_columns):
    """
    Parses a simple math formula string into a Polars expression.
    Supports: column names, +, -, *, /, parentheses, and numeric literals.
    Example: "Ventes - Coûts" => pl.col("Ventes") - pl.col("Coûts")
    Example: "(Prix * Quantité) / 100" => (pl.col("Prix") * pl.col("Quantité")) / pl.lit(100)
    """
    import re
    
    # Tokenize: extract column names (quoted or unquoted), numbers, operators
    tokens = []
    i = 0
    formula_str = formula.strip()
    
    while i < len(formula_str):
        c = formula_str[i]
        
        # Skip whitespace
        if c == ' ':
            i += 1
            continue
        
        # Operators and parens
        if c in '+-*/()':
            tokens.append(('OP', c))
            i += 1
            continue
        
        # Quoted column name: "Col Name" or 'Col Name'
        if c in '"\'':
            quote = c
            j = i + 1
            while j < len(formula_str) and formula_str[j] != quote:
                j += 1
            col_name = formula_str[i+1:j]
            if col_name not in valid_columns:
                raise ValueError(f'Colonne "{col_name}" introuvable')
            tokens.append(('COL', col_name))
            i = j + 1
            continue
        
        # Number (int or float)
        if c.isdigit() or c == '.':
            j = i
            while j < len(formula_str) and (formula_str[j].isdigit() or formula_str[j] == '.'):
                j += 1
            tokens.append(('NUM', float(formula_str[i:j])))
            i = j
            continue
        
        # Unquoted identifier (column name) — greedy match against known columns
        # Try to match the longest valid column name starting at position i
        matched = None
        for col in sorted(valid_columns, key=len, reverse=True):
            if formula_str[i:i+len(col)] == col:
                # Make sure the next char is not alphanumeric (word boundary)
                end = i + len(col)
                if end >= len(formula_str) or not formula_str[end].isalnum():
                    matched = col
                    break
        
        if matched:
            tokens.append(('COL', matched))
            i += len(matched)
            continue
        
        raise ValueError(f'Caractère inattendu: "{c}" à la position {i}')
    
    if not tokens:
        raise ValueError('Formule vide')
    
    # Convert tokens to a Polars expression using a simple recursive descent parser
    pos = [0]  # Using list for mutability in nested functions
    
    def peek():
        if pos[0] < len(tokens):
            return tokens[pos[0]]
        return None
    
    def consume():
        t = tokens[pos[0]]
        pos[0] += 1
        return t
    
    def parse_expr():
        left = parse_term()
        while peek() and peek()[0] == 'OP' and peek()[1] in '+-':
            op = consume()[1]
            right = parse_term()
            if op == '+':
                left = left + right
            else:
                left = left - right
        return left
    
    def parse_term():
        left = parse_factor()
        while peek() and peek()[0] == 'OP' and peek()[1] in '*/':
            op = consume()[1]
            right = parse_factor()
            if op == '*':
                left = left * right
            else:
                left = left / right
        return left
    
    def parse_factor():
        token = peek()
        if token is None:
            raise ValueError('Expression incomplète')
        
        if token[0] == 'OP' and token[1] == '(':
            consume()  # eat '('
            expr = parse_expr()
            if not peek() or peek()[1] != ')':
                raise ValueError('Parenthèse fermante manquante')
            consume()  # eat ')'
            return expr
        
        if token[0] == 'OP' and token[1] == '-':
            consume()  # unary minus
            return -parse_factor()
        
        if token[0] == 'COL':
            consume()
            return pl.col(token[1]).cast(pl.Float64, strict=False)
        
        if token[0] == 'NUM':
            consume()
            return pl.lit(token[1])
        
        raise ValueError(f'Élément inattendu: {token}')
    
    result = parse_expr()
    
    if pos[0] < len(tokens):
        raise ValueError(f'Formule invalide: éléments restants après la fin')
    
    return result


if __name__ == '__main__':
    app.run(debug=True)
