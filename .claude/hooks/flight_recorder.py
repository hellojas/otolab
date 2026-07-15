#!/usr/bin/env python3
"""wick flight recorder — hook handler for run telemetry.

Registered on PreToolUse, PostToolUse, SubagentStop, and Stop. Appends one
JSONL event per invocation to wick/telemetry/events.jsonl. On Stop, triggers
fire_report.py to render wick/REPORT.md from events + the session transcript.

Never blocks anything: always exits 0. Telemetry must not be able to break a
run (a recorder that can crash the plane is a design failure).
"""
import json, os, subprocess, sys, time

def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)

    root = os.environ.get("CLAUDE_PROJECT_DIR", ".")
    tdir = os.path.join(root, "wick", "telemetry")
    os.makedirs(tdir, exist_ok=True)

    cycle = 1
    try:
        cf = os.path.join(root, "wick", ".cycle")
        if os.path.exists(cf):
            cycle = int(open(cf).read().strip() or 1)
    except Exception:
        pass
    event = {
        "ts": time.time(),
        "cycle": cycle,
        "event": data.get("hook_event_name", "unknown"),
        "session_id": data.get("session_id"),
        "tool": data.get("tool_name"),
    }
    ti = data.get("tool_input") or {}
    if event["tool"] == "Task":
        # subagent dispatch: capture type + a short brief fingerprint
        event["subagent_type"] = ti.get("subagent_type") or ti.get("agent") or "unknown"
        desc = (ti.get("description") or ti.get("prompt") or "")[:120]
        event["brief"] = desc
    elif event["tool"] in ("Write", "Edit"):
        event["path"] = (ti.get("file_path") or ti.get("path") or "")[-80:]
    elif event["tool"] == "Bash":
        event["cmd"] = (ti.get("command") or "")[:80]
    if data.get("hook_event_name") in ("Stop", "SubagentStop"):
        event["transcript_path"] = data.get("transcript_path")

    try:
        with open(os.path.join(tdir, "events.jsonl"), "a") as f:
            f.write(json.dumps(event) + "\n")
    except Exception:
        pass

    # On main-agent Stop: render the report (best effort, never fail the hook)
    if data.get("hook_event_name") == "Stop":
        try:
            here = os.path.dirname(os.path.abspath(__file__))
            subprocess.run(
                [sys.executable, os.path.join(here, "fire_report.py"),
                 os.path.join(tdir, "events.jsonl"),
                 data.get("transcript_path") or "",
                 os.path.join(root, "wick", "REPORT.md")],
                timeout=30, capture_output=True)
        except Exception:
            pass
    sys.exit(0)

if __name__ == "__main__":
    main()
