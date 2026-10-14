# syntax=docker/dockerfile:1
#
# Residio — production container image.
#
# Target runtime: Coolify (Dockerfile build pack) behind Traefik, on a Hostinger
# KVM box, talking to Supabase Cloud. There is no database in this image and none
# alongside it; see docs/deployment/docker.md.
#
# ------------------------------------------------------------------------------
# SECURITY CONTRACT — read before adding anything to this file
# ------------------------------------------------------------------------------
# Next.js inlines every NEXT_PUBLIC_* variable into the client JavaScript bundle
# at BUILD time. Those values are therefore public by construction and must be
# supplied as build ARGs (see the `builder` stage).
#
# Every OTHER secret — SUPABASE_SERVICE_ROLE_KEY_CLOUD, DATA_ENCRYPTION_KEY,
# CRON_SECRET, RESEND_API_KEY, PAYSTACK_SECRET_KEY, PAYSTACK_WEBHOOK_SECRET,
# GOOGLE_CLIENT_SECRET, GMAIL_TOKEN_ENCRYPTION_KEY, TERMII_API_KEY and every
# WHATSAPP_* value — is read only by server code at REQUEST time. None of them
# appears anywhere in this file as an ARG or an ENV, and none of them may be
# added. An ARG is recorded in the image history; an ENV is recorded in the image
# config. Either one leaks the secret to anyone who can `docker history` or
# `docker inspect` the image, including anyone who pulls it from a registry.
#
# Those values are injected at container start (docker-compose `env_file`, or
# Coolify's environment variables). If a build ever appears to need one of them,
# that is a bug in the code being built, not a reason to relax this rule.
# ------------------------------------------------------------------------------

# Node 22 LTS on Debian slim. Pinned here once and referenced by every stage.
# Debian, not Alpine: sharp (pulled in transitively by next) and pdfjs-dist are
# both glibc-native, and this app has no image-size pressure that would justify
# the musl risk.
ARG NODE_IMAGE=node:22-bookworm-slim

# ==============================================================================
# Stage 1 — dependencies
# ==============================================================================
FROM ${NODE_IMAGE} AS deps
WORKDIR /app

# .npmrc carries `legacy-peer-deps=true`. Copying it keeps the image resolving
# the dependency tree exactly the way the repo and CI do; without it `npm ci`
# diverges and fails on peer conflicts.
COPY package.json package-lock.json .npmrc ./

RUN npm ci

# ==============================================================================
# Stage 2 — builder
# ==============================================================================
FROM ${NODE_IMAGE} AS builder
WORKDIR /app

# ---- BUILD-TIME PUBLIC VALUES ONLY -------------------------------------------
# Each of these is inlined into the client bundle, so the resulting image is
# bound to one environment. An image built against Stage cannot be promoted to
# Prod — build once per target. See docs/deployment/docker.md.
ARG NEXT_PUBLIC_ENV_MODE=cloud
ARG NEXT_PUBLIC_SUPABASE_URL_CLOUD
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY_CLOUD
ARG NEXT_PUBLIC_SUPABASE_URL_LOCAL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY_LOCAL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_PAYSTACK_KEY
ARG NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY
ARG NEXT_PUBLIC_APP_VERSION
ARG NEXT_PUBLIC_GIT_SHA
ARG NEXT_PUBLIC_APP_ENV

ENV NEXT_PUBLIC_ENV_MODE=${NEXT_PUBLIC_ENV_MODE} \
    NEXT_PUBLIC_SUPABASE_URL_CLOUD=${NEXT_PUBLIC_SUPABASE_URL_CLOUD} \
    NEXT_PUBLIC_SUPABASE_ANON_KEY_CLOUD=${NEXT_PUBLIC_SUPABASE_ANON_KEY_CLOUD} \
    NEXT_PUBLIC_SUPABASE_URL_LOCAL=${NEXT_PUBLIC_SUPABASE_URL_LOCAL} \
    NEXT_PUBLIC_SUPABASE_ANON_KEY_LOCAL=${NEXT_PUBLIC_SUPABASE_ANON_KEY_LOCAL} \
    NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL} \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY} \
    NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_PAYSTACK_KEY=${NEXT_PUBLIC_PAYSTACK_KEY} \
    NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=${NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY} \
    NEXT_PUBLIC_APP_VERSION=${NEXT_PUBLIC_APP_VERSION} \
    NEXT_PUBLIC_GIT_SHA=${NEXT_PUBLIC_GIT_SHA} \
    NEXT_PUBLIC_APP_ENV=${NEXT_PUBLIC_APP_ENV}
# ---- END BUILD-TIME PUBLIC VALUES --------------------------------------------

ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Fail the build, naming every problem, when a NEXT_PUBLIC_* value Next inlines into
# the client bundle is missing or malformed (#396). Checks only the Supabase URL and
# anon key for the selected NEXT_PUBLIC_ENV_MODE. It does NOT check the service-role
# key, so the build needs no service-role value at all (#370). The same file is reused at start-up in
# the runner stage; the copy's name is what switches its CLI mode on.
COPY src/lib/config/env-validation.mjs ./preflight-env.mjs
RUN node preflight-env.mjs --build

# `output: 'standalone'` in next.config.ts produces .next/standalone.
RUN npm run build

# ==============================================================================
# Stage 3 — runner
# ==============================================================================
FROM ${NODE_IMAGE} AS runner
WORKDIR /app

# The standalone server binds to HOSTNAME; the Next.js default (localhost) binds
# only to the container's loopback and is unreachable from outside it.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

# Non-root. node:*-slim ships a `node` user (uid/gid 1000) already.
RUN mkdir -p /app/.next && chown -R node:node /app

# The three artefacts Next.js documents for a standalone deployment. The
# standalone bundle carries its own pruned node_modules, so none is copied here.
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/preflight-env.mjs ./preflight-env.mjs

USER node

EXPOSE 3000

# node:*-slim has neither curl nor wget. Node 22's global fetch is the only
# dependency-free probe available.
#
# redirect:'manual' keeps the probe inside the container. `/` redirects to
# /dashboard and the middleware then redirects to NEXT_PUBLIC_SITE_URL/login,
# the PUBLIC hostname. Following that chain would make health depend on Traefik
# already having a route and a certificate for the hostname, which Coolify only
# creates once a container is healthy, so a first deploy could never pass
# (#439). The 307 from `/` is below 500 and counts as healthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/',{redirect:'manual'}).then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

# Validate the runtime environment BEFORE server.js binds its port (#396): a missing or
# malformed strict variable exits non-zero naming all of them, and the container never
# starts listening. `exec` keeps node as PID 1 so SIGTERM still reaches the server.
# (src/instrumentation.ts repeats the check, but Next calls it only after the port is bound.)
CMD ["sh", "-c", "node preflight-env.mjs && exec node server.js"]
