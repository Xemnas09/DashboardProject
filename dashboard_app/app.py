from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify
import os
import polars as pl
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.secret_key = 'super_secret_key_change_this_later'

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
            return redirect(url_for('dashboard'))
        else:
            flash('Identifiants incorrects', 'error')
            
    return render_template('login.html')

@app.route('/dashboard')
def dashboard():
    if 'user' not in session:
        return redirect(url_for('login'))
    
    # Check if we have data in session (simplified for demo)
    # In a real app, this would be from DB or persistent storage related to the user
    data_preview = session.get('data_preview', None)
    
    return render_template('dashboard.html', data_preview=data_preview)

@app.route('/logout')
def logout():
    session.pop('user', None)
    session.pop('data_preview', None)
    session.pop('latest_file', None) # Clean up file session
    return redirect(url_for('login'))

@app.route('/clear_data', methods=['POST'])
def clear_data():
    if 'user' not in session:
        return redirect(url_for('login'))
        
    session.pop('latest_file', None)
    session.pop('data_preview', None)
    flash("Données supprimées avec succès.", "success")
    return redirect(url_for('database_view'))

def process_file_preview(filepath):
    if filepath.endswith('.csv'):
        df = pl.read_csv(filepath)
    elif filepath.endswith(('.xls', '.xlsx')):
        df = pl.read_excel(filepath)
    else:
        raise ValueError("Format non supporté")
        
    limit = 2000 # Increased limit for database view
    safe_df = df.head(limit).select(pl.all().cast(pl.Utf8))
    
    return {
        'columns': [{'title': col, 'field': col} for col in df.columns],
        'data': safe_df.to_dicts(), 
        'total_rows': df.height
    }

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

        # Save filepath to session for the Database view
        session['latest_file'] = filepath
        
        # We don't strictly need to return payload anymore if we redirect, 
        # but returning it helps if we want to show immediate stats or debug.
        # For now, we return success.
        
        return jsonify({'status': 'success', 'message': 'Fichier importé avec succès !'})
        
    except Exception as e:
        print(f"Error processing file: {e}")
        return jsonify({'status': 'error', 'message': f'Erreur: {str(e)}'}), 500

@app.route('/database')
def database_view():
    if 'user' not in session:
        return redirect(url_for('login'))
        
    data_preview = None
    if 'latest_file' in session and os.path.exists(session['latest_file']):
        try:
            data_preview = process_file_preview(session['latest_file'])
        except Exception as e:
            flash(f"Erreur lors du chargement des données: {e}", "error")
            
    return render_template('database.html', data_preview=data_preview)

if __name__ == '__main__':
    app.run(debug=True)
