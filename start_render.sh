#!/usr/bin/env bash
set -e

echo "=== Starting AmbientDesk Unified Backend on Render ==="

# Set fallback internal AI Agent URL to loopback port 8001 if not explicitly provided
export AI_AGENT_SERVICE_URL="${AI_AGENT_SERVICE_URL:-http://127.0.0.1:8001}"

# 1. Run database migrations and static collection on NeonDB
echo "[1/4] Running database migrations on NeonDB..."
python services/backend/manage.py migrate --noinput

echo "[2/4] Collecting static files..."
python services/backend/manage.py collectstatic --noinput

# 2. Start FastAPI AI Agent on local loopback 127.0.0.1:8001 in the background
echo "[3/4] Launching FastAPI AI Agent engine on 127.0.0.1:8001..."
(cd services/ai-agent && uvicorn app.main:app --host 127.0.0.1 --port 8001) &

# 3. Start Celery worker concurrently in the background
echo "[4/4] Launching Celery async background worker..."
(cd services/backend && celery -A core worker -l info --concurrency=1) &

# 4. Start Daphne ASGI Server in foreground on Render's assigned $PORT
echo "=== Daphne ASGI Server listening on port ${PORT:-8000} ==="
cd services/backend
exec daphne -b 0.0.0.0 -p "${PORT:-8000}" core.asgi:application
