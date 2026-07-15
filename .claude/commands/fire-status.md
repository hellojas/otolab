---
description: Show wick run state — current phase, topology, shipped vs pending nodes.
allowed-tools: Read, Glob, Grep, Bash
---
# /fire-status
Print, tersely: latest ember summary, the topology table from the active plan,
which R-### are shipped vs pending (from CLOSEOUT if it exists, else infer from
commits), and any lines in wick/overrides.md. No prose beyond labels.
