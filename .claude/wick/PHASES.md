# PHASES.md — the one-shot run (plan-gate-once variant)

Read on `/fire`. One human gate only: plan approval. Everything after is
autonomous through to the demo. Every phase follows the lead/worker protocol
in TL.md: the orchestrator (top tier) authors briefs and makes selections;
cheap tiers do volume work.

## Phase 0 — IDEATE (conditional; lead + parallel idea-gen workers)
Runs only if the human passed `ideate` or the idea is too vague to spec
(orchestrator states which in one line). Full protocol: IDEATE.md.
Generator/discriminator loop, max 2 rounds, winning idea card lands in
wick/embers/ideation.md and seeds Phase 1. No extra gate.

## Phase 1 — SPEC (orchestrator as lead, no spawn)
1. If wick.md manifest exists, parse it; else use the idea string. Write
   specs/<f>.md: `# f`, `## Intent`, `## Requirements` (R-### ids),
   `## Out of scope`, `## Open questions`. For anything ambiguous, make the
   safe assumption, tag it in `## Assumptions` as [SAFE]/[RISKY], and keep
   going — do NOT stop to ask (one-shot).
2. The spec_structure_lint hook fires on Write to specs/ and blocks if the
   shape is wrong. Fix until green.
3. No gate here. Flow straight into Phase 2.

## Phase 2 — PLAN + ARCHITECT (orchestrator)
1. Decompose spec → node DAG. Each node: type, complexity, exact file globs,
   verify method, deps. Every R-### maps to ≥1 node.
2. Run ARCHITECT.md → append the topology table + budget note. As lead,
   also AUTHOR the Phase-3 briefs now (TL.md format, one per node/batch) and
   file them in plans/briefs/ — judgment gets encoded at plan time so
   execution workers need none.
3. Present spec summary + plan + topology in ONE message. This is the gate.
   → wait for `gate: plan approved`. The human may edit assumptions or tiers
     first; fold changes in, re-present only what changed.
4. On approval: write wick/embers/plan.md, commit, freeze topology.

## Phase 3 — EXECUTE (dispatch per topology, autonomous)
Walk the DAG in dependency order. For each node or batch, per the topology:
- **orchestrator mode**: do it yourself in the main context.
- **isolate / batch mode**: spawn a subagent of the assigned type via the
  Task tool, using the pre-authored brief from plans/briefs/ (TL.md format:
  ROLE / DELIVERABLE / CONSTRAINTS / DO NOT / WAX) plus input artifacts and
  matched skill bodies. The subagent runs at its pinned tier and returns a
  committed diff + ≤10-line summary, nothing else.
Per node, after work:
- diff_scope hook (PreToolUse on Write/Edit) enforces file globs — a write
  outside scope is BLOCKED, not logged-after.
- tdd nodes: tdd_commit_order runs; test-before-impl or the run is flagged.
- run any test suite the node created.
- one fix attempt on failure; second failure → skip node, mark R-### NOT
  SHIPPED, continue (one-shot never stalls).
Write an ember after each batch. Status: one line per node in the main thread.

### Wax protocol (continuation, not compaction)
When your context runs high: write a handoff ember (state + remaining plan
nodes + topology tail), then spawn a FRESH subagent seeded ONLY with
wick/embers/ and the remaining nodes. It becomes the orchestrator for the
rest. Never compact-and-limp; never `claude -p`. The run continues interactive.

## Phase 4 — CLOSE (orchestrator)
1. hygiene.py (run explicitly) → findings verbatim into CLOSEOUT.
2. decisions.md: 1–2 lines per durable choice + risky-fork reversals.
3. Build the DEMO — required output. A runnable command or an openable file.
   If no demo is possible, say so plainly; that's a failed one-shot.
4. wick/CLOSEOUT.md: shipped R-###, NOT SHIPPED R-### + why, risky forks to
   review, exact run command, what to check first.
6. The flight recorder auto-renders wick/REPORT.md + REPORT.html on session
   stop; summarize headline numbers (subagents, wall time, tokens by model)
   in one line inside CLOSEOUT.

## Phase 5 — DERISK (the brain acts on the ledger; protocol: DERISK.md)
Triage every ledger item REMEDIATE / DOCUMENT / ESCALATE. If REMEDIATEs exist
and wax allows: ONE bounded remediation cycle (mini plan → mini execute →
re-close). No scope growth, no second cycle, no new gate. Then final
presentation: README + demo command + CLOSEOUT + report headline. Done. No `gate: ship it` in
   one-shot — delivery is the terminal state.

## Never in a run
- No `claude -p`, no cron, no scheduled-agent suggestion (metered; P-cost).
- No deploying to the internet, sending messages, or spending money. Build
  the demo; the human ships it.
