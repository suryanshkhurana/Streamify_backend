FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-middleware/package.json ./packages/shared-middleware/
COPY packages/shared-utils/package.json ./packages/shared-utils/
COPY apps/analytics-service/package.json ./apps/analytics-service/
RUN pnpm install --frozen-lockfile --filter @streamify/analytics-service...
FROM deps AS builder
COPY packages ./packages
COPY apps/analytics-service ./apps/analytics-service
COPY tsconfig.json ./
RUN pnpm --filter @streamify/analytics-service... run build
FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/analytics-service/dist ./apps/analytics-service/dist
COPY --from=builder /app/apps/analytics-service/node_modules ./apps/analytics-service/node_modules
COPY --from=builder /app/apps/analytics-service/package.json ./apps/analytics-service/package.json
ENV NODE_ENV=production
CMD ["node", "apps/analytics-service/dist/index.js"]
