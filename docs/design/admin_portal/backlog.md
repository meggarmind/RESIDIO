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
