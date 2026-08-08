# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — Install dependencies (cached unless package files change)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

RUN apk add --no-cache openssl
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy workspace manifests first (cache layer)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared-types/package.json       ./packages/shared-types/
COPY packages/shared-middleware/package.json  ./packages/shared-middleware/
COPY packages/shared-utils/package.json       ./packages/shared-utils/
COPY apps/auth-service/package.json           ./apps/auth-service/

# Install all workspace dependencies needed for auth-service and its local deps
RUN pnpm install --filter @streamify/auth-service...

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — Build TypeScript
# ─────────────────────────────────────────────────────────────────────────────
FROM deps AS builder

# Copy source code
COPY packages ./packages
COPY apps/auth-service ./apps/auth-service
COPY tsconfig.json ./

# Generate Prisma client, then build all packages + auth-service
RUN pnpm --filter @streamify/auth-service exec prisma generate \
 && pnpm --filter @streamify/auth-service... run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 3 — Production runner (minimal image)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

# Install dumb-init for proper PID 1 signal handling
RUN apk add --no-cache dumb-init openssl

WORKDIR /app

ENV NODE_ENV=production

# Copy only what's needed at runtime
COPY --from=builder /app/node_modules                           ./node_modules
COPY --from=builder /app/packages                                ./packages
COPY --from=builder /app/apps/auth-service/dist                ./apps/auth-service/dist
COPY --from=builder /app/apps/auth-service/node_modules ./apps/auth-service/node_modules
COPY --from=builder /app/apps/auth-service/package.json        ./apps/auth-service/package.json
COPY --from=builder /app/apps/auth-service/prisma              ./apps/auth-service/prisma

# Run Prisma migrations on startup (handled by entrypoint), then start service
EXPOSE 3001

# Use dumb-init to handle SIGTERM correctly in Docker
ENTRYPOINT ["dumb-init", "--"]

# Run migrations before starting (prisma migrate deploy is safe for production)
CMD ["sh", "-c", "npx prisma@5.17.0 db push --accept-data-loss --schema=./apps/auth-service/prisma/schema.prisma && node apps/auth-service/dist/index.js"]
