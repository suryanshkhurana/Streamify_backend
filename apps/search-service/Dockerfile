# ── Stage 1: Install dependencies ────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-middleware/package.json ./packages/shared-middleware/
COPY packages/shared-utils/package.json ./packages/shared-utils/
COPY apps/search-service/package.json ./apps/search-service/

RUN pnpm install --frozen-lockfile --filter @streamify/search-service...

# ── Stage 2: Build ────────────────────────────────────────────────────────────
FROM deps AS builder
COPY packages ./packages
COPY apps/search-service ./apps/search-service

COPY tsconfig.json ./
RUN pnpm --filter @streamify/search-service... run build

# ── Stage 3: Production runner ────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/search-service/dist ./apps/search-service/dist
COPY --from=builder /app/apps/search-service/node_modules ./apps/search-service/node_modules
COPY --from=builder /app/apps/search-service/package.json ./apps/search-service/package.json

ENV NODE_ENV=production
EXPOSE 3005

CMD ["node", "apps/search-service/dist/index.js"]
