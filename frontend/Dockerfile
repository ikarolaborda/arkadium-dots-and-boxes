# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=20.18-alpine
ARG NGINX_VERSION=1.27-alpine

FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY frontend/package.json frontend/package.json
COPY shared/package.json shared/package.json
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm install --workspaces --include-workspace-root --no-audit --no-fund

FROM node:${NODE_VERSION} AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY tsconfig.base.json ./tsconfig.base.json
COPY shared ./shared
COPY frontend ./frontend
WORKDIR /app/frontend
RUN npm run build

FROM nginx:${NGINX_VERSION} AS runtime
RUN addgroup -g 1001 -S nodejs && adduser -S app -u 1001 -G nodejs
COPY ops/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=app:nodejs /app/frontend/dist /usr/share/nginx/html
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1/ || exit 1
EXPOSE 80
