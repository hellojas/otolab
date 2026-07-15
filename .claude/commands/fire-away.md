---
description: Zero-gate one-shot — spec to demo with NO human gates. For remote cloud sessions and CI runs where nobody is present to approve the plan. Usage: /fire-away <project> [ideate] "<idea>" (or wick.md manifest)
argument-hint: <project> [ideate] "<idea>"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Task
---
# /fire-away — unattended one-shot (no gates)

Arguments: $ARGUMENTS (project name first; wick.md manifest at repo root wins
over the idea string).

This is /fire with the plan gate REMOVED, for runs where the human is asleep
in another timezone. The absence of a gate is compensated by rails, not trust:

1. Read .claude/wick/PHASES.md, ARCHITECT.md, TL.md (+ IDEATE.md/THINKTANK.md
   if `ideate` passed or the idea is vague).
2. Skeleton: `mkdir -p specs plans wick/embers && git init` if needed. Work on
   a branch named `wick/<project>` — NEVER on main. All commits land there.
3. MANDATORY before building: write ASSUMPTIONS.md — every choice a plan gate
   would have caught, tagged [SAFE]/[RISKY], with the alternative not taken.
   For each [RISKY] fork, build the version that is CHEAPEST TO REVERSE.
4. Run all phases per PHASES.md with these overrides:
   - no stops, no questions, ever; ambiguity → assumption → ledger
   - one-fix rule hard: second failure on a node → skip, mark R-### NOT
     SHIPPED in CLOSEOUT, continue
   - ember after every ~3 nodes (crash recovery)
   - if context/wax nears the ceiling: ship what's green, write RESUME.md,
     stop clean — a runnable partial beats a dead session
5. Then Phase 5 DERISK: triage risks, one bounded remediation cycle if wax
   allows (NOT SHIPPED items get one retry; no scope growth). Terminal state:
   public README.md + runnable demo + wick/CLOSEOUT.md (risky forks FIRST,
   decisions-needed questions, exact demo command) + ASSUMPTIONS.md,
   all committed to the wick/<project> branch. If running in CI, the workflow
   opens the PR; in a cloud session, state the branch name as the last line.

Hard limits unchanged from CLAUDE.md: no deploys, no messages, no spending,
no touching anything outside the repo. Build the demo; the human ships it.
