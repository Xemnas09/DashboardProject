@echo off
echo =======================================================
echo Lancement de Datavera (FastAPI + React)
echo =======================================================

echo [1/2] Demarrage du Backend FastAPI (Port 8000)...
start "Datavera Backend" cmd /k "cd /d %~dp0dashboard_app && python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000 --reload-exclude uploads/* --reload-exclude *.db"

echo Attente du backend...
:WAIT_LOOP
timeout /t 2 /nobreak >nul
curl -s http://127.0.0.1:8000/docs >nul 2>&1
if %errorlevel% neq 0 (
    echo   Backend pas encore pret, nouvelle tentative...
    goto WAIT_LOOP
)

echo [2/2] Backend pret. Demarrage du Frontend React (Port 5173)...
start "Datavera Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

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

echo Arret des serveurs en cours...
taskkill /F /T /FI "WINDOWTITLE eq Datavera Backend*" >nul 2>&1
taskkill /F /T /FI "WINDOWTITLE eq Datavera Frontend*" >nul 2>&1
taskkill /F /T /FI "WINDOWTITLE eq Datavera*" >nul 2>&1

echo Serveurs arretes. Au revoir !
timeout /t 2 >nul
exit