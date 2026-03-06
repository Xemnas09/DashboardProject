#!/bin/bash
set -e

echo "╔══════════════════════════════════════╗"
echo "║     Datavera — Starting up...        ║"
echo "╚══════════════════════════════════════╝"

echo ""
echo "→ Initializing database..."
python init_db.py


echo ""
echo "→ Starting FastAPI server..."
exec uvicorn main:app \
    --host 0.0.0.0 \
    --port 7860 \
    --workers 1
