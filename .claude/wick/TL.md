# TL.md — the lead/worker protocol (every phase has a TL)

The org-chart principle: at every phase there is a LEAD (highest-capacity
model available) and WORKERS (cheapest tier sufficient). The lead never does
volume work; the workers never make judgment calls. The lead's two outputs:

1. **Briefs** — the lead WRITES the worker prompts. Prompt authorship is a
   lead responsibility, not a template: a good brief encodes the judgment so
   the worker doesn't need any. This is where frontier capability converts
   into cheap-tier leverage.
2. **Selections** — the lead reviews worker outputs and picks/merges/rejects.
   Convergence is expensive-model work; divergence is cheap-model work.

## Who is the lead?
The orchestrator session itself runs on whatever model the human selected —
ideally the top tier available (opus-class or above). The orchestrator IS the
TL by default. For load-bearing judging where separation matters, dispatch
opus-architect as an independent reviewer (agent separation ≈ cross-model
check). Workers are sonnet-exec / haiku-triage / idea-gen, pinned via their
agent `model:` field.

## The brief format (lead → worker, every dispatch)
```
ROLE: <one line — what kind of worker this is>
DELIVERABLE: <exact schema of what comes back — a typed artifact, never prose>
ANGLE: <the divergence axis assigned to THIS worker, if parallel generation>
CONSTRAINTS: <hard rules; includes file globs for build nodes>
DO NOT: <the 2-3 failure modes the lead anticipates>
WAX: <token/size cap on the deliverable>
```
Parallel workers get DIFFERENT angles by design — the lead's job is to
guarantee the fan-out actually diverges instead of producing five copies of
the median idea.

## Per-phase lead/worker map
| phase | lead does | workers do |
|---|---|---|
| 0 ideate | writes N divergent briefs; discriminates; merges | generate idea cards (sonnet, parallel) |
| 1 spec | writes the spec itself (judgment-dense, no fan-out) | — |
| 2 plan+architect | decomposes, runs ARCHITECT, authors all Phase-3 briefs | — |
| 3 execute | dispatches per topology; spot-reviews load-bearing diffs | build nodes per brief |
| 4 close | independent judge pass (opus-architect on work it didn't write) | mechanical closeout assembly (haiku) |

## Economics rules
- Fan-out only where outputs are cheap to evaluate and divergence has value
  (ideas, naming, approach sketches). Never fan out implementation of the
  same node — pick an approach first, build once.
- The lead reads worker DELIVERABLES, not worker reasoning. If a worker's
  reasoning matters, the brief was wrong.
- Escalation is one-way and logged: a worker that hits a judgment call
  returns early with the question in its deliverable; the lead decides and
  re-briefs. Workers never improvise judgment (mirrors haiku-triage's
  mis-tier rule).
- Complexity is earned: a phase whose task is small skips the fan-out
  entirely. The TL pattern describes capacity allocation, not mandatory
  ceremony.
