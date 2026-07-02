// drill.js — functional ear training with no video: a cadence establishes
// the key center, one chord plays, you name its degree. Answer by clicking
// a palette chip or playing the chord on a keyboard.

import { paletteForKey, chordVoicing, chordLabel, useFlats } from './theory.js';
import { playChord, ensureCtx } from './audio.js';

const $ = sel => document.querySelector(sel);

const st = {
  on: false,
  target: null,     // { root, quality, roman } from the palette
  lastRoman: null,  // avoid asking the same degree twice in a row
  correct: 0,
  attempts: 0,
  answered: true,   // no open question yet
  timers: [],
};
let getKey = null;
let onStart = null;

const later = (fn, ms) => st.timers.push(setTimeout(fn, ms));
function clearTimers() { st.timers.forEach(clearTimeout); st.timers = []; }

function pool() {
  const pal = paletteForKey(getKey());
  return $('#drill-pool').value === 'outside'
    ? [...pal.diatonic, ...pal.outside] : pal.diatonic;
}

function playCadence(cb) {
  const k = getKey();
  const q = k.mode === 'minor' ? 'm' : '';
  const seq = [[k.tonic, q], [(k.tonic + 5) % 12, q], [(k.tonic + 7) % 12, '7'], [k.tonic, q]];
  seq.forEach(([r, cq], i) => later(() => playChord(chordVoicing(r, cq), 0.55, 0.5), i * 620));
  later(cb, seq.length * 620 + 650);
}

function ask() {
  if (!st.on) return;
  const p = pool();
  let t;
  do { t = p[Math.floor(Math.random() * p.length)]; }
  while (p.length > 1 && t.roman === st.lastRoman);
  st.target = t;
  st.lastRoman = t.roman;
  st.answered = false;
  show('what degree is this?  (r replays it)');
  playChord(chordVoicing(t.root, t.quality), 1.7, 0.75);
}

function drillReplay() {
  if (st.on && st.target && !st.answered) {
    playChord(chordVoicing(st.target.root, st.target.quality), 1.7, 0.75);
  }
}

function show(msg, cls = '') {
  const el = $('#drill-status');
  el.textContent = msg;
  el.className = cls;
}

function renderScore() {
  $('#drill-score').textContent = st.attempts ? `${st.correct} / ${st.attempts}` : '';
}

function targetLabel() {
  const k = getKey();
  return `${st.target.roman} — ${chordLabel(st.target.root, st.target.quality, null,
    useFlats(k.tonic, k.mode) || st.target.roman.startsWith('b'))}`;
}

function reveal() {
  if (!st.on || st.answered) return;
  st.answered = true;
  st.attempts++;
  show(`it was ${targetLabel()}`, 'drill-wrong');
  renderScore();
  later(ask, 2000);
}

// Returns true/false when the guess was judged, null when no question is open.
function answerDrill(root, quality) {
  if (!st.on || st.answered || !st.target) return null;
  st.attempts++;
  const hit = root === st.target.root && quality === st.target.quality;
  if (hit) {
    st.correct++;
    st.answered = true;
    show(`✓ ${targetLabel()}`, 'drill-right');
    later(ask, 1400);
  } else {
    show('✗ not that one — try again, or reveal', 'drill-wrong');
  }
  renderScore();
  return hit;
}

function start() {
  ensureCtx();
  if (onStart) onStart();
  st.on = true;
  st.correct = 0; st.attempts = 0;
  st.target = null; st.lastRoman = null; st.answered = true;
  document.body.classList.add('drilling');
  $('#drill-start').textContent = 'stop';
  show('listen — the cadence sets the key…');
  renderScore();
  playCadence(ask);
}

function stopDrill() {
  if (!st.on) return;
  st.on = false;
  clearTimers();
  document.body.classList.remove('drilling');
  $('#drill-start').textContent = 'start';
  show('');
  $('#drill-score').textContent = '';
}

function initDrill(opts) {
  getKey = opts.getKey;
  onStart = opts.onStart || null;
  $('#drill-start').addEventListener('click', () => st.on ? stopDrill() : start());
  $('#drill-replay').addEventListener('click', drillReplay);
  $('#drill-reveal').addEventListener('click', reveal);
  $('#drill-cadence').addEventListener('click', () => {
    if (!st.on) return;
    clearTimers();
    playCadence(() => { if (!st.answered) drillReplay(); else ask(); });
  });
}

const isDrillOn = () => st.on;

export { initDrill, isDrillOn, answerDrill, drillReplay, stopDrill };
