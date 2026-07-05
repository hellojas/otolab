// curriculum.js — the program the gym never had. The drills all exist and all
// log to the progress store; this module sequences them into a syllabus, gates
// each unit behind a mastery threshold, and assembles a short daily workout so
// there's always an obvious next thing to practise.
//
// It owns two dojo tabs — "today" (the workout + streak) and "path" (the whole
// syllabus as locked / current / done) — and drives the existing drills through
// dojo's runAssignment(drill, config) helper: set a drill's selects, start it.

import {
  catItemStats, dueItems, streak, onRecord, stats as progressStats,
} from './progress.js';

const KEY = 'otolab:v1:curriculum';

// ---- syllabus -------------------------------------------------------------
// Each unit names a drill (a runAssignment key), the select config to launch it
// with, the progress `cat` its attempts log under, the `goalItems` (bare ids as
// record() stores them) that must reach `goalPct` accuracy over `goalCount`
// combined attempts, and `requires` (unit ids that unlock it).
const UNITS = [
  {
    id: 'int-perfect', title: 'Intervals · perfect & thirds',
    drill: 'intervals', cat: 'intervals', config: { 'int-type': 'melodic-both' },
    goalItems: ['P4', 'P5', 'M3', 'm3'], goalPct: 85, goalCount: 20, requires: [],
    blurb: 'P4/P5 and the two thirds — the backbone of root motion and chord color.',
  },
  {
    id: 'int-steps', title: 'Intervals · seconds & sixths',
    drill: 'intervals', cat: 'intervals', config: { 'int-type': 'melodic-both' },
    goalItems: ['m2', 'M2', 'm6', 'M6'], goalPct: 80, goalCount: 20, requires: ['int-perfect'],
    blurb: 'Steps and their inversions — the leaps that fill melodies in.',
  },
  {
    id: 'int-sevenths', title: 'Intervals · sevenths & tritone',
    drill: 'intervals', cat: 'intervals', config: { 'int-type': 'mixed' },
    goalItems: ['m7', 'M7', 'TT'], goalPct: 78, goalCount: 15, requires: ['int-steps'],
    blurb: 'The dissonances that name a chord — the tritone inside every dominant.',
  },
  {
    id: 'mdeg-major', title: 'Scale degrees · major',
    drill: 'mdeg', cat: 'mdeg', config: { 'mdeg-mode': 'major', 'mdeg-level': 'diatonic' },
    goalItems: ['1', '2', '3', '4', '5', '6', '7'], goalPct: 80, goalCount: 28, requires: ['int-perfect'],
    blurb: 'Movable-do hearing: place any note against the tonic. The melodic core.',
  },
  {
    id: 'mdeg-minor', title: 'Scale degrees · minor',
    drill: 'mdeg', cat: 'mdeg', config: { 'mdeg-mode': 'minor', 'mdeg-level': 'diatonic' },
    goalItems: ['1', '2', 'b3', '4', '5', 'b6', 'b7'], goalPct: 78, goalCount: 28, requires: ['mdeg-major'],
    blurb: 'The minor scale by ear — the flat third, sixth and seventh that color it.',
  },
  {
    id: 'qual-triads', title: 'Chord qualities · triads',
    drill: 'qualities', cat: 'qualities', config: { 'qual-level': 'triads' },
    goalItems: ['maj', 'm', 'dim', 'aug', 'sus4'], goalPct: 80, goalCount: 20, requires: [],
    blurb: 'Major, minor, diminished, augmented, sus — the raw color of a chord.',
  },
  {
    id: 'qual-sevenths', title: 'Chord qualities · sevenths',
    drill: 'qualities', cat: 'qualities', config: { 'qual-level': 'sevenths' },
    goalItems: ['maj7', '7', 'm7', 'm7b5'], goalPct: 78, goalCount: 24, requires: ['qual-triads'],
    blurb: 'The four seventh chords jazz is built from — maj7, dom7, m7, ø7.',
  },
  {
    id: 'deg-major', title: 'Function · major degrees',
    drill: 'degrees', cat: 'degrees', config: { 'deg-mode': 'major' },
    goalItems: ['Imaj7', 'ii7', 'IVmaj7', 'V7', 'vi7'], goalPct: 78, goalCount: 25,
    requires: ['mdeg-major', 'qual-sevenths'],
    blurb: 'Root + quality relative to the key: the roman numeral. The multiplier skill.',
  },
  {
    id: 'deg-minor', title: 'Function · minor degrees',
    drill: 'degrees', cat: 'degrees', config: { 'deg-mode': 'minor' },
    goalItems: ['i7', 'iiø7', 'iv7', 'V7', 'bVII7'], goalPct: 72, goalCount: 25,
    requires: ['deg-major', 'mdeg-minor'],
    blurb: 'Functional hearing in minor keys — the iiø–V–i and its neighbours.',
  },
  {
    id: 'sing-degrees', title: 'Produce · sing the degrees',
    drill: 'sing', cat: 'sing', config: { 'sing-mode': 'degree', 'sing-keymode': 'major' },
    goalItems: ['deg:1', 'deg:3', 'deg:5'], goalPct: 70, goalCount: 12, requires: ['mdeg-major'],
    blurb: 'Audiation: make the pitch, not just name it. Sing a degree cold from the key.',
  },
  {
    id: 'rhythm-easy', title: 'Rhythm · tap it back',
    drill: 'rhythm', cat: 'rhythm', config: { 'rhy-level': 'easy' }, launchesReady: false,
    goalItems: ['easy'], goalPct: 70, goalCount: 10, requires: [],
    blurb: 'Half of transcription is rhythm — hear a bar, tap it back on the beat.',
  },
  {
    id: 'echo-lines', title: 'Reproduce · echo a phrase',
    drill: 'echo', cat: 'echo', config: { 'echo-type': 'guide', 'echo-mode': 'echo' },
    goalItems: ['guide', 'bebop', 'enclosure'], goalPct: 65, goalCount: 12,
    requires: ['deg-major'],
    blurb: 'Hear an idiomatic line and play it straight back — the productive loop.',
  },
  {
    id: 'cadence-id', title: 'Harmony · name the cadence',
    drill: 'cadence', cat: 'cadence', config: {},
    goalItems: ['ii-V-I', 'backdoor', 'tritone-sub', 'deceptive'], goalPct: 65, goalCount: 16,
    requires: ['deg-major'],
    blurb: 'Hear a whole cadence as one gesture — ii–V–I vs backdoor vs tritone sub.',
  },
];

const UNIT_BY_ID = Object.fromEntries(UNITS.map(u => [u.id, u]));

// The applied assignment: each unit points at a specific real tune from the
// groundtruth collection whose changes exercise that unit's skill at roughly
// its level. The changes quiz plays it and hides the title until you check —
// so "apply it" is a curated transcription target, not "load anything".
const APPLY_SONG = {
  'int-perfect':  'stand-by-me',      // I–vi–IV–V, textbook root motion
  'int-steps':    'let-it-be',        // stepwise diatonic pop
  'int-sevenths': 'all-of-me',        // dominant chains, sevenths everywhere
  'mdeg-major':   'no-woman-no-cry',  // plain diatonic major
  'mdeg-minor':   'hotel-california',  // an accessible minor-key tune
  'qual-triads':  'someone-like-you', // clean triads, one per chord
  'qual-sevenths':'blue-bossa',       // m7 / dom7 / maj7 side by side
  'deg-major':    'fly-me-to-the-moon', // circle-of-fifths ii–V chains
  'deg-minor':    'autumn-leaves',    // the definitive minor ii–V–i
  'sing-degrees': 'creep',            // I–III–IV–iv, sing against the key
  'rhythm-easy':  'twelve-bar-blues', // the form every ear should own
  'echo-lines':   'take-the-a-train', // a melodic jazz head
  'cadence-id':   'girl-from-ipanema', // famous cadence + key shift
};

// ---- persistent state -----------------------------------------------------

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && Array.isArray(d.completedUnits)) return d;
  } catch (e) { /* fall through */ }
  return { completedUnits: [], currentUnit: UNITS[0].id, dailyCat: {} };
}
let cs = load();
function persist() { localStorage.setItem(KEY, JSON.stringify(cs)); }

function todayStr() { return new Date().toISOString().slice(0, 10); }

// ---- mastery + progression ------------------------------------------------

const done = id => cs.completedUnits.includes(id);
const unlocked = u => u.requires.every(done);

function unitMastery(u) {
  const s = catItemStats(u.cat, u.goalItems);
  return { seen: s.seen, pct: s.pct, met: s.seen >= u.goalCount && s.pct >= u.goalPct, perItem: s.perItem };
}

// Re-check every unlocked, not-yet-done unit; mark newly-mastered ones complete
// and slide `currentUnit` to the next available one. Returns true if anything
// changed (so the caller can re-render).
function reconcile() {
  let changed = false;
  for (const u of UNITS) {
    if (done(u.id) || !unlocked(u)) continue;
    if (unitMastery(u).met) { cs.completedUnits.push(u.id); changed = true; }
  }
  const cur = UNIT_BY_ID[cs.currentUnit];
  if (!cur || done(cur.id) || !unlocked(cur)) {
    const next = UNITS.find(u => !done(u.id) && unlocked(u));
    cs.currentUnit = next ? next.id : (UNITS.find(u => !done(u.id)) || UNITS[UNITS.length - 1]).id;
    changed = true;
  }
  if (changed) persist();
  return changed;
}

// ---- daily per-cat tally (drives the workout checklist) -------------------

function bumpDaily(cat, ok) {
  const day = todayStr();
  const d = cs.dailyCat[day] || (cs.dailyCat[day] = {});
  const c = d[cat] || (d[cat] = { reps: 0, correct: 0 });
  c.reps++; if (ok) c.correct++;
  persist();
}
function todayCat(cat) {
  return (cs.dailyCat[todayStr()] || {})[cat] || { reps: 0, correct: 0 };
}

// ---- workout generator ----------------------------------------------------
// Four steps: warm up on something already learned · today's focus unit ·
// review the weak / due items · apply it on a real tune.
function buildWorkout() {
  reconcile();
  const cur = UNIT_BY_ID[cs.currentUnit] || UNITS[0];
  const doneUnits = UNITS.filter(u => done(u.id));

  // warm-up: the mastered unit you're currently weakest on, else the focus unit
  let warm = doneUnits.slice().sort((a, b) => unitMastery(a).pct - unitMastery(b).pct)[0] || cur;

  const steps = [];
  steps.push({
    key: 'warm', label: 'Warm up', title: warm.title, cat: warm.cat,
    drill: warm.drill, config: warm.config, goalCount: 8, goalPct: 0,
    note: 'loosen the ears — 8 quick reps',
  });
  steps.push({
    key: 'focus', label: "Today's focus", title: cur.title, cat: cur.cat,
    drill: cur.drill, config: cur.config, goalCount: Math.min(cur.goalCount, 15),
    goalPct: cur.goalPct, note: cur.blurb, unitId: cur.id,
  });

  // review: whichever learned drill owns the most overdue items (focus flag on)
  const due = dueItems();
  let review = null;
  if (due.length) {
    const byCat = {};
    for (const d of due) byCat[d.cat] = (byCat[d.cat] || 0) + 1;
    const topCat = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0][0];
    review = UNITS.find(u => u.cat === topCat && (done(u.id) || u.id === cur.id));
  }
  if (!review) review = doneUnits[0] || cur;
  const reviewConfig = { ...review.config };
  if (review.drill === 'mdeg') reviewConfig['mdeg-focus'] = true;
  steps.push({
    key: 'review', label: 'Review', title: review.title, cat: review.cat,
    drill: review.drill, config: reviewConfig, goalCount: 10, goalPct: 0,
    note: due.length ? `${due.length} item${due.length > 1 ? 's' : ''} due — resurface the weak ones` : 'keep it warm',
  });

  const applySongId = APPLY_SONG[cur.id];
  steps.push({
    key: 'apply', label: 'Apply it', title: 'Transcribe a real tune', cat: null,
    drill: 'changes', config: applySongId ? { songId: applySongId } : {}, manual: true,
    note: 'a tune matched to this unit plays — name its changes by ear, then grade. '
      + 'Title stays hidden until you check; any graded transcription ticks this off.',
  });

  return { cur, steps };
}

// a step is "done" when today's reps for its cat reach its goal (and pct, if set)
function stepDone(step) {
  if (step.manual) return !!(manualDone[step.key]);
  const t = todayCat(step.cat);
  if (t.reps < step.goalCount) return false;
  if (step.goalPct && Math.round(100 * t.correct / Math.max(1, t.reps)) < step.goalPct) return false;
  return true;
}
let manualDone = {};

// ---- rendering ------------------------------------------------------------

let deps = null; // { runAssignment, isActive(tab) }
let els = {};

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function renderToday() {
  const box = els.today;
  if (!box) return;
  box.innerHTML = '';
  const { cur, steps } = buildWorkout();

  // streak + due banner
  const head = el('div', 'curr-head');
  const st = streak();
  const overall = progressStats().overall;
  head.appendChild(streakBadge(st));
  const sub = el('div', 'curr-sub');
  sub.innerHTML = `<b>${cur.title}</b> is your current unit · `
    + `${overall.seen} attempts logged all-time · ${dueItems().length} due for review`;
  head.appendChild(sub);
  box.appendChild(head);

  const list = el('div', 'curr-steps');
  steps.forEach(step => list.appendChild(renderStep(step)));
  box.appendChild(list);
}

function streakBadge(n) {
  const b = el('div', 'curr-streak');
  b.innerHTML = `<span class="curr-streak-num">${n}</span>`
    + `<span class="curr-streak-lbl">day${n === 1 ? '' : 's'}<br>streak</span>`;
  if (n === 0) b.querySelector('.curr-streak-lbl').innerHTML = 'start<br>today';
  return b;
}

function renderStep(step) {
  const row = el('div', 'curr-step' + (stepDone(step) ? ' done' : ''));
  const mark = el('div', 'curr-check', stepDone(step) ? '✓' : '');
  row.appendChild(mark);

  const body = el('div', 'curr-step-body');
  const top = el('div', 'curr-step-top');
  top.appendChild(el('span', 'curr-step-label', step.label));
  top.appendChild(el('span', 'curr-step-title', step.title));
  body.appendChild(top);
  body.appendChild(el('div', 'curr-step-note', step.note));

  // live progress toward the mini-goal
  if (!step.manual) {
    const t = todayCat(step.cat);
    const prog = el('div', 'curr-step-prog');
    const pct = t.reps ? Math.round(100 * t.correct / t.reps) : 0;
    prog.textContent = `${Math.min(t.reps, step.goalCount)}/${step.goalCount} today`
      + (step.goalPct ? ` · need ${step.goalPct}% (at ${pct}%)` : '') ;
    body.appendChild(prog);
  }
  row.appendChild(body);

  const btn = el('button', 'curr-start primary', stepDone(step) ? 'again' : 'start');
  // just launch — a drilled step ticks from its reps, the applied step from a
  // real graded transcription (or the "did it" override below).
  btn.onclick = () => deps.runAssignment(step.drill, step.config);
  row.appendChild(btn);

  if (step.manual) {
    const chk = el('label', 'curr-manual');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!manualDone[step.key];
    input.onchange = () => { manualDone[step.key] = input.checked; renderToday(); };
    chk.appendChild(input);
    chk.appendChild(document.createTextNode(' did it'));
    row.appendChild(chk);
  }
  return row;
}

function renderPath() {
  const box = els.path;
  if (!box) return;
  reconcile();
  box.innerHTML = '';
  for (const u of UNITS) {
    const m = unitMastery(u);
    const state = done(u.id) ? 'done' : (u.id === cs.currentUnit ? 'current' : (unlocked(u) ? 'open' : 'locked'));
    const row = el('div', `path-unit path-${state}`);
    const icon = { done: '✓', current: '▶', open: '○', locked: '\u{1f512}' }[state];
    row.appendChild(el('div', 'path-icon', icon));
    const body = el('div', 'path-body');
    body.appendChild(el('div', 'path-title', u.title));
    body.appendChild(el('div', 'path-blurb', u.blurb));
    if (u.requires.length && state === 'locked') {
      const need = u.requires.filter(r => !done(r)).map(r => UNIT_BY_ID[r]?.title || r);
      body.appendChild(el('div', 'path-req', 'unlocks after: ' + need.join(', ')));
    }
    row.appendChild(body);

    const meter = el('div', 'path-meter');
    if (m.seen) {
      const track = el('div', 'stats-bar-track');
      const fill = el('div', 'stats-bar-fill');
      fill.style.width = Math.min(100, m.pct) + '%';
      fill.classList.add(m.pct < 50 ? 'low' : m.pct < u.goalPct ? 'mid' : 'high');
      track.appendChild(fill);
      meter.appendChild(track);
      meter.appendChild(el('div', 'path-meter-num', `${m.pct}% · ${m.seen}/${u.goalCount}`));
    } else {
      meter.appendChild(el('div', 'path-meter-num', `goal ${u.goalPct}% · ${u.goalCount} reps`));
    }
    row.appendChild(meter);

    if (state === 'current' || state === 'open' || state === 'done') {
      const go = el('button', 'path-go', state === 'done' ? 'revisit' : 'practise');
      go.onclick = () => deps.runAssignment(u.drill, u.config);
      row.appendChild(go);
    }
    box.appendChild(row);
  }
}

// ---- wiring ---------------------------------------------------------------

function initCurriculum(d) {
  deps = d;
  els.today = document.getElementById('curr-today');
  els.path = document.getElementById('curr-path');

  // count live attempts into the daily tally, then refresh whatever's visible
  onRecord((cat, id, ok) => {
    bumpDaily(cat, ok);
    // real transcription anywhere (lab quiz/grade, standards quiz) closes the
    // daily "apply it" step — the bridge from drilling to using the skill.
    if (cat === 'transcribe') manualDone.apply = true;
    const advanced = reconcile();
    if (deps.isActive('today')) renderToday();
    if (advanced && deps.isActive('path')) renderPath();
  });

  reconcile();
  renderToday();
  renderPath();
}

export { initCurriculum, renderToday, renderPath };
