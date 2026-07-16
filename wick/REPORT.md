# wick fire report

Run window: 06:33:58 → 06:45:48 (11.8 min wall) · 33 tool calls · 0 subagent dispatches · 572 model turns

## Subagents

| # | type | brief | latency |
|---|---|---|---|
| — | none (orchestrator did everything) | | |

## Tokens by model (main agent)

| model | in | out | cache read | cache write | est. API-rate $ |
|---|---|---|---|---|---|
| claude-fable-5 | 432 | 323.8k | 40057.5k | 1862.3k | $119.30 |
| claude-opus-4-8 | 77.4k | 293.8k | 37327.4k | 1696.0k | $110.99 |
| <synthetic> | 0 | 0 | 0 | 0 | $0.00 |

**Total est. API-rate spend: $230.29** (reference only — subscription auth bills your plan, not this figure; on the programmatic credit lane this approximates real draw)

## Tool latency profile

| tool | calls | total | mean |
|---|---|---|---|
| Bash | 17 | 198s | 11.7s |
| mcp__github__merge_pull_request | 1 | 2s | 2.1s |
| mcp__github__create_pull_request | 1 | 2s | 1.9s |
| Write | 4 | 0s | 0.1s |
| Edit | 4 | 0s | 0.1s |
| Read | 3 | 0s | 0.1s |
| TaskUpdate | 2 | 0s | 0.1s |
| TaskCreate | 1 | 0s | 0.1s |

_Latencies from FIFO Pre/Post pairing — approximate when calls interleave._
