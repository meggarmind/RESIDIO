# Design instructions for agents

Two documents hold the design rules for this repository. This file only points at them and keeps
the workflow rules that belong to neither.

| Question | Read |
| --- | --- |
| Colour, type, radius, shadow, spacing, motion: what value do I use? | `DESIGN.md` (repo root). It is the visual source of truth. |
| Page structure, navigation, lists, forms, feedback, mobile, audit: what does an admin page contain and how is it checked? | `docs/design/admin_portal/` (start at its `README.md`). It is the structural source of truth and is prescriptive. |

Where an older copy of this file named fonts (Outfit, Inter, JetBrains Mono), glass sidebars,
Framer Motion entrances or a multi-theme target, `DESIGN.md` wins: the shipped font is Geist, glass
is for floating overlays only, motion confirms an action and never carries a state change alone,
and the theme picker is a user setting, not a design target (owner decision 2026-10-24, #1145).

## Workflow rules

- UI work is for the **admin dashboard** (`CORE.md` §3). Do not extend the resident portal.
- Use the canonical component for each job named in `docs/design/admin_portal/components.md`.
  Do not add a second component for a job that has one. Where the guide says "to build", build the
  contract it states, in its own issue.
- Wrap raw shadcn components in semantic layout components rather than using them directly in
  pages. Style is shadcn **New-York**; icons are **Lucide** inside `IconBox` where the pattern calls
  for one.
- The utilities `.glass`, `.btn-hover-lift`, `.card-hover-modern`, `.input-tactile`,
  `.animate-pulse-soft`, `.shadow-soft`, `.shadow-elevated`, `.stagger-*` and `.layout-*` are
  defined in `src/app/globals.css`. Reuse them; do not redefine them in components.
- Colours come from theme variables and Tailwind semantic names. A hex or `rgb` literal in a
  component is a bug unless it is a documented status tint.
- Before calling a page done, run the checks in `docs/design/admin_portal/audit-checklist.md` for
  its archetype, on desktop and at 375 px, and record the result in the PR.
- A page that must deviate from a rule gets a proposed exception in the PR description
  (`docs/design/admin_portal/exceptions.md`). Only the owner grants it.
- When `src/**` changes something the guide describes, update the guide file in the same change.
