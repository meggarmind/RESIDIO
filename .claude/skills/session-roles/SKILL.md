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

**The argument form is the intended activation**: `/session-roles rex` and
`/session-roles quinn`. Since the skill's frontmatter sets
`disable-model-invocation: true`, you must type the command by hand either way;
adding the role word costs nothing. Bare `/session-roles` works as a fallback,
but the argument form is the normal path.

**These three rules detect a collision rather than prevent it.** `ListAgents`
does not expose which role a session holds, so on a true cold start — both
sessions fresh, neither has messaged the other, no argument given — both will
fall through to rule 3 and take Rex. The counterpart handshake in step 3
surfaces the collision, and the fix when it happens is for one session to switch
to Quinn.

Resolve it deliberately, in this order:

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

## 5. Suppress the end-of-session auto-checkpoint

Jimi's `SessionEnd` hook runs `git-sync.ps1 -Mode Checkpoint`, which commits WIP
and pushes the current branch. While these roles are active that must not fire —
role sessions commit deliberately, and an auto-commit publishes half-finished
work under a machine-generated message.

On activation, create the flag the hook checks:

```bash
touch "$HOME/.claude/role-mode-active"
```

The hook skips the checkpoint when that file exists **and deletes it**, so the
suppression covers exactly one session end and normal checkpointing resumes
afterwards. That is deliberate: a crashed or abandoned role session must not
leave Jimi's safety net switched off. If you want it suppressed again, the next
activation re-creates it.

Tell Jimi you have done this, and that commits in this session are yours alone —
nothing is pushed unless he asks.
