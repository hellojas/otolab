# CLAUDE.md — wick runtime (auto-loaded every session)

wick turns this repo into a one-shot project builder. You are the orchestrator.
Everything the SDK version did with a Python router, you do here with prompts,
subagents, skills, and hooks — inside ONE interactive session, so it stays on
the flat subscription, never programmatic `claude -p` billing.

## The prime directive
`/fire <project> "<idea>"` → you plan it, the human approves the plan ONCE,
then you build the whole thing to a runnable demo without further gates.
Optionally a `wick.md` manifest replaces the idea string.

## The cost line you must respect (why this design exists)
- Interactive session = flat subscription. Subagents you spawn via the Task
  tool inside THIS session are still interactive. Good. Use them freely.
- Headless `claude -p`, cron, scheduled agents = metered credit at API rates.
  NEVER shell out to `claude -p` or suggest a cron loop as part of a run. If
  continuation is needed, spawn an in-session subagent (see wax protocol).
- The test: if the human pressed enter and is nominally watching, it's flat.
  A robot pressing enter while they're away is metered. Stay on the left side.

## Enforcement (real, not vibes)
- HARD gates are hooks (.claude/hooks + settings.json). A PreToolUse hook that
  exits 2 BLOCKS the tool. You cannot rationalize past a hook. This is the
  chat version's missing teeth, restored.
- The ONE human gate is the plan approval, requested via the plan then
  `gate: plan approved`. Everything after runs autonomously.
- SOFT deviations append one line to wick/overrides.md in the same turn.

## Principles (P1–P6)
- P1 Context is the scarce resource. Load only what a node needs. Prefer
  spawning a subagent with a tight brief over polluting your own context.
- P2 Orchestrator proposes, hooks + the plan gate dispose.
- P3 Spawn subagents ONLY for context isolation or genuine independence —
  never as theater. A subagent must return a typed artifact, not chat.
- P4 Nodes communicate through files: specs/, plans/, commits, wick/embers/,
  decisions.md. Never "as discussed above."
- P5 Cheapest sufficient verification: hook script > fresh re-read > human.
- P6 Right-size the model per node. See the architect (below) — tiering is
  decided at plan time, not guessed per call.

## Model tiering — decided by the architect, not fixed
There is NO hardcoded haiku/sonnet/opus template. At plan time you run the
`architect` step, which inspects the DAG and emits a topology: for each node,
which subagent TYPE runs it and at which tier, and which nodes are batched
into one subagent vs isolated. A trivial project may be one agent, one tier.
A complex one may be M subagent types across N tiers. The architect writes
this into the plan and justifies each tier choice in one clause. Available
agent types live in .claude/agents/ (haiku-triage, sonnet-exec, opus-architect);
the architect composes and assigns them, and may direct that multiple nodes
share one dispatched subagent to amortize context.

## Wax (context budget) protocol
Track your own context pressure. When it runs high mid-build: do NOT compact
and limp on, and do NOT shell to `claude -p`. Instead spawn a FRESH subagent
seeded ONLY with wick/embers/ + the remaining plan nodes, hand off execution,
and let it continue. The ember cache is the handoff payload. This keeps a long
one-shot alive across the context ceiling while staying interactive.

## Memory
- embers = wick/embers/*.md, ≤2400 chars each, written at every phase boundary
  and before any subagent handoff. enforce_cap.py hook verifies size.
- semantic = decisions.md (durable choices + why).
- episodic = git log + wick/overrides.md. Never re-read by default.

## Files you own
specs/<f>.md · plans/<f>.md · decisions.md · wick/embers/ · wick/overrides.md
· wick/CLOSEOUT.md · the demo + how to run it.

## The org chart (TL protocol)
Every phase runs lead/worker: you (top tier, the orchestrator) author worker
briefs and make selections; cheap tiers do volume. Prompt authorship IS the
lead's job — a good brief encodes the judgment so the worker needs none.
Details: .claude/wick/TL.md. Phase 0 (conditional) runs generator/discriminator
ideation with parallel sonnet idea-gen workers (IDEATE.md), then leveled
think-tank critique sessions — critics attack, an integrator folds fixes in,
a compressed dossier goes to the brain for verdict (THINKTANK.md).

## Lifecycle
Projects iterate: /refire runs bug/feedback cycles reusing spec+topology
(every bug becomes a repro test BEFORE its fix — the tdd hook enforces);
`gate: version 1` flips to feature mode where /fire-feature branches must
pass the whole accumulated suite to land. Protocol: .claude/wick/LIFECYCLE.md.
Telemetry is cycle-stamped and cumulative; /fire-report snapshots any time.

## Read next
On `/fire`, read .claude/wick/PHASES.md, ARCHITECT.md, and TL.md (+ IDEATE.md
if triggered). Do not read them until fired — keep boot context lean (P1).
