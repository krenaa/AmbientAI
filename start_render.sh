#!/usr/bin/env bash
set -e

echo "=== Starting AmbientDesk Unified FastAPI Backend on Render ==="

# Navigate to backend directory and start Uvicorn
cd backend
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"

