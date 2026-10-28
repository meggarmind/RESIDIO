# Hosting plan

> **Status: DECIDED by the owner on 2026-10-10.** This plan overrides the 2026-09-19 design in
> #269 wherever they conflict (Coolify is back; stage runs on the same KVM as prod; one build per
> environment; cron as Coolify scheduled tasks). Parts of #269 that do not conflict (the PR gate
> and release automation in #397, fail-fast configuration in #396, the credential clean-up in
> #400) still stand. `docs/deployment/docker.md` describes the image and the Coolify host and
> links here. Do not re-litigate the choices below; they were made after measuring the
> alternatives recorded in this file.

Constraint driving everything: the project is entirely self-funded, so the goal is the lowest
recurring cost that keeps the service running long term.

---

## Decisions (2026-10-10)

| # | Topic | Owner's position | Status |
|---|---|---|---|
| 1 | App hosting | **Hostinger KVM 2** (2 vCPU, 8 GB, 100 GB NVMe), one VPS running **both prod and stage** | **Confirmed** by owner 2026-10-10; host provisioned and ready |
| 2 | Deployment layer | **Coolify** (Dockerfile build pack, Traefik) | **Decided** 2026-10-10; overrides #269's Caddy/GHCR design |
| 3 | Database / auth / storage | **Stay on Supabase** (free plan). Neon rejected after measurement, see below | Decided |
| 4 | Supabase Pro ($25/mo) | **Not affordable** just for backups | Owner constraint |
| 5 | Backup destination | **Cloudflare R2** | Chosen |
| 6 | Backup encryption key | Held by the owner in their **password manager** (copy outside GitHub) | Chosen |
| 7 | Backup retention | **30 daily + 12 monthly** (database dumps) | Chosen |
| 8 | Dev environment | Stays on local PCs | Owner statement |
| 9 | Server hardening | SSH keys only, firewall 22/80/443; **admin dashboard reached through Cloudflare One** (Tunnel + Access) | Chosen 2026-10-10 |
| 10 | Secrets | Password manager is the master copy; app secrets in Coolify's encrypted variables; backup secrets in GitHub Actions secrets. Cloudflare secret stores cannot feed a VPS app | Decided |
| 12 | Stage placement | Stage on the **same KVM** as prod, always on (not the laptop) | Decided; overrides #269 |
| 13 | Cron | **Coolify scheduled tasks** on the KVM (#399); the GitHub Actions invoice safety net stays | Decided; overrides #269 |
| 14 | App hostnames | **DNS-only** (Cloudflare grey cloud) for prod and stage app hostnames; only the Coolify dashboard goes through Cloudflare One | Decided 2026-10-11 |
| 15 | Prod data | #280 moves **configuration only** (roles, permissions, settings, reference data). Houses, residents **and financial history** are seeded into prod by a separate task, owned by the owner | Decided 2026-10-11; revises the 2026-09-07 "no financial history" rule |
| 11 | Residio_Prod | **Unpaused** by owner 2026-10-10 (verified ACTIVE_HEALTHY) | Done |

---

## Target layout

```
Hostinger KVM 2  (x86, 2 vCPU, 8 GB RAM, 100 GB NVMe)
└── Coolify (Traefik terminates TLS)
    ├── residio-prod   -> app.<domain>    -> Supabase project Residio_Prod
    ├── residio-stage-image -> stage.<domain> -> Supabase project Residio_Stage (CI-built GHCR image)
    ├── residio-waha-stage  -> WAHA WhatsApp gateway for Stage (#1260); no app hostname, reached by the Stage app over HTTPS
    └── Scheduled tasks: the 12 scheduled cron routes (see "Scheduled tasks" below), on prod and stage
```

- `residio-waha-stage` is the self-hosted WAHA container (`devlikeapro/waha`, NOWEB engine) that the
  `waha` WhatsApp provider talks to (ADR-0008). The Coolify service, its volume and the QR pairing are
  set up by #1261, not by the app code. The app reaches it at the server address saved in **Settings
  → WhatsApp**, and WAHA calls back to `/api/whatsapp/webhook/waha` on the Stage app. Its cron task is
  `whatsapp-waha-reconcile` (see "The tasks"). There is no Prod WAHA service yet.
- Builds run on the VPS (8 GB covers Coolify ~1 GB, two app containers ~0.5-1 GB each, and a
  2-4 GB build spike). x86, so no ARM image concern.
- One image per environment: `NEXT_PUBLIC_*_CLOUD` values are inlined at build time
  (`docker.md`), so prod and stage each get their own build variables in Coolify.
- Keep the Coolify dashboard off the public internet (firewall rule or VPN) and keep it updated.
- Keep `.github/workflows/backup-cron-invoices.yml` as the safety net for invoice generation.

---

## Scheduled tasks (#399)

`vercel.json` was the only definition of Residio's schedules and is inert off Vercel, so it has
been removed. The twelve schedules now live as **Coolify scheduled tasks on both the `residio-prod`
and the `residio-stage-image` application**, with the same container, frequency and command on each.
Stage's 11 Coolify scheduled tasks are attached to `residio-stage-image` (moved from the
stopped `residio-stage`, #1114). Coolify configuration is not in the repo, so this section is the record; if a task is changed in
Coolify, change it here in the same piece of work.

### Stage runs the same tasks, behind the communications override (#713)

Stage's database holds UAT data copied from the real roster, so its jobs would email and message
real people. Stage still runs every task, because the **communications override** redirects what
they send. This was verified on Stage on 2026-10-20 (#718, results recorded on #713) before any Stage task was created.

- **What it does.** At send time, the email transport, SMS and WhatsApp seams send to the override
  contacts instead of the real recipient (`src/lib/comms-override/`). Queue rows and UAT data keep
  the real recipient. A redirected message names who it was meant for, and the log records both the
  original and the actual recipient. If the override value the channel needs is blank, or the
  settings cannot be read, the message is **blocked**, never sent to the real address. 2FA setup
  and verify sends are exempt (they go to the signed-in user). In-app notifications are unchanged.
- **Who it covers.** Every external recipient: residents, staff and admin alerts, report-schedule
  recipients, security contacts and vendors. In a non-production environment the global switch is
  on and cannot be turned off from the UI, so everyone is redirected except a resident an admin has
  explicitly set to receive real messages.
- **Where it is configured.** **Settings > Messages & Reminders > Redirect Messages (test mode)** (page heading "Communications override"; needs the general settings
  permission): one override email, one phone in E.164 (SMS and WhatsApp), and an optional separate
  WhatsApp number. Set them to the owner's own contacts before a Stage task runs. The same page holds
  Debug Mode, which redirects everything on Prod for a limited time.
- **Environment.** Production versus non-production comes from `NEXT_PUBLIC_APP_ENV`, a build
  variable. It must be set on **both** applications: `production` on `residio-prod`, `staging` on
  `residio-stage-image` (see "Phase 5: the two applications" below). Unset or unrecognised counts as
  non-production, so a Prod build missing it would redirect every message.
- **Known limits** (#713 decision 8, deliberately not redirected): WhatsApp Assistant replies go to
  whoever messaged the number; Supabase Auth emails (password reset, invites) are sent by Supabase,
  not by the app; Paystack customer receipts are sent by Paystack.
- **Stage's own secret.** The Stage tasks read Stage's runtime `CRON_SECRET` from the Stage
  container, never Prod's. The commands below are identical on both applications.

### The tasks

Each task: Container = the app container, Frequency = the cron below (UTC), Command = the `node`
one-liner in the next block. `CRON_SECRET` is already a runtime secret on the application and is
read from the container's environment by the command, so it is never written into the task.

| Route | Cron (UTC) | Timeout (ms) |
|---|---|---|
| `publish-announcements` | `0 * * * *` | 300000 |
| `fetch-emails` | `0 * * * *` | 300000 |
| `refresh-payment-cadence` | `0 0 * * *` | 300000 |
| `whatsapp-retention` | `15 0 * * *` | 60000 |
| `purge-performance-events` | `30 0 * * *` | 60000 |
| `whatsapp-chatmaid-reconcile` | `*/15 * * * *` | 120000 |
| `whatsapp-waha-reconcile` | `*/15 * * * *` | 120000 |
| `generate-invoices` | `0 6 * * *` | 300000 |
| `process-report-schedules` | `0 7 * * *` | 300000 |
| `payment-reminders` | `0 8 * * *` | 120000 |
| `process-notifications` | `*/15 * * * *` | 60000 |
| `expire-approvals` | `0 * * * *` | 60000 |

`process-notifications` runs every 15 minutes (#546), not daily: a transient send failure is put
back on the queue with a backoff of 15 minutes, 1 hour, 6 hours, then 24 hours (or until the
WhatsApp daily cap resets at midnight Lagos time), and a daily run would pick every retry up a day late. The
operator changes the schedule in Coolify; no workflow or scheduler file in the repository carries it.
The route purges old `sent`/`cancelled` queue rows (older than 30 days) only in the 00:00-00:04 UTC
run, which the old daily 09:00 schedule never hit, so the 15-minute schedule starts that purge for
the first time.

All calls go to `http://127.0.0.1:3000` inside the container, so they do not pass through Traefik
or Cloudflare. The `AbortSignal.timeout` in the command is therefore the **only** ceiling on a
run (the routes' `maxDuration` exports are a Vercel directive and do nothing here).

### Commands

`node:*-slim` has neither `curl` nor `wget` (see the `HEALTHCHECK` in `Dockerfile`), so the command
uses Node's global `fetch`, as the `HEALTHCHECK` does. Each command prints the HTTP status, exits
**0 on any 2xx**, and exits **1 on a non-2xx, a timeout, or a network error**. A missing
`CRON_SECRET` sends `Bearer undefined`, which the route rejects with 401, so it also fails the task.
Only the route and the timeout differ between tasks.

```sh
# publish-announcements  (0 * * * *)
node -e "fetch('http://127.0.0.1:3000/api/cron/publish-announcements',{headers:{Authorization:'Bearer '+process.env.CRON_SECRET},signal:AbortSignal.timeout(300000)}).then(r=>{console.log(r.status);process.exit(r.ok?0:1)}).catch(e=>{console.error(e.name);process.exit(1)})"

# fetch-emails  (0 * * * *)
node -e "fetch('http://127.0.0.1:3000/api/cron/fetch-emails',{headers:{Authorization:'Bearer '+process.env.CRON_SECRET},signal:AbortSignal.timeout(300000)}).then(r=>{console.log(r.status);process.exit(r.ok?0:1)}).catch(e=>{console.error(e.name);process.exit(1)})"

# refresh-payment-cadence  (0 0 * * *)
node -e "fetch('http://127.0.0.1:3000/api/cron/refresh-payment-cadence',{headers:{Authorization:'Bearer '+process.env.CRON_SECRET},signal:AbortSignal.timeout(300000)}).then(r=>{console.log(r.status);process.exit(r.ok?0:1)}).catch(e=>{console.error(e.name);process.exit(1)})"

# whatsapp-retention  (15 0 * * *)
node -e "fetch('http://127.0.0.1:3000/api/cron/whatsapp-retention',{headers:{Authorization:'Bearer '+process.env.CRON_SECRET},signal:AbortSignal.timeout(60000)}).then(r=>{console.log(r.status);process.exit(r.ok?0:1)}).catch(e=>{console.error(e.name);process.exit(1)})"

# whatsapp-chatmaid-reconcile  (*/15 * * * *)
node -e "fetch('http://127.0.0.1:3000/api/cron/whatsapp-chatmaid-reconcile',{headers:{Authorization:'Bearer '+process.env.CRON_SECRET},signal:AbortSignal.timeout(120000)}).then(r=>{console.log(r.status);process.exit(r.ok?0:1)}).catch(e=>{console.error(e.name);process.exit(1)})"

# whatsapp-waha-reconcile  (*/15 * * * *)
node -e "fetch('http://127.0.0.1:3000/api/cron/whatsapp-waha-reconcile',{headers:{Authorization:'Bearer '+process.env.CRON_SECRET},signal:AbortSignal.timeout(120000)}).then(r=>{console.log(r.status);process.exit(r.ok?0:1)}).catch(e=>{console.error(e.name);process.exit(1)})"

# generate-invoices  (0 6 * * *)
node -e "fetch('http://127.0.0.1:3000/api/cron/generate-invoices',{headers:{Authorization:'Bearer '+process.env.CRON_SECRET},signal:AbortSignal.timeout(300000)}).then(r=>{console.log(r.status);process.exit(r.ok?0:1)}).catch(e=>{console.error(e.name);process.exit(1)})"

# process-report-schedules  (0 7 * * *)
node -e "fetch('http://127.0.0.1:3000/api/cron/process-report-schedules',{headers:{Authorization:'Bearer '+process.env.CRON_SECRET},signal:AbortSignal.timeout(300000)}).then(r=>{console.log(r.status);process.exit(r.ok?0:1)}).catch(e=>{console.error(e.name);process.exit(1)})"

# payment-reminders  (0 8 * * *)
node -e "fetch('http://127.0.0.1:3000/api/cron/payment-reminders',{headers:{Authorization:'Bearer '+process.env.CRON_SECRET},signal:AbortSignal.timeout(120000)}).then(r=>{console.log(r.status);process.exit(r.ok?0:1)}).catch(e=>{console.error(e.name);process.exit(1)})"

# expire-approvals  (0 * * * *)
node -e "fetch('http://127.0.0.1:3000/api/cron/expire-approvals',{headers:{Authorization:'Bearer '+process.env.CRON_SECRET},signal:AbortSignal.timeout(60000)}).then(r=>{console.log(r.status);process.exit(r.ok?0:1)}).catch(e=>{console.error(e.name);process.exit(1)})"

# purge-performance-events  (30 0 * * *)
node -e "fetch('http://127.0.0.1:3000/api/cron/purge-performance-events',{headers:{Authorization:'Bearer '+process.env.CRON_SECRET},signal:AbortSignal.timeout(60000)}).then(r=>{console.log(r.status);process.exit(r.ok?0:1)}).catch(e=>{console.error(e.name);process.exit(1)})"

# process-notifications  (*/15 * * * *)
node -e "fetch('http://127.0.0.1:3000/api/cron/process-notifications',{headers:{Authorization:'Bearer '+process.env.CRON_SECRET},signal:AbortSignal.timeout(60000)}).then(r=>{console.log(r.status);process.exit(r.ok?0:1)}).catch(e=>{console.error(e.name);process.exit(1)})"
```

### Timeouts, and why

| Timeout | Routes | Reason |
|---|---|---|
| 300 s | `generate-invoices`, `fetch-emails`, `publish-announcements`, `refresh-payment-cadence` | Their declared `maxDuration`, kept as the expected worst case. No margin is added: a run needing more than five minutes should fail loudly. |
| 300 s | `process-report-schedules` | **Previously undeclared.** It loops over every due schedule and, per schedule, generates the report, renders a PDF, uploads it and sends email (`src/actions/reports/process-schedules.ts`), the same shape of work as `generate-invoices`, so it gets the same ceiling. |
| 120 s | `payment-reminders` | Declared `maxDuration`: multi-channel sends. |
| 60 s | `process-notifications` | Declared `maxDuration`. |
| 60 s | `expire-approvals` | One read, one set-based UPDATE inside `process_expired_approvals()` and one in-app notification per expired request (#558). Hourly, so the backlog is small. New route: the owner must create this Coolify task; nothing runs it until then. |
| 120 s | `whatsapp-chatmaid-reconcile` | New route (#511): at most 3 Chatmaid list calls (15 s timeout each) plus the Assistant reply for any message the webhook missed. Nothing runs it until the owner creates this Coolify task. |
| 120 s | `whatsapp-waha-reconcile` | New route (#1262): at most 3 WAHA message-store reads (15 s timeout each) plus the Assistant reply for any message the webhook missed. It does nothing unless WAHA is the active provider. Nothing runs it until the owner creates this Coolify task. |
| 60 s | `purge-performance-events` | New route (#957): one `DELETE ... WHERE occurred_at < now() - 30 days` on `performance_events`. Nothing runs it until the owner creates this Coolify task. |
| 60 s | `whatsapp-retention` | **Previously undeclared.** Four bulk `DELETE ... WHERE <timestamp> < cutoff` statements run in parallel (`src/lib/whatsapp/retention.ts`) and nothing else; it runs daily so the backlog is small. Anything near 60 s means something is wrong. |

A timeout aborts the caller, **not** the server-side work: the route handler keeps running in the
container after the task gives up. Treat a timeout failure as "still running or stuck", and check
the app logs and the run history before re-triggering anything that creates records.

### Not scheduled: `apply-late-fees`

There are thirteen cron routes and **twelve** schedules. `src/app/api/cron/apply-late-fees` exists and
authenticates like the others, but it has **never had a `vercel.json` entry** (its handler comment
says "7 AM UTC daily (configured in vercel.json)"; that was never true), so late fees have never
run on a schedule in any environment. It was left unscheduled because #399 listed nine schedules.
Whether to schedule it (the handler's comment suggests `0 7 * * *`) is an owner decision rather
than an infrastructure one, because it starts charging residents. If the owner says yes, add a
thirteenth task with the same command (300000 ms) and update this table.

### Failure visibility (owner, in Coolify)

Enable **scheduled-task failure notifications** to the owner (Coolify: Notifications, enable the
scheduled-task failure event on a channel that is actually read). Without this a failed job is
silent from the user side. Each task also records its executions in the application's Scheduled
Tasks tab; check that after the first run.

Do not send scheduled-task failures by email when Coolify's email uses the app's Resend team. Each
failed run is one email, so a task that fails every 5 minutes sends about 288 a day and uses the
100/day quota (28 Oct 2026, #1268). Use Telegram or Discord for that event.

`whatsapp-chatmaid-reconcile` exits 0 when Chatmaid refuses the key (HTTP 401/403), so it does not
alert every run. The refusal and Chatmaid's reason still go to the System log as a failure
(source `cron:whatsapp-chatmaid-reconcile`).

### Triggering a job by hand against stage

To run a job outside its schedule (for example to check a change before the next run), trigger it
by hand. App hostnames are DNS-only (decision 14), so there is no Cloudflare 100 s
cut and `curl` from any machine reaches Traefik directly:

```sh
curl -fsS -m 300 -H "Authorization: Bearer $STAGE_CRON_SECRET" https://stage.<domain>/api/cron/<route>
```

`$STAGE_CRON_SECRET` is stage's own `CRON_SECRET`, never prod's. Alternatively open a terminal on
the stage container in Coolify and run the command above with the route and timeout substituted.
What a hand-triggered job sends goes through the communications override (above), exactly as a
scheduled run does.

### The GitHub Actions safety net

`.github/workflows/backup-cron-invoices.yml` is the off-host check on `generate-invoices`
(owner direction 2026-10-10; per-environment and preflight-guarded since #623, see below).
Reviewed against the public hostname:

- It calls each environment's `APP_URL` secret, which must be that deployment's **public `https://` origin** (no trailing slash or path). Because app
  hostnames are DNS-only there is no Cloudflare proxy in the path and so no 100 s cutoff; Traefik
  applies no request timeout and the job has `timeout-minutes: 10`. It only calls
  `generate-invoices` when the health check reports `critical`, so it is normally a no-op.
- **If the prod app hostname is ever switched to proxied (orange cloud)**, a generation call
  longer than 100 s returns 524 to the workflow while the work carries on, and the workflow would
  report failure. Keep the hostname DNS-only.
- Known limitation, left alone: if the app is entirely unreachable, the health step logs a
  warning and exits 0, so the run is green. The safety net covers "job missed", not "site down".

#### Parameters and preflight (#623)

The workflow runs once per GitHub Environment (`stage`, `production`). A preflight
(`scripts/backup-cron-preflight.mjs`) runs first: if the environment's parameters are missing
it skips the environment (green) and emails the sys_admin through Resend, naming the missing
parameters but never their values. It is live (`# STATUS: ACTIVE` in the workflow header,
released in #652) and needs these to exist:

| Where | Secret | Value |
| --- | --- | --- |
| Environment `stage`, and again on `production` | `APP_URL` | public `https://` origin of that deployment, no path |
| Environment `stage`, and again on `production` | `CRON_SECRET` | that deployment's `CRON_SECRET` |
| Repository | `ALERT_RESEND_API_KEY` | dedicated Resend key for alerts |
| Repository | `ALERT_EMAIL_FROM` | verified sender address |
| Repository | `ALERT_EMAIL_TO` | sys_admin address (comma-separated for several) |

To hold it again: comment out `schedule:`, set the marker to `# STATUS: HELD` in the same
commit, and disable the workflow in Actions. If the alert secrets are also missing the preflight
fails the run, so the problem is not silent.

While Residio_Prod holds no estate data its `auto_generate_invoices` setting is off (#652): the
invoice status card then reads healthy "off" and the workflow does not nudge Prod. Switch it on
at go-live, otherwise Prod's first month would be generated by hand.

---

## Cost

| Item | Year 1-2 (24-month promo) | After renewal |
|---|---|---|
| Hostinger KVM 2 | ~$8.79/mo (~$211 upfront) | ~$14.99/mo |
| Supabase (2 free projects) | $0 | $0 |
| Cloudflare R2 (10 GB free tier) | $0 | $0 |
| GitHub Actions (backup minutes) | $0 | $0 |
| Domain | ~$10-15/yr | ~$10-15/yr |
| **Total** | **~$117/yr** | **~$190/yr** |

Prices were taken from third-party listings in mid-2026. Confirm them at checkout.

---

## Options considered

| Option | Verdict | Reason |
|---|---|---|
| Vercel Hobby | Rejected for production | Non-commercial terms; crons limited to once a day (two of ours are hourly); ~4.5 MB request body cap vs our 10 MB server-action limit |
| Cloudflare Workers (free) | Rejected | 3 MiB compressed worker limit and 10 ms CPU per request; `sharp`/pdfjs incompatible |
| Oracle Cloud Always Free | Viable $0 fallback | Allowance reportedly halved to 2 OCPU / 12 GB (June 2026); ARM builds; idle reclamation unless Pay-As-You-Go; no support |
| Coolify vs plain Docker on the VPS | Coolify | Per-environment build variables, TLS, scheduled tasks, rollback and deploy-on-push for free; Traefik's default no-timeout suits 5-minute routes (nginx's 60 s default would not) |
| Two VPSs (separate stage) | Not now | Roughly double the cost for a solo project |
| Neon instead of Supabase | Rejected | Replaces only Postgres; see measurements below |
| Self-hosted Supabase on the VPS | Rejected | ~10 containers, would compete with prod and stage for 8 GB |

## Supabase usage, measured 2026-10-10 (Residio_Stage, read-only)

- Database 35 MB; 96 public tables, all with RLS; 258 policies, 217 identity-aware.
- 105 public functions (34 `SECURITY DEFINER`); 21 called via `.rpc()` from the app.
- Auth: 6 users (email 5, Google 2); 143 `auth.getUser()` calls in `src/`; admin user API used;
  10 public tables hold foreign keys to `auth.users`; trigger `on_auth_user_created` ->
  `handle_new_user`. 2FA is app-level (0 Supabase MFA factors).
- Query layer: ~1,500 `.from()` calls; ~107 files use the service-role client.
- Storage: 5 buckets, 14 storage policies; `email-imports` holds 233 objects (~9 MB).
- Not used: Realtime (0 published tables), pg_cron, pg_net, Vault secrets (0).
- `Residio_Prod` was **paused (INACTIVE)** at the time of measurement: nothing deployed is using it.

Moving to Neon would mean replacing auth, storage and the query layer and re-proving every RLS
policy. That is weeks of the highest-risk work in this repo, to solve a problem with free fixes.

---

## Supabase free-plan risks and their fixes

| Risk | Fix | Cost |
|---|---|---|
| Prod pauses after ~7 days idle | Daily cron routes plus the nightly backup keep it active (verify after go-live) | $0 |
| Stage pauses | Weekly GitHub Actions query, or unpause by hand when needed | $0 |
| No backups on the free plan | Nightly backup workflow below | $0 |
| 500 MB DB / 1 GB storage limits | Stage uses 35 MB and ~9 MB; ample headroom for one estate | $0 |

## Backup plan (GitHub Actions -> Cloudflare R2)

A deterministic GitHub Actions workflow, not a Claude routine: same script every night, secrets
in GitHub's encrypted store, failure email by default. Claude writes and maintains it.

Nightly:

1. `pg_dump` of `Residio_Prod` using a PostgreSQL **17** client.
2. Sync new and changed storage files (through Supabase's S3-compatible storage endpoint) into
   the encrypted files mirror described below.
3. Encrypt the database dump (key held in the owner's password manager; the workflow holds only what
   it needs to encrypt).
4. Upload to a private **Cloudflare R2** bucket; retention 30 daily + 12 monthly for database
   dumps.

Storage files are **not** copied in full every night. They are synced incrementally (for
example `rclone` with a `crypt` remote, so they are encrypted too) into one mirror, with changed
or deleted files moved to a dated folder rather than lost; those folders are purged after 30 days.
Only the databases are snapshotted 42 times (each of Prod and Stage).

### R2 free-tier sizing (10 GB-month storage)

Measured on Residio_Stage 2026-10-10: `public` schema 17 MB (whole DB 35 MB including system
catalogs); storage objects ~9.4 MB (233 email imports, 1 document). Prod was paused, so its size
is unknown; these are planning estimates.

Each environment keeps up to 42 dumps (30 daily + 12 monthly), and Stage is backed up too, so the
dump column counts both. `deleted/` holds 30 days of changed and deleted files; the table assumes
a quarter of the files mirror changes in that window (a guess, not a measurement).

| Scenario | DB dump (compressed) | Prod + Stage dumps (2 x 42) | Files mirror | `deleted/` (30 days) | Total |
|---|---|---|---|---|---|
| Today (stage-sized, Prod assumed alike) | ~5 MB | ~0.4 GB | ~10 MB | ~0 | **~0.4 GB** |
| Year one, generous growth (DB 150 MB, files 300 MB) | ~40 MB | ~3.4 GB | ~0.3 GB | ~0.08 GB | **~3.8 GB** |
| Supabase free-plan ceiling (DB 500 MB, files 1 GB) | ~150 MB | ~12.6 GB | ~1 GB | ~0.25 GB | **~13.9 GB** |

At the ceiling the bucket does **not** fit in 10 GB: the 42-dump retention alone is 6.3 GB per
environment. The size guard below warns at 7 GB and fails the job at 8.5 GB, long before that, so
the owner decides then whether to shorten the dump retention or pay for the overage. Stage is
backed up weekly, so its `daily/` folder holds 30 weekly dumps, about 210 days, not 30 days.

The files are mirrored once; copying them in full nightly would not fit even before the dumps
(~48 GB at the ceiling). Beyond the free tier R2 charges ~$0.015 per GB-month, and
egress (downloading for a restore) is free. Cloudflare may require a payment method to enable
R2; set a billing notification so any overage is noticed.

### Retention and size guards

Added in #963 so the bucket stays under the 10 GB free tier (R2 bills the overage, it does not stop
writes). The decisions live in `scripts/backup/retention.mjs`, called through `retention.sh`; both
are covered by `src/__tests__/integration/backup-retention.test.ts`.

- **`deleted/` purge.** After a successful mirror sync, `files-sync.sh` lists `FILESCRYPT:deleted`
  with `rclone lsd` (through the crypt remote, so the date names are readable) and runs
  `rclone purge` on each date folder more than `DELETED_KEEP_DAYS` days old (default 30; a folder
  exactly 30 days old is kept). Names that are not a real date are never purged. An R2 lifecycle
  rule cannot do this, because the crypt remote encrypts the folder names. To change the window set
  `DELETED_KEEP_DAYS` in the job's `env:`; zero or a non-number fails the step instead of purging
  everything. A restore of a file changed or deleted more than 30 days ago is no longer possible
  from the mirror (database dumps are unaffected).
- **Size check.** At the end of `db-backup.sh` and `files-sync.sh`, `rclone size R2:<bucket> --json`
  prints the whole bucket's size. Above 7 GB it logs a warning; above 8.5 GB the job fails, so
  GitHub emails the owner. The check runs last, so a full bucket never costs that night's backup.
  It counts stored objects, not incomplete multipart uploads (see below).
- **Incomplete multipart uploads (owner step, Cloudflare dashboard).** They count toward storage and
  nothing in the scripts cleans them. Cloudflare Dashboard, R2 Object Storage, the backup bucket,
  **Settings**, **Object lifecycle rules**, **Add rule**: name it `abort-incomplete-multipart`,
  leave the prefix empty (whole bucket), choose **Abort incomplete multipart uploads**, set it to
  **1 day**, save. If the dashboard already lists a default multipart-abort rule, edit it to 1 day
  rather than adding a second. Tick this off in the checklist below once done.

### Stage keep-awake

Weekly: a small query against `Residio_Stage` so it does not pause.

### Known traps


- Supabase's free direct connection is IPv6-only and GitHub-hosted runners have no IPv6. Use the
  **session pooler** (port 5432). The transaction pooler (6543) does not work with `pg_dump`.
- The job fails while prod is paused. Resume prod first.
- Do a test restore into a scratch database once, then every few months.

Secrets needed in GitHub: prod (and stage) session-pooler connection string, Supabase storage S3
credentials, R2 access key / secret / bucket / endpoint, encryption public key or passphrase.
The exact names and the restore runbook are in the next section.

## Backups: secrets, restore runbook

Implemented by `.github/workflows/backup-database.yml` (#415) and the scripts in
`scripts/backup/`. Never paste a real value into this file: the repository is public.

| Job | Schedule | What it does |
|---|---|---|
| `prod` | nightly 02:23 UTC | `pg_dump -Fc` (PostgreSQL 17 client), `age` encrypt, upload to R2, prune, size check; then incremental storage mirror, `deleted/` purge, size check |
| `stage` | Mondays 03:41 UTC | `select 1` keep-awake, then the same dump, encrypt, upload, prune, size check (database only) |

Run either by hand from the Actions tab (Backup Database, Run workflow, choose `prod`, `stage` or
`both`). Layout in the bucket:

```text
db/<prod|stage>/daily/YYYY-MM-DD.dump.age     newest 30 kept (Stage runs weekly: about 210 days)
db/<prod|stage>/monthly/YYYY-MM.dump.age      newest 12 kept; the first backup of each month is copied here
files/prod/current/...                        storage mirror, file names and contents encrypted (rclone crypt)
files/prod/deleted/YYYY-MM-DD/...             files changed or deleted that day; folders older than 30 days are purged after each sync
```

### Secrets to create

Each job starts with a preflight (`scripts/backup/preflight.mjs`) that fails naming any unset secret above, so a missing one no longer shows up as a psql socket error.

GitHub, Settings, Secrets and variables, Actions, **Repository secrets** (not variables):

| Secret | Value |
|---|---|
| `PROD_DB_URL` | Residio_Prod (`miyeswqbwarvipdzwqnz`) **session pooler** string, port **5432** (Dashboard, Connect, Session pooler). Not the direct host (IPv6-only), not port 6543 |
| `STAGE_DB_URL` | Same for Residio_Stage (`kzugmyjjqttardhfejzc`) |
| `R2_ENDPOINT` | `https://<cloudflare-account-id>.r2.cloudflarestorage.com` |
| `R2_ACCESS_KEY_ID` | R2 API token, Object Read & Write, scoped to the one bucket |
| `R2_SECRET_ACCESS_KEY` | The same token's secret |
| `R2_BUCKET` | Name of the private backup bucket |
| `BACKUP_AGE_PUBLIC_KEY` | The `age1...` public key (generated below). Public, but kept as a secret so it is not scattered |
| `PROD_STORAGE_S3_ENDPOINT` | `https://miyeswqbwarvipdzwqnz.storage.supabase.co/storage/v1/s3` (Dashboard, Storage, S3 connection shows the exact URL) |
| `PROD_STORAGE_S3_REGION` | The project's region as shown on the same page (S3 signing needs it) |
| `PROD_STORAGE_S3_ACCESS_KEY_ID` | Storage S3 access key (Dashboard, Storage, S3 connection, New access key) |
| `PROD_STORAGE_S3_SECRET_ACCESS_KEY` | The matching secret |
| `FILES_CRYPT_PASSWORD` | rclone crypt password: a long random string, **also stored in the password manager** |
| `FILES_CRYPT_PASSWORD2` | rclone crypt salt: a second long random string, also in the password manager |

Thirteen secrets. Stage has no storage mirror (test data), so no `STAGE_STORAGE_*` secrets.
The R2 token must not be able to create or delete buckets. Losing `FILES_CRYPT_PASSWORD` or
`FILES_CRYPT_PASSWORD2` makes the files mirror unreadable: treat both like the age private key.

### Generate the age keypair

On the owner's own machine (not a runner, not a shared host):

```bash
age-keygen -o residio-backup.agekey
# prints:  Public key: age1...
```

1. Put the **whole contents of `residio-backup.agekey`** (the `AGE-SECRET-KEY-...` line) in the
   password manager, plus a second copy outside GitHub and outside this machine.
2. Put only the `age1...` public key in the `BACKUP_AGE_PUBLIC_KEY` secret.
3. Delete the local `residio-backup.agekey` once both copies are confirmed. GitHub never holds
   the private key, so a leaked runner cannot read the backups, and nobody can decrypt them
   without the password manager copy.

### Test restore (once, then every few months)

Restore into a throwaway database, never into prod or stage. A local plain PostgreSQL 17 (a
container is fine: `docker run --rm -e POSTGRES_PASSWORD=scratch -p 54329:5432 postgres:17`)
or an empty scratch Supabase project both work. This is not the Supabase CLI.

```bash
# 1. Get the newest dump (rclone remote "r2" configured on your machine, or use the Cloudflare dashboard)
rclone copy r2:<bucket>/db/prod/daily/<YYYY-MM-DD>.dump.age .

# 2. Decrypt with the private key from the password manager (saved to a temp file, deleted after)
age -d -i residio-backup.agekey -o restore.dump <YYYY-MM-DD>.dump.age

# 3. The archive must be readable before anything is restored
pg_restore --list restore.dump | head

# 4. Restore into the scratch database
createdb -h localhost -p 54329 -U postgres scratch
pg_restore --no-owner --no-privileges --exit-on-error=false \
  -h localhost -p 54329 -U postgres -d scratch restore.dump

# 5. Spot-check against the app: row counts of residents, invoices, payments
psql -h localhost -p 54329 -U postgres -d scratch \
  -c 'select count(*) from residents' -c 'select count(*) from invoices'
```

Restoring into plain PostgreSQL reports errors for Supabase-only roles and extensions
(`anon`, `authenticated`, `pg_graphql`, ...). Those are expected; the `public` schema data is
what must come back. Delete `restore.dump` and the scratch database afterwards.

For the files mirror, `rclone ls` through a crypt remote built with the same two passwords
(`rclone config`, type `crypt`, remote `r2:<bucket>/files/prod`) lists and downloads the files.

### Checklist

- [ ] The 13 secrets above exist in GitHub Actions secrets
- [ ] age keypair generated; private key is in the password manager and one other place outside GitHub
- [ ] Backup Database run manually for `both`; both jobs green; objects visible in R2
- [ ] **Owner has run the test restore above once and the data came back. #415 is not done until this is ticked.**
- [ ] A second test restore is scheduled for three months out
- [ ] R2 lifecycle rule "abort incomplete multipart uploads after 1 day" set on the backup bucket (see "Retention and size guards")

## KVM setup runbook (Coolify)

Owner-run, phase by phase. Coolify's UI labels drift between versions; treat them as approximate.
Never paste a real secret into this file: the repository is public.

### Phase 0: prerequisites

- Domain on Cloudflare DNS. Names used below: `app.<domain>` (prod), `stage.<domain>` (stage),
  `coolify.<domain>` (dashboard).
- Both Supabase projects' URL, anon key and service-role key (Dashboard, Settings, API).
- Password manager ready for new secrets: `CRON_SECRET`, `DATA_ENCRYPTION_KEY`,
  `GMAIL_TOKEN_ENCRYPTION_KEY` (each per environment).

### Phase 1: secure the host

1. Ubuntu 24.04 LTS (Hostinger's "Ubuntu + Coolify" template is fine and skips step 5).
2. Non-root sudo user with an SSH key; `PasswordAuthentication no` and
   **`PermitRootLogin prohibit-password`** (not `no`). Coolify manages its own host by SSHing
   from its container to `root@host.docker.internal` with its own key; `PermitRootLogin no`
   breaks the built-in `localhost` server ("Permission denied (publickey)"). Root stays
   key-only; keep `/root/.ssh/authorized_keys` to Coolify's key alone.
3. **Hostinger panel firewall, not only `ufw`**: Docker-published ports (Coolify's 8000, 6001,
   6002) bypass `ufw`. Allow inbound 22, 80, 443 only.
4. 4 GB swap so Next.js build spikes cannot take prod down.

### Phase 2: install and claim Coolify

5. `curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash` (skip on the template).
6. **Register the admin immediately**, through an SSH tunnel (the first visitor becomes admin and
   8000 is firewalled): `ssh -L 8000:localhost:8000 <user>@<vps-ip>`, open
   `http://localhost:8000`. Enable 2FA on the account.

### Phase 3: Cloudflare One for the dashboard

7. Zero Trust, Networks, Tunnels: create a tunnel; install `cloudflared` on the VPS as instructed.
8. Tunnel public hostnames, **in this order**: `coolify.<domain>` path `terminal/ws` to
   `http://localhost:6002`; `realtime.<domain>` to `http://localhost:6001`; `coolify.<domain>` to
   `http://localhost:8000`. Then set `PUSHER_HOST=realtime.<domain>` and `PUSHER_PORT=443` in
   `/data/coolify/source/.env` (root-owned: use `sudo -i`) and re-run the installer.
   In the installed version (2026-10) realtime and terminal run **inside the `coolify`
   container**, which publishes 6001-6002; there is no separate `coolify-realtime` container.
9. Zero Trust, Access, Applications, Self-hosted: `coolify.<domain>`, policy allowing only the
   owner's email (one-time PIN or Google). `realtime.<domain>` gets a **Bypass** policy instead:
   the browser's background websocket cannot complete an Access login on a second hostname, so
   gating it breaks live updates ("Cannot connect to real-time service"). Private channels are
   still authorised by Coolify's own backend, which stays behind Access and 2FA. A second
   Bypass application covers `coolify.<domain>/webhooks` so GitHub can trigger deploys.
10. Coolify Settings: instance domain `https://coolify.<domain>`.

### Phase 4: source and project

11. Use only the built-in `localhost` server (IP `host.docker.internal`, user `root`, port 22,
    Coolify's own key). Do not add the VPS again as a second server: `localhost` inside the
    Coolify container is the container itself, not the host.
    Coolify Sources: GitHub App scoped to `meggarmind/RESIDIO` only.
12. Project `Residio` with environments `production` and `staging`.

### Phase 5: the two applications

Both: Application, port 3000 (the image has its own `HEALTHCHECK`). They differ in how the
image arrives. Prod is built on the KVM from the repo. Stage is not built on the KVM at all:
CI builds the image and Coolify only pulls it (#1114).

| Setting | residio-prod | residio-stage-image |
|---|---|---|
| Application type | Dockerfile build pack, repo `meggarmind/RESIDIO` | Docker Image: `ghcr.io/meggarmind/residio-stage:<sha>` (private registry); CI sets the tag |
| Domain | `https://app.<domain>` | `https://stage.<domain>` |
| Branch | `master` | none (no source build; CI builds from `stage`) |
| Build | on the KVM | none on the KVM |
| Auto-deploy on push | **Off**: deploy by hand after any migration (`CORE.md` §11) | **Off in Coolify**: `.github/workflows/stage-image.yml` builds a GHCR image and deploys it on every push to `stage` (#1114). The old source-built `residio-stage` is stopped and kept only for rollback |
| Supabase | Residio_Prod | Residio_Stage |
| Memory limit | ~2 GB | ~1 GB |

Build variables (public; inlined into the browser bundle). On **Prod** they are Coolify build
variables. On **Stage** they are build args of the CI image build, taken from the `STAGE_*`
repository variables in `stage-image.yml` (`STAGE_SUPABASE_URL`, `STAGE_SUPABASE_ANON_KEY`,
`STAGE_APP_URL`, `STAGE_PAYSTACK_PUBLIC_KEY`), and Stage's Coolify runtime environment holds the
runtime secrets below plus the same public `NEXT_PUBLIC_*` values, which `preflight-env.mjs`
reads at startup. The variables are: `NEXT_PUBLIC_ENV_MODE=cloud`,
`NEXT_PUBLIC_SUPABASE_URL_CLOUD`, `NEXT_PUBLIC_SUPABASE_ANON_KEY_CLOUD`, `NEXT_PUBLIC_SITE_URL`,
`NEXT_PUBLIC_APP_URL` (both the **https** origin), `NEXT_PUBLIC_PAYSTACK_KEY`,
`NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY`.

Build identity variables (public; do not set by hand): `NEXT_PUBLIC_APP_VERSION` (the release
the commit belongs to: `v0.5.0` on the release, and on the `stage` commit it merged;
`v0.5.0-3-gabc1234` three commits further along `stage`), `NEXT_PUBLIC_GIT_SHA` and
`NEXT_PUBLIC_APP_ENV` (`production` or `staging`). They are **set by CI**
(`.github/workflows/coolify-version.yml`), not by hand. Prod's values are set on each release
tag, and CI never deploys Prod. Stage's are build args of the image `stage-image.yml` builds on
each push to `stage` (#1114), and that workflow deploys it. Setup and secrets:
`docs/agents/branching.md` (Build version variables). The admin sidebar footer and
`GET /api/version` show them. The footer shortens a build past a release to `v1.0.341-dev`
(release patch plus commits since) and puts the full `v1.0.0-341-g3bafb1d` in its tooltip (#633);
until CI sets them it shows `dev`, with `dev · unknown` in the tooltip.

Runtime secrets (build variable off; different values per environment):
`SUPABASE_SERVICE_ROLE_KEY_CLOUD`, `CRON_SECRET`, `DATA_ENCRYPTION_KEY`,
`GMAIL_TOKEN_ENCRYPTION_KEY`, `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_REPLY_TO_ADDRESS`,
`PAYSTACK_SECRET_KEY`, `PAYSTACK_WEBHOOK_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_REDIRECT_URI`, `TERMII_API_KEY`, `TERMII_SENDER_ID`, `WHATSAPP_*` if used. Template and
comments: `.env.docker.example`. Generate keys with
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and store them in the
password manager first. **Never rotate `DATA_ENCRYPTION_KEY` once data exists.**

### Phase 6: DNS, TLS, auth redirects

13. Cloudflare DNS: `A` records `app` and `stage` to the VPS IP, **DNS-only (grey cloud)**.
14. Traefik obtains Let's Encrypt certificates automatically once DNS resolves.
15. Supabase, each project, Authentication, URL Configuration: Site URL and redirect URL
    `https://<host>/auth/callback`.
16. Google Cloud Console OAuth client: the same callback URLs.
17. Resend sending domain verified (#272).

### Phase 7: run

18. Deploy stage; watch the build log (expect 3-6 min on 2 vCPU).
19. Smoke test stage: login, dashboard, System, Cron Status.
20. Deploy prod. It is unusable until #280 (configuration) and the owner's seeding task have run.
21. Prod scheduled tasks (#399). Stage scheduled tasks too, once the communications override
    contacts are set on Stage (#718).
22. Coolify notifications (email) for failed deployments and scheduled tasks.
23. Coolify's own database backup to the R2 bucket (separate prefix): it holds every secret above.

Order: 1, 2, 3 first, so the dashboard is never exposed; then 4, 5, 6; stage; prod after #280;
then #399 and #415.

## Review before starting (2026-10-10)

### Conflicts with the 2026-09-19 plan (#269), resolved 2026-10-10 in favour of this plan

| Topic | #269 says | These notes say |
|---|---|---|
| Deploy layer | No Coolify; Caddy from `deploy/caddy/` | Coolify + Traefik |
| Stage | On the laptop, ad-hoc `cloudflared` | On the KVM, always on |
| Image | One image, Supabase config injected at runtime, published to GHCR | Built per environment on the VPS |
| Cron | GitHub Actions `schedule:`, prod only | Coolify scheduled tasks |

Resolved: this plan wins. #395 (runtime config) and #398 (GHCR publish and compose files) are
closed as superseded; #399 is repurposed to Coolify scheduled tasks. Because each environment is
built separately, a stage image is never promoted to prod; prod is rebuilt from the same commit.

### Measured state of the two Supabase projects

| | Residio_Prod | Residio_Stage |
|---|---|---|
| Status | ACTIVE_HEALTHY (unpaused) | ACTIVE_HEALTHY |
| DB size | 18 MB | 35 MB |
| Migrations applied | 42 (baseline + 8) | 220 |
| Missing vs repo | `20260922100000_add_chatmaid_whatsapp_provider` | none |
| auth users / profiles | 0 / 0 | 6 / 3 |
| app_roles / app_permissions / role_permissions | **0 / 1 / 0** | 8 / 105 / 398 |
| system_settings | **0** | 62 |
| houses / residents | 0 / 0 | 179 / 194 |
| storage objects | 0 | 234 |

Prod is schema-only. No one can log in or hold a permission until #280 (configuration and roster
copy) and #282 (cut-over) are done. Stage holds what appears to be the real estate roster, so it is
personal data and needs the same care (and backup) as prod.

### Cloudflare One for the dashboard

- Run `cloudflared` on the VPS; publish the dashboard hostname through the Tunnel behind an Access
  policy (email OTP or Google for the owner only). The dashboard port then never opens on the
  firewall. If Coolify is kept, its websocket ports (6001/6002, realtime and terminal) need routes
  too, or the in-browser terminal and live logs break.
- **Trap:** Cloudflare's proxy (orange cloud) cuts a request off after **100 seconds** (error 524) on
  free plans. The admin `generate-invoices` route allows 300 s. Either keep the app hostname
  DNS-only (grey cloud), or make long jobs asynchronous. Cron jobs called on `127.0.0.1` or from
  GitHub straight to the origin are unaffected only if they do not pass through the proxy.
- If the app hostname is proxied, use SSL mode **Full (strict)**.

### Cloudflare secrets

Cloudflare's Secrets Store and Worker secrets are only readable by Cloudflare's own products
(Workers, AI Gateway). A container on the VPS cannot fetch them, so they cannot feed the app.
Recommended: password manager as the master copy; app secrets in the deploy layer's environment
(Coolify's encrypted variables, or a root-only `.env` read by `docker compose` under #269); backup
secrets in GitHub Actions secrets. Secrets the app reads (from the code): `CRON_SECRET`,
`DATA_ENCRYPTION_KEY`, `GMAIL_TOKEN_ENCRYPTION_KEY`, `GOOGLE_CLIENT_SECRET`, `PAYSTACK_SECRET_KEY`,
`PAYSTACK_WEBHOOK_SECRET`, `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY(_CLOUD)`, `TERMII_API_KEY`,
`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`. `DATA_ENCRYPTION_KEY`
encrypts data at rest: losing it loses that data, so it belongs in the password manager too.

## Open items

- **Coolify realtime banner (deferred by owner 2026-10-11).** "Cannot connect to real-time service"
  persists after the `realtime.<domain>` Bypass. Server side measured healthy (6001-6002 published
  by `coolify`, `PUSHER_HOST`/`PUSHER_PORT` set). Not yet run: `curl` status of
  `https://realtime.<domain>/` from outside, `curl localhost:6001` on the host, the browser's `wss://`
  URL and status (DevTools, Network, WS), and `grep PUSHER docker-compose.prod.yml`. Impact: live
  logs and status need a page refresh; deploys still work.

- Hostinger KVM 2 confirmed and the plan decided 2026-10-10; recorded on #269, #262 and #264.
- Confirm current Hostinger pricing and what VPS snapshot/backup is included.
- Backup workflow and stage keep-awake: #415.
- Coolify scheduled tasks for the 10 scheduled crons: #399 (repurposed); Stage tasks behind the
  communications override: #713, #718.
- Prod is one migration behind stage (`20260922100000_add_chatmaid_whatsapp_provider`) and holds
  no configuration or roster yet. #280 (configuration only), the owner's separate seeding task
  (houses, residents, financial history), then #282.

## Sources

- Vercel cron limits: https://vercel.com/docs/cron-jobs/usage-and-pricing
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- OpenNext on Cloudflare: https://opennext.js.org/cloudflare
- Oracle Always Free: https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm
- Oracle free-tier change: https://infoq.com/news/2026/07/oracle-cloud-free-tier-limits/
- Hostinger pricing: https://findstack.com/resources/hostinger-vps-for-ai-agents
