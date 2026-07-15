#!/usr/bin/env python3
"""PreToolUse guard: block Write/Edit outside the active node's declared globs.
Exit 2 = block (the ONLY reliable block code). Exit 0 = allow.
Active globs live in wick/.active_globs (one glob per line); if absent, allow
(no node in flight => setup writes are fine)."""
import fnmatch, json, os, sys

def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)  # never block on parse failure of our own making
    ti = data.get("tool_input", {})
    path = ti.get("file_path") or ti.get("path") or ""
    if not path:
        sys.exit(0)
    globs_file = os.path.join(os.environ.get("CLAUDE_PROJECT_DIR", "."), "wick/.active_globs")
    if not os.path.exists(globs_file):
        sys.exit(0)
    globs = [l.strip() for l in open(globs_file) if l.strip()]
    if not globs:
        sys.exit(0)
    rel = os.path.relpath(path, os.environ.get("CLAUDE_PROJECT_DIR", "."))
    # wick runtime state is always writable (else the guard deadlocks on its
    # own control file). specs/ is exempt because the protocol sanctions
    # mid-node Out-of-scope appends. plans/ and .claude/ stay guarded.
    EXEMPT = ("wick/", "specs/")
    EXEMPT_FILES = ("decisions.md", "ASSUMPTIONS.md", "RESUME.md")
    norm = rel.replace("\\", "/")
    if norm.startswith(EXEMPT) or norm in EXEMPT_FILES:
        sys.exit(0)
    if any(fnmatch.fnmatch(rel, g) for g in globs):
        sys.exit(0)
    print(f"wick scope guard: {rel} is outside the active node's globs "
          f"{globs}. If the plan was wrong, log to wick/overrides.md and widen "
          f"deliberately.", file=sys.stderr)
    sys.exit(2)

if __name__ == "__main__":
    main()
