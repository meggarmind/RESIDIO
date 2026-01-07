# Vercel Deployment Guide

This guide covers deploying Residio to Vercel with proper cron job configuration.

## Prerequisites

- Vercel account (Pro plan recommended for 5+ cron jobs)
- GitHub repository connected
- All environment variables from `.env.local`

## Quick Start

### 1. Link Project to Vercel

```bash
# Install Vercel CLI if not already installed
npm i -g vercel

# Link your project (run from project root)
vercel link
```

Follow the prompts to:
- Select your Vercel account/team
- Link to existing project or create new one

### 2. Configure Environment Variables

In the Vercel Dashboard, go to **Project Settings > Environment Variables** and add:

#### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | `https://xxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key | `eyJ...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) | `eyJ...` |
| `CRON_SECRET` | Secret for authenticating cron jobs | Generate secure random string |
| `RESEND_API_KEY` | Email service API key | `re_...` |

#### Optional Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_APP_URL` | Public URL of deployed app |
| `ADMIN_EMAIL` | Email for admin alerts |

#### Generating CRON_SECRET

Generate a secure random string for `CRON_SECRET`:

```bash
openssl rand -hex 32
```

**Important**: Use the same `CRON_SECRET` value in both Vercel and GitHub Actions secrets.

### 3. Deploy

```bash
# Deploy to production
vercel --prod
```

Or push to your `main` branch for automatic deployment.

### 4. Verify Cron Jobs

After deployment:

1. Go to **Vercel Dashboard > Project > Settings > Cron Jobs**
2. Verify all 5 cron jobs are active:
   - `/api/cron/generate-invoices` - Daily at 6 AM UTC
   - `/api/cron/payment-reminders` - Daily at 8 AM UTC
   - `/api/cron/notifications` - Every 5 minutes
   - `/api/cron/announcements` - Every 15 minutes
   - `/api/cron/daily-summary` - Daily at 7 PM UTC

## Cron Job Configuration

The `vercel.json` file defines cron schedules:

```json
{
  "crons": [
    {
      "path": "/api/cron/generate-invoices",
      "schedule": "0 6 * * *"
    },
    {
      "path": "/api/cron/payment-reminders",
      "schedule": "0 8 * * *"
    },
    {
      "path": "/api/cron/notifications",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/cron/announcements",
      "schedule": "*/15 * * * *"
    },
    {
      "path": "/api/cron/daily-summary",
      "schedule": "0 19 * * *"
    }
  ]
}
```

### Cron Authentication

All cron endpoints require the `CRON_SECRET` header:

```
Authorization: Bearer <CRON_SECRET>
```

Vercel automatically adds this header when calling cron endpoints.

## GitHub Actions Backup (Optional but Recommended)

A backup cron workflow runs daily via GitHub Actions in case Vercel cron fails.

### Configure GitHub Secrets

In your GitHub repository, go to **Settings > Secrets and variables > Actions** and add:

| Secret | Description |
|--------|-------------|
| `APP_URL` | Your deployed Vercel URL (e.g., `https://residio.vercel.app`) |
| `CRON_SECRET` | Same value as Vercel's `CRON_SECRET` |

The workflow file is at `.github/workflows/backup-cron-invoices.yml`.

### How It Works

1. Runs daily at 7 AM UTC (1 hour after Vercel cron)
2. Checks `/api/health/cron-status` endpoint
3. If invoice generation is "critical" (overdue), triggers backup generation
4. Otherwise, does nothing (Vercel cron worked)

### Manual Trigger

To manually trigger the backup cron:

1. Go to **GitHub > Actions > Backup Cron - Invoice Generation**
2. Click **Run workflow**
3. Select branch and click **Run workflow**

## Monitoring

### Health Check Endpoint

Check system health at:

```
GET /api/health/cron-status
```

Returns status of all cron jobs:
- `healthy` - Job ran as expected
- `warning` - Job ran with errors
- `critical` - Job is overdue

### Dashboard Widget

Super admins see the **System Health** card on the dashboard showing:
- Status of each cron job
- Last run time
- Any errors or warnings

### Email Alerts

Admin alerts are sent when:
- Invoice generation encounters errors
- Critical failures in cron jobs

Configure `ADMIN_EMAIL` to receive these alerts.

## Vercel Plan Considerations

| Plan | Cron Jobs | Notes |
|------|-----------|-------|
| Hobby (Free) | 2 max | Not sufficient for Residio |
| Pro | 40 max | Recommended |
| Enterprise | Unlimited | |

Residio requires 5 cron jobs, so Pro plan or higher is recommended.

## Troubleshooting

### Cron Jobs Not Running

1. Check Vercel Dashboard > Settings > Cron Jobs
2. Verify `vercel.json` is in project root
3. Check deployment logs for errors
4. Verify `CRON_SECRET` is set correctly

### Invoice Generation Failed

1. Check `/api/health/cron-status` for status
2. Review `invoice_generation_log` table in Supabase
3. Check Vercel Function Logs for errors
4. Manually trigger via GitHub Actions backup

### Health Check Returns Errors

1. Verify Supabase connection
2. Check environment variables
3. Review server logs

## Rolling Back

If a deployment causes issues:

1. Go to **Vercel Dashboard > Deployments**
2. Find the last working deployment
3. Click **...** > **Promote to Production**

## Environment-Specific Deployments

### Preview Deployments

Each PR gets a preview deployment. Cron jobs do NOT run on preview deployments.

### Production vs Preview Environment Variables

You can set different values for Production vs Preview in Vercel:
- Click the variable
- Expand **Environment** dropdown
- Set different values per environment
