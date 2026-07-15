# THINKTANK.md — leveled critique sessions inside ideation

Runs inside Phase 0, AFTER discrimination has cut the field to 1–2 surviving
candidates. Never on the full card set — critique is expensive attention;
spend it on survivors only.

## The shape: levels, not laps
Iterations climb abstraction levels rather than repeating at one. Each level
is one session: parallel CRITICS attack → an INTEGRATOR folds accepted fixes
into the idea → a compressed delta goes in the dossier. Default one session
per level; the brain can order a repeat of a level at checkpoint, nobody else
can.

| level | question under attack | typical critic lenses (lead assigns 2-3) |
|---|---|---|
| L1 concept | is this the right idea at all? | jaded-user ("why would I care"), differentiation ("the obvious version exists, why yours"), taste-fit (does it match the human's actual aesthetic/context) |
| L2 mechanism | does the HOW survive contact? | feasibility skeptic (what breaks first), complexity auditor (what's secretly hard), data/state realist (where does truth live, what syncs) |
| L3 one-shot | will the DEMO land in one run? | wax auditor (fits a single session?), demo dramaturg (is the 30-sec moment actually visible?), failure rehearser (what does a half-built version look like — is it still a demo?) |

## Session protocol (lead orchestrates, workers execute)
1. Lead writes critic briefs (TL.md format): each critic gets ONE lens, the
   current idea card vN, and the CRITIQUE schema. Dispatch in parallel
   (independent — P3-clean). Critics are sonnet; they never see each other.
2. Critiques return. Lead does a 10-second triage only: discard duplicates,
   forward the rest UNFILTERED to the integrator (the lead does not
   pre-judge — that's the integrator's job at this stage, the brain's at
   checkpoint).
3. INTEGRATOR (sonnet) receives idea vN + all critiques. For each: ACCEPT
   (fold the fix into the card), REJECT (one-line reason), or ESCALATE
   (can't resolve — goes to the brain verbatim). Emits idea card vN+1 plus a
   delta log. The integrator changes the card, never the goal.
4. Synthesis: one ≤15-line level summary for the dossier: what changed, what
   was rejected and why, what's escalated. Ember it.

## Critique schema (worker deliverable — falsifiable or it doesn't count)
```
LENS: <assigned>
OBJECTION: <specific, falsifiable — "X breaks when Y", never "could be better">
SEVERITY: kill / major / minor
EVIDENCE: <why you believe it — mechanism, precedent, or arithmetic>
FIX: <the smallest change that resolves it — or "none exists" (that IS the finding)>
```
Rules for critics: no praise, no hedging, no restating the idea back. A critic
with no real objection at their lens returns "LENS CLEAR" + one residual risk
— that is signal, not failure. Sycophantic critique is a mis-tier bug.

## The dossier → the brain
After L3 (or early kill), assemble wick/embers/thinktank.md, ≤60 lines:
- idea card vFINAL (the evolved artifact)
- change log: v1→vFINAL, each change tagged with the critique that caused it
- graveyard: rejected critiques + the integrator's one-line reasons
- unresolved: escalations + any KILL-severity objection that survived
  integration (dissent is preserved verbatim, never smoothed over)
- the runner-up candidate's fate in one line

The BRAIN (top-tier lead — the orchestrator session, i.e. the best model the
human is running) reads ONLY the dossier, never session transcripts. Verdict:
- PROCEED → vFINAL seeds Phase 1
- REWORK <level> → one repeat of that level with a sharpened frame (max one
  rework total per run)
- KILL → fall back to runner-up (re-enter think tank at L2, its L1 is
  inherited) or surface to the human if the bench is empty

## Wax discipline (hard numbers)
Default budget: 2 candidates max × 3 levels × 1 session × 2-3 critics = ≤18
critic dispatches, all sonnet, each returning ≤1 card of text. Integrator ≤3
dispatches. Everything the brain touches is ≤60 lines. If the human fired
with a tight direction, the lead may skip L1 entirely (concept already
chosen) — levels are earned like everything else.
