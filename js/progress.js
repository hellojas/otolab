// progress.js — the memory the drills never had. Every attempt is logged to
// localStorage, so accuracy is tracked across sessions (not just per-session),
// weak items resurface on a spaced schedule, and the "new question" pickers can
// bias toward what you keep missing instead of pure random.
//
// Item ids are human-readable strings namespaced by drill, e.g. 'iv:M3',
// 'deg:major:5', 'qual:m7', 'mdeg:b3' — so the stats panel can group them.
//
// Each attempt can carry {guess, ms}: what the learner actually answered and
// how long they took. That unlocks confusion-pair analytics ("you hear IV as
// I"), response-time-weighted spacing (instant recall earns a longer gap than a
// laboured one), and honest mastery (a slow agonised correct isn't fluency).

const KEY = 'otolab:v1:progress';
const VERSION = 2;
const LOG_CAP = 800;

const MIN = 60000, DAY = 24 * 60 * MIN;
const EASE_START = 2.3, EASE_MIN = 1.5, EASE_MAX = 2.8;
const FLUENT_MS = 2200;   // quick recall — reward with a longer interval
const LABOURED_MS = 6000; // slow, effortful — smaller ease bump

function nowMs() { return Date.now(); }
function dayStr(t) { return new Date(t).toISOString().slice(0, 10); }

function blank() { return { version: VERSION, items: {}, log: [], daily: {} }; }

// Bring any older shape up to the current schema. v1 items lack ms/confusion
// fields; add them without touching the counts. Unknown/absent version → v1.
function migrate(d) {
  if (!d || typeof d !== 'object' || !d.items) return blank();
  if (d.version === VERSION) return d;
  for (const it of Object.values(d.items)) {
    if (it.msSum == null) it.msSum = 0;
    if (it.msCount == null) it.msCount = 0;
    if (it.confuse == null) it.confuse = {};
  }
  if (!Array.isArray(d.log)) d.log = [];
  if (!d.daily) d.daily = {};
  d.version = VERSION;
  return d;
}

function rawParse(str) {
  try { const d = JSON.parse(str); return d && d.items ? migrate(d) : null; }
  catch (e) { return null; }
}
function load() { return rawParse(safeGet()) || blank(); }

function safeGet() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
function safeSet(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* private mode etc. */ } }

let store = load();

// ---- cross-tab / multi-write safety ---------------------------------------
// Two tabs (or two devices via a sync layer) each hold the store in memory and
// write the whole blob back — naive last-writer-wins silently discards the
// other's progress. Merge instead: prefer the item with more attempts, union
// the confusion tallies, and take the busier daily count.
function mergeItem(a, b) {
  if (!a) return b;
  if (!b) return a;
  const base = (a.seen || 0) >= (b.seen || 0) ? a : b;
  const other = base === a ? b : a;
  const confuse = { ...(other.confuse || {}) };
  for (const [k, v] of Object.entries(base.confuse || {})) confuse[k] = Math.max(v, confuse[k] || 0);
  return { ...base, confuse };
}
function mergeStores(a, b) {
  const out = blank();
  const ids = new Set([...Object.keys(a.items || {}), ...Object.keys(b.items || {})]);
  for (const id of ids) out.items[id] = mergeItem(a.items[id], b.items[id]);
  const dates = new Set([...Object.keys(a.daily || {}), ...Object.keys(b.daily || {})]);
  for (const d of dates) {
    const x = a.daily[d] || { total: 0, correct: 0 }, y = b.daily[d] || { total: 0, correct: 0 };
    out.daily[d] = { total: Math.max(x.total, y.total), correct: Math.max(x.correct, y.correct) };
  }
  const seen = new Set();
  out.log = [...(a.log || []), ...(b.log || [])]
    .sort((p, q) => p.t - q.t)
    .filter(e => { const k = `${e.t}:${e.id}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(-LOG_CAP);
  return out;
}

function persist() {
  // fold in anything another tab wrote since our last read, so a concurrent
  // write can't clobber it, then save the merged result.
  const disk = rawParse(safeGet());
  if (disk) store = mergeStores(disk, store);
  safeSet(JSON.stringify(store));
}

const externalSubs = [];
function onExternalChange(cb) { externalSubs.push(cb); }
function notifyExternal() { for (const cb of externalSubs) { try { cb(); } catch (err) { /* isolate */ } } }
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('storage', e => {
    if (e.key !== KEY || !e.newValue) return;
    const disk = rawParse(e.newValue);
    if (!disk) return;
    store = mergeStores(disk, store);
    notifyExternal();
  });
}

// Subscribers fired after every record() — lets the curriculum count attempts
// live (mark a workout step done, advance a mastery gate) instead of polling.
const recordSubs = [];
function onRecord(cb) { recordSubs.push(cb); }

function item(id) {
  return store.items[id] || (store.items[id] =
    { seen: 0, correct: 0, streak: 0, ease: EASE_START, intervalMin: 0, due: 0,
      msSum: 0, msCount: 0, confuse: {} });
}

// record one attempt. cat groups items for stats ('intervals', 'qualities'…).
// meta.ms = response time in ms; meta.guess = the id the learner actually
// answered (bare, same namespace as `id`) — logged as a confusion when wrong.
function record(cat, id, ok, meta = {}) {
  const it = item(id);
  const ms = typeof meta.ms === 'number' && isFinite(meta.ms) ? meta.ms : null;
  it.seen++;
  if (ms != null) { it.msSum += ms; it.msCount++; }
  if (ok) {
    it.correct++;
    it.streak++;
    it.intervalMin = it.streak === 1 ? 10 : it.streak === 2 ? 24 * 60 : it.intervalMin * it.ease;
    // response-time-weighted spacing: instant recall pushes the next review
    // further out and earns more ease; a laboured correct barely moves.
    const fluent = ms != null && ms < FLUENT_MS;
    const laboured = ms != null && ms > LABOURED_MS;
    if (fluent) it.intervalMin *= 1.3;
    it.ease = Math.min(EASE_MAX, it.ease + (fluent ? 0.08 : laboured ? 0.02 : 0.05));
  } else {
    it.streak = 0;
    it.intervalMin = 1;
    it.ease = Math.max(EASE_MIN, it.ease - 0.2);
    if (meta.guess && meta.guess !== id) {
      it.confuse[meta.guess] = (it.confuse[meta.guess] || 0) + 1;
    }
  }
  it.due = nowMs() + it.intervalMin * MIN;
  it.cat = cat;

  const t = nowMs();
  const entry = { cat, id, ok: ok ? 1 : 0, t };
  if (ms != null) entry.ms = Math.round(ms);
  if (meta.guess) entry.guess = meta.guess;
  store.log.push(entry);
  if (store.log.length > LOG_CAP) store.log = store.log.slice(-LOG_CAP);
  const d = store.daily[dayStr(t)] || (store.daily[dayStr(t)] = { total: 0, correct: 0 });
  d.total++; if (ok) d.correct++;
  persist();
  for (const cb of recordSubs) { try { cb(cat, id, ok); } catch (e) { /* isolate */ } }
}

const accuracy = it => (it.seen ? it.correct / it.seen : null);
const avgMs = it => (it.msCount ? Math.round(it.msSum / it.msCount) : null);

// Median of a list of numbers (null for empty). Used for a unit's typical
// response time — robust to the odd very-slow or very-fast outlier in a way a
// mean isn't, so a fluency gate reads the honest middle of the distribution.
function median(xs) {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

// Weighted pick from a list of candidate ids: overdue and low-accuracy items
// get more weight, unseen items a moderate baseline. `focus` sharpens the bias.
function pickWeighted(cat, ids, focus = false) {
  if (!ids.length) return null;
  const t = nowMs();
  const weight = raw => {
    const id = idOf(cat, raw);
    const it = store.items[id];
    if (!it || !it.seen) return focus ? 1.2 : 1;      // unseen: worth exploring
    const acc = accuracy(it);
    let w = 0.3 + (1 - acc);                            // weaker → heavier
    if (it.due <= t) w *= focus ? 4 : 2;               // due for review → heavier
    return focus ? w * w : w;
  };
  const weights = ids.map(weight);
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < ids.length; i++) { r -= weights[i]; if (r <= 0) return ids[i]; }
  return ids[ids.length - 1];
}

// id builder: candidates passed to pickWeighted may be objects; the caller
// supplies how to name them via idFn, but the common case is a bare suffix.
let idFn = (cat, raw) => `${cat}:${raw}`;
function setIdFn(fn) { idFn = fn; }
function idOf(cat, raw) { return typeof raw === 'string' ? `${cat}:${raw}` : idFn(cat, raw); }

function dueCount() {
  const t = nowMs();
  return Object.values(store.items).filter(it => it.seen && it.due <= t).length;
}

// The specific items due for review right now (weakest first) — the curriculum's
// review step pulls from these instead of just counting them.
function dueItems() {
  const t = nowMs();
  return Object.entries(store.items)
    .filter(([, it]) => it.seen && it.due <= t)
    .map(([id, it]) => ({ id, cat: it.cat || id.split(':')[0], pct: Math.round(100 * accuracy(it)) }))
    .sort((a, b) => a.pct - b.pct);
}

// Aggregate accuracy over an explicit set of item ids (as passed to record() —
// bare ids like 'M3', 'ii7', 'deg:5'), optionally filtered to a cat. Mastery
// gates read this to decide whether a unit's goal items are learned.
function catItemStats(cat, ids) {
  let seen = 0, correct = 0;
  const perItem = {};
  const rts = [];
  for (const id of ids) {
    const it = store.items[id];
    if (it && it.seen && (!cat || it.cat === cat)) {
      seen += it.seen; correct += it.correct;
      const ms = avgMs(it);
      perItem[id] = { seen: it.seen, pct: Math.round(100 * accuracy(it)), ms };
      if (ms != null) rts.push(ms);
    } else {
      perItem[id] = { seen: 0, pct: null, ms: null };
    }
  }
  // medianMs is the unit's typical recall speed across its goal items — the
  // mastery gate uses it so a slow-but-correct learner isn't waved through.
  return {
    seen, correct, pct: seen ? Math.round(100 * correct / seen) : 0,
    medianMs: median(rts), perItem,
  };
}

// The learner's top confusions: when the answer was A they most often said B.
// Powers "you hear IV as I" feedback and smarter decoy selection. Pass a cat to
// scope it (e.g. 'degrees'), or omit for the whole store.
function confusions(cat = null, limit = 8) {
  const strip = s => s.replace(/^[a-z]+:/, '');
  const out = [];
  for (const [id, it] of Object.entries(store.items)) {
    if (!it.confuse || (cat && it.cat !== cat)) continue;
    for (const [guess, n] of Object.entries(it.confuse)) {
      out.push({ cat: it.cat || id.split(':')[0], answer: strip(id), guess: strip(guess), n });
    }
  }
  return out.sort((a, b) => b.n - a.n).slice(0, limit);
}

// Consecutive-day practice streak, counting back from today. A fresh day with
// nothing logged yet doesn't break yesterday's streak — it just hasn't extended.
function streak() {
  let s = 0;
  for (let i = 0; ; i++) {
    const d = store.daily[dayStr(nowMs() - i * DAY)];
    if (d && d.total > 0) s++;
    else if (i === 0) continue; // today not practiced yet — keep the run alive
    else break;
  }
  return s;
}

// aggregate stats for the panel
function stats() {
  const byCat = {};
  let seen = 0, correct = 0;
  for (const [id, it] of Object.entries(store.items)) {
    if (!it.seen) continue;
    seen += it.seen; correct += it.correct;
    const cat = it.cat || id.split(':')[0];
    const c = byCat[cat] || (byCat[cat] = { seen: 0, correct: 0, msSum: 0, msCount: 0 });
    c.seen += it.seen; c.correct += it.correct;
    c.msSum += it.msSum || 0; c.msCount += it.msCount || 0;
  }
  for (const c of Object.values(byCat)) {
    c.pct = Math.round(100 * c.correct / c.seen);
    c.avgMs = c.msCount ? Math.round(c.msSum / c.msCount) : null;
  }

  const weak = Object.entries(store.items)
    .filter(([, it]) => it.seen >= 3)
    .map(([id, it]) => ({ id, pct: Math.round(100 * accuracy(it)), seen: it.seen, avgMs: avgMs(it) }))
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 12);

  const days = [];
  for (let i = 13; i >= 0; i--) {
    const ds = dayStr(nowMs() - i * DAY);
    const d = store.daily[ds];
    days.push({ date: ds, total: d ? d.total : 0, correct: d ? d.correct : 0 });
  }

  return {
    overall: { seen, correct, pct: seen ? Math.round(100 * correct / seen) : 0 },
    byCat, weak, days, dueCount: dueCount(), confusions: confusions(),
  };
}

// Full state for export/import (the curriculum's memory travels with it).
function exportData() { return store; }
function importData(d) {
  const incoming = migrate(d);
  if (!incoming) return false;
  store = mergeStores(store, incoming);
  persist();
  notifyExternal();   // a sync/restore can complete units — let the curriculum repaint
  return true;
}

function reset() {
  store = blank();
  safeSet(JSON.stringify(store)); // write blank directly; persist() would re-merge disk and undo it
  notifyExternal();
}

export {
  record, pickWeighted, setIdFn, dueCount, dueItems, catItemStats, confusions,
  streak, onRecord, onExternalChange, stats, avgMs, exportData, importData, reset,
};
