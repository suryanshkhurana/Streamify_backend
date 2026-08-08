FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-middleware/package.json ./packages/shared-middleware/
COPY packages/shared-utils/package.json ./packages/shared-utils/
COPY apps/notification-service/package.json ./apps/notification-service/
RUN pnpm install --frozen-lockfile --filter @streamify/notification-service...
FROM deps AS builder
COPY packages ./packages
COPY apps/notification-service ./apps/notification-service
COPY tsconfig.json ./
RUN pnpm --filter @streamify/notification-service... run build
FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/notification-service/dist ./apps/notification-service/dist
COPY --from=builder /app/apps/notification-service/node_modules ./apps/notification-service/node_modules
COPY --from=builder /app/apps/notification-service/package.json ./apps/notification-service/package.json
ENV NODE_ENV=production
CMD ["node", "apps/notification-service/dist/index.js"]
