// solo.js — the solo-transcription room. Pulling a single line off a record —
// a Bird solo, a bass riff, a melody — is the central jazz-learning activity,
// and it's a different job from transcribing changes: one note at a time,
// placed in time, understood *against the harmony underneath it*.
//
// The app already knows the chord under the playhead (the logged progression)
// and the key, so every note you log gets placed on a piano-roll over its chord
// and labeled with its role — chord tone, tension, or approach note. That
// note-vs-chord reading is the whole point: it teaches you to hear a line as
// chord tones + tensions + approaches, not just a string of pitches.

import player from './player.js';
import { onHeldChange } from './input.js';
import { playNoteAt, audioNow, ensureCtx } from './audio.js';
import {
  midiName, useFlats, scaleDegree, noteVsChord, chordLabel,
} from './theory.js';
import { startMic, stopMic, isMicOn } from './pitch.js';

const $ = sel => document.querySelector(sel);
const ROLL_H = 172, PX_PER_SEC = 82, NOTE_W = 30;

let deps = null;       // { getKey, getChords, getNotes, setNotes, onStart }
let curNote = null;    // last single note seen on keyboard/MIDI (sticky)
let micMidi = null, micRun = 0, micCents = 0;
let alongOn = false, lastAlongIdx = -1;
let playTimer = null;

const notes = () => deps.getNotes();
const flats = () => useFlats(deps.getKey().tonic, deps.getKey().mode);

// the logged chord sounding at time t (last chord whose onset is ≤ t)
function chordAt(t) {
  const cs = deps.getChords();
  let cur = null;
  for (const c of cs) if (c.t <= t + 0.02) cur = c; else break;
  return cur;
}

// full analysis of one note (midi) at time t: pitch name, scale degree in key,
// and — if a chord is logged there — its role over that chord.
function analyzeNote(midi, t) {
  const key = deps.getKey();
  const pc = ((midi % 12) + 12) % 12;
  const sd = scaleDegree(pc, key);
  const chord = chordAt(t);
  const out = { name: midiName(midi, flats()), deg: sd.deg, inKey: sd.inKey, role: null };
  if (chord) {
    const nv = noteVsChord(pc, chord);
    out.role = nv.role;
    out.over = nv.label;
    out.chord = chordLabel(chord.root, chord.quality, null, flats() || nv.label.startsWith('b'));
  }
  return out;
}

// ---------- readout (live, as you play or hum) ----------

function paintReadout(midi, cents = null) {
  const el = $('#solo-detected');
  if (midi == null) { el.textContent = '—'; el.className = 'solo-detected'; return; }
  const a = analyzeNote(midi, player.isReady ? player.time() : 0);
  const tune = cents != null ? ` ${cents >= 0 ? '+' : ''}${cents}¢` : '';
  const over = a.over ? ` · ${a.over} of ${a.chord}` : '';
  el.textContent = `${cents != null ? '🎤 ' : ''}${a.name}${tune} · ${a.deg} in key${over}`;
  el.className = 'solo-detected' + (a.role ? ` role-${a.role}` : '');
}

onHeldChange(held => {
  if (held.length === 1) { curNote = held[0]; paintReadout(curNote); }
  // 2+ notes is a chord, not a line — leave curNote sticky for logging
});

// ---------- logging ----------

function logNote() {
  const midi = curNote;
  if (midi == null || !player.isReady) return;
  const arr = [...notes(), { t: player.time(), midi }].sort((a, b) => a.t - b.t);
  deps.setNotes(arr);
  render();
}

// ---------- piano-roll render ----------

function render() {
  if (!deps) return;
  const el = $('#solo-roll');
  el.innerHTML = '';
  const ns = notes();
  if (!ns.length) {
    el.innerHTML = '<div class="empty">No notes yet — play or hum a note and press '
      + '<b>n</b> to log it at the playhead.</div>';
    paintSummary();
    return;
  }
  const t0 = Math.min(ns[0].t, deps.getChords()[0]?.t ?? ns[0].t);
  const lastT = ns[ns.length - 1].t;
  const span = Math.max(4, lastT - t0 + 1.5);
  const midis = ns.map(n => n.midi);
  const hi = Math.max(...midis) + 2, lo = Math.min(...midis) - 2;
  const rowH = ROLL_H / (hi - lo + 1);
  const x = t => (t - t0) * PX_PER_SEC;

  const canvas = document.createElement('div');
  canvas.className = 'solo-canvas';
  canvas.style.width = Math.max(el.clientWidth || 600, x(t0 + span)) + 'px';
  canvas.style.height = ROLL_H + 'px';

  // faint chord bands underneath — the harmony the line sits on
  const cs = deps.getChords();
  cs.forEach((c, i) => {
    const end = i + 1 < cs.length ? cs[i + 1].t : lastT + 1.5;
    if (end < t0) return;
    const band = document.createElement('div');
    band.className = 'solo-band';
    band.style.left = x(Math.max(c.t, t0)) + 'px';
    band.style.width = Math.max(2, x(end) - x(Math.max(c.t, t0))) + 'px';
    const lbl = document.createElement('span');
    lbl.textContent = chordLabel(c.root, c.quality, null, flats());
    band.appendChild(lbl);
    canvas.appendChild(band);
  });

  ns.forEach((n, i) => {
    const a = analyzeNote(n.midi, n.t);
    const b = document.createElement('div');
    b.className = 'solo-note' + (a.role ? ` role-${a.role}` : '');
    b.style.left = x(n.t) + 'px';
    b.style.top = (a.name && (hi - n.midi) * rowH) + 'px';
    b.style.width = NOTE_W + 'px';
    b.style.height = Math.max(12, rowH - 2) + 'px';
    b.title = `${a.name} · ${a.deg} in key`
      + (a.over ? ` · ${a.over} of ${a.chord}` : ' · (log the changes to place it on a chord)');
    b.innerHTML = `<span class="lbl">${a.over || a.deg}</span>`;
    b.addEventListener('click', e => {
      if (e.shiftKey) {
        deps.setNotes(notes().filter((_, j) => j !== i));
        render();
        return;
      }
      player.seek(n.t); player.play();
      playNoteAt(n.midi, audioNow() + 0.02, 0.5, 0.8);
    });
    canvas.appendChild(b);
  });

  el.appendChild(canvas);
  paintSummary();
}

function paintSummary() {
  const el = $('#solo-summary');
  const ns = notes();
  if (!ns.length) { el.textContent = ''; return; }
  const roles = { chord: 0, tension: 0, approach: 0, none: 0 };
  for (const n of ns) { const a = analyzeNote(n.midi, n.t); roles[a.role || 'none']++; }
  const withChord = ns.length - roles.none;
  if (!withChord) {
    el.textContent = `${ns.length} notes · log the changes above to see how the line sits on them · shift-click a note to delete`;
    return;
  }
  const pct = k => Math.round(100 * roles[k] / withChord);
  el.innerHTML = `${ns.length} notes · <span class="tag-diatonic">${pct('chord')}% chord tones</span> · `
    + `<span class="tag-secondary">${pct('tension')}% tensions</span> · `
    + `<span class="tag-outside">${pct('approach')}% approach</span>`
    + `<span class="grade-legend">shift-click a note to delete</span>`;
}

// ---------- playback ----------

function stopLine() {
  if (playTimer) { clearTimeout(playTimer); playTimer = null; }
  $('#solo-play').classList.remove('on');
}

function playLine() {
  if (playTimer) { stopLine(); return; }
  const ns = notes();
  if (!ns.length) return;
  ensureCtx();
  if (deps.onStart) deps.onStart();
  $('#solo-play').classList.add('on');
  const t0 = ns[0].t;
  let i = 0;
  const step = () => {
    if (i >= ns.length) { stopLine(); return; }
    const n = ns[i];
    const gap = i + 1 < ns.length ? Math.min(ns[i + 1].t - n.t, 2) : 0.5;
    playNoteAt(n.midi, audioNow() + 0.02, Math.max(0.18, gap * 0.95), 0.85);
    document.querySelectorAll('#solo-roll .solo-note').forEach((el, j) =>
      el.classList.toggle('playing', j === i));
    i++;
    playTimer = setTimeout(step, Math.max(140, gap * 1000));
  };
  step();
}

// sound each note as the video playhead reaches it
player.onTick(t => {
  if (!alongOn) return;
  const ns = notes();
  let cur = -1;
  for (let i = 0; i < ns.length; i++) if (ns[i].t <= t) cur = i;
  if (cur !== lastAlongIdx) {
    if (cur >= 0 && player.playing()) playNoteAt(ns[cur].midi, audioNow() + 0.01, 0.4, 0.7);
    lastAlongIdx = cur;
  }
  document.querySelectorAll('#solo-roll .solo-note').forEach((el, i) =>
    el.classList.toggle('now', i === cur));
});

// ---------- mic: hum to note ----------

function stopSoloMic() {
  if (isMicOn()) stopMic();
  micMidi = null; micRun = 0;
  $('#solo-mic').classList.remove('on');
}

async function toggleMic() {
  if (isMicOn()) { stopSoloMic(); paintReadout(curNote); return; }
  try {
    await startMic(p => {
      if (!p) { micRun = 0; return; }
      if (p.midi === micMidi) micRun++;
      else { micMidi = p.midi; micRun = 1; }
      micCents = p.cents;
      if (micRun >= 3) { curNote = p.midi; paintReadout(p.midi, p.cents); }
    }, () => { $('#solo-mic').classList.remove('on'); });
    $('#solo-mic').classList.add('on');
  } catch (e) {
    $('#solo-detected').textContent = 'mic blocked — allow microphone access to hum notes';
  }
}

// ---------- wiring ----------

function initSolo(d) {
  deps = d;
  $('#solo-log').addEventListener('click', logNote);
  $('#solo-mic').addEventListener('click', toggleMic);
  $('#solo-play').addEventListener('click', playLine);
  $('#solo-clear').addEventListener('click', () => {
    if (notes().length && confirm('Delete every logged note in the solo line?')) {
      deps.setNotes([]); render();
    }
  });
  $('#solo-along').addEventListener('click', () => {
    alongOn = !alongOn;
    ensureCtx();
    $('#solo-along').classList.toggle('on', alongOn);
    $('#solo-along').textContent = 'along: ' + (alongOn ? 'on' : 'off');
  });
  render();
}

export { initSolo, logNote as soloLog, render as refreshSolo, stopLine as stopSolo, stopSoloMic };
