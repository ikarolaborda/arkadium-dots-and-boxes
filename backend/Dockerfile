# syntax=docker/dockerfile:1.7
# Multi-stage Node.js build following Docker official best practices:
#   - alpine base for minimal attack surface
#   - dedicated deps stage with cache-mounted npm install
#   - prisma generate runs in build stage so the runtime image carries
#     the generated client without dev tooling
#   - non-root nodejs:1001 user in the runtime stage

ARG NODE_VERSION=20.18-alpine

FROM node:${NODE_VERSION} AS base
WORKDIR /app
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

FROM base AS deps
COPY package.json package-lock.json* ./
COPY backend/package.json backend/package.json
COPY shared/package.json shared/package.json
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm install --workspaces --include-workspace-root --no-audit --no-fund

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY tsconfig.base.json ./tsconfig.base.json
COPY shared ./shared
COPY backend ./backend
WORKDIR /app/backend
RUN npx prisma generate --schema=prisma/schema.prisma
RUN npx nest build

FROM base AS prod-deps
COPY package.json package-lock.json* ./
COPY backend/package.json backend/package.json
COPY shared/package.json shared/package.json
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm install --workspaces --include-workspace-root --omit=dev --no-audit --no-fund

FROM node:${NODE_VERSION} AS runtime
WORKDIR /app
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs && \
    apk add --no-cache wget
ENV NODE_ENV=production
COPY --from=prod-deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nodejs:nodejs /app/backend/dist ./backend/dist
COPY --from=build --chown=nodejs:nodejs /app/backend/prisma ./backend/prisma
COPY --from=build --chown=nodejs:nodejs /app/backend/package.json ./backend/package.json
COPY --from=build --chown=nodejs:nodejs /app/shared ./shared
COPY --from=build --chown=nodejs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
USER nodejs
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1:3001/api/health || exit 1
WORKDIR /app/backend
CMD ["node", "dist/main/main.js"]
