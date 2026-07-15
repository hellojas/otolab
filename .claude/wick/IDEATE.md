# IDEATE.md — Phase 0: idea iteration (generator/discriminator)

Runs when: the human fires with `ideate` (e.g. `/fire <project> ideate "vague
direction"`), OR the idea string is too underspecified to spec safely (no
clear user, mechanism, or demo shape — orchestrator's call, stated in one
line). Otherwise skip straight to Phase 1; ideation is earned, not default.

## The loop (lead = orchestrator; workers = idea-gen @ sonnet)

### Round 1 — divergent generation
1. Lead derives the ideation frame from the human's direction: the goal, the
   constraints that are real, and 3–5 DIVERGENCE AXES that would produce
   genuinely different concepts (e.g. "optimize for zero-backend" vs "optimize
   for multiplayer" vs "optimize for a 60-second demo wow").
2. Lead writes one brief per axis (TL.md format) and dispatches idea-gen
   workers IN PARALLEL — they're independent by construction (P3-clean).
3. Each worker returns 2–3 IDEA CARDS (schema below). Workers never see each
   other's output.

### Discrimination
4. Lead scores all cards against the frame: demo-ability (can it wow in one
   shot?), effort honesty (fits the wax of one run?), differentiation, and
   fit to the human's actual taste/context. Kill weak cards with one-line
   reasons — the reasons are the audit trail.
5. Verdict paths:
   - clear winner → send it into the think tank (5b)
   - promising but fuzzy → ONE sharpened round: lead writes new briefs that
     inherit the surviving cards' strengths and attack their weaknesses;
     re-dispatch; re-discriminate. Hard cap: 2 rounds total. Ideation that
     doesn't converge in 2 rounds is a scoping problem, not a generation
     problem — surface that to the human instead of burning wax.
   - hybrid → lead merges 2 cards into one concept, noting what each
     contributes.

### Think tank (after discrimination — the refinement crucible)
5b. The 1-2 surviving candidates enter leveled critique sessions per
    THINKTANK.md: parallel critics (assigned lenses) attack at L1 concept →
    L2 mechanism → L3 one-shot viability; an integrator folds accepted fixes
    into the card each level; a ≤60-line dossier (evolved card + change log
    + graveyard + unresolved dissent) goes to the brain, which verdicts
    PROCEED / REWORK <level> (max one) / KILL. The brain reads dossiers,
    never transcripts.

### Output
6. wick/embers/ideation.md: the winning concept (as a filled idea card), the
   runner-up (for CLOSEOUT's "roads not taken"), and one line per killed card.
   The think-tank-refined card (vFINAL) becomes the seed for Phase 1's spec. Then proceed.

## Idea card schema (worker deliverable)
```
NAME: <2-3 words>
ONE-LINER: <what it is, for whom>
MECHANISM: <how it actually works — the 3 sentences an engineer needs>
DEMO SHAPE: <the exact 30-second demo moment>
DIFFERENTIATOR: <why this and not the obvious version>
RISK: <the one thing most likely to kill it>
EFFORT: <S/M/L relative to a one-shot run>
```

## Gate note
Ideation adds NO extra human gate — the selected concept rides into the plan
gate, where the human sees concept + spec + plan + topology together and can
redirect there. One-shot stays one-gate.
