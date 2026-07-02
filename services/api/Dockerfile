FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY services/api/package.json services/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --filter @xlt/api --filter @xlt/shared --frozen-lockfile=false

FROM deps AS builder
COPY packages/shared packages/shared
COPY services/api services/api
RUN pnpm --filter @xlt/api prisma:generate
RUN pnpm --filter @xlt/api build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/services/api/node_modules ./services/api/node_modules
COPY --from=builder /app/services/api/dist ./services/api/dist
COPY --from=builder /app/services/api/prisma ./services/api/prisma
COPY --from=builder /app/services/api/package.json ./services/api/package.json
WORKDIR /app/services/api
CMD ["node", "dist/main.js"]
