# Admin portal design guide

The canonical, prescriptive design guide for the Residio admin dashboard: every route under
`src/app/(dashboard)/**`. Agents and people use it to build new pages, to audit existing pages,
and to decide what to improve next. Owner decisions that shaped it are recorded in issue #1145.

## Who reads what

| You are | Read first | Then |
| --- | --- | --- |
| Building a new page or component | `principles.md`, `page-patterns.md` | `components.md`, `layout-and-shell.md` |
| Auditing an existing page | `audit-checklist.md` | `exceptions.md`, then the pattern file for the page's archetype |
| Planning UI work | `backlog.md` | `personas.md` |
| Deciding a visual question (color, type, spacing, shadow) | `DESIGN.md` at the repo root | nothing here overrides it |

## Files

| File | Mode | Holds |
| --- | --- | --- |
| `principles.md` | explanation | the twelve principles every rule derives from, with their sources |
| `personas.md` | reference | the seven admin roles and the three tasks each must finish without help |
| `layout-and-shell.md` | reference | sidebar, header, breadcrumb, mobile shell and tokens as shipped, plus shell rules |
| `page-patterns.md` | reference | the seven page archetypes, the map of every page to one, and the rules per archetype |
| `components.md` | reference | one canonical component per job, the ones not to use, and contracts for the missing ones |
| `audit-checklist.md` | how-to | the checks, their ids and severities, and the fixed report format |
| `exceptions.md` | reference | owner-granted waivers, one per check and page |
| `backlog.md` | reference | known gaps found while writing and auditing, not yet filed as issues |

## Precedence

1. `DESIGN.md` (repo root) is the visual source of truth: tokens, type scale, radii, shadows,
   motion. This guide never restates a value from it. It links to it.
2. This guide is the structural and behavioural source of truth for admin pages: what a page
   contains, where actions sit, how lists, forms and feedback behave, and what mobile must do.
3. `DESIGN_AGENTS.md` keeps agent workflow rules only. Where it still names a font, a glass
   surface or a motion pattern, `DESIGN.md` wins.
4. `docs/design/legacy/` holds reference material for other products. It is not a rule source.

When code and this guide disagree, the guide is right unless `exceptions.md` lists the page and
check. A difference without an exception is a finding.

## Scope

- In: every page under `src/app/(dashboard)/**`, the dashboard shell, and the shared components
  those pages use. The default theme only. Desktop and a 375 px phone viewport, with equal
  severity.
- Out: the login and auth pages, the resident portal (`src/app/(resident)/**`), emails, PDF
  reports and the WhatsApp assistant. `CORE.md` §3 explains why the portal is frozen.
- The multi-theme picker in `src/lib/themes/` is a user setting, not a design target. Pages are
  audited on the default theme.

## How to change this guide

- A rule change needs an owner decision. Record it on #1145 or on the issue that drove it, then
  edit the file and cite the decision.
- A new check gets the next free number under its prefix. Numbers are never reused.
- A waiver goes in `exceptions.md`, never in the rule text and never as a comment in code.
- When `src/**` changes something a file here describes, update the file in the same change.
