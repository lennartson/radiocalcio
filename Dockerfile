# Production image: production dependencies only, runs as a non-root user.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# better-sqlite3 is a native module, so it needs a build toolchain here.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && npm ci --omit=dev \
 && apt-get purge -y python3 make g++ && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

FROM node:22-bookworm-slim AS prod
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/app/data/app.db
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json server.js db.js ./
COPY public ./public
# The SQLite file lives in a volume so user data survives container rebuilds.
RUN mkdir -p /app/data && chown -R node:node /app/data
VOLUME ["/app/data"]
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
