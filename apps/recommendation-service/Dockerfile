FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-middleware/package.json ./packages/shared-middleware/
COPY packages/shared-utils/package.json ./packages/shared-utils/
COPY apps/recommendation-service/package.json ./apps/recommendation-service/
RUN pnpm install --frozen-lockfile --filter @streamify/recommendation-service...
FROM deps AS builder
COPY packages ./packages
COPY apps/recommendation-service ./apps/recommendation-service
COPY tsconfig.json ./
RUN pnpm --filter @streamify/recommendation-service... run build
FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/recommendation-service/dist ./apps/recommendation-service/dist
COPY --from=builder /app/apps/recommendation-service/node_modules ./apps/recommendation-service/node_modules
COPY --from=builder /app/apps/recommendation-service/package.json ./apps/recommendation-service/package.json
ENV NODE_ENV=production
EXPOSE 3007
CMD ["node", "apps/recommendation-service/dist/index.js"]
