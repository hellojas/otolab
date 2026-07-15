#!/usr/bin/env python3
"""A2 contract for scope isolation: the node's diff touches only its declared
file_globs. Also the deterministic backbone of P3 parallel-dispatch safety.

Usage: diff_scope.py <base_sha> <head_sha> <glob1> [<glob2> ...]
"""
import fnmatch, subprocess, sys

def main():
    base, head, *globs = sys.argv[1:]
    out = subprocess.run(["git", "diff", "--name-only", f"{base}..{head}"],
                         capture_output=True, text=True, check=True).stdout
    bad = [f for f in out.splitlines()
           if f.strip() and not any(fnmatch.fnmatch(f, g) for g in globs)]
    if bad:
        print("SCOPE VIOLATION — files outside declared globs:")
        for f in bad:
            print(f"  {f}")
        sys.exit(1)
    print("diff_scope: ok")

if __name__ == "__main__":
    main()
