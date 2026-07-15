# ARCHITECT.md — topology decision at plan time (the answer to "as complex as the plan calls for")

The architect runs ONCE, at the end of Phase 2, after the node DAG exists and
before any execution. Its job: decide how many subagents, of which types, at
which tiers, and how nodes map onto them. Output is a topology table appended
to the plan. There is no default shape — a 3-node CRUD demo and a 15-node app
get different topologies, and the architect derives it.

## Inputs
- the node DAG (each node has: type, est. complexity, file globs, deps,
  verify method)
- the agent roster in .claude/agents/ (their tiers + strengths)
- the wax reality: one session's context ceiling

## The decision procedure
For each node, score two axes:
1. **Capacity needed** — does this node need reasoning (design, schema,
   ambiguous spec → high tier) or is it mechanical (boilerplate, rename,
   wiring, copy → low tier)?
2. **Context independence** — can it run in a clean context with just its
   inputs (→ isolate in a subagent, protects main context), or is it deeply
   coupled to sibling nodes (→ keep in the orchestrator or batch siblings
   into one subagent)?

Then assign:
- **Tier** by capacity: mechanical → haiku-triage; standard build →
  sonnet-exec; architecture / cross-cutting design / final judging →
  opus-architect. Mixed nodes take the higher tier.
- **Grouping** by independence + token economy: independent same-tier nodes
  that share context get BATCHED into one dispatched subagent (amortize the
  brief). Coupled nodes stay sequential in the orchestrator. Nodes needing a
  clean room get their OWN subagent.
- **Isolation for token minimization**: any node whose inputs are large but
  whose output is small (e.g. "read these 6 files, emit one interface") is a
  prime isolate — the subagent eats the big context and returns the small
  artifact, so the orchestrator never loads the 6 files. This is the single
  biggest token lever; look for it explicitly.

## Output: the topology table (append to plan)
```
## Topology (architect)
| node(s) | agent type | tier | mode | why this tier |
|---|---|---|---|---|
| n1 schema | opus-architect | opus | isolate | data model is load-bearing; get it right once |
| n2,n3,n4 endpoints | sonnet-exec | sonnet | batch | standard CRUD, share the model context |
| n5 seed+copy | haiku-triage | haiku | batch | mechanical, no reasoning |
| n6 demo wiring | sonnet-exec | sonnet | orchestrator | couples everything, keep in main |
```
Plus a one-line budget note: rough token/context estimate and where the wax
risk is (which node or batch is most likely to force a continuation subagent).

## Rules
- Never spawn a subagent that returns prose. It returns a committed diff + a
  ≤10-line summary for the ember. (P3/P4)
- Prefer FEWER, well-briefed subagents over many thin ones — each spawn costs
  a briefing. Batch aggressively when tier and context allow.
- The tier justification is not optional; a topology with unexplained opus
  nodes is a cost leak and the plan gate should catch it.
- If the whole project is trivial, the correct topology is "orchestrator does
  it all, one tier, no spawns." Say so. Complexity is earned, not assumed.

## After approval
The topology is frozen for the run. Execution (PHASES.md Phase 3) dispatches
strictly according to it. If reality diverges (a "mechanical" node turns out
to need design), that's a SOFT deviation → log it, bump the tier, continue.
