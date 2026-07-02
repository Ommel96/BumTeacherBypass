#!/bin/sh
set -e

# Fix data directory permissions (volume may be mounted as root)
if [ ! -w /app/data ]; then
  echo "Fixing /app/data permissions..."
  chown -R 1001:1001 /app/data
fi

# Drop to nextjs user (uid 1001) and exec the main process
exec su-exec nextjs:nodejs "$@"