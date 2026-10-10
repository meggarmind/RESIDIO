# Hosting exploration (working notes, NOT a decision)

> **Status: exploring.** Nothing here is locked in. The owner will say explicitly when a choice
> becomes a decision. Until then, `docs/deployment/docker.md` and #264/#269 remain the recorded
> hosting decision, and no issue should be filed or work started from these notes.

Constraint driving everything: the project is entirely self-funded, so the goal is the lowest
recurring cost that keeps the service running long term.

---

## Owner preferences and choices so far (2026-10-10)

| # | Topic | Owner's position | Status |
|---|---|---|---|
| 1 | App hosting | **Hostinger KVM 2** (2 vCPU, 8 GB, 100 GB NVMe), one VPS running **both prod and stage** | Preference, not locked |
| 2 | Deployment layer | **Coolify** (Dockerfile build pack, Traefik), as already documented in `docker.md` | Consistent with #264/#269 |
| 3 | Database / auth / storage | **Stay on Supabase** (free plan). Neon rejected after measurement, see below | Preference, not locked |
| 4 | Supabase Pro ($25/mo) | **Not affordable** just for backups | Owner constraint |
| 5 | Backup destination | **Cloudflare R2** | Chosen |
| 6 | Backup encryption key | Held by the owner in their **password manager** (copy outside GitHub) | Chosen |
| 7 | Backup retention | Proposed: 30 daily + 12 monthly | Proposed, not confirmed |
| 8 | Dev environment | Stays on local PCs | Owner statement |

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
2. Copy all storage buckets through Supabase's S3-compatible storage endpoint.
3. Encrypt the archive (key held in the owner's password manager; the workflow holds only what
   it needs to encrypt).
4. Upload to a private **Cloudflare R2** bucket; lifecycle rules apply retention (proposed 30
   daily + 12 monthly).

Weekly: the same connection against `Residio_Stage` to keep it awake.

Known traps:

- Supabase's free direct connection is IPv6-only and GitHub-hosted runners have no IPv6. Use the
  **session pooler** (port 5432). The transaction pooler (6543) does not work with `pg_dump`.
- The job fails while prod is paused. Resume prod first.
- Do a test restore into a scratch database once, then every few months.

Secrets needed in GitHub: prod (and stage) session-pooler connection string, Supabase storage S3
credentials, R2 access key / secret / bucket / endpoint, encryption public key or passphrase.

## Open items before anything becomes a decision

- Owner to confirm the hosting choice (Hostinger KVM 2) and authorise recording it on #264/#269.
- Confirm backup retention.
- Confirm current Hostinger pricing and what VPS snapshot/backup is included.
- Then: file issues (backup workflow, stage keep-awake, Coolify scheduled tasks for the 9 crons).

## Sources

- Vercel cron limits: https://vercel.com/docs/cron-jobs/usage-and-pricing
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- OpenNext on Cloudflare: https://opennext.js.org/cloudflare
- Oracle Always Free: https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm
- Oracle free-tier change: https://infoq.com/news/2026/07/oracle-cloud-free-tier-limits/
- Hostinger pricing: https://findstack.com/resources/hostinger-vps-for-ai-agents
