@echo off
echo =======================================================
echo Lancement de DataVision Analytics (FastAPI + React)
echo =======================================================

echo [1/2] Demarrage du Backend FastAPI (Port 8000)...
start "Backend API FastAPI" cmd /k "cd dashboard_app && python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000"

echo [2/2] Demarrage du Frontend React (Port 5173)...
start "Frontend React" cmd /k "cd frontend && npm run dev -- --open"

echo.
echo Les serveurs sont en cours de lancement dans des nouvelles fenetres.
echo.
echo   Backend API :  http://127.0.0.1:8000
echo   API Docs    :  http://127.0.0.1:8000/docs
echo   Frontend    :  http://localhost:5173
echo.
pause
