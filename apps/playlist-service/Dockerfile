# ─── Stage 1: Install all deps ───────────────────────────────────────────────
FROM node:20-alpine AS deps

RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

# Copy manifests first for layer-cache efficiency
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared-types/package.json      ./packages/shared-types/
COPY packages/shared-middleware/package.json ./packages/shared-middleware/
COPY packages/shared-utils/package.json      ./packages/shared-utils/
COPY apps/playlist-service/package.json      ./apps/playlist-service/

RUN pnpm install --frozen-lockfile --filter @streamify/playlist-service...

# ─── Stage 2: Build TypeScript ────────────────────────────────────────────────
FROM deps AS builder

COPY packages              ./packages
COPY apps/playlist-service ./apps/playlist-service

COPY tsconfig.json ./
RUN pnpm --filter @streamify/playlist-service... run build

# ─── Stage 3: Production image ────────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN addgroup -S streamify && adduser -S streamify -G streamify
WORKDIR /app

# Copy only what's needed to run
COPY --from=builder /app/node_modules                          ./node_modules
COPY --from=builder /app/packages                              ./packages
COPY --from=builder /app/apps/playlist-service/dist            ./apps/playlist-service/dist
COPY --from=builder /app/apps/playlist-service/node_modules ./apps/playlist-service/node_modules
COPY --from=builder /app/apps/playlist-service/package.json    ./apps/playlist-service/package.json

USER streamify
ENV NODE_ENV=production
EXPOSE 3006

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3006/health || exit 1

CMD ["node", "apps/playlist-service/dist/index.js"]
