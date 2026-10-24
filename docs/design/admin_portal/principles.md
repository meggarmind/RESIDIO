# Principles

The twelve statements every rule in this guide derives from. When a check in
`audit-checklist.md` is unclear, read the principle it cites. When two rules conflict, the one
whose principle comes first here wins.

Sources: the shipped code, `DESIGN.md` and `PRODUCT.md` at the repo root, and three reference
articles read on 2026-10-24: Bolder Apps "Admin portal design", Nicholas Idoko "#53. Designing
admin portals clients actually use (and pay for)", and Aspirity "Good admin panel design". Where
an article idea is a product decision the owner has not made, it is listed in `backlog.md` as a
question, not here as a rule.

## 1. The officer finishes the task

The user is a volunteer committee officer, not a trained operator (`PRODUCT.md`). Every page
exists so one of the seven roles in `personas.md` can finish one of its named tasks without
asking anyone. A page that looks right but needs a phone call to finish fails.

Audit prefixes: all. Source: `PRODUCT.md`; Idoko "verb-first".

## 2. Home is triage, not decoration

The first screen after sign-in answers three questions in order: what changed since I last
looked, what is blocked or failing, what must I do now. Pending approvals, unmatched payments and
overdue levies come before charts. A chart that does not lead to an action is decoration.

Prefixes: `HDR`, `FBK`. Source: Bolder Apps; Idoko "Mission control".

## 3. Verbs for actions, nouns for registries

Navigation items that open a registry are nouns (`Residents`, `Houses`). Buttons and quick
actions are verbs with an object (`Generate Invoices`, `Import Statement`). A noun on a button
and a verb on a nav item are both findings. Domain terms are fixed in `CONTEXT.md` and are used
as written.

Prefixes: `NAV`, `HDR`, `CPY`. Source: Bolder Apps "outcomes over objects"; `CONTEXT.md`.

## 4. One canonical component per job

For each UI job (`components.md`) there is one component to use. A second component for the same
job is a finding, even when it looks better. Where the canonical component does not exist yet,
the guide states its contract and `backlog.md` records the build. Nobody adds a fourth stat card.

Prefixes: `HDR`, `TBL`, `FRM`, `FBK`, `VIS`. Source: the inventory of 2026-10-24: three stat-card
families, no shared data table, 16 of 90 pages on `EnhancedPageHeader`.

## 5. Lists are the workbench

Most admin time is spent in lists. A registry page sorts by the columns the role needs, filters
by status and date, pages on the server, keeps the identifier column visible during horizontal
scroll, and keeps row actions reachable. Search forgives: partial, case-insensitive, by name,
code or phone. Bulk actions show how many rows they will touch before they run.

Prefixes: `TBL`. Source: Bolder Apps; Idoko "Lists that work hard";
`docs/design/legacy/data-table-layout*.md` where still true.

## 6. The record tells the story, then offers the action

A detail page opens with an identity strip (code, name, status badge, the two or three critical
fields), then the primary action, then the sections. Related items, notes and the audit trail
are reachable without leaving the page. A status explains itself: "Overdue" says since when and
by how much.

Prefixes: `HDR`, `FBK`, `CPY`. Source: Idoko "Detail pages".

## 7. Money is plain, exact and never colour alone

Currency values use tabular numerals and do not wrap (`DESIGN.md`, "The Tabular Money Rule"). A
paid, overdue or pending state carries an icon or a text label as well as its tint ("The Status
Is Never Color Alone Rule"). Before anything that moves or marks money, the confirmation names
the amount and the party. After it, the page says what moved. The officer never guesses.

Prefixes: `TBL`, `FRM`, `FBK`, `A11Y`. Source: `DESIGN.md`; Idoko "Error states that calm",
"Financial flows".

## 8. Every state is designed

Every page that loads data has a loading state that matches the loaded layout, an empty state
that says what the page would show and offers the first action, an error state in plain words
that says what did not happen and what to do next, and a success signal after a write. A blank
region is a finding.

Prefixes: `FBK`. Source: Idoko "Empty states that teach"; `CORE.md` §13.

## 9. Destructive and bulk actions have friction

Archive, delete, void, reverse and bulk writes open a confirmation that states the exact effect
in concrete words ("Archive resident `RES-0042` and unlink 2 co-residents?"). The confirm button
is named after the action, never "OK". Soft delete over hard delete where the data model allows
it.

Prefixes: `FRM`, `CPY`. Source: Bolder Apps; Idoko "Guardrails".

## 10. The phone is a first-class target

Officers often open the dashboard on a phone (`PRODUCT.md`). At 375 px, every task in
`personas.md` can be finished: tables collapse to cards or keep the identifier and primary
action visible, forms open in sheets, touch targets are 44 px, and nothing scrolls sideways
except a table that was designed to. Mobile findings carry the same severity as desktop
findings.

Prefixes: `MOB`. Source: `PRODUCT.md`; Idoko "Mobile-friendly, not mobile-first", tightened by
the owner because this product's officers are on phones.

## 11. Hide what the role cannot do, enforce it on the server

A control the role lacks permission for is not rendered. The server action still checks
`authorizePermission()` (`CORE.md` §6). A page guarded by `module.view` still filters its buttons
by `module.create`, `module.update` and `module.delete`. Hiding is courtesy; the check is the
rule.

Prefixes: `HDR`, `TBL`, `A11Y`. Source: `CORE.md` §6; Aspirity; Idoko "Roles and permissions".

## 12. Tokens, not values; restraint, not decoration

Colour, type, radius, shadow and spacing come from `DESIGN.md` tokens and the Tailwind semantic
names. A hex literal in a component is a bug unless it is a documented status tint. Colour is
spent on status and a few accents. Motion confirms an action and never carries a state change
alone. Glass appears only on floating overlays. Spacing sits on the 4 px scale.

Prefixes: `VIS`. Source: `DESIGN.md` "The Token Rule", "The Settle Rule", "The Reduced Motion
Rule"; Bolder Apps; Aspirity.

## What this guide does not decide

These article ideas are product decisions. They are recorded in `backlog.md` as questions for
the owner and are not rules: saved named views with shareable URLs, slide-out drawers for brief
edits, a 200 ms latency target for list filters, soft delete with a retention window as a
platform-wide rule, optimistic locking on edit forms, keyboard shortcuts beyond the command
palette, a welcome tour, and an alert inbox.
