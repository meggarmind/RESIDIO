# Layout and shell

This page documents the admin shell as the code builds it today. It lists the facts first, with `path:line` references. It then states the rules. All paths are under `src/` unless stated. This page is part of the admin portal design guide (#1145). The Resident Portal is out of scope (CORE.md section 3).

## Shell structure

The route group `(dashboard)` wraps every admin page in two components.

- `app/(dashboard)/layout.tsx:9-13` renders `DashboardProviders` and, inside it, `DashboardShell`.
- `components/dashboard/dashboard-providers.tsx:6-13` reads the effective theme with `useEffectiveTheme('admin-dashboard')`. It wraps children in `VisualThemeProvider context="admin-dashboard"`. It falls back to the id `'default'`, which the provider migrates to `'supabase'` (`contexts/visual-theme-context.tsx:69-84`).
- `app/template.tsx:6-17` remounts on every navigation. It wraps the page in `PageTransition`. All of Settings shares the one key `/settings`.

`components/dashboard/dashboard-shell.tsx:13-29` builds the frame. The order is fixed:

1. Root `div`: `fixed inset-0 flex h-dvh overflow-hidden` (`dashboard-shell.tsx:13`).
2. `<Sidebar className="hidden md:flex" />` (`dashboard-shell.tsx:15`).
3. `<MobileNav>` sheet, opened by state in the shell (`dashboard-shell.tsx:18`).
4. Column: `flex flex-1 flex-col transition-all duration-300 ease-in-out overflow-hidden` (`dashboard-shell.tsx:21`). It holds, in order:
   - `OpsStatusBanner` (`dashboard-shell.tsx:22`).
   - `Header` with `onMenuClick` (`dashboard-shell.tsx:24`).
   - `<main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6 transition-all duration-300">` (`dashboard-shell.tsx:25`).

The page body does not scroll. Only `<main>` scrolls. `<main>` pads 16px on phones and 24px from `md` (`p-4 md:p-6`). A page must not add its own outer page padding.

## Sidebar

File: `components/dashboard/sidebar.tsx`. It shows from `md` upward (`hidden md:flex`, `dashboard-shell.tsx:15`).

### Navigation items

The single source is `config/navigation.ts`. `ADMIN_NAV_SECTIONS` is in `navigation.ts`. Labels below are verbatim.

| Section id | Header label | Items (title, href) |
| --- | --- | --- |
| `core` | none (`label: null`) | `Dashboard` `/dashboard` |
| `people-property` | `People & Property` | `Residents` `/residents`; `Houses` `/houses`; `Contractors & Staff` `/personnel` |
| `financial` | `Financial` | `Transactions` `/payments`; `Invoices & Dues` `/billing`; `Expenditure` `/expenditure` |
| `operations` | `Operations` | `Security` `/security`; `Documents` `/documents`; `Announcements` `/announcements`; `Approvals` `/approvals`; `Capital Projects` `/projects` |
| `admin` | `Admin` | `Oversight` `/system`; `Settings` `/settings` |

Children (`navigation.ts`):

- `Transactions` (`:130-157`): `Import Statement` `/payments/import`; `Import History` `/payments/imports`; `Import Email` `/payments/email-imports`.
- `Invoices & Dues` (`:166-174`): `Generate Invoices` `/billing/generate`.

Other item fields:

- `Announcements` has `mobileLabel: 'News'` (`navigation.ts:227`).
- `Approvals` has `showBadge: true` and `badgeType: 'approvals'` (`navigation.ts:236-237`).
- `Oversight` is one flat entry with no `children`. Its href is the first Oversight page the user may open (`/system` for the overview), and the entry is active on any Oversight page. Its pages are listed in the Oversight left menu (`config/oversight-nav.ts`, rendered by `OversightLayout`), and its permissions are the union of that menu's, so a role that holds one page still sees the entry. `Analytics` and `Reports` are in that menu, not in the sidebar.

### Permission filtering

`hooks/use-navigation.ts:142-179` (`useSectionedNavigation`) filters the sections. The sidebar and the mobile nav both use it.

- An item with `permissions` shows if the user holds at least one (`hasAnyPermission`, OR logic) (`use-navigation.ts:148-152`).
- An item without `permissions` shows to every signed-in user.
- While auth loads (`isLoading`), all items show. This avoids a flash (`use-navigation.ts:148`).
- The filter runs on children. If no child survives, `children` becomes `undefined` (`use-navigation.ts:154-164`).
- A section with no remaining item is removed (`use-navigation.ts:175`).
- A parent that fails its own check drops its whole subtree (`use-navigation.ts:148-152`).

### Collapse, expand and hover

State hook: `hooks/use-sidebar-state.ts`.

- Collapsed state persists in `localStorage` under `residio-sidebar-collapsed` (`use-sidebar-state.ts:5,18,30`). A storage error falls back to expanded.
- `isExpanded = !isCollapsed || isHoverExpanded` (`use-sidebar-state.ts:36`).
- Width is `w-64` when expanded and `w-16` when not (`sidebar.tsx:66`). Nav padding is `px-4` expanded and `px-2` collapsed (`sidebar.tsx:125`).
- When collapsed, pointer enter sets hover expand. Pointer leave clears it (`sidebar.tsx:73-74`). A toggle clears hover (`use-sidebar-state.ts:32`).
- The toggle button has `aria-label` `Collapse sidebar` or `Expand sidebar` (`sidebar.tsx:119`). It hides while the rail is collapsed and not hovered (`sidebar.tsx:106`).
- Section headers show only when expanded (`sidebar.tsx:130`). An unlabeled section after the first shows a 1px divider (`sidebar.tsx:139-141`).
- In the collapsed rail each item is a `Link` with a right-side `Tooltip` that shows `item.title` (`sidebar.tsx:210-218`). Children do not render in the rail (`sidebar.tsx:231`).
- When expanded, a parent with children renders its label as a `Link` to the parent's href, and a separate chevron `button` (`aria-expanded`) toggles the submenu (`sidebar.tsx:176-224`). Clicking the label also opens the submenu. In the collapsed rail it is a plain `Link`. Submenu state lives in `hooks/use-sidebar-nav-state.ts`. It is held outside React, because `app/template.tsx` remounts the sidebar (`sidebar.tsx:42-47`). A menu the user never touched opens by itself when a child route is active (`sidebar.tsx:147`).
- The nav scrolls on its own: `min-h-0 flex-1 overflow-y-auto` (`sidebar.tsx:125`, issue #1009).
- Active style: a parent or item gets `bg-primary/10 text-primary shadow-sm inner-border` and a 4px left bar `before:bg-primary` (`sidebar.tsx:156-159`). An active child gets `var(--accent-primary)` background and `var(--text-on-accent)` text (`sidebar.tsx:247-253`). An item is active on an exact path match only (`sidebar.tsx:144`).
- `Settings` shows a `bg-warning` dot when maintenance mode or the communications override is on (`sidebar.tsx:149,198-204`).
- `Approvals` shows a `destructive` `Badge` with the pending count when it is above 0 (`sidebar.tsx:148,180-187`).

### Brand block and footer

The top block shows the estate logo when set (`useEstateLogo`) and the rail is expanded. Otherwise it shows the letter `R`, and the word `Residio` when expanded (`sidebar.tsx:79-98`).

The footer is `sidebar.tsx:284-482`. From top to bottom:

1. `ThemeSwitcher`, only when expanded (`sidebar.tsx:290`). Options: `Light`, `Dark`, `System` (`components/ui/theme-switcher.tsx:16-18`).
2. `My Portal` link to `/portal`, if `canSeeSelfPortalLinks` (`sidebar.tsx:293-338`).
3. `View as Resident` button to `/portal?impersonate=true`, if `canSeeImpersonationLink` (`sidebar.tsx:341-389`).
4. Profile link to `/profile`: initial, `full_name`, role with title (`sidebar.tsx:415-439`).
5. Build identity (`data-testid="build-info"`): `buildLabel.short`, plus an environment `Badge`. The text is `STAGE` (variant `warning`) for staging and `DEV` (variant `info`) for development. Production shows no badge (`sidebar.tsx:35-40,458-479`). Collapsed, only the badge shows, and only if it exists (`sidebar.tsx:443-457`). The tooltip shows `buildLabel.full`.

## Header

File: `components/dashboard/header.tsx`. It is sticky: `sticky top-0 z-40 w-full px-4 pt-4` (`header.tsx:71`). The bar is `flex h-16 ... rounded-2xl border shadow-sm backdrop-blur-md bg-background/80` (`header.tsx:72-77`).

Left, in order:

- Menu button, `md:hidden`, `aria-label` `Open navigation menu` (`header.tsx:80-89`).
- System status dot that links to `/system`. Tooltip: `System Operational`. It is always green and does not read real status (`header.tsx:91-109`).
- Greeting on `/dashboard` only, `hidden md:block`: `Good morning|afternoon|evening, <first name>`, or `Dashboard` before the profile loads (`header.tsx:113-121`).
- Mobile page identity, `md:hidden`: `Dashboard` on `/dashboard`, else `AdminBreadcrumb` (`header.tsx:124-130`).
- Desktop breadcrumb, `hidden lg:block`, max width `200px`, `xl:max-w-none` (`header.tsx:132-134`).

Center: a button, not an input, with the text `Search`. It opens `GlobalSearchCommand` (`header.tsx:138-157`). The button shows no shortcut hint.

Right, in order: Quick Actions menu, `NotificationBell` (`header.tsx:228`), profile menu.

### Global search

File: `components/dashboard/global-search-command.tsx`.

- `Cmd+K` on macOS or `Ctrl+K` elsewhere toggles the dialog (`global-search-command.tsx:307-310`). The label comes from `useOS` (`:328`).
- `Cmd/Ctrl+1` to `Cmd/Ctrl+5` work only while the dialog is open (`:315`). Each key opens the Nth result in the rendered order. It is not a fixed jump to a module. The group order is `action`, `resident`, `house`, `payment`, `security`, `document`, `settings`, `system` (`:84`). The badge numbers come from the same list (`lib/search/global-search-order.ts`, `MAX_SEARCH_SHORTCUTS = 5`).
- Input placeholder: `Search or type a command...` (`:344`). Hint text: `Type at least 2 characters to search` (`:451`). Footer: `Navigate with ↑↓ arrows, select with Enter` (`:515`).
- Group headings (`:67-76`): `Residents`, `Properties`, `Payments`, `Security Contacts`, `Documents`, `Quick Actions`, `Settings`, `System`. Also `Recent Searches` (`:395`).
- Palette Quick Actions come from `lib/search/quick-actions.ts`: `Add New Resident` `/residents/new`; `Create Invoice` `/billing`; `Add House` `/houses/new`; `View Security Log` `/security/logs`. Each needs all its listed permissions (`hasAllPermissions`, `:121`).
- Settings and System entries show from 2 characters. They use OR permissions (`:151-177`).

### Quick Actions menu

The menu label is `Quick Actions` (`header.tsx:186`). The trigger `aria-label` is `Open quick actions` (`header.tsx:168`). Items, verbatim (`header.tsx:189-224`):

| Label | Href |
| --- | --- |
| `Add Resident` | `/residents?action=create` |
| `Add House` | `/houses?action=create` |
| `Create Invoice` | `/billing?action=create` |
| `Import Statement` | `/payments/import` |
| `Generate Report` | `/reports/new` |
| `Security Contact` | `/security?action=create` |

This menu has no permission filter. It also differs from the palette Quick Actions in labels and hrefs (see R-SHL-9).

### Profile menu

The trigger `aria-label` is `Open profile menu` (`header.tsx:236`). It renders only after mount (`header.tsx:230`). Content (`header.tsx:249-299`):

- Greeting, `full_name`, a `BadgeCheck` icon, and `email`.
- If `canSeeSelfPortalLinks`: a `Resident Portal` link to `/portal`. Otherwise a row with the role and title.
- If the AI assistant is dismissed: `Show AI Assistant`.
- `Sign out`, or `Signing out...` while pending. Destructive style.

## Breadcrumb

File: `components/dashboard/admin-breadcrumb.tsx`. The header renders it. A page does not.

How it works:

1. It reads `usePathname()` only (`admin-breadcrumb.tsx:57`). It splits the path on `/` (`:60`).
2. On `/dashboard` it returns `null` unless `hideDashboard` is set (`:63-65`). The header always passes `hideDashboard`, so the trail never starts with `Dashboard` and the `Home` icon never shows (`header.tsx:128,133`).
3. It skips the segment `dashboard` (`:75`). Each other segment adds one item. The href is the path so far (`:77-80`).
4. Label lookup: `pathLabels[segment]` (`:19-48`). If missing, the segment with the first letter upper-cased and each `-` turned into a space (`:100`).
5. Id detection: `isUUID` tests the regex `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` (`:51-54`). A match takes its label from the previous segment: `residents` gives `Resident Details`, `houses` gives `Property Details`, `payments` gives `Payment Details`, `billing` gives `Invoice Details`, `documents` gives `Document Details`, `email-imports` and `import` give `Import Details`. Any other parent gives `Details` (`:88-98`).
6. The last item is plain text with `aria-current="page"`. Earlier items are links (`:119-131`).

What a page cannot do:

- `AdminBreadcrumbProps` has only `hideDashboard` and `className` (`:13-16`). There is no label prop, no context and no slot.
- A page cannot set its own trail or rename a segment. A resident name never appears in the trail.
- An id that is not a UUID is shown as a capitalized segment, not as `... Details`.
- The layout renders the trail. A change to the trail needs a change in `header.tsx` or `admin-breadcrumb.tsx`.

## Mobile shell

File: `components/dashboard/mobile-nav.tsx`.

- Trigger: the header menu button, `md:hidden` (`header.tsx:83`). The shell holds the open state (`dashboard-shell.tsx:10,18,24`).
- Container: a `Sheet` from the left, `w-72 p-0` (`mobile-nav.tsx:42`). Header: estate logo, or `R` and `Residio` (`:43-59`). Screen-reader description: `Navigate between administration areas and account controls.` (`:61`).
- Content: the same sections and permission filter as the sidebar (`mobile-nav.tsx:36,66`). Item text is `item.mobileLabel ?? item.title` (`:95`), so `Announcements` shows as `News`. Children always show (`:104-128`). Each link closes the sheet (`:85`).
- Active item: `pathname === href` or a sub-path (`:75`). The active style is `bg-primary text-primary-foreground`. Each link is at least `min-h-[44px]`.
- Footer: `ThemeSwitcher variant="compact"`, initial, `full_name` and role (`:137-149`). There is no build label, no approvals badge, no `My Portal` link and no collapse state.
- `MOBILE_NAV_IDS` and `useMobileNavigation` exist (`navigation.ts:401-407`, `use-navigation.ts:120-125`). `MobileNav` does not use them.

What changes at `md` (768px) and `lg` (1024px):

| Part | Below `md` | `md` to below `lg` | `lg` and up |
| --- | --- | --- | --- |
| Sidebar | hidden | shown | shown |
| Menu button | shown | hidden | hidden |
| `<main>` padding | `p-4` | `p-6` | `p-6` |
| Breadcrumb | shown in header | hidden | shown |
| Dashboard heading | `Dashboard` | greeting | greeting |

Between `md` and `lg`, no breadcrumb shows on any page (`header.tsx:124,132`).

## Theme and tokens

File: `app/globals.css`.

- Tailwind 4: `@import "tailwindcss"` (`:1`). Dark mode is a class: `@custom-variant dark (&:is(.dark *))` (`:5`). Use `dark:` variants and the `.dark` class. Do not use `prefers-color-scheme` in the admin app.
- `:root` token names (`:143-188`): `--radius`, `--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`, `--popover-foreground`, `--primary`, `--primary-foreground`, `--secondary`, `--secondary-foreground`, `--muted`, `--muted-foreground`, `--accent`, `--accent-foreground`, `--destructive`, `--destructive-foreground`, `--border`, `--input`, `--ring`, `--chart-1` to `--chart-5`, `--sidebar`, `--sidebar-foreground`, `--sidebar-primary`, `--sidebar-primary-foreground`, `--sidebar-accent`, `--sidebar-accent-foreground`, `--sidebar-border`, `--sidebar-ring`.
- `.dark` (`:190-227`) defines the same set, except `--radius`.
- A second `:root` block holds the layout variables `--layout-container-max`, `--layout-grid-gap`, `--layout-card-padding`, `--layout-section-gap`, `--layout-icon-size`, `--layout-title-size`, `--layout-heading-size` (`:374-396`). The class `.layout-expanded` overrides them.
- Color format: the base tokens are all OKLCH. Literal hex values exist in three places: `:466`, `:702` and `:740` (`#0EA5E9`, `#22D3EE`, `#14B8A6`). The file also has 55 `rgb` or `rgba` values (for example `:328`, `:451`). Current state: a "0 hex" goal is not met.
- The sidebar reads legacy variables (`--bg-card`, `--border-default`, `--text-primary`, `--text-secondary`, `--text-muted`, `--bg-hover`, `--accent-primary`, `--text-on-accent`, `--bg-elevated`, `--border-subtle`) through inline `style` (`sidebar.tsx:69-72`). The provider sets them at runtime (`contexts/visual-theme-context.tsx:270-336`).
- The theme registry is `lib/themes/tweakcn-registry.ts`. There is no `registry.ts`. Ids: `supabase`, `doom-64`, `catppuccin`, `elegant-luxury`, `tangerine`, `caffeine`, `ocean-breeze`, `northern-lights`, `retro-arcade`, `twitter`. The default is `supabase` (`tweakcn-registry.ts:1016-1018`). The provider rewrites unknown and legacy ids, including `default`, to `supabase` (`visual-theme-context.tsx:69-84`).
- The registry is a user setting. It is not a design target. Design and audit against the default theme (`supabase`), in light and dark. `DESIGN.md` calls it the "Default theme". Its id is `supabase`.

### Stale docs

- `docs/ui/sidebar-expand-collapse.md`: the width snippet uses `isCollapsed ? 'w-16' : 'w-64'`. The code uses `isExpanded ? 'w-64' : 'w-16'` (`sidebar.tsx:66`), so hover expansion also widens the rail. The color table says the active background is `var(--accent-primary)`. For top-level items the code uses `bg-primary/10 text-primary` and a left bar. The doc omits the nav scroll fix, the `Settings` dot, the approvals badge, `My Portal`, `View as Resident` and the build label.
- `docs/ui/visual-theme-system.md`: it lists `midnight-bloom` as a theme. The registry has no such id. The provider treats it as legacy and maps it to `supabase` (`visual-theme-context.tsx:75`). The example `setThemeId('zinc')` uses an id that does not exist. It says "10+" themes. The registry has 10.
- `config/navigation.ts:79-83` names `ModernSidebar` as a consumer. No such component exists in `components/dashboard/`.

## Rules

- **R-SHL-1.** A page never renders its own sidebar, header, breadcrumb or outer page padding. The shell owns them (`dashboard-shell.tsx:13-29`).
- **R-SHL-2.** Add a navigation item to `config/navigation.ts` and nowhere else. Do not hard-code links to other pages in a sidebar, a menu or a page frame.
- **R-SHL-3.** Give every navigation item a `permissions` list. Use the view permission of the target route. Do not rely on the route guard alone.
- **R-SHL-4.** A navigation title is a noun for a registry (`Residents`, `Documents`) and a verb phrase for an action (`Generate Invoices`, `Import Statement`). Use Title Case. Use one name for one thing in the sidebar, the palette, the Quick Actions menu and the page title.
- **R-SHL-5.** Give a long title a `mobileLabel` of 12 characters or fewer.
- **R-SHL-6.** Put a new live-state page under `System` as a flat item. Do not nest it under a gated parent (`navigation.ts:248-261`).
- **R-SHL-7.** The breadcrumb cannot be overridden. A detail page adds a visible `Back` control that names its parent, for example `Back to Residents` (`app/(dashboard)/residents/[id]/page.tsx:206`). To get a specific label for a path segment, add it to `pathLabels` (`admin-breadcrumb.tsx:19`).
- **R-SHL-8.** Style with Tailwind semantic classes (`bg-primary`, `text-muted-foreground`, `border-border`) or OKLCH tokens. Do not add hex or `rgba` literals to components or `globals.css`. Use `dark:` variants. Do not use `prefers-color-scheme`.
- **R-SHL-9.** The header Quick Actions menu and the palette Quick Actions list the same actions with the same labels and hrefs, filtered by the same permissions.
- **R-SHL-10.** A create shortcut (a link with `?action=create`) shows only to a user who holds the create permission (CORE.md section 6).
- **R-SHL-11.** A status indicator shows real state and carries a text label. Color alone is not enough (`DESIGN.md`, "The Status Is Never Color Alone Rule").
- **R-SHL-12.** Test every shell change at three widths: below `md`, from `md` to below `lg`, and from `lg`. Test the sidebar expanded, collapsed and hover-expanded.

Violations in the current code:

- R-SHL-8. Current state: `header.tsx:96,99,100,177,178,257` use `emerald-*`, `orange-*` and `blue-500` classes and an `rgba(249,115,22,0.1)` shadow. `sidebar.tsx` uses inline `style` with legacy variables instead of Tailwind semantic classes. `globals.css:466,702,740` hold hex.
- R-SHL-9. Current state: the header menu has `Add Resident`, `Add House`, `Create Invoice`, `Import Statement`, `Generate Report`, `Security Contact` (`header.tsx:189-224`). The palette has `Add New Resident`, `Create Invoice`, `Add House`, `View Security Log` (`quick-actions.ts`). The hrefs differ (`/residents?action=create` against `/residents/new`).
- R-SHL-10. Current state: the header Quick Actions items have no permission filter (`header.tsx:189-224`).
- R-SHL-11. Current state: the system status dot is always green with the tooltip `System Operational` (`header.tsx:91-109`). It does not read `useOpsStatus`.
- R-SHL-5. Current state: only `Announcements` has a `mobileLabel`.
- R-SHL-4. Current state: one concept has several names. `/payments` is `Transactions` in the sidebar, `Payments` in the palette group and in the breadcrumb. `/billing` is `Invoices & Dues` in the sidebar and `Billing` in the breadcrumb.
- R-SHL-3. Current state: `Dashboard` has no `permissions` (`navigation.ts:85-90`). This is deliberate: every admin may open it.

## Open questions

- I did not find where the class `.layout-expanded` is applied. I do not know if the Expanded layout mode is live.
- The profile link targets `/profile`. An inline comment says "Assuming a profile page exists" (`sidebar.tsx:416`). I did not check that the route exists.
- I did not check that the routes `/reports/new`, `/residents/new` and `/houses/new` exist.
- This page does not document the internals of `NotificationBell` (`components/notifications/notification-bell.tsx`).
- This page does not document the content or the trigger conditions of `OpsStatusBanner`.
- I did not check how the `.dark` class is set on `<html>`, or how `ThemeSwitcher` and `VisualThemeProvider` interact with it.
