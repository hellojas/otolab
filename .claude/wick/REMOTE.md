# REMOTE.md — the "kick off from Seoul, check tomorrow" lanes

Three lanes, by how unattended you need it and what it costs. The billing
line: interactive sessions (even launched from your phone into Anthropic's
cloud) draw the flat subscription; headless/CI/scheduled draws the separate
monthly programmatic credit, then stops (or spills to pay-as-you-go if you
enabled usage credits).

## Lane 1 — Cloud session from the phone (subscription, one tap of approval)
Repo on GitHub → open Claude Code from the Claude mobile app / claude.ai →
start a session on the repo → `/fire <project> "idea"`. It runs in Anthropic's
sandbox; the repo's .claude/ (commands, agents, hooks) rides along because the
sandbox clones the repo. You approve the plan gate from your phone when the
notification-worthy moment arrives, then it builds; results land on a branch.
Cost: your normal subscription pool. Limits: the 5-hour session window and
weekly caps still apply — this is "check back in an hour or two", not literally
tomorrow. Best default lane.

## Lane 2 — Cowork background task (subscription, for mixed/non-code work)
Cowork on web/mobile supports background work, scheduled tasks, and mobile
approvals. Good for wick-adjacent jobs (research passes, doc assembly,
distillation sessions over overrides.md) rather than full repo builds.

## Lane 3 — GitHub Actions fire (programmatic credit, truly asleep-proof)
`.github/workflows/wick-fire.yml` (in this pack): trigger "Run workflow" from
the GitHub mobile app anywhere on earth → CI runs `/fire-away` (the zero-gate
variant) → demo lands on branch `wick/<project>` → a PR opens itself → you
review CLOSEOUT.md over coffee tomorrow. Cost: the monthly programmatic credit
(Max 20x: $200/mo, use-it-or-lose-it — it's already yours; wick's context
discipline is what stretches it). The workflow has a 120-min timeout wall so
a runaway can't drain it. Keep pay-as-you-go usage credits OFF unless you
explicitly want overflow spend.

## Which lane when
- awake-ish, want the plan gate: Lane 1
- recurring/light or non-code: Lane 2
- genuinely overnight, zero touches, budget = the credit you'd lose anyway:
  Lane 3 with a filled wick.md (the manifest is what makes gateless safe)

## The safety inversion to remember
Removing the plan gate moves the safety burden onto the wick.md manifest +
ASSUMPTIONS.md ledger + reversible-fork rule + branch isolation (never main).
An unattended fire with an empty manifest is a coin flip; with a filled one
it's a spec you wrote in advance. Fill the manifest.
