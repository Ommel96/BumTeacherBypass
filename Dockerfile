# ── Stage 1: Dependencies ──
FROM node:20-alpine AS deps
WORKDIR /app

RUN apk add --no-cache python3 make g++

# Quiet, reproducible install — no update banners or audit noise in build logs
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# ── Stage 2: Build ──
FROM node:20-alpine AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ── Stage 3: Runtime ──
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache su-exec

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Data directory for SQLite and uploads
RUN mkdir -p /app/data/uploads && chown -R nextjs:nodejs /app/data

COPY --chown=nextjs:nodejs docker-entrypoint.sh /app/docker-entrypoint.sh
# Strip CRLF in case the file was checked out on Windows (autocrlf) — a \r in
# the shebang makes Alpine report the script as missing at container start.
RUN sed -i 's/\r$//' /app/docker-entrypoint.sh && chmod +x /app/docker-entrypoint.sh

EXPOSE 3847

ENV PORT=3847
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3847/ || exit 1

# Start as root so the entrypoint can fix volume permissions, then drop to nextjs
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "server.js"]