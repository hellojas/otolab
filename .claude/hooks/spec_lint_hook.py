#!/usr/bin/env python3
"""PostToolUse on Write: if a spec file was written, lint its structure and
surface any failure back to Claude via stderr + exit 2 (feedback, non-fatal)."""
import json, os, subprocess, sys

data = json.load(sys.stdin)
ti = data.get("tool_input", {})
path = ti.get("file_path") or ti.get("path") or ""
if "specs/" not in path.replace("\\", "/"):
    sys.exit(0)
here = os.path.dirname(os.path.abspath(__file__))
r = subprocess.run([sys.executable, os.path.join(here, "spec_structure_lint.py"), path],
                   capture_output=True, text=True)
if r.returncode != 0:
    print(r.stdout + r.stderr, file=sys.stderr)
    sys.exit(2)
sys.exit(0)
