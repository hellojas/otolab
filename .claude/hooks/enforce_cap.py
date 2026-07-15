#!/usr/bin/env python3
"""Deterministic verify for hotcache nodes: format + size cap (A3)."""
import re, sys

CAP_CHARS = 2400
FIELDS = ["STATE:", "DECISIONS:", "OPEN:", "NEXT:"]

def main():
    p = sys.argv[1]
    text = open(p).read()
    errs = []
    if len(text) > CAP_CHARS:
        errs.append(f"{len(text)} chars > cap {CAP_CHARS}")
    if not re.match(r"^---\n.*?feature:.*?node:.*?ts:.*?\n---\n", text, re.S):
        errs.append("missing/incomplete frontmatter (feature, node, ts)")
    for f in FIELDS:
        if f not in text:
            errs.append(f"missing field {f}")
    if errs:
        print(f"HOTCACHE FAIL {p}:", *errs, sep="\n  ")
        sys.exit(1)
    print(f"enforce_cap: ok ({len(text)} chars)")

if __name__ == "__main__":
    main()
