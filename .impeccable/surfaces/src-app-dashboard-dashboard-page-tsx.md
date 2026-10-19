---
version: 1
slug: "src-app-dashboard-dashboard-page-tsx"
primary_target: "src/app/(dashboard)/dashboard/page.tsx"
related_targets: []
---

# Surface brief: admin dashboard home

Scope: /dashboard, Operate mode, code-led. Issue #758 (parent #294). Redesign of composition and content inside the established Residio world; DESIGN.md tokens unchanged.

Audience and job: volunteer committee officers (chairman, treasurer, secretary), occasional use, often on a phone. Job: see the state of the estate's books, people and access, and take the one next action.

Proof and content: snapshot from getAdminDashboardSnapshot plus a new read action for per-House status. Stage has 179 houses, 5 invoiced. Overdue is derived from due_date, not an enum.

Unresolved: Prod house counts not measured; whether access flags per House exist for the Security lane.

## Direction contract

THESIS: The estate has three jobs, so the page has three equal lanes (Money, People and Houses, Security and Access) on one grid, plus a map of every House. It refuses the KPI wall of five unequal tiles and a rainbow of quick actions.

OWN-WORLD: Residio tokens as in DESIGN.md: Geist, OKLCH neutrals, shadcn New York radius, one IconBox size. Neutral surfaces; green means paid, amber attention, red overdue only; one accent for actions. Identical lane anatomy so the page reads the same with all text removed.

STORY: A treasurer opens the page and knows within seconds what needs them (one urgent item), how the books stand (collected against invoiced, outstanding), and which Houses are behind (the map), then acts from the lane's primary button.

FIRST VIEWPORT: Desktop 1440: thin strip with greeting and the single most urgent item. Below, three equal lanes, each with state-coloured header and reconciled time, one hero figure, one status line, three queue rows, one primary button. Estate map directly under the lanes, houses grouped by street with a status filter. Phone: strip, then lanes stacked, then the map as a compact grid; no fixed card heights.

FORM: Three-lane command board with estate map, position 5 of the grounded list, lead of the roll. seed:5971ef7d1181fb17

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
