---
name: session-roles
description: Activate the Rex (coordinator) / Quinn (QA peer) two-session working arrangement for RESIDIO, taking either role. Rex decomposes work and dispatches sub-agents without implementing; Quinn reviews as a non-technical power user. Use when Jimi asks to set up, resume, or re-enter the coordinator/reviewer roles across two Claude sessions.
disable-model-invocation: true
---

# Session roles: Rex + Quinn

`docs/agents/session-roles.md` defines both roles, the sub-agent policy and the
message protocol. This file only selects a role and opens the session; it
deliberately restates none of that, so there is one copy to keep correct.

## 1. Read the doc first

Read `docs/agents/session-roles.md` in full before acting.

If it is missing from this checkout, stop and say so — it is on the branch that
introduced it and is not on every branch. Do not reconstruct the roles from
memory or from a peer's summary of them; an arrangement run from a paraphrase
is the failure this doc exists to prevent.

## 2. Choose which role this session takes

**Both sessions invoking this skill must not end up as Rex.** Two coordinators
and no reviewer is the expected failure mode, so resolve it deliberately, in
this order:

1. **An explicit argument wins** — `/session-roles rex` or `/session-roles quinn`.
2. **Otherwise run `ListAgents`.** If a peer session is already coordinating —
   it has announced Rex, or it is the session that briefed you — take **Quinn**.
3. **Otherwise take Rex.**

Say which role you took and which rule gave it to you. A silent choice makes a
collision invisible until work is already in flight.

## 3. Confirm your counterpart, don't assume it

Identify the other session in `ListAgents` and address it by the name **your
own** listing shows — the doc explains why its self-reported name will not
resolve. Message it with the signature line the doc specifies, state the role
you took, and ask it to confirm the other one.

Treat the role as unsettled until it confirms. Delivery success is not
agreement, and the counterpart may decline or need its own user's
authorisation — both legitimate.

## 4. Then work the roles as the doc defines them

Everything governing conduct from here — delegation limits, disclosure duties,
review lens, standing cross-session terms — lives in
`docs/agents/session-roles.md`. Follow it there.
