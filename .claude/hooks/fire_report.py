#!/usr/bin/env python3
"""wick fire report — renders wick/REPORT.md from telemetry events + transcript.

Usage: fire_report.py <events.jsonl> <transcript.jsonl|""> <out.md>

Sources:
- events.jsonl (flight recorder): tool calls, subagent dispatches, timestamps.
  Latency per Task = PreToolUse→PostToolUse pairing (FIFO per tool; approximate
  when calls interleave — labeled as such).
- transcript JSONL (Claude Code session log): per-message `usage` blocks give
  input/output/cache tokens by model, including subagent sidechains.

Cost figures are REFERENCE estimates at API list rates so you can see relative
spend per model — on subscription auth the actual marginal cost is your plan.
Edit PRICES to current rates.
"""
import json, os, sys, time
from collections import defaultdict, deque

# $ per MTok (input, output) — reference rates; edit to current list prices.
PRICES = {
    "haiku":  (1.00, 5.00),
    "sonnet": (3.00, 15.00),
    "opus":   (15.00, 75.00),
    "fable":  (15.00, 75.00),   # placeholder; align to published rate
}
CACHE_READ_MULT = 0.10   # cache reads bill ~10% of input rate
CACHE_WRITE_MULT = 1.25  # cache writes ~125% of input rate

def price_for(model):
    m = (model or "").lower()
    for k, v in PRICES.items():
        if k in m:
            return v
    return (3.00, 15.00)

def load_events(path):
    evs = []
    if os.path.exists(path):
        for line in open(path):
            try:
                evs.append(json.loads(line))
            except Exception:
                pass
    return evs

def pair_latencies(evs):
    """FIFO-pair Pre/Post per tool name. Approximate under interleaving."""
    pending = defaultdict(deque)
    done = []
    for e in evs:
        if e["event"] == "PreToolUse":
            pending[e.get("tool")].append(e)
        elif e["event"] == "PostToolUse":
            q = pending.get(e.get("tool"))
            if q:
                pre = q.popleft()
                done.append({**pre, "latency_s": round(e["ts"] - pre["ts"], 2)})
    return done

def parse_transcript(path):
    """Sum usage by model; also split main vs sidechain (subagent) turns."""
    by_model = defaultdict(lambda: defaultdict(int))
    side_by_model = defaultdict(lambda: defaultdict(int))
    turns = 0
    if not path or not os.path.exists(path):
        return by_model, side_by_model, turns
    for line in open(path):
        try:
            rec = json.loads(line)
        except Exception:
            continue
        msg = rec.get("message") or {}
        usage = msg.get("usage") or rec.get("usage")
        if not usage:
            continue
        turns += 1
        model = msg.get("model") or rec.get("model") or "unknown"
        bucket = side_by_model if rec.get("isSidechain") else by_model
        b = bucket[model]
        b["in"] += usage.get("input_tokens", 0)
        b["out"] += usage.get("output_tokens", 0)
        b["cache_r"] += usage.get("cache_read_input_tokens", 0)
        b["cache_w"] += usage.get("cache_creation_input_tokens", 0)
    return by_model, side_by_model, turns

def cost(model, b):
    pi, po = price_for(model)
    return (b["in"] * pi + b["out"] * po
            + b["cache_r"] * pi * CACHE_READ_MULT
            + b["cache_w"] * pi * CACHE_WRITE_MULT) / 1_000_000

def fmt_tok(n):
    return f"{n/1000:.1f}k" if n >= 1000 else str(n)



# ---------------- HTML dashboard ----------------

TIER_COLOR = {"opus": "#E8A13D", "fable": "#E8A13D", "sonnet": "#7C93A6",
              "haiku": "#6E6A5E", "default": "#4A473E"}

def tier_color(name):
    n = (name or "").lower()
    for k, v in TIER_COLOR.items():
        if k in n:
            return v
    if "critic" in n or "idea" in n or "integrat" in n or "exec" in n:
        return TIER_COLOR["sonnet"]
    if "triage" in n:
        return TIER_COLOR["haiku"]
    if "architect" in n:
        return TIER_COLOR["opus"]
    return TIER_COLOR["default"]

def render_html(evs, paired, tasks, by_model, side, turns, total_cost, out_p):
    t0 = evs[0]["ts"] if evs else 0
    t1 = evs[-1]["ts"] if evs else 1
    span = max(t1 - t0, 0.001)
    W = 1080

    def x(ts):
        return 40 + (ts - t0) / span * (W - 80)

    # timeline: lane 0 = orchestrator tools, lane 1 = subagents
    marks = []
    for e in paired:
        is_task = e.get("tool") == "Task"
        px = x(e["ts"]); pw = max((e.get("latency_s", 0)) / span * (W - 80), 2.5)
        if is_task:
            col = tier_color(e.get("subagent_type"))
            label = f'{e.get("subagent_type","?")} · {e.get("latency_s",0)}s · {(e.get("brief") or "")[:70]}'
            marks.append(f'<rect x="{px:.1f}" y="18" width="{pw:.1f}" height="34" rx="2.5" fill="{col}"><title>{label}</title></rect>')
        else:
            label = f'{e.get("tool")} · {e.get("latency_s",0)}s'
            marks.append(f'<rect x="{px:.1f}" y="66" width="{pw:.1f}" height="14" rx="2" fill="#3B382E" opacity="0.9"><title>{label}</title></rect>')
    ticks = []
    for frac in (0, 0.25, 0.5, 0.75, 1.0):
        tx = 40 + frac * (W - 80)
        ticks.append(f'<line x1="{tx}" y1="90" x2="{tx}" y2="96" stroke="#3B382E"/>'
                     f'<text x="{tx}" y="110" fill="#6E6A5E" font-size="11" text-anchor="middle">{span*frac:.0f}s</text>')

    # token bars (stacked in/out/cache-read), main + side merged w/ badge
    rows, maxtok = [], 1
    for scope, bm in (("main", by_model), ("subagent", side)):
        for m, b in bm.items():
            tot = b["in"] + b["out"] + b["cache_r"]
            maxtok = max(maxtok, tot)
            rows.append((scope, m, b, cost(m, b)))
    rows.sort(key=lambda r: -(r[2]["in"] + r[2]["out"] + r[2]["cache_r"]))
    bar_html = ""
    for scope, m, b, c in rows:
        tot = b["in"] + b["out"] + b["cache_r"]
        seg = lambda v, col: (f'<div style="width:{v/maxtok*100:.1f}%;background:{col}"></div>' if v else "")
        col = tier_color(m)
        bar_html += f"""
        <div class="tokrow">
          <div class="toklabel"><span class="dot" style="background:{col}"></span>{m}<span class="scope">{scope}</span></div>
          <div class="bar">{seg(b["cache_r"], "#2E2B22")}{seg(b["in"], "#4A473E")}{seg(b["out"], col)}</div>
          <div class="toknum">{fmt_tok(tot)}<span class="cost">${c:.2f}</span></div>
        </div>"""

    # subagent aggregate chips
    agg = defaultdict(list)
    for t in tasks:
        agg[t.get("subagent_type", "?")].append(t.get("latency_s", 0))
    chips = "".join(
        f'<div class="chip"><span class="dot" style="background:{tier_color(k)}"></span>'
        f'{k}<b>{len(v)}×</b><span class="mut">{sum(v):.0f}s</span></div>'
        for k, v in sorted(agg.items(), key=lambda kv: -sum(kv[1]))) or '<div class="mut">no subagents — orchestrator ran everything</div>'

    stats = [
        (f"{(t1-t0)/60:.1f}", "min wall"),
        (str(len(paired)), "tool calls"),
        (str(len(tasks)), "dispatches"),
        (str(turns), "model turns"),
        (f"${total_cost:.2f}", "est. api-rate"),
    ]
    stat_html = "".join(f'<div class="stat"><div class="n">{n}</div><div class="l">{l}</div></div>' for n, l in stats)

    html = f"""<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>wick · fire report</title><style>
:root{{--soot:#17150F;--wax:#EDEAE0;--mut:#6E6A5E;--line:#2E2B22;--flame:#E8A13D}}
*{{box-sizing:border-box;margin:0}}
body{{background:var(--soot);color:var(--wax);font:15px/1.5 -apple-system,'Segoe UI',sans-serif;padding:48px 24px;max-width:1128px;margin:0 auto}}
.mono{{font-family:ui-monospace,'SF Mono',Menlo,monospace;font-variant-numeric:tabular-nums}}
header{{display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid var(--line);padding-bottom:14px}}
h1{{font-size:15px;font-weight:600;letter-spacing:.02em}}
h1 b{{color:var(--flame);font-weight:600}}
.when{{color:var(--mut);font-size:12.5px}}
.stats{{display:flex;gap:40px;padding:26px 0 8px;flex-wrap:wrap}}
.stat .n{{font-family:ui-monospace,Menlo,monospace;font-size:34px;font-weight:500;letter-spacing:-.01em}}
.stat .l{{color:var(--mut);font-size:11.5px;text-transform:uppercase;letter-spacing:.09em;margin-top:2px}}
section{{margin-top:36px}}
h2{{font-size:11.5px;text-transform:uppercase;letter-spacing:.12em;color:var(--mut);font-weight:600;margin-bottom:14px}}
svg{{width:100%;height:auto;display:block}}
.lanes{{color:var(--mut);font-size:11px;display:flex;gap:18px;margin-top:6px}}
.chips{{display:flex;gap:10px;flex-wrap:wrap}}
.chip{{border:1px solid var(--line);border-radius:999px;padding:6px 14px;font-size:13px;display:flex;gap:8px;align-items:center}}
.chip b{{font-weight:600}}
.dot{{width:8px;height:8px;border-radius:50%;display:inline-block}}
.mut{{color:var(--mut)}}
.tokrow{{display:grid;grid-template-columns:280px 1fr 110px;gap:14px;align-items:center;padding:7px 0;border-bottom:1px solid var(--line)}}
.toklabel{{font-size:13px;display:flex;gap:8px;align-items:center}}
.scope{{color:var(--mut);font-size:10.5px;text-transform:uppercase;letter-spacing:.08em}}
.bar{{display:flex;height:12px;border-radius:2px;overflow:hidden;background:#1E1C15}}
.toknum{{text-align:right;font-family:ui-monospace,Menlo,monospace;font-size:13px}}
.cost{{color:var(--mut);margin-left:8px;font-size:11.5px}}
.legend{{display:flex;gap:16px;color:var(--mut);font-size:11px;margin-top:10px}}
.legend span{{display:flex;gap:6px;align-items:center}}
.sw{{width:10px;height:10px;border-radius:2px;display:inline-block}}
footer{{margin-top:44px;color:var(--mut);font-size:11.5px;border-top:1px solid var(--line);padding-top:12px;line-height:1.7}}
@media(max-width:640px){{.tokrow{{grid-template-columns:1fr}};.toknum{{text-align:left}}}}
</style></head><body>
<header><h1>wick <b>/</b> fire report</h1>
<div class="when mono">{time.strftime('%Y-%m-%d %H:%M', time.localtime(t0)) if evs else ''}</div></header>
<div class="stats">{stat_html}</div>
<section><h2>Burn timeline</h2>
<svg viewBox="0 0 {W} 118" role="img" aria-label="run timeline">{''.join(marks)}{''.join(ticks)}
<line x1="40" y1="90" x2="{W-40}" y2="90" stroke="#2E2B22"/></svg>
<div class="lanes"><span>▮ upper lane — subagent dispatches (hover for brief)</span><span>▪ lower lane — orchestrator tool calls</span></div>
</section>
<section><h2>Subagents</h2><div class="chips">{chips}</div></section>
<section><h2>Tokens by model</h2>{bar_html}
<div class="legend"><span><i class="sw" style="background:#2E2B22"></i>cache read</span>
<span><i class="sw" style="background:#4A473E"></i>input</span>
<span><i class="sw" style="background:var(--flame)"></i>output (tier color)</span></div></section>
<footer>Latencies from FIFO pre/post pairing — approximate when calls interleave.
Dollar figures are API list-rate references; subscription auth bills your plan.
On the programmatic-credit lane this approximates real draw. Source: wick/telemetry/events.jsonl + session transcript.</footer>
</body></html>"""
    open(out_p, "w").write(html)

def main():
    events_p, transcript_p, out_p = sys.argv[1], sys.argv[2], sys.argv[3]
    evs = load_events(events_p)
    paired = pair_latencies(evs)

    tasks = [e for e in paired if e.get("tool") == "Task"]
    tools = defaultdict(list)
    for e in paired:
        tools[e.get("tool") or "?"].append(e["latency_s"])

    by_model, side, turns = parse_transcript(transcript_p)

    lines = ["# wick fire report", ""]
    if evs:
        t0, t1 = evs[0]["ts"], evs[-1]["ts"]
        lines += [f"Run window: {time.strftime('%H:%M:%S', time.localtime(t0))} → "
                  f"{time.strftime('%H:%M:%S', time.localtime(t1))} "
                  f"({(t1-t0)/60:.1f} min wall) · {len(paired)} tool calls · "
                  f"{len(tasks)} subagent dispatches · {turns} model turns", ""]

    lines += ["## Subagents", "",
              "| # | type | brief | latency |", "|---|---|---|---|"]
    if tasks:
        for i, t in enumerate(sorted(tasks, key=lambda x: x["ts"]), 1):
            lines.append(f"| {i} | {t.get('subagent_type','?')} | "
                         f"{(t.get('brief') or '')[:60]} | {t['latency_s']}s |")
        agg = defaultdict(list)
        for t in tasks:
            agg[t.get("subagent_type", "?")].append(t["latency_s"])
        lines += ["", "| type | dispatches | total wall | mean |", "|---|---|---|---|"]
        for k, v in sorted(agg.items(), key=lambda kv: -sum(kv[1])):
            lines.append(f"| {k} | {len(v)} | {sum(v):.0f}s | {sum(v)/len(v):.0f}s |")
    else:
        lines.append("| — | none (orchestrator did everything) | | |")

    lines += ["", "## Tokens by model (main agent)", "",
              "| model | in | out | cache read | cache write | est. API-rate $ |",
              "|---|---|---|---|---|---|"]
    total = 0.0
    for m, b in sorted(by_model.items(), key=lambda kv: -cost(kv[0], kv[1])):
        c = cost(m, b); total += c
        lines.append(f"| {m} | {fmt_tok(b['in'])} | {fmt_tok(b['out'])} | "
                     f"{fmt_tok(b['cache_r'])} | {fmt_tok(b['cache_w'])} | ${c:.2f} |")
    if side:
        lines += ["", "## Tokens by model (subagent sidechains)", "",
                  "| model | in | out | cache read | cache write | est. $ |",
                  "|---|---|---|---|---|---|"]
        for m, b in sorted(side.items(), key=lambda kv: -cost(kv[0], kv[1])):
            c = cost(m, b); total += c
            lines.append(f"| {m} | {fmt_tok(b['in'])} | {fmt_tok(b['out'])} | "
                         f"{fmt_tok(b['cache_r'])} | {fmt_tok(b['cache_w'])} | ${c:.2f} |")
    lines += ["", f"**Total est. API-rate spend: ${total:.2f}** "
              "(reference only — subscription auth bills your plan, not this figure; "
              "on the programmatic credit lane this approximates real draw)", ""]

    # by-cycle rollup (events are cycle-stamped; cycle 1 if absent)
    cyc = defaultdict(lambda: {"calls": 0, "tasks": 0, "wall": 0.0})
    for e in paired:
        cn = e.get("cycle", 1)
        cyc[cn]["calls"] += 1
        cyc[cn]["wall"] += e.get("latency_s", 0)
        if e.get("tool") == "Task":
            cyc[cn]["tasks"] += 1
    if len(cyc) > 1:
        lines += ["## By cycle", "",
                  "| cycle | tool calls | dispatches | active tool time |",
                  "|---|---|---|---|"]
        for cn in sorted(cyc):
            d = cyc[cn]
            lines.append(f"| {cn} | {d['calls']} | {d['tasks']} | {d['wall']:.0f}s |")
        lines += ["", "_Tool activity per cycle is the cross-cycle trend proxy; token-by-cycle needs per-cycle transcripts._", ""]

    lines += ["## Tool latency profile", "",
              "| tool | calls | total | mean |", "|---|---|---|---|"]
    for k, v in sorted(tools.items(), key=lambda kv: -sum(kv[1])):
        lines.append(f"| {k} | {len(v)} | {sum(v):.0f}s | {sum(v)/len(v):.1f}s |")
    lines += ["", "_Latencies from FIFO Pre/Post pairing — approximate when calls interleave._"]

    os.makedirs(os.path.dirname(out_p), exist_ok=True)
    open(out_p, "w").write("\n".join(lines) + "\n")
    html_p = out_p.rsplit(".", 1)[0] + ".html"
    try:
        render_html(evs, paired, tasks, by_model, side, turns, total, html_p)
        print(f"report -> {out_p} + {html_p}")
    except Exception as ex:
        print(f"report -> {out_p} (html failed: {ex})")

if __name__ == "__main__":
    main()
