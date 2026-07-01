FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web-admin/package.json apps/web-admin/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --filter @xlt/web-admin --filter @xlt/shared --frozen-lockfile=false

FROM deps AS builder
COPY packages/shared packages/shared
COPY apps/web-admin apps/web-admin
RUN pnpm --filter @xlt/web-admin build

FROM node:22-alpine AS runner
WORKDIR /app/apps/web-admin
ENV NODE_ENV=production
ENV PORT=3001
COPY --from=builder /app/apps/web-admin/.next/standalone ./
COPY --from=builder /app/apps/web-admin/.next/static ./.next/static
COPY --from=builder /app/apps/web-admin/public ./public
CMD ["node", "server.js"]
