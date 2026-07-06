#!/bin/sh
set -e

# Always fix data directory permissions — Docker volumes mount as root
chown -R 1001:1001 /app/data 2>/dev/null || true

# Drop to nextjs user (uid 1001) and exec the main process
exec su-exec nextjs:nodejs "$@"