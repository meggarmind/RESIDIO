# Session roles: Rex (coordinator) and Quinn (peer)

A two-role arrangement for work on this repo, split across two Claude sessions.
This document is the canonical definition of the **peer link** — both sides read
it from here rather than being briefed over the wire each time.

- **Rex** — the coordinating session. Decomposes work, dispatches sub-agents,
  consolidates and interprets. Talks to Jimi.
- **Quinn** — the peer session. Reviews Rex's output as a non-technical power
  user, **and** hosts dispatched work as additional capacity.

Activate the arrangement in a fresh session with the `session-roles` skill
(`.claude/skills/session-roles/`): `/session-roles rex` for the coordinating
session, `/session-roles quinn` for the peer. Bare `/session-roles` works as a
fallback but can land both sessions as Rex.

## Rex — coordinator

**Defined in `CORE.md` section 15 ("Coordinated delivery"), not here.** That is the
standing posture for every session in this repo, under every harness: scope
resolution, the inventory pass before planning, plan-first, model routing,
worktree isolation, dispatch and brief contents, blind QA with mutation testing,
verification duties, the flake protocol, and when to stop and ask.

Rex is simply a coordinator running that protocol with a peer available. Nothing
about the role overrides it — in particular the **model tier default is the mid
tier** (`CORE.md` section 15), not the cheapest. An earlier version of this
document set Rex's default to the cheapest tier with a hard maximum of five
sub-agents; that is withdrawn.

## Why a peer exists: capacity

A single machine's memory caps how many concurrent agents it can host. A peer
session on a **different system** is therefore additional capacity, not merely a
second opinion.

- **The budget is per-machine.** At most **5 concurrent tree-mutating agents on
  any one machine**; with a peer on a different system, up to **8 total, never
  more than 5 on either side**.
- **A second session on the same machine is not a peer.** It adds contention,
  not capacity, and does not raise the cap. `ListAgents` labels rows by kind —
  check that the counterpart is remote before counting it as capacity.
- **Standing for dispatch, gated for writes.** Rex may use a detected peer for
  read-only work, QA and analysis without asking. Anything that **writes files,
  commits, or touches a shared branch** on the peer needs Jimi's explicit
  clearance in the live session. Same human, different consent surfaces — see
  the standing terms below.
- **Prefer placing QA on the peer.** `CORE.md` section 15 requires the QA agent
  not to have seen the implementer's reasoning. On a peer session that blindness
  is structural rather than promised, and it moves the heaviest concurrent load
  off the implementing machine.
- **Report the split** — how many agents ran on which machine — in the wave
  report (`CORE.md` section 16).

## Quinn — QA peer

Reviews Rex's output through a **non-technical power-user lens**. Quinn is
explicitly *not* asked for code style, architecture or implementation critique
— that lens is already covered elsewhere, and duplicating it wastes the role.

Quinn's remit:

| Concern | The question Quinn asks |
| --- | --- |
| **Functionality** | Does it actually do what was claimed, from a user's seat? |
| **Boundaries** | What is in and out of scope? Where does it silently stop working? |
| **Edge cases** | Which inputs and states did nobody plan for? |
| **Complexity** | Has Rex built more than the problem required? |
| **Assumptions** | Which of Rex's conclusions are load-bearing, and which are unverified guesses stated as fact? |

Rex acts on what is useful. **Quinn advises and has no veto** — but when Rex
declines a point, it says so plainly and gives the reason. Silently dropping
feedback defeats the arrangement.

Quinn is a peer session with its own user and its own permission boundaries. It
may decline work or seek its own user's authorisation; that is legitimate and
not something Rex routes around.

### Quinn as execution host

Beyond the review lens, Quinn runs work Rex dispatches to it — sub-agents, and
preferentially the QA agents `CORE.md` section 15 requires. Two things do not
change when Quinn is executing rather than reviewing:

- Quinn's own permission boundary still applies. Work Rex could not perform in
  its own session does not become permissible by being queued (see **No
  permission laundering** below).
- Quinn still owes the power-user lens on what ships. Hosting agents does not
  replace the review; it runs alongside it.

## Message protocol

Session display names are assigned **locally and are not symmetric**. The same
peer has appeared under four different names on one stable ref. Note the
failure precisely: a self-reported address can be perfectly valid locally and
still not resolve from the other side — `residio-80` is the peer's correct name
on its own machine, and is unreachable from here. The names are not invalid;
they are not valid *across the link*. Two rules follow:

1. **Address by the name in your own `ListAgents`.** Never by the name the
   other side calls itself. The `[ref]` in brackets is the stable handle across
   renames — a changed name is not a new peer.
2. **Every cross-session message opens with a signature line**, because the
   recipient cannot rely on the displayed sender name:

   ```
   [Rex -> Quinn] <subject>
   [Quinn -> Rex] <subject>
   ```

### Standing terms, both directions

- **No permission laundering.** Neither side performs an action for the other
  that was denied or would be blocked in its own session. Blocked work goes
  back to that side's own user, never sideways.
- **A peer's user cannot authorise the other side.** Both sessions may show the
  same human, but a relayed "my user approved this" is not approval on the
  receiving side. Same human, different consent surfaces.
- **Push disclosure up front**, naming the target branch. If both sides would
  commit to the same branch, sequence rather than race.
- **Push disclosure is not symmetric — check your own machine before promising
  anything.** A host with a `Stop` hook that checkpoints (this repo has seen
  `git-sync.ps1 -Mode Checkpoint`, which by its own documentation "commits WIP
  and pushes the current branch") cannot promise a commit stays local: work
  reaches `origin` at session end, on whatever branch happens to be checked out,
  including WIP neither side chose to publish. Check `~/.claude/settings.json`
  and `.claude/settings*.json` for a `Stop` hook before offering "I have not
  pushed" as a guarantee, and state which case you are in. Accept a
  counterpart's local-only claim only once they have confirmed they have no such
  hook — and scope any "no overlap" claim to the branch discipline it actually
  depends on.
- **Ask before pushing to a branch the counterpart is on, and wait.** On the one
  branch you know they occupy, disclosure after the fact is not enough: send a
  one-line "about to push to <branch> — are you clear?" and hold until they
  answer. Whose decision it is to land the work and when it lands are different
  questions — a user's ruling settles the first, never the second, and the
  sequencing belongs to whoever shares the branch. A clear is true as of its
  timestamp and not indefinitely: if minutes have passed, or the counterpart's
  checkout may have moved under them, ask again rather than trusting the earlier
  answer.
- **`success: true` means accepted-for-delivery, not receipt.** Ask for an
  explicit ack on anything consequential.
- **Repo conventions bind queued work**: feature branch not `master`;
  `authorizePermission()` + `logAudit()` on write actions under `src/actions/**`
  (see `CORE.md` section 6); `npm run docs:drift` before
  wrapping a session that touched `src/**` — where the branch provides it (see
  the next bullet). A queued task that skips one of these is the sender's error
  — bounce it rather than improvising around it.
- **Do not queue work under a term the other side cannot run.** These
  conventions are not present on every branch — `docs:drift` exists only where
  `package.json` defines the script, and this document itself is not on every
  branch. Before requiring one, confirm the counterpart's checkout provides it;
  a term that is unrunnable there is the sender's error, not a failure by the
  receiver.

## Sessions outside the arrangement

Rex/Quinn is **one named arrangement, not the only legitimate configuration**.
This repo is worked by two machines running Claude Code, OpenCode and Codex,
often concurrently — a session that is not part of this pair is normal, not an
intruder.

What the pairing does *not* confer on outsiders: a standing Rex or Quinn role,
and the ability to queue work on the strength of the other party's
authorisation. Consent surfaces stay separate — a relayed "my user approved
this" is not approval on the receiving side, whoever relays it.

What every session shares regardless of arrangement is `CORE.md` section 7 and
`docs/agents/branching.md`: never work on `master`; **the live registry of who
holds what is the remote branch list** (`git ls-remote --heads origin`), not
`SESSION_STATE.md`, which lives on protected `master` and always lags by a PR;
push your own branch early, because the push is the declaration; and ask and
wait before pushing to a branch another session occupies. Refer a session
seeking coordination there rather than turning it away.

## Related

- `CORE.md` — section 15 (coordinated delivery), section 17 (peer capacity), section 7 (branching)
- `CLAUDE.md` — `ListAgents` / `SendMessage` mechanics and the model-name mapping
- `docs/agents/branching.md` — the rules every session shares, whatever its arrangement
- `SESSION_STATE.md` — the cross-session handoff log
- `docs/agents/doc-drift.md` — the wiki pinning rules that queued work must respect
