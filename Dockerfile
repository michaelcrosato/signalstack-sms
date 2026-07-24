# Multi-stage Dockerfile for SignalStack SMS production runtime
# Base Node.js 22 runtime environment
FROM node:22-alpine AS base

# Stage 1: Install dependencies
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: Build the application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run db:generate
RUN npm run build

# Stage 3: Production runner
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Non-root execution: create ssms user and group (UID/GID 10001)
RUN addgroup --system --gid 10001 ssms && \
    adduser --system --uid 10001 ssms

# Read-only root filesystem readiness: create writeable runtime directories
RUN mkdir -p /app/.next /app/media /tmp && \
    chown -R ssms:ssms /app /tmp

COPY --from=builder --chown=ssms:ssms /app/public ./public
COPY --from=builder --chown=ssms:ssms /app/node_modules ./node_modules
COPY --from=builder --chown=ssms:ssms /app/.next ./.next
COPY --from=builder --chown=ssms:ssms /app/package.json ./package.json
COPY --from=builder --chown=ssms:ssms /app/prisma ./prisma
COPY --from=builder --chown=ssms:ssms /app/workers ./workers
COPY --from=builder --chown=ssms:ssms /app/scripts ./scripts
COPY --from=builder --chown=ssms:ssms /app/lib ./lib
COPY --from=builder --chown=ssms:ssms /app/next.config.mjs ./next.config.mjs

USER ssms

EXPOSE 3000

CMD ["npm", "start"]
