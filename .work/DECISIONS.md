# DECISIONS — Epic #180

Format: issue | ambiguity | options considered | option taken | rationale | reversibility

---

**D1 — setup | The mission says branch off `main`; this repo's trunk is `master`.**
Options: (a) treat `main` as a literal and fail, (b) adapt to `master`.
**Taken: (b).** `origin/HEAD` points at `master` and there is no `main`. A naming
detail, not a design choice. **Reversible:** trivially.

---

**D2 — setup | Branch prefixes `epic/*` and `issue/*` are not in the lane list AGENTS.md
enumerates** (`codex/issue-*`, `feat/*`, `fix/*`, `qa/*`, `merge/*`).
Options: (a) use the mission's `epic/180` + `issue/<n>-<slug>`, (b) remap onto the
repo's `codex/issue-<n>-<slug>` lane.
**Taken: (a).** The mission names the scheme explicitly and is the more recent, more
specific instruction. AGENTS.md's lane list exists to stop two concurrent tools taking
the same branch; a wholly new `epic/` prefix collides with nothing and, being novel, is
*more* legible as a claimed lane, not less. `epic/180` is pushed to origin so the claim
is visible in `git ls-remote`, which AGENTS.md calls the live registry.
**Reversible:** branches can be renamed before any PR.

---

**D3 — setup | The three ADRs and the CONTEXT.md vocabulary that define this epic exist
only on `feat/settings-ia-docs`, which is unmerged and has no PR.**
Options: (a) branch the epic off `master` and work against design documents absent from
the tree, (b) merge the docs branch into `epic/180`, (c) merge the docs branch to
`master` first.
**Taken: (b).** The epic branch now carries its own binding constraints, so every QA
agent can read the ADR it is being measured against. (c) would mean opening an unrelated
PR against protected `master` before the epic has produced anything. The merge is
docs-only — CONTEXT.md, three new ADR files, SESSION_STATE.md; zero `src/**` change,
confirmed by diffstat. **Reversible:** yes; it is an ordinary merge commit.

---

**D4 — setup | The typecheck baseline was red on `master`** — two `TS2322` errors in
`src/__tests__/integration/issue-monitor.test.ts`, because `detectFindings({ branchNames
= [] })` in `scripts/issue-monitor.mjs` infers `never[]`.
Options: (a) record it and let every QA agent see a red typecheck all epic long,
(b) fix it in its own commit before any epic work.
**Taken: (b),** which the mission explicitly permits. A permanently red gate trains
reviewers to ignore it, and this epic's whole risk model depends on QA agents believing
their gate output. Fix is an inline JSDoc type on the default; the emitted JavaScript is
unchanged and the file's 10 tests still pass. Commit `8d3ee77`. **Reversible:** one-line
revert.

---

**D5 — setup | Parallel agents need isolated worktrees, but this is a large Next.js tree
on Windows and five concurrent `npm ci` runs are impractical.**
Options: (a) full installs per worktree, (b) worktrees sharing the main checkout's
`node_modules` by directory junction, (c) abandon worktrees for strict file-ownership
partitioning.
**Taken: (b),** with (c) as the stated fallback. Dependencies are read-only during a
slice, so sharing them is safe; each worktree still gets its own `.next` and its own
index. The one slice this cannot serve is #163, whose entire point is the install
itself — which is why it is wave 0, solo, in the main checkout, before any junction
exists. **Reversible:** junctions are deleted with the worktree.

---

**D6 — #174 / #176 | The two issues both dispose of parts of `/settings/system` and
neither mentions the other.** #174 retires `/settings/system/health` and the overview's
cron section; #176 retires the `/settings/system` overview outright.
Options: (a) run them together and merge by hand, (b) serialize #174 → #176.
**Taken: (b).** #174 carries a security fix and must not be entangled with a rename;
#176's job is easier once #174 has already emptied the overview of its cron content.
**Reversible:** ordering only.

---

**D7 — #168 | The implementing agent rewrote `src/lib/audit/README.md` to assert
"Currently, only the super_admin role holds this permission."** That is a factual claim
about the live database, made without querying it.
Options: (a) accept it, (b) verify it.
**Taken: (b), and it was wrong.** A query against the live database shows
`settings.view_audit_logs` is held by **`super_admin` and `vice_chairman`**. Corrected
the line myself rather than spending a remediation cycle on a one-line factual fix —
disclosed here and in the report. The same query independently confirmed the issue's own
premise: `settings.view` is held by `financial_officer, project_manager, secretary,
security_officer, super_admin, vice_chairman` and **not** `chairman`, so the migration is
not a no-op. **Reversible:** one line of Markdown.

---

**D8 — #170 | The reopen-on-entry rule did not fire for one of the three cases the issue
names.** `lastActiveGroup` was held in an unpersisted module variable, so a full page load
straight into a collapsed group hit the `previous === undefined` guard and left the group
shut — hiding the very page the reader had just opened. The landing-grid and search-result
cases worked (client-side navigations); the **external link** case did not.
Options: (a) accept it as an edge case, (b) send it back to persist the previous-group
value in sessionStorage.
**Taken: (b).** The issue names "an external link" explicitly as a case that must reopen,
and persisting the value also *sharpens* the rule rather than blurring it: a reload while
already inside the group keeps `previous === G`, so a deliberate collapse still survives,
while an arrival from group H is correctly seen as a transition. The implementer's own
test 4 conflated those two situations. **Reversible:** yes, localized to one hook.

---

**D9 — #163 | The issue's premise was false, so "fix it as written" and "close it" were both
available and neither was obviously right.**
Options: (a) add `prettier` as a devDependency anyway, as the issue asks, on the reasoning
that an explicit declaration is harmless insurance; (b) close as not reproducible with
evidence.
**Taken: (b).** A cold `npm ci` in a throwaway clone of `epic/180` — no `node_modules` at
all, 34 minutes, 1029 packages, exit 0 — installs `prettier@3.7.4` with both
`prettier/standalone` and `prettier/plugins/html` present, and both named suites pass
(66 files / 383 tests, zero failures). The cause: `@react-email/render@2.0.0` declares
prettier in its own `dependencies`, and it has been in the committed lockfile since
`4590ecd` (2025-12-21), before the issue was filed. The reported breakage was a locally
drifted `node_modules`, which `npm ci` cures.
Option (a) was rejected on substance, not effort: an uncapped grep shows this repo never
imports prettier itself, in `src/`, `scripts/` or `e2e/`. Declaring it in
`devDependencies` would describe a **production** transitive requirement as a development
tool, and would mislead anyone later reasoning about `--omit=dev`. Restating what the
lockfile already guarantees would make the manifest less accurate, not more.
**Reversible:** the issue can be reopened; no code changed.

---

**D10 — baseline | `module-integration.test.ts` fails nondeterministically under load.**
Three consecutive full-suite runs on an identical tree returned one failure, then two,
then none; the file passes in isolation. Cause: it walks every file under `src/actions/**`,
taking ~3.8s and ~1.1s against vitest's 5s default timeout, so contention tips it over —
and the failure reads as "a write action is missing `authorizePermission`", which is
exactly the kind of false alarm that would derail a QA agent.
Options: (a) document it and let every QA agent hit it, (b) give the scan an explicit
timeout.
**Taken: (b),** as baseline repair in its own commit (`0948367`), same reasoning as D4: a
gate that lies intermittently is worse than one that is simply slow. 60s budget, no
assertion changed. QA agents on branches cut before that commit are briefed on the flake
and told to re-run the file alone. **Reversible:** one constant.

---

**D11 — process | Coordination files were written to the wrong tree.** Three `.work` files
landed in `.worktrees/issue-167/.work/` because the Bash tool's working directory persists
between calls and I had left it inside a worktree. Recovered them, and cleaned the stray
files out of #167's tree before its QA ran so they would not read as scope creep.
**Standing correction: every shell command in this epic uses an absolute path.**

---

**D12 — #171 | Where do System pages hang in `navigation.ts` before `/system` itself
exists?** The issue says "add its pages as `children` of the existing `system` section,
following the `NAV_BILLING` / `NAV_PAYMENTS` pattern" — but both of those are a parent
`NavItem` with an `href` of its own plus `children`, and there is no `/system/page.tsx`
until #177.
Options: (a) create a `NAV_SYSTEM` parent at `href: '/system'` now, accepting a nav entry
that points at a page which does not exist; (b) add the audit-logs item directly into the
`system` section's `items` array beside `NAV_SETTINGS`, and let #177 restructure into
parent-with-children when it creates the landing page.
**Taken: (b).** (a) would put a dangling link in the sidebar for the whole of waves 2 and
3, and — more to the point — #171's own new coverage test asserts that nav entries link
only to pages that exist, so (a) would require weakening the very test that is this
slice's most important deliverable. **Reversible:** #177 restructures it by design.

---

**D13 — process | Worktrees need `.env.local` or their build gate is meaningless.**
#167's QA could not verify `npm run build` because the worktree had no `.env.local`
(untracked, so `git worktree add` does not propagate it) and prerendering failed on an
unrelated Supabase-client error. #169's implementer had hit the same wall and copied the
file in unprompted; #170's QA did the same and cleaned up after itself.
**Standing correction: provision the junction *and* `.env.local` when creating every
worktree.** Done for #171 onward. #167's build was instead verified on the integrated
epic branch, which has the file. **Reversible:** the file is gitignored and never enters a
diff.

---

**D14 — INCIDENT | I damaged the shared `node_modules` during worktree teardown, and the
damage masqueraded as a code failure.**

**What happened.** After merging wave 1 I unlinked each worktree's `node_modules` junction
(`cmd /c rmdir`, which reported success for all four) and then ran
`git worktree remove --force`. The epic's gates had been green immediately before that:
68 files / 406 tests, typecheck exit 0, build exit 0. Afterwards, **16 of 935 package
directories in `C:\projects\RESIDIO\node_modules` were empty shells** — the directory
present, every file inside gone. Among them: `prettier`, `@react-pdf/renderer`,
`pdfjs-dist`.

**How it surfaced.** Not as an error, but as a *plausible* one. #171's agent reported 20
"pre-existing" TypeScript errors, a failing build, and — precisely — the two billing
suites named in #163 failing again. It had even checked its work by stashing onto the base
commit and seeing the same failures, and concluded the environment was broken before it
arrived. That reasoning was sound; the premise was not. Had I taken the report at face
value I would have recorded a false "pre-existing breakage" against the baseline and
possibly re-opened #163 on the strength of it. It was caught only by running the same
typecheck in the main checkout and noticing it disagreed with the green run I had
personally done an hour earlier.

**Root cause.** Not established with certainty, which is itself the finding. The junctions
were unlinked before removal and reported success, yet package contents in the *target*
tree were emptied. Sharing one `node_modules` across git worktrees by directory junction
has a failure mode that is silent, partial, and attributed to the wrong cause.

**Repair.** `npm ci`. The first attempt failed EPERM on a locked native module
(`lightningcss.win32-x64-msvc.node`) after deleting most of the tree, leaving it worse;
no build or dev-server process was holding it, so the lock was OS-level and transient.
Retried.

**Consequence for the plan.** D5's junction strategy is withdrawn. Every gate result
produced by #171's agent is void and must be re-run after repair — not because the agent
was careless, but because its environment lied to it.

**Standing correction:** never share `node_modules` between worktrees again, and never
delete a worktree that has ever had one. Unlink and leave the directory; prune at the end
of the epic.

---

**D15 — process | Replaces D5. Every worktree gets its own real `npm ci`.**
D5 chose junction-shared `node_modules` because five concurrent cold installs looked
impractical. D14 showed the true cost of that choice: silent partial corruption of the
shared tree, surfacing as a false "pre-existing breakage" in an agent's report.
Options: (a) keep junctions and be careful, (b) copy `node_modules` per worktree,
(c) a real `npm ci` per worktree.
**Taken: (c).** The measurement D5 was missing: with a warm npm cache a full `npm ci`
completes in **about 3 minutes**, not the 34 the first cold clone took. Three worktrees is
~9 minutes of wall clock, run sequentially so they cannot contend for the same locked
native modules — a trivial price for removing an entire class of cross-tree failure, and
it also gives each slice a lockfile-faithful tree to be judged against.
**Reversible:** trivially; nothing depends on the layout.

---

**D16 — #175 → #176 handoff | `revalidatePath` now points at a path #176 will rename.**
#175 re-pointed `revalidatePath('/settings/system')` in `src/actions/system/prune-data.ts`
to `/settings/system/data`, reasoning that Prune Data lives on the retention-config page —
correct today, and consistent with ADR-0004's rule that a trigger stays with the rule it
runs. But #176 renames `/settings/system/data` to `/settings/data-retention`, so the value
becomes stale one slice later.
Options: (a) have #175 pre-empt the rename and write `/settings/data-retention` now,
pointing at a path that does not yet exist; (b) accept the correct-today value and make
#176 pick it up.
**Taken: (b).** A `revalidatePath` naming a route that does not exist is silently useless,
and it would also couple #175's correctness to #176 landing. **Recorded here and carried
into #176's brief as an explicit required edit**, because this is exactly the kind of
handoff that gets dropped between slices. **Reversible:** one string.

---

**D17 — process | Three slices each reported stale references they were forbidden to
touch.** #171's QA found three, #173 flagged `docs/claude-ai-module-index.md`,
`docs/qat/test-plan.md` and `website/docs/integrations/email-and-sms.md`; #175 flagged two
QAT documents. The file-ownership boundaries that keep three parallel agents from
conflicting also stop any of them fixing a shared document.
**Decision: I sweep these myself at the wave boundary**, once all three branches are
merged and the boundaries no longer apply. Doing it inside a slice would reintroduce the
conflicts the boundaries exist to prevent; leaving it undone would recreate exactly the
documentation drift this epic exists to eliminate. Dated QA reports
(`docs/qat/reports/*-20260829*`) are point-in-time records and are deliberately **not**
swept. **Reversible:** documentation only.

---

**D18 — #165 | The issue states a genuine either/or and leaves it open:** "Either surface
the analytics card or stop writing the rows — collecting user query text with no reader is
hard to justify."

Evidence gathered before deciding:
- `search_logs` holds **33 rows, 2 distinct users, 2026-01-22 → 2026-08-29**. This is
  dev/test-scale, not an accumulating store of admin keystrokes. The privacy argument for
  stopping is real in principle but small in fact here.
- The read side is complete and mounted nowhere: `getSearchAnalytics`,
  `useSearchAnalytics`, `SearchAnalyticsCard`. The card already renders `null` when there
  is no data, so mounting it cannot clutter anything.
- `src/actions/system/prune-data.ts` already prunes this table, so retention is handled.
- The card surfaces **zero-result searches** — what administrators looked for and did not
  find.

Options: (a) stop writing the rows and delete or leave three orphaned modules; (b) mount
the card so the data has a reader.

**Taken: (b), and the tiebreaker is this epic itself.** Epic #180 exists because settings
were unfindable; #179 adds Settings and System to the command palette specifically so
"email import" finds the page. A list of searches that returned nothing is the direct
measure of whether that worked. Deleting the collection now would discard the instrument
just as it becomes worth reading. Option (a) also throws away three working modules to fix
a problem that mounting one component solves.

Implementation for #165 will add a **Search** tab to the analytics page (`analytics-page-client.tsx`
is already a tabbed dashboard) rendering `SearchAnalyticsCard` through `useSearchAnalytics`,
using all three orphaned modules.

**Reversible:** yes, in both directions — the tab can be removed, or the logging dropped
later, without touching anything else.

---

**D19 — #176 | The retired `/settings/system` overview has no natural successor.** Its two
link-cards now point at two different pages, and #174 had already stripped its cron
section, so nothing inherits it whole. The conceptual successor is the new `/system`
dashboard — which **does not exist until #177**.
Options: (a) redirect to `/system` in anticipation; (b) redirect to `/settings`.
**Taken: (b).** A redirect to a route that does not yet exist is a 404 dressed up as a
permanent redirect, and it would make #176's correctness depend on #177 landing. `/settings`
is the only existing sensible target: someone who bookmarked the old overview was looking
for settings, and lands on the settings landing page. **Handoff recorded for #177**, which
may re-point it once `/system` exists — its choice, not a defect here.
**Reversible:** one string.

---

**D20 — #176 → #177 handoff | `src/components/dashboard/header.tsx:94` still links to
`/settings/system`.** #176's agent correctly left it alone: it is outside that slice's file
boundary and still resolves, now via the new redirect to `/settings`. Issue #177 names this
line explicitly as its own work ("Update the pulsing system-health quick-link at
`src/components/dashboard/header.tsx:94`"), so it is a handoff rather than an omission —
but until #177 lands, the header's health indicator points a user at the settings landing
page rather than at anything health-related. **Carried into #177's brief as a required
edit.** **Reversible:** one href.

---

**D21 — #178 | A nav permission was narrowed in a way no test could catch.** The
implementer changed the "Roles & Permissions" nav item from
`[SYSTEM_MANAGE_ROLES, SYSTEM_ASSIGN_ROLES]` to `[SYSTEM_MANAGE_ROLES]`, reading the issue's
"(definitions only)" as meaning only role-definers need the page.

That reading is wrong on the facts. `/settings/roles` still carries the **Assignment Rules**
tab, and #172 deliberately kept `SYSTEM_ASSIGN_ROLES` on that route for exactly this reason:
*"someone who can only assign roles still needs to see the Assignment Rules governing what
they assign."* The parenthetical means the *account-work* half moved to `/system/accounts`,
not that the audience narrowed.

**Why no gate caught it.** `settings-nav-coverage.test.ts` asserts
`item.permissions ⊆ ROUTE_PERMISSIONS[guard]`. Narrowing keeps that true, so the test stays
green. The assertion is built to catch a nav entry advertising a page a role *cannot* open;
it is structurally blind to the inverse — a nav entry hiding a page a role *may* open. Both
are defects; only one is tested.

**Taken:** restored both permissions, with a comment naming #172 so a future reader does not
re-narrow it on the same misreading. Flagged to QA as something to verify rather than
accept, and QA was additionally asked to diff *every* item's permissions against `epic/180`
for other narrowings of the same shape. **Reversible:** one array.

---

**D22 — #165 | Mounting the analytics card required guarding the action first.**
D18 decided to surface `SearchAnalyticsCard` so the collected query text has a reader.
Investigating before dispatch turned up two facts that change the shape of that:
`getSearchAnalytics()` has **no authorization check at all**, and **`/analytics` has no
`ROUTE_PERMISSIONS` entry** — none of the 51 keys is a prefix of it, and it is absent from
`adminOnlyRoutes` — so middleware skips its whole auth block and the page renders to
unauthenticated visitors.
Options: (a) mount the card as decided and leave both gaps to their own issues; (b) mount it
and guard the action in the same slice; (c) reverse D18 and stop the logging instead.
**Taken: (b).** Mounting a card that displays what administrators type into search, on an
unauthenticated page, backed by an action that checks nothing, would convert a dormant
privacy problem into a live one — strictly worse than the defect #165 reports. Guarding the
action closes it independently of the routing gap, which belongs to **#104** and is not
#165's to fix. (c) was rejected for the reasons in D18, which still hold.
**Reversible:** the guard is one block; the tab is one component.

---

**D23 — verification | The middleware route table is consumed directly, not copied.**
Issue #104 states that middleware "keeps a hand-maintained second copy" of the route table.
Had that still been true, **every `/system` guard this epic added would have been
decorative**, #167 included — the slice all of wave 2 was blocked on. Checked rather than
assumed: `src/middleware.ts` now builds `routePermissionConfig` as `{ ...ROUTE_PERMISSIONS,
'/portal': [] }`, with a comment recording that the old copy had silently dropped eight
routes. **The guards are effective.** #104 was commented with this correction, since its
list of seven affected routes may now be shorter than when it was filed.

---

**D24 — process | The coordination files disagreed with git, and the stale half was the
one being briefed to agents.** A reconciliation on 2026-09-04 found `STATE.md` a full
wave behind (wave 4a listed IN-PROGRESS with both issues merged), `REPORT.md`'s table
stopping at "#174 in progress" with five closed slices missing, `AGENTS-INFLIGHT.md`
still describing the wave 0+1 dispatch while `STATE.md`'s Next action pointed at it as a
live roster, and — the one that could do damage — **`BASELINE.md` standing rule 3 still
telling every QA agent that a clean `npm ci` reproduces #163's breakage**, five days
after D9 disproved exactly that. A QA agent briefed on rule 3 would discount a green
test run as "masked".
**Taken:** all four corrected in place, retractions left visible with strikethrough
rather than deleted, so a reader who remembers the old claim sees it withdrawn instead
of silently absent. **Standing correction: a retraction is not done when the decision is
logged — it is done when every file that briefs an agent has been swept.** D9 was
recorded correctly and still leaked for five days.

---

**D25 — baseline | A second file shows the D10 load-contention flake.**
`src/app/api/whatsapp/webhook/twilio/__tests__/route.test.ts` timed out at vitest's 15s
limit in a full-suite run on 2026-09-04, and passed in **835ms** run alone. Same shape as
D10's `module-integration.test.ts`: heavy import cost (the full-suite run spent 280s in
import across workers) tipping a file over a timeout it clears easily in isolation.
Options: (a) raise this file's timeout as D10 did for the integration scan, (b) record it
and re-run on failure.
**Taken: (b), for now.** D10's fix was justified because the failure *reads as a real
defect* — "a write action is missing `authorizePermission`" — and would derail a QA
agent. A timeout reads as what it is. But two files now means the cause is the suite's
import cost, not either file, so a third is likely.
**Standing rule for QA agents: a timeout in a full-suite run is not a failure until the
file has been re-run alone.** **Reversible:** one constant, if it recurs.

---

**D26 — #164 | The issue understated its own severity, and the fix had to be larger than
it asked.** #164 is titled "returns results with no permission filtering". Reading the
route showed it had **no authentication requirement at all**: `getUser()` was called only
to stamp `search_logs`, no `ROUTE_PERMISSIONS` key prefix-matches `/api/search`, and
middleware skips `/api` outright. An anonymous caller could read every resident, house,
payment, security contact and document.
Options: (a) implement the filtering the issue asks for, (b) also add the authentication
requirement the issue does not mention.
**Taken: (b).** Filtering by permission is meaningless while the caller need not be
anyone. The 401 is placed *before* the query-length short-circuit so an unauthenticated
caller cannot distinguish a short query from a rejected one. **Reversible:** one guard.

Two things settled inside this slice that are worth carrying:

- **Quick Actions gate on completion, not just reachability** (user's call). `/residents/new`
  and `/houses/new` have no `ROUTE_PERMISSIONS` entry, so middleware admits them on the
  parent's `.view`; a view-only role could open the form and only then be refused. They now
  require view AND create. This forced `hasAnyPermission` -> `hasAllPermissions`: with OR
  semantics the view entry alone still matched, so adding the create permission would have
  been a no-op. A permission change that looks applied and does nothing is worse than none.
- **The mapping got a test because review is not a guard.** QA passed the mapping on
  inspection and still recommended coverage. The negative control settled it: reverting the
  create permissions leaves the route-coverage assertion **green** and fails only the two
  intent-pinning assertions. That is D21 reproduced deliberately — a subset-style assertion
  cannot see a narrowing. **Any future permission table in this repo needs the inverse
  assertion, not just the subset one.**
