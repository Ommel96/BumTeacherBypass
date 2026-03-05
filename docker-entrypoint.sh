#!/bin/sh
set -e

# Ensure data directory is writable (volume may be mounted as root)
if [ ! -w /app/data ]; then
  echo "Warning: /app/data not writable, attempting to fix..."
fi

exec "$@"
