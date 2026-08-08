ARG SERVICE_NAME=user-service

# ─── Stage 1: Install dependencies ───────────────────────────────────────────
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared-types/package.json      ./packages/shared-types/
COPY packages/shared-middleware/package.json ./packages/shared-middleware/
COPY packages/shared-utils/package.json      ./packages/shared-utils/
COPY apps/user-service/package.json          ./apps/user-service/
RUN pnpm install --frozen-lockfile --filter @streamify/user-service...

# ─── Stage 2: Build TypeScript ────────────────────────────────────────────────
FROM deps AS builder
COPY packages ./packages
COPY apps/user-service ./apps/user-service
COPY tsconfig.json ./
RUN pnpm --filter @streamify/user-service... run build

# ─── Stage 3: Production runner ───────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

COPY --from=builder /app/node_modules                    ./node_modules
COPY --from=builder /app/packages                        ./packages
COPY --from=builder /app/apps/user-service/dist          ./apps/user-service/dist
COPY --from=builder /app/apps/user-service/node_modules ./apps/user-service/node_modules
COPY --from=builder /app/apps/user-service/package.json  ./apps/user-service/package.json

ENV NODE_ENV=production
EXPOSE 3002

CMD ["node", "apps/user-service/dist/index.js"]
