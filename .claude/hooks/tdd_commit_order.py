#!/usr/bin/env python3
"""A2 contract for the tdd skill: the failing-test commit precedes the
implementation commit within the node's commit range.

Usage: tdd_commit_order.py <base_sha> <head_sha> <test_glob> <impl_glob>
Exit 0 = compliant. Exit 1 = violation (fails closed at the verifier gate).
"""
import fnmatch, subprocess, sys

def files_at(sha_range):
    out = subprocess.run(["git", "log", "--reverse", "--name-only",
                          "--pretty=%H", sha_range],
                         capture_output=True, text=True, check=True).stdout
    commits, cur = [], None
    for line in out.splitlines():
        if len(line) == 40 and all(c in "0123456789abcdef" for c in line):
            cur = {"sha": line, "files": []}
            commits.append(cur)
        elif line.strip() and cur:
            cur["files"].append(line.strip())
    return commits

def main():
    base, head, test_glob, impl_glob = sys.argv[1:5]
    commits = files_at(f"{base}..{head}")
    first_test = next((i for i, c in enumerate(commits)
                       if any(fnmatch.fnmatch(f, test_glob) for f in c["files"])), None)
    first_impl = next((i for i, c in enumerate(commits)
                       if any(fnmatch.fnmatch(f, impl_glob) for f in c["files"])), None)
    if first_impl is not None and (first_test is None or first_test > first_impl):
        print(f"TDD VIOLATION: impl commit {commits[first_impl]['sha'][:8]} "
              f"precedes any test commit matching {test_glob}")
        sys.exit(1)
    print("tdd_commit_order: ok")

if __name__ == "__main__":
    main()
