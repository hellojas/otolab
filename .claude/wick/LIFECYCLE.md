# LIFECYCLE.md — from one-shot to versions to features

A project is not a fire; it is a sequence of them. This protocol strings
fires into CYCLES, cycles into VERSIONS, and post-v1 work into FEATURES.

## The state file
wick/.cycle holds one integer (current cycle number). /fire writes 1;
/refire increments it. The flight recorder stamps every event with it, so
telemetry accumulates per-cycle forever and /fire-report can snapshot any
time — the report is never "over".

## Mode 1 — the v0 loop (fire, then refire until it's real)
```
/fire <project> "idea"          # cycle 1: full pipeline, plan gate
  → demo + README + CLOSEOUT + report
/refire "<bugs / feedback>"     # cycle 2..N: iteration cycles
  → same, tagged v0.<cycle>
gate: version 1                 # human declares it real
  → git tag v1.0, mode flips to features
```

### What /refire reuses (the whole point)
- **Spec**: amended, not rewritten. Bugs/feedback become new R-### entries
  under `## Cycle N` in the existing spec; original intent and out-of-scope
  stand unless the human's feedback explicitly moves them.
- **Plan + topology**: the architect runs in DELTA mode — plans only the new
  nodes, using cycle 1's topology as the prior ("endpoints batched well last
  time; keep that shape"). Prior topologies + their report numbers are the
  evidence base: check REPORT.md's by-cycle table before re-deciding.
- **Memory**: embers + decisions.md carry forward untouched. A refire never
  re-reads old transcripts (A4); the repo IS the state.
- **Gate**: refire cycles present the delta plan for `gate: plan approved` —
  cheap to review since it's only new nodes. `/refire auto "<bugs>"` skips
  it under fire-away rails (branch isolation, assumption ledger).

### The bug → test → fix law (HARD, enforced by the existing tdd hook)
Every bug in a refire becomes a failing REPRO TEST committed before any fix
is attempted. tdd_commit_order already enforces test-commit-before-impl-
commit; refire just makes every bugfix node a tdd node. Consequences:
- the test suite grows monotonically — each cycle leaves the project safer
- a bug that can't be repro-tested gets a manual-verification note in the
  spec entry instead, marked [UNTESTABLE] with why
- fixed-bug tests never get deleted, only updated

## The suite (built during Phase 4/5, the accumulating asset)
Cycle 1's derisk phase seeds tests/ with:
1. a SMOKE test derived from the Demo definition ("acceptance:" line made
   executable — the demo command runs and the observable thing is observed)
2. whatever unit tests tdd nodes already created
Every later cycle adds its repro tests. Phase 3 of ANY cycle ends with the
FULL suite green — the suite is the regression gate, and it is deterministic
verification (P5) doing the reviewing that a human isn't there to do.

## Mode 2 — feature mode (after `gate: version 1`)
```
/fire-feature <name> "<idea>"
```
Runs the full mini-lifecycle on branch feat/<name>:
1. Spec: NEW spec file specs/feat-<name>.md (features get their own spec;
   the v1 spec is history, not a scratchpad). Inherits project context from
   decisions.md + README, never from transcripts.
2. Plan + architect + gate (or `auto`), execute under all rails.
3. Landing requirement (HARD): the ENTIRE accumulated suite passes, plus the
   feature's own new tests. A feature that breaks a v1 test does not land —
   it goes to derisk or escalates.
4. Close: README updated (Usage section gains the feature), CLOSEOUT for the
   branch, PR to main. Human merges; merge = ship.
Feature cycles number as v1.<n> in telemetry.

## Version tokens
- `gate: version 1` — tag v1.0, flip to feature mode
- later: `gate: version <x.y>` after any feature merge, tags accordingly

## Report semantics across the lifecycle
- events.jsonl is append-forever, cycle-stamped
- every session Stop re-renders REPORT.md/html over ALL history: per-cycle
  table (tokens, dispatches, wall, est $) + all-time totals — so cost/effort
  trends across cycles are visible (is each cycle getting cheaper? it should:
  cache discipline + suite catching regressions early)
- `/fire-report` = snapshot on demand, any time, mid-anything
