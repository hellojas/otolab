# DERISK.md — Phase 5: the brain triages the risk ledger, then acts

Runs after Phase 4 assembles the risk ledger. The premise: a closeout that
merely *lists* risks is half a job — the brain should spend remaining wax
reducing them. But unbounded self-remediation is how runs eat themselves, so
this cycle is explicitly capped.

## The risk ledger (assembled in Phase 4)
1. [RISKY] assumption forks that turned out load-bearing (from ASSUMPTIONS.md)
2. NOT SHIPPED R-### items (nodes skipped after the one-fix rule)
3. Unresolved kill/major-severity think-tank objections that survived
4. Hygiene findings (H1–H5)
5. Assertion flags (tdd order violations logged, scope widenings in overrides)

## Triage (the brain, orchestrator context, reads ledger only)
For each item, exactly one verdict:
- **REMEDIATE** — fixable within remaining wax, without expanding scope.
- **DOCUMENT** — acceptable as-is; risk + mitigation written into README's
  "Known limits" and CLOSEOUT. (Correct verdict for most [SAFE]-turned-real
  forks.)
- **ESCALATE** — needs a human decision (taste, product direction, spend).
  Lands in CLOSEOUT under "Decisions needed", phrased as a question with a
  recommended answer.

## The remediation cycle (max ONE per fire — hard cap)
If any REMEDIATE verdicts exist and wax allows:
1. Mini Phase 2: plan ONLY the derisk nodes — same node schema, same
   architect topology pass (usually collapses to orchestrator-only or one
   sonnet-exec batch). The plan's goal line is fixed: reduce risk on approved
   scope. **No new features may enter here** — derisking that grows scope is
   scope creep wearing a safety vest; the plan gate already bounded the
   project.
2. Mini Phase 3: execute derisk nodes under all normal rails (scope guard,
   one-fix rule, embers). NOT SHIPPED items get exactly one more attempt.
3. Re-run Phase 4 close: hygiene again, regenerate CLOSEOUT + README +
   report. Items still failing move to DOCUMENT or ESCALATE — never a second
   cycle.

If wax is too low for the cycle: everything REMEDIATE downgrades to ESCALATE
with a one-line remediation sketch each, so the human's next `/relight` can
run the cycle as its first act.

## Gate note
No new human gate. Remediation operates strictly inside the approved plan's
scope, which the gate already covered; that constraint is what makes
gatelessness here legitimate. In /fire-away runs this phase is especially
load-bearing — it's the closest thing an unattended run has to a reviewer.

## The suite seed (cycle 1 only)
Before triage, ensure tests/ contains at least: (a) a SMOKE test that runs
the demo command and asserts the Demo definition's "acceptance:" observable,
(b) all tests tdd nodes created. Later cycles grow the suite via repro tests
(LIFECYCLE.md); it never shrinks. The suite green = the deterministic half of
derisking done.

## Order of terminal artifacts (what "done" now means)
1. README.md — public-facing (see PHASES.md Phase 4 spec)
2. wick/CLOSEOUT.md — internal: shipped/not-shipped, forks, decisions needed
3. wick/REPORT.md + REPORT.html — runtime telemetry
4. The demo, runnable, with its command in both README and CLOSEOUT
