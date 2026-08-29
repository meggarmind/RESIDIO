# Google Sign-In Setup

How to enable "Continue with Google" on the Residio login and register pages.

Google is the only social provider wired up — X, LinkedIn and Facebook were removed
deliberately, since each needs its own app registration and review for near-zero return on
an admin dashboard. Email and password remain available as the break-glass path.

**Time required:** about 15 minutes. **You need:** a Google account and access to the
Supabase project.

---

## The one thing worth understanding first

The redirect chain is:

```
Your app  →  Google  →  Supabase  →  Your app (/auth/callback)
```

Google hands the user back to **Supabase**, never directly to your app. That is why the
redirect URI you register in Google Cloud Console is a Supabase URL, and why it is
**identical for local development and production**. You register it once and never touch it
again.

Only Supabase needs to know about `localhost` and your production domain, and it holds both
at the same time in an allow-list. Nothing gets swapped at deploy time.

| Setting | Where | Value |
|---------|-------|-------|
| Authorized redirect URI | Google Cloud Console | `https://kzugmyjjqttardhfejzc.supabase.co/auth/v1/callback` |
| Site URL | Supabase | Your production origin |
| Redirect URLs | Supabase | Localhost **and** production, both listed |

---

## Part A — Google Cloud Console

### A1. Create or select a project

1. Go to <https://console.cloud.google.com/>.
2. Use the project picker in the top bar → **New Project**.
3. Name it something recognisable, e.g. `Residio`. Create it, then make sure it is the
   selected project before continuing.

### A2. Configure the OAuth consent screen

Navigate to **APIs & Services → OAuth consent screen**.

1. **User Type:** choose **External**. (Internal only exists if you have Google Workspace,
   and would restrict sign-in to your own workspace domain — wrong for residents on
   personal Gmail accounts.)
2. **App information:**
   - App name: `Residio` — this is what residents see on the consent screen, so use the
     name they will recognise.
   - User support email: your address.
   - App logo: optional.
3. **App domain:** optional while testing. When you publish you may be asked for a homepage
   and privacy policy URL.
4. **Developer contact information:** your email address. Required.
5. **Scopes:** click **Add or Remove Scopes** and select only:
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
   - `openid`

   These are **non-sensitive** scopes. That matters: it means publishing your app does
   **not** require Google's verification review. Do not add anything else.
6. Save and continue through to the summary.

### A3. Publish the consent screen

Still on **OAuth consent screen**, look at **Publishing status**.

> **Do not skip this.** While the status is **Testing**, only email addresses you have
> explicitly added under *Test users* can sign in — everyone else gets
> `403: access_denied`. Sessions also expire after 7 days.

Click **Publish app** and confirm. Because you selected only non-sensitive scopes, this
takes effect immediately with no review.

*If you would rather trial it with a handful of people first:* leave it in Testing and add
their Google addresses under **Test users**. Just remember to publish before the estate-wide
rollout.

### A4. Create the OAuth client

Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**.

1. **Application type:** **Web application**.
2. **Name:** `Residio Web` (internal label only, never shown to users).
3. **Authorized JavaScript origins:** leave empty. The browser never calls Google directly
   from your domain in this flow.
4. **Authorized redirect URIs:** click **Add URI** and enter exactly:

   ```
   https://kzugmyjjqttardhfejzc.supabase.co/auth/v1/callback
   ```

   Exactly this — no trailing slash, no `www`, `https` not `http`. A mismatch of even one
   character produces `redirect_uri_mismatch` at sign-in.

   > If you ever add a **separate** Supabase project for staging, add that project's
   > callback URL here as a second entry. One Google client can serve several projects.

5. **Create.** Copy the **Client ID** and **Client secret** — you need both in Part B. The
   secret can be re-displayed later, so it is not lost if you close the dialog.

---

## Part B — Supabase

### B1. Enable the Google provider

1. Open the project dashboard for `kzugmyjjqttardhfejzc`.
2. **Authentication → Sign In / Providers → Google**.
3. Toggle **Enable Sign in with Google** on.
4. Paste the **Client ID** and **Client Secret** from step A4.
5. Leave *Skip nonce check* off.
6. **Save.**

### B2. Set the URL configuration

**Authentication → URL Configuration.** Two separate settings — the distinction matters:

**Site URL** (a single value) — the fallback Supabase redirects to when a request's
redirect target is not on the allow-list. Set it to your **production** origin, not
localhost:

```
https://<your-production-domain>
```

**Redirect URLs** (an allow-list, wildcards permitted) — add **both** entries. They coexist
permanently; nothing is swapped when you deploy:

```
http://localhost:3000/**
https://<your-production-domain>/**
```

If you deploy previews on Vercel, add a team-scoped pattern as well:

```
https://residio-*-<your-team>.vercel.app/**
```

> Avoid a bare `https://*.vercel.app/**` — that would allow-list every Vercel deployment on
> the internet as a valid place to send an auth token.

Wildcard semantics: `*` matches within one path segment, `**` matches across separators.

---

## Part C — Application configuration

Add to `.env.local`, and to your hosting provider's environment variables:

```bash
NEXT_PUBLIC_SITE_URL=https://<your-production-domain>
```

This is what the app uses to build `${NEXT_PUBLIC_SITE_URL}/auth/callback`. Leave it unset
locally if you prefer — the code falls back to `window.location.origin`, so local
development works with no configuration. Whatever value ends up being used must appear in
the Supabase **Redirect URLs** list from B2.

Restart `npm run dev` after changing it; `NEXT_PUBLIC_*` variables are baked in at build
time.

---

## Part D — Create the first Super Administrator

Signing in does not grant access. Every new account — Google or password — is created as
**pending** with no role, and is denied by every RLS policy until an administrator approves
it. Which leaves a chicken-and-egg problem for the very first admin.

1. Go to `/login` and click **Continue with Google**. You will land on the
   **"Waiting for approval"** page. That is correct — it proves the gate works.
2. Promote that account from a terminal:

   ```bash
   node scripts/promote-super-admin.mjs you@example.com
   ```

   Use the same address as the Google account you just signed in with. The script reads
   `SUPABASE_SERVICE_ROLE_KEY_CLOUD` from `.env.local`, sets the account to `super_admin`,
   marks it active, and writes an audit entry.
3. Sign out and back in. You should land on `/dashboard` with the full sidebar.

From this point everything else happens in the UI — you can approve accounts and appoint
other administrators, including other super admins, from
**Settings → Roles → Pending Accounts**.

---

## Part E — Verify

| # | Check | Expected |
|---|-------|----------|
| 1 | Click **Continue with Google** on `/login` | Google consent screen shows "Residio" |
| 2 | Sign in with an unrelated Google account | Lands on `/pending-approval`, no sidebar |
| 3 | With that account, visit `/residents` directly | Bounced back to `/pending-approval` |
| 4 | As super admin: **Settings → Roles → Pending Accounts** | The account is listed, provider shown as "Google" |
| 5 | Approve it with a role | That user reloads into `/dashboard` or `/portal` |
| 6 | Reject a second account with a reason | User is signed out and shown the reason |
| 7 | **Settings → Audit Logs** | Approve and reject entries recorded against the actor |
| 8 | Sign in with `admin@residio.test` and a password | Still works — break-glass path intact |

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `redirect_uri_mismatch` | The URI in A4 does not match character for character | Re-check for a trailing slash, `http` vs `https`, or a typo in the project ref |
| `403: access_denied`, "app has not completed verification" | Consent screen still in **Testing** and this address is not a test user | Publish the app (A3), or add the address under *Test users* |
| Sign-in succeeds but lands on the production URL from localhost | `http://localhost:3000/**` missing from **Redirect URLs** | Add it in B2. Supabase falls back to Site URL when the target is not allow-listed |
| Redirected to `/login?error=auth_failed` | Code exchange failed, usually a wrong client secret | Re-copy the secret in B1 |
| Redirected to `/login?error=oauth_cancelled` | The user dismissed the Google consent screen | Not an error |
| Everyone lands on `/pending-approval`, including you | Working as designed | Approve them, or run the Part D script for the first admin |
| Approved user sees an empty dashboard | Approved but holding a role with no permissions | Check the assigned role under **Settings → Roles** |
| `Database error saving new user` | The `handle_new_user` trigger failed | Confirm the `20260829*` migrations are applied |

---

## Related

- [`docs/security/access-control.md`](../security/access-control.md) — the approval
  lifecycle and how it is enforced at the database layer
- [`.env.example`](../../.env.example) — every environment variable the app reads
- `scripts/promote-super-admin.mjs` — the bootstrap script from Part D
