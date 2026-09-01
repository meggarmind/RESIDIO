# Separate Audit Trail from Audit Log Settings

**Repo:** `C:\Users\ohiom\Claude\RESIDIO` (Next.js 16 / React 19 / Supabase, branch `master`)

## Context

`/settings/audit-logs` currently renders an operational **log viewer** (stats cards, filters, paginated table, CSV export) inside the Settings shell — `settings/layout.tsx` wraps it in an "Settings / Manage your estate settings and billing preferences" header plus the settings sidebar. So a forensic tool reads as a configuration screen, and it is buried three clicks deep under "Access & Security".

Meanwhile the genuine audit-log **configuration** (`audit_log_retention_days` + the destructive "Prune Data" action) lives somewhere else entirely: `settings/system/data/page.tsx`, mixed in with notification and search-history pruning.

The two concerns get separated:

- **Audit Trail** — a first-class top-level page at `/audit-trail`, its own module (`audit` permission category) and permissions, linked in the sidebar **System** section immediately **before** Settings.
- **Audit Log Settings** — `/settings/audit-logs` is repurposed as pure configuration (retention + prune), owned by Settings.

The trail's filters are also upgraded so an admin can drill to the right rows fast and share the result.

## Decisions taken

| Question | Decision |
|---|---|
| Where does config live | `/settings/audit-logs` becomes the Audit Log Settings page; retention + prune move there from `/settings/system/data` |
| Viewer route | `/audit-trail` |
| Permissions | New `audit` permission category (module) with `audit.view` / `audit.export`; `settings.manage_audit` for the config page |
| Filters | URL-synced + shareable, auto-apply (no Apply button) with removable active-filter chips, extra dimensions (entity ID, IP, destructive-only), sortable columns + page-size selector |

---

## 1. Database — new `audit` module and permissions

New migration `supabase/migrations/<ts>_add_audit_permission_category.sql`, following the two-file convention already used for `projects` / `personnel` (enum value must be committed before it can be referenced in the same transaction — see `20260116154500_add_projects_permission_category.sql` and `20260119000100_add_personnel_enum.sql`):

```sql
ALTER TYPE public.permission_category ADD VALUE IF NOT EXISTS 'audit';
```

Then `supabase/migrations/<ts+1>_seed_audit_permissions.sql`, copying the shape of `20260109000202_add_system_monitor_permissions.sql`:

- `audit.view` — "View Audit Trail"
- `audit.export` — "Export Audit Trail"
- `settings.manage_audit` — "Manage Audit Log Settings" (category `settings`)

Grant all three to `super_admin` and `chairman` via the `role_permissions` CROSS JOIN insert used in that file. `audit.view` should additionally go to whichever roles previously had `settings.view_audit_logs` — check `app_permissions`/`role_permissions` for that permission before deciding, so nobody silently loses access.

Leave `settings.view_audit_logs` in place (deprecated) to avoid breaking existing role grants; mark it with a comment in `action-roles.ts`.

## 2. Permission constants and route guards

`src/lib/auth/action-roles.ts`:
- Add `AUDIT_VIEW: 'audit.view'`, `AUDIT_EXPORT: 'audit.export'`, `SETTINGS_MANAGE_AUDIT: 'settings.manage_audit'` to `PERMISSIONS`.
- Add to `ROUTE_PERMISSIONS`: `'/audit-trail': [PERMISSIONS.AUDIT_VIEW]` and `'/settings/audit-logs': [PERMISSIONS.SETTINGS_MANAGE_AUDIT]`.

`src/middleware.ts`:
- Add `'/audit-trail': [ROUTE_PERMISSIONS['/audit-trail'][0]]` to `routePermissionConfig` (line ~8) and `'/audit-trail'` to `adminOnlyRoutes` (line ~25) so residents can't reach it.

## 3. Server actions — replace hardcoded role checks with permission checks

`src/actions/audit/get-audit-logs.ts` currently repeats this in `getAuditLogs`, `getAuditStats`, and `getAuditActors`:

```ts
if (!profile || !['admin', 'chairman'].includes(profile.role)) { ... }
```

Replace each with the existing helper `authorizePermission(PERMISSIONS.AUDIT_VIEW)` from `src/lib/auth/authorize.ts` — it already returns `{ authorized, userId, error }` and handles the unauthenticated case, so the manual `auth.getUser()` + `profiles` lookup in each function collapses to one call.

Extend `GetAuditLogsParams` (and the duplicated inline copies in `src/hooks/use-audit-logs.ts` and `src/components/audit/audit-export-button.tsx` — better: export the type once from a shared `src/types/audit.ts` and import it in all three) with:

- `ipAddress?: string` → `query.eq('ip_address', ...)` (column exists on `audit_logs`)
- `destructiveOnly?: boolean` → `query.in('action', ['DELETE','REJECT','DEACTIVATE','UNASSIGN'])`
- `sortBy?: 'created_at' | 'actor' | 'entity_type'` and `sortDir?: 'asc' | 'desc'` → replaces the hardcoded `.order('created_at', { ascending: false })` at line ~84
- `entityId` is already supported by the action; it just isn't exposed in the UI

Gate CSV export behind `PERMISSIONS.AUDIT_EXPORT` — either a dedicated `exportAuditLogs` action or an `authorizeAnyPermission` check; do not let `audit.view` alone pull an unbounded export.

## 4. New page — `/audit-trail`

Create `src/app/(dashboard)/audit-trail/page.tsx`. Move the body of the existing `settings/audit-logs/page.tsx` here, restyled as a top-level page rather than a settings pane: use `EnhancedPageHeader` / `EnhancedStatCard` / `EnhancedTableCard` from `src/components/dashboard/enhanced-stat-card.tsx`, matching how `src/app/(dashboard)/security/page.tsx` builds its header and stat row (including the `useVisualTheme()` modern/default branch).

Filter state moves into the URL. Reuse the pattern already in `src/app/(dashboard)/analytics/analytics-page-client.tsx:46-57` — `useSearchParams()` + `new URLSearchParams(...)` + `router.replace(url, { scroll: false })`. No new dependency (`nuqs` is not installed). Params: `q`, `entity`, `action`, `actor`, `from`, `to`, `entityId`, `ip`, `destructive`, `sort`, `dir`, `page`, `limit`. Read them on mount so a pasted link reproduces the exact view; page resets to 1 whenever a filter changes.

Wrap the client component in `<Suspense>` — `useSearchParams` forces a suspense boundary in the App Router.

## 5. Filter component rework

`src/components/audit/audit-filters.tsx` currently holds its own `useState` per field and only commits on the **Apply Filters** button (`handleApplyFilters`, line 54). Convert it to a controlled component:

- Props become `{ filters, onFiltersChange }` — the page owns state (which is now the URL). Delete the internal `useState` mirror and the `handleQuickActionFilter` duplicate that re-serialises every field by hand (lines 113-123).
- Selects/date pickers call `onFiltersChange` immediately; the search input debounces ~300ms. Remove the Apply button.
- Add an active-filter chip row below the controls: one removable badge per active filter showing its label (e.g. "Actor: Jane Doe ×"), plus the existing Clear-all. The `Badge` component is already imported.
- Add the three new controls: entity ID input, IP address input, and a "Destructive actions only" toggle. Keep the existing quick-action chips and Today / 7 / 30-day presets.

`src/components/audit/audit-logs-table.tsx`: add sortable `TableHead` buttons for Date / Actor / Entity Type driving `sortBy`/`sortDir`, and a 25 / 50 / 100 rows-per-page `Select` next to the existing pager. Keep the memoized `AuditLogRow`.

`src/components/audit/audit-export-button.tsx`: no structural change beyond consuming the shared params type and the new export permission.

## 6. Repurpose `/settings/audit-logs` as Audit Log Settings

Rewrite `src/app/(dashboard)/settings/audit-logs/page.tsx` to contain only configuration, lifting the two cards from `src/app/(dashboard)/settings/system/data/page.tsx`:

- **Retention** — `audit_log_retention_days` via `useSystemSettings` / `useUpdateSettings` (`src/hooks/use-settings.ts`). Note the page currently carries a "cleanup functionality will be implemented in a future release" caveat while `pruneSystemData` *does* delete audit logs older than 6 months — reconcile the copy so it states what actually happens, and ideally make `pruneSystemData` honour the configured retention value rather than its hardcoded 6 months.
- **Prune** — the `AlertDialog` + `pruneSystemData` block. Scope it to audit logs here, or keep the combined prune in `system/data` and link across; do not leave two buttons that silently do different things.
- Add a prominent link to `/audit-trail` ("View the audit trail →") so the old bookmark still leads somewhere useful.

`src/app/(dashboard)/settings/system/data/page.tsx`: strip the audit retention card and audit wording, leaving notification/search-history retention, and link to `/settings/audit-logs` for audit retention.

## 7. Navigation

`src/config/navigation.ts`:

```ts
const NAV_AUDIT_TRAIL: NavItem = {
  id: 'audit-trail',
  title: 'Audit Trail',
  href: '/audit-trail',
  icon: ScrollText,          // import from lucide-react
  permissions: [PERMISSIONS.AUDIT_VIEW],
};
```

Add it to the `system` section **before** `NAV_SETTINGS` (line ~276). `ADMIN_NAV_ITEMS`, `useNavigation`, `Sidebar`, and `MobileNav` all derive from `ADMIN_NAV_SECTIONS`, so no other nav file needs editing. Leave `MOBILE_NAV_IDS` unchanged unless you want it on mobile.

`src/config/settings-nav.ts`: change the "Access & Security" entry (line 79) from `{ title: "Audit Logs", href: "/settings/audit-logs", description: "View system activity" }` to `{ title: "Audit Log Settings", href: "/settings/audit-logs", description: "Retention and cleanup policy" }`.

## 8. Dashboard snippet links

Repoint both "view all" links from `/settings/audit-logs` to `/audit-trail`:

- `src/components/dashboard/recent-activity-card.tsx:203`
- `src/components/dashboard/modern-recent-activity.tsx:154`

Grep for any other `settings/audit-logs` reference (docs, tests, `src/app/(dashboard)/settings/page.tsx` tiles) and update.

---

## Verification

1. `npm run lint` and `npx tsc --noEmit` — the shared params type refactor touches three files, so type errors are the first signal.
2. Apply migrations against local Supabase (`npx supabase db reset` or `supabase migration up`), then confirm in SQL: `select name, category from app_permissions where category = 'audit';` and that `super_admin`/`chairman` have the grants in `role_permissions`.
3. `npm run dev`, sign in as an admin:
   - Sidebar **System** section shows **Audit Trail** above **Settings**.
   - `/audit-trail` loads with stats, table, and export.
   - Set several filters → URL updates → copy the URL, open in a new tab → identical filtered view. Reload and back/forward behave.
   - Removing a single chip removes only that filter; Clear resets all and returns page to 1.
   - Sort by Actor and Entity Type; switch page size 25→100 and confirm the total/pager stay correct.
   - Entity ID, IP, and destructive-only each narrow the result set.
   - `/settings/audit-logs` shows only retention + prune, with a working link to `/audit-trail`.
   - `/settings/system/data` no longer mentions audit retention.
   - Dashboard "Recent Activity → All Logs" lands on `/audit-trail`.
4. Sign in as a role without `audit.view` (e.g. a security officer): the sidebar item is absent and a direct hit on `/audit-trail` is redirected by middleware. A role with `audit.view` but not `audit.export` sees the table but the export is refused.
5. Run the existing suite — `src/lib/audit/__tests__/audit-formatter.test.ts` and `src/__tests__/dashboard-navigation-state.test.ts` (the latter asserts on nav structure and will likely need updating for the new item).
