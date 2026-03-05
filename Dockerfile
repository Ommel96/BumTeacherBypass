# ── Stage 1: Build (native deps for better-sqlite3) ──
FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# ── Stage 2: Runtime ──
FROM node:20-alpine
WORKDIR /app

# Non-root user
RUN addgroup -S btb && adduser -S btb -G btb

# Copy runtime files
COPY --from=builder /app/node_modules ./node_modules
COPY package.json server.js ./
COPY public ./public

# Data directory (mount as volume for persistence)
RUN mkdir -p /app/data && chown -R btb:btb /app/data

# Entrypoint ensures volume permissions are correct
COPY --chown=btb:btb docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

USER btb

EXPOSE 3847

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3847/ || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "server.js"]
