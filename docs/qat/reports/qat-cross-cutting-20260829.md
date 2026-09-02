# QAT — Cross-Cutting Findings — 2026-08-29

Findings that belong to no single module — they were observed across the admin surface during the campaign and investigated separately.

| | |
|---|---|
| **Actor** | super_admin (`admin@residio.test`) |
| **Build** | `43579eb` (master) |
| **Evidence method** | Browser console, code inspection. |

---

## QAT-XC-D1 — A 15-second RBAC timeout silently strips every admin control for 5 minutes  [MEDIUM]

### What was observed

This error appeared in the browser console during normal admin navigation — not provoked, not under load:

```
[AuthProvider] RBAC fetch failed or timed out: {message: "RBAC fetch timeout"}
```

### The security question, answered first

The important question was whether the UI **fails open** (rendering controls the user is not entitled to) or **fails closed**. It fails **closed**, and there is no authorization bypass here.

On timeout, `permissions` never leaves its initial value at [auth-provider.tsx:285](src/lib/auth/auth-provider.tsx:285):

```ts
let permissions: string[] = [];
```

and every check consults only that array ([auth-provider.tsx:382](src/lib/auth/auth-provider.tsx:382)):

```ts
const hasPermission = useCallback((permission: string): boolean => {
  return profile?.permissions?.includes(permission) ?? false;
}, [profile?.permissions]);
```

`[].includes(x)` is `false` for every `x`, so all permission-gated UI is hidden rather than shown. No super-admin bypass or default-allow path exists in `src/lib/auth/`. Server-side `authorizePermission()` in `src/lib/auth/authorize.ts` is fully independent — it re-queries `profiles`, `app_roles`, `role_permissions` and `app_permissions` on every call and does not read client state, so it would still reject an unauthorized action regardless of what the client rendered.

**So: not a security defect.**

### The actual defect

The timeout is swallowed, and the resulting empty-permission profile is then **cached**.

The catch block logs and does nothing else ([auth-provider.tsx:333](src/lib/auth/auth-provider.tsx:333)):

```ts
} catch (err) {
  console.error('[AuthProvider] RBAC fetch failed or timed out:', err);
}
```

Execution falls through, and the profile — now carrying `permissions: []` and `role_name: null` — is committed and cached unconditionally ([auth-provider.tsx:352](src/lib/auth/auth-provider.tsx:352)):

```ts
setProfile(newProfile);
setCachedProfile(newProfile);
```

`setCachedProfile` writes to `sessionStorage` under `residio_profile_cache` with a **5-minute TTL** ([auth-provider.tsx:45-70](src/lib/auth/auth-provider.tsx:45)):

```ts
const PROFILE_CACHE_KEY = 'residio_profile_cache';
const PROFILE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
```

and `getCachedProfile()` serves it back on subsequent loads until that TTL expires.

### Impact

A single transient database hiccup — one query exceeding 15 seconds — leaves a super_admin with **no permission-gated controls anywhere in the application for up to five minutes**, persisting across page navigations because the degraded profile is cached.

Concrete examples of what silently disappears, all confirmed in code:

| Control | Location |
|---|---|
| "Correction" button and the invoice-correction dialog | [billing/[id]/page.tsx:127](src/app/(dashboard)/billing/[id]/page.tsx:127) |
| "View as Resident" impersonation link in the sidebar | [sidebar.tsx:340](src/components/dashboard/sidebar.tsx:340) |
| Document upload / edit / delete controls | [documents/page.tsx:28](src/app/(dashboard)/documents/page.tsx:28) |

The user is told nothing. There is no toast, no banner, no retry affordance — only a `console.error` that no administrator will ever see. From the operator's chair, the application simply stops offering the functions they had a moment ago, and keeps refusing for five minutes.

There is a workaround once the cause is known (wait out the TTL, or sign out and back in), which is why this is rated MEDIUM rather than HIGH. **If this timeout proves reproducible in production, it should be escalated** — it was observed here without any attempt to provoke it.

### Two things worth separating in any fix

1. **Caching a known-degraded profile is the bug that turns a 15-second blip into a 5-minute outage.** The failure path should not populate the cache.
2. **The failure is invisible.** Falling back to a degraded state without telling the user is what makes it hard to diagnose from the outside.

**Filed?** No — MEDIUM stays in the register per the campaign's issue policy.

---

## QAT-XC-O1 — `Router action dispatched before initialization` (observation)

```
Internal Next.js error: Router action dispatched before initialization.  __NEXT_ERROR_CODE: E668
```

Observed ten times in a single session across admin navigation. No user-visible symptom was traced to it. It is a Next.js-internal error and may be a dev-server/Fast-Refresh artifact rather than an application fault. Recorded so it is not lost, but **not** attributed to any defect — confirming it would require a production build, which this pass did not run.

---

## QAT-XC-O2 — First-load latency on data-heavy admin pages (observation)

Several pages take longer than 10 seconds to populate on first load against cloud Supabase from a dev server:

| Page | Time to populate |
|---|---|
| `/payments` | ~10s (spinner "Loading payments…" until then) |
| `/billing`, `/settings/billing/*` | ~10s |
| `/settings/notifications/templates`, `/schedules` | >3s |

This is a **dev-server observation, not a production performance measurement**, and no conclusion about production is drawn from it.

It is recorded for two reasons. First, it is the direct cause of six false "page is broken" reports during this campaign, so it matters methodologically. Second, a first-load spinner of ten seconds on the payments register is worth a look on its own terms — and it is plausibly related to QAT-XC-D1, since the same slow backend is what makes a 15-second RBAC timeout reachable at all.

---

## Method note

Every item on this page was verified directly against the source after being observed in the browser. Nothing here rests on a sub-agent's summary alone.
