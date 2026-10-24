# Admin portal page patterns

Part of the admin portal design guide (issue #1145). This file defines seven page archetypes. It maps every page under `src/app/(dashboard)/` to one archetype. It lists the required structure of each archetype.

Scope: the admin dashboard only (`CORE.md` section 3). Tokens come from `DESIGN.md`. Paths are relative to the repository root. Facts come from code on 2026-10-24.

## Shared frame

Every page renders inside `DashboardShell`. The shell gives the header, the breadcrumb and the main area.

- Main area padding is `p-4 md:p-6` (`src/components/dashboard/dashboard-shell.tsx:25`).
- The breadcrumb is part of the shell header (`src/components/dashboard/header.tsx:128`). A page cannot change its trail.
- `src/app/(dashboard)/loading.tsx` and `src/app/(dashboard)/error.tsx` are the fallbacks for all pages.
- Only 5 routes have their own `loading.tsx`: `dashboard`, `houses`, `houses/[id]`, `payments`, `residents`. Only `dashboard` has its own `error.tsx`.
- `settings/layout.tsx` adds a label, a sidebar and a mobile nav (`src/app/(dashboard)/settings/layout.tsx:8-22`). `system/layout.tsx` adds padding only (`src/app/(dashboard)/system/layout.tsx:8`).

Header components in use:

| Component | Title style | Source |
| --- | --- | --- |
| `EnhancedPageHeader` | `text-2xl sm:text-3xl font-bold tracking-tight` | `src/components/dashboard/enhanced-stat-card.tsx:250,271` |
| `SettingsPageHeader` | `text-lg font-medium`, breadcrumb, unsaved-changes bar | `src/components/settings/settings-page-header.tsx:73` |
| `CommandStrip` (home only) | `text-2xl font-semibold tracking-tight` | `src/components/dashboard/command-strip.tsx:144` |
| Own `<h1>` | 4 different sizes (see `## Divergences`) | per page |

## Page map

Columns: `Header` is the component that renders the `<h1>`. `Loading` and `Error` show `own` when the route folder has the file. Otherwise the root fallback applies (`root`).

| Route | Archetype | Header | Loading | Error |
| --- | --- | --- | --- | --- |
| `analytics` | `report` | `EnhancedPageHeader` | root | root |
| `analytics/announcements` | `report` | own `<h1>` in `analytics-client.tsx:248` | root | root |
| `announcements` | `registry` | `EnhancedPageHeader` | root | root |
| `announcements/new` | `form` | own `<h1>` in `AnnouncementForm` (`announcement-form.tsx:123`) | root | root |
| `announcements/[id]` | `record` | own `<h1>` (`page.tsx:164`) | root | root |
| `announcements/[id]/edit` | `form` | own `<h1>` in `AnnouncementForm` | root | root |
| `approvals` | `registry` | `EnhancedPageHeader` | root | root |
| `billing` | `registry` | `EnhancedPageHeader` | root | root |
| `billing/generate` | `wizard` | `EnhancedPageHeader` (wizard is a dialog) | root | root |
| `billing/[id]` | `record` | none (`CardTitle` "Invoice", `page.tsx:178`) | root | root |
| `dashboard` | `home` | `CommandStrip` | own | own |
| `documents` | `registry` | `EnhancedPageHeader` | root | root |
| `documents/[id]` | `record` | own `<h1>` (`page.tsx:204`) | root | root |
| `expenditure` | `registry` | `EnhancedPageHeader` via `expenditure-page-client.tsx:111` | root | root |
| `houses` | `registry` | `EnhancedPageHeader` | own | root |
| `houses/new` | `form` | `EnhancedPageHeader` | root | root |
| `houses/unverified` | `registry` | `EnhancedPageHeader` | root | root |
| `houses/[id]` | `record` | `HouseHeader` (`house-header.tsx:73`) | own | root |
| `notifications` | `registry` (card list, tabs) | `EnhancedPageHeader` | root | root |
| `payments` | `registry` | `EnhancedPageHeader` | own | root |
| `payments/new` | `form` | `PaymentPageHeader` (wraps `EnhancedPageHeader`) | root | root |
| `payments/import` | `wizard` | own `<h1>` (`page.tsx:143`) | root | root |
| `payments/import/[importId]` | `record` | own `<h1>` (`page.tsx:85`) | root | root |
| `payments/imports` | `registry` | own `<h1>` (`page.tsx:24`) | root | root |
| `payments/email-imports` | `registry` | own `<h1>` (`page.tsx:117`) | root | root |
| `payments/email-imports/[importId]` | `record` | own `<h1>` (`page.tsx:313`) | root | root |
| `payments/[id]` | `record` | own `<h1>` (`page.tsx:104`) | root | root |
| `personnel` | `registry` | `EnhancedPageHeader` | root | root |
| `projects` | `registry` (card grid) | `EnhancedPageHeader` via `projects-client.tsx` | root | root |
| `reports` | `wizard` (tabs: new, recent, schedules, archive, wallet-check) | `EnhancedPageHeader` via `reports-page-client.tsx:380` | root | root |
| `reports/financial-overview` | `report` | none (`<h3>`, `page.tsx:32`) | root | root |
| `residents` | `registry` | `EnhancedPageHeader` | own | root |
| `residents/new` | `form` | `EnhancedPageHeader` | root | root |
| `residents/[id]` | `record` | own `<h1>` (`page.tsx:282`; edit mode `:232`) | root | root |
| `security` | `home` (tabs: overview, verify, contacts, analytics, logs) | `EnhancedPageHeader` | root | root |
| `security/contacts` | `registry` | `EnhancedPageHeader` | root | root |
| `security/contacts/new` | `form` | none (`CardTitle`, `page.tsx:62`) | root | root |
| `security/contacts/[id]` | `record` | own `<h1>` (`page.tsx:230`) | root | root |
| `security/logs` | `registry` | own `<h1>` (`page.tsx:173,198`) | root | root |
| `security/verify` | `form` (one-step lookup) | own `<h1>` (`page.tsx:25,48`) | root | root |
| `settings` | `settings` (hub with search) | `SettingsPageHeader` | root | root |
| `settings/access` | `settings` | `SettingsPageHeader` | root | root |
| `settings/announcements` | `settings` | `SettingsMergedPage` | root | root |
| `settings/banking` | `settings` | `SettingsMergedPage` | root | root |
| `settings/billing` | `settings` | `SettingsMergedPage` | root | root |
| `settings/billing/profiles` | `settings` | none (card per profile) | root | root |
| `settings/debt-status` | `settings` | `SettingsMergedPage` | root | root |
| `settings/documents` | `settings` | `SettingsMergedPage` | root | root |
| `settings/email-integration` | `settings` | `SettingsPageHeader` | root | root |
| `settings/estate` | `settings` | `SettingsMergedPage` | root | root |
| `settings/groups` | `settings` | `SettingsPageHeader` | root | root |
| `settings/property` | `settings` | `SettingsMergedPage` | root | root |
| `settings/reminders` | `settings` | `SettingsMergedPage` | root | root |
| `settings/security` | `settings` | `SettingsMergedPage` | root | root |
| `settings/sending` | `settings` | `SettingsMergedPage` | root | root |
| `settings/system` | `settings` | `SettingsMergedPage` | root | root |
| `settings/two-factor` | `settings` | `SettingsPageHeader` | root | root |
| `settings/whatsapp` | `settings` | `SettingsPageHeader` | root | root |
| `settings/whatsapp-admin` | `settings` | `SettingsPageHeader` | root | root |
| `settings/wording` | `settings` | `SettingsMergedPage` | root | root |
| `system` | `settings` | delegated to `SystemDashboard` | root | root |
| `system/action-log` | `settings` (registry-shaped) | none (`<h3 text-lg>`, `page.tsx:70`) | root | root |
| `system/audit-logs` | `settings` (registry-shaped) | none (`<h3 text-lg>`, `page.tsx:55`) | root | root |
| `system/cron-status` | `settings` (monitor) | none (`<h3 text-lg>`, `page.tsx:79`) | root | root |
| `system/data-tools` | `settings` | none (`<h3 text-lg>`, `page.tsx:53`) | root | root |
| `system/notification-history` | `settings` (registry-shaped) | none (`<h3 text-lg>`, `page.tsx:10`) | root | root |
| `system/notification-queue` | `settings` (registry-shaped) | none (`<h3 text-lg>`, `page.tsx:11`) | root | root |

No page fits no archetype. Pages marked "registry-shaped" follow the `settings` mapping from the brief, but they need the `registry` toolbar and pagination rules.

### Redirect-only pages (37)

These pages hold no UI. They keep their `ROUTE_PERMISSIONS` entry because the redirect runs after middleware (`settings/streets/page.tsx:3`). Archetype: `unclassified`. Header, loading and error do not apply.

| Route | Redirects to |
| --- | --- |
| `settings/announcement-categories` | `/settings/announcements#categories` |
| `settings/appearance` | `/settings/estate#theme` |
| `settings/audit-logs` | `/system/audit-logs` |
| `settings/bank-accounts` | `/settings/banking#bank-accounts` |
| `settings/billing/development-levies` | `/settings/billing#levies` |
| `settings/billing/invoices` | `/settings/billing#invoices` |
| `settings/billing/late-fees` | `/settings/billing#late-fees` |
| `settings/branding` | `/settings/estate#logo` |
| `settings/comms-override` | `/settings/sending#testing` |
| `settings/cron-status` | `/system/cron-status` |
| `settings/data-management` | `/system/data-tools` |
| `settings/data-retention` | `/settings/system#retention` |
| `settings/document-categories` | `/settings/documents#categories` |
| `settings/document-taxonomy` | `/settings/documents#tags-fields` |
| `settings/email` | `/settings/sending#channels` |
| `settings/email/debug` | `/settings/sending#testing` |
| `settings/email-integration/config` | `/settings/email-integration` |
| `settings/estate-info` | `/settings/estate#details` |
| `settings/house-types` | `/settings/property#house-types` |
| `settings/maintenance` | `/settings/system#maintenance-mode` |
| `settings/message-templates` | `/settings/announcements#templates` |
| `settings/notification-queue` | `/system/notification-queue` |
| `settings/notifications` | `/settings/reminders` |
| `settings/notifications/history` | `/system/notification-history` |
| `settings/notifications/reminders` | `/settings/reminders#on-off` |
| `settings/notifications/reminders/schedule` | `/settings/reminders#schedule` |
| `settings/notifications/schedules` | `/settings/reminders` |
| `settings/notifications/templates` | `/settings/wording#email` |
| `settings/roles` | `/settings/access?tab=roles` or `rules` |
| `settings/security/categories` | `/settings/security#contact-categories` |
| `settings/streets` | `/settings/property#streets` |
| `settings/system/data` | `/settings/system#retention` |
| `settings/system/health` | `/system/cron-status` |
| `settings/system/maintenance` | `/settings/system#maintenance-mode` |
| `settings/transaction-tags` | `/settings/banking#tags` |
| `settings/user-roles` | `/settings/access?tab=administrators` |
| `system/accounts` | `/settings/access` |

Count check: 104 `page.tsx` files = 67 pages in the first table + 37 redirects.

## 1. `home` (triage)

Purpose: show what needs attention now. Link out to the registry that holds the work.

Required regions, top to bottom:

1. Offline or stale banner (`OfflineAdminBanner`).
2. Header strip with the greeting as the one `<h1>`, the "as of" time and the top actions (`CommandStrip`).
3. Lanes: `MoneyLane`, `PeopleLane`, `SecurityLane`. Each lane has a count, an alert state and one action.
4. Context blocks: `EstateMap`, `CommandRecentActivity`.

Primary action: inside each lane, gated by its write permission (`command-strip.tsx:68`). There is no page-level primary button.

Mobile at 375 px: one 12-column grid. Lanes span 4 columns from `lg` and stack below it (`dashboard-content.tsx:41-42`).

Best example: `src/app/(dashboard)/dashboard/dashboard-content.tsx:41-80`. The server page prefetches the snapshot and hydrates it, so lanes paint at once (`dashboard/page.tsx:14-27`). It has its own `loading.tsx`, `error.tsx` and a skeleton (`DashboardSkeleton`).

Worst divergence: `src/app/(dashboard)/security/page.tsx:96,181`. It calls itself an overview but uses `EnhancedPageHeader` plus five tabs. It mixes triage, a form (verify) and two registries on one route.

Rules:

- R-HOME-1. Show one `<h1>`. The greeting counts as the title.
- R-HOME-2. Use the shared grid and one gutter. Do not nest grids with their own gaps.
- R-HOME-3. Each lane shows a count, a state and one next action. Gate the action on its write permission.
- R-HOME-4. Prefetch the data on the server and hydrate it. Show a skeleton only when no snapshot exists.
- R-HOME-5. When a read fails, show an "unavailable" state in the lane. Do not show zero.
- R-HOME-6. Show a stale banner when data comes from the offline cache.
- R-HOME-7. Provide a route `error.tsx` that offers retry and a link back.

## 2. `registry` (list)

Purpose: a paginated, filterable list of one entity. The row opens the record.

Required regions, top to bottom:

1. Header: `EnhancedPageHeader` with title, description, icon, and the primary action in `actions` (`residents/page.tsx:25-37`).
2. KPI strip (optional): `RegistryKpiStrip` (`residents/page.tsx:40-48`). Only `residents` and `houses` use it.
3. Card: `EnhancedTableCard` wraps the toolbar and the list (`residents/page.tsx:51-55`).
4. Toolbar: search first (`flex-1`), then filters, then sort (phone only).
5. Active-filter chips and a "Clear all" button (when a filter is on).
6. Body: card list below `md`, table from `md` (both in the DOM, CSS picks one).
7. Footer: rows per page, "Showing x to y of n", windowed page buttons.

Primary action: one button in the header `actions`, wrapped in `Can` with the create permission (`residents/page.tsx:24-28`). Do not repeat it in the toolbar. The empty state may repeat it (`residents-table.tsx:324-328`).

Mobile at 375 px: the table becomes a stack of `RecordCard` below `md`. A `RecordSortControl` replaces the sortable headers (`residents-table.tsx:523-531`). Less-important columns hide at `xl` and `lg` (`residents-table.tsx:189,207`).

Best example: `src/components/residents/residents-table.tsx` with `src/app/(dashboard)/residents/page.tsx`. It has debounced search, sort, role chips, a phone card list, skeletons, an empty state and a route `loading.tsx`.

Worst divergence: `src/components/expenditure/expenditure-client.tsx:192-195`. The table scrolls sideways (`overflow-x-auto`, `min-w-[720px]`) at 375 px. It has only previous and next buttons (`:290-304`). It does keep URL filters, which the best example does not.

### Mobile collapse count

- `RecordCard` is used in 6 registry files: `residents-table.tsx`, `houses-table.tsx`, `payment-table.tsx`, `security-contacts-table.tsx`, `billing/page.tsx`, `approvals/page.tsx` (grep `RecordCard` over `src/app src/components`, excluding the component and its test).
- The dashboard map has 16 `registry` pages. 6 collapse to cards. 10 do not.
- 9 files use `<Table stack>` (grep count), all in settings and notification list components. The stack mode is built into `src/components/ui/table.tsx:17-32` and needs `data-label` on each cell.
- `md:hidden` appears in 12 files and `hidden md:(block|table|flex)` in 13 files across `src/app` and `src/components`. Both include non-registry files such as `header.tsx` and the resident portal.
- `useIsMobile` has 0 call sites. `useIsDesktop` or `useMediaQuery` appear in 5 files (`src/hooks/use-media-query.ts`).
- `ResponsiveSheet` has 3 admin uses: `resident-quick-view.tsx`, `house-quick-view.tsx`, `bulk-payment-sheet.tsx`. The other 3 are portal pages.

### Filter state

Three patterns exist today.

| Pattern | Pages |
| --- | --- |
| URL query string (shareable, back button works) | `payments` (`payment-filters.tsx:22-35`), `expenditure` (`expenditure-client.tsx:90-96`) |
| `sessionStorage` through `usePersistedState` | `residents-table.tsx:241-249`, `houses-table.tsx:179-185` (`use-persisted-state.ts:11,30`) |
| Plain `useState` (lost on reload) | `billing/page.tsx:160-170`, `approvals/page.tsx:154-158`, `documents-table.tsx:198-200` |

### Rules

- R-REGISTRY-1. Put the page title and the create action in `EnhancedPageHeader`. Wrap the action in `Can`.
- R-REGISTRY-2. Wrap the toolbar, list and chips in one `EnhancedTableCard`. Put the footer inside the same stacked container.
- R-REGISTRY-3. Put search first, with `flex-1`, a `Search` icon at `left-3` and `pl-9` (`residents-table.tsx:337-347`). Make it one text field. Debounce it at 300 ms (`residents-table.tsx:273`).
- R-REGISTRY-4. Reset to page 1 when search, a filter or the page size changes (`residents-table.tsx:345`).
- R-REGISTRY-5. Show each active filter as a `Badge variant="secondary"` with an `X`. Add "Clear all" next to the chips (`residents-table.tsx:482-503`).
- R-REGISTRY-6. Keep filters in the URL for any registry that staff share by link. Use `usePersistedState` only for private view state. Do not use bare `useState` for filters.
- R-REGISTRY-7. Below `md`, render `RecordCard`. From `md`, render `Table`. Keep both in the DOM and let CSS pick (`residents-table.tsx:521-542`). If a registry cannot use cards, use `<Table stack>` with `data-label` on each cell.
- R-REGISTRY-8. Do not let a registry table scroll sideways at 375 px.
- R-REGISTRY-9. Make the whole row the open target. Use `router.push` in the row handler, not a link around `<tr>`. Keep row buttons with `stopPropagation` and an `aria-label` (`residents-table.tsx:94-111`).
- R-REGISTRY-10. Gate each row action on its write permission, not on the route view permission (`CORE.md` section 6).
- R-REGISTRY-11. Sort with header buttons and the icon set `ChevronsUpDown` (idle), `ChevronUp`, `ChevronDown` (`houses-table.tsx:471-486`). Send `sort_by` and `sort_order` in the Zod search schema (`validators/resident.ts:185-186`, `validators/house.ts:83-84`). Give the phone a `RecordSortControl`.
- R-REGISTRY-12. In server actions, branch `.order()` per key. Use `referencedTable` for a joined column (`get-residents.ts:127-128`). End with a default branch of `created_at` descending (`get-residents.ts:130`).
- R-REGISTRY-13. Show 5 skeleton rows or cards while loading. Do not show plain "Loading..." text (see `payments/page.tsx:121`).
- R-REGISTRY-14. Show an empty state with an icon, a title, one line and the create action. Show a different state for "no results for this filter".
- R-REGISTRY-15. Show an error state with the database message in context. Do not return a blank area (`residents-table.tsx:307-311`).
- R-REGISTRY-16. Footer: "Rows per page" select with 10, 20, 50; text "Showing x to y of n {entity}"; previous and next buttons; up to 5 page buttons in a sliding window (`residents-table.tsx:633-714`). Use `h-8 w-[70px] rounded-xl` for the select.
- R-REGISTRY-17. Make footer icon buttons at least 44 px on phones. `Button size="icon"` grows by itself (`ui/button.tsx:29`). Fixed `h-9 w-9` buttons do not (`residents-table.tsx:667`).
- R-REGISTRY-18. Show status with `StatusBadge` or `Badge`, with an icon or label, never colour alone (`DESIGN.md` Do's). Use `tabular-nums` for money (`expenditure-client.tsx:226`).
- R-REGISTRY-19. Do not add hover lift or entrance animation to rows of amounts (`DESIGN.md` Don'ts). `EnhancedTableCard` still sets `animate-slide-up` and a hover shadow by default (`enhanced-stat-card.tsx:202-206`). Pass `animate={false}` on money registries.
- R-REGISTRY-20. Add the page to `ROUTE_PERMISSIONS` (`CORE.md` section 6).

### Stale rules from legacy docs

Source files: `docs/design/legacy/data-table-layout.md` (L1), `docs/design/legacy/data-table-layout2.md` (L2), `docs/design/legacy/sortable-clickable-datatable.md` (SC). A rule is "kept" when the code matches. The kept rules are folded into R-REGISTRY-1 to 20 above.

Kept (source file in brackets):

- Wrap tables in `EnhancedTableCard` (L1 s1, L2 s1). Code: `residents/page.tsx:51`, `billing/page.tsx:350`.
- Integrated toolbar, search `flex-1`, `pl-9`, `sm:flex-row` (L2 s2). Code: `residents-table.tsx:336-347`. Billing still uses the L1 header toolbar: `w-[180px]`, `h-9`, `pl-8` (`billing/page.tsx:354-364`).
- Filter chips as `Badge secondary` with `X`, plus "Clear all" (L2 s2). Code: `residents-table.tsx:482-503`.
- Reset the page on filter change (L1 s2).
- Rows per page 10, 20, 50 and `h-8 w-[70px] rounded-xl` (L1 s4, L2 s4). Code: `residents-table.tsx:646-653`.
- "Showing {start} to {end} of {total} {entity}" (L1 s4, L2 s4). Code: `residents-table.tsx:657`.
- 5-page sliding window (L2 s4). Code: `residents-table.tsx:673-684`, `billing/page.tsx` (`Math.min(5, totalPages)`).
- Header row `TableRow interactive={false}` (L1 s3, L2 s3). Code: `residents-table.tsx:545`, `expenditure-client.tsx:197`.
- Right-align numbers and the actions column (L1 s3, L2 s3). Code: `expenditure-client.tsx:202,230`.
- Skeleton rows while loading (L1 s3, L2 s3).
- `font-mono` code chip (`font-mono text-sm bg-muted px-2 py-1 rounded`, L2 s3). Code: `residents-table.tsx:177`.
- Sort: Zod `sort_by` and `sort_order`, server `.order()` branches, `referencedTable`, default `created_at` descending, header button with three icons, new column starts ascending, page resets (SC s1 to s6). Code: `validators/resident.ts:185`, `get-residents.ts:122-130`, `residents-table.tsx:252-260`.
- Memoised row, `cursor-pointer hover:bg-muted/50`, `router.push` from the row, edit button with `stopPropagation` and `aria-label` (SC s5). Code: `residents-table.tsx:167-178,110-111`.

Stale (no longer match code):

- L1 s1 and L2 s1: "Modern theme" wrapper `rounded-2xl backdrop-blur-sm bg-white/95 dark:bg-[#1E293B]/95 border-gray-200/80`. The Modern theme is removed (`DESIGN.md` Don'ts). The card now uses the `Card` token surface (`enhanced-stat-card.tsx:201-207`).
- L1 s3: "Table variant `modern`" as the standard, and `hover:bg-gray-50 dark:hover:bg-[#0F172A]`. Hex colours break the Token Rule (`DESIGN.md` Colors). `billing/page.tsx:484` uses `variant="default"`. The `modern` variant still exists in `ui/table.tsx:8`, and 5 files use it (grep `variant="modern"`).
- L1 s4: active page button `bg-[#0EA5E9]`. Replace with `bg-primary` (L2 already says so; code: `residents-table.tsx:695`).
- L1 s4: page numbers as `w-9` and `ChevronLeft`/`ChevronRight`. L2 says `ArrowLeft`/`ArrowRight` and `h-8 w-9`. Code uses `ChevronLeft`/`ChevronRight` in billing, houses and approvals, and `ChevronDown` rotated in residents (`residents-table.tsx:670,710`). The two docs disagree with each other and with the code.
- L1 s2: "Clear Filters" as a `RefreshCw` icon button. Only billing still does this (`billing/page.tsx:458-462`). Residents and houses use a "Clear all" text button.
- L2 s3: "Row hover `hover:bg-gray-50 dark:hover:bg-[#0F172A]`". Code uses `hover:bg-muted/50` (`residents-table.tsx:173`).
- L2 s3: badge mapping "Pending = `secondary`, Inactive = `destructive`". Code uses `StatusBadge` variants `success`, `warning`, `error`, `info`, `pending`, `active`, `inactive` with icons (`ui/status-badge.tsx:11-16,36-40`). `Badge` has `success` and `warning` (`ui/badge.tsx:18-21`).
- L2 "Scope" says nothing about phones. Neither L1 nor L2 mentions the card list. Both are silent on 375 px, which is the default layout (`DESIGN.md` Do's).
- SC s5: "Remove the Eye/view icon button". Code keeps an `Eye` button that opens a quick view (`residents-table.tsx:93-101`). Update the rule: the Eye button opens a preview, the row opens the record.
- SC s3: sort state in `useState`. Code uses `usePersistedState` (`residents-table.tsx:248-249`).
- SC s1: `limit` max 100 and default 20. Not rechecked. Footer offers only 10, 20, 50.
- L1 s1: "Title H3/CardTitle in `EnhancedTableCard`". Code on residents passes no title, and relies on the page header.

## 3. `record` (detail)

Purpose: show one entity and its related items. Offer its actions.

Required regions, top to bottom:

1. Header strip: back control, `<h1>` with name, identity chips (code, status badges), primary action, overflow menu.
2. Tabs or stacked sections. Put the most-used content first and load the other tabs on demand.
3. Related items inside the tabs (members, invoices, notes).
4. Audit or history.

Primary action: in the header strip, right side, gated by the write permission (`residents/[id]/page.tsx:293-300`, `house-header.tsx:102-114`). Destructive actions go in the overflow menu (`house-header.tsx:112`).

Mobile at 375 px: the header stacks (`flex-col sm:flex-row`, `house-header.tsx:64`). Buttons and tab triggers get `min-h-11` (`houses/[id]/page.tsx:37`, `residents/[id]/page.tsx:64`). The tab list scrolls (`w-max`). Edit mode uses `?edit=true` on the same route.

Best example: `src/app/(dashboard)/houses/[id]/page.tsx` with `src/components/houses/house-header.tsx`. It has a URL-driven tab (`?tab=`, `house-detail-tabs.ts:1-9`), lazy tabs with a skeleton (`:22-34`), a not-found state with a retry (`:67-82`) and its own `loading.tsx`.

Worst divergence: `src/app/(dashboard)/billing/[id]/page.tsx:99`. It adds its own `p-6 max-w-6xl mx-auto` on top of the shell padding. It has no `<h1>` (`:178` uses a `CardTitle`). It uses `window.print()` (`:133`). Tabs hold local state, not the URL (`:168`).

Rules:

- R-RECORD-1. Render one `<h1>` with the entity name. Use a shared size (see `## Divergences`).
- R-RECORD-2. Start the header with a ghost icon back control and an `aria-label` (`house-header.tsx:67`). The shell breadcrumb stays.
- R-RECORD-3. Put status and identity chips next to the title. Use badges with an icon or label.
- R-RECORD-4. Put one primary action on the right. Put the others in an overflow menu. Gate each on its write permission.
- R-RECORD-5. Store the active tab in `?tab=`. Resolve unknown values to a default tab (`house-detail-tabs.ts:7`).
- R-RECORD-6. Load every tab but the first with `dynamic()` and a `Skeleton` (`houses/[id]/page.tsx:22-34`).
- R-RECORD-7. Show a not-found state and a load-error state. The error state offers retry and a link back to the registry.
- R-RECORD-8. Edit on the same route with `?edit=true`. Show a no-permission state, not a blank page (`residents/[id]/page.tsx:216`).
- R-RECORD-9. Do not add outer padding or `max-w` in the page. The shell supplies both.
- R-RECORD-10. Put an audit or history view on every record that has a table in `AuditEntityType`. Today only the house `History` tab exists. `useEntityAuditLogs` (`src/hooks/use-audit-logs.ts`) has no page consumer (grep).
- R-RECORD-11. Open a destructive action in a confirm dialog before it runs.

## 4. `form` (create or edit)

Purpose: capture one record in one step.

Required regions, top to bottom:

1. Header (`EnhancedPageHeader` with icon and description).
2. One `Card` with `CardHeader` (icon title, one-line description) and `CardContent` with the form.
3. Fields in a `grid gap-4 md:grid-cols-2`.
4. Footer actions: `Save` (type submit) then `Cancel` (outline, `router.back()`).

Primary action: `Save` at the bottom of the form (`resident-form.tsx:832`, `house-form.tsx:444`). Cancel sits beside it.

Mobile at 375 px: fields stack to one column. The form stays inline. Sheets are used only for quick views and bulk actions, not for create forms (`ResponsiveSheet` admin uses: 3, all view or bulk).

Best example: `src/app/(dashboard)/houses/new/page.tsx` with `src/components/houses/house-form.tsx`. It has React Hook Form, Zod (`house-form.tsx:52`), the standard header and one card.

Worst divergence: `src/app/(dashboard)/security/contacts/new/page.tsx:56-70`. It has a hand-built back button, no page header and no `<h1>`. `AnnouncementForm` renders its own `<h1>` and a 3-column layout with a full-width submit in a side card (`announcement-form.tsx:123-128,415`).

Rules:

- R-FORM-1. Use `EnhancedPageHeader` for the title. Do not put the title in a `CardTitle` only.
- R-FORM-2. Use React Hook Form and Zod. Show `FormMessage` under each field.
- R-FORM-3. Validate ids read from the database with `z.guid()`, not `z.uuid()`. Stored Residio ids fail the Zod 4 RFC version check (project memory note, no code reference).
- R-FORM-4. Put Save first, then Cancel, at the end of the form. Disable Save while saving and show a spinner.
- R-FORM-5. Use `md:grid-cols-2` for field pairs. Use one column below `md`.
- R-FORM-6. Check the create permission on the page and in the action (`authorizePermission`, then `logAudit`; `CORE.md` section 6). Show a no-permission state if it fails.
- R-FORM-7. Wrap a `useSearchParams` page in `Suspense` (`residents/new/page.tsx:41-49`).
- R-FORM-8. Warn before leaving with unsaved changes. `SettingsPageHeader` does it with `isDirty` (`settings-page-header.tsx:50-57`). No admin entity form does it today.
- R-FORM-9. Make the submit target at least 44 px on phones (`size="lg"` or `max-md:` class).

## 5. `wizard` (multi-step)

Purpose: guide a task that has order and a point of no return.

Required regions, top to bottom:

1. Header with a back control.
2. Step indicator (numbered, current, done).
3. Step body (one card).
4. Footer: Back and Next. The last step has the commit action.

Primary action: the Next or Confirm button, bottom right of the step body.

Mobile at 375 px: the indicator keeps four 40 px circles in `max-w-3xl` (`payments/import/page.tsx:154-176`). The 5-step report indicator uses a fixed `mx-10` track (`report-request-wizard.tsx:176-182`). Neither has a phone layout.

Best example: `src/app/(dashboard)/payments/import/page.tsx`. It has a typed `WizardStep` (`:24`), lazy step bodies with a skeleton (`:20-22`), and back and forward handlers (`:102-115`).

Worst divergence: `src/components/reports/report-request-wizard.tsx` (1301 lines) holds its own stepper (`:168`). `payments/import/page.tsx` holds a second one. `billing/generate` uses a dialog, not steps (`generate-invoices-dialog.tsx:202`). There is no shared stepper in `src/components/ui/`.

Rules:

- R-WIZARD-1. Build one shared `Stepper` component. Do not copy the markup (two copies exist).
- R-WIZARD-2. Keep step state in one typed union (`WizardStep`).
- R-WIZARD-3. Allow Back on every step except the first. Do not lose entered data.
- R-WIZARD-4. Show a review step before any write that cannot be undone. Name what will change.
- R-WIZARD-5. Show step labels as text. Do not rely on colour (`DESIGN.md` Status rule).
- R-WIZARD-6. On phones, show "Step n of m" and the current label only.
- R-WIZARD-7. Load heavy step bodies with `dynamic()` and a skeleton.
- R-WIZARD-8. Use the same `<h1>` and back control as `record` pages.
- R-WIZARD-9. A wizard in a dialog must say so in the page header text, and show a history list on the page (`billing/generate/page.tsx`).

## 6. `settings`

Purpose: change estate configuration and watch system state. `settings/` pages group by task. `system/` pages show logs and jobs.

Required regions, top to bottom:

1. Layout label "Settings" and the sidebar (`lg`) or mobile nav (`settings/layout.tsx:8-22`).
2. `SettingsPageHeader`: breadcrumb, `<h1>` from `settings-nav.ts`, description, optional save bar.
3. Section chips "On this page" (`SettingsPageNav`).
4. Stacked section cards.

Primary action: the `Save changes` button in the sticky save bar. It appears when `isDirty` is true (`settings-page-header.tsx:78-95`). Section-level add actions sit in each section header.

Mobile at 375 px: the sidebar hides below `lg`. `SettingsMobileNav` replaces it (`settings/layout.tsx:19`). Tables use `<Table stack>` (9 files). The content area has `min-w-0` so a wide table scrolls inside it (`settings/layout.tsx:22`).

Best example: `src/components/settings/settings-merged-page.tsx` (used by 12 pages). It gives the header, the chips and the leave guard in one frame.

Worst divergence: `src/app/(dashboard)/system/*`. Six pages use `<h3 className="text-lg font-medium">` and no `<h1>` (for example `system/audit-logs/page.tsx:55`). `system/layout.tsx` has no sidebar or nav. `settings/billing/profiles/page.tsx` has no header at all.

Rules:

- R-SETTINGS-1. Use `SettingsPageHeader` or `SettingsMergedPage` on every `settings/` page. It owns the `<h1>`.
- R-SETTINGS-2. Take title and description from `settings-nav.ts`, so the menu and the page match.
- R-SETTINGS-3. Pass `isDirty` and `onSave` when a page has edits. Do not add a second save button.
- R-SETTINGS-4. Never delete a retired route. Replace it with a redirect and keep its `ROUTE_PERMISSIONS` entry (`settings/streets/page.tsx:3`).
- R-SETTINGS-5. Use `<Table stack>` and `data-label` for every table in a settings section.
- R-SETTINGS-6. Give `system/` pages the same header component. Give them an `<h1>`.
- R-SETTINGS-7. A `system/` page that lists records (audit, action log, queue) follows the `registry` footer and mobile rules.
- R-SETTINGS-8. Show a "no access" or empty state, not a blank area (`DESIGN.md` Do's).
- R-SETTINGS-9. Every write action calls `authorizePermission` then `logAudit`.

## 7. `report` (analytics)

Purpose: read-only numbers over a period. Charts and totals.

Required regions, top to bottom:

1. Header with title and description.
2. Period or filter controls.
3. KPI tiles (money in `tabular-nums`).
4. Charts and a breakdown table.
5. Export action.

Primary action: Export or Apply, in the header `actions` or at the end of the filter row.

Mobile at 375 px: the report pages delegate layout to `FinancialDashboard` and `FinancialOverview`. Date inputs and selects are plain `Select` and `Input` (`financial-overview.tsx:17-21`). The count of `md:hidden` or `hidden md:` uses in these files is 0.

Best example: `src/app/(dashboard)/analytics/page.tsx` (`EnhancedPageHeader` plus `FinancialDashboard`). It is 18 lines and has one `<h1>`.

Worst divergence: `src/app/(dashboard)/reports/financial-overview/page.tsx:30-34`. It renders `<h3 className="text-lg font-medium">` and no `<h1>`. It also runs its own auth redirects in the page (`:19-27`).

Rules:

- R-REPORT-1. Use `EnhancedPageHeader` and one `<h1>`.
- R-REPORT-2. Default the period to the current month (`financial-overview.tsx:77-84`). Show the period in the title area.
- R-REPORT-3. Use `tabular-nums whitespace-nowrap` for money (`DESIGN.md` Tabular Money Rule).
- R-REPORT-4. Pair every chart with a text value. Use the chart tokens from `DESIGN.md`.
- R-REPORT-5. Show loading, empty and error states per block.
- R-REPORT-6. Check the permission in the server page and redirect with `authorizePermission` (`reports/financial-overview/page.tsx:24-27`).
- R-REPORT-7. Stack tiles and charts to one column at 375 px.

## Divergences

Title sizes. The `<h1>` uses 6 styles:

| Style | Pages |
| --- | --- |
| `text-2xl sm:text-3xl font-bold tracking-tight` | all `EnhancedPageHeader` pages |
| `text-3xl font-bold` | `payments/[id]:104`, `payments/import:143`, `payments/imports:24`, `security/logs:173`, `security/verify:25`, `security/contacts/[id]:230`, `houses/[id]` edit (`:100`) |
| `text-2xl font-bold` | `documents/[id]:204`, `announcements/[id]:164`, `AnnouncementForm:123`, `analytics-client.tsx:248` |
| `text-2xl font-semibold` | `payments/email-imports:117`, `email-imports/[importId]:313`, `payments/import/[importId]:85` |
| `text-xl font-bold` | `residents/[id]:232,282` |
| `text-lg font-medium` | `SettingsPageHeader` |

Pages with no `<h1>` at all: `billing/[id]`, `reports/financial-overview`, `security/contacts/new`, `settings/billing/profiles`, and 6 `system/*` pages.

Other items:

- `src/app/(dashboard)/loading.tsx:5` renders `flex h-screen` with its own sidebar skeleton. The shell already has a sidebar, so the fallback shows two.
- `payments/page.tsx:121` shows plain "Loading payments..." text, not skeletons.
- Three filter-state patterns in registries (see `### Filter state`).
- Three pagination implementations: hand-built footers (residents, houses, billing, approvals, expenditure), `PaginationControls` (`ui/pagination-controls.tsx`, 3 users) and URL-based `Pagination` (`ui/simple-pagination.tsx:28`, used by `payments`).
- `EnhancedTableCard` animates on mount and lifts on hover by default (`enhanced-stat-card.tsx:202-206`). This conflicts with the Don't on motion for amounts (`DESIGN.md`).

## Verification notes

- Page count: `find "src/app/(dashboard)" -name page.tsx` returns 104.
- `useIsMobile` has no call site. The hook file name is `use-media-query.ts`, so the brief's `useIsMobile` count is 0 (grep `useIsMobile` over `src`).
- I did not run the app at 375 px. Mobile statements come from class names in code.
