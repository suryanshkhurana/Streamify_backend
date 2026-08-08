ARG SERVICE_NAME=api-gateway
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-middleware/package.json ./packages/shared-middleware/
COPY packages/shared-utils/package.json ./packages/shared-utils/
COPY apps/api-gateway/package.json ./apps/api-gateway/
RUN pnpm install --filter @streamify/api-gateway...

FROM deps AS builder
COPY packages ./packages
COPY apps/api-gateway ./apps/api-gateway
COPY tsconfig.json ./
RUN pnpm --filter @streamify/api-gateway... run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api-gateway/dist ./apps/api-gateway/dist
COPY --from=builder /app/apps/api-gateway/node_modules ./apps/api-gateway/node_modules
COPY --from=builder /app/apps/api-gateway/package.json ./apps/api-gateway/package.json
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "apps/api-gateway/dist/index.js"]
