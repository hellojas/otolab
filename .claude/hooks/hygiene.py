#!/usr/bin/env python3
"""A5 — Phase 4 hygiene node. Deterministic repo-health pass.

Checks:
  H1 decisions.md references to files that no longer exist
  H2 dead intra-doc relative links across specs/, plans/, decisions.md
  H3 hot-cache entries over the size cap
  H4 orphan episodic logs (feature dir with no matching feature record)
  H5 spec->plan drift: R-### ids present in the spec but absent from the plan

Output: findings appended to state/hygiene/<ts>.md and echoed. Exit 0 always
(SOFT — findings feed the delta-PRD; they don't block).
"""
import datetime, glob, os, re, sys

def exists_rel(root, ref):
    return os.path.exists(os.path.join(root, ref))

def main(root="."):
    findings = []

    dec = os.path.join(root, "decisions.md")
    if os.path.exists(dec):
        for i, line in enumerate(open(dec), 1):
            for ref in re.findall(r"`([\w./-]+\.\w{1,6})`", line):
                if "/" in ref and not exists_rel(root, ref):
                    findings.append(f"H1 decisions.md:{i} references missing file {ref}")

    doc_files = glob.glob(os.path.join(root, "specs/*.md")) + \
                glob.glob(os.path.join(root, "plans/*.md")) + ([dec] if os.path.exists(dec) else [])
    for doc in doc_files:
        base = os.path.dirname(doc)
        for i, line in enumerate(open(doc), 1):
            for link in re.findall(r"\]\((?!http)([^)#]+)", line):
                if not (exists_rel(base, link) or exists_rel(root, link)):
                    findings.append(f"H2 {os.path.relpath(doc, root)}:{i} dead link {link}")

    for hc in glob.glob(os.path.join(root, "state/hotcache/**/*.md"), recursive=True):
        if len(open(hc).read()) > 2400:
            findings.append(f"H3 {os.path.relpath(hc, root)} exceeds hot-cache cap")

    features = {os.path.basename(p) for p in glob.glob(os.path.join(root, "specs/*.md"))}
    features = {os.path.splitext(f)[0] for f in features}
    for ep in glob.glob(os.path.join(root, "state/episodic/*")):
        if os.path.basename(ep) not in features:
            findings.append(f"H4 orphan episodic dir {os.path.relpath(ep, root)}")

    for spec in glob.glob(os.path.join(root, "specs/*.md")):
        name = os.path.splitext(os.path.basename(spec))[0]
        plan = os.path.join(root, "plans", f"{name}.md")
        if os.path.exists(plan):
            spec_ids = set(re.findall(r"\bR-\d{3}\b", open(spec).read()))
            plan_ids = set(re.findall(r"\bR-\d{3}\b", open(plan).read()))
            for rid in sorted(spec_ids - plan_ids):
                findings.append(f"H5 {name}: {rid} in spec but not in plan")

    ts = datetime.datetime.now().strftime("%Y%m%dT%H%M")
    outdir = os.path.join(root, "state/hygiene"); os.makedirs(outdir, exist_ok=True)
    out = os.path.join(outdir, f"{ts}.md")
    with open(out, "w") as f:
        f.write(f"# Hygiene findings {ts}\n\n" +
                ("\n".join(f"- {x}" for x in findings) if findings else "- clean\n"))
    print(f"{len(findings)} finding(s) -> {os.path.relpath(out, root)}")
    for x in findings:
        print(" ", x)

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ".")
