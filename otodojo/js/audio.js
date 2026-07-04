// audio.js — the otolab Web Audio piano-ish synth, unchanged in spirit:
// triangle + octave sine through a lowpass, fast attack, long-ish decay.

let ctx = null;
let master = null;
const voices = new Map(); // midi -> { stop() }

function ensureCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function midiToFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function noteOn(midi, velocity = 0.8) {
  ensureCtx();
  noteOff(midi, true);

  const t = ctx.currentTime;
  const freq = midiToFreq(midi);
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = Math.min(8000, 1200 + velocity * 5000 + freq);
  filter.Q.value = 0.5;

  const osc1 = ctx.createOscillator();
  osc1.type = 'triangle';
  osc1.frequency.value = freq;
  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.value = freq * 2;
  const osc2gain = ctx.createGain();
  osc2gain.gain.value = 0.25;

  osc1.connect(filter);
  osc2.connect(osc2gain).connect(filter);
  filter.connect(gain).connect(master);

  const peak = 0.28 * velocity;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(peak * 0.35, t + 0.6);
  gain.gain.exponentialRampToValueAtTime(peak * 0.18, t + 2.5);

  osc1.start(t); osc2.start(t);

  voices.set(midi, {
    stop(now = false) {
      const rt = ctx.currentTime;
      gain.gain.cancelScheduledValues(rt);
      gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), rt);
      gain.gain.exponentialRampToValueAtTime(0.0001, rt + (now ? 0.02 : 0.25));
      osc1.stop(rt + 0.3); osc2.stop(rt + 0.3);
    },
  });
}

function noteOff(midi, immediate = false) {
  const v = voices.get(midi);
  if (v) { v.stop(immediate); voices.delete(midi); }
}

function playChord(midiNotes, dur = 1.4, velocity = 0.7) {
  ensureCtx();
  for (const m of midiNotes) noteOn(m, velocity);
  setTimeout(() => midiNotes.forEach(m => noteOff(m)), dur * 1000);
}

function allNotesOff() {
  for (const m of [...voices.keys()]) noteOff(m, true);
}

export { noteOn, noteOff, playChord, allNotesOff, ensureCtx };
