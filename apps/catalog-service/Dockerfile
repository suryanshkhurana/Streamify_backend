# ── Stage 1: Install dependencies ────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache openssl
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-middleware/package.json ./packages/shared-middleware/
COPY packages/shared-utils/package.json ./packages/shared-utils/
COPY apps/catalog-service/package.json ./apps/catalog-service/

RUN pnpm install --frozen-lockfile --filter @streamify/catalog-service...

# ── Stage 2: Build ────────────────────────────────────────────────────────────
FROM deps AS builder
COPY packages ./packages
COPY apps/catalog-service ./apps/catalog-service

# Generate Prisma Client before building
COPY tsconfig.json ./
RUN pnpm --filter @streamify/catalog-service exec prisma generate
COPY tsconfig.json ./
RUN pnpm --filter @streamify/catalog-service... run build

# ── Stage 3: Production runner ────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/catalog-service/dist ./apps/catalog-service/dist
COPY --from=builder /app/apps/catalog-service/node_modules ./apps/catalog-service/node_modules
COPY --from=builder /app/apps/catalog-service/package.json ./apps/catalog-service/package.json
# Prisma schema needed at runtime for migrations
COPY --from=builder /app/apps/catalog-service/prisma ./apps/catalog-service/prisma

ENV NODE_ENV=production
EXPOSE 3003

CMD ["node", "apps/catalog-service/dist/index.js"]
