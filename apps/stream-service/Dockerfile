# ── Stage 1: Install dependencies ────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared-types/package.json       ./packages/shared-types/
COPY packages/shared-middleware/package.json  ./packages/shared-middleware/
COPY packages/shared-utils/package.json       ./packages/shared-utils/
COPY apps/stream-service/package.json         ./apps/stream-service/

RUN pnpm install --frozen-lockfile --filter @streamify/stream-service...

# ── Stage 2: Build ────────────────────────────────────────────────────────────
FROM deps AS builder
COPY packages ./packages
COPY apps/stream-service ./apps/stream-service
COPY tsconfig.json ./
RUN pnpm --filter @streamify/stream-service... run build

# ── Stage 3: Production runner ────────────────────────────────────────────────
FROM node:20-alpine AS runner
# FFmpeg is required for HLS transcoding
RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY --from=builder /app/node_modules             ./node_modules
COPY --from=builder /app/packages                 ./packages
COPY --from=builder /app/apps/stream-service/dist ./apps/stream-service/dist
COPY --from=builder /app/apps/stream-service/node_modules ./apps/stream-service/node_modules
COPY --from=builder /app/apps/stream-service/package.json ./apps/stream-service/package.json

ENV NODE_ENV=production
EXPOSE 3004

CMD ["node", "apps/stream-service/dist/index.js"]
