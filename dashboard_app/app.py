from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify
import os
import polars as pl
from werkzeug.utils import secure_filename
import uuid
from datetime import datetime

app = Flask(__name__)
app.secret_key = 'super_secret_key_change_this_later'

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
        safe_df = df.head(limit).select(pl.all().cast(pl.Utf8))
        
        return {
            'columns': [{'title': col, 'field': col} for col in df.columns],
            'data': safe_df.to_dicts(), 
            'total_rows': df.height
        }
    except Exception as e:
        print(f"Error processing preview: {e}")
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
        print(f"Error processing file: {e}")
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

if __name__ == '__main__':
    app.run(debug=True)
