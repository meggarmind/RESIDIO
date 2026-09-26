# Docker Deployment

How Residio is packaged as a container image, how to build and run it on a developer machine,
and what changes when the same image definition moves to the Coolify host.

The runtime target is settled (#264, #269): **Coolify using the Dockerfile build pack, behind
Traefik, on a Hostinger KVM box, talking to Supabase Cloud.** Nixpacks, nginx and a plain
`next start` on a bare VM were all considered and rejected; this document does not re-open that.

**Scope:** the image itself. The nine cron schedules that Vercel currently runs from
`vercel.json` become Coolify scheduled tasks — that is a separate piece of work and is not
implemented here.

---

## Files

| File | Job |
|------|-----|
| `Dockerfile` | three-stage build: `deps` → `builder` → `runner` |
| `.dockerignore` | keeps `.env*`, `node_modules`, tests and agent state out of the build context |
| `docker-compose.yml` | local run only; Coolify builds the Dockerfile directly |
| `.env.docker.example` | template, split into build-time and runtime sections |
| `next.config.ts` | `output: 'standalone'` and the `sharp` file-tracing include |

---

## :warning: The image is bound to one environment

**An image built against Stage cannot be promoted to Prod. Build once per target.**

This is not a policy preference, it is how the code is wired:

- `src/lib/supabase/client.ts` — the **browser** client — imports `supabaseConfig`.
- `src/lib/supabase/config.ts` selects between the `_LOCAL` and `_CLOUD` suffixed variables
  based on `NEXT_PUBLIC_ENV_MODE`.

Because the browser client reads those values, Next.js inlines `NEXT_PUBLIC_SUPABASE_URL_CLOUD`
and `NEXT_PUBLIC_SUPABASE_ANON_KEY_CLOUD` into the client JavaScript bundle at **build** time.
Setting them at container start has no effect on the bundle already compiled into the image: a
Stage-built image will keep pointing at Stage's Supabase project no matter what the Prod
container's environment says.

So the usual "build one artefact, promote it through environments" pattern does not apply.
Each environment gets its own build, with its own build args.

Note also that `src/lib/supabase/config.ts` never reads the **unsuffixed**
`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Setting only those produces an app
that builds cleanly and cannot reach a database.

---

## Build args versus runtime environment

The split is the security boundary of the image, and the `Dockerfile` states it in a comment
block at the top for exactly that reason.

| | Passed as | Why | Visible to |
|---|---|---|---|
| `NEXT_PUBLIC_*` | `--build-arg` | inlined into the client bundle by `next build` | every visitor |
| everything else | runtime env | read by server code per request | the server only |

**No non-`NEXT_PUBLIC_` secret may ever become an `ARG` or an `ENV` in the Dockerfile.** A build
arg is recorded in `docker history`; an `ENV` is recorded in `docker inspect`. Either one hands
the value to anyone who can pull the image. That covers `SUPABASE_SERVICE_ROLE_KEY_CLOUD`,
`DATA_ENCRYPTION_KEY`, `GMAIL_TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`, `RESEND_API_KEY`,
`PAYSTACK_SECRET_KEY`, `PAYSTACK_WEBHOOK_SECRET`, `GOOGLE_CLIENT_SECRET`, `TERMII_API_KEY` and
every `WHATSAPP_*` value. If a build ever appears to need one of them, that is a bug in the code
being built.

`.env.docker.example` lists every variable under the correct heading.

---

## Node version

The image pins **Node 22 LTS** on Debian slim, via a single `ARG NODE_IMAGE` at the top of the
`Dockerfile` so it is changed in one place.

Three versions are in play and none of them agrees with the others:

| Where | Version |
|-------|---------|
| Developer machine | 25.1.0 |
| CI (`.github/workflows/stage-backup.yml:31`) | 20 |
| Container image | **22 LTS** |

22 is the choice because it is the only one of the three that is both an active LTS line and
current enough to carry what the image relies on. Node 25 is an odd-numbered release with no LTS
window, so pinning production to it buys a support cliff for no gain. Node 20 entered maintenance
and receives fixes only. Node 22 also has a stable global `fetch`, which the `HEALTHCHECK` uses
directly rather than adding `curl` to the image.

Debian (`bookworm-slim`), not Alpine: `sharp` and `pdfjs-dist` are both glibc-native, and this
app has no image-size constraint that would justify the musl risk.

`package.json` declares neither `engines` nor `packageManager`, so nothing in the repo contradicts
this pin — but nothing enforces it either. The `Dockerfile` is the only place the container's Node
version is stated.

### `sharp` and the lockfile

`sharp` is not a direct dependency; it arrives transitively through `next`. Two consequences:

- **Never pass `--omit=optional` to `npm ci`.** It drops `sharp` and image optimisation fails at
  runtime, not at build time.
- `next.config.ts` carries Next's documented fix so file tracing follows it into the standalone
  output:

  ```ts
  outputFileTracingIncludes: { '/*': ['node_modules/sharp/**/*'] }
  ```

The repo's `.npmrc` sets `legacy-peer-deps=true`, and the `deps` stage copies it alongside
`package.json` and `package-lock.json` so the image resolves the tree exactly as the repo and CI
do. Removing that `COPY` makes `npm ci` fail on peer conflicts.

---

## Build and run locally

```bash
# 1. Fill in the template. .env.docker is gitignored and is excluded from the
#    build context, so it may hold real values.
cp .env.docker.example .env.docker
$EDITOR .env.docker

# 2. Build and start.
docker compose up --build

# 3. http://localhost:3000
```

Or without compose:

```bash
docker build \
  --build-arg NEXT_PUBLIC_ENV_MODE=cloud \
  --build-arg NEXT_PUBLIC_SUPABASE_URL_CLOUD=https://<project-ref>.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY_CLOUD=<anon-key> \
  --build-arg NEXT_PUBLIC_SITE_URL=http://localhost:3000 \
  -t residio:local .

docker run --rm -p 3000:3000 --env-file .env.docker residio:local
```

Useful checks:

```bash
docker compose ps                    # health status
docker compose logs -f app
docker history residio:local         # confirm no secret is in a layer
```

The container runs as the non-root `node` user and serves the standalone build with
`node server.js`, with `HOSTNAME=0.0.0.0` so it is reachable from outside the container — the
Next.js default of `localhost` binds only to the container's loopback and looks like a dead
service from the host.

---

## Moving to the Coolify / KVM host

The same `Dockerfile` runs unchanged. What moves is where the values come from.

1. **Build args** are entered in Coolify's UI as build-time environment variables. Only the
   `NEXT_PUBLIC_*` set belongs here. Changing one requires a rebuild, not a restart.
2. **Runtime secrets** are entered as ordinary Coolify environment variables with the build-time
   flag off. Changing one takes effect on redeploy of the running container.
3. **Traefik terminates TLS.** The container speaks plain HTTP on 3000 and is never exposed on
   the host; Traefik joins its network and routes by hostname. The `ports:` mapping in
   `docker-compose.yml` is therefore local-only and unused on Coolify.
   Because the edge terminates TLS, the app sees `http://` on the wire. `NEXT_PUBLIC_SITE_URL`
   and `NEXT_PUBLIC_APP_URL` must be set to the **public `https://` origin**, or OAuth callbacks
   and generated links in emails and PDFs will point at `http://` and be blocked as mixed
   content in the browser.
4. **`docker-compose.yml` is not consumed by Coolify.** It is the local mirror of the same
   configuration; keep the two in step by hand.
5. **Cron becomes Coolify scheduled tasks** hitting `127.0.0.1:3000/api/cron/*` from inside the
   container network, carrying `CRON_SECRET` in the `Authorization` header. `vercel.json`'s nine
   schedules are inert off Vercel. Note that `src/lib/auth/cron-auth.ts` fails **closed** in
   production when `CRON_SECRET` is unset — a production container without it has no working
   scheduled jobs, and no error at boot to tell you. Implementing these schedules is section 3
   of #269 and is out of scope here.

---

## The reverse-proxy timeout trap

Nine route handlers export `maxDuration` — `300` in most cases
(`src/app/api/cron/generate-invoices/route.ts`, `fetch-emails`, `publish-announcements`,
`refresh-payment-cadence`, `generate-reports`, `apply-late-fees`,
`src/app/api/admin/generate-invoices/route.ts`; `payment-reminders` uses 120 and
`process-notifications` 60).

**`maxDuration` is a Vercel directive. Off Vercel it is a no-op.** Nothing in the container
enforces or extends it; the ceiling on a long request becomes whatever the reverse proxy in
front allows.

That is why the proxy choice matters. Traefik's `writeTimeout` defaults to `0s` — no limit — so
a five-minute invoice generation run completes. nginx defaults `proxy_read_timeout` to 60
seconds and would cut the same request off with a 504 while the work carried on server-side,
leaving invoices half-generated and no clean signal to the caller. Traefik was chosen for that
reason among others.

If Traefik's timeouts are ever tuned away from the defaults on this host, the long-running cron
routes are the first thing to re-check.

---

## Related

- `docs/setup/vercel-deployment.md` — the deployment this replaces, including the cron list
- `.env.example` — the same variables for local `npm run dev`
- Issue #269 — container and build definition; #264 — the hosting decision
