#!/usr/bin/env python3
"""A2 contract for the brainstorming/spec skill: the spec doc contains the
required headings, including an explicit Out of scope section, and every
requirement line carries a stable ID (R-###) so Phase 2 plan lint and Phase 4
drift checks can key off them.

Usage: spec_structure_lint.py <spec.md>
"""
import re, sys

REQUIRED_HEADINGS = ["# ", "## Intent", "## Requirements", "## Out of scope", "## Open questions"]

def main():
    text = open(sys.argv[1]).read()
    missing = [h for h in REQUIRED_HEADINGS if h not in text]
    errs = []
    if missing:
        errs.append(f"missing headings: {missing}")
    req_block = re.search(r"## Requirements\n(.*?)(\n## |\Z)", text, re.S)
    if req_block:
        lines = [l for l in req_block.group(1).splitlines() if l.strip().startswith("-")]
        unkeyed = [l for l in lines if not re.search(r"\bR-\d{3}\b", l)]
        if unkeyed:
            errs.append(f"{len(unkeyed)} requirement bullet(s) missing R-### ids")
    if errs:
        print("SPEC LINT FAIL:", *errs, sep="\n  ")
        sys.exit(1)
    print("spec_structure_lint: ok")

if __name__ == "__main__":
    main()
