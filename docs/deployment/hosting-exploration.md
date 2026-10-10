# Hosting exploration (working notes, NOT a decision)

> **Status: exploring.** Only the items marked **Confirmed** below are decided. The owner will say explicitly when a choice
> becomes a decision. No issue should be filed or work started from these notes.
>
> **Correction (2026-10-10):** earlier versions of these notes said Coolify was the recorded
> decision. That was wrong. `docs/deployment/docker.md` is stale: the owner **abandoned Coolify on
> 2026-09-19** (#269, open), choosing a naked image from GHCR, Caddy for TLS, runtime-injected
> Supabase config, GitHub Actions cron, prod on the KVM and **stage on the laptop**. Several choices
> below conflict with #269 and need an explicit owner ruling. See "Review before starting".

Constraint driving everything: the project is entirely self-funded, so the goal is the lowest
recurring cost that keeps the service running long term.

---

## Owner preferences and choices so far (2026-10-10)

| # | Topic | Owner's position | Status |
|---|---|---|---|
| 1 | App hosting | **Hostinger KVM 2** (2 vCPU, 8 GB, 100 GB NVMe), one VPS running **both prod and stage** | **Confirmed** by owner 2026-10-10; host provisioned and ready |
| 2 | Deployment layer | **Coolify** (Dockerfile build pack, Traefik) | **Conflicts with #269** (Coolify abandoned 2026-09-19). Owner ruling needed |
| 3 | Database / auth / storage | **Stay on Supabase** (free plan). Neon rejected after measurement, see below | Preference, not locked |
| 4 | Supabase Pro ($25/mo) | **Not affordable** just for backups | Owner constraint |
| 5 | Backup destination | **Cloudflare R2** | Chosen |
| 6 | Backup encryption key | Held by the owner in their **password manager** (copy outside GitHub) | Chosen |
| 7 | Backup retention | **30 daily + 12 monthly** (database dumps) | Chosen |
| 8 | Dev environment | Stays on local PCs | Owner statement |
| 9 | Server hardening | SSH keys only, firewall 22/80/443; **admin dashboard reached through Cloudflare One** (Tunnel + Access) | Chosen 2026-10-10 |
| 10 | Secrets | Owner asked whether Cloudflare secrets can be used | Answered: not for the VPS app, see review |
| 11 | Residio_Prod | **Unpaused** by owner 2026-10-10 (verified ACTIVE_HEALTHY) | Done |

---

## Target layout

```
Hostinger KVM 2  (x86, 2 vCPU, 8 GB RAM, 100 GB NVMe)
└── Coolify (Traefik terminates TLS)
    ├── residio-prod   -> app.<domain>    -> Supabase project Residio_Prod
    ├── residio-stage  -> stage.<domain>  -> Supabase project Residio_Stage
    └── Scheduled tasks: the 9 cron routes from vercel.json, against prod
```

- Builds run on the VPS (8 GB covers Coolify ~1 GB, two app containers ~0.5-1 GB each, and a
  2-4 GB build spike). x86, so no ARM image concern.
- One image per environment: `NEXT_PUBLIC_*_CLOUD` values are inlined at build time
  (`docker.md`), so prod and stage each get their own build variables in Coolify.
- Keep the Coolify dashboard off the public internet (firewall rule or VPN) and keep it updated.
- Keep `.github/workflows/backup-cron-invoices.yml` as the safety net for invoice generation.

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
or deleted files moved to a dated folder rather than lost. Only the database is snapshotted
42 times.

### R2 free-tier sizing (10 GB-month storage)

Measured on Residio_Stage 2026-10-10: `public` schema 17 MB (whole DB 35 MB including system
catalogs); storage objects ~9.4 MB (233 email imports, 1 document). Prod was paused, so its size
is unknown; these are planning estimates.

| Scenario | DB dump (compressed) | x42 copies | Files mirror | Total |
|---|---|---|---|---|
| Today (stage-sized) | ~5 MB | ~0.2 GB | ~10 MB | **~0.2 GB** |
| Year one, generous growth (DB 150 MB, files 300 MB) | ~40 MB | ~1.7 GB | ~0.3 GB | **~2 GB** |
| Supabase free-plan ceiling (DB 500 MB, files 1 GB) | ~150 MB | ~6.3 GB | ~1 GB | **~7.3 GB** |

Every scenario fits in 10 GB because files are mirrored once. Copying files in full nightly
would not fit at the ceiling (~48 GB). Beyond the free tier R2 charges ~$0.015 per GB-month, and
egress (downloading for a restore) is free. Cloudflare may require a payment method to enable
R2; set a billing notification so any overage is noticed.

### Stage keep-awake

Weekly: a small query against `Residio_Stage` so it does not pause.

### Known traps


- Supabase's free direct connection is IPv6-only and GitHub-hosted runners have no IPv6. Use the
  **session pooler** (port 5432). The transaction pooler (6543) does not work with `pg_dump`.
- The job fails while prod is paused. Resume prod first.
- Do a test restore into a scratch database once, then every few months.

Secrets needed in GitHub: prod (and stage) session-pooler connection string, Supabase storage S3
credentials, R2 access key / secret / bucket / endpoint, encryption public key or passphrase.

## Review before starting (2026-10-10)

### Conflicts with the recorded plan (#269, decided 2026-09-19)

| Topic | #269 says | These notes say |
|---|---|---|
| Deploy layer | No Coolify; Caddy from `deploy/caddy/` | Coolify + Traefik |
| Stage | On the laptop, ad-hoc `cloudflared` | On the KVM, always on |
| Image | One image, Supabase config injected at runtime, published to GHCR | Built per environment on the VPS |
| Cron | GitHub Actions `schedule:`, prod only | Coolify scheduled tasks |

The runtime-config slice is a prerequisite under #269 for publishing an image. Whichever way the
owner rules, the losing documents must be updated so the next session is not misled.

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

## Open items before anything becomes a decision

- Hostinger KVM 2 confirmed 2026-10-10 (host ready). Not yet recorded on #264/#269; awaiting owner go-ahead.
- Confirm current Hostinger pricing and what VPS snapshot/backup is included.
- Then: file issues (backup workflow, stage keep-awake, Coolify scheduled tasks for the 9 crons).

## Sources

- Vercel cron limits: https://vercel.com/docs/cron-jobs/usage-and-pricing
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- OpenNext on Cloudflare: https://opennext.js.org/cloudflare
- Oracle Always Free: https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm
- Oracle free-tier change: https://infoq.com/news/2026/07/oracle-cloud-free-tier-limits/
- Hostinger pricing: https://findstack.com/resources/hostinger-vps-for-ai-agents
