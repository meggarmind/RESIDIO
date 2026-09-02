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
