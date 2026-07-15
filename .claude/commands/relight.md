---
description: Resume a wick project from its embers (no transcript replay).
argument-hint: <project>
allowed-tools: Read, Glob, Grep, Bash, Task
---
# /relight — resume from embers
Read wick/embers/*.md ONLY (never specs/plans unless a pending node needs
them). State current phase + next action in one line, then continue the run
per .claude/wick/PHASES.md from where the embers indicate. Do not re-read the
whole history — the embers are the state (P1).
