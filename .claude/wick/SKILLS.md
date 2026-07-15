# SKILLS.md — broker table (injected by node type, not browsed)

The orchestrator/subagents apply a skill body ONLY when the active node's type
matches. Contracted skills have a hook/script that verifies compliance.

| skill | node_types | contract (hook/script) | body |
|---|---|---|---|
| brainstorm-spec | spec | spec_structure_lint | inline |
| tdd | endpoint, logic, lib | tdd_commit_order | inline |
| scoped-edit | ALL execute | scope_guard (PreToolUse) | inline |
| frontend-taste | ui | none (SOFT) | inline |
| copy-voice | copy | none (SOFT) | inline |
| readme | close | none (SOFT) | inline |

## brainstorm-spec
One-shot mode: don't interrogate. Write the full spec, list assumptions
[SAFE]/[RISKY], push ≥3 things into Out of scope. The lint hook enforces shape.

## tdd
Failing test committed BEFORE implementation file appears in a commit. Red →
green → refactor, each its own commit. tdd_commit_order checks order, not talk.

## scoped-edit
Restate the node's globs before writing. A write outside them is blocked by the
PreToolUse hook; if the plan was wrong, log to overrides.md and widen on purpose.

## frontend-taste (SOFT)
No template-default look. One typographic idea, one accent decision, spacing
scale before decoration. Extend a component library's tokens, don't inline.

## copy-voice (SOFT)
Deadpan. Shorter than feels safe. Nothing is "powerful", "seamless", or
"delightful". Read aloud, cut a third.

## readme (close nodes) — SOFT
Written for a stranger, zero context. Quickstart commands are RUN before they
are written down. Describe the product, never the process that built it. One
honest Known-limits section beats ten feature bullets. Shorter than feels
safe; deadpan.

## Adding skills
Drop a SKILL.md in .claude/skills/<name>/ with frontmatter node_types + an
optional contract naming a hook. It joins this table. If a skill and a command
share a name, the skill wins (Claude Code precedence).
