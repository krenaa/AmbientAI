#!/bin/sh
set -e

echo "Checking database connection..."
python -c "
import socket, time, os, sys
host = os.environ.get('POSTGRES_HOST', 'postgres')
port = int(os.environ.get('POSTGRES_PORT', 5432))
attempts = 0
while attempts < 30:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(2)
    try:
        s.connect((host, port))
        s.close()
        print('Database connection established.')
        sys.exit(0)
    except Exception:
        attempts += 1
        time.sleep(1)
print('Error: Could not connect to database after 30 seconds.')
sys.exit(1)
"

# Only run migrations and collectstatic on the web server instance, not background workers
if [ "$RUN_MIGRATIONS" = "true" ]; then
    echo "Running database migrations..."
    python manage.py migrate --noinput

    echo "Collecting static files..."
    python manage.py collectstatic --noinput
fi

exec "$@"
