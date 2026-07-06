// intervals.js — functional interval ear training in the style of Functional
// Ear Trainer: a tonal center is established (a drone, the tonic triad held
// underneath as a background bed, or a I–IV–V7–I cadence), then two notes play
// and you name the interval — by clicking a chip or playing both notes.

import { chordVoicing } from './theory.js';
import { playChord, startPad, stopPad, ensureCtx } from './audio.js';

const $ = sel => document.querySelector(sel);

const IVS = [
  { n: 1,  s: 'm2', full: 'minor 2nd' },
  { n: 2,  s: 'M2', full: 'major 2nd' },
  { n: 3,  s: 'm3', full: 'minor 3rd' },
  { n: 4,  s: 'M3', full: 'major 3rd' },
  { n: 5,  s: 'P4', full: 'perfect 4th' },
  { n: 6,  s: 'TT', full: 'tritone' },
  { n: 7,  s: 'P5', full: 'perfect 5th' },
  { n: 8,  s: 'm6', full: 'minor 6th' },
  { n: 9,  s: 'M6', full: 'major 6th' },
  { n: 10, s: 'm7', full: 'minor 7th' },
  { n: 11, s: 'M7', full: 'major 7th' },
  { n: 12, s: 'P8', full: 'octave' },
];
const IV_BY_N = Object.fromEntries(IVS.map(i => [i.n, i]));

const POOLS = {
  basic:     [3, 4, 7, 12],
  consonant: [3, 4, 5, 7, 8, 9, 12],
  all:       [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
};

const st = {
  on: false,
  target: null,     // { n, lo, hi }
  lastN: null,      // avoid repeating the same interval back-to-back
  answered: true,
  correct: 0,
  attempts: 0,
  timers: [],
};
let getKey = null;
let onStart = null;

const later = (fn, ms) => st.timers.push(setTimeout(fn, ms));
const clearTimers = () => { st.timers.forEach(clearTimeout); st.timers = []; };
const rand = n => Math.floor(Math.random() * n);

const ctxType = () => $('#iv-context').value;   // 'drone' | 'triad' | 'cadence'
const dirType = () => $('#iv-dir').value;        // 'asc' | 'desc' | 'harm'
const poolNs  = () => POOLS[$('#iv-pool').value] || POOLS.all;

// Tonic pitch parked in a comfortable middle register (MIDI 54–65).
function tonicMidi() {
  let m = 60 + ((getKey().tonic % 12) + 12) % 12;
  if (m > 65) m -= 12;
  return m;
}

// Notes for the held background bed.
function padNotes() {
  const k = getKey();
  if (ctxType() === 'triad') return chordVoicing(k.tonic, k.mode === 'minor' ? 'm' : '');
  const t = tonicMidi();
  return [t - 12, t - 5];   // an open fifth on the tonic, an octave low
}

// Establish the key center, then call `then`. Drone/triad hang a bed under the
// question; the cadence plays out first with no bed.
function establishContext(then) {
  if (ctxType() === 'cadence') { stopPad(); playCadence(then); return; }
  startPad(padNotes(), ctxType() === 'triad' ? 0.15 : 0.2);
  later(then, 700);
}

function playCadence(cb) {
  const k = getKey();
  const q = k.mode === 'minor' ? 'm' : '';
  const seq = [[k.tonic, q], [(k.tonic + 5) % 12, q], [(k.tonic + 7) % 12, '7'], [k.tonic, q]];
  seq.forEach(([r, cq], i) => later(() => playChord(chordVoicing(r, cq), 0.5, 0.5), i * 560));
  later(cb, seq.length * 560 + 480);
}

function playInterval() {
  const { lo, hi } = st.target;
  const dir = dirType();
  if (dir === 'harm') { playChord([lo, hi], 1.6, 0.8); return; }
  const [a, b] = dir === 'desc' ? [hi, lo] : [lo, hi];
  playChord([a], 0.85, 0.8);
  later(() => playChord([b], 1.2, 0.8), 620);
}

function newTarget() {
  const pool = poolNs();
  let n;
  do { n = pool[rand(pool.length)]; } while (pool.length > 1 && n === st.lastN);
  st.lastN = n;
  // root the lower note on a scale tone within a fifth of the tonic, so both
  // notes sit against the drone/triad in a musical way
  const k = getKey();
  const lows = k.mode === 'minor' ? [0, 2, 3, 5, 7] : [0, 2, 4, 5, 7];
  const lo = tonicMidi() + lows[rand(lows.length)];
  return { n, lo, hi: lo + n };
}

function ask() {
  if (!st.on) return;
  st.target = newTarget();
  st.answered = false;
  show('which interval?  (r replays it)');
  playInterval();
}

function replayInterval() {
  if (st.on && st.target && !st.answered) playInterval();
}

function recontext() {
  if (!st.on) return;
  clearTimers();
  show(ctxType() === 'cadence' ? 'the cadence again…' : 'the tonal center…');
  establishContext(() => st.answered ? ask() : replayInterval());
}

function show(msg, cls = '') {
  const el = $('#iv-status');
  el.textContent = msg;
  el.className = cls;
}

function renderScore() {
  $('#iv-score').textContent = st.attempts ? `${st.correct} / ${st.attempts}` : '';
}

const targetLabel = () => {
  const i = IV_BY_N[st.target.n];
  return `${i.s} — ${i.full}`;
};

function reveal() {
  if (!st.on || st.answered) return;
  st.answered = true;
  st.attempts++;
  show(`it was ${targetLabel()}`, 'iv-wrong');
  renderScore();
  later(ask, 1900);
}

// Judge a guessed interval size (in semitones). Returns true/false when judged,
// null when there's no open question.
function judge(n) {
  if (!st.on || st.answered || !st.target) return null;
  st.attempts++;
  const hit = n === st.target.n;
  if (hit) {
    st.correct++;
    st.answered = true;
    show(`✓ ${targetLabel()}`, 'iv-right');
    later(ask, 1300);
  } else {
    const g = IV_BY_N[n];
    show(`✗ not ${g ? g.s : n} — try again, or reveal`, 'iv-wrong');
  }
  renderScore();
  return hit;
}

// Answer by playing exactly two notes on the keyboard.
function answerIntervalNotes(notes) {
  if (!st.on || st.answered || !st.target) return;
  const d = Math.abs(notes[0] - notes[1]);
  if (d >= 1 && d <= 12) judge(d);
}

function renderChips() {
  const row = $('#iv-choices');
  row.innerHTML = '';
  for (const n of poolNs()) {
    const i = IV_BY_N[n];
    const b = document.createElement('button');
    b.className = 'iv-chip';
    b.title = i.full;
    b.innerHTML = `<span class="s">${i.s}</span><span class="full">${i.full}</span>`;
    b.addEventListener('click', () => judge(n));
    row.appendChild(b);
  }
}

function start() {
  ensureCtx();
  if (onStart) onStart();
  st.on = true;
  st.correct = 0; st.attempts = 0;
  st.target = null; st.lastN = null; st.answered = true;
  document.body.classList.add('iv-training');
  $('#iv-start').textContent = 'stop';
  renderChips();
  show(ctxType() === 'cadence' ? 'listen — the cadence sets the key…' : 'listen — the tonal center…');
  renderScore();
  establishContext(ask);
}

function stopIntervals() {
  if (!st.on) return;
  st.on = false;
  clearTimers();
  stopPad();
  document.body.classList.remove('iv-training');
  $('#iv-start').textContent = 'start';
  show('');
  $('#iv-score').textContent = '';
}

function initIntervals(opts) {
  getKey = opts.getKey;
  onStart = opts.onStart || null;
  $('#iv-start').addEventListener('click', () => st.on ? stopIntervals() : start());
  $('#iv-replay').addEventListener('click', replayInterval);
  $('#iv-context-btn').addEventListener('click', recontext);
  $('#iv-reveal').addEventListener('click', reveal);
  $('#iv-pool').addEventListener('change', renderChips);
  $('#iv-context').addEventListener('change', () => { if (st.on) recontext(); });
  $('#iv-dir').addEventListener('change', () => { if (st.on) replayInterval(); });
  renderChips();
}

const isIntervalsOn = () => st.on;

export { initIntervals, isIntervalsOn, answerIntervalNotes, replayInterval, stopIntervals };
