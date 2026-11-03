# syntax=docker/dockerfile:1.7
#
# Multi-stage production build.
#
# Stages:
#   build    - full (dev+prod) install from the lockfile, then `pnpm build`:
#              Rolldown bundles src/ and its dependencies into one file,
#              minified with Oxc (see rolldown.config.ts)
#   runtime  - final image: dist/ only (no node_modules), non-root, tini as PID 1
#
# Type checking belongs in CI (`pnpm typecheck`); Rolldown only strips types.

FROM node:26.12.1-slim AS build
WORKDIR /app

RUN npm install -g pnpm@12.4.1

# Manifest + lockfile first so the install layer stays cached until
# dependencies actually change.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json rolldown.config.ts ./
COPY src ./src
RUN pnpm build

# ---------------------------------------------------------------------------

FROM node:26.12.1-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# tini becomes PID 1: reaps zombies and forwards SIGTERM/SIGINT to node so the
# graceful shutdown in app.ts runs instead of Docker force-killing the process
# after its stop timeout. Unpinned on purpose: Debian rebuilds bump the +bN
# revision and drop the old one from the index, which breaks an exact pin.
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini \
  && rm -rf /var/lib/apt/lists/*

# The bundle is self-contained; the source map keeps stack traces in the logs
# pointing at src/ instead of minified code.
# node:*-slim ships a non-root `node` user (uid/gid 1000) - reuse it.
COPY --chown=node:node --from=build /app/dist ./dist

USER node

EXPOSE 3000

# Liveness only - /health/ping has no dependencies, so an outage elsewhere
# does not mark this container unhealthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health/ping').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["tini", "--"]
# Exec form: node is tini's direct child and receives signals itself.
CMD ["node", "--enable-source-maps", "dist/app.mjs"]
