from flask import Flask, render_template, request, redirect, url_for, session, flash
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
    session.pop('data_preview', None) # Clear data on logout
    return redirect(url_for('login'))

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'user' not in session:
        return redirect(url_for('login'))
        
    if 'file' not in request.files:
        flash('Aucun fichier sélectionné', 'error')
        return redirect(url_for('dashboard'))
        
    file = request.files['file']
    if file.filename == '':
        flash('Aucun fichier sélectionné', 'error')
        return redirect(url_for('dashboard'))

    try:
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)

        if filename.endswith('.csv'):
            df = pl.read_csv(filepath)
        elif filename.endswith(('.xls', '.xlsx')):
            df = pl.read_excel(filepath)
        else:
            flash('Format de fichier non supporté. Utilisez CSV ou Excel.', 'error')
            return redirect(url_for('dashboard'))
            
        # LIMITATION: We limit to 2000 rows for the AJAX response to keep it snappy.
        # Convert data for JSON response
        # We explicitly cast to string to ensure all types (Dates, Decimals) are JSON serializable
        # and displayed as they appear in the file.
        # polars.DataFrame.to_dicts() is used for structure.
        limit = 1000
        # Cast all to utf8 (string) for safe display in JSON
        safe_df = df.head(limit).select(pl.all().cast(pl.Utf8))
        
        preview_data = {
            'columns': [{'title': col, 'field': col} for col in df.columns],
            'data': safe_df.to_dicts(), 
            'total_rows': df.height
        }
        
        return {'status': 'success', 'message': f'Fichier importé avec succès! {df.height} lignes chargées.', 'payload': preview_data}
        
    except Exception as e:
        print(f"Error processing file: {e}")
        return {'status': 'error', 'message': f'Erreur lors de la lecture du fichier: {str(e)}'}, 500

if __name__ == '__main__':
    app.run(debug=True)
