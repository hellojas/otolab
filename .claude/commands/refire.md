---
description: Iterate on the current project — bugs/feedback become a new cycle reusing the existing spec, plan shape, and topology. Usage: /refire "<bugs or feedback>" (add `auto` to skip the delta plan gate)
argument-hint: [auto] "<bugs / feedback / what to change>"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Task
---
# /refire — iteration cycle

Arguments: $ARGUMENTS

1. Read .claude/wick/LIFECYCLE.md (governs this command) + PHASES.md +
   ARCHITECT.md if not already loaded this session.
2. Increment wick/.cycle (create with value 2 if missing). All telemetry for
   this run stamps with the new cycle number.
3. Amend the existing spec: each bug/feedback item becomes an R-### under
   `## Cycle <N>`. Bugs additionally get: repro steps, expected vs actual.
   Do NOT rewrite intent or out-of-scope.
4. DELTA plan: architect plans ONLY the new nodes, using the prior cycle's
   topology and REPORT.md by-cycle numbers as priors. Every bugfix node is a
   tdd node: failing repro test committed BEFORE the fix (the hook enforces).
5. Gate: present the delta plan → wait for `gate: plan approved`. If `auto`
   was passed: skip the gate under fire-away rails (work on branch
   wick/cycle-<N>, ASSUMPTIONS.md updated, reversible forks).
6. Execute; the FULL accumulated test suite must be green at phase end, not
   just the new tests. Then Phase 4 close (README "Known limits" updated,
   CLOSEOUT regenerated) and Phase 5 derisk as normal. Tag v0.<N>.
