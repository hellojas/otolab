---
description: Post-v1 feature work on its own branch — full mini-lifecycle, lands only if the entire accumulated test suite passes. Usage: /fire-feature <name> "<idea>" (add `auto` for gateless)
argument-hint: <name> [auto] "<feature idea>"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Task
---
# /fire-feature — feature branch lifecycle

Arguments: $ARGUMENTS

Requires: a v1 tag exists (else suggest /refire — the project isn't in
feature mode yet).

1. Read .claude/wick/LIFECYCLE.md Mode 2. Branch: feat/<name>. Increment
   wick/.cycle.
2. NEW spec at specs/feat-<name>.md (R-### ids, out-of-scope, assumptions).
   Project context comes from decisions.md + README only.
3. Plan + architect + `gate: plan approved` (or `auto` under fire-away
   rails). Execute under all rails; feature gets its own tests.
4. LANDING GATE (HARD): the entire accumulated suite passes + the feature's
   tests pass. A feature that breaks an existing test goes to derisk, and if
   unfixable in one cycle, escalates — it does not land broken.
5. Close: update README Usage, write branch CLOSEOUT, open/describe the PR.
   Human merges. After merge the human may declare `gate: version <x.y>`.
