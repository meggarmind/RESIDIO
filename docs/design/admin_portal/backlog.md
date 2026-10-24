# Backlog

Known gaps found while writing this guide and while running the proof audit. Nothing here is an
issue yet. The owner prunes this list; only then are issues filed (`CORE.md` §10). An improvement
idea without an owner decision goes to #1130 as a comment, not to the tracker.

Each item names the check or principle it fails, the evidence, and a proposed fix. Items are
grouped by what they are, not by when they were found.

## Build: canonical components that do not exist yet

See `components.md` for the contracts.

| # | Build | Why | Principle |
| --- | --- | --- | --- |
| B1 | A stand-alone page header component (title, description, actions, back control) | `EnhancedPageHeader` lives inside `enhanced-stat-card.tsx`; 16 of 90 pages use it, 18 write their own `<h1>` | 4 |
| B2 | A shared data table pattern (server paging, sort, sticky identifier column, row actions, mobile card collapse) | No shared table exists; each registry builds its own on `ui/table.tsx` | 4, 5, 10 |
| B3 | A shared filter bar (search, status, date range, clear all) | Filters are per-domain (`analytics/date-range-filter.tsx`, `audit/audit-filters.tsx`) | 5 |

## Consolidate: more than one component for one job

| # | Consolidate | Evidence | Principle |
| --- | --- | --- | --- |
| C1 | Stat cards: `enhanced-stat-card.tsx`, `quick-stats-card.tsx`, `modern-stats-cards.tsx`, `registry-kpi-strip.tsx` | Four families; `components.md` names the canonical one | 4 |
| C2 | Skeletons: `ui/skeleton.tsx`, `shimmer-skeleton.tsx`, `dashboard-skeleton.tsx`, `modern-skeleton.tsx` | Four families | 4, 8 |
| C3 | Quick actions: the header menu (6 items, `?action=create` links, no permission filter, `header.tsx:190-220`) and the command palette (4 items, different labels, filtered by `hasAllPermissions`, `global-search-command.tsx:121`) | Two lists disagree | 3, 11 |

## Shell findings (from `layout-and-shell.md`, verified 2026-10-24)

| # | Finding | Evidence | Check | Severity |
| --- | --- | --- | --- | --- |
| S1 | The header status dot is always green with tooltip `System Operational`; it reads no state | `header.tsx:95-106` | `FBK-06` | major |
| S2 | No breadcrumb renders between the `md` and `lg` breakpoints | `layout-and-shell.md`, Breadcrumb section | `NAV-01` | minor |
| S3 | `globals.css` holds 3 hex literals (`:466`, `:702`, `:740`) and `rgb`/`rgba` values; the header hard-codes `emerald`, `orange` and `blue-500` classes | `globals.css`, `header.tsx:96-101` | `VIS-01` | minor |
| S4 | `navigation.ts:79-83` documents a `ModernSidebar` component that does not exist | `src/config/navigation.ts:81` | hygiene | nit |
| S5 | `MobileNav` does not use `MOBILE_NAV_IDS` or `useMobileNavigation` | `layout-and-shell.md`, Mobile shell section | hygiene | nit |
| S6 | `docs/ui/sidebar-expand-collapse.md` and `docs/ui/visual-theme-system.md` describe widths, colours and theme ids the code no longer has | `layout-and-shell.md`, Stale docs section | docs | minor |
| S7 | `DESIGN.md` says "Default theme"; the code's default theme id is `supabase` and `default` is rewritten to it | `layout-and-shell.md`, Theme section | docs | nit |

## Product questions (from the reference articles, not rules)

The owner decides each. Until then they are not checks.

| # | Question | Source |
| --- | --- | --- |
| P1 | Saved named views on registries with shareable URLs ("Overdue > 60 days", "Unmatched this month")? | Bolder Apps, Idoko |
| P2 | Brief edits in a slide-out sheet instead of a full form page for small entities? | Bolder Apps, Idoko |
| P3 | A latency target for list filters and search (articles say 200 ms)? | Bolder Apps, Idoko |
| P4 | Soft delete with a retention window as a platform rule, beyond the archive flows that exist? | Bolder Apps, Idoko |
| P5 | Optimistic locking on edit forms (warn when another officer saved first)? | Aspirity |
| P6 | Keyboard shortcuts beyond `Cmd/Ctrl+K` (open record, edit, focus search)? | Idoko |
| P7 | An alert inbox: one place where failed jobs, bounced messages and mismatches wait for action? | Idoko |
| P8 | A first-run tour or seeded "demo" data for a new officer? | Idoko |

## Proof audit findings

Added by the six-page audit. One section per page in the `audit-checklist.md` report format.

Method: static source audit only, run without a browser or a database. `needs browser` means the
check needs a running page; the coordinator completes those rows. `n/a` rows name the reason.
`page-patterns.md` and `components.md` are not in the tree yet, so `HDR-01` and `HDR-02` are `n/a`
on every page and the archetype is the one named in the audit brief. Pages with no canonical
component to compare against (B1, B2 above) are recorded `n/a` for `HDR-02` and `TBL-10`, not `fail`.

### /dashboard   (archetype: home)   audited 24 Oct 2026 on 1539d5fb

The landing is `src/app/(dashboard)/dashboard/page.tsx`, which renders `dashboard-content.tsx`. There is no `src/app/(dashboard)/page.tsx` landing.

| Id | Result | Severity | Evidence | Proposed fix |
| --- | --- | --- | --- | --- |
| SHL-01 | pass | | `dashboard-content.tsx:36-76` renders content only; the breadcrumb returns null on `/dashboard` (`admin-breadcrumb.tsx:63`) | |
| SHL-02 | pass | | `src/config/navigation.ts:85-90` `NAV_DASHBOARD` | |
| SHL-03 | needs browser | | Sidebar active state needs a rendered page | |
| SHL-04 | pass | | `action-roles.ts:256` `'/dashboard': []`; the nav item has no `permissions` (`navigation.ts:85-90`), so no role loses it | |
| NAV-01 | n/a | | Breadcrumb is hidden on the home page | |
| NAV-02 | n/a | | Home page, not a record, form or wizard | |
| NAV-03 | pass | | Nav item `Dashboard` is a noun; quick actions are verb plus object (`command-strip.tsx:69-76`) | |
| NAV-04 | needs browser | | Global search needs a rendered page | |
| HDR-01 | n/a | | `page-patterns.md` is not in the tree | |
| HDR-02 | n/a | | Own `<h1>` in `command-strip.tsx:144`; canonical header not built (B1) | |
| HDR-03 | n/a | | Home page has no primary action; one `Quick actions` menu (`command-strip.tsx:85-106`). Reach at 375 px is under `MOB-05` | |
| HDR-04 | pass | | All six actions sit in one menu (`command-strip.tsx:69-76,99-103`) | |
| HDR-05 | pass | | `hasPermission` filter `command-strip.tsx:87`; lane links hidden by `allowed` (`command-lane.tsx:81`). Server side not run | |
| HDR-06 | n/a | | Not a record page | |
| HDR-07 | fail | minor | `grep -i unmatched src/components/dashboard` returns nothing. No pending approvals count on the page (the count exists in `sidebar.tsx:29`, `usePendingApprovalsCount`). Overdue and `Payments to verify` are present (`money-lane.tsx:63-71`) | Add a pending approvals count and an unmatched payments figure to `MoneyLane` or `CommandStrip`. The owner confirms whether `Payments to verify` is the same thing as unmatched payments |
| TBL-01..10 | n/a | | No table on this page | |
| FRM-01..08 | n/a | | No form on this page | |
| FBK-01 | pass | | `dashboard/loading.tsx`; `DashboardSkeleton` (`page.tsx:23`) | |
| FBK-02 | pass | | `command-recent-activity.tsx:51` empty copy; lanes show `Quiet` tone (`command-lane.tsx:44`) | |
| FBK-03 | pass | | `dashboard/error.tsx:9-54`; lanes show `Unavailable` instead of zero (`command-lane.tsx:98,104`) | |
| FBK-04 | n/a | | No writes on this page | |
| FBK-05 | n/a | | No money-moving action | |
| FBK-06 | fail | nit | `money-lane.tsx:66-71` the overdue row shows amount and count but not since when | Add the oldest due date to the hint, for example `Oldest due 03 Aug 2026` |
| MOB-01 | needs browser | | Page scroll at 375 px | |
| MOB-02 | n/a | | No table; lanes stack at `col-span-12` (`command-lane.tsx:70`) | |
| MOB-03 | n/a | | No form or dialog | |
| MOB-04 | needs browser | | Static hint: `min-h-11` on the quick actions trigger and lane links (`command-strip.tsx:93`, `command-lane.tsx:84`); the estate map filter buttons (`estate-map.tsx:131`) are not checked | |
| MOB-05 | needs browser | | Header stacks at `sm` (`command-strip.tsx:141`); clipping needs a rendered page | |
| MOB-06 | needs browser | | Task C1 at 375 px | |
| A11Y-01 | pass | | Native `Link` and `button` throughout (`command-strip.tsx:161`, `estate-map.tsx:131`) | |
| A11Y-02 | needs browser | | Focus ring | |
| A11Y-03 | pass | | No `size="icon"` button in the dashboard components | |
| A11Y-04 | needs browser | | Contrast in light and dark | |
| A11Y-05 | pass | | Lane tone has an icon plus an `sr-only` label (`command-lane.tsx:73-79`); `command-strip.tsx:157,166-170` icon plus text | |
| A11Y-06 | needs browser | | Quick actions menu focus return | |
| VIS-01 | fail | minor | `offline-admin-banner.tsx:24-32` uses `border-amber-300/40`, `bg-amber-50`, `text-amber-950`, `bg-amber-950/90`, `hover:bg-amber-100` | Use the `warning` token, as `Badge variant="warning"` does on other pages |
| VIS-02 | fail | nit | `command-strip.tsx:144` `text-2xl font-semibold`; `DESIGN.md:188` Headline is weight 700 | Use `font-bold tracking-tight` |
| VIS-03 | needs browser | | Spacing and wrappers | |
| VIS-04 | needs browser | | Radii, shadows, glass | |
| VIS-05 | needs browser | | Icon wrappers | |
| VIS-06 | needs browser | | Motion | |
| VIS-07 | needs browser | | Dark mode | |
| CPY-01 | pass | | `Resident wallet credits`, `Payments to verify`, `Occupied houses` (`money-lane.tsx:64-72`, `people-lane.tsx:41-47`) match `CONTEXT.md` | |
| CPY-02 | fail | nit | `people-lane.tsx:31` `People and Houses`; quick actions are sentence case (`command-strip.tsx:70-75`) while nav is title case (`navigation.ts:169`), see C3 | Use `People and houses`; the owner decides nav casing |
| CPY-03 | pass | | `command-lane.tsx:53` `'MMM d, h:mm a'` shows a month name | |
| CPY-04 | fail | nit | `command-lane.tsx:104` `These figures could not be loaded.` has no next step; `error.tsx:33-36` shows `Error ID` | Add `Try again later or refresh`; hide the digest unless the user opens details |
| CPY-05 | pass | | The debug panel shows only with the debug query flag (`dashboard-content.tsx:78-83`) | |

Task scenarios:

| Task | Role | Viewport | Result | Note |
| --- | --- | --- | --- | --- |
| C1 | chairman@residio.test | desktop and 375 px | needs browser | Static: overdue and payments to verify are in the lanes; pending approvals count and unmatched payments are absent (`HDR-07`) |

Summary: 0 blocker, 0 major, 2 minor, 4 nit. Passed 15 of 21 run. 14 rows `needs browser`, 12 rows `n/a` (a range row such as `TBL-01..10` counts once).

### /residents   (archetype: registry)   audited 24 Oct 2026 on 1539d5fb

| Id | Result | Severity | Evidence | Proposed fix |
| --- | --- | --- | --- | --- |
| SHL-01 | pass | | `residents/page.tsx:26-58` content only | |
| SHL-02 | pass | | `navigation.ts:100-106` | |
| SHL-03 | needs browser | | Sidebar active state | |
| SHL-04 | pass | | `action-roles.ts:237`; nav `permissions` `navigation.ts:105` | |
| NAV-01 | pass | | `admin-breadcrumb.tsx:22` `Dashboard > Residents`. The gap between `md` and `lg` is S2 | |
| NAV-02 | n/a | | Registry page | |
| NAV-03 | pass | | `Residents` noun; `Add resident` verb plus object (`page.tsx:35`) | |
| NAV-04 | needs browser | | Global search by name and code | |
| HDR-01 | n/a | | `page-patterns.md` is not in the tree | |
| HDR-02 | n/a | | `EnhancedPageHeader` (`page.tsx:28`); canonical header not built (B1) | |
| HDR-03 | pass | | One primary `Add resident` (`page.tsx:33-37`). Reach at 375 px is under `MOB-05` | |
| HDR-04 | n/a | | No secondary action | |
| HDR-05 | pass | | `Can` gates at `page.tsx:33`, `residents-table.tsx:105,324`. Server side not run | |
| HDR-06 | n/a | | Not a record page | |
| HDR-07 | n/a | | Not the home page | |
| TBL-01 | fail | nit | Server paging is correct (`get-residents.ts:123-130`, count at `residents-table.tsx:657`). With zero rows the text reads `Showing 1 to 0 of 0 residents` (`residents-table.tsx:634,657`) | Render the range text only when `count > 0` |
| TBL-02 | pass | | `residents-table.tsx:546-585` sort on Code, Name, Address with a visible chevron; phone uses `RecordSortControl` (`:524`) | |
| TBL-03 | fail | minor | Only the role and verification filters get chips and a clear control (`residents-table.tsx:482-520`). Search, status and street have no clear control, there is no clear-all, and all filters persist between visits (`:241-249`), so an old filter can hide rows | Add one `Clear filters` button and a chip row for every active filter |
| TBL-04 | fail | minor | `get-residents.ts:76` matches `resident_code` with `eqValue` (exact), while the placeholder promises code search (`residents-table.tsx:341`) | Use `ilikeContains('resident_code', search)` |
| TBL-05 | fail | minor | No `sticky` in `residents-table.tsx`; the table wrapper is `overflow-hidden` (`:542`). Whether columns clip at `md` needs a browser | Make the Code column sticky and let the wrapper scroll sideways |
| TBL-06 | pass | | Row `onClick` `residents-table.tsx:171-175`; card `onClick` `:135` | |
| TBL-07 | n/a | | No money column | |
| TBL-08 | pass | | `status-badge.tsx:9-14,53` text label in every badge | |
| TBL-09 | n/a | | No bulk action | |
| TBL-10 | n/a | | Page-local table; no shared table exists (B2) | |
| FRM-01..08 | n/a | | No form on this page | |
| FBK-01 | pass | | `residents/loading.tsx` matches the header, KPI strip and table | |
| FBK-02 | fail | minor | `residents-table.tsx:315-331` `No residents yet / Get started by adding your first resident` also shows when filters hide every row | Show `No residents match these filters` with `Clear filters` when a filter is active |
| FBK-03 | fail | minor | `residents-table.tsx:306-311` plain red text `Error loading residents: {error.message}` with no retry | Use an error block with the plain cause and a `Try again` button |
| FBK-04 | n/a | | No write on this page | |
| MOB-01 | needs browser | | Page scroll at 375 px | |
| MOB-02 | pass | | Cards below `md` (`residents-table.tsx:523`) carry code, name, status and actions (`:128-147`) | |
| MOB-03 | n/a | | No form or dialog | |
| MOB-04 | needs browser | | Static hint: row action buttons use the default icon size (`residents-table.tsx:94-103`), which may be under 44 px | |
| MOB-05 | needs browser | | Header stacking | |
| MOB-06 | needs browser | | Tasks S1 and F3 at 375 px | |
| A11Y-01 | fail | minor | Row opens the record through `TableRow onClick` only (`residents-table.tsx:171-175`); no `role`, `tabIndex` or key handler, and the Edit link opens edit mode (`:113`) | Render the code or name as a `Link` to `/residents/[id]` |
| A11Y-02 | needs browser | | Focus ring | |
| A11Y-03 | pass | | `aria-label` at `residents-table.tsx:97,110`; `sr-only` pager labels `:669,709` | |
| A11Y-04 | needs browser | | Contrast | |
| A11Y-05 | pass | | Status badges carry text; verification summary has icon plus count plus word (`:450-477`) | |
| A11Y-06 | needs browser | | Quick view dialog focus | |
| VIS-01 | fail | minor | `residents-table.tsx:425,431,437,454,463,473,474` `text-green-600`, `text-blue-600`, `text-amber-600`, `text-amber-700`; `status-badge.tsx:51` `border-amber-500/40 bg-amber-100 text-amber-900` | Use the `success`, `info` and `warning` tokens |
| VIS-02 | pass | | `enhanced-stat-card.tsx:271` `text-2xl sm:text-3xl font-bold tracking-tight` matches `DESIGN.md:187-188` | |
| VIS-03 | needs browser | | Spacing | |
| VIS-04 | needs browser | | Radii, shadows, glass | |
| VIS-05 | needs browser | | Icon wrappers | |
| VIS-06 | needs browser | | Motion | |
| VIS-07 | needs browser | | Dark mode | |
| CPY-01 | fail | nit | `page.tsx:30` `Manage community members and their access`; `CONTEXT.md:9` says avoid `Member` | `Manage residents and their access` |
| CPY-02 | fail | nit | `residents-table.tsx:233-236,357,370` `All Verification`, `All Status`, `All Streets`; `:327` `Add Resident` while `page.tsx:35` says `Add resident` | Sentence case, one wording for one button |
| CPY-03 | n/a | | No date shown | |
| CPY-04 | fail | nit | Error copy shows the raw message (`residents-table.tsx:309`) | Same fix as `FBK-03` |
| CPY-05 | pass | | No placeholder wording; the `-` for a missing address (`:58`) is a data fallback | |

Task scenarios:

| Task | Role | Viewport | Result | Note |
| --- | --- | --- | --- | --- |
| S1 | admin@residio.test | desktop and 375 px | needs browser | Static: Add resident and Edit are permission gated and reachable |
| F3 | finance@residio.test | desktop and 375 px | needs browser | Starts here, finishes on the record |

Summary: 0 blocker, 0 major, 7 minor, 4 nit. Passed 16 of 27 run. 14 rows `needs browser`, 13 rows `n/a` (a range row such as `FRM-01..08` counts once).

### /residents/[id]   (archetype: record)   audited 24 Oct 2026 on 1539d5fb

| Id | Result | Severity | Evidence | Proposed fix |
| --- | --- | --- | --- | --- |
| SHL-01 | pass | | `residents/[id]/page.tsx:256-604` content only | |
| SHL-02 | pass | | Reached from the registry (`residents-table.tsx:262-270`) | |
| SHL-03 | needs browser | | Sidebar active state | |
| SHL-04 | pass | | `action-roles.ts:237` with the longest-prefix match (`action-roles.ts:240-241`) | |
| NAV-01 | fail | minor | `admin-breadcrumb.tsx:89,98` turns the id into `Resident Details`, not the name or code | Let a record page pass its label to the layout breadcrumb |
| NAV-02 | pass | | Back link to `/residents` (`page.tsx:265-281`); filters survive because they persist (`residents-table.tsx:241-249`). Edit mode Back returns to the record (`:226-230`) | |
| NAV-03 | pass | | Menu items `Reactivate`, `Merge residents`, `Archive` (`page.tsx:317-330`) | |
| NAV-04 | needs browser | | Global search by name and code | |
| HDR-01 | n/a | | `page-patterns.md` is not in the tree | |
| HDR-02 | n/a | | Own `<h1>` at `page.tsx:282`; canonical header not built (B1) | |
| HDR-03 | pass | | `Edit` at the top right (`page.tsx:296-304`). Reach at 375 px is under `MOB-05` | |
| HDR-04 | pass | | One `More` menu (`page.tsx:305-335`) | |
| HDR-05 | pass | | Gates at `page.tsx:297,305,320,327,379,402,561`. Server side not run | |
| HDR-06 | fail | minor | `page.tsx:282-294` shows name, code, status badge and type. House and outstanding balance are not in the strip; the balance is in a card at `:577` | Add the primary house and the outstanding balance to the strip |
| HDR-07 | n/a | | Not the home page | |
| TBL-01..10 | n/a | | No registry table | |
| FRM-01 | pass | | Labels, `*` on required fields and `FormDescription` helpers (`resident-form.tsx:324-820`) | |
| FRM-02 | needs browser | | Error placement and first-error focus | |
| FRM-03 | needs browser | | Grouping and order of the form | |
| FRM-04 | pass | | `resident-form.tsx:832-833` `Update Resident` / `Saving...` | |
| FRM-05 | pass | | A large entity opens a form view (`page.tsx:222-249`) | |
| FRM-06 | pass | | `resident-archive-dialog.tsx:117-129` names the resident, lists the effects, confirm reads `Archive Resident`. The inactivate dialog title does not name the resident (`page.tsx:363`) | |
| FRM-07 | n/a | | Not a wizard | |
| FRM-08 | fail | minor | No `isDirty`, `beforeunload` or blocker in `resident-form.tsx` | Warn on leave, as `settings-page-header.tsx:43-52` does |
| FBK-01 | pass | | Inline skeleton `page.tsx:166-186` | |
| FBK-02 | n/a | | Not a list | |
| FBK-03 | pass | | `page.tsx:188-211` not-found and retry states | |
| FBK-04 | pass | | Toasts at `page.tsx:126,146,159`; `resident-form.tsx:235` | |
| FBK-05 | n/a | | No money-moving action here | |
| FBK-06 | n/a | | No status that implies a next step | |
| MOB-01 | needs browser | | Page scroll at 375 px | |
| MOB-02 | n/a | | No table | |
| MOB-03 | n/a | | Edit is a form page. The alert dialogs need a browser check under `MOB-06` | |
| MOB-04 | pass | | `min-h-11 md:min-h-0` on header buttons and tabs (`page.tsx:64,254,265,565`) | |
| MOB-05 | needs browser | | Header wraps (`page.tsx:263`); clipping needs a rendered page | |
| MOB-06 | needs browser | | Tasks F3 and S1 at 375 px | |
| A11Y-01 | pass | | Native `Link`, `Button`, menu items | |
| A11Y-02 | needs browser | | Focus ring | |
| A11Y-03 | pass | | `aria-label="Go back"` (`page.tsx:265`) | |
| A11Y-04 | needs browser | | Contrast | |
| A11Y-05 | pass | | Text in every badge (`page.tsx:516-558`) | |
| A11Y-06 | needs browser | | Dialog focus trap and return | |
| VIS-01 | fail | minor | `page.tsx:340-341` `border-amber-500/40 bg-amber-500/10`, `text-amber-600` | Use the `warning` token |
| VIS-02 | fail | nit | `page.tsx:282` and `:232` `text-xl font-bold`; Headline is 1.5rem (`DESIGN.md:188`) | Use the Headline role |
| VIS-03 | needs browser | | Spacing | |
| VIS-04 | fail | nit | `page.tsx:416` `glass` on the tab bar; glass belongs to floating overlays | Use a plain surface; the owner decides if a sticky tab bar counts as floating |
| VIS-05 | needs browser | | Icon wrappers | |
| VIS-06 | needs browser | | Motion (`PageTransition`, view transition name at `page.tsx:262`) | |
| VIS-07 | needs browser | | Dark mode | |
| CPY-01 | pass | | Resident, House, Wallet used as defined | |
| CPY-02 | fail | nit | `page.tsx:232,241,463,503,524` `Edit Resident`, `Resident Details`, `Secondary Phone`, `Resident Since`, `Emergency Contact`; `resident-form.tsx:329` `First Name *` | Sentence case |
| CPY-03 | pass | | `page.tsx:506` month short name. It passes `undefined` as the locale, so the order follows the browser | Pass `'en-GB'` |
| CPY-04 | pass | | `page.tsx:194-199` says what happened and what to do | |
| CPY-05 | pass | | None found | |

Task scenarios:

| Task | Role | Viewport | Result | Note |
| --- | --- | --- | --- | --- |
| F3 | finance@residio.test | desktop and 375 px | needs browser | Static: `CrossPropertyPaymentSummary` (wallet and invoices) sits on the Overview tab (`page.tsx:577`); last payment not checked |
| S1 | admin@residio.test | desktop and 375 px | needs browser | Static: house and co-resident links render in `LinkedHouses` (`page.tsx:580`); audit trail not checked |

Summary: 0 blocker, 0 major, 4 minor, 3 nit. Passed 23 of 30 run. 14 rows `needs browser`, 10 rows `n/a` (a range row such as `TBL-01..10` counts once).

### /billing   (archetype: registry)   audited 24 Oct 2026 on 1539d5fb

Nav item `Invoices & Dues` points to `/billing` (`navigation.ts:162-163`). The page title is `Billing & Invoices` and the breadcrumb reads `Billing`.

| Id | Result | Severity | Evidence | Proposed fix |
| --- | --- | --- | --- | --- |
| SHL-01 | pass | | `billing/page.tsx:254-638` content only | |
| SHL-02 | pass | | `navigation.ts:160-175` | |
| SHL-03 | needs browser | | Sidebar active state | |
| SHL-04 | pass | | `action-roles.ts:250`; nav `permissions` `navigation.ts:165` | |
| NAV-01 | pass | | `admin-breadcrumb.tsx:25` reads `Dashboard > Billing`. The name clash is `CPY-01` | |
| NAV-02 | n/a | | Registry page | |
| NAV-03 | pass | | `Invoices & Dues` noun; `Generate Invoices` verb plus object (`navigation.ts:162,169`) | |
| NAV-04 | needs browser | | Global search by invoice number | |
| HDR-01 | n/a | | `page-patterns.md` is not in the tree | |
| HDR-02 | n/a | | `EnhancedPageHeader` (`page.tsx:256`); canonical header not built (B1) | |
| HDR-03 | pass | | `Generate Invoices` is the rightmost action (`page.tsx:285-294`). Three buttons at 375 px are under `MOB-05` | |
| HDR-04 | pass | | `Refresh` and `Check Overdue` sit in one group with the primary (`page.tsx:261-295`) | |
| HDR-05 | pass | | `Can` at `page.tsx:271,285`. Server side not run | |
| HDR-06 | n/a | | Not a record page | |
| HDR-07 | n/a | | Not the home page | |
| TBL-01 | pass | | `get-invoices.ts:154` `range`; count text `page.tsx:588`, guarded by `totalCount > 0` (`:566`) | |
| TBL-02 | fail | minor | Plain headers, no sort control (`page.tsx:487-495`) | Add sort on Invoice #, Due date and Amount |
| TBL-03 | fail | major | Status options are Unpaid, Paid, Partial, Void (`page.tsx:390-394`) although `InvoiceStatus` includes `overdue` (`database.ts:238`). The `Overdue` card sets the filter to `unpaid` (`:345`), which also lists invoices not yet due. The clear control is a bare refresh icon with `title` only (`:454-464`). Whether any row holds status `overdue` needs the database | Add an `Overdue` filter that uses the due date, send the card to it, and use an `X` icon with the label `Clear filters` |
| TBL-04 | pass | | `get-invoices.ts:54` partial `ilike` on `invoice_number`; resident select searches name and alias (`page.tsx:369-380`) | |
| TBL-05 | fail | minor | No `sticky`; wrapper `overflow-hidden` (`page.tsx:483`); nine columns (`:487-495`) | Sticky Invoice # column; allow sideways scroll |
| TBL-06 | fail | minor | Row has no handler (`page.tsx:521-523`); only the `View` button opens the invoice (`:554`); the number is plain text (`:524`). The phone card is clickable (`:89`) | Make the invoice number a `Link` and the row clickable |
| TBL-07 | fail | nit | `page.tsx:539` right-aligned, but no `tabular-nums` or `whitespace-nowrap` | Add both classes |
| TBL-08 | pass | | Text label inside the badge (`page.tsx:72`); wording is `CPY-05` | |
| TBL-09 | n/a | | No bulk action | |
| TBL-10 | n/a | | Page-local table (B2) | |
| FRM-01..08 | n/a | | No form on this page | |
| FBK-01 | pass | | Skeleton rows and card skeletons (`page.tsx:470,499-512`); stat cards use `isLoading` | |
| FBK-02 | fail | minor | `page.tsx:198` names a button `Generate Monthly Invoices` that does not exist (the button is `Generate Invoices`, `:291`); same text for a filtered-empty result; no action button | Say `No invoices match these filters` when filtered; otherwise offer a gated `Generate invoices` button |
| FBK-03 | fail | major | `page.tsx:184` reads `data`, `isLoading`, `refetch` only; a failed read renders the empty message (`:513-518`), so the officer sees `No invoices found` | Read `isError` and show an error block with `Try again` |
| FBK-04 | pass | | `use-billing.ts:503-514` toasts for the overdue check | |
| FBK-05 | n/a | | No money-moving action on this page | |
| FBK-06 | fail | minor | `statusColors` has no `overdue` key (`page.tsx:46-51`), so `overdue` renders unstyled (`:71`); no age is shown | Add an `Overdue` badge with an icon and `Overdue since dd mmm yyyy` |
| MOB-01 | needs browser | | The two-month calendar popover (`page.tsx:449`) and filter row at 375 px | |
| MOB-02 | pass | | Cards below `md` (`page.tsx:469-481`) show amount, status, resident, invoice number | |
| MOB-03 | n/a | | No form | |
| MOB-04 | needs browser | | Filter controls are `h-9` (`page.tsx:365,386`), under 44 px | |
| MOB-05 | needs browser | | Three header buttons | |
| MOB-06 | needs browser | | Tasks F2 and F3 at 375 px | |
| A11Y-01 | fail | minor | `Overdue` stat card is a `Card` with `onClick` (`page.tsx:344-345`; `enhanced-stat-card.tsx:113-121`); no role, no keyboard | Render it as a `button` or `Link` |
| A11Y-02 | needs browser | | Focus ring | |
| A11Y-03 | pass | | `aria-label` on search and status (`page.tsx:359,386`); the clear control has `title` only (`:460`) | |
| A11Y-04 | needs browser | | Contrast | |
| A11Y-05 | pass | | Badge text; stat cards carry icon plus title | |
| A11Y-06 | needs browser | | Calendar popover focus | |
| VIS-01 | fail | minor | `page.tsx:47-58` `bg-yellow-100 text-yellow-800`, `bg-green-100`, `bg-orange-100`, `bg-gray-100`, `bg-blue-100`, `bg-purple-100` and dark variants | Use `Badge` variants `success`, `warning`, `destructive`, `secondary` |
| VIS-02 | pass | | Page title from `EnhancedPageHeader` (`enhanced-stat-card.tsx:271`) | |
| VIS-03 | needs browser | | Spacing | |
| VIS-04 | needs browser | | Radii, shadows, glass | |
| VIS-05 | needs browser | | Icon wrappers | |
| VIS-06 | needs browser | | Motion (`stagger-*`, `animate-slide-up`) | |
| VIS-07 | needs browser | | Dark mode | |
| CPY-01 | fail | minor | One page, three names: nav `Invoices & Dues` (`navigation.ts:162`), title `Billing & Invoices` (`page.tsx:257`), breadcrumb `Billing` (`admin-breadcrumb.tsx:25`) | Use `Invoices & Dues` for the title and the breadcrumb |
| CPY-02 | fail | nit | `page.tsx:282,291,390,422,491` `Check Overdue`, `Generate Invoices`, `All Status`, `All Dates`, `Due Date` | Sentence case |
| CPY-03 | fail | minor | `page.tsx:95,537` `toLocaleDateString('en-GB')` prints `04/10/2026`; the custom range uses `dd MMM yy` (`:439`) | `format(date, 'dd MMM yyyy')` |
| CPY-04 | fail | nit | Empty copy points to a button that does not exist (`page.tsx:198`) | Same fix as `FBK-02` |
| CPY-05 | fail | minor | `page.tsx:72` prints the raw status `partially_paid`; filter label `Adjust` (`:409`) | Map statuses to labels (`Partly paid`); write `Adjustment` in full |

Task scenarios:

| Task | Role | Viewport | Result | Note |
| --- | --- | --- | --- | --- |
| F2 | finance@residio.test | desktop and 375 px | needs browser | Entry is `Generate Invoices` here (`page.tsx:289`); the preview lives on `/billing/generate`, not audited |
| F3 | finance@residio.test | desktop and 375 px | needs browser | Static: a resident filter and a status filter exist; no overdue filter (`TBL-03`) |

Summary: 0 blocker, 2 major, 10 minor, 3 nit. Passed 17 of 32 run. 14 rows `needs browser`, 10 rows `n/a` (a range row such as `FRM-01..08` counts once).

### /payments/import   (archetype: wizard)   audited 24 Oct 2026 on 1539d5fb

Route found from `navigation.ts:130-137` (`Transactions > Import Statement`). Steps: Upload, Mapping, Review, Submit (`import/page.tsx:155-189`).

| Id | Result | Severity | Evidence | Proposed fix |
| --- | --- | --- | --- | --- |
| SHL-01 | pass | | `import/page.tsx:135-293` content only | |
| SHL-02 | pass | | `navigation.ts:130-137`; also linked from `command-strip.tsx:72` | |
| SHL-03 | needs browser | | Sidebar parent and child active state | |
| SHL-04 | fail | nit | Route accepts five import permissions (`action-roles.ts:242-248`); the nav item needs only `IMPORTS_CREATE` (`navigation.ts:136`), so approvers can open the wizard by URL but never see the item | List the same permissions on the nav item, or state in a comment that approvers use `Import History` |
| NAV-01 | fail | nit | Breadcrumb reads `Payments > Import` (`admin-breadcrumb.tsx:24,34`); nav reads `Transactions > Import Statement`; title reads `Import Bank Statement` (`import/page.tsx:143`) | One name for the page everywhere |
| NAV-02 | pass | | Back link to `/payments` (`import/page.tsx:137-141`); each step has a `Back` button (`import-confirmation.tsx:91-94`) | |
| NAV-03 | fail | nit | `Import History` is a noun phrase among action items (`navigation.ts:140`); the others are verb plus object | `View import history` |
| NAV-04 | n/a | | A wizard, not a findable entity | |
| HDR-01 | n/a | | `page-patterns.md` is not in the tree | |
| HDR-02 | n/a | | Own `<h1>` at `import/page.tsx:143`; canonical header not built (B1) | |
| HDR-03 | n/a | | Wizard; the primary action is per step | |
| HDR-04 | n/a | | One secondary link, `Import history` (`import/page.tsx:148-150`) | |
| HDR-05 | fail | minor | Steps 1 to 3 have no permission check; only step 4 does: `useCan(IMPORTS_REVIEW)` (`import-confirmation.tsx:28,98`). A role with `imports.create` but not `imports.review` does three steps, then the button is disabled (`:114-118`) | Check `IMPORTS_REVIEW` before step 1, or let `Submit` use the create permission. The owner decides which. Server side not run |
| HDR-06 | n/a | | Not a record page | |
| HDR-07 | n/a | | Not the home page | |
| TBL-01..10 | n/a | | Wizard. The review table (`import-preview.tsx:716`) has a sticky header only | |
| FRM-01 | fail | minor | Labels exist (`statement-upload.tsx:192,289,317,343`; `column-mapper.tsx:215-293`) but no required marker on file or bank account | Mark required fields |
| FRM-02 | needs browser | | Error placement and first-error focus | |
| FRM-03 | needs browser | | Grouping and order | |
| FRM-04 | pass | | `Submit for approval`, `Submitting...` (`import-confirmation.tsx:102-110`) | |
| FRM-05 | n/a | | Wizard page | |
| FRM-06 | pass | | `What happens next` states that no payment is created (`import-confirmation.tsx:79-87`). The skip button has no confirmation (`import-preview.tsx:899-907`); whether a skip can be undone needs a browser | |
| FRM-07 | fail | minor | Steps and current step are shown (`import/page.tsx:154-203`). The summary has total, to process, unmatched, duplicates (`import-summary-tiles.tsx:12-40`): no skipped count and no amount total. Review totals say `This page` only (`import-preview.tsx:585,604`) | Add `Skipped` and the total amount to process to the summary |
| FRM-08 | fail | minor | No `beforeunload`, `isDirty` or blocker in `import/page.tsx` or `components/imports/*`. File and mapping live in `useState` (`import/page.tsx:51-61`) | Warn on leave while the wizard is past step 1 |
| FBK-01 | pass | | Skeleton for the preview (`import/page.tsx:19-22`); spinner `import-confirmation.tsx:39-45` | |
| FBK-02 | needs browser | | Empty review table | |
| FBK-03 | pass | | `toast.error` and an alert in `statement-upload.tsx:169,373`; shell `error.tsx` | |
| FBK-04 | pass | | `use-imports.ts:596` `Import submitted for approval` | |
| FBK-05 | n/a | | Submit moves no money; the page says so (`import-confirmation.tsx:83`) | |
| FBK-06 | n/a | | No status here | |
| MOB-01 | needs browser | | Page scroll at 375 px | |
| MOB-02 | fail | major | `import-preview.tsx` has no `md:hidden`, `hidden md:`, `useIsMobile` or card component, and renders a wide table with a sticky header (`:716`). Confirm sideways scroll at 375 px | Collapse rows to cards with date, amount, match and Skip |
| MOB-03 | needs browser | | Is `Continue` and `Submit` reachable without scrolling to the end | |
| MOB-04 | needs browser | | Skip button size (`import-preview.tsx:899-907`) | |
| MOB-05 | needs browser | | Header row has no wrap (`import/page.tsx:136`) with a 30 px title and two controls | |
| MOB-06 | needs browser | | Task F1 at 375 px | |
| A11Y-01 | pass | | Native controls; step marks are not interactive | |
| A11Y-02 | needs browser | | Focus ring | |
| A11Y-03 | pass | | `aria-label` at `import/page.tsx:137`, `statement-upload.tsx:265`; the skip button has `title` only (`import-preview.tsx:905`) | |
| A11Y-04 | needs browser | | Contrast of `text-green-600` and `text-yellow-600` on tinted tiles | |
| A11Y-05 | pass | | Completed step shows a check icon plus label (`import/page.tsx:173-189`); tiles carry icon plus word | |
| A11Y-06 | needs browser | | Dialog focus | |
| VIS-01 | fail | minor | Raw colours in `import-summary-tiles.tsx:20-39`; `import-preview.tsx:80-86,395-418,452-455,549-604,811-830`; `column-mapper.tsx:329-355`; `statement-upload.tsx:183-184,260,290-291` | Use status tokens and `Badge` variants |
| VIS-02 | fail | nit | `import/page.tsx:143` `text-3xl font-bold` with no compact step; `DESIGN.md:187` Display is 2.25rem or 1.5rem | Use the Display or Headline role |
| VIS-03 | needs browser | | Spacing | |
| VIS-04 | needs browser | | Radii, shadows, glass | |
| VIS-05 | needs browser | | Icon wrappers | |
| VIS-06 | needs browser | | Static hint: the step connector animates to `hsl(var(--primary))` (`import/page.tsx:195`) but the tokens are `oklch(...)` (`globals.css:153,197`); the colour may be invalid | |
| VIS-07 | needs browser | | Dark mode | |
| CPY-01 | fail | minor | Nav label `Transactions` for the Payments area (`navigation.ts:126`); `CONTEXT.md:43-45` says avoid `Transaction` for Payment. The wizard uses `Transaction Filter` and `Transaction Type` for bank lines (`import-confirmation.tsx:67`, `statement-upload.tsx:343`) | The owner decides: rename the nav to `Payments`, and say `Statement lines` for bank rows |
| CPY-02 | fail | nit | `import/page.tsx:143,212,229,252,277` `Import Bank Statement`, `Upload Bank Statement`, `Map Columns`, `Review Matches`, `Submit for Approval` | Sentence case |
| CPY-03 | needs browser | | Row dates in the review table | |
| CPY-04 | fail | nit | `import-confirmation.tsx:116` prints the permission key `imports.review` | Say `Ask an officer who can review imports` |
| CPY-05 | pass | | None found | |

Task scenarios:

| Task | Role | Viewport | Result | Note |
| --- | --- | --- | --- | --- |
| F1 | finance@residio.test | desktop and 375 px | needs browser | Static: the summary lacks a skipped count (`FRM-07`), and the card collapse is missing (`MOB-02`) |

Summary: 0 blocker, 1 major, 6 minor, 6 nit. Passed 12 of 25 run. 18 rows `needs browser`, 11 rows `n/a` (a range row such as `TBL-01..10` counts once).

### /settings   (archetype: settings)   audited 24 Oct 2026 on 1539d5fb

This is the settings landing (a card hub). Leaf settings pages are not audited here.

| Id | Result | Severity | Evidence | Proposed fix |
| --- | --- | --- | --- | --- |
| SHL-01 | pass | | `settings/page.tsx:101-181`; `SettingsPageHeader` hides its own breadcrumb on `/settings` (`settings-page-header.tsx:60`) | |
| SHL-02 | pass | | `navigation.ts:240-246` | |
| SHL-03 | needs browser | | Sidebar active state | |
| SHL-04 | pass | | `action-roles.ts:297`; nav `permissions` `navigation.ts:245`; cards are built from the permission-filtered config (`settings/page.tsx:24-31`) | |
| NAV-01 | pass | | Layout breadcrumb `Dashboard > Settings` | |
| NAV-02 | n/a | | Hub page | |
| NAV-03 | pass | | `Settings` noun | |
| NAV-04 | needs browser | | Global search; the page has its own settings search (`settings/page.tsx:105-115`) | |
| HDR-01 | n/a | | `page-patterns.md` is not in the tree | |
| HDR-02 | n/a | | `SettingsPageHeader` (`settings-page-header.tsx:73`); canonical header not built (B1) | |
| HDR-03 | n/a | | No primary action on the hub | |
| HDR-04 | n/a | | No actions | |
| HDR-05 | n/a | | No write control on the hub | |
| HDR-06 | n/a | | Not a record page | |
| HDR-07 | n/a | | Not the home page | |
| TBL-01..10 | n/a | | No table | |
| FRM-01..07 | n/a | | No form on the hub | |
| FRM-08 | n/a | | The hub has no form. Leaf pages warn on leave through `SettingsPageHeader` (`settings-page-header.tsx:43-52`) | |
| FBK-01 | pass | | `SettingsSkeleton` (`settings/page.tsx:57`) | |
| FBK-02 | pass | | `No settings match` / `Try a different word.` (`settings/page.tsx:125`) | |
| FBK-03 | fail | nit | The setup-status query ignores errors (`settings/page.tsx:37-44`); on failure the checklist vanishes without a message | Show `Setup status could not be loaded` with a retry |
| FBK-04 | n/a | | No write on the hub | |
| FBK-05 | n/a | | No money-moving action | |
| FBK-06 | pass | | Chips `Not set up`, `Set up`, `ON` show the state (`settings/page.tsx:69-74`) | |
| MOB-01 | needs browser | | Page scroll at 375 px | |
| MOB-02 | n/a | | No table | |
| MOB-03 | n/a | | No form | |
| MOB-04 | pass | | Checklist rows `min-h-11` (`settings/page.tsx:155,159`); cards are full-size links | |
| MOB-05 | needs browser | | Header stacking | |
| MOB-06 | needs browser | | Task A1 at 375 px | |
| A11Y-01 | pass | | `Link` wraps each card (`settings/page.tsx:77`) | |
| A11Y-02 | needs browser | | Focus ring on card links | |
| A11Y-03 | pass | | `aria-label="Search settings"` (`settings/page.tsx:112`) | |
| A11Y-04 | needs browser | | Contrast | |
| A11Y-05 | pass | | Checklist icon plus `sr-only` text (`settings/page.tsx:143-148`); chips are text | |
| A11Y-06 | n/a | | No dialog | |
| VIS-01 | pass | | Only token classes (`text-success`, `text-muted-foreground`); none in `settings-page-header.tsx` or `settings-states.tsx` | |
| VIS-02 | fail | nit | `settings-page-header.tsx:73` `text-lg font-medium`; Headline is 1.5rem, weight 700 | Use the Headline role |
| VIS-03 | needs browser | | Spacing | |
| VIS-04 | needs browser | | Radii, shadows, glass | |
| VIS-05 | needs browser | | Icon wrappers | |
| VIS-06 | needs browser | | Motion | |
| VIS-07 | needs browser | | Dark mode | |
| CPY-01 | pass | | Terms follow `CONTEXT.md` (`Setting`, `Integration`) | |
| CPY-02 | fail | nit | `settings/page.tsx:86` `Opens System`; group headings are upper-cased by CSS (`:171`) | Sentence case |
| CPY-03 | n/a | | No date shown | |
| CPY-04 | fail | nit | Chip `ON` has no object (`settings/page.tsx:70`) | `Maintenance on` and `Override on`, from the card title |
| CPY-05 | pass | | None found | |

Task scenarios:

| Task | Role | Viewport | Result | Note |
| --- | --- | --- | --- | --- |
| A1 | admin@residio.test | desktop and 375 px | needs browser | Starts here; the saved-value and audit-log proof is on leaf pages, not audited |

Summary: 0 blocker, 0 major, 0 minor, 4 nit. Passed 15 of 19 run. 12 rows `needs browser`, 17 rows `n/a` (a range row such as `TBL-01..10` counts once).

### Noticed and left alone (not findings of the six pages)

- `src/app/(dashboard)/loading.tsx:5-17` draws its own sidebar skeleton inside the shell. Any page without its own `loading.tsx` or skeleton may show a second sidebar for a moment (`needs browser`).
- `SettingsPageHeader` renders its own breadcrumb on every leaf settings page (`settings-page-header.tsx:60-72`), next to the layout breadcrumb. That is `SHL-01` on those pages.
- `admin-breadcrumb.tsx:90` maps `houses` to `Property`, and `CONTEXT.md:13` says avoid `Property`.
- `billing/page.tsx:270` says `checkOverdueInvoices` rewrites statuses. The action only selects rows (`check-overdue-invoices.ts:38-62`) and has no `authorizePermission`; it relies on row-level security. The comment is wrong, and the button label does not say it only reports.
- `billing/page.tsx:274` calls `mutateAsync` without a `catch`; a failure becomes an unhandled promise rejection after the error toast.
- `settings/page.tsx:171` uses `<h4>` under an `<h1>`, with no `h2` or `h3`.
- `dashboard-content.tsx:78-83` shows a debug panel for anyone who adds the debug flag to the URL.
