@echo off
echo =======================================================
echo Lancement de DataVision Analytics (FastAPI + React)
echo =======================================================

echo [1/2] Demarrage du Backend FastAPI (Port 8000)...
start "Backend API FastAPI" cmd /k "cd /d %~dp0dashboard_app && python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000"

echo Attente du backend...
:WAIT_LOOP
timeout /t 2 /nobreak >nul
curl -s http://127.0.0.1:8000/docs >nul 2>&1
if %errorlevel% neq 0 (
    echo   Backend pas encore pret, nouvelle tentative...
    goto WAIT_LOOP
)

echo [2/2] Backend pret. Demarrage du Frontend React (Port 5173)...
start "Frontend React" cmd /k "cd /d %~dp0frontend && npm run dev -- --open"

echo.
echo =======================================================
echo   Les deux serveurs sont operationnels !
echo =======================================================
echo.
echo   Backend API :  http://127.0.0.1:8000
echo   API Docs    :  http://127.0.0.1:8000/docs
echo   Frontend    :  http://localhost:5173
echo.
echo Appuyez sur une touche pour arreter les deux serveurs...
pause >nul

echo Arret des serveurs...
taskkill /FI "WINDOWTITLE eq Backend API FastAPI" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Frontend React" /T /F >nul 2>&1
echo Serveurs arretes. Au revoir !