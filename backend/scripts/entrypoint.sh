#!/bin/sh
set -e

# Wait for database is handled by docker-compose depends_on condition

echo "Initializing tables..."
python scripts/create_tables.py

echo "Starting application..."
exec "$@"
