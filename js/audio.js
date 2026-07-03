// audio.js — a small Web Audio synth so you can check what you play against
// the recording. Several voices are available (pick one in ⚙ settings): a few
// oscillator patches (piano, e-piano, organ, brass, strings, music box) and a
// Karplus-Strong plucked string for the guitar.

let ctx = null;
let master = null;
const voices = new Map(); // midi -> { stop() }

let masterVol = 0.5;

function ensureCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = masterVol;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function setMasterVolume(v) {
  masterVol = Math.min(1, Math.max(0, v));
  if (master) master.gain.value = masterVol;
}

function midiToFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function osc(type, freq, detune = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  if (detune) o.detune.value = detune;
  return o;
}

// ---------- voice builders ----------
// Each builds a note graph connected to `master` and returns
// { gain, oscs, rel }: the output gain (release rides on it), every source
// node that needs stopping, and the release time in seconds.

// felt-ish piano: triangle + quiet octave sine through a velocity-tracking
// lowpass, fast attack, long two-stage decay
function buildPiano(freq, vel, t) {
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = Math.min(8000, 1200 + vel * 5000 + freq);
  filter.Q.value = 0.5;

  const o1 = osc('triangle', freq);
  const o2 = osc('sine', freq * 2);
  const o2gain = ctx.createGain();
  o2gain.gain.value = 0.25;

  o1.connect(filter);
  o2.connect(o2gain).connect(filter);
  filter.connect(gain).connect(master);

  const peak = 0.28 * vel;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(peak * 0.35, t + 0.6);
  gain.gain.exponentialRampToValueAtTime(peak * 0.18, t + 2.5);

  o1.start(t); o2.start(t);
  return { gain, oscs: [o1, o2], rel: 0.25 };
}

// Rhodes-ish: sine body plus a bright "tine" partial that dies fast and a
// touch of octave bark — the tine level rides velocity, like the real thing
function buildEPiano(freq, vel, t) {
  const gain = ctx.createGain();
  gain.connect(master);

  const body = osc('sine', freq);
  body.connect(gain);

  const tineOsc = osc('sine', freq * 4);
  const tine = ctx.createGain();
  tine.gain.setValueAtTime(0.3 * vel, t);
  tine.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  tineOsc.connect(tine).connect(gain);

  const barkOsc = osc('sine', freq * 2);
  const bark = ctx.createGain();
  bark.gain.setValueAtTime(0.12, t);
  bark.gain.exponentialRampToValueAtTime(0.005, t + 1.2);
  barkOsc.connect(bark).connect(gain);

  const peak = 0.3 * vel;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + 0.005);
  gain.gain.exponentialRampToValueAtTime(peak * 0.4, t + 1.0);
  gain.gain.exponentialRampToValueAtTime(peak * 0.12, t + 4);

  const oscs = [body, tineOsc, barkOsc];
  oscs.forEach(o => o.start(t));
  return { gain, oscs, rel: 0.25 };
}

// drawbar organ: additive sines on the harmonic series, tiny alternating
// detune for chorus, slow tremolo, full sustain until release
function buildOrgan(freq, vel, t) {
  const gain = ctx.createGain();
  gain.connect(master);

  const drawbars = [[1, 0.32], [2, 0.2], [3, 0.11], [4, 0.08], [6, 0.05], [8, 0.04]];
  const oscs = [];
  drawbars.forEach(([h, level], i) => {
    const o = osc('sine', freq * h, i % 2 ? 3 : -3);
    const g = ctx.createGain();
    g.gain.value = level;
    o.connect(g).connect(gain);
    oscs.push(o);
  });

  const peak = (0.35 + 0.4 * vel) * 0.5; // organs barely care about velocity
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + 0.02);

  const lfo = osc('sine', 5.6);
  const trem = ctx.createGain();
  trem.gain.value = peak * 0.08;
  lfo.connect(trem).connect(gain.gain);
  oscs.push(lfo);

  oscs.forEach(o => o.start(t));
  return { gain, oscs, rel: 0.09 };
}

// plucked string via Karplus-Strong: a noise burst circulating a delay line
// with a damping average, rendered into a buffer. Highs die first and low
// notes ring longer, like a real string.
function buildGuitar(freq, vel, t) {
  const sr = ctx.sampleRate;
  const N = Math.max(2, Math.round(sr / freq));
  const dur = Math.min(4, 0.8 + 440 / freq);
  const len = Math.floor(sr * dur);
  const buf = ctx.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);

  const ring = new Float32Array(N);
  for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
  let prev = ring[N - 1]; // soften the pluck: one lowpass pass over the burst
  for (let i = 0; i < N; i++) { const cur = ring[i]; ring[i] = (cur + prev) / 2; prev = cur; }

  const damp = 0.996;
  let idx = 0;
  for (let i = 0; i < len; i++) {
    const cur = ring[idx];
    const nxt = ring[(idx + 1) % N];
    data[i] = cur;
    ring[idx] = damp * 0.5 * (cur + nxt);
    idx = (idx + 1) % N;
  }

  const src = ctx.createBufferSource();
  src.buffer = buf;
  const body = ctx.createBiquadFilter();
  body.type = 'lowpass';
  body.frequency.value = 2500 + vel * 3000;
  const gain = ctx.createGain();
  gain.gain.value = 0.45 * vel;
  src.connect(body).connect(gain).connect(master);
  src.start(t);
  return { gain, oscs: [src], rel: 0.12 };
}

// brass section: detuned saws with the filter blooming open over the attack
// (the "blat"), late vibrato, sustained until release
function buildBrass(freq, vel, t) {
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(freq * 1.5 + 200, t);
  filter.frequency.exponentialRampToValueAtTime(Math.min(6000, freq * 4 + 1200), t + 0.12);
  filter.connect(gain).connect(master);

  const o1 = osc('sawtooth', freq, -6);
  const o2 = osc('sawtooth', freq, 6);
  o1.connect(filter); o2.connect(filter);

  const lfo = osc('sine', 5);
  const vib = ctx.createGain();
  vib.gain.setValueAtTime(0, t);
  vib.gain.linearRampToValueAtTime(freq * 0.005, t + 0.6); // vibrato fades in
  lfo.connect(vib);
  vib.connect(o1.frequency); vib.connect(o2.frequency);

  const peak = 0.15 * vel;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(peak, t + 0.06);
  gain.gain.linearRampToValueAtTime(peak * 0.85, t + 0.3);

  const oscs = [o1, o2, lfo];
  oscs.forEach(o => o.start(t));
  return { gain, oscs, rel: 0.2 };
}

// string pad: three detuned saws under a dark lowpass, slow bow-like attack,
// long release — good for hearing how the harmony hangs together
function buildStrings(freq, vel, t) {
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1800 + vel * 1200;
  filter.Q.value = 0.3;
  filter.connect(gain).connect(master);

  const oscs = [-10, 4, 11].map(d => {
    const o = osc('sawtooth', freq, d);
    o.connect(filter);
    return o;
  });

  const peak = 0.11 * vel;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(peak, t + 0.3);

  oscs.forEach(o => o.start(t));
  return { gain, oscs, rel: 0.6 };
}

// music box: sparkly sine an octave up with a fast-dying inharmonic partial,
// instant attack, natural decay
function buildMusicBox(freq, vel, t) {
  const gain = ctx.createGain();
  gain.connect(master);

  const f = freq * 2;
  const o1 = osc('sine', f);
  o1.connect(gain);
  const o2 = osc('sine', f * 4.06); // slightly off-harmonic, like struck metal
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.2, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  o2.connect(g2).connect(gain);

  const peak = 0.3 * vel;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);

  o1.start(t); o2.start(t);
  return { gain, oscs: [o1, o2], rel: 0.1 };
}

const VOICE_DEFS = {
  piano:    { label: 'piano',     build: buildPiano },
  epiano:   { label: 'e-piano',   build: buildEPiano },
  organ:    { label: 'organ',     build: buildOrgan },
  guitar:   { label: 'guitar',    build: buildGuitar },
  brass:    { label: 'brass',     build: buildBrass },
  strings:  { label: 'strings',   build: buildStrings },
  musicbox: { label: 'music box', build: buildMusicBox },
};

const VOICES = Object.entries(VOICE_DEFS).map(([id, d]) => ({ id, label: d.label }));

let currentVoice = 'piano';

function setVoice(id) {
  if (VOICE_DEFS[id]) currentVoice = id;
}

function getVoice() {
  return currentVoice;
}

// ---------- note lifecycle ----------

function noteOn(midi, velocity = 0.8) {
  ensureCtx();
  noteOff(midi, true);

  const t = ctx.currentTime;
  const v = VOICE_DEFS[currentVoice].build(midiToFreq(midi), velocity, t);

  voices.set(midi, {
    stop(now = false) {
      const rt = ctx.currentTime;
      v.gain.gain.cancelScheduledValues(rt);
      v.gain.gain.setValueAtTime(Math.max(v.gain.gain.value, 0.0001), rt);
      v.gain.gain.exponentialRampToValueAtTime(0.0001, rt + (now ? 0.02 : v.rel));
      v.oscs.forEach(o => o.stop(rt + (now ? 0.05 : v.rel + 0.1)));
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

export {
  noteOn, noteOff, playChord, allNotesOff, ensureCtx,
  VOICES, setVoice, getVoice, setMasterVolume,
};
