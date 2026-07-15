// input.js — the three ways to "play": Web MIDI (your 25/27-key controller),
// the computer keyboard as a piano, and the on-screen keyboard.
// All three feed one shared held-note set; app.js subscribes to changes.

import { noteOn, noteOff } from './audio.js';

const held = new Set();          // midi numbers currently down
let changeListeners = [];

function onHeldChange(fn) { changeListeners.push(fn); }
function emit() { const notes = [...held]; changeListeners.forEach(fn => fn(notes)); }

function pressNote(midi, velocity = 0.8) {
  if (held.has(midi)) return;
  held.add(midi);
  noteOn(midi, velocity);
  emit();
}

function releaseNote(midi) {
  if (!held.delete(midi)) return;
  noteOff(midi);
  emit();
}

function heldNotes() { return [...held]; }

// ---- Web MIDI ----

let midiAccess = null;

async function connectMidi(statusEl) {
  if (!navigator.requestMIDIAccess) {
    statusEl.textContent = 'Web MIDI not supported in this browser (use Chrome/Edge).';
    return;
  }
  try {
    midiAccess = await navigator.requestMIDIAccess({ sysex: false });
  } catch (e) {
    statusEl.textContent = 'MIDI permission denied.';
    return;
  }
  const attach = () => {
    let names = [];
    for (const input of midiAccess.inputs.values()) {
      input.onmidimessage = handleMidiMessage;
      names.push(input.name);
    }
    statusEl.textContent = names.length
      ? `MIDI: ${names.join(', ')}`
      : 'MIDI connected — no devices found (plug in your keyboard).';
  };
  midiAccess.onstatechange = attach;
  attach();
}

// sustain-pedal (CC64) subscribers — the synth holds notes & opens the
// sympathetic-resonance bank while the pedal is down
const pedalListeners = [];
function onPedal(fn) { pedalListeners.push(fn); }

function handleMidiMessage(msg) {
  const [status, note, vel] = msg.data;
  const cmd = status & 0xf0;
  if (cmd === 0x90 && vel > 0) pressNote(note, vel / 127);
  else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) releaseNote(note);
  else if (cmd === 0xb0 && note === 64) pedalListeners.forEach(fn => fn(vel >= 64));
}

// ---- Computer keyboard as piano (Ableton-style) ----

const KEY_TO_SEMITONE = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11,
  k: 12, o: 13, l: 14, p: 15, ';': 16, "'": 17,
};

let kbOctave = 4; // A key = C4 (midi 60)
const kbDown = new Map(); // physical key -> midi it triggered

function kbBase() { return (kbOctave + 1) * 12; }

function isTypingTarget(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}

function initComputerKeyboard(onOctaveChange) {
  window.addEventListener('keydown', e => {
    if (isTypingTarget(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'z') { kbOctave = Math.max(1, kbOctave - 1); onOctaveChange(kbOctave); return; }
    if (k === 'x') { kbOctave = Math.min(7, kbOctave + 1); onOctaveChange(kbOctave); return; }
    if (k in KEY_TO_SEMITONE && !e.repeat && !kbDown.has(k)) {
      const midi = kbBase() + KEY_TO_SEMITONE[k];
      kbDown.set(k, midi);
      pressNote(midi);
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    const midi = kbDown.get(k);
    if (midi !== undefined) { kbDown.delete(k); releaseNote(midi); }
  });
  window.addEventListener('blur', () => {
    for (const midi of kbDown.values()) releaseNote(midi);
    kbDown.clear();
  });
}

// ---- On-screen piano ----

const PIANO_LOW = 48;  // C3
const PIANO_HIGH = 83; // B5

function buildPiano(container) {
  const isBlack = pc => [1, 3, 6, 8, 10].includes(pc);
  const whites = [];
  for (let m = PIANO_LOW; m <= PIANO_HIGH; m++) if (!isBlack(m % 12)) whites.push(m);
  const whiteW = 100 / whites.length;

  for (let i = 0; i < whites.length; i++) {
    const key = document.createElement('div');
    key.className = 'pkey white';
    key.dataset.midi = whites[i];
    key.style.left = (i * whiteW) + '%';
    key.style.width = whiteW + '%';
    if (whites[i] % 12 === 0) {
      const lbl = document.createElement('span');
      lbl.textContent = 'C' + (Math.floor(whites[i] / 12) - 1);
      key.appendChild(lbl);
    }
    container.appendChild(key);
  }
  for (let i = 0; i < whites.length; i++) {
    const next = whites[i] + 1;
    if (next <= PIANO_HIGH && isBlack(next % 12)) {
      const key = document.createElement('div');
      key.className = 'pkey black';
      key.dataset.midi = next;
      key.style.left = (i * whiteW + whiteW * 0.65) + '%';
      key.style.width = (whiteW * 0.7) + '%';
      container.appendChild(key);
    }
  }

  let mouseDownNote = null;
  const down = el => {
    const midi = Number(el.dataset.midi);
    mouseDownNote = midi;
    pressNote(midi);
  };
  const up = () => {
    if (mouseDownNote !== null) { releaseNote(mouseDownNote); mouseDownNote = null; }
  };
  container.addEventListener('pointerdown', e => {
    const el = e.target.closest('.pkey');
    if (el) { e.preventDefault(); down(el); }
  });
  window.addEventListener('pointerup', up);
  container.addEventListener('pointerleave', up);
}

function paintPiano(container, notes, flash = []) {
  const active = new Set(notes);
  const flashSet = new Set(flash);
  container.querySelectorAll('.pkey').forEach(el => {
    const m = Number(el.dataset.midi);
    el.classList.toggle('active', active.has(m));
    el.classList.toggle('flash', flashSet.has(m));
  });
}

export {
  onHeldChange, heldNotes, pressNote, releaseNote, onPedal,
  connectMidi, initComputerKeyboard, buildPiano, paintPiano,
};
