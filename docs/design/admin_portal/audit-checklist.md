# Audit checklist

How to audit one admin page against this guide, and the checks to run. Checks have stable ids.
Numbers are never reused; a retired check keeps its id with the note "retired".

## Procedure

1. Name the page by route (for example `/residents/[id]`) and its archetype from
   `page-patterns.md`. A page that fits no archetype is finding `HDR-01` by itself.
2. Read `exceptions.md`. A check listed there for this page is recorded as `waived`, not run.
3. Open the page as `admin@residio.test` on the dev server, desktop width and 375 px. Then open it
   as each role in `personas.md` that owns a task starting there.
4. Run every check below in order. Record `pass`, `fail` or `n/a` (with the reason). Each `fail`
   carries evidence: a `path:line` for a code fact, a screenshot or an element description for a
   visual fact.
5. Walk the task scenarios from `personas.md` for this page. Record each as `done`, `done with
   workaround` or `not possible`.
6. Write the report in the format below. Do not compute a score. Do not file issues; put findings
   in `backlog.md` unless the owner asked for issues.

## Severity

| Severity | Meaning | Example |
| --- | --- | --- |
| `blocker` | A persona task cannot be finished on this page | Save button hidden off-screen at 375 px |
| `major` | The task finishes with friction, or there is a data or money risk | Destructive confirm button reads "OK" |
| `minor` | Inconsistency with the guide that does not slow the task | A second stat-card component |
| `nit` | Cosmetic | Caption casing differs from the rest of the page |

Mobile findings use the same scale as desktop findings.

## Checks

### SHL: shell

| Id | Check | Principle |
| --- | --- | --- |
| `SHL-01` | The page renders inside the dashboard shell and does not render its own sidebar, header or breadcrumb | 4 |
| `SHL-02` | The page is reachable from `src/config/navigation.ts` or from a parent page's primary action; no page is reachable only by typing the URL | 1 |
| `SHL-03` | The matching sidebar item (or its parent) shows the active state on this route | 3 |
| `SHL-04` | The page's route has an entry in `ROUTE_PERMISSIONS` and the sidebar hides it for roles without that permission | 11 |

### NAV: navigation and wayfinding

| Id | Check | Principle |
| --- | --- | --- |
| `NAV-01` | The breadcrumb trail derived from the route reads correctly; a record page shows the record's name or code, not its id | 6 |
| `NAV-02` | A record, form or wizard page has a Back control that returns to the registry with its filters kept | 5 |
| `NAV-03` | Nav items are nouns; action items under them are verbs with an object | 3 |
| `NAV-04` | The entity is findable in the global search (`Cmd/Ctrl+K`) by name and by code where it has one | 5 |

### HDR: page header and actions

| Id | Check | Principle |
| --- | --- | --- |
| `HDR-01` | The page is one of the seven archetypes and follows that archetype's region order | 4 |
| `HDR-02` | The page uses the canonical page header component from `components.md`, not its own markup | 4 |
| `HDR-03` | Exactly one primary action sits at the top right on desktop and is reachable without scrolling at 375 px | 1 |
| `HDR-04` | Secondary actions are grouped in one overflow menu or button group, not scattered | 4 |
| `HDR-05` | Every action control is hidden when the role lacks the matching write permission, and the server action checks it | 11 |
| `HDR-06` | A record page opens with an identity strip: code, name, status badge and the critical fields for the entity | 6 |
| `HDR-07` | A home page shows pending approvals, unmatched payments and overdue levies above any chart | 2 |

### TBL: lists and tables

| Id | Check | Principle |
| --- | --- | --- |
| `TBL-01` | The list pages on the server and shows total count and current range | 5 |
| `TBL-02` | Columns the role sorts by are sortable; the active sort is visible | 5 |
| `TBL-03` | Filters for status and date range exist where the entity has them; active filters are visible and clearable in one action | 5 |
| `TBL-04` | Search accepts partial, case-insensitive input and matches name, code and phone where the entity has them | 5 |
| `TBL-05` | The identifier column stays visible during horizontal scroll; row actions stay reachable | 5 |
| `TBL-06` | Clicking a row or its identifier opens the record | 5 |
| `TBL-07` | Money columns are right-aligned, tabular, non-wrapping | 7 |
| `TBL-08` | Status cells use the canonical status badge with icon or text, never colour alone | 7 |
| `TBL-09` | Bulk actions state the row count and the effect before running | 9 |
| `TBL-10` | The table uses the canonical table pattern from `components.md`, not page-local markup | 4 |

### FRM: forms, dialogs and confirmations

| Id | Check | Principle |
| --- | --- | --- |
| `FRM-01` | Every input has a visible label; required fields are marked; helper text explains non-obvious fields | 1 |
| `FRM-02` | Validation errors appear next to the field and in plain words; the first error receives focus on submit | 8 |
| `FRM-03` | Related fields are grouped under a heading; groups follow the order the officer fills them | 1 |
| `FRM-04` | The submit button is named after the action (`Save resident`, `Generate invoices`), is the only primary button, and shows a loading state | 9 |
| `FRM-05` | A create or edit of a small entity opens in the canonical dialog or sheet; a large entity opens a form page | 4 |
| `FRM-06` | Destructive and money-moving actions open a confirmation that names the object and the effect in concrete words; the confirm button is named after the action | 9 |
| `FRM-07` | A wizard shows its steps, the current step, and a summary with counts and totals before the final run | 7 |
| `FRM-08` | Leaving a dirty form warns the user | 8 |

### FBK: feedback and states

| Id | Check | Principle |
| --- | --- | --- |
| `FBK-01` | A loading state exists (`loading.tsx` or a skeleton) and matches the loaded layout | 8 |
| `FBK-02` | An empty state says what the page would show and offers the first action; it is not a blank table | 8 |
| `FBK-03` | An error state exists (`error.tsx` or boundary) and says what did not happen and what to do next | 8 |
| `FBK-04` | A successful write shows a toast or inline confirmation that names what changed | 8 |
| `FBK-05` | After a money-moving action, the page states what moved | 7 |
| `FBK-06` | A status that implies a next step shows it ("Overdue since 03 Aug 2026", "Awaiting proof") | 6 |

### MOB: 375 px viewport

| Id | Check | Principle |
| --- | --- | --- |
| `MOB-01` | No horizontal page scroll; only a designed table region may scroll sideways | 10 |
| `MOB-02` | Tables collapse to cards, or keep the identifier and primary action visible without scrolling sideways | 10 |
| `MOB-03` | Forms and dialogs open as full-height sheets; the submit button is reachable without scrolling the sheet to its end | 10 |
| `MOB-04` | Touch targets are at least 44 px; row actions are tappable | 10 |
| `MOB-05` | The page header stacks title, description and primary action without clipping | 10 |
| `MOB-06` | Every persona task for this page can be finished at 375 px | 10 |

### A11Y: accessibility

| Id | Check | Principle |
| --- | --- | --- |
| `A11Y-01` | Interactive elements are native `button`, `a`, `input` or have the correct role and keyboard handling | 1 |
| `A11Y-02` | A visible focus ring appears on keyboard focus for every control | 1 |
| `A11Y-03` | Icon-only buttons have an accessible name | 1 |
| `A11Y-04` | Text contrast meets WCAG AA on the default theme in light and dark mode | 7 |
| `A11Y-05` | Status is conveyed by icon or text as well as colour | 7 |
| `A11Y-06` | Dialogs trap focus, return focus on close, and close on Escape | 1 |

### VIS: visual tokens

| Id | Check | Principle |
| --- | --- | --- |
| `VIS-01` | No hex or raw colour literal in the page or its components, except a documented status tint | 12 |
| `VIS-02` | Type sizes and weights come from the `DESIGN.md` scale; the page title is the display or headline role | 12 |
| `VIS-03` | Spacing sits on the 4 px scale and uses the layout wrappers from `DESIGN.md` | 12 |
| `VIS-04` | Radii, shadows and borders match `DESIGN.md`; glass appears only on floating overlays | 12 |
| `VIS-05` | Icons are Lucide inside the canonical icon wrapper where the pattern calls for one; pastel tint appears only in icon boxes and status | 12 |
| `VIS-06` | Motion confirms an action and is paired with a colour, icon or text change | 12 |
| `VIS-07` | Dark mode renders correctly on the default theme | 12 |

### CPY: copy and labels

| Id | Check | Principle |
| --- | --- | --- |
| `CPY-01` | Domain terms match `CONTEXT.md` exactly | 3 |
| `CPY-02` | Labels and headings are sentence case; buttons are verb plus object | 3 |
| `CPY-03` | Dates show the month as a name (`dd mmm yyyy`), never a number | 7 |
| `CPY-04` | Error and empty-state copy says what happened and what to do, in plain words, without codes | 8 |
| `CPY-05` | No placeholder, lorem or developer wording is visible | 1 |

## Task scenarios

For each persona task that starts on this page (`personas.md`), record:

```
| Task | Role | Viewport | Result | Note |
| F3 | finance@residio.test | desktop | done | |
| F3 | finance@residio.test | 375 px | done with workaround | balance below the fold |
```

`not possible` is a `blocker`. `done with workaround` is a `major`.

## Report format

One report per page, in `backlog.md` under the page's heading, or in a PR comment when the audit
is part of a review. Fixed shape:

```
### /route/of/page   (archetype: registry)   audited 24 Oct 2026 on <commit sha>

| Id | Result | Severity | Evidence | Proposed fix |
| --- | --- | --- | --- | --- |
| HDR-02 | fail | minor | src/app/(dashboard)/x/page.tsx:41 renders its own <h1> | Use the canonical page header |
| MOB-02 | fail | blocker | table scrolls sideways, identifier hidden at 375 px | Collapse to cards |
| TBL-09 | n/a | | no bulk actions | |
| FRM-06 | waived | | exceptions.md 2026-10-24 | |

Task scenarios: (table as above)

Summary: 0 blocker, 2 major, 5 minor, 1 nit. Passed 38 of 46 run.
```

Rules for the report:

- Every `fail` has evidence and a proposed fix. A `fail` without evidence is removed, not kept.
- Severity is set per the table above, not by taste.
- Group findings by check id, not by screen region, so two audits of the same page can be
  diffed.
- Do not total into a single score.
