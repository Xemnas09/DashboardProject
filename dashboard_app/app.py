from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify
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

@app.route('/')
def index():
    if 'user' in session:
        return redirect(url_for('dashboard'))
    return redirect(url_for('login'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        
        if username in USERS and USERS[username] == password:
            session['user'] = username
            session['notifications'] = [] # Reset notifications on new login
            
            # Create a unique cache ID for this user session if not exists
            if 'cache_id' not in session:
                session['cache_id'] = str(uuid.uuid4())
                
            add_notification("Connexion réussie", "success")
            return redirect(url_for('dashboard'))
        else:
            flash('Identifiants incorrects', 'error')
            
    return render_template('login.html')

@app.route('/dashboard')
def dashboard():
    if 'user' not in session:
        return redirect(url_for('login'))
    
    # Check cache instead of session
    cache_id = session.get('cache_id')
    data_preview = None
    
    if cache_id and cache_id in DATA_CACHE:
        data_preview = DATA_CACHE[cache_id].get('preview')
    
    return render_template('dashboard.html', data_preview=data_preview)

@app.route('/logout')
def logout():
    # Clear server cache
    cache_id = session.get('cache_id')
    if cache_id and cache_id in DATA_CACHE:
        del DATA_CACHE[cache_id]
        
    session.pop('user', None)
    session.pop('cache_id', None)
    return redirect(url_for('login'))

@app.route('/clear_data', methods=['POST'])
def clear_data():
    if 'user' not in session:
        return redirect(url_for('login'))
        
    cache_id = session.get('cache_id')
    if cache_id and cache_id in DATA_CACHE:
        del DATA_CACHE[cache_id]
        
    add_notification("Données supprimées", "warning")
    flash("Données supprimées avec succès.", "success")
    return redirect(url_for('database_view'))

def process_file_preview(filepath):
    try:
        if filepath.endswith('.csv'):
            df = pl.read_csv(filepath, ignore_errors=True)
        elif filepath.endswith(('.xls', '.xlsx')):
            df = pl.read_excel(filepath)
        else:
            raise ValueError("Format non supporté")
            
        limit = 2000 
        safe_df = df.head(limit).select(pl.all().cast(pl.String))
        
        return {
            'columns': [{'title': col, 'field': col} for col in df.columns],
            'data': safe_df.to_dicts(), 
            'total_rows': df.height
        }
    except Exception as e:
        logger.error(f"Error processing preview: {e}", exc_info=True)
        return None

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'user' not in session:
        return redirect(url_for('login'))
        
    if 'file' not in request.files:
        return jsonify({'status': 'error', 'message': 'Aucun fichier'}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({'status': 'error', 'message': 'Aucun fichier'}), 400

    try:
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)

        # Initialize user cache
        cache_id = session.get('cache_id')
        if not cache_id:
             cache_id = str(uuid.uuid4())
             session['cache_id'] = cache_id
        
        # Process and Cache
        preview_data = process_file_preview(filepath)
        
        DATA_CACHE[cache_id] = {
            'filepath': filepath,
            'preview': preview_data
        }
        
        new_notif = add_notification(f"Fichier {file.filename} importé", "info")
        
        return jsonify({
            'status': 'success', 
            'message': 'Fichier reçu et traité avec succès !',
            'notification': new_notif
        })
        
    except Exception as e:
        logger.error(f"Error processing file: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': f'Erreur: {str(e)}'}), 500

@app.route('/database')
def database_view():
    if 'user' not in session:
        return redirect(url_for('login'))
        
    data_preview = None
    cache_id = session.get('cache_id')
    
    if cache_id and cache_id in DATA_CACHE:
         data_preview = DATA_CACHE[cache_id].get('preview')
            
    return render_template('database.html', data_preview=data_preview)


@app.route('/reports')
def reports():
    if 'user' not in session:
        return redirect(url_for('login'))
    
    cache_id = session.get('cache_id')
    columns_info = None
    
    if cache_id and cache_id in DATA_CACHE:
        filepath = DATA_CACHE[cache_id].get('filepath')
        if filepath and os.path.exists(filepath):
            try:
                if filepath.endswith('.csv'):
                    df = pl.read_csv(filepath, ignore_errors=True)
                elif filepath.endswith(('.xls', '.xlsx')):
                    df = pl.read_excel(filepath)
                else:
                    df = None
                
                if df is not None:
                    columns_info = []
                    for col in df.columns:
                        dtype = str(df[col].dtype)
                        is_numeric = df[col].dtype.is_numeric()
                        columns_info.append({
                            'name': col,
                            'dtype': dtype,
                            'is_numeric': is_numeric
                        })
            except Exception as e:
                print(f"Error reading file for reports: {e}")
    
    return render_template('reports.html', columns_info=columns_info)


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
        if filepath.endswith('.csv'):
            df = pl.read_csv(filepath, ignore_errors=True)
        elif filepath.endswith(('.xls', '.xlsx')):
            df = pl.read_excel(filepath)
        else:
            return jsonify({'status': 'error', 'message': 'Format non supporté'}), 400
        
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
        if filepath.endswith('.csv'):
            df = pl.read_csv(filepath, ignore_errors=True)
        elif filepath.endswith(('.xls', '.xlsx')):
            df = pl.read_excel(filepath)
        else:
            return jsonify({'status': 'error', 'message': 'Format non supporté'}), 400
        
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
        
        if col_col:
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
