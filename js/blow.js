// blow.js — the "blow" room: play (or sing) over the changes.
//
// The dojo's other drills go app-plays / you-name. This one flips to the
// bandstand: pick a tune or an exercise and WHAT to play on every chord (the
// root, the guide tones, an arpeggio, the chord scale, a pentatonic, the upper
// structure, a walking bass, or a voice-led target-tone line); the app writes
// the targets under each chord two bars at a time — the current bar large, the
// next one below — and listens. Hit a target on your instrument (MIDI, computer
// keys, the on-screen piano) or sing it into the mic and it turns green; a
// stray note flashes red and shows what it heard. "wait for me" holds each
// chord until every tone is found; "in time" comps the form and moves on with
// the beat. Every chord logs to the progress store under `blow`.
//
// The music lives in targets.js (pure, tested); this file is the room: the
// form, the comp, the two views (note pills / a staff), the inputs, the score.

import {
  pcName, useFlats, chordVoicing, analyzeFunction, guessKey, qualityFamily,
  NOTE_NAMES_SHARP, NOTE_NAMES_FLAT,
} from './theory.js';
import { playChordAt, playNoteAt, clickAt, audioNow, ensureCtx } from './audio.js';
import { onHeldChange } from './input.js';
import { startMic, stopMic, isMicOn } from './pitch.js';
import { parseProgression } from './reference.js';
import { record } from './progress.js';
import { DRILLS, targetsFor, targetLine, newChordSession, gradeNote, chordPassed } from './targets.js';
import { flatBars, addComp } from './standards.js';
import { SONGS as STD_CORE } from './standards-data.js';
import { SONGS_EXTRA as STD_EXTRA } from './standards-data-extra.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mod12 = x => ((x % 12) + 12) % 12;
const KEY = 'otolab:v1:blow';
const panelActive = () => !!$('panel-blow')?.classList.contains('active');

// ---------- exercises (built-in forms, standards-data shape) ----------
const letter = (pc, flats) => (flats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP)[mod12(pc)];
function cycle251() {
  const bars = [];
  for (let k = 0, tonic = 0; k < 12; k++, tonic = mod12(tonic + 5)) {   // C F Bb Eb … around the cycle
    const f = useFlats(tonic, 'major');
    bars.push(`${letter(tonic + 2, f)}m7 ${letter(tonic + 7, f)}7`, `${letter(tonic, f)}maj7`);
  }
  return bars;
}
const EXERCISES = [
  { id: 'ex-251', title: 'ii–V–I · one key, a bar each', tonic: 0, mode: 'major', bpb: 4, style: 'swing', bpm: 96,
    sections: [{ name: '', bars: ['Dm7', 'G7', 'Cmaj7', 'Cmaj7'] }] },
  { id: 'ex-251-fast', title: 'ii–V–I · one key, two beats each', tonic: 0, mode: 'major', bpb: 4, style: 'swing', bpm: 120,
    sections: [{ name: '', bars: ['Dm7 G7', 'Cmaj7', 'Dm7 G7', 'Cmaj7'] }] },
  { id: 'ex-m251', title: 'minor ii–V–i · one key', tonic: 0, mode: 'minor', bpb: 4, style: 'swing', bpm: 96,
    sections: [{ name: '', bars: ['Dm7b5', 'G7b9', 'Cm7', 'Cm7'] }] },
  { id: 'ex-251-cycle', title: 'ii–V–I · around the cycle, all 12 keys', tonic: 0, mode: 'major', bpb: 4, style: 'swing', bpm: 110,
    sections: [{ name: '', bars: cycle251() }] },
  { id: 'ex-turnaround', title: 'I–vi–ii–V turnaround', tonic: 0, mode: 'major', bpb: 4, style: 'swing', bpm: 104,
    sections: [{ name: '', bars: ['Cmaj7', 'Am7', 'Dm7', 'G7'] }] },
  { id: 'ex-blues', title: 'jazz blues in F', tonic: 5, mode: 'major', bpb: 4, style: 'swing', bpm: 120,
    sections: [{ name: '', bars: ['F7', 'Bb7', 'F7', 'Cm7 F7', 'Bb7', 'Bdim7', 'F7', 'Am7 D7', 'Gm7', 'C7', 'F7 D7', 'Gm7 C7'] }] },
  { id: 'ex-rhythm', title: 'rhythm changes · A section', tonic: 10, mode: 'major', bpb: 4, style: 'swing', bpm: 150,
    sections: [{ name: 'A', bars: ['Bbmaj7 G7', 'Cm7 F7', 'Dm7 G7', 'Cm7 F7', 'Fm7 Bb7', 'Ebmaj7 Edim7', 'Dm7 G7', 'Cm7 F7'] }] },
];
const LIBRARY = [...STD_CORE, ...STD_EXTRA];
const songById = id => EXERCISES.find(s => s.id === id) || LIBRARY.find(s => s.id === id) || null;

// pasted changes → a song: bars split on |, chords inside a bar share it evenly
function songFromPaste(text) {
  const bars = (text || '').split(/[|\n]/).map(b => b.trim()).filter(Boolean);
  const barStrs = [];
  for (const b of bars) {
    const toks = parseProgression(b).map(c => c.raw);
    if (toks.length) barStrs.push(toks.join(' '));
  }
  if (!barStrs.length) return null;
  const flat = parseProgression(barStrs.join(' ')).map(c => ({ root: c.root, quality: c.quality ?? '' }));
  const key = guessKey(flat) || { tonic: flat[0].root, mode: 'major' };
  return { id: 'paste', title: 'pasted changes', tonic: key.tonic, mode: key.mode, bpb: 4, style: 'swing', bpm: 110,
           sections: [{ name: '', bars: barStrs }] };
}

// ---------- state ----------
const st = {
  song: EXERCISES[0], keyChoice: 'original', transpose: 0, bpm: EXERCISES[0].bpm,
  drill: 'guide', mode: 'wait', view: 'pills', big: false, disp: 0,   // disp = written-pitch shift (B♭ +2, E♭ +9)
  bars: [], chords: [], totalBeats: 0, targets: [],
  idx: -1, session: null, chordStartedAt: 0, finalized: false,
  // in-time playback
  timer: null, formT0: 0, spb: 0, events: null, evIdx: 0, lap: 0, skipBefore: 0,
  // mic
  micPitch: null, micRun: 0, micGateUntil: 0,
  auditionTimer: null,
  stats: { chords: 0, passed: 0, hits: 0, misses: 0 },
};
let onStartCb = null;
let prevHeld = new Set();

function saveSettings() {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      drill: st.drill, mode: st.mode, view: st.view, big: st.big, disp: st.disp,
      songId: st.song.id, keyChoice: st.keyChoice,
    }));
  } catch (e) { /* private mode */ }
}
function loadSettings() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
}

// ---------- the form ----------
const keyTonic = () => mod12(st.song.tonic + st.transpose);
const keyObj = () => ({ tonic: keyTonic(), mode: st.song.mode });
const dispFlats = () => useFlats(mod12(keyTonic() + st.disp), st.song.mode);
const noteName = pc => pcName(mod12(pc + st.disp), dispFlats());
const qualText = q => q === '' ? '' : q;
const chordText = c => noteName(c.root) + qualText(c.quality);

function rollTranspose() {
  if (st.keyChoice === 'original') st.transpose = 0;
  else if (st.keyChoice === 'random') st.transpose = Math.floor(Math.random() * 12);
  else st.transpose = mod12(Number(st.keyChoice) - st.song.tonic);
}

// flatten the chart into bars + a chord sequence with absolute beats
function buildForm() {
  st.bars = flatBars(st.song).map(bar => ({
    section: bar.section,
    chords: bar.chords.map(c => ({ ...c, root: mod12(c.root + st.transpose) })),
  }));
  st.chords = [];
  let beat = 0;
  st.bars.forEach((bar, bi) => {
    for (const c of bar.chords) {
      st.chords.push({ root: c.root, quality: c.quality || '', beats: c.dur, bar: bi, startBeat: beat + c.beat });
    }
    beat += st.song.bpb;
  });
  st.totalBeats = beat;
  computeTargets();
}

function computeTargets() {
  const n = st.chords.length;
  if (st.drill === 'targets') st.targets = targetLine(st.chords);
  else st.targets = st.chords.map((c, i) => targetsFor(st.drill, c, { next: st.chords[(i + 1) % n] }));
}

// ---------- rendering ----------
function romanOf(c) {
  try { return analyzeFunction(c.root, c.quality, keyObj()).roman || ''; } catch (e) { return ''; }
}

function pillHtml(t, state) {
  return `<span class="bt ${state}"><b>${esc(noteName(t.pc))}</b><small>${esc(t.label)}${t.beat != null ? ` · ${t.beat + 1}` : ''}</small></span>`;
}

// a small staff: treble for lines, bass for the walking bass. Notes are
// spelled with the key's accidentals; ledger lines where needed; the interval
// label sits under each head — green once hit, red on a miss.
function staffSvg(targets, states, bass) {
  const S = 9, left = 34, gap = 34;
  const w = left + targets.length * gap + 12;
  const top = 34, bottom = top + 4 * S;
  const refStep = bass ? 18 : 30;          // bottom line: G2 on the bass staff, E4 on the treble
  const yOf = step => bottom - (step - refStep) * S / 2;
  const flats = dispFlats();
  let out = `<svg class="blow-staff" viewBox="0 0 ${w} ${bottom + 30}" width="${w}" height="${bottom + 30}" role="img" aria-label="staff">`;
  for (let i = 0; i < 5; i++) out += `<line class="sl" x1="4" x2="${w - 4}" y1="${top + i * S}" y2="${top + i * S}"/>`;
  out += `<text class="clef" x="6" y="${top - 8}">${bass ? 'bass' : 'treble'}</text>`;
  targets.forEach((t, i) => {
    const midi = t.midi + (bass ? 0 : st.disp);
    const name = letter(midi, flats);
    const step = (Math.floor(midi / 12) - 1) * 7 + 'CDEFGAB'.indexOf(name[0]);
    const cx = left + i * gap + 10, cy = yOf(step);
    for (let s = refStep - 2; s >= step; s -= 2) out += `<line class="sl" x1="${cx - 9}" x2="${cx + 9}" y1="${yOf(s)}" y2="${yOf(s)}"/>`;
    for (let s = refStep + 10; s <= step; s += 2) out += `<line class="sl" x1="${cx - 9}" x2="${cx + 9}" y1="${yOf(s)}" y2="${yOf(s)}"/>`;
    if (name.length > 1) out += `<text class="acc" x="${cx - 16}" y="${cy + 5}">${name[1] === 'b' ? '♭' : '♯'}</text>`;
    out += `<ellipse class="nh ${states[i] || ''}" cx="${cx}" cy="${cy}" rx="${S * 0.62}" ry="${S * 0.45}" transform="rotate(-20 ${cx} ${cy})"/>`;
    out += `<text class="lbl" x="${cx}" y="${bottom + 22}" text-anchor="middle">${esc(t.label)}</text>`;
  });
  return out + '</svg>';
}

function stateOf(i, flash) {
  const s = st.session;
  if (!s) return '';
  if (flash && flash.idx === i && flash.result === 'miss') return 'miss';
  if (s.hits.has(i)) return 'hit';
  if (s.ordered && s.nextIdx === i && !s.complete) return 'next';
  return '';
}

function renderTargets(flash) {
  const box = $('blow-targets');
  if (st.idx < 0) { box.innerHTML = ''; return; }
  const targets = st.targets[st.idx];
  const states = targets.map((_, i) => stateOf(i, flash));
  box.innerHTML = st.view === 'staff'
    ? staffSvg(targets, states, st.drill === 'bass')
    : targets.map((t, i) => pillHtml(t, states[i])).join('');
}

function renderFocus() {
  const chordEl = $('blow-chord'), romanEl = $('blow-roman');
  if (st.idx < 0) {
    chordEl.textContent = '—'; romanEl.textContent = '';
    $('blow-targets').innerHTML = '';
    $('blow-next-chord').textContent = ''; $('blow-next-targets').innerHTML = '';
    return;
  }
  const c = st.chords[st.idx];
  chordEl.textContent = chordText(c);
  romanEl.textContent = romanOf(c);
  renderTargets();
  const ni = (st.idx + 1) % st.chords.length;
  const nc = st.chords[ni];
  $('blow-next-chord').textContent = chordText(nc);
  const nt = st.targets[ni];
  $('blow-next-targets').innerHTML = st.view === 'staff'
    ? staffSvg(nt, nt.map(() => ''), st.drill === 'bass')
    : nt.map(t => pillHtml(t, '')).join('');
}

function renderChart() {
  const el = $('blow-chart');
  el.innerHTML = '';
  st.bars.forEach((bar, i) => {
    const d = document.createElement('div');
    d.className = 'std-bar';
    d.title = `bar ${i + 1} — start here`;
    if (bar.section) d.innerHTML += `<span class="sec">${esc(bar.section)}</span>`;
    for (const c of bar.chords) d.innerHTML += `<span class="ch">${esc(chordText({ root: c.root, quality: c.quality || '' }))}</span>`;
    d.onclick = () => startFromBar(i);
    el.appendChild(d);
  });
  paintChart();
}
function paintChart() {
  const cur = st.idx >= 0 ? st.chords[st.idx].bar : -1;
  $('blow-chart').querySelectorAll('.std-bar').forEach((el, i) => el.classList.toggle('playing', i === cur));
}

function renderInfo() {
  const d = DRILLS[st.drill];
  const key = pcName(mod12(keyTonic() + st.disp), dispFlats()) + (st.song.mode === 'minor' ? 'm' : '');
  $('blow-info').textContent = `${st.song.title} · ${key}${st.disp ? ' (written)' : ''} · ${st.bars.length} bars · ${d.label} — ${d.blurb}`;
}

function paintScore() {
  const s = st.stats;
  const notes = s.hits + s.misses;
  $('blow-score').textContent = s.chords || notes
    ? `lap ${st.lap + 1} · chords ${s.passed}/${s.chords} · notes ${notes ? Math.round(100 * s.hits / notes) : 0}%`
    : '';
}

function setHeard(text, cls) {
  const h = $('blow-heard');
  h.textContent = text;
  h.className = 'blow-heard' + (cls ? ' ' + cls : '');
}

function renderAll() { renderInfo(); renderChart(); renderFocus(); paintScore(); }

// ---------- chords: start / finish / advance ----------
function startChord(i, { sound = true } = {}) {
  st.idx = i;
  st.session = newChordSession(st.targets[i], DRILLS[st.drill].ordered);
  st.chordStartedAt = performance.now();
  st.finalized = false;
  const c = st.chords[i];
  if (sound) soundChord(c);
  const d = DRILLS[st.drill];
  setHeard(st.session.targets.length
    ? (d.ordered ? `play them in order — ${st.session.targets.length} notes` : `find ${st.session.targets.length === 1 ? 'the note' : 'all ' + st.session.targets.length}, any order`)
    : 'nothing to play on this chord — skip', '');
  renderFocus();
  paintChart();
  if (st.session.complete) setTimeout(() => { if (st.idx === i && st.mode === 'wait') finishAndAdvance(); }, 600);
}

function finishChord() {
  if (!st.session || st.finalized) return;
  st.finalized = true;
  const ok = chordPassed(st.session);
  st.stats.chords++;
  if (ok) st.stats.passed++;
  const c = st.chords[st.idx];
  record('blow', `${st.drill}:${qualityFamily(c.quality)}`, ok, { ms: performance.now() - st.chordStartedAt });
  paintScore();
}

function advance() {
  const n = st.chords.length;
  const next = (st.idx + 1) % n;
  if (next === 0) st.lap++;
  startChord(next);
}
function finishAndAdvance() { finishChord(); advance(); }

// one stab of the chord so you hear what you're playing over (wait mode)
function soundChord(c) {
  ensureCtx();
  const t = audioNow() + 0.03;
  let b = 36 + c.root; if (b > 43) b -= 12;
  playNoteAt(b, t, 1.6, 0.5);
  playChordAt(chordVoicing(c.root, c.quality).slice(1), t, 1.5, 0.26);
  st.micGateUntil = performance.now() + 900;     // don't grade the speakers
}

// ---------- input: played notes ----------
const MISS_NOUN = {
  root: 'the root', guide: 'a guide tone', targets: 'the target tone', arp: 'a chord tone',
  scale: 'in the scale', pent: 'in the pentatonic', upper: 'an upper-structure tone', bass: 'in the bass line',
};
function onNote(midi, source) {
  if (st.idx < 0 || !st.session || st.finalized && st.mode === 'wait') return;
  const s = st.session;
  const r = gradeNote(s, midi);
  const c = st.chords[st.idx];
  const name = noteName(midi);
  if (r.result === 'hit') {
    st.stats.hits++;
    const t = s.targets[r.idx];
    setHeard(`${name} ✓ ${t.label}${source === 'mic' ? ' (sung)' : ''}`, 'hit');
  } else if (r.result === 'miss') {
    st.stats.misses++;
    const due = s.ordered ? s.targets[s.nextIdx] : null;
    setHeard(due
      ? `heard ${name} — next is ${noteName(due.pc)} (${due.label})`
      : `heard ${name} — not ${MISS_NOUN[st.drill] || 'a target'} of ${chordText(c)}`, 'miss');
  } else {
    setHeard(`${name} again — already got it`, '');
  }
  renderTargets(r);
  paintScore();
  if (s.complete) {
    if (st.mode === 'wait') {
      setHeard(chordPassed(s) ? `✓ ${chordText(c)} — clean` : `✓ ${chordText(c)} — found them, ${s.misses} stray`, chordPassed(s) ? 'hit' : '');
      st.finalized = false;
      finishChord();
      setTimeout(() => { if (panelActive() && st.mode === 'wait' && st.finalized) advance(); }, 650);
    } else {
      setHeard(`✓ ${chordText(c)} — all found, keep going`, 'hit');
    }
  }
}

onHeldChange(notes => {
  const held = new Set(notes);
  if (panelActive() && st.idx >= 0) {
    for (const m of notes) if (!prevHeld.has(m)) onNote(m, 'keys');
  }
  prevHeld = held;
});

// mic: a sung note counts once it holds steady for a few frames; a new onset
// needs a different pitch or a breath of silence in between
const MIC_FRAMES = 6;
function onPitch(p) {
  if (!p) { st.micPitch = null; st.micRun = 0; return; }
  if (performance.now() < st.micGateUntil) return;
  if (p.midi === st.micPitch) {
    st.micRun++;
    if (st.micRun === MIC_FRAMES) onNote(p.midi, 'mic');
  } else {
    st.micPitch = p.midi; st.micRun = 1;
  }
  if (st.idx >= 0 && st.micRun < MIC_FRAMES) {
    const sign = p.cents >= 0 ? '+' : '';
    $('blow-mic-read').textContent = `${noteName(p.midi)} ${sign}${p.cents}¢`;
  }
}

async function toggleMic() {
  if (isMicOn()) { stopBlowMic(); return; }
  try {
    await startMic(onPitch, () => stopBlowMic());
    $('blow-mic').textContent = 'mic on'; $('blow-mic').classList.add('on');
    $('blow-mic-read').textContent = 'listening…';
  } catch (e) {
    $('blow-status').textContent = 'mic blocked — allow microphone access in the browser';
  }
}
function stopBlowMic() {
  if (isMicOn()) stopMic();
  const b = $('blow-mic');
  if (b) { b.textContent = 'enable mic'; b.classList.remove('on'); }
  const r = $('blow-mic-read'); if (r) r.textContent = '';
}

// ---------- in-time playback: comp the form, move with the beat ----------
function buildEvents() {
  const events = [];
  for (const c of st.chords) addComp(events, st.song.style, c.startBeat, c.beats, c.root, c.quality);
  events.sort((a, b) => a.t - b.t);
  return events;
}
function swung(t) {
  if (st.song.style !== 'swing') return t;
  const frac = t % 1;
  return Math.abs(frac - 0.5) < 0.01 ? t + 1 / 6 : t;
}
function fire(ev) {
  const when = st.formT0 + swung(ev.t) * st.spb;
  const dur = ev.dur * st.spb;
  if (ev.chord) playChordAt(ev.chord, when, dur, ev.vel);
  else playNoteAt(ev.midi, when, dur, ev.vel);
}
function chordAtBeat(beat) {
  for (let i = st.chords.length - 1; i >= 0; i--) if (st.chords[i].startBeat <= beat + 1e-6) return i;
  return 0;
}

function startPlayback(fromChord = 0) {
  stopPlayback();
  ensureCtx();
  if (onStartCb) onStartCb();
  st.spb = 60 / st.bpm;
  st.events = buildEvents(); st.evIdx = 0;
  const bpb = st.song.bpb;
  const countStart = audioNow() + 0.15;
  for (let i = 0; i < bpb; i++) clickAt(countStart + i * st.spb, i === 0);
  const startBeat = st.chords[fromChord].startBeat;
  st.formT0 = countStart + bpb * st.spb - startBeat * st.spb;   // where beat 0 of the form falls
  st.skipBefore = startBeat;                                     // first lap: nothing before the start bar
  st.idx = -1;
  $('blow-status').textContent = 'count-in…';
  $('blow-new').classList.add('on');
  $('blow-new').textContent = '↻ restart';
  st.timer = setInterval(() => {
    const now = audioNow();
    while (st.evIdx < st.events.length && st.formT0 + swung(st.events[st.evIdx].t) * st.spb < now + 0.35) {
      const ev = st.events[st.evIdx++];
      if (ev.t >= st.skipBefore - 1e-6) fire(ev);
    }
    let beat = (now - st.formT0) / st.spb;
    if (beat >= st.totalBeats) {                                 // next lap, seamlessly
      st.formT0 += st.totalBeats * st.spb;
      st.evIdx = 0; st.skipBefore = 0; st.lap++;
      beat -= st.totalBeats;
    }
    if (beat < st.skipBefore) return;                            // still counting in
    const i = chordAtBeat(beat);
    if (i !== st.idx) {
      if (st.idx >= 0) finishChord();
      startChord(i, { sound: false });
    }
    $('blow-status').textContent = `bar ${st.chords[i].bar + 1} / ${st.bars.length} · lap ${st.lap + 1}`;
  }, 50);
}

function stopPlayback() {
  if (st.timer) { clearInterval(st.timer); st.timer = null; }
  if (st.auditionTimer) { clearTimeout(st.auditionTimer); st.auditionTimer = null; }
  const b = $('blow-new');
  if (b) { b.classList.remove('on'); b.textContent = '▶ start'; }
  const s = $('blow-status'); if (s) s.textContent = '';
}

// ---------- the line, played for you ----------
function audition() {
  if (st.idx < 0) return;
  stopPlayback();
  ensureCtx();
  if (onStartCb) onStartCb();
  const c = st.chords[st.idx];
  const targets = st.targets[st.idx];
  const spb = 60 / Math.min(st.bpm, 120);
  const t0 = audioNow() + 0.1;
  const len = Math.max(c.beats, targets.length * 0.5 + 0.5) * spb;
  let b = 36 + c.root; if (b > 43) b -= 12;
  if (st.drill !== 'bass') playNoteAt(b, t0, len, 0.45);
  playChordAt(chordVoicing(c.root, c.quality).slice(1), t0, len, 0.22);
  const step = st.drill === 'bass' ? 1 : (targets.length > 4 ? 0.5 : 0.75);
  targets.forEach((t, i) => playNoteAt(t.midi, t0 + (t.beat != null ? t.beat : i * step) * spb, step * spb * 0.9, 0.85));
  st.micGateUntil = performance.now() + (len + 0.3) * 1000;
  $('blow-status').textContent = 'listen…';
  st.auditionTimer = setTimeout(() => { $('blow-status').textContent = ''; }, (len + 0.3) * 1000);
}

// ---------- transport ----------
function resetStats() { st.stats = { chords: 0, passed: 0, hits: 0, misses: 0 }; st.lap = 0; }

function start() {
  stopPlayback();
  if (!st.chords.length) return;
  resetStats();
  if (st.mode === 'time') { startPlayback(0); return; }
  if (onStartCb) onStartCb();
  st.lap = 0;
  startChord(0);
}
function startFromBar(bi) {
  const i = st.chords.findIndex(c => c.bar === bi);
  if (i < 0) return;
  if (st.mode === 'time') { startPlayback(i); return; }
  stopPlayback();
  if (onStartCb) onStartCb();
  startChord(i);
}
function skip() {
  if (st.idx < 0) return;
  if (st.mode === 'time') { startPlayback((st.idx + 1) % st.chords.length); return; }
  finishAndAdvance();
}
function stopBlow() {
  stopPlayback();
}

// ---------- settings ----------
function pickSong(id, pasted) {
  const song = pasted || songById(id) || EXERCISES[0];
  st.song = song;
  st.bpm = song.bpm || 110;
  $('blow-tempo').value = st.bpm; $('blow-bpm').textContent = `${st.bpm} bpm`;
  rollTranspose();
  reload();
}
function reload() {
  stopPlayback();
  st.idx = -1; st.session = null;
  resetStats();
  buildForm();
  renderAll();
  setHeard('press ▶ start', '');
  saveSettings();
}

function fillSelects() {
  const src = $('blow-source');
  const group = (label, songs) => {
    const g = document.createElement('optgroup'); g.label = label;
    for (const s of songs) { const o = document.createElement('option'); o.value = s.id; o.textContent = s.title; g.appendChild(o); }
    src.appendChild(g);
  };
  group('exercises', EXERCISES);
  group('standards library', [...LIBRARY].sort((a, b) => a.title.localeCompare(b.title)));
  const pg = document.createElement('optgroup'); pg.label = 'your own';
  const po = document.createElement('option'); po.value = 'paste'; po.textContent = 'paste changes…'; pg.appendChild(po);
  src.appendChild(pg);

  const key = $('blow-key');
  const addKey = (v, label) => { const o = document.createElement('option'); o.value = v; o.textContent = label; key.appendChild(o); };
  addKey('original', 'original key'); addKey('random', 'random key');
  for (let pc = 0; pc < 12; pc++) addKey(String(pc), `in ${NOTE_NAMES_SHARP[pc]}${[1, 3, 6, 8, 10].includes(pc) ? '/' + NOTE_NAMES_FLAT[pc] : ''}`);

  const drill = $('blow-drill');
  for (const [id, d] of Object.entries(DRILLS)) { const o = document.createElement('option'); o.value = id; o.textContent = d.label; drill.appendChild(o); }
}

function initBlow(opts = {}) {
  onStartCb = opts.onStart || null;
  if (!$('panel-blow')) return;
  fillSelects();
  const saved = loadSettings();
  if (saved.drill && DRILLS[saved.drill]) st.drill = saved.drill;
  if (saved.mode === 'time' || saved.mode === 'wait') st.mode = saved.mode;
  if (saved.view === 'staff' || saved.view === 'pills') st.view = saved.view;
  st.big = !!saved.big;
  if ([0, 2, 9].includes(saved.disp)) st.disp = saved.disp;
  if (saved.keyChoice) st.keyChoice = saved.keyChoice;
  const song = saved.songId && saved.songId !== 'paste' ? songById(saved.songId) : null;
  st.song = song || EXERCISES[0];

  $('blow-source').value = st.song.id;
  $('blow-key').value = st.keyChoice;
  $('blow-drill').value = st.drill;
  $('blow-mode').value = st.mode;
  $('blow-view').value = st.view;
  $('blow-instrument').value = String(st.disp);
  $('blow-big').checked = st.big;
  $('blow-focus').classList.toggle('big', st.big);

  $('blow-source').addEventListener('change', e => {
    const v = e.target.value;
    $('blow-paste-row').hidden = v !== 'paste';
    if (v === 'paste') { const s = songFromPaste($('blow-paste').value); if (s) pickSong(null, s); return; }
    pickSong(v);
  });
  $('blow-paste-use').addEventListener('click', () => {
    const s = songFromPaste($('blow-paste').value);
    if (!s) { $('blow-status').textContent = 'no chords found — try  Dm7 G7 | Cmaj7'; return; }
    $('blow-source').value = 'paste';
    pickSong(null, s);
  });
  $('blow-key').addEventListener('change', e => { st.keyChoice = e.target.value; rollTranspose(); reload(); });
  $('blow-drill').addEventListener('change', e => { st.drill = e.target.value; reload(); });
  $('blow-mode').addEventListener('change', e => { st.mode = e.target.value; reload(); });
  $('blow-view').addEventListener('change', e => { st.view = e.target.value; saveSettings(); renderFocus(); });
  $('blow-instrument').addEventListener('change', e => { st.disp = Number(e.target.value); saveSettings(); renderAll(); });
  $('blow-big').addEventListener('change', e => { st.big = e.target.checked; $('blow-focus').classList.toggle('big', st.big); saveSettings(); });
  $('blow-tempo').addEventListener('input', e => { st.bpm = Number(e.target.value); $('blow-bpm').textContent = `${st.bpm} bpm`; });
  $('blow-new').addEventListener('click', start);
  $('blow-stop').addEventListener('click', () => { stopPlayback(); });
  $('blow-skip').addEventListener('click', skip);
  $('blow-hear').addEventListener('click', audition);
  $('blow-mic').addEventListener('click', toggleMic);

  $('blow-paste-row').hidden = true;
  rollTranspose();
  buildForm();
  renderAll();
  setHeard('press ▶ start', '');
}

export { initBlow, stopBlow, stopBlowMic, EXERCISES, songFromPaste };
