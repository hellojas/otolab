---
description: Render the run telemetry report now (agents spawned, latencies, token spend by model).
allowed-tools: Bash, Read
---
# /fire-report
Run: `python3 "$CLAUDE_PROJECT_DIR/.claude/hooks/fire_report.py" wick/telemetry/events.jsonl "<current transcript path if known, else empty>" wick/REPORT.md`
Then read wick/REPORT.md and show it verbatim. If events.jsonl is missing,
say telemetry starts recording from the next tool call (hooks load at session
start — a fresh install needs one session restart).
