#!/bin/sh
set -e

echo "Initializing tables..."
python scripts/create_tables.py

echo "Starting application..."
exec "$@"
