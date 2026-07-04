// app.js — otodojo UI: a shared progression-quiz engine (song quiz + paste a
// tab) and four smaller drills (basslines, degrees, qualities, intervals).

import {
  pcName, useFlats, parseChord, voicing, parseKey, keyName, guessKey,
  romanFor, diatonicSevenths, DEGREE_TO_PC, DEGREE_CHIPS, INTERVALS,
} from './theory.js';
import { playChord, allNotesOff, ensureCtx } from './audio.js';
import { SONGS } from '../groundtruth/songs.js';
import { BASSLINES } from '../groundtruth/basslines.js';

const $ = id => document.getElementById(id);
const rand = n => Math.floor(Math.random() * n);
const pick = arr => arr[rand(arr.length)];
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

// ---- playback scheduler ----
// events: [{ notes?, bass?, beats, slot? }] — slot indexes light up while playing.
let seqTimer = null;
let seqActive = false;

function playSequence(events, bpm, { onStep, onDone } = {}) {
  stopPlayback();
  ensureCtx();
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

function stopPlayback() {
  seqActive = false;
  clearTimeout(seqTimer);
  allNotesOff();
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
    const v = voicing(root, q);
    prev = nearestBass(root, prev);
    return { notes: v.notes, bass: prev, beats: i === 3 ? 2 : 1 };
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
// Progression quiz engine — used by both the song quiz and paste-a-tab.
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
    stopPlayback();
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
      const v = voicing(e.root, e.quality);
      prev = nearestBass(e.root, prev);
      return { notes: v.notes, bass: prev, beats: e.beats, slot: i };
    });
    playSequence(evs, bpm, {
      onStep: e => paintSlots(e.slot),
      onDone: () => paintSlots(),
    });
  };
  ids('stop').onclick = () => { stopPlayback(); paintSlots(); };
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
    finish(graded);
  };
  ids('reveal').onclick = () => {
    if (!state.song || state.done) return;
    score.add(0, state.song.events.length);
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

// ---- song quiz tab ----
const songQuiz = makeQuiz('song', 'session');
let lastSongId = null;

$('song-new').onclick = () => {
  const genre = $('song-genre').value;
  const diff = $('song-diff').value;
  let pool = SONGS.filter(s =>
    (genre === 'all' || s.genre === genre) &&
    (diff === 'all' || s.difficulty === Number(diff)));
  if (!pool.length) pool = SONGS;
  if (pool.length > 1) pool = pool.filter(s => s.id !== lastSongId);
  const s = pick(pool);
  lastSongId = s.id;
  const key = parseKey(s.key);
  songQuiz.setSong(buildQuizSong(
    { title: s.title, artist: s.artist, genre: s.genre, tempo: s.tempo, note: s.note },
    s.bars, key));
};

// ---- paste a tab ----
const pasteQuiz = makeQuiz('paste', 'session');

$('paste-make').onclick = () => {
  const text = $('paste-input').value;
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
    $('paste-status').textContent = 'no chords found — paste a chord line like  | Dm7 | G7 | Cmaj7 |';
    return;
  }
  const key = guessKey(parsed);
  $('paste-status').textContent =
    `${parsed.length} chords parsed · guessed key: ${keyName(key)}`;
  pasteQuiz.setSong(buildQuizSong({ tempo: 96 }, bars, key));
};

// =====================================================================
// bassline drill
// =====================================================================
const bassScore = makeScore('bass-score');
const bassState = { line: null, key: null, guesses: [], done: false, events: [] };

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
$('bass-stop').onclick = () => { stopPlayback(); bassPaintSlots(); };
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
  bassFinish(graded);
};
$('bass-reveal').onclick = () => {
  if (!bassState.line || bassState.done) return;
  bassScore.add(0, bassState.line.degrees.length);
  bassFinish(null);
};

// =====================================================================
// degrees drill
// =====================================================================
const degScore = makeScore('deg-score');
const degState = { key: null, chord: null, answered: false };

function degPlayCadence() { if (degState.key) playSequence(cadenceEvents(degState.key), 100); }
function degPlayChord() {
  const c = degState.chord;
  if (!c) return;
  const v = voicing(c.root, c.quality);
  playSequence([{ notes: v.notes, bass: nearestBass(c.root, null), beats: 3 }], 90);
}

$('deg-new').onclick = () => {
  const modeSel = $('deg-mode').value;
  const mode = modeSel === 'both' ? pick(['major', 'minor']) : modeSel;
  degState.key = { tonic: rand(12), mode };
  const palette = diatonicSevenths(degState.key);
  degState.chord = pick(palette);
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
      chip.classList.add(ok ? 'good' : 'bad');
      const flats = useFlats(degState.key.tonic, degState.key.mode);
      $('deg-result').textContent = ok
        ? `✓ ${degState.chord.roman} (${pcName(degState.chord.root, flats)}${degState.chord.quality})`
        : `✗ that was ${degState.chord.roman} (${pcName(degState.chord.root, flats)}${degState.chord.quality})`;
      setTimeout(() => $('deg-new').click(), 1400);
    };
    box.appendChild(chip);
  }
  playSequence([...cadenceEvents(degState.key), { beats: 1.5 }], 100, { onDone: degPlayChord });
};
$('deg-cadence').onclick = degPlayCadence;
$('deg-chord').onclick = degPlayChord;

// =====================================================================
// qualities drill
// =====================================================================
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
  const v = voicing(qualState.root, qualState.quality);
  playSequence([{ notes: v.notes, bass: nearestBass(qualState.root, null), beats: 3 }], 80);
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
  qualState.quality = pick(QUAL_LEVELS[$('qual-level').value]);
  qualState.root = rand(12);
  qualState.answered = false;
  $('qual-result').textContent = '';
  qualBuildAnswers();
  qualPlay();
};
$('qual-replay').onclick = qualPlay;
$('qual-level').onchange = qualBuildAnswers;

// =====================================================================
// intervals drill
// =====================================================================
const intScore = makeScore('int-score');
const intState = { iv: null, low: null, harmonic: false, up: true, answered: true };

function intPlay() {
  if (!intState.iv) return;
  const a = intState.low, b = intState.low + intState.iv.semis;
  if (intState.harmonic) {
    playSequence([{ notes: [a, b], beats: 2.5 }], 80);
  } else {
    const [first, second] = intState.up ? [a, b] : [b, a];
    playSequence([{ notes: [first], beats: 1 }, { notes: [second], beats: 2 }], 84);
  }
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
      chip.classList.add(ok ? 'good' : 'bad');
      $('int-result').textContent = ok ? `✓ ${iv.name}` : `✗ that was ${intState.iv.name}`;
      setTimeout(() => $('int-new').click(), 1100);
    };
    box.appendChild(chip);
  }
}

$('int-new').onclick = () => {
  const type = $('int-type').value;
  intState.iv = pick(INTERVALS);
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

// =====================================================================
// tabs + theme
// =====================================================================
for (const btn of document.querySelectorAll('#tabs button')) {
  btn.onclick = () => {
    stopPlayback();
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.panel').forEach(p =>
      p.classList.toggle('active', p.id === `panel-${btn.dataset.tab}`));
  };
}

const themeBtn = $('theme-btn');
function setTheme(t) {
  document.body.dataset.theme = t;
  themeBtn.textContent = t === 'washi' ? '☾' : '☀';
  try { localStorage.setItem('otodojo-theme', t); } catch {}
}
themeBtn.onclick = () => setTheme(document.body.dataset.theme === 'washi' ? 'yoru' : 'washi');
try {
  const saved = localStorage.getItem('otodojo-theme');
  if (saved) setTheme(saved);
} catch {}

// start with a song loaded so the first click can just be ▶
$('song-new').click();
