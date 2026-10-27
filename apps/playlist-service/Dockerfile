ARG SERVICE_NAME=playlist-service

# ─── Stage 1: Install dependencies ───────────────────────────────────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache openssl
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared-types/package.json      ./packages/shared-types/
COPY packages/shared-middleware/package.json ./packages/shared-middleware/
COPY packages/shared-utils/package.json      ./packages/shared-utils/
COPY apps/playlist-service/package.json      ./apps/playlist-service/
COPY apps/playlist-service/prisma/schema.prisma ./apps/playlist-service/prisma/
RUN pnpm install --frozen-lockfile --filter @streamify/playlist-service...

# ─── Stage 2: Build TypeScript ────────────────────────────────────────────────
FROM deps AS builder
COPY packages              ./packages
COPY apps/playlist-service ./apps/playlist-service

COPY tsconfig.json ./
RUN cd apps/playlist-service && npx prisma generate
RUN pnpm --filter @streamify/playlist-service... run build

# ─── Stage 3: Production image ────────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
RUN addgroup -S streamify && adduser -S streamify -G streamify
WORKDIR /app

COPY --from=builder /app/node_modules                          ./node_modules
COPY --from=builder /app/packages                              ./packages
COPY --from=builder /app/apps/playlist-service/dist            ./apps/playlist-service/dist
COPY --from=builder /app/apps/playlist-service/node_modules ./apps/playlist-service/node_modules
COPY --from=builder /app/apps/playlist-service/package.json    ./apps/playlist-service/package.json

ENV NODE_ENV=production
EXPOSE 3006

CMD ["node", "apps/playlist-service/dist/index.js"]
