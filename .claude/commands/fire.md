---
description: One-shot a project — plan it, gate once, build to a runnable demo. Usage: /fire <project> "<idea>" (or drop a wick.md manifest)
argument-hint: <project> [ideate] "<idea or vague direction>"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Task
---
# /fire — one-shot build

Arguments: $ARGUMENTS  (first token = project name; rest = idea string, unless
a wick.md manifest is present at repo root, which takes precedence)

Do this now:
1. Read .claude/wick/PHASES.md, .claude/wick/ARCHITECT.md, and .claude/wick/TL.md
   fully. If `ideate` appears in the arguments OR the idea is too vague to
   spec, also read .claude/wick/IDEATE.md and run Phase 0 first.
2. Create the project skeleton: `mkdir -p specs plans wick/embers && git init`
   if not already a repo. Touch decisions.md and wick/overrides.md.
3. Enter Phase 0 (IDEATE) if triggered, else Phase 1 (SPEC). Proceed one-shot: make safe assumptions, tag risky
   ones, never stop to ask.
4. Flow into Phase 2 (PLAN + ARCHITECT). Present spec + plan + topology in one
   message and STOP for `gate: plan approved`. This is the only human gate.
5. On approval, execute Phases 3–4 autonomously per the frozen topology,
   dispatching tier-pinned subagents as the architect directed, until a
   runnable demo, a public README.md, and CLOSEOUT exist — then run Phase 5
   (DERISK.md): triage the risk ledger and, if warranted, ONE bounded
   remediation cycle before final presentation.

Constraints (from CLAUDE.md, non-negotiable): stay interactive (no claude -p /
cron), respect the diff_scope and spec_structure_lint hooks, minimize tokens
by isolating big-context/small-output nodes into subagents, write embers at
every boundary, spawn a fresh continuation subagent if wax runs low.
