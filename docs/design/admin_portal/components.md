# Admin portal components reference

Part of the admin design guide (#1145). This page names one component for each UI job on an admin page.
It lists the competing components that new work must not use. Where no component exists, it gives the contract to build.

Scope: `src/app/(dashboard)/**` and `src/components/**` for the admin dashboard. The resident portal is out of scope (`CORE.md` section 3).

Counts come from ripgrep over `src/` at this commit. "Usages" means JSX or import sites outside tests, unless the text says otherwise.
The files `quick-stats-card.tsx` and `modern-stats-cards.tsx` do not exist in this branch. Do not look for them.

## Page header

**Canonical:** `EnhancedPageHeader` (`src/components/dashboard/page-header.tsx`, re-exported from `enhanced-stat-card.tsx`)
**Use when:** a page needs a title, an optional description, an optional icon and an actions slot. It has 20 files with `<EnhancedPageHeader`, for example `src/app/(dashboard)/residents/page.tsx` and `src/app/(dashboard)/billing/page.tsx`.
**Do not use in new work:**
- A raw `<h1>`. 13 files under `src/app/(dashboard)` still render their own `<h1>`, mostly detail pages such as `src/app/(dashboard)/houses/[id]/page.tsx` and `src/app/(dashboard)/payments/[id]/page.tsx`.
- `SettingsPageHeader` (`src/components/settings/settings-page-header.tsx:19`, 8 files) outside `/settings`. It is correct for settings pages only, because it reads the title and trail from `src/config/settings-nav.ts`.
- A wrapper such as `PaymentPageHeader` (`src/app/(dashboard)/payments/new/payment-page-header.tsx:16`). `page-header.tsx` has no `'use client'`, so a Server Component page imports it from `@/components/dashboard/page-header` and passes the icon directly.

**Contract / notes:**
- Props: `title`, `description?`, `icon?: LucideIcon`, `actions?: ReactNode`, `className?`, `animate?`, `backHref?`, `backLabel?`.
- Layout: a column below `sm`, a row from `sm` up. The title is `text-2xl sm:text-3xl font-bold tracking-tight`.
- Back control: set `backHref` for record, form and wizard pages. It renders an icon-only ghost button left of the title with `aria-label` set to `backLabel` or "Go back", 44 px square below `md`. Do not hand-build an `ArrowLeft` button. Converted: `houses/[id]` (edit view), `houses/unverified`, `billing/[id]`. About 11 other pages still build one by hand.
- The breadcrumb is layout-level (`src/components/dashboard/admin-breadcrumb.tsx`). A page cannot set its own trail. Use a back control.
- At 375 px the actions wrap below the title. Keep at most one primary button in `actions`. Put other actions in a menu.

## Stat / KPI card

**Canonical:** `EnhancedStatCard` (`src/components/dashboard/enhanced-stat-card.tsx:51`) for a card with a trend or an icon. `RegistryKpiStrip` (`src/components/dashboard/registry-kpi-strip.tsx:23`) for a compact strip above a registry list.
**Use when:**
- `EnhancedStatCard`: dashboards and finance pages. 5 files and 24 JSX uses: `src/app/(dashboard)/security/page.tsx` (7), `src/app/(dashboard)/billing/page.tsx` (5), `src/app/(dashboard)/payments/page.tsx` (4), `src/app/(dashboard)/documents/page.tsx` (4), `src/components/security/visitor-analytics-panel.tsx` (4).
- `RegistryKpiStrip`: the Residents and Houses list pages only (`src/app/(dashboard)/residents/page.tsx`, `src/app/(dashboard)/houses/page.tsx`, 1 use each).

**Do not use in new work:**
- `QuickStatsCard` and `ModernStatsCards`. They do not exist in this branch (0 files, 0 usages). Do not recreate them.
- `ModernStatsCardSkeleton` (`src/components/dashboard/modern-skeleton.tsx:41`) as a loading stand-in for `EnhancedStatCard`. The card has its own `isLoading` prop.
- A hand-built `<Card>` with a number inside. Use `EnhancedStatCard`.

**Contract / notes:**
- `EnhancedStatCard` props: `title`, `value`, `icon`, `isLoading?`, `description?`, `trend?: { value, label, direction: 'up' | 'down' | 'neutral' }`, `accentColor?: 'default' | 'success' | 'warning' | 'danger' | 'info'`, `className?`, `animate?`, `onClick?` (`enhanced-stat-card.tsx:9-24`).
- Long values (currency totals) shrink to fit through `statValueFontSize` (`enhanced-stat-card.tsx:32`). The value parent must be an `@container`.
- `RegistryKpiStrip` props: `items: { label, value, detail?, icon, tone? }[]`, `isLoading?` (`registry-kpi-strip.tsx:4-15`). It stacks one item per row below `sm` (`registry-kpi-strip.tsx:27`). It has no trend chip, by design.
- `DESIGN.md` (Stat cards, line 252) asks for a muted tracked caption, a large tabular value, a trend chip and an icon box. `EnhancedStatCard` matches.
- Status must not rely on colour alone (`DESIGN.md` line 176). `accentColor` must go with the `trend` label or the `description`.
- At 375 px place stat cards in a one-column or two-column grid. Do not set a fixed width.

## Data table (list)

**Canonical:** **None exists, build it.** There is no shared `DataTable`. `@tanstack/react-table` is not a dependency (no match in `package.json` or `src/`). 42 admin files render `<Table>` directly.
**Use when:** a page lists records with sort, pagination and row actions. Until `DataTable` exists, copy the structure of `ResidentsTable` (`src/components/residents/residents-table.tsx:239`) and use these primitives:
- `Table`, `TableHeader`, `TableRow`, `TableCell` from `src/components/ui/table.tsx`.
- `RecordCard` and `RecordCardSkeleton` for phones (`src/components/ui/record-card.tsx`).
- `RecordSortControl` for phone sort (`src/components/ui/record-sort-control.tsx`).

**Do not use in new work:**
- A fourth pagination markup. Today there are three hand-written blocks: `residents-table.tsx:633-714`, `houses-table.tsx:556-582` and `src/app/(dashboard)/billing/page.tsx:571-599`. There are also two shared components. `PaginationControls` (`src/components/ui/pagination-controls.tsx:18`) has 1 usage (`src/components/imports/import-preview.tsx:931`). `SimplePagination` (`src/components/ui/simple-pagination.tsx:82`) has 2 usages and is for short lists only.
- Local `ChevronUp` and `ChevronsUpDown` sort buttons repeated per column (`residents-table.tsx:546-585`).

**How the three reference lists differ today:**

| Concern | Residents | Houses | Invoices |
| --- | --- | --- | --- |
| Table variant | `variant="modern"` (`residents-table.tsx:543`) | default (`houses-table.tsx:461`) | `variant="default"` (`billing/page.tsx:484`) |
| Filter state | `usePersistedState` (`residents-table.tsx:241-249`) | `usePersistedState` (`houses-table.tsx:179-187`) | `useState` (`billing/page.tsx:160-172`), lost on reload |
| Sort | 3 column headers | 4 columns (`houses-table.tsx:186`) | none (`billing/page.tsx:487-495`) |
| Phone layout | `RecordCard` below `md` (`residents-table.tsx:523`) | `RecordCard` (`houses-table.tsx:119`) | `RecordCard` (`billing/page.tsx:83`) |
| Loading | 5 skeleton rows (`residents-table.tsx:593-617`) | 5 skeleton rows (`houses-table.tsx:522-537`) | 5 skeleton rows (`billing/page.tsx:500-511`) |
| Empty | inline block (`residents-table.tsx:315-331`) | inline block with Clear Filters (`houses-table.tsx:296-308`) | one `colSpan={9}` text cell (`billing/page.tsx:514-515`) |
| Error | inline red text (`residents-table.tsx:306-312`) | inline box (`houses-table.tsx:284-291`) | none found |
| Page size | 10, 20, 50 (`residents-table.tsx:650-652`) | "Rows per page" select (`houses-table.tsx:561`) | "Rows per page" select (`billing/page.tsx:571`) |

**Contract / notes (to build `DataTable`, `src/components/ui/data-table.tsx`):**
- Props: `columns` (key, header, `sortable?`, `className?`, `hideBelow?: 'lg' | 'xl'`, `cell(row)`), `rows`, `rowKey`, `isLoading`, `error?`, `emptyState: ReactNode`, `sort` and `onSortChange`, `pagination` (`page`, `pageSize`, `totalCount`, `onPageChange`, `onPageSizeChange`), `onRowClick?`, `renderCard(row)` for phones, `selection?`.
- Sort: a click on a header cycles ascending, descending. Set `aria-sort` on the `th`. Reset `page` to 1 on sort change (`residents-table.tsx:259`).
- Density: one density. Do not add a toggle until a user asks. Rows use the `TableCell` default padding.
- Sticky: `TableHeader` has a `sticky` prop (`table.tsx:46-55`). `DataTable` sets it on. No table pins a first column today (no `sticky left` match in `src/components`). Pin the id column (`resident_code`, invoice number) only when the table scrolls sideways, with `sticky left-0 bg-background`.
- Row actions: the last column, right aligned, header text "Actions". A row click opens the record (`residents-table.tsx:174`). Action buttons call `stopPropagation`.
- Bulk selection: a leading checkbox column and a header checkbox for the page. Only `src/components/payments/payment-table.tsx:132` and `src/components/imports/import-preview.tsx` do this today. A selection bar shows the count and the bulk actions. Each bulk action needs its own write permission.
- Mobile at 375 px: below `md` render `renderCard` rows in a `RecordCard` list with `RecordSortControl`. Both lists stay in the DOM and CSS picks one (`residents-table.tsx:522`). `<Table stack>` (`table.tsx:9-20`) is the lighter option for small settings tables.
- Persist filters, sort and page size with `usePersistedState`, with the key prefix `<domain>-registry:` (`residents-table.tsx:241`).

## Filter bar / search on lists

**Canonical:** **None exists, build it.** Every list builds its own filter row.
**Use when:** a list needs search plus filters. Mirror `HousesTable` (`src/components/houses/houses-table.tsx`): search input with a 300 ms debounce (`houses-table.tsx:205`), `Select` filters, active-filter chips (`houses-table.tsx:224-247`), and `clearAllFilters` (`houses-table.tsx:275`).
**Do not use in new work:**
- Filters in plain `useState` for a registry list. `src/app/(dashboard)/billing/page.tsx:160-172` and `src/components/security/security-contacts-table.tsx:369-371` lose their state on reload.
- A new local `ALL_VALUE = '_all'` constant. 14 admin files declare it separately, for example `src/app/(dashboard)/approvals/page.tsx:50` and `src/components/audit/audit-filters.tsx`.
- `DateRangeFilter` (`src/components/analytics/date-range-filter.tsx:31`) for lists. It takes an `AnalyticsPreset` and is for analytics only.

**Contract / notes:**
- How lists filter today:
  - Residents: search, status, street, role (multi-select), verification (`residents-table.tsx:336-444`). Persisted. Chips for roles and verification only.
  - Houses: search, street, type, occupancy, identifier state. Persisted. Chips for every filter.
  - Invoices: invoice number search, resident picker, status, type, date preset (`billing/page.tsx:356-414`). Not persisted.
  - Audit logs: `AuditFilters` (`src/components/audit/audit-filters.tsx:44`) holds 6 `useState` values and calls `onFiltersChange`.
  - Payments: `PaymentFilters` (`src/components/payments/payment-filters.tsx:19`).
- To build `ListFilterBar` (`src/components/ui/list-filter-bar.tsx`):
  - Props: `search: { value, onChange, placeholder }`, `filters: { id, label, value, options, onChange }[]`, `onClearAll`.
  - It owns and exports the `ALL_VALUE` constant.
  - It renders a chip for each active filter and one "Clear all" button.
  - It calls an `onAnyChange` callback so the page resets `page` to 1.
- Mobile at 375 px: search takes a full row. Filters sit behind one "Filters" button that opens a `ResponsiveSheet` (`variant="sheet"`), with a count badge. Houses already shows an icon-only Add button on phones (`houses-table.tsx:397-405`). Keep that.

## Empty state

**Canonical:** `ModernEmptyState` (`src/components/dashboard/modern-empty-state.tsx:43`) for a page-level empty block. `SettingsEmptyState` (`src/components/settings/settings-states.tsx:7`) inside settings pages.
**Use when:** a list or panel has no records. Props: `icon?`, `title`, `description?`, `className?`, `action?`, `animate?` (`modern-empty-state.tsx:32-39`).
**Do not use in new work:** an inline `<div>` with an icon and text. `ResidentsTable` (`residents-table.tsx:315-331`) and `HousesTable` (`houses-table.tsx:296-308`) do this, and the invoice table uses one text cell (`billing/page.tsx:514`). Only 2 files use the `ModernEmptyState` family (`src/app/(dashboard)/payments/page.tsx`, `src/app/(dashboard)/documents/page.tsx`).

**Contract / notes:**
- Variants in `modern-empty-state.tsx`: `ModernTransactionsEmptyState` (line 88), `ModernPendingPaymentsEmptyState` (102), `ModernActivityEmptyState` (140), `ModernResidentsEmptyState` (154), `ModernPaymentsEmptyState` (168), `ModernHousesEmptyState` (182), `ModernDocumentsEmptyState` (196), `ModernNotificationsEmptyState` (210), `ModernSearchEmptyState` (248), `ModernCustomEmptyState` (272).
- Two empty cases need two messages. "No records yet" shows an add action, gated by the create permission. "No results for these filters" shows a "Clear filters" action. `ResidentsTable` handles only the first. `HousesTable` handles only the second.
- `ModernEmptyState` uses `py-16`, an 80 px icon and `animate-float` (`modern-empty-state.tsx:52-65`). For a table cell, add a `compact` prop (to build) that sets `py-8` and removes the float.
- Inside a table, wrap the block in one `TableCell colSpan={columns}`. On phones render it outside the table in a `rounded-xl border bg-card` box (`residents-table.tsx:533`).

## Loading state

**Canonical:** `Skeleton` (`src/components/ui/skeleton.tsx:8`) for any local placeholder. `DashboardSkeleton` (`src/components/dashboard/dashboard-skeleton.tsx:8`) for route-level `loading.tsx`.
**Use when:** data is loading. `Skeleton` has `variant?: 'default' | 'shimmer' | 'pulse'`, default `shimmer` (`skeleton.tsx:3-8`). 93 files import it.
**Do not use in new work:**
- `ShimmerSkeleton`, `ShimmerLines`, `ShimmerCard` (`src/components/ui/shimmer-skeleton.tsx:71,112,142`). They have 7 callers: 5 resident portal pages, `src/app/(dashboard)/residents/[id]/page.tsx` and `src/components/analytics/revenue-trend-chart.tsx`. `Skeleton` already shimmers by default.
- `ModernSkeleton` and its family (`src/components/dashboard/modern-skeleton.tsx`, 9 exports). Under `src/app/(dashboard)` only `security/page.tsx` imports it. Do not extend it.
- Bare "Loading..." text or a lone `Loader2` spinner for a page body. `src/app/(dashboard)/residents/new/page.tsx` does this in its `Suspense` fallback.

**Contract / notes:**
- Route files: only 6 `loading.tsx` files cover 104 admin pages: `src/app/(dashboard)/loading.tsx`, `dashboard/loading.tsx`, `houses/loading.tsx`, `houses/[id]/loading.tsx`, `payments/loading.tsx`, `residents/loading.tsx`. All other routes fall back to `src/app/(dashboard)/loading.tsx`.
- Rule: a list page shows 5 skeleton rows that match the real columns, as the three reference lists do. Phone lists use `RecordCardSkeleton`.
- Keep the layout stable. The skeleton must have the same height as the loaded content. A stat card uses its `isLoading` prop, not a separate skeleton.
- Settings lists use `SettingsSkeleton` (`settings-states.tsx:29`).
- `DashboardSkeleton` sets `role="status"` and `aria-label` (`dashboard-skeleton.tsx:13`). Any new route-level skeleton does the same.

## Error state

**Canonical:** **None exists as a component, build it.** Route errors use the Next.js `error.tsx` files. List errors are inline.
**Use when:** a fetch fails. Route level: `src/app/(dashboard)/error.tsx` is a `Card` with "Something went wrong", a "Try again" button, a Dashboard link and the error digest. It is the fallback for all 104 pages. Only `src/app/(dashboard)/dashboard/error.tsx` overrides it.
**Do not use in new work:**
- Inline red text such as `Error loading residents: {error.message}` (`residents-table.tsx:306-312`).
- Showing a raw `error.message` to the user without review. The route boundary does this (`src/app/(dashboard)/error.tsx:27`). Raw messages can leak internals.

**Contract / notes:**
- Counts: 2 `error.tsx` files under `src/app/(dashboard)`. No shared error boundary component exists in `src/components` (no file matches `*error-boundary*`).
- To build `ErrorState` (`src/components/ui/error-state.tsx`): props `title?`, `message?`, `onRetry?`, `className?`. It renders an icon, a short plain message and a "Try again" button that calls `onRetry` (for a query, `refetch`). Use it in the table error slot and in `error.tsx`.
- Log the real error with `console.error` and context (`CORE.md` section 13). Show a short safe message.
- At 375 px the card is full width with `p-4`. Buttons stack.

## Status badge

**Canonical:** `Badge` (`src/components/ui/badge.tsx:11`) wrapped in a domain badge, for example `AccountStatusBadge` and `OccupancyBadge` (`src/components/residents/status-badge.tsx:46,71`). 8 files import the residents badges.
**Use when:** a record shows a state. `Badge` variants: `default`, `secondary`, `destructive`, `success`, `warning`, `info`, `outline` (`badge.tsx:12-25`).
**Do not use in new work:**
- `StatusBadge` (`src/components/ui/status-badge.tsx:8`). It matches `DESIGN.md` line 247, but it has 0 admin usages. Its 2 callers are in the resident portal.
- A raw `Badge` with a colour map built in the page, as in `InvoiceStatusBadge` (`src/app/(dashboard)/billing/page.tsx:46,69-73`).

**Contract / notes:**
- `StatusBadge` variants, verbatim: `success`, `warning`, `error`, `info`, `pending`, `active`, `inactive`, `up`, `down` (`status-badge.tsx:11-19`). Sizes: `sm`, `md`, `lg`. Other props: `showIcon?`, `icon?`, `pulse?`. The default variant is `info` and the default size is `md`.
- Conflict between the design file and the code: `DESIGN.md` describes the `StatusBadge` variants, and admin code uses `Badge`. See Backlog for the decision.
- Until then, add new domain badges beside `src/components/residents/status-badge.tsx`: one `Record<State, { variant, label }>` map defined outside the component, and `memo` on the component (`status-badge.tsx:7-12,46`).
- Status colours for dashboard tiles come from `STATUS_COLORS` (`src/components/dashboard/status-colors.ts:12`). Do not use the `status-*` tokens (`status-colors.ts:2-4`).
- A badge must carry a text label. Colour alone is not enough (`DESIGN.md` line 176).

## Icon wrapper

**Canonical:** `IconBox` (`src/components/ui/icon-box.tsx:25`)
**Use when:** an icon anchors a card, a section heading or a form. 10 files import it, 6 of them admin (for example `src/components/settings/settings-section.tsx` and `src/components/houses/house-form.tsx`).
**Do not use in new work:** a hand-built `div` with `bg-primary/10` around an icon. `EnhancedPageHeader` does this at `page-header.tsx:49`. It is a private copy, not a use of `IconBox`.

**Contract / notes:**
- Props, verbatim: `color?: 'pink' | 'blue' | 'purple' | 'orange' | 'green' | 'cyan'` (default `'blue'`), `size?: 'sm' | 'md' | 'lg'` (default `'md'`), `children` (`icon-box.tsx:21-33`).
- Sizes: `sm` 40 px, `md` 48 px, `lg` 56 px (`icon-box.tsx:35-39`). Pass the icon as `children`.
- `DESIGN.md` line 250 says the tint comes from a five-colour chart set. The code has six colours and uses CSS classes `icon-box-<color>` (`icon-box.tsx:41-48`). Check the stylesheet before adding a colour.
- The box is decorative. Set `aria-hidden` on the icon unless the icon alone carries meaning.

## Dialog, sheet or drawer for create and edit

**Canonical:** a full page for create and edit of a main record. `ResponsiveSheet` (`src/components/ui/responsive-sheet.tsx`) for quick views and bulk tools.
**Use when:**
- Main record (resident, house): a page. Create is `/residents/new` and `/houses/new`. Edit is the same form on the detail route, switched by `?edit=true` (`src/app/(dashboard)/residents/[id]/page.tsx:74`) or by an `isEditing` flag (`src/app/(dashboard)/houses/[id]/page.tsx:90`).
- Read-mostly preview from a list: `ResponsiveSheet` with `variant="drawer"` (`src/components/residents/resident-quick-view.tsx:27`, `src/components/houses/house-quick-view.tsx`).
- Multi-row tool: `ResponsiveSheet` with `variant="drawer" drawerWidth="lg"` (`src/components/payments/bulk-payment-sheet.tsx:83,109`).
- Small settings record (a tag, a category): a `Dialog` (`src/components/ui/dialog.tsx`) opened from a settings list.

**Do not use in new work:** a raw `Sheet` (`src/components/ui/sheet.tsx`) or `Dialog` when `ResponsiveSheet` fits.

**Contract / notes:**
- `ResponsiveSheet` variants: `'drawer'` (right-side panel on desktop, for detail views), `'modal'` (centred dialog on desktop, for forms), `'sheet'` (always a bottom sheet) (`responsive-sheet.tsx:22-33`). On phones every variant is a bottom sheet.
- Options: `drawerWidth` `'sm' | 'md' | 'lg' | 'xl' | 'full'` (`full` is `max-w-[600px]`), `modalSize` `'sm' | 'md' | 'lg' | 'xl'`, `mobileHeight`, `className` (`responsive-sheet.tsx:40-62`).
- Usage is small: 3 admin components. No admin form uses `variant="modal"` today.
- Rule: if the form has more than 6 fields, or needs a route (deep link, back button), use a page. Otherwise use `ResponsiveSheet variant="modal"`.
- At 375 px a sheet fills the width, the form scrolls inside, and the submit button stays visible.

## Form layout

**Canonical:** React Hook Form with `zodResolver` and the `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage` set from `src/components/ui/form.tsx`. Reference: `ResidentForm` (`src/components/residents/resident-form.tsx`, 842 lines). Smaller reference: `HouseForm` (`src/components/houses/house-form.tsx`, 458 lines).
**Use when:** any admin form. Use `z.guid()` for ids read from the database, not `z.uuid()` (Zod 4 rejects Residio ids).
**Do not use in new work:** uncontrolled forms with local `useState` per field, and hand-built error text.

**Contract / notes:**
- Setup: `useForm<T>({ resolver: zodResolver(schema), defaultValues })` (`resident-form.tsx:105-106`, `house-form.tsx:51-52`).
- Grouping: one `<div className="space-y-4">` per group with an `<h3 className="text-lg font-medium">` title (`resident-form.tsx:321-322`). Groups: Personal Information, Entity Type, House Assignment, Emergency Contact, Notes.
- Grid: `grid gap-4 md:grid-cols-2`, and `md:grid-cols-3` for the emergency contact (`resident-form.tsx:323,697`). One column below `md`.
- Form width: `space-y-6 max-w-3xl` for residents, `max-w-2xl` for houses (`resident-form.tsx:319`, `house-form.tsx:131`). Use `max-w-3xl` for new forms.
- Labels: above the field, through `FormLabel`. A required field ends its label text with ` *` (`resident-form.tsx:329`). Optional fields have no suffix.
- Errors: `FormMessage` under each field. A failed submit shows `toast.error` (`resident-form.tsx:205,244`).
- Submit: at the end of the form, left aligned, in `flex gap-4`. The primary button comes first ("Create Resident" or "Update Resident"), then `Cancel` as an outline button that calls `router.back()` (`resident-form.tsx:829-836`). The primary label changes to "Saving..." and the button is disabled while saving.
- Gap: the submit row is not sticky. On a long form at 375 px the button sits below the fold. To build: make the submit row `sticky bottom-0` with a background below `md`.
- Settings forms use `SettingsPageHeader` with `isDirty` and `onSave` for a sticky save bar (`settings-page-header.tsx:80-98`). That pattern is for settings only.
- Write actions need `authorizePermission()` and `logAudit()` (`CORE.md` section 6). Hide the submit button when the user lacks the write permission.

## Confirmation for destructive actions

**Canonical:** `ConfirmAction` (`src/components/ui/confirm-action.tsx:41`)
**Use when:** an action charges, deletes, locks out or sends (`confirm-action.tsx:39-40`). It has 12 usages, for example `src/components/settings/billing/levies-section.tsx` and `src/components/expenditure/expenditure-client.tsx`.
**Do not use in new work:** a hand-built `AlertDialog` with `AlertDialogAction`. About 30 admin files still do this, including `ResidentArchiveDialog` (`src/components/residents/resident-archive-dialog.tsx:102-133`) and `src/components/imports/delete-import-dialog.tsx`.

**Contract / notes:**
- Props: `trigger?`, `open?`, `onOpenChange?`, `title`, `description?`, `confirmLabel`, `destructive?`, `loadPreview?`, `renderPreview?`, `confirmWord?`, `onConfirm` (`confirm-action.tsx:19-33`).
- `loadPreview` runs a read-only dry run each time the dialog opens. The confirm button stays disabled until the preview loads, and stays disabled when it fails (`confirm-action.tsx:72-74`).
- `confirmWord` makes the admin type a word before the button enables (`confirm-action.tsx:73,121-130`).
- The dialog stays open if `onConfirm` throws. The caller reports its own error (`confirm-action.tsx:76-86`).
- Archive resident: an `AlertDialog` with an impact summary (`ArchiveImpactSummary`, `resident-archive-dialog.tsx:22`). It counts house assignments, outstanding payments and notes. It needs no typed word. Cancel comes first and the confirm button uses `bg-destructive`.
- Rule: every irreversible action shows what it will change. Use `loadPreview` for the impact summary. Add `confirmWord` only when the action cannot be undone and affects money or many records.
- Disable the confirm button while the action runs, to stop a double submit.
- At 375 px the footer buttons stack, with confirm last.

## Toast / feedback

**Canonical:** `toast` from `sonner` (`package.json`: `sonner ^2.0.8`). The `Toaster` wrapper is `src/components/ui/sonner.tsx`, mounted once in `src/components/providers.tsx:86`.
**Use when:** a server action finishes or fails and the user stays on the page. 135 files import `sonner`. Call counts: `toast.error` 366, `toast.success` 294, `toast.info` 18, `toast.warning` 12.
**Do not use in new work:** any other toast library or a `use-toast` hook. None exists in `src/` (no match for `use-toast`, `react-hot-toast` or `ui/toast`). Do not use `alert()`.

**Contract / notes:**
- There is no shared helper. Each caller writes its own message, for example `toast.success('Resident updated successfully')` and `toast.error(error instanceof Error ? error.message : 'An error occurred')` (`resident-form.tsx:235,244`).
- To build: `notify.success(message)` and `notify.error(error, fallback)` in `src/lib/notify.ts`. `notify.error` shows the fallback when the error is not an `Error`, and logs the original with `console.error`. This removes the repeated ternary.
- Wording: success says what changed ("Resident updated"). Error says what failed and what to do. Do not show raw database messages.
- Use a toast for a result. Use `FormMessage` for a field error. Use `ErrorState` for a failed page load.
- Colours come from the `success`, `info`, `warning` and `destructive` tokens (`sonner.tsx:22-27`).
- At 375 px keep messages under two lines.

## Summary table

| Job | Canonical | Status |
| --- | --- | --- |
| Page header | `EnhancedPageHeader` | exists with a back control; 13 raw `<h1>` files remain |
| Stat / KPI card | `EnhancedStatCard`, `RegistryKpiStrip` | exists but inconsistent (two components, 5 and 2 files) |
| Data table | none | to build (`DataTable`; 42 files with their own markup) |
| Filter bar / search | none | to build (`ListFilterBar`) |
| Empty state | `ModernEmptyState` | exists but inconsistent (2 files use it; lists use inline blocks) |
| Loading state | `Skeleton`, `DashboardSkeleton` | exists but inconsistent (6 `loading.tsx` for 104 pages) |
| Error state | none (`error.tsx` only) | to build (`ErrorState`) |
| Status badge | `Badge` plus domain badges | exists but inconsistent (`StatusBadge` has 0 admin usages) |
| Icon wrapper | `IconBox` | exists |
| Dialog / sheet / drawer | page, `ResponsiveSheet` | exists but inconsistent (3 admin users; no `modal` use) |
| Form layout | RHF + Zod + `Form*` | exists but inconsistent (widths differ; submit not sticky) |
| Destructive confirmation | `ConfirmAction` | exists but inconsistent (12 users against about 28 raw `AlertDialog` files) |
| Toast / feedback | `sonner` `toast` | exists (no shared helper) |

## Backlog candidates

- Build `DataTable` with sort, pagination, `renderCard` and selection. Replaces 3 hand-written pagination blocks and about 42 `<Table>` files.
- Build `ListFilterBar` with persisted state and active chips. Replaces filter rows in 5 lists and 14 copies of `ALL_VALUE`.
- Build `ErrorState` and use it in list error slots. Replaces inline error text in 2 reference lists.
- Move the remaining about 11 hand-built back buttons to `backHref` and `backLabel`.
- Move 13 raw `<h1>` pages to `EnhancedPageHeader`.
- Make list empty states use `ModernEmptyState` with a `compact` prop. 2 files use it today.
- Decide `StatusBadge` versus `Badge` (0 admin usages of `StatusBadge`). Then fix `DESIGN.md` or the code.
- Move about 28 raw `AlertDialog` files to `ConfirmAction` (12 users today), starting with `ResidentArchiveDialog`.
- Add `loading.tsx` to high-traffic routes (`billing`, `security`, `documents`, `approvals`). 6 of 104 pages have one.
- Add `notify.success` and `notify.error` over `sonner` (about 690 direct calls).
- Make the form submit row sticky below `md`, and set one form width.
- Retire `ShimmerSkeleton` (7 callers) and stop extending `ModernSkeleton`.
- Persist invoice list filters with `usePersistedState` (`billing/page.tsx:160-172`).
