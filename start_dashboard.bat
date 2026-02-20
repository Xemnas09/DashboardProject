@echo off
echo =======================================================
echo Lancement du Dashboard Bancaire (Version React)
echo =======================================================

echo [1/2] Demarrage du Backend Flask (Port 5000)...
start "Backend API Flask" cmd /k "cd dashboard_app && python app.py"

echo [2/2] Demarrage du Frontend React (Port 5173)...
start "Frontend React" cmd /k "cd frontend && npm run dev -- --open"

echo.
echo Les serveurs sont en cours de lancement dans des nouvelles fenetres.
echo Veuillez ouvrir http://localhost:5173 dans votre navigateur.
echo.
pause
