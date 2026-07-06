// dojo.js — dojo mode's drill hall, absorbed from the old standalone otodojo
// app: a shared progression-quiz engine (the "changes" tab — built-in
// collection + paste-a-tab), plus basslines, degrees, qualities and intervals
// drills, and the curriculum. Rewired onto otolab's
// theory + audio engines so the synth voices and richer chord vocabulary
// apply here too. Chips in, no keyboard required — works on a phone.

import { pcName, useFlats, midiName, chordVoicing, paletteForKey, romanFor, guessKey, guideTones, qualityIntervals } from './theory.js';
import { playChord, playNoteAt, playChordAt, allNotesOff, ensureCtx, clickAt, audioNow } from './audio.js';
import { startMic, stopMic, isMicOn } from './pitch.js';
import { onHeldChange, heldNotes } from './input.js';
import { alignSequences } from './reference.js';
import { generatePhrase, transposePhrase } from './phrases.js';
import { record, pickWeighted, stats as progressStats, reset as resetProgress } from './progress.js';
import { initCurriculum, renderPath as currRenderPath } from './curriculum.js';
import { initRepertoire, renderRepertoire } from './repertoire.js';
import { SONGS } from '../groundtruth/songs.js';
import { BASSLINES } from '../groundtruth/basslines.js';
import { SONGS as STD_CORE } from './standards-data.js';
import { SONGS_EXTRA as STD_EXTRA } from './standards-data-extra.js';

const STD_SONGS = [...STD_CORE, ...STD_EXTRA];

const $ = id => document.getElementById(id);
const rand = n => Math.floor(Math.random() * n);
const pick = arr => arr[rand(arr.length)];

// timestamp for response-time capture (monotonic clock where available)
const nowT = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
// record an attempt with response time + the actual (wrong) answer, so the
// store can build confusion pairs and time-weight the spacing. askedAt is when
// the target last sounded; guess is the chip the learner picked.
function recordTimed(cat, answer, ok, guess, askedAt) {
  const meta = {};
  if (guess != null) meta.guess = guess;
  if (askedAt) meta.ms = nowT() - askedAt;
  record(cat, answer, ok, meta);
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const panelActive = name => !!document.getElementById(`panel-${name}`)?.classList.contains('active');

// Programmatically launch a drill preconfigured — the curriculum's workout and
// path views drive the existing drills through this. `drill` is a key below;
// `config` maps raw <select>/<input> ids to the values to set before starting.
const DRILL_TABS = {
  intervals: { tab: 'intervals', start: 'int-new' },
  qualities: { tab: 'qualities', start: 'qual-new' },
  degrees:   { tab: 'degrees',   start: 'deg-new' },
  mdeg:      { tab: 'melodic',   start: 'mdeg-new' },
  sing:      { tab: 'sing',      start: 'sing-new' },
  rhythm:    { tab: 'rhythm',    start: 'rhy-new' },
  echo:      { tab: 'echo',      start: 'echo-new' },
  cadence:   { tab: 'cadence',   start: 'cad-new' },
  form:      { tab: 'form',      start: 'form-new' },
  modal:     { tab: 'modal',     start: 'modal-new' },
  tension:   { tab: 'tension',   start: 'tens-new' },
  changes:   { tab: 'changes',   start: 'changes-new' },
  bass:      { tab: 'bass',      start: 'bass-new' },
  inversion: { tab: 'inversion', start: 'inv-new' },
  voicing:   { tab: 'voicing',   start: 'vc-new' },
  time:      { tab: 'time',      start: 'time-new' },
  guide:     { tab: 'guide',     start: 'guide-new' },
};

function runAssignment(drill, config = {}) {
  if (drill === 'lab') { enterLabCb?.(); return; } // the applied step sends you to the lab
  const info = DRILL_TABS[drill];
  if (!info) return;
  enterDojoCb?.(); // a curriculum step can launch from the Home surface — switch rooms first
  const tabBtn = document.querySelector(`#dojo-tabs button[data-tab="${info.tab}"]`);
  if (tabBtn) tabBtn.click(); // switches panel + stops other audio
  // curated "apply it" assignment: load the specific tune, not a random one
  if (drill === 'changes' && config.songId) {
    if (!changesLoadById?.(config.songId)) document.getElementById('changes-new')?.click();
    document.querySelector('.dojo-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  for (const [id, val] of Object.entries(config)) {
    const e = document.getElementById(id);
    if (!e) continue;
    if (e.type === 'checkbox') e.checked = !!val;
    else e.value = val;
    e.dispatchEvent(new Event('change'));
  }
  document.getElementById(info.start)?.click();
  document.querySelector('.dojo-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Stop the sing-drill microphone and reset its button. Kept out of stopDojo()
// on purpose — that runs on every drill playback, and singing is graded while
// the synth plays the target, so the mic must survive playSequence().
function stopDojoMic() {
  if (isMicOn()) stopMic();
  const mic = document.getElementById('sing-mic');
  if (mic) { mic.textContent = 'enable mic'; mic.classList.remove('on'); }
}

let enterDojoCb = null; // set by initDojo — lets runAssignment switch into dojo mode
let enterLabCb = null;  // set by initDojo — the applied step launches the lab
let changesLoadById = null; // set by initDojo — load a specific tune into the changes quiz

let onStartCb = null;

// ---- chord & key parsing (tab-site tolerant — looser than reference.js) ----

const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

const QUALITY_ALIASES = {
  '': '', 'maj': '', 'major': '',
  'm': 'm', 'min': 'm', 'minor': 'm', '-': 'm',
  'maj7': 'maj7', 'ma7': 'maj7', 'M7': 'maj7', 'Δ': 'maj7', 'Δ7': 'maj7',
  'm7': 'm7', 'min7': 'm7', '-7': 'm7',
  '7': '7', 'dom7': '7',
  'm7b5': 'm7b5', 'min7b5': 'm7b5', 'ø': 'm7b5', 'ø7': 'm7b5', '-7b5': 'm7b5',
  'dim': 'dim', '°': 'dim', 'o': 'dim',
  'dim7': 'dim7', '°7': 'dim7', 'o7': 'dim7',
  'aug': 'aug', '+': 'aug', '+5': 'aug',
  'sus': 'sus4', 'sus4': 'sus4', 'sus2': 'sus2',
  '7sus4': '7sus4', '7sus': '7sus4', '9sus4': '7sus4',
  '6': '6', 'maj6': '6', 'M6': '6',
  'm6': 'm6', 'min6': 'm6', '-6': 'm6',
  '6/9': '6/9', '69': '6/9', '6add9': '6/9',
  '9': '9', 'maj9': 'maj9', 'M9': 'maj9', 'm9': 'm9', 'min9': 'm9', '-9': 'm9',
  'add9': 'add9', 'add2': 'add9', 'madd9': 'madd9',
  'm11': 'm11', 'min11': 'm11', '11': 'm11',
  '13': '13', '7b9': '7b9', '7#9': '7#9', '7#11': '7#11',
  '7#5': '7#5', '7+5': '7#5', '7b5': '7b5', 'maj7#11': 'maj7#11', 'maj7#5': 'maj7#5',
  'mMaj7': 'mMaj7', 'mM7': 'mMaj7', 'minMaj7': 'mMaj7', 'mmaj7': 'mMaj7',
};

// 'F#m7(b5)/C#' → { root, quality } pcs, or null if it isn't a chord symbol.
function parseChord(symbol) {
  if (!symbol) return null;
  let s = symbol.trim().replace(/\(([^)]*)\)/g, '$1'); // m7(b5) → m7b5
  const slash = s.match(/^(.+)\/([A-G][#b]?)$/);
  if (slash && !s.endsWith('6/9')) s = slash[1]; // drop the slash bass
  const m = s.match(/^([A-G])([#b]?)(.*)$/);
  if (!m) return null;
  const root = (LETTER_PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  const q = m[3].trim();
  let quality = QUALITY_ALIASES[q];
  if (quality === undefined) {
    if (/^m(?![a-z])/.test(q)) quality = /7/.test(q) ? 'm7' : 'm';
    else if (/13/.test(q)) quality = '13';
    else if (/9/.test(q)) quality = '9';
    else if (/7/.test(q)) quality = '7';
    else if (/6/.test(q)) quality = '6';
    else return null; // a lyric word that starts with A–G
  }
  return { root, quality };
}

// 'Em' / 'Bb' / 'F#m' → { tonic, mode }
function parseKey(str) {
  const m = str.trim().match(/^([A-G])([#b]?)(m|min|minor)?$/i);
  if (!m) return null;
  const tonic = (LETTER_PC[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  return { tonic, mode: m[3] ? 'minor' : 'major' };
}

function keyName(key) {
  return `${pcName(key.tonic, useFlats(key.tonic, key.mode))} ${key.mode}`;
}

const diatonicSevenths = key => paletteForKey(key).diatonic.map(d =>
  ({ ...d, deg: ((d.root - key.tonic) + 12) % 12 }));

const DEGREE_TO_PC = { '1': 0, 'b2': 1, '2': 2, 'b3': 3, '3': 4, '4': 5, 'b5': 6, '#4': 6,
                       '5': 7, 'b6': 8, '6': 9, 'b7': 10, '7': 11 };
const DEGREE_CHIPS = ['1', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7'];

const INTERVALS = [
  { name: 'm2', semis: 1 },  { name: 'M2', semis: 2 },
  { name: 'm3', semis: 3 },  { name: 'M3', semis: 4 },
  { name: 'P4', semis: 5 },  { name: 'TT', semis: 6 },
  { name: 'P5', semis: 7 },  { name: 'm6', semis: 8 },
  { name: 'M6', semis: 9 },  { name: 'm7', semis: 10 },
  { name: 'M7', semis: 11 }, { name: 'P8', semis: 12 },
];

// comp voicing without the doubled low root — the bass line covers it
const compNotes = (root, quality) => chordVoicing(root, quality).slice(1);

// Cadence vocabulary for the cadence-ID drill. `degs` are [semitonesAboveTonic,
// quality] played after a tonic reference; `mode` sets the key colour.
const CADENCES = [
  { id: 'ii-V-I',      label: 'ii–V–I',            mode: 'major', degs: [[2, 'm7'], [7, '7'], [0, 'maj7']] },
  { id: 'backdoor',    label: 'backdoor bVII7→I',  mode: 'major', degs: [[5, 'm7'], [10, '7'], [0, 'maj7']] },
  { id: 'tritone-sub', label: 'tritone sub subV→I', mode: 'major', degs: [[2, 'm7'], [1, '7'], [0, 'maj7']] },
  { id: 'deceptive',   label: 'deceptive V→vi',    mode: 'major', degs: [[7, '7'], [9, 'm7']] },
  { id: 'plagal',      label: 'plagal IV→I',       mode: 'major', degs: [[5, 'maj7'], [0, 'maj7']] },
  { id: 'minor-ii-V',  label: 'minor ii–V–i',      mode: 'minor', degs: [[2, 'm7b5'], [7, '7b9'], [0, 'm7']] },
];

// Classify a standards-library song's form from its section names + bar count.
// Returns one of the FORM_CHIPS strings, or null when it can't be named cleanly.
const FORM_CHIPS = ['AABA', 'ABAC', 'AB', '12-bar blues', '16-bar'];
function songForm(song) {
  const joined = song.sections.map(s => s.name).join('');
  const bars = song.sections.reduce((a, s) => a + s.bars.length, 0);
  if (joined === 'AABA') return 'AABA';
  if (joined === 'ABAC') return 'ABAC';
  if (song.sections.length === 1 && bars === 12) return '12-bar blues';
  if (song.sections.length === 1 && bars === 16) return '16-bar';
  if (joined === 'AB') return 'AB';
  return null;
}

// ---- playback scheduler ----
// events: [{ notes?, bass?, beats, slot? }] — slot indexes light up while playing.
let seqTimer = null;
let seqActive = false;

function playSequence(events, bpm, { onStep, onDone } = {}) {
  stopDojo();
  ensureCtx();
  if (onStartCb) onStartCb();
  seqActive = true;
  let i = 0;
  const step = () => {
    if (!seqActive) return;
    if (i >= events.length) {
      seqActive = false;
      if (onDone) onDone();
      return;
    }
    const e = events[i];
    const secs = e.beats * 60 / bpm;
    if (e.notes && e.notes.length) playChord(e.notes, Math.min(secs * 0.92, 3.2), 0.5);
    if (e.bass != null) playChord([e.bass], Math.min(secs * 0.95, 3.5), 0.85);
    if (onStep) onStep(e, i);
    seqTimer = setTimeout(() => { i++; step(); }, secs * 1000);
  };
  step();
}

function stopDojo() {
  seqActive = false;
  clearTimeout(seqTimer);
  clearTimeout(phraseTimer);
  allNotesOff();
}

// ---- phrase playback + echo capture (echo tab + lick bank) ----
// Scheduled on the audio clock so melody and comp can sound together. Notes are
// fire-and-forget (they schedule their own release), so stopDojo can't cut a
// phrase mid-flight — fine, phrases are only a few bars.
let phraseTimer = null;

function playPhrase(phrase, bpm = 104, { comp = true, onDone } = {}) {
  stopDojo(); ensureCtx();
  if (onStartCb) onStartCb();
  const spb = 60 / bpm;
  const t0 = audioNow() + 0.28;
  let beat = 0;
  if (comp) {
    for (const c of phrase.chords) {
      playChordAt(compNotes(c.root, c.quality), t0 + beat * spb, c.beats * spb * 0.92, 0.22);
      playNoteAt(nearestBass(c.root, null), t0 + beat * spb, c.beats * spb * 0.9, 0.4);
      beat += c.beats;
    }
  }
  let end = 0;
  for (const n of phrase.melody) {
    playNoteAt(n.midi, t0 + n.beat * spb, n.dur * spb * 0.9, 0.85);
    end = Math.max(end, n.beat + n.dur);
  }
  const ms = (t0 - audioNow() + end * spb) * 1000 + 180;
  if (onDone) phraseTimer = setTimeout(onDone, ms);
}

// One shared "active phrase" that recording + grading act on, so the echo tab
// and the lick-bank transpose drill reuse the same capture engine.
const echoState = {
  phrase: null, mode: 'echo', cat: 'echo', item: null,
  recording: false, recorded: [], prevHeld: new Set(), onGraded: null,
};
const melScore = (a, b) => a === b ? 1 : (((a - b) % 12 + 12) % 12 === 0 ? 0.75 : 0);

onHeldChange(notes => {
  if (!echoState.recording) { echoState.prevHeld = new Set(notes); return; }
  const cur = new Set(notes);
  for (const n of cur) if (!echoState.prevHeld.has(n)) echoState.recorded.push(n);
  echoState.prevHeld = cur;
  const el = document.getElementById('echo-status');
  if (el) el.textContent = `recording — ${echoState.recorded.length} note${echoState.recorded.length === 1 ? '' : 's'}`;
});

function echoArm() {
  echoState.recorded = [];
  echoState.recording = true;
}

function echoGrade(resultEl, scoreObj, revealNames = true) {
  echoState.recording = false;
  const ph = echoState.phrase;
  if (!ph) return null;
  if (!echoState.recorded.length) {
    resultEl.innerHTML = '<div class="grade-score">play your echo first — hit ● then reproduce the line.</div>';
    return null;
  }
  const ref = ph.melody.map(n => n.midi);
  const g = alignSequences(echoState.recorded, ref, melScore);
  const ok = g.pct >= 70;
  if (scoreObj) scoreObj.add(ok ? 1 : 0);
  record(echoState.cat, echoState.item || ph.type, ok);
  const flats = useFlats(ph.key.tonic, ph.key.mode);
  const verdict = g.pct >= 90 ? 'nailed it' : g.pct >= 70 ? 'close' : g.pct >= 40 ? 'getting there' : 'keep at it';
  resultEl.innerHTML = `<div class="grade-score"><b>${g.pct}%</b> — ${verdict}
    <span class="grade-legend">exact pitch 1 · right note wrong octave ¾</span></div>`;
  const row = el('div', 'grade-row');
  for (const p of g.pairs) {
    const d = el('div', 'grade-pair ' + (p.score >= 0.75 ? 'good' : 'bad'));
    const refLbl = p.ref != null ? (revealNames ? midiName(p.ref, flats) : '♪') : '·';
    const usrLbl = p.user != null ? midiName(p.user, flats) : 'missed';
    d.innerHTML = `<div class="g-ref">${esc(refLbl)}</div>
                   <div class="g-usr">${esc(p.ref != null ? usrLbl : usrLbl + ' (extra)')}</div>`;
    row.appendChild(d);
  }
  resultEl.appendChild(row);
  if (echoState.onGraded) echoState.onGraded(ok, g);
  return { ok, g };
}

// ---- lick bank storage ----
const LICKS_KEY = 'otolab:v1:licks';
function loadLicks() { try { return JSON.parse(localStorage.getItem(LICKS_KEY)) || []; } catch (e) { return []; } }
function saveLicks(arr) { localStorage.setItem(LICKS_KEY, JSON.stringify(arr)); }
function addLick(phrase, name) {
  const licks = loadLicks();
  const id = 'lk' + Date.now().toString(36) + rand(9999).toString(36);
  licks.unshift({ id, name: name || phrase.label, type: phrase.type,
                  key: phrase.key, chords: phrase.chords, melody: phrase.melody, tags: [] });
  saveLicks(licks);
  return id;
}

// Keep bass lines singable: move each bass note to the nearest pitch from the
// previous one instead of folding everything into one octave.
function nearestBass(pc, prev) {
  if (prev == null) return 38 + (((pc - 38) % 12) + 12) % 12; // D2..C#3
  let d = (((pc - prev) % 12) + 12) % 12;
  if (d > 6) d -= 12;
  let p = prev + d;
  while (p < 31) p += 12;
  while (p > 55) p -= 12;
  return p;
}

// I–IV–V–I (or i–iv–V–i) cadence events to establish a key.
function cadenceEvents(key) {
  const t = key.tonic;
  const degs = key.mode === 'minor'
    ? [[0, 'm'], [5, 'm'], [7, ''], [0, 'm']]
    : [[0, ''], [5, ''], [7, ''], [0, '']];
  let prev = null;
  return degs.map(([d, q], i) => {
    const root = (t + d) % 12;
    prev = nearestBass(root, prev);
    return { notes: compNotes(root, q), bass: prev, beats: i === 3 ? 2 : 1 };
  });
}

// ---- session scores ----
function makeScore(elId, label = 'this session') {
  let right = 0, total = 0;
  return {
    add(r, t = 1) { right += r; total += t; this.paint(); },
    paint() {
      $(elId).textContent = total ? `${label}: ${right}/${total}` : '';
    },
  };
}

// =====================================================================
// Progression quiz engine — drives the "changes" tab (built-in + paste).
// =====================================================================
function makeQuiz(prefix, scoreLabel) {
  const ids = k => $(`${prefix}-${k}`);
  const score = makeScore(`${prefix}-score`, scoreLabel);
  const state = {
    song: null,      // { title, artist, key, events, note }
    guesses: [],
    done: false,
  };

  function setSong(song) {
    stopDojo();
    state.song = song;
    state.guesses = [];
    state.done = false;
    ids('result').textContent = '';
    paintMeta();
    paintSlots();
    paintChips();
  }

  function paintMeta() {
    const s = state.song;
    if (!s) { ids('meta').textContent = ''; return; }
    const showKey = ids('showkey').checked;
    const bits = [`${s.events.length} chords`];
    if (s.genre) bits.push(s.genre);
    bits.push(showKey ? `key: ${keyName(s.key)}` : 'key: ? (use “hear the key”)');
    ids('meta').textContent = bits.join(' · ');
  }

  function paintSlots(highlight = -1) {
    const box = ids('slots');
    box.innerHTML = '';
    if (!state.song) return;
    state.song.events.forEach((e, i) => {
      const slot = el('div', 'slot');
      if (i === highlight) slot.classList.add('now');
      const top = el('div', 'top', state.done ? e.roman
        : (state.guesses[i] != null ? state.guesses[i] : '?'));
      slot.appendChild(top);
      if (state.done) {
        slot.classList.add(state.graded && !state.graded[i] ? 'bad' : 'good');
        if (state.graded && !state.graded[i] && state.guesses[i] != null) {
          slot.appendChild(el('div', 'sub strike', state.guesses[i]));
        }
        slot.appendChild(el('div', 'sub', e.symbol));
      } else if (state.guesses[i] != null) {
        slot.classList.add('filled');
      }
      slot.onclick = () => {
        if (!state.done) { state.guesses = state.guesses.slice(0, i); paintSlots(); }
      };
      box.appendChild(slot);
    });
  }

  function paintChips() {
    const box = ids('chips');
    box.innerHTML = '';
    if (!state.song) return;
    for (const roman of state.song.chips) {
      const chip = el('button', 'chip', roman);
      chip.onclick = () => {
        if (state.done || !state.song) return;
        if (state.guesses.length < state.song.events.length) {
          state.guesses.push(roman);
          paintSlots();
        }
      };
      box.appendChild(chip);
    }
  }

  function finish(graded) {
    state.done = true;
    state.graded = graded;
    paintSlots();
    const s = state.song;
    const parts = [];
    if (s.title) parts.push(`that was “${s.title}” — ${s.artist}`);
    if (s.note) parts.push(s.note);
    ids('result').innerHTML = '';
    for (const p of parts) ids('result').appendChild(el('div', null, p));
  }

  ids('play').onclick = () => {
    const s = state.song;
    if (!s) return;
    const bpm = s.tempo * parseFloat(ids('speed').value);
    let prev = null;
    const evs = s.events.map((e, i) => {
      prev = nearestBass(e.root, prev);
      return { notes: compNotes(e.root, e.quality), bass: prev, beats: e.beats, slot: i };
    });
    playSequence(evs, bpm, {
      onStep: e => paintSlots(e.slot),
      onDone: () => paintSlots(),
    });
  };
  ids('stop').onclick = () => { stopDojo(); paintSlots(); };
  ids('cadence').onclick = () => {
    if (state.song) playSequence(cadenceEvents(state.song.key), 100);
  };
  ids('showkey').onchange = paintMeta;
  ids('undo').onclick = () => { if (!state.done) { state.guesses.pop(); paintSlots(); } };
  ids('clear').onclick = () => { if (!state.done) { state.guesses = []; paintSlots(); } };
  ids('check').onclick = () => {
    const s = state.song;
    if (!s || state.done) return;
    if (state.guesses.length < s.events.length) {
      ids('result').textContent =
        `fill all ${s.events.length} slots first (${state.guesses.length} so far) — or hit reveal`;
      return;
    }
    const graded = s.events.map((e, i) => state.guesses[i] === e.roman);
    const right = graded.filter(Boolean).length;
    score.add(right, graded.length);
    // naming a real progression by ear is applied transcription — log it to the
    // shared store under the same 'transcribe' cat as the lab & standards quizzes
    s.events.forEach((e, i) => record('transcribe', `transcribe:${e.roman}`, graded[i]));
    finish(graded);
  };
  ids('reveal').onclick = () => {
    if (!state.song || state.done) return;
    score.add(0, state.song.events.length);
    state.song.events.forEach(e => record('transcribe', `transcribe:${e.roman}`, false)); // gave up = missed
    finish(null);
  };

  return { setSong };
}

// Build quiz events (+ answer chips) from parsed bars in a given key.
function buildQuizSong(meta, bars, key) {
  const events = [];
  for (const bar of bars) {
    const beats = 4 / bar.length;
    for (const sym of bar) {
      const c = typeof sym === 'string' ? parseChord(sym) : sym;
      if (!c) continue;
      const flats = useFlats(key.tonic, key.mode);
      const symbol = typeof sym === 'string' ? sym : pcName(c.root, flats) + c.quality;
      const last = events[events.length - 1];
      if (last && last.symbol === symbol) { last.beats += beats; continue; }
      const deg = ((c.root - key.tonic) + 12) % 12;
      events.push({ symbol, root: c.root, quality: c.quality, beats,
                    roman: romanFor(deg, c.quality, key.mode) });
    }
  }
  // Answer chips: every roman in the song + diatonic decoys in matching style.
  const used = [...new Set(events.map(e => e.roman))];
  const seventhStyle = events.some(e => /7|9|13/.test(e.quality));
  const simplify = q => seventhStyle ? q
    : ({ 'maj7': '', 'm7': 'm', '7': '', 'm7b5': 'dim' }[q] ?? q);
  const decoys = diatonicSevenths(key)
    .map(d => romanFor(d.deg, simplify(d.quality), key.mode))
    .filter(r => !used.includes(r));
  const chips = shuffle([...used, ...shuffle(decoys).slice(0, Math.max(0, 12 - used.length))]);
  return { ...meta, key, events, chips };
}

// =====================================================================
// initDojo — wire every panel. Call once at startup.
// =====================================================================
function initDojo(opts = {}) {
  onStartCb = opts.onStart || null;
  enterDojoCb = opts.enterDojo || null;
  enterLabCb = opts.enterLab || null;

  // ---- curriculum: the "today" workout (on Home) + "path" syllabus tab ----
  initCurriculum({
    runAssignment,
    // "today" lives on the Home surface now, so it's visible when in home mode;
    // path is a dojo tab.
    isActive: tab => tab === 'today' ? document.body.dataset.mode === 'home' : panelActive(tab),
  });

  // ---- repertoire: the tune-study track (drives standards + voicing) ----
  initRepertoire({ tuneById: id => STD_SONGS.find(s => s.id === id) });

  // ---- changes: the unified progression quiz (built-in collection + paste) ----
  const changesQuiz = makeQuiz('changes', 'session');
  let lastSongId = null;

  const setChangesSource = src => {
    document.getElementById('panel-changes').dataset.source = src;
    $('changes-src-library').classList.toggle('on', src === 'library');
    $('changes-src-paste').classList.toggle('on', src === 'paste');
  };
  $('changes-src-library').onclick = () => setChangesSource('library');
  $('changes-src-paste').onclick = () => setChangesSource('paste');

  const loadLibrarySong = s => {
    setChangesSource('library');
    lastSongId = s.id;
    const key = parseKey(s.key);
    changesQuiz.setSong(buildQuizSong(
      { title: s.title, artist: s.artist, genre: s.genre, tempo: s.tempo, note: s.note },
      s.bars, key));
  };
  // exposed to runAssignment so a curriculum "apply it" step can load its
  // curated tune; returns false if the id isn't in the collection.
  changesLoadById = id => {
    const s = SONGS.find(x => x.id === id);
    if (!s) return false;
    loadLibrarySong(s);
    return true;
  };

  $('changes-new').onclick = () => {
    const genre = $('changes-genre').value;
    const diff = $('changes-diff').value;
    let pool = SONGS.filter(s =>
      (genre === 'all' || s.genre === genre) &&
      (diff === 'all' || s.difficulty === Number(diff)));
    if (!pool.length) pool = SONGS;
    if (pool.length > 1) pool = pool.filter(s => s.id !== lastSongId);
    loadLibrarySong(pick(pool));
  };

  $('changes-make').onclick = () => {
    setChangesSource('paste');
    const text = $('changes-input').value;
    const bars = [];
    const hasBarlines = text.includes('|');
    for (const rawLine of text.split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;
      const groups = hasBarlines ? line.split('|') : line.split(/\s+/).map(t => t);
      for (const g of groups) {
        const toks = String(g).trim().split(/\s+/).filter(Boolean);
        if (!toks.length) continue;
        const chords = toks.filter(t => parseChord(t));
        if (!chords.length) continue;          // a lyrics line / section header
        if (chords.length < toks.length && chords.length <= toks.length / 2) continue;
        bars.push(chords.slice(0, 4));
      }
    }
    const parsed = bars.flat().map(parseChord);
    if (parsed.length < 2) {
      $('changes-status').textContent = 'no chords found — paste a chord line like  | Dm7 | G7 | Cmaj7 |';
      return;
    }
    const key = guessKey(parsed);
    $('changes-status').textContent =
      `${parsed.length} chords parsed · guessed key: ${keyName(key)}`;
    changesQuiz.setSong(buildQuizSong({ tempo: 96 }, bars, key));
  };

  // ---- bassline drill ----
  const bassScore = makeScore('bass-score');
  const bassState = { line: null, key: null, guesses: [], done: false };

  function bassPaintSlots(highlight = -1) {
    const box = $('bass-slots');
    box.innerHTML = '';
    if (!bassState.line) return;
    bassState.line.degrees.forEach((d, i) => {
      const slot = el('div', 'slot');
      if (i === highlight) slot.classList.add('now');
      slot.appendChild(el('div', 'top', bassState.done ? d
        : (bassState.guesses[i] != null ? bassState.guesses[i] : '?')));
      if (bassState.done) {
        const ok = !bassState.graded || bassState.graded[i];
        slot.classList.add(ok ? 'good' : 'bad');
        if (!ok && bassState.guesses[i] != null) {
          slot.appendChild(el('div', 'sub strike', bassState.guesses[i]));
        }
      } else if (bassState.guesses[i] != null) slot.classList.add('filled');
      slot.onclick = () => {
        if (!bassState.done) { bassState.guesses = bassState.guesses.slice(0, i); bassPaintSlots(); }
      };
      box.appendChild(slot);
    });
  }

  function bassPlay() {
    const { line, key } = bassState;
    if (!line) return;
    let prev = null;
    const noteEvents = line.degrees.map((d, i) => {
      const pc = (key.tonic + DEGREE_TO_PC[d]) % 12;
      prev = nearestBass(pc, prev);
      return { bass: prev, beats: 1, slot: i };
    });
    const evs = [...cadenceEvents(key), { beats: 1.5 }, ...noteEvents];
    playSequence(evs, line.tempo, {
      onStep: e => bassPaintSlots(e.slot != null ? e.slot : -1),
      onDone: () => bassPaintSlots(),
    });
  }

  function bassFinish(graded) {
    bassState.done = true;
    bassState.graded = graded;
    bassPaintSlots();
    const l = bassState.line;
    $('bass-result').textContent = `that was ${l.name} — ${l.hint}`;
  }

  $('bass-new').onclick = () => {
    const line = pick(BASSLINES.filter(l => l !== bassState.line));
    bassState.line = line;
    bassState.key = { tonic: rand(12), mode: line.mode };
    bassState.guesses = [];
    bassState.done = false;
    $('bass-result').textContent = '';
    $('bass-meta').textContent =
      `${line.degrees.length} notes · ${keyName(bassState.key)} (cadence first, then the line)`;
    bassPaintSlots();
    const box = $('bass-chips');
    box.innerHTML = '';
    for (const d of DEGREE_CHIPS) {
      const chip = el('button', 'chip', d);
      chip.onclick = () => {
        if (bassState.done) return;
        if (bassState.guesses.length < line.degrees.length) {
          bassState.guesses.push(d);
          bassPaintSlots();
        }
      };
      box.appendChild(chip);
    }
    bassPlay();
  };
  $('bass-replay').onclick = bassPlay;
  $('bass-stop').onclick = () => { stopDojo(); bassPaintSlots(); };
  $('bass-undo').onclick = () => { if (!bassState.done) { bassState.guesses.pop(); bassPaintSlots(); } };
  $('bass-clear').onclick = () => { if (!bassState.done) { bassState.guesses = []; bassPaintSlots(); } };
  $('bass-check').onclick = () => {
    const l = bassState.line;
    if (!l || bassState.done) return;
    if (bassState.guesses.length < l.degrees.length) {
      $('bass-result').textContent =
        `fill all ${l.degrees.length} slots first (${bassState.guesses.length} so far)`;
      return;
    }
    const graded = l.degrees.map((d, i) =>
      bassState.guesses[i] === d ||
      (d === 'b5' && bassState.guesses[i] === '#4') || (d === '#4' && bassState.guesses[i] === 'b5'));
    bassScore.add(graded.filter(Boolean).length, graded.length);
    // grade to the shared store so basslines feed mastery/SRS like every other
    // drill (namespaced 'bass:' — bare degrees would collide with scale-degrees)
    graded.forEach((g, i) => record('bass', `bass:${l.degrees[i]}`, g,
      { guess: bassState.guesses[i] ? `bass:${bassState.guesses[i]}` : null }));
    bassFinish(graded);
  };
  $('bass-reveal').onclick = () => {
    if (!bassState.line || bassState.done) return;
    bassScore.add(0, bassState.line.degrees.length);
    bassState.line.degrees.forEach(d => record('bass', `bass:${d}`, false)); // gave up = missed
    bassFinish(null);
  };

  // ---- degrees drill (random keys, chip answers — the single-chord drill
  //      the "changes" quiz builds on) ----
  const degScore = makeScore('deg-score');
  const degState = { key: null, chord: null, answered: false };

  function degPlayCadence() { if (degState.key) playSequence(cadenceEvents(degState.key), 100); }
  function degPlayChord() {
    const c = degState.chord;
    if (!c) return;
    degState.askedAt = nowT();
    playSequence([{ notes: compNotes(c.root, c.quality), bass: nearestBass(c.root, null), beats: 3 }], 90);
  }

  $('deg-new').onclick = () => {
    const modeSel = $('deg-mode').value;
    const mode = modeSel === 'both' ? pick(['major', 'minor']) : modeSel;
    degState.key = { tonic: rand(12), mode };
    const palette = diatonicSevenths(degState.key);
    const wroman = pickWeighted('degrees', palette.map(p => p.roman));
    degState.chord = palette.find(p => p.roman === wroman) || pick(palette);
    degState.answered = false;
    $('deg-meta').textContent = `key: ${keyName(degState.key)} — cadence, then the mystery chord`;
    $('deg-result').textContent = '';
    const box = $('deg-answers');
    box.innerHTML = '';
    for (const p of palette) {
      const chip = el('button', 'chip', p.roman);
      chip.onclick = () => {
        if (degState.answered) return;
        degState.answered = true;
        const ok = p.roman === degState.chord.roman;
        degScore.add(ok ? 1 : 0);
        recordTimed('degrees', degState.chord.roman, ok, p.roman, degState.askedAt);
        chip.classList.add(ok ? 'good' : 'bad');
        const flats = useFlats(degState.key.tonic, degState.key.mode);
        $('deg-result').textContent = (ok ? '✓ ' : '✗ that was ') +
          `${degState.chord.roman} (${pcName(degState.chord.root, flats)}${degState.chord.quality})`;
        setTimeout(() => $('deg-new').click(), 1400);
      };
      box.appendChild(chip);
    }
    playSequence([...cadenceEvents(degState.key), { beats: 1.5 }], 100, { onDone: degPlayChord });
  };
  $('deg-cadence').onclick = degPlayCadence;
  $('deg-chord').onclick = degPlayChord;

  // ---- qualities drill ----
  const QUAL_LEVELS = {
    triads:   ['', 'm', 'dim', 'aug', 'sus4', 'sus2'],
    sevenths: ['maj7', '7', 'm7', 'm7b5', 'dim7', '6', 'm6', 'mMaj7'],
    colors:   ['9', 'maj9', 'm9', 'add9', '6/9', '7b9', '7#9', '13', '7#11'],
  };
  const qualLabel = q => q === '' ? 'maj' : q;
  const qualScore = makeScore('qual-score');
  const qualState = { quality: null, root: null, answered: true };

  function qualPlay() {
    if (qualState.quality == null) return;
    qualState.askedAt = nowT();
    playSequence([{ notes: compNotes(qualState.root, qualState.quality),
                    bass: nearestBass(qualState.root, null), beats: 3 }], 80);
  }

  function qualBuildAnswers() {
    const box = $('qual-answers');
    box.innerHTML = '';
    for (const q of QUAL_LEVELS[$('qual-level').value]) {
      const chip = el('button', 'chip', qualLabel(q));
      chip.onclick = () => {
        if (qualState.answered) return;
        qualState.answered = true;
        const ok = q === qualState.quality;
        qualScore.add(ok ? 1 : 0);
        recordTimed('qualities', qualState.quality || 'maj', ok, q || 'maj', qualState.askedAt);
        chip.classList.add(ok ? 'good' : 'bad');
        $('qual-result').textContent = ok
          ? `✓ ${qualLabel(q)}`
          : `✗ that was ${qualLabel(qualState.quality)}`;
        setTimeout(() => $('qual-new').click(), 1200);
      };
      box.appendChild(chip);
    }
  }

  $('qual-new').onclick = () => {
    // '' (major triad) is tracked as 'maj' in progress; recover it after the pick
    const level = QUAL_LEVELS[$('qual-level').value];
    const wq = pickWeighted('qualities', level.map(q => q || 'maj'));
    qualState.quality = wq === 'maj' ? '' : wq;
    qualState.root = rand(12);
    qualState.answered = false;
    $('qual-result').textContent = '';
    qualBuildAnswers();
    qualPlay();
  };
  $('qual-replay').onclick = qualPlay;
  $('qual-level').onchange = qualBuildAnswers;

  // ---- intervals drill ----
  const intScore = makeScore('int-score');
  const intState = { iv: null, low: null, harmonic: false, up: true, answered: true };

  function intPlay() {
    if (!intState.iv) return;
    intState.askedAt = nowT();
    const a = intState.low, b = intState.low + intState.iv.semis;
    const seq = intState.harmonic
      ? [{ notes: [a, b], beats: 2.5 }]
      : intState.up ? [{ notes: [a], beats: 1 }, { notes: [b], beats: 2 }]
                    : [{ notes: [b], beats: 1 }, { notes: [a], beats: 2 }];
    playSequence(seq, 84);
    // an optional tonic drone under the interval puts it in a tonal context —
    // hearing "P5 above the key note" is a different skill than a bare interval
    if ($('int-drone').checked) playChord([a - 12], 3.0, 0.26);
  }

  function intBuildAnswers() {
    const box = $('int-answers');
    box.innerHTML = '';
    for (const iv of INTERVALS) {
      const chip = el('button', 'chip', iv.name);
      chip.onclick = () => {
        if (intState.answered) return;
        intState.answered = true;
        const ok = iv.name === intState.iv.name;
        intScore.add(ok ? 1 : 0);
        recordTimed('intervals', intState.iv.name, ok, iv.name, intState.askedAt);
        chip.classList.add(ok ? 'good' : 'bad');
        $('int-result').textContent = ok ? `✓ ${iv.name}` : `✗ that was ${intState.iv.name}`;
        setTimeout(() => $('int-new').click(), 1100);
      };
      box.appendChild(chip);
    }
  }

  $('int-new').onclick = () => {
    const type = $('int-type').value;
    const wname = pickWeighted('intervals', INTERVALS.map(i => i.name));
    intState.iv = INTERVALS.find(i => i.name === wname) || pick(INTERVALS);
    intState.low = 48 + rand(20);
    intState.harmonic = type === 'harmonic' || (type === 'mixed' && Math.random() < 0.5);
    intState.up = type === 'melodic-asc' ? true
      : type === 'melodic-desc' ? false
      : Math.random() < 0.5;
    intState.answered = false;
    $('int-result').textContent = '';
    intBuildAnswers();
    intPlay();
  };
  $('int-replay').onclick = intPlay;

  // ---- melodic scale-degree drill (single notes, not chords) ----
  const MDEG_MAJOR = ['1', '2', '3', '4', '5', '6', '7'];
  const MDEG_MINOR = ['1', '2', 'b3', '4', '5', 'b6', 'b7'];
  const mdegScore = makeScore('mdeg-score');
  const mdegState = { key: null, deg: null, last: null, answered: true };

  const mdegDegrees = (mode, level) =>
    level === 'chromatic' ? DEGREE_CHIPS : (mode === 'minor' ? MDEG_MINOR : MDEG_MAJOR);
  const mdegNoteMidi = () =>
    60 + mdegState.key.tonic + DEGREE_TO_PC[mdegState.deg];

  function mdegPlay(withCadence) {
    const { key } = mdegState;
    mdegState.askedAt = nowT();
    const tonicMidi = 60 + key.tonic;
    const noteEv = [{ notes: [tonicMidi], beats: 1 }, { beats: 0.35 }, { notes: [mdegNoteMidi()], beats: 2 }];
    if (withCadence) playSequence([...cadenceEvents(key), { beats: 1 }, ...noteEv], 100);
    else playSequence(noteEv, 96);
  }

  $('mdeg-new').onclick = () => {
    const modeSel = $('mdeg-mode').value;
    const mode = modeSel === 'both' ? pick(['major', 'minor']) : modeSel;
    mdegState.key = { tonic: rand(12), mode };
    const degs = mdegDegrees(mode, $('mdeg-level').value);
    const focus = $('mdeg-focus').checked;
    let deg = pickWeighted('mdeg', degs, focus);
    if (deg === mdegState.last && degs.length > 1) deg = pickWeighted('mdeg', degs, focus);
    mdegState.deg = deg; mdegState.last = deg; mdegState.answered = false;
    $('mdeg-meta').textContent = `key: ${keyName(mdegState.key)} — cadence, tonic, then the note`;
    $('mdeg-result').textContent = '';
    const box = $('mdeg-answers');
    box.innerHTML = '';
    for (const d of degs) {
      const chip = el('button', 'chip', d);
      chip.onclick = () => {
        if (mdegState.answered) return;
        mdegState.answered = true;
        const ok = d === mdegState.deg;
        mdegScore.add(ok ? 1 : 0);
        recordTimed('mdeg', mdegState.deg, ok, d, mdegState.askedAt);
        chip.classList.add(ok ? 'good' : 'bad');
        $('mdeg-result').textContent = ok ? `✓ ${mdegState.deg}` : `✗ that was ${mdegState.deg}`;
        setTimeout(() => { if (panelActive('melodic')) $('mdeg-new').click(); }, 1300);
      };
      box.appendChild(chip);
    }
    mdegPlay(true);
  };
  $('mdeg-cadence').onclick = () => { if (mdegState.key) playSequence(cadenceEvents(mdegState.key), 100); };
  $('mdeg-note').onclick = () => { if (mdegState.deg != null) mdegPlay(false); };

  // ---- sing-back drill (mic; audiation) ----
  const singScore = makeScore('sing-score');
  const singState = { mode: 'match', key: null, chord: null, targetPc: null, targetMidi: null,
                      item: 'match', answered: true, holdRun: 0,
                      sequence: null, seqIdx: 0 };
  const noteNameOf = midi => midiName(midi, false);

  // chord-tone interval (semitones above root) for the root/3rd/5th/7th
  function chordToneInterval(quality, tone) {
    const ivs = qualityIntervals(quality);
    if (tone === 'R') return 0;
    if (tone === '3') return ivs.find(i => i === 3 || i === 4 || i === 5 || i === 2) ?? 4;
    if (tone === '5') return ivs.find(i => i === 7 || i === 6 || i === 8) ?? 7;
    if (tone === '7') return ivs.find(i => i === 10 || i === 11 || i === 9) ?? 10;
    return 0;
  }
  const toneName = t => t === 'R' ? 'root' : t === '3' ? '3rd' : t === '5' ? '5th' : '7th';

  // the guide-tone line over a ii–V–i in a key: one 3rd-or-7th per chord, each
  // chosen nearest the previous so the line is smooth and singable.
  function guideToneLine(key) {
    const chords = key.mode === 'minor'
      ? [{ root: (key.tonic + 2) % 12, q: 'm7b5' }, { root: (key.tonic + 7) % 12, q: '7' }, { root: key.tonic, q: 'm7' }]
      : [{ root: (key.tonic + 2) % 12, q: 'm7' }, { root: (key.tonic + 7) % 12, q: '7' }, { root: key.tonic, q: 'maj7' }];
    let prev = 64; const targets = [];
    for (const c of chords) {
      let best = null;
      for (const gt of guideTones(c.root, c.q)) {
        let m = prev + ((((gt.pc - prev) % 12) + 12) % 12);
        if (m - prev > 6) m -= 12;
        if (best == null || Math.abs(m - prev) < Math.abs(best - prev)) best = m;
      }
      if (best == null) best = prev;
      targets.push(best); prev = best;
    }
    return { chords, targets };
  }

  function singNeedle(cents, inTune) {
    const n = $('sing-needle');
    if (!n) return;
    n.style.left = `calc(50% + ${Math.max(-100, Math.min(100, cents)) * 0.45}%)`;
    n.classList.toggle('in-tune', inTune);
  }

  function singOnPitch(p) {
    if (!p || singState.targetPc == null) { if (p == null) $('sing-read').textContent = 'sing…'; return; }
    const sungFloat = p.midi + p.cents / 100;
    let tm = p.midi + ((((singState.targetPc - p.midi) % 12) + 12) % 12);
    if (tm - p.midi > 6) tm -= 12;
    const cents = (sungFloat - tm) * 100;
    singNeedle(cents, Math.abs(cents) < 18);
    $('sing-read').textContent = `singing ${noteNameOf(p.midi)} ${cents >= 0 ? '+' : ''}${Math.round(cents)}¢`;
    if (!singState.answered) {
      singState.holdRun = Math.abs(cents) < 35 ? singState.holdRun + 1 : 0;
      if (singState.holdRun >= 20) singGrade(true);
    }
  }

  function singGrade(ok) {
    if (singState.answered) return;
    singState.answered = true;
    singScore.add(ok ? 1 : 0);
    record('sing', singState.item, ok);
    $('sing-result').textContent = ok ? `✓ locked ${noteNameOf(singState.targetMidi)}`
                                      : `✗ target was ${noteNameOf(singState.targetMidi)}`;
    singNeedle(0, ok);
    // guide-tone line: on a hit, step to the next note in the line instead of
    // ending the question; only a completed line advances to a new one.
    if (ok && singState.sequence && singState.seqIdx < singState.sequence.length - 1) {
      setTimeout(() => { if (panelActive('sing')) singAdvanceSeq(); }, 900);
      return;
    }
    if (ok) setTimeout(() => { if (panelActive('sing')) $('sing-new').click(); }, 1400);
  }

  function singAdvanceSeq() {
    singState.seqIdx++;
    singState.targetMidi = singState.sequence[singState.seqIdx];
    singState.targetPc = singState.targetMidi % 12;
    singState.answered = false; singState.holdRun = 0;
    singNeedle(0, false);
    $('sing-meta').textContent = `guide-tone line — sing note ${singState.seqIdx + 1}/${singState.sequence.length}`;
  }

  $('sing-mic').onclick = async () => {
    if (isMicOn()) { stopDojoMic(); return; }
    try {
      await startMic(singOnPitch, () => stopDojoMic());
      $('sing-mic').textContent = 'mic on'; $('sing-mic').classList.add('on');
      $('sing-read').textContent = 'sing…';
    } catch (e) {
      $('sing-meta').textContent = 'mic blocked — allow microphone access in the browser';
    }
  };

  $('sing-new').onclick = () => {
    if (!singState.answered && singState.targetPc != null) { // moved on = gave up
      singScore.add(0); record('sing', singState.item, false);
    }
    const mode = $('sing-mode').value;
    singState.mode = mode; singState.answered = false; singState.holdRun = 0;
    singState.sequence = null; singState.seqIdx = 0;
    singNeedle(0, false);
    $('sing-result').textContent = '';
    if (mode === 'match') {
      const midi = 55 + rand(17); // ~G3–B4, a comfortable singing band
      singState.targetMidi = midi; singState.targetPc = midi % 12; singState.item = 'match';
      $('sing-meta').textContent = 'sing the note you hear';
      playSequence([{ notes: [midi], beats: 2 }], 90);
    } else if (mode === 'chordtone') {
      const q = pick(['maj7', 'm7', '7', 'm7b5']);
      const root = rand(12);
      const tone = pick(['R', '3', '5', '7']);
      singState.chord = { root, quality: q };
      const targetPc = (root + chordToneInterval(q, tone)) % 12;
      singState.targetPc = targetPc;
      singState.targetMidi = 55 + (((targetPc - 55) % 12) + 12) % 12; // a reference in singing range
      singState.item = 'ct:' + tone;
      const flats = useFlats(root, 'major');
      $('sing-meta').textContent = `hear the chord, then sing its ${toneName(tone)} (${pcName(root, flats)}${q})`;
      playSequence([{ notes: compNotes(root, q), bass: nearestBass(root, null), beats: 3 }], 84);
    } else if (mode === 'guidetone') {
      const key = { tonic: rand(12), mode: $('sing-keymode').value };
      singState.key = key;
      const { chords, targets } = guideToneLine(key);
      singState.sequence = targets; singState.seqIdx = 0;
      singState.targetMidi = targets[0]; singState.targetPc = targets[0] % 12;
      singState.item = 'gt';
      $('sing-meta').textContent = `hear the ii–V–i, then sing the guide-tone line — note 1/${targets.length}`;
      let prev = null;
      const evs = chords.map((c, i) => {
        prev = nearestBass(c.root, prev);
        return { notes: compNotes(c.root, c.q), bass: prev, beats: i === chords.length - 1 ? 2 : 1.5 };
      });
      playSequence(evs, 96);
    } else if (mode === 'interval') {
      // sing a named interval above an arbitrary reference — pitch production
      // untethered from a key or chord, the gap the degree/chord-tone modes left.
      const IVS = [['m3', 3], ['M3', 4], ['P4', 5], ['P5', 7], ['M6', 9], ['m7', 10], ['M7', 11]];
      const [name, semis] = pick(IVS.filter(([n]) => n !== singState.lastInt));
      singState.lastInt = name;
      const ref = 52 + rand(12); // ~E3–D#4 reference
      singState.refMidi = ref; singState.intervalSemis = semis;
      singState.targetMidi = ref + semis; singState.targetPc = singState.targetMidi % 12;
      singState.item = 'int:' + name;
      $('sing-meta').textContent = `hear the note, then sing a ${name} above it`;
      playSequence([{ notes: [ref], beats: 2 }], 90);
    } else { // degree
      const key = { tonic: rand(12), mode: $('sing-keymode').value };
      singState.key = key;
      const degs = (key.mode === 'minor' ? MDEG_MINOR : MDEG_MAJOR).map(d => 'deg:' + d);
      const item = pickWeighted('sing', degs);
      const dd = item.slice(4);
      singState.item = item;
      singState.targetMidi = 60 + key.tonic + DEGREE_TO_PC[dd];
      singState.targetPc = singState.targetMidi % 12;
      $('sing-meta').textContent = `sing scale degree ${dd} of ${keyName(key)}`;
      playSequence([...cadenceEvents(key), { beats: 0.8 }, { notes: [60 + key.tonic], beats: 1.5 }], 100);
    }
    if (!isMicOn()) $('sing-read').textContent = 'enable the mic to be graded';
  };

  $('sing-replay').onclick = () => {
    const m = singState.mode;
    if (m === 'match' && singState.targetMidi != null) {
      playSequence([{ notes: [singState.targetMidi], beats: 2 }], 90);
    } else if (m === 'interval' && singState.refMidi != null) {
      playSequence([{ notes: [singState.refMidi], beats: 2 }], 90);
    } else if (m === 'chordtone' && singState.chord) {
      playSequence([{ notes: compNotes(singState.chord.root, singState.chord.quality),
                     bass: nearestBass(singState.chord.root, null), beats: 3 }], 84);
    } else if (m === 'guidetone' && singState.key) {
      const { chords } = guideToneLine(singState.key);
      let prev = null;
      const evs = chords.map((c, i) => {
        prev = nearestBass(c.root, prev);
        return { notes: compNotes(c.root, c.q), bass: prev, beats: i === chords.length - 1 ? 2 : 1.5 };
      });
      playSequence(evs, 96);
    } else if (singState.key) {
      playSequence([...cadenceEvents(singState.key), { beats: 0.8 }, { notes: [60 + singState.key.tonic], beats: 1.5 }], 100);
    }
  };

  // ---- rhythm tap-back drill ----
  const RHYTHMS = {
    easy:   [[0,1,2,3], [0,1,1.5,2,3], [0,0.5,1,2,3], [0,1,2,2.5,3], [0,0.5,1,1.5,2,3], [0,1,2,3,3.5]],
    medium: [[0,1.5,2,3], [0,0.5,1.5,2.5,3], [0,1,2.5,3], [0,0.5,2,2.5,3], [0,1.5,2.5,3], [0,0.5,1,2.5]],
    hard:   [[0,0.25,0.5,1,2,3], [0,0.667,1,2,3], [0,1,1.333,1.667,2,3], [0,0.5,0.75,1.5,2,2.5,3], [0,0.333,0.667,1,1.5,2,3]],
    five:   [[0,1,2,3,4], [0,1,2,2.5,3,4], [0,1.5,2,3,4], [0,1,2,3,3.5,4], [0,2,3,4], [0,1,1.5,2,3,4]],
    seven:  [[0,1,2,3,4,5,6], [0,2,4,5,6], [0,1,2,4,5,6], [0,1.5,2,3,4,5,6], [0,2,3,4,6], [0,1,2,3,4,6]],
  };
  // beats per bar for each level — the odd meters make "1" land somewhere new.
  const RHY_BARS = { easy: 4, medium: 4, hard: 4, five: 5, seven: 7 };
  const rhyBar = () => RHY_BARS[rhyState.level] || 4;
  const rhyScore = makeScore('rhy-score');
  const rhyState = { pattern: null, bpm: 88, level: 'easy', taps: [],
                     recording: false, perfStart: 0, timers: [] };
  const rhyBeatSec = () => 60 / rhyState.bpm;
  const rhyClearTimers = () => { rhyState.timers.forEach(clearTimeout); rhyState.timers = []; };

  function rhyRenderViz(marks = [], extras = []) {
    const box = $('rhy-viz');
    box.innerHTML = '';
    if (!rhyState.pattern) return;
    const bar = el('div', 'rhy-bar');
    const B = rhyBar();
    for (let b = 0; b <= B; b++) { const g = el('div', 'rhy-grid'); g.style.left = (b / B * 100) + '%'; bar.appendChild(g); }
    const src = marks.length ? marks : rhyState.pattern.map(on => ({ on, ok: null }));
    for (const m of src) {
      const t = el('div', 'rhy-onset' + (m.ok === true ? ' ok' : m.ok === false ? ' miss' : ''));
      t.style.left = (m.on / B * 100) + '%';
      bar.appendChild(t);
    }
    for (const tp of extras) {
      const t = el('div', 'rhy-extra');
      t.style.left = (Math.max(0, Math.min(B, tp)) / B * 100) + '%';
      bar.appendChild(t);
    }
    box.appendChild(bar);
  }

  function rhyPlay() {
    stopDojo(); ensureCtx();
    if (onStartCb) onStartCb();
    const spb = rhyBeatSec(), t0 = audioNow() + 0.25, B = rhyBar();
    for (let i = 0; i < B; i++) clickAt(t0 + i * spb, i === 0);         // count-in bar
    for (const on of rhyState.pattern) clickAt(t0 + (B + on) * spb, false);
  }

  function rhyRecord() {
    stopDojo(); ensureCtx(); rhyClearTimers();
    if (onStartCb) onStartCb();
    rhyState.taps = []; rhyState.recording = false;
    const spb = rhyBeatSec(), t0 = audioNow() + 0.25, B = rhyBar();
    for (let i = 0; i < B; i++) clickAt(t0 + i * spb, i === 0);         // count-in for the tapper
    const openDelay = Math.max(0, (t0 + B * spb - audioNow()) * 1000);
    $('rhy-meta').textContent = 'count in… then tap the pattern';
    rhyState.timers.push(setTimeout(() => {
      rhyState.recording = true;
      rhyState.perfStart = performance.now();
      $('rhy-pad').classList.add('armed');
      $('rhy-meta').textContent = 'tap now!';
    }, openDelay));
    rhyState.timers.push(setTimeout(() => {
      rhyState.recording = false;
      $('rhy-pad').classList.remove('armed');
      rhyGrade();
    }, openDelay + B * spb * 1000 + 400));
  }

  function rhyTap() {
    if (!rhyState.recording) return;
    rhyState.taps.push((performance.now() - rhyState.perfStart) / 1000 / rhyBeatSec());
    clickAt(audioNow() + 0.001, false);
    $('rhy-pad').classList.add('hit');
    setTimeout(() => $('rhy-pad').classList.remove('hit'), 80);
  }

  function rhyGrade() {
    const ref = rhyState.pattern, taps = rhyState.taps, TOL = 0.28;
    const used = new Array(taps.length).fill(false);
    const marks = [];
    let hits = 0;
    for (const on of ref) {
      let best = -1, bestD = TOL;
      taps.forEach((tp, i) => { if (!used[i]) { const d = Math.abs(tp - on); if (d < bestD) { bestD = d; best = i; } } });
      if (best >= 0) { used[best] = true; hits++; marks.push({ on, ok: true }); }
      else marks.push({ on, ok: false });
    }
    const extras = taps.filter((_, i) => !used[i]);
    const denom = ref.length + extras.length;
    const pct = Math.round(100 * hits / denom);
    rhyScore.add(hits, denom);
    record('rhythm', rhyState.level, pct >= 75);
    $('rhy-result').textContent = `${hits}/${ref.length} hits${extras.length ? ` · ${extras.length} extra` : ''} — ${pct}%`;
    $('rhy-meta').textContent = 'hear it again, or new pattern';
    rhyRenderViz(marks, extras);
  }

  $('rhy-tempo').oninput = e => { rhyState.bpm = Number(e.target.value); $('rhy-bpm').textContent = `${rhyState.bpm} bpm`; };
  $('rhy-level').onchange = e => { rhyState.level = e.target.value; };
  $('rhy-new').onclick = () => {
    rhyClearTimers();
    const pool = RHYTHMS[rhyState.level].filter(p => p !== rhyState.pattern);
    rhyState.pattern = pick(pool.length ? pool : RHYTHMS[rhyState.level]);
    rhyState.taps = [];
    $('rhy-result').textContent = '';
    $('rhy-meta').textContent = `${rhyState.pattern.length} hits · listen, then tap it back`;
    rhyRenderViz();
    rhyPlay();
  };
  $('rhy-play').onclick = () => { if (rhyState.pattern) rhyPlay(); };
  $('rhy-go').onclick = () => { if (rhyState.pattern) rhyRecord(); };
  $('rhy-pad').onclick = rhyTap;
  window.addEventListener('keydown', e => {
    if (e.code === 'Space' && rhyState.recording && panelActive('rhythm')) { e.preventDefault(); rhyTap(); }
  });

  // ---- time-feel drill (meter count / swing-vs-straight) ----
  // A groove plays on the audio clock: a click on every beat, a low thump on
  // each downbeat (so "1" is audible), and — in feel mode — the off-beat eighth
  // placed evenly (straight) or long-short at the triplet (swing). You name it.
  const timeScore = makeScore('time-score');
  const timeState = { mode: 'meter', meter: 4, feel: 'straight', answered: false };
  const METERS = [3, 4, 5];

  function timePlay() {
    ensureCtx();
    const bpm = 116, spb = 60 / bpm;
    const start = audioNow() + 0.2;
    const meter = timeState.mode === 'meter' ? timeState.meter : 4;
    const feel = timeState.mode === 'feel' ? timeState.feel : 'straight';
    const bars = timeState.mode === 'meter' ? 3 : 2;
    for (let bar = 0; bar < bars; bar++) {
      for (let beat = 0; beat < meter; beat++) {
        const t = start + (bar * meter + beat) * spb;
        const down = beat === 0;
        clickAt(t, down);                               // pulse; accent marks "1"
        if (down) playNoteAt(40, t, spb * 0.9, 0.55);   // low thump on the downbeat
        if (timeState.mode === 'feel') {                // subdivide for feel mode
          const off = feel === 'swing' ? spb * (2 / 3) : spb * 0.5;
          clickAt(t + off, false);
        }
      }
    }
  }

  $('time-mode').onchange = e => { timeState.mode = e.target.value; };
  $('time-new').onclick = () => {
    timeState.answered = false;
    timeState.meter = pick(METERS.filter(m => m !== timeState.meter));
    timeState.feel = pick(['straight', 'swing'].filter(f => f !== timeState.feel));
    $('time-result').textContent = '';
    $('time-meta').textContent = timeState.mode === 'meter'
      ? 'count the beats between downbeats' : 'even eighths, or long-short?';
    const correct = timeState.mode === 'meter' ? String(timeState.meter) : timeState.feel;
    const opts = timeState.mode === 'meter' ? METERS.map(String) : ['straight', 'swing'];
    const box = $('time-answers');
    box.innerHTML = '';
    for (const o of opts) {
      const chip = el('button', 'chip', timeState.mode === 'meter' ? `${o}/4` : o);
      chip.onclick = () => {
        if (timeState.answered) return;
        timeState.answered = true;
        const ok = o === correct;
        timeScore.add(ok ? 1 : 0);
        if (timeState.mode === 'meter') record('meter', String(timeState.meter), ok);
        else record('feel', timeState.feel, ok);
        chip.classList.add(ok ? 'good' : 'bad');
        $('time-result').textContent = ok
          ? '✓ right' : `✗ it was ${timeState.mode === 'meter' ? correct + '/4' : correct}`;
        setTimeout(() => { if (panelActive('time')) $('time-new').click(); }, 1500);
      };
      box.appendChild(chip);
    }
    timePlay();
  };
  $('time-replay').onclick = () => timePlay();

  // ---- guide-tone ID drill (3rd or 7th on top of the V) ----
  const guideScore = makeScore('guide-score');
  const guideState = { chords: null, targets: null, answer: null, answered: true };

  function guidePlay() {
    if (!guideState.chords) return;
    let prev = null;
    const evs = guideState.chords.map((c, i) => {
      prev = nearestBass(c.root, prev);
      // double the guide tone on top so the line is the thing you hear
      return { notes: [...compNotes(c.root, c.q), guideState.targets[i]], bass: prev, beats: i === 2 ? 2 : 1.5 };
    });
    playSequence(evs, 96);
  }

  $('guide-new').onclick = () => {
    const key = { tonic: rand(12), mode: pick(['major', 'minor']) };
    const { chords, targets } = guideToneLine(key);
    guideState.chords = chords; guideState.targets = targets; guideState.answered = false;
    const V = chords[1];
    const thirdPc = (V.root + chordToneInterval(V.q, '3')) % 12;
    guideState.answer = (targets[1] % 12 === thirdPc) ? '3rd' : '7th';
    $('guide-result').textContent = '';
    $('guide-meta').textContent = `${keyName(key)} — top note over the V, 3rd or 7th?`;
    const box = $('guide-answers');
    box.innerHTML = '';
    for (const lbl of ['3rd', '7th']) {
      const chip = el('button', 'chip', lbl);
      chip.onclick = () => {
        if (guideState.answered) return;
        guideState.answered = true;
        const ok = lbl === guideState.answer;
        guideScore.add(ok ? 1 : 0);
        record('guide', guideState.answer, ok);
        chip.classList.add(ok ? 'good' : 'bad');
        $('guide-result').textContent = ok ? `✓ the ${lbl}` : `✗ that was the ${guideState.answer}`;
        setTimeout(() => { if (panelActive('guide')) $('guide-new').click(); }, 1500);
      };
      box.appendChild(chip);
    }
    guidePlay();
  };
  $('guide-replay').onclick = () => guidePlay();

  // ---- echo drill (call & response / dictation) ----
  const echoScore = makeScore('echo-score');

  // stitch two ii–V–I phrases into one longer line for real-length dictation.
  function concatPhrases(a, b) {
    const aBeats = a.chords.reduce((s, c) => s + c.beats, 0);
    return {
      ...a, label: `${a.label} → ${b.label}`,
      chords: [...a.chords, ...b.chords],
      melody: [...a.melody, ...b.melody.map(n => ({ ...n, beat: n.beat + aBeats }))],
    };
  }

  function echoNew() {
    const typeSel = $('echo-type').value;
    echoState.mode = $('echo-mode').value;
    echoState.cat = 'echo';
    echoState.item = null;
    echoState.onGraded = null;
    const mkOpts = () => ({ type: typeSel === 'any' ? null : typeSel, mode: $('echo-keymode').value, difficulty: 2 });
    let phrase = generatePhrase(mkOpts());
    if ($('echo-len').value === 'long') phrase = concatPhrases(phrase, generatePhrase(mkOpts()));
    echoState.phrase = phrase;
    echoState.recording = false; echoState.recorded = [];
    $('echo-result').innerHTML = '';
    $('echo-save').disabled = false;
    $('echo-record').classList.remove('on'); $('echo-record').textContent = '● record my echo';
    $('echo-meta').textContent = echoState.phrase.label +
      (echoState.mode === 'dictation' ? ' — plays once, then reconstruct from memory' : ' — hear it, then echo it back');
    echoPlay(true);
  }

  function echoPlay(firstTime) {
    if (!echoState.phrase) return;
    echoState.recording = false;
    $('echo-status').textContent = 'listen…';
    const comp = !(echoState.mode === 'dictation' && !firstTime);
    playPhrase(echoState.phrase, 104, {
      comp,
      onDone: () => {
        $('echo-status').textContent = echoState.mode === 'dictation'
          ? 'now reconstruct it from memory — hit ● record' : 'now echo it — hit ● record';
      },
    });
  }

  $('echo-new').onclick = echoNew;
  $('echo-play').onclick = () => {
    // dictation only lets you hear it once — replay is disabled there
    if (echoState.mode === 'dictation') { $('echo-status').textContent = 'dictation: no replay — reconstruct it'; return; }
    echoPlay(false);
  };
  $('echo-record').onclick = () => {
    if (!echoState.phrase) return;
    if (echoState.recording) { echoGrade($('echo-result'), echoScore); $('echo-record').classList.remove('on'); $('echo-record').textContent = '● record my echo'; return; }
    echoArm();
    $('echo-record').classList.add('on'); $('echo-record').textContent = '■ recording — grade when done';
    $('echo-status').textContent = 'play the line on keyboard / MIDI / on-screen piano…';
  };
  $('echo-grade').onclick = () => {
    echoGrade($('echo-result'), echoScore);
    $('echo-record').classList.remove('on'); $('echo-record').textContent = '● record my echo';
  };
  $('echo-save').onclick = () => {
    if (!echoState.phrase) return;
    addLick(echoState.phrase);
    $('echo-save').disabled = true;
    $('echo-status').textContent = 'saved to the lick bank ✓';
  };

  // ---- lick bank ----
  const lickState = { drill: null, keyOrder: [], keyIdx: 0 }; // transpose-to-12 drill

  function renderLicks() {
    const box = $('licks-list');
    box.innerHTML = '';
    const licks = loadLicks();
    if (!licks.length) {
      box.innerHTML = '<div class="dj-meta">No licks yet — generate a phrase in the <b>echo</b> tab and hit “save to licks”. Saved licks can be played, echoed, and cycled through all 12 keys here.</div>';
      $('licks-drill').style.display = 'none';
      return;
    }
    for (const lk of licks) {
      const row = el('div', 'lick-row');
      const info = el('div', 'lick-info');
      const flats = useFlats(lk.key.tonic, lk.key.mode);
      info.appendChild(el('div', 'lick-name', lk.name));
      info.appendChild(el('div', 'lick-sub',
        `${lk.type} · ${lk.melody.length} notes · ${pcName(lk.key.tonic, flats)}${lk.key.mode === 'minor' ? 'm' : ''}`));
      row.appendChild(info);

      const btns = el('div', 'lick-btns');
      const mk = (label, fn, cls) => { const b = el('button', cls, label); b.onclick = fn; return b; };
      btns.appendChild(mk('▶', () => playPhrase(lk, 104)));
      btns.appendChild(mk('echo', () => startLickEcho(lk, 0)));
      btns.appendChild(mk('12 keys', () => startTranspose(lk)));
      const del = mk('×', () => {
        saveLicks(loadLicks().filter(x => x.id !== lk.id));
        renderLicks();
      }, 'lick-del');
      btns.appendChild(del);
      row.appendChild(btns);
      box.appendChild(row);
    }
  }

  // echo a saved lick (optionally transposed by `semis`) — logs to cat 'licks'
  function startLickEcho(lick, semis) {
    const ph = semis ? transposePhrase(lick, semis) : lick;
    echoState.phrase = ph;
    echoState.mode = 'echo';
    echoState.cat = 'licks';
    echoState.item = lick.id;
    echoState.recording = false; echoState.recorded = [];
    echoState.onGraded = null;
    $('licks-drill').style.display = '';
    $('licks-drill-result').innerHTML = '';
    const flats = useFlats(ph.key.tonic, ph.key.mode);
    $('licks-drill-meta').textContent = `${lick.name} in ${pcName(ph.key.tonic, flats)}${ph.key.mode === 'minor' ? 'm' : ''} — hear it, then echo`;
    playPhrase(ph, 104, { onDone: () => { $('licks-drill-status').textContent = 'echo it — hit ● record'; } });
  }

  // cycle a lick through all 12 keys, echoing + grading each
  function startTranspose(lick) {
    lickState.drill = lick;
    lickState.keyOrder = shuffle([...Array(12).keys()]);
    lickState.keyIdx = 0;
    $('licks-drill').style.display = '';
    nextTransposeKey();
  }
  function nextTransposeKey() {
    const lick = lickState.drill;
    if (!lick) return;
    if (lickState.keyIdx >= lickState.keyOrder.length) {
      $('licks-drill-status').textContent = 'all 12 keys done ✓';
      $('licks-drill-meta').textContent = `${lick.name} — cycle complete`;
      lickState.drill = null;
      return;
    }
    const semis = ((lickState.keyOrder[lickState.keyIdx] - lick.key.tonic) % 12 + 12) % 12;
    const ph = transposePhrase(lick, semis);
    echoState.phrase = ph; echoState.mode = 'echo'; echoState.cat = 'licks'; echoState.item = lick.id;
    echoState.recording = false; echoState.recorded = [];
    echoState.onGraded = () => { lickState.keyIdx++; setTimeout(nextTransposeKey, 1600); };
    const flats = useFlats(ph.key.tonic, ph.key.mode);
    $('licks-drill-meta').textContent =
      `key ${lickState.keyIdx + 1}/12 — ${pcName(ph.key.tonic, flats)}${ph.key.mode === 'minor' ? 'm' : ''}`;
    $('licks-drill-result').innerHTML = '';
    playPhrase(ph, 104, { onDone: () => { $('licks-drill-status').textContent = 'echo it — hit ● record'; } });
  }

  $('licks-drill-play').onclick = () => { if (echoState.phrase) playPhrase(echoState.phrase, 104); };
  $('licks-drill-record').onclick = () => {
    if (!echoState.phrase) return;
    if (echoState.recording) {
      echoGrade($('licks-drill-result'), null);
      $('licks-drill-record').classList.remove('on'); $('licks-drill-record').textContent = '● record my echo';
      return;
    }
    echoArm();
    $('licks-drill-record').classList.add('on'); $('licks-drill-record').textContent = '■ recording — grade when done';
    $('licks-drill-status').textContent = 'play it back…';
  };
  $('licks-drill-grade').onclick = () => {
    echoGrade($('licks-drill-result'), null);
    $('licks-drill-record').classList.remove('on'); $('licks-drill-record').textContent = '● record my echo';
  };

  // ---- cadence-type ID drill ----
  const cadScore = makeScore('cad-score');
  const cadState = { cad: null, key: null, answered: true };

  function cadPlay() {
    const { cad, key } = cadState;
    if (!cad) return;
    cadState.askedAt = nowT();
    const t = key.tonic;
    let prev = null;
    const evs = cad.degs.map(([d, q], i) => {
      const root = (t + d) % 12;
      prev = nearestBass(root, prev);
      return { notes: compNotes(root, q), bass: prev, beats: i === cad.degs.length - 1 ? 3 : 1.5 };
    });
    const tonicQ = key.mode === 'minor' ? 'm' : '';
    const ref = { notes: compNotes(t, tonicQ), bass: nearestBass(t, null), beats: 2 };
    playSequence([ref, { beats: 1 }, ...evs], 96);
  }

  $('cad-new').onclick = () => {
    const wid = pickWeighted('cadence', CADENCES.map(c => c.id));
    cadState.cad = CADENCES.find(c => c.id === wid) || pick(CADENCES);
    cadState.key = { tonic: rand(12), mode: cadState.cad.mode };
    cadState.answered = false;
    $('cad-meta').textContent = `key: ${keyName(cadState.key)} — tonic first, then the cadence`;
    $('cad-result').textContent = '';
    const box = $('cad-answers');
    box.innerHTML = '';
    for (const c of CADENCES) {
      const chip = el('button', 'chip', c.label);
      chip.onclick = () => {
        if (cadState.answered) return;
        cadState.answered = true;
        const ok = c.id === cadState.cad.id;
        cadScore.add(ok ? 1 : 0);
        recordTimed('cadence', cadState.cad.id, ok, c.id, cadState.askedAt);
        chip.classList.add(ok ? 'good' : 'bad');
        $('cad-result').textContent = ok ? `✓ ${cadState.cad.label}` : `✗ that was ${cadState.cad.label}`;
        setTimeout(() => { if (panelActive('cadence')) $('cad-new').click(); }, 1500);
      };
      box.appendChild(chip);
    }
    cadPlay();
  };
  $('cad-replay').onclick = cadPlay;

  // ---- form-recognition drill (uses the standards library) ----
  const FORM_SONGS = STD_SONGS.filter(s => songForm(s));
  const formScore = makeScore('form-score');
  const formState = { song: null, form: null, answered: true, lastId: null };

  function formPlay() {
    const song = formState.song;
    if (!song) return;
    let prev = null;
    const evs = [];
    for (const sec of song.sections) {
      for (const barStr of sec.bars) {
        const toks = barStr.trim().split(/\s+/);
        const per = 1 / toks.length; // one "beat" per bar, split across its chords
        for (const tk of toks) {
          const c = parseChord(tk);
          if (!c) continue;
          prev = nearestBass(c.root, prev);
          evs.push({ notes: compNotes(c.root, c.quality), bass: prev, beats: per });
        }
      }
    }
    playSequence(evs, 150); // brisk: ~0.4s per bar so the whole form fits in ~15s
  }

  $('form-new').onclick = () => {
    if (!FORM_SONGS.length) { $('form-meta').textContent = 'no classifiable tunes found'; return; }
    let pool = FORM_SONGS.filter(s => s.id !== formState.lastId);
    if (!pool.length) pool = FORM_SONGS;
    formState.song = pick(pool);
    formState.lastId = formState.song.id;
    formState.form = songForm(formState.song);
    formState.answered = false;
    const bars = formState.song.sections.reduce((a, s) => a + s.bars.length, 0);
    $('form-meta').textContent = `${bars} bars comping — listen for repeats and the return`;
    $('form-result').textContent = '';
    const box = $('form-answers');
    box.innerHTML = '';
    for (const f of FORM_CHIPS) {
      const chip = el('button', 'chip', f);
      chip.onclick = () => {
        if (formState.answered) return;
        formState.answered = true;
        const ok = f === formState.form;
        formScore.add(ok ? 1 : 0);
        record('form', formState.form, ok);
        chip.classList.add(ok ? 'good' : 'bad');
        $('form-result').textContent = (ok ? '✓ ' : `✗ that was ${formState.form} — `) +
          `“${formState.song.title}”`;
      };
      box.appendChild(chip);
    }
    formPlay();
  };
  $('form-replay').onclick = formPlay;

  // ---- modal / scale-color recognition drill ----
  const MODES = [
    { id: 'ionian',     label: 'ionian',     scale: [0, 2, 4, 5, 7, 9, 11] },
    { id: 'dorian',     label: 'dorian',     scale: [0, 2, 3, 5, 7, 9, 10] },
    { id: 'phrygian',   label: 'phrygian',   scale: [0, 1, 3, 5, 7, 8, 10] },
    { id: 'lydian',     label: 'lydian',     scale: [0, 2, 4, 6, 7, 9, 11] },
    { id: 'mixolydian', label: 'mixolydian', scale: [0, 2, 4, 5, 7, 9, 10] },
    { id: 'aeolian',    label: 'aeolian',    scale: [0, 2, 3, 5, 7, 8, 10] },
    { id: 'locrian',    label: 'locrian',    scale: [0, 1, 3, 5, 6, 8, 10] },
  ];
  const MODE_SETS = {
    jazz: ['dorian', 'mixolydian', 'lydian'],
    dark: ['dorian', 'phrygian', 'aeolian', 'locrian'],
    all: MODES.map(m => m.id),
  };
  const modeById = id => MODES.find(m => m.id === id);
  const modalScore = makeScore('modal-score');
  const modalState = { mode: null, tonic: 0, answered: true };

  // the tonic chord that carries a mode's colour (quality from its 3rd/5th/7th)
  function modeTonicQuality(scale) {
    const third = scale.includes(4) ? 4 : 3;
    const fifth = scale.includes(7) ? 7 : 6;
    const seventh = scale.includes(11) ? 11 : 10;
    if (third === 4) return fifth === 7 ? (seventh === 11 ? 'maj7' : '7') : 'aug';
    return fifth === 6 ? 'm7b5' : 'm7';
  }

  function modalPlay() {
    const m = modalState.mode;
    if (!m) return;
    modalState.askedAt = nowT();
    const base = 60 + modalState.tonic;
    const q = modeTonicQuality(m.scale);
    const vamp = { notes: compNotes(modalState.tonic, q), bass: nearestBass(modalState.tonic, null), beats: 2 };
    const scaleUp = m.scale.map(iv => ({ notes: [base + iv], beats: 0.5 }));
    scaleUp.push({ notes: [base + 12], beats: 1 });
    playSequence([vamp, { beats: 0.4 }, ...scaleUp, { beats: 0.3 }, vamp], 120);
  }

  function modalIds() { return MODE_SETS[$('modal-set').value] || MODE_SETS.all; }

  $('modal-new').onclick = () => {
    const ids = modalIds();
    const wid = pickWeighted('modal', ids);
    modalState.mode = modeById(wid) || modeById(pick(ids));
    modalState.tonic = rand(12);
    modalState.answered = false;
    $('modal-meta').textContent = 'a tonic vamp, then the scale up — which mode?';
    $('modal-result').textContent = '';
    const box = $('modal-answers');
    box.innerHTML = '';
    for (const id of ids) {
      const m = modeById(id);
      const chip = el('button', 'chip', m.label);
      chip.onclick = () => {
        if (modalState.answered) return;
        modalState.answered = true;
        const ok = id === modalState.mode.id;
        modalScore.add(ok ? 1 : 0);
        recordTimed('modal', modalState.mode.id, ok, id, modalState.askedAt);
        chip.classList.add(ok ? 'good' : 'bad');
        $('modal-result').textContent = ok ? `✓ ${modalState.mode.label}` : `✗ that was ${modalState.mode.label}`;
        setTimeout(() => { if (panelActive('modal')) $('modal-new').click(); }, 1500);
      };
      box.appendChild(chip);
    }
    modalPlay();
  };
  $('modal-replay').onclick = modalPlay;
  $('modal-set').onchange = () => $('modal-new').click();

  // ---- tension-over-chord ID drill ----
  const TENSIONS_BY_FAM = { major: [2, 6, 9], dom: [1, 2, 3, 6, 8, 9], minor: [2, 5, 9] };
  const TENSION_LBL = { 1: 'b9', 2: '9', 3: '#9', 5: '11', 6: '#11', 8: 'b13', 9: '13' };
  const TENSION_CHIPS = ['b9', '9', '#9', '11', '#11', 'b13', '13'];
  const tensScore = makeScore('tens-score');
  const tensState = { root: 0, quality: 'maj7', iv: 2, answered: true };

  function tensPlay() {
    const { root, quality, iv } = tensState;
    tensState.askedAt = nowT();
    const chord = compNotes(root, quality);
    const bass = nearestBass(root, null);
    let tn = 72 + root + iv;
    while (tn > 86) tn -= 12;
    while (tn < 74) tn += 12;
    playSequence([
      { notes: chord, bass, beats: 1.5 },
      { beats: 0.3 },
      { notes: [tn], beats: 1.2 },
      { beats: 0.2 },
      { notes: [...chord, tn], beats: 2.2 },
    ], 92);
  }

  $('tens-new').onclick = () => {
    const q = pick(['maj7', '7', 'm7']);
    const fam = q === 'maj7' ? 'major' : q === '7' ? 'dom' : 'minor';
    tensState.quality = q;
    tensState.root = rand(12);
    tensState.iv = pick(TENSIONS_BY_FAM[fam]);
    tensState.answered = false;
    const flats = useFlats(tensState.root, 'major');
    $('tens-meta').textContent = `${pcName(tensState.root, flats)}${q} + a tension on top — name it`;
    $('tens-result').textContent = '';
    const box = $('tens-answers');
    box.innerHTML = '';
    for (const lbl of TENSION_CHIPS) {
      const chip = el('button', 'chip', lbl);
      chip.onclick = () => {
        if (tensState.answered) return;
        tensState.answered = true;
        const ok = lbl === TENSION_LBL[tensState.iv];
        tensScore.add(ok ? 1 : 0);
        recordTimed('tension', TENSION_LBL[tensState.iv], ok, lbl, tensState.askedAt);
        chip.classList.add(ok ? 'good' : 'bad');
        $('tens-result').textContent = ok ? `✓ ${lbl}` : `✗ that was ${TENSION_LBL[tensState.iv]}`;
        setTimeout(() => { if (panelActive('tension')) $('tens-new').click(); }, 1500);
      };
      box.appendChild(chip);
    }
    tensPlay();
  };
  $('tens-replay').onclick = tensPlay;

  // ---- inversion / bass-note drill (hear which chord tone is on the bottom) ----
  const INV_QUAL = { triads: ['', 'm', 'dim', 'aug'], sevenths: ['maj7', '7', 'm7', 'm7b5'] };
  const INV_LABEL = { R: 'root', 3: '3rd', 5: '5th', 7: '7th' };
  const invScore = makeScore('inv-score');
  const invState = { root: 0, quality: '', tone: 'R', answered: true, askedAt: 0 };
  const invTones = q => (/7/.test(q) ? ['R', '3', '5', '7'] : ['R', '3', '5']);

  function invBassMidi() {
    const semi = chordToneInterval(invState.quality, invState.tone);
    let m = 40 + ((invState.root + semi) % 12);
    while (m < 43) m += 12;   // keep the bass in a plausible low register
    return m;
  }
  function invPlay() {
    if (invState.quality == null) return;
    invState.askedAt = nowT();
    // upper structure over the chosen bass tone — a root-position chord vs a slash
    playSequence([{ notes: compNotes(invState.root, invState.quality), bass: invBassMidi(), beats: 3 }], 70);
  }
  function invBuild() {
    const box = $('inv-answers');
    box.innerHTML = '';
    for (const t of invTones(invState.quality)) {
      const chip = el('button', 'chip', INV_LABEL[t]);
      chip.onclick = () => {
        if (invState.answered) return;
        invState.answered = true;
        const ok = t === invState.tone;
        invScore.add(ok ? 1 : 0);
        recordTimed('inversion', `inv:${invState.tone}`, ok, `inv:${t}`, invState.askedAt);
        chip.classList.add(ok ? 'good' : 'bad');
        const f = useFlats(invState.root, 'major');
        $('inv-result').textContent = (ok ? '✓ ' : '✗ ') +
          `${pcName(invState.root, f)}${qualLabel(invState.quality)} with the ${INV_LABEL[invState.tone]} in the bass`;
        setTimeout(() => { if (panelActive('inversion')) $('inv-new').click(); }, 1500);
      };
      box.appendChild(chip);
    }
  }
  $('inv-new').onclick = () => {
    invState.quality = pick(INV_QUAL[$('inv-level').value]);
    invState.root = rand(12);
    invState.tone = pick(invTones(invState.quality));
    invState.answered = false;
    $('inv-result').textContent = '';
    const f = useFlats(invState.root, 'major');
    $('inv-meta').textContent = `${pcName(invState.root, f)}${qualLabel(invState.quality)} — which tone is on the bottom?`;
    invBuild();
    invPlay();
  };
  $('inv-replay').onclick = invPlay;
  $('inv-level').onchange = () => $('inv-new').click();

  // ---- voicing / comping drill (keyboard-answered — build the named chord) ----
  const vcScore = makeScore('vc-score');
  const vcState = { root: 0, quality: 'maj7', type: 'shell', targetPcs: new Set(), answered: true, askedAt: 0 };
  const VC_TYPE_LABEL = { shell: 'shell (3rd & 7th)', rootless: 'rootless (3-5-7-9)', triad: 'triad', seventh: '7th chord' };

  // the pitch classes a voicing type asks for over a given chord
  function voicingPcs(root, quality, type) {
    const ivs = qualityIntervals(quality);
    const third = ivs.find(i => i === 3 || i === 4) ?? 4;
    const fifth = ivs.find(i => i === 6 || i === 7 || i === 8) ?? 7;
    const seventh = ivs.find(i => i === 9 || i === 10 || i === 11) ?? 10;
    const pc = s => ((root + s) % 12 + 12) % 12;
    if (type === 'triad') return new Set([pc(0), pc(third), pc(fifth)]);
    if (type === 'seventh') return new Set([pc(0), pc(third), pc(fifth), pc(seventh)]);
    if (type === 'shell') return new Set([pc(third), pc(seventh)]);       // guide tones, rootless
    return new Set([pc(third), pc(fifth), pc(seventh), pc(2)]);           // rootless: 3-5-7-9
  }
  const vcPcNames = () => [...vcState.targetPcs].sort((a, b) => a - b)
    .map(pc => pcName(pc, useFlats(vcState.root, 'major'))).join(' ');
  function vcPlay() {
    const midi = [...vcState.targetPcs].sort((a, b) => a - b).map(pc => 60 + pc);
    playSequence([{ notes: midi, beats: 3 }], 80);
  }
  const heldPcs = () => new Set(heldNotes().map(m => ((m % 12) + 12) % 12));
  const vcMatches = () => {
    const h = heldPcs();
    return h.size === vcState.targetPcs.size && [...vcState.targetPcs].every(p => h.has(p));
  };
  function vcFinish(ok) {
    if (vcState.answered) return;
    vcState.answered = true;
    vcScore.add(ok ? 1 : 0);
    recordTimed('voicing', `voice:${vcState.type}:${vcState.quality || 'maj'}`, ok, null, vcState.askedAt);
    $('vc-result').textContent = ok ? '✓ that’s the voicing' : `✗ it was ${vcPcNames()}`;
    vcPlay();
    setTimeout(() => { if (panelActive('voicing')) $('vc-new').click(); }, 1900);
  }
  // auto-grade the instant the held notes match the target — hands-free
  onHeldChange(() => {
    if (vcState.answered || !panelActive('voicing')) return;
    $('vc-held').textContent = heldNotes().length
      ? 'holding: ' + [...heldPcs()].sort((a, b) => a - b).map(pc => pcName(pc, useFlats(vcState.root, 'major'))).join(' ')
      : 'play the notes…';
    if (vcMatches()) vcFinish(true);
  });
  $('vc-new').onclick = () => {
    vcState.type = $('vc-level').value;
    vcState.quality = pick(vcState.type === 'triad' ? ['', 'm', 'dim', 'aug'] : ['maj7', '7', 'm7', 'm7b5']);
    vcState.root = rand(12);
    vcState.targetPcs = voicingPcs(vcState.root, vcState.quality, vcState.type);
    vcState.answered = false;
    vcState.askedAt = nowT();
    const f = useFlats(vcState.root, 'major');
    $('vc-meta').textContent = `play the ${VC_TYPE_LABEL[vcState.type]} of ${pcName(vcState.root, f)}${qualLabel(vcState.quality)}`;
    $('vc-result').textContent = '';
    $('vc-held').textContent = 'play the notes…';
  };
  $('vc-hear').onclick = () => { if (!vcState.answered) vcPlay(); };
  $('vc-check').onclick = () => { if (!vcState.answered) vcFinish(vcMatches()); };
  $('vc-reveal').onclick = () => { if (!vcState.answered) vcFinish(false); };
  $('vc-level').onchange = () => $('vc-new').click();

  // ---- progress / stats panel ----
  function renderStats() {
    const s = progressStats();
    const box = $('stats-body');
    box.innerHTML = '';
    const line = (label, val) => { const d = el('div', 'stats-line'); d.innerHTML = `<span>${label}</span><b>${val}</b>`; return d; };

    const overall = el('div', 'stats-block');
    overall.appendChild(el('h4', null, 'overall'));
    overall.appendChild(line('attempts logged', s.overall.seen));
    overall.appendChild(line('accuracy', s.overall.seen ? s.overall.pct + '%' : '—'));
    let msSum = 0, msCount = 0;
    for (const c of Object.values(s.byCat)) { msSum += c.msSum || 0; msCount += c.msCount || 0; }
    if (msCount) overall.appendChild(line('avg response', (msSum / msCount / 1000).toFixed(1) + 's'));
    overall.appendChild(line('items due for review', s.dueCount));
    box.appendChild(overall);

    const cats = el('div', 'stats-block');
    cats.appendChild(el('h4', null, 'by drill'));
    const names = Object.keys(s.byCat).sort();
    if (!names.length) cats.appendChild(el('div', 'dj-meta', 'no attempts yet — go run a drill'));
    for (const c of names) {
      const row = el('div', 'stats-bar-row');
      row.appendChild(el('span', 'stats-bar-label', c));
      const track = el('div', 'stats-bar-track');
      const fill = el('div', 'stats-bar-fill');
      fill.style.width = s.byCat[c].pct + '%';
      fill.classList.add(s.byCat[c].pct < 50 ? 'low' : s.byCat[c].pct < 75 ? 'mid' : 'high');
      track.appendChild(fill);
      row.appendChild(track);
      row.appendChild(el('span', 'stats-bar-num', `${s.byCat[c].pct}% · ${s.byCat[c].seen}`));
      cats.appendChild(row);
    }
    box.appendChild(cats);

    const days = el('div', 'stats-block');
    days.appendChild(el('h4', null, 'last 14 days'));
    const spark = el('div', 'stats-spark');
    const maxTot = Math.max(1, ...s.days.map(d => d.total));
    for (const d of s.days) {
      const col = el('div', 'stats-spark-col');
      const b = el('div', 'stats-spark-bar');
      b.style.height = Math.max(3, Math.round(d.total / maxTot * 100)) + '%';
      if (d.total) b.classList.add(d.correct / d.total < 0.5 ? 'low' : d.correct / d.total < 0.75 ? 'mid' : 'high');
      col.title = `${d.date}: ${d.correct}/${d.total}`;
      col.appendChild(b);
      spark.appendChild(col);
    }
    days.appendChild(spark);
    box.appendChild(days);

    const weak = el('div', 'stats-block');
    weak.appendChild(el('h4', null, 'weakest items (≥3 tries)'));
    if (!s.weak.length) weak.appendChild(el('div', 'dj-meta', 'nothing logged enough yet'));
    for (const w of s.weak) {
      const r = el('div', 'stats-line');
      const label = w.id.replace(/^[a-z]+:/, ''), cat = w.id.split(':')[0];
      const t = w.avgMs ? ` · ${(w.avgMs / 1000).toFixed(1)}s` : '';
      r.innerHTML = `<span>${esc(label)} <small>${cat}</small></span><b>${w.pct}% · ${w.seen}${t}</b>`;
      weak.appendChild(r);
    }
    box.appendChild(weak);

    // confusion pairs — what you answer when you miss ("you hear X as Y")
    if (s.confusions && s.confusions.length) {
      const conf = el('div', 'stats-block');
      conf.appendChild(el('h4', null, 'most confused'));
      for (const c of s.confusions) {
        const r = el('div', 'stats-line');
        r.innerHTML = `<span>heard <b>${esc(c.answer)}</b> as <b>${esc(c.guess)}</b> <small>${esc(c.cat)}</small></span><b>×${c.n}</b>`;
        conf.appendChild(r);
      }
      box.appendChild(conf);
    }
  }
  $('stats-refresh').onclick = renderStats;
  $('stats-reset').onclick = () => {
    if (confirm('Erase all logged progress? This cannot be undone.')) { resetProgress(); renderStats(); }
  };

  // ---- tabs ----
  for (const btn of document.querySelectorAll('#dojo-tabs button')) {
    btn.onclick = () => {
      stopDojo();
      stopDojoMic();
      opts.stopStandards?.();   // standards is now a tab — stop its audio on leave
      rhyState.recording = false; rhyClearTimers();
      document.querySelectorAll('#dojo-tabs button').forEach(b =>
        b.classList.toggle('active', b === btn));
      document.querySelectorAll('.dj-panel').forEach(p =>
        p.classList.toggle('active', p.id === `panel-${btn.dataset.tab}`));
      if (btn.dataset.tab === 'path') currRenderPath();
      if (btn.dataset.tab === 'licks') renderLicks();
      if (btn.dataset.tab === 'tunes') renderRepertoire();
    };
  }

  // start with a song loaded so the first click can just be ▶
  $('changes-new').click();
}

export { initDojo, stopDojo, stopDojoMic };
