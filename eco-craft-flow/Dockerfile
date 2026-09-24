# EcoWrap frontend (TanStack Start / Vite)
# Targets:
#   docker build --target development ...
#   docker build --target production ...

# ── development (hot reload) ───────────────────────────────────────────────
FROM node:22-alpine AS development

WORKDIR /app

COPY package.json bun.lock* package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; \
    elif [ -f bun.lock ]; then npm install; \
    else npm install; fi

COPY . .

ENV VITE_DEV_HOST=0.0.0.0 \
    API_PROXY_TARGET=http://backend:8000 \
    VITE_API_BASE_URL=/api/v1

EXPOSE 8080

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "8080"]

# ── production build ───────────────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json bun.lock* package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .

ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

# ── production runtime (Passenger-compatible Node entry) ───────────────────
FROM node:22-alpine AS production

WORKDIR /app

ENV NODE_ENV=production \
    PORT=8080

# TanStack Start SSR imports packages like react at runtime — install prod deps.
COPY package.json bun.lock* package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; \
    elif [ -f bun.lock ]; then npm install --omit=dev; \
    else npm install --omit=dev; fi

COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY passenger.cjs ./

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=8 \
  CMD wget -qO- http://127.0.0.1:8080/login >/dev/null || exit 1

CMD ["node", "passenger.cjs"]
