// progress.js — the memory the drills never had. Every attempt is logged to
// localStorage, so accuracy is tracked across sessions (not just per-session),
// weak items resurface on a spaced schedule, and the "new question" pickers can
// bias toward what you keep missing instead of pure random.
//
// Item ids are human-readable strings namespaced by drill, e.g. 'iv:M3',
// 'deg:major:5', 'qual:m7', 'mdeg:b3' — so the stats panel can group them.

const KEY = 'otolab:v1:progress';
const LOG_CAP = 800;

const MIN = 60000, DAY = 24 * 60 * MIN;
const EASE_START = 2.3, EASE_MIN = 1.5, EASE_MAX = 2.8;

function nowMs() { return Date.now(); }
function dayStr(t) { return new Date(t).toISOString().slice(0, 10); }

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && d.items) return d;
  } catch (e) { /* fall through */ }
  return { items: {}, log: [], daily: {} };
}

let store = load();
function persist() { localStorage.setItem(KEY, JSON.stringify(store)); }

// Subscribers fired after every record() — lets the curriculum count attempts
// live (mark a workout step done, advance a mastery gate) instead of polling.
const recordSubs = [];
function onRecord(cb) { recordSubs.push(cb); }

function item(id) {
  return store.items[id] || (store.items[id] =
    { seen: 0, correct: 0, streak: 0, ease: EASE_START, intervalMin: 0, due: 0 });
}

// record one attempt. cat groups items for stats ('intervals', 'qualities'…).
function record(cat, id, ok) {
  const it = item(id);
  it.seen++;
  if (ok) {
    it.correct++;
    it.streak++;
    it.intervalMin = it.streak === 1 ? 10 : it.streak === 2 ? 24 * 60 : it.intervalMin * it.ease;
    it.ease = Math.min(EASE_MAX, it.ease + 0.05);
  } else {
    it.streak = 0;
    it.intervalMin = 1;
    it.ease = Math.max(EASE_MIN, it.ease - 0.2);
  }
  it.due = nowMs() + it.intervalMin * MIN;
  it.cat = cat;

  const t = nowMs();
  store.log.push({ cat, id, ok: ok ? 1 : 0, t });
  if (store.log.length > LOG_CAP) store.log = store.log.slice(-LOG_CAP);
  const d = store.daily[dayStr(t)] || (store.daily[dayStr(t)] = { total: 0, correct: 0 });
  d.total++; if (ok) d.correct++;
  persist();
  for (const cb of recordSubs) { try { cb(cat, id, ok); } catch (e) { /* isolate */ } }
}

const accuracy = it => (it.seen ? it.correct / it.seen : null);

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
  for (const id of ids) {
    const it = store.items[id];
    if (it && it.seen && (!cat || it.cat === cat)) {
      seen += it.seen; correct += it.correct;
      perItem[id] = { seen: it.seen, pct: Math.round(100 * accuracy(it)) };
    } else {
      perItem[id] = { seen: 0, pct: null };
    }
  }
  return { seen, correct, pct: seen ? Math.round(100 * correct / seen) : 0, perItem };
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
    const c = byCat[cat] || (byCat[cat] = { seen: 0, correct: 0 });
    c.seen += it.seen; c.correct += it.correct;
  }
  for (const c of Object.values(byCat)) c.pct = Math.round(100 * c.correct / c.seen);

  const weak = Object.entries(store.items)
    .filter(([, it]) => it.seen >= 3)
    .map(([id, it]) => ({ id, pct: Math.round(100 * accuracy(it)), seen: it.seen }))
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
    byCat, weak, days, dueCount: dueCount(),
  };
}

function reset() {
  store = { items: {}, log: [], daily: {} };
  persist();
}

export { record, pickWeighted, setIdFn, dueCount, dueItems, catItemStats, streak, onRecord, stats, reset };
