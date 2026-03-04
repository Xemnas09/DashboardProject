#!/bin/bash
set -e

echo "╔══════════════════════════════════════╗"
echo "║     Datavera — Starting up...        ║"
echo "╚══════════════════════════════════════╝"


echo ""
echo "→ Starting FastAPI server..."
exec uvicorn dashboard_app.main:app \
    --host 0.0.0.0 \
    --port 7860 \
    --workers 1
