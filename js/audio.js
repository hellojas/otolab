// audio.js — a small Web Audio synth so you can check what you play against
// the recording. Several voices are available (pick one in ⚙ settings): a
// physically-modeled acoustic piano (the default — see buildModelPiano), a few
// oscillator patches (e-piano, organ, brass, strings, music box) and a
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
    // safety limiter: transparent below −6 dB, then clamps hard — a stacked
    // chord (or any future bug) saturates gracefully instead of clipping the
    // DAC into a screech
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 4;
    limiter.ratio.value = 16;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    master.connect(limiter).connect(ctx.destination);
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

// ---------- modeled acoustic piano (Pianoteq-style, in miniature) ----------
// No samples: each note is *modeled* and rendered once into a cached stereo
// AudioBuffer. v2 folds in the phenomena Modartt lists for Pianoteq plus the
// piano-acoustics literature (Weinreich's coupled strings, Railsback stretch,
// Conklin's longitudinal modes):
//   · stiff-string INHARMONICITY — partial n at f·n·√(1+B·n²); the sharpened
//     uppers are the strongest single "real piano" cue.
//   · STRIKE-POINT comb (hammer ≈ 1/8 along the string) shaping amplitudes,
//     with velocity → brightness (hammer-felt compression as a spectral tilt).
//   · DETUNED UNISONS (1/2/3 strings by register) — real-unison beating.
//   · TWO-STAGE, PER-PARTIAL DECAY — bright prompt sound, long aftersound.
//   · SOUNDBOARD RADIATION — a board can't radiate 27 Hz, so the deep bass
//     fundamental is weak and the note is heard through partials 2–5 (this is
//     what keeps modeled bass "woody" instead of "subby"), plus per-partial
//     spectral RIPPLE (±3.5 dB) from board resonances — smooth spectra are the
//     synth giveaway.
//   · LONGITUDINAL string modes in the bass — the metallic growl in a hard-hit
//     low note, excited nonlinearly (amp ∝ vel²).
//   · DUPLEX-SCALE shimmer in the treble — quiet, long-ringing halo partials
//     from the undamped string segments beyond the bridge.
//   · RAILSBACK STRETCH tuning — octaves tuned to the inharmonic partials, so
//     treble runs sharp and bass flat, exactly like a tuned grand.
//   · STEREO — bass strings left, treble right (player perspective), unisons
//     spread a touch, and a modal wooden-soundboard convolver for body.
// Three voicing presets caricature famous grands: classic (Steinway-ish,
// balanced/singing), warm (Bösendorfer-ish, darker, wider unisons, longer
// ring), bright (Yamaha-ish, harder hammers, cleaner attack).

// hammerMul scales the felt contact time: softer felt (warm) stays on the
// string longer = darker; harder felt (bright) leaves sooner = brighter.
const PIANO_TONES = {
  classic: { hammerMul: 1.0,  pAdd: 0,     detMul: 1.0,  thumpMul: 1.0,  tauMul: 1.0,  stretchMul: 1.0 },
  warm:    { hammerMul: 1.4,  pAdd: 0.25,  detMul: 1.25, thumpMul: 1.1,  tauMul: 1.12, stretchMul: 0.9 },
  bright:  { hammerMul: 0.7,  pAdd: -0.2,  detMul: 0.85, thumpMul: 1.05, tauMul: 0.94, stretchMul: 1.1 },
};
let pianoTone = 'classic';
function setPianoTone(id) { if (PIANO_TONES[id]) pianoTone = id; }
function getPianoTone() { return pianoTone; }

const pianoCache = new Map(); // `${midi}|${velBucket}|${tone}` -> AudioBuffer
const PIANO_CACHE_MAX = 36;
const PIANO_VELS = [0.35, 0.62, 0.88]; // render velocities per bucket

// deterministic per-(note,partial) hash in [0,1) — the same note always gets
// the same spectral ripple, so repeats sound like the same instrument
function pHash(a, b, c = 0) {
  const x = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
  return x - Math.floor(x);
}

// Railsback curve: stretch derived from where a tuner actually puts octaves
// (matching inharmonic partial 2 of the lower note) — treble sharp, bass flat.
function railsback(midi) {
  const dev = 13 * Math.pow((midi - 66) / 24, 3);
  return Math.max(-18, Math.min(18, dev)); // cents
}

let soundboard = null; // shared { input } — modal wooden-body convolver
function getSoundboard() {
  if (soundboard) return soundboard;
  const sr = ctx.sampleRate, len = Math.floor(sr * 1.1);
  const ir = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    // a wooden board is a bank of discrete modes, dense and short-lived toward
    // the top — not white noise. 42 log-spaced modes, jittered per channel so
    // the two ears see a decorrelated (wide) body.
    for (let k = 0; k < 42; k++) {
      const fk = 62 * Math.pow(5200 / 62, k / 41) * (1 + (pHash(k, ch) - 0.5) * 0.12);
      const ak = Math.pow(62 / fk, 0.35) * (0.7 + 0.6 * pHash(k, ch, 7));
      const tk = Math.max(0.05, Math.min(0.9, 0.85 * Math.pow(62 / fk, 0.55)));
      const m = Math.exp(-1 / (tk * sr));
      const w = 2 * Math.PI * fk / sr, cw = Math.cos(w), sw = Math.sin(w);
      let cph = Math.cos(pHash(k, ch, 3) * 6.283), sph = Math.sin(pHash(k, ch, 3) * 6.283);
      let env = ak;
      const end = Math.min(len, Math.ceil(tk * sr * 10));
      for (let i = 0; i < end; i++) {
        d[i] += env * sph;
        const nc = cph * cw - sph * sw; sph = sph * cw + cph * sw; cph = nc;
        env *= m;
      }
    }
    let peak = 0;
    for (let i = 0; i < len; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; }
    if (peak > 0) for (let i = 0; i < len; i++) d[i] *= 0.5 / peak;
  }
  const conv = ctx.createConvolver();
  conv.buffer = ir;
  const wet = ctx.createGain();
  wet.gain.value = 0.45; // pre-scaled: sends into this are quiet
  conv.connect(wet).connect(master);
  soundboard = { input: conv };
  return soundboard;
}

// ---- sympathetic resonance: a bank of real string resonators --------------
// Pianoteq's resonances are damper-position dependent: pedal down = every
// string is free to ring along with whatever partials it shares with the
// played note. We model the strings themselves — 24 tuned feedback combs
// (C2–B3; each comb resonates at ALL multiples of its fundamental, so two
// octaves of strings blanket the whole spectrum). A comb only speaks where
// the played note actually has energy, so a C major chord halos like C major
// — this is genuine sympathetic resonance, not reverb. The bank is faintly
// alive even pedal-up (the top ~octave and duplex segments of a real piano
// are undamped) and opens fully with the pedal.
let sympathy = null; // { input } — feed post-note signal here
let sympathyLevel = null;
let pedalOn = false;
const sustained = new Set(); // voices held only by the pedal

function getSympathy() {
  if (sympathy) return sympathy;
  const input = ctx.createGain();
  input.gain.value = 1;
  sympathyLevel = ctx.createGain();
  sympathyLevel.gain.value = 0.1; // pedal-up: just the undamped-string glow
  const out = ctx.createGain();
  out.gain.value = 0.055;
  input.connect(sympathyLevel);
  for (let m = 36; m <= 59; m++) { // C2..B3 string fundamentals
    const f = midiToFreq(m);
    const delay = ctx.createDelay(0.06);
    delay.delayTime.value = 1 / f;
    // string damping (highs die first) as a ONE-POLE lowpass, |H| ≤ 1 by
    // construction. A biquad lowpass here is a trap: Web Audio interprets its
    // Q as resonance in dB, the response peaks above unity near the cutoff,
    // the loop gain crosses 1, and all 24 combs scream themselves to +∞.
    const pole = Math.exp(-2 * Math.PI * (2600 + f * 2) / ctx.sampleRate);
    const damp = ctx.createIIRFilter([1 - pole], [1, -pole]);
    const fb = ctx.createGain();
    fb.gain.value = 0.955;               // ~2–3 s ring in the bass, shorter up top
    sympathyLevel.connect(delay);
    delay.connect(damp).connect(fb).connect(delay); // the string loop
    damp.connect(out);
  }
  out.connect(master);
  sympathy = { input };
  return sympathy;
}

function setSustainPedal(on) {
  pedalOn = !!on;
  if (ctx && sympathyLevel) {
    sympathyLevel.gain.setTargetAtTime(pedalOn ? 0.55 : 0.1, ctx.currentTime, 0.04);
  }
  if (!pedalOn) { // lifting the pedal drops every note it was holding
    for (const v of sustained) v.stop();
    sustained.clear();
  }
}
const getPedalState = () => ({ on: pedalOn, sustained: sustained.size });

// damper/release noise: the felt landing back on the string — a soft, dark
// "puh" whose loudness follows how loud the note still is. Rendered once.
let damperBuf = null;
function damperNoise(when, level, pan = 0) {
  if (level < 0.002) return;
  if (!damperBuf) {
    const sr = ctx.sampleRate, len = Math.floor(sr * 0.05);
    damperBuf = ctx.createBuffer(1, len, sr);
    const d = damperBuf.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const w = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.012));
      lp += 0.09 * (w - lp); // dark: felt, not fingernail
      d[i] = lp * 6;
    }
  }
  const src = ctx.createBufferSource();
  src.buffer = damperBuf;
  const g = ctx.createGain();
  g.gain.value = Math.min(0.12, level * 0.45);
  const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  if (panner) { panner.pan.value = pan; src.connect(g).connect(panner).connect(master); }
  else src.connect(g).connect(master);
  src.start(Math.max(ctx.currentTime, when));
}

function renderPianoBuffer(freq, vel, toneId = pianoTone) {
  const T = PIANO_TONES[toneId] || PIANO_TONES.classic;
  const sr = ctx.sampleRate;
  const midi = 69 + 12 * Math.log2(freq / 440);
  const reg = Math.min(1, Math.max(0, (midi - 21) / 87)); // 0 = bottom A, 1 = top C
  const dur = 5.2 - 3.3 * reg;                            // bass rings ~5s, treble ~1.9s
  const len = Math.floor(sr * dur);
  const buf = ctx.createBuffer(2, len, sr);
  const dataL = buf.getChannelData(0), dataR = buf.getChannelData(1);

  // stretch-tune the note itself (Railsback), then model around it
  freq *= Math.pow(2, railsback(midi) * T.stretchMul / 1200);

  // stiffness rises into the treble (bass strings are wound to fight it)
  const B = 0.00006 * Math.pow(2, reg * 4.2);
  const strike = 0.09 + 0.05 * (1 - reg);                 // hammer position (≈1/8 – 1/7)
  const p = 1.85 - 0.3 * vel + T.pAdd;                    // base string/strike rolloff
  // NONLINEAR HAMMER-FELT CONTACT — the defining velocity cue. Felt is a
  // stiffening spring (F ∝ x^~2.5), so a harder blow compresses it further and
  // leaves the string *sooner*: contact ~3.5 ms in the bass / ~0.6 ms in the
  // treble, shrinking ~40% from pp to ff. The force pulse acts as a lowpass
  // whose corner ≈ 1/(π·τc), so brightness grows superlinearly with velocity —
  // faster than any velocity→filter mapping can fake.
  const tauC = (0.0006 + 0.003 * (1 - reg) * (1 - reg)) * (1.65 - 1.0 * vel) * T.hammerMul;
  const tau0 = (0.9 + (1 - reg) * 3.2) * T.tauMul;        // slow-decay base (s)
  const nPart = Math.max(3, Math.min(18, Math.floor(9000 / freq)));
  // unison strings: 1 in the bass, 2 in the tenor, 3 in the treble
  const det = T.detMul;
  const cents = midi < 44 ? [0] : midi < 64 ? [-0.9 * det, 0.9 * det] : [-1.3 * det, 0, 1.3 * det];

  // stereo placement: bass to the left, treble right (player perspective),
  // each unison string spread a touch around the note position
  const basePan = Math.max(-0.45, Math.min(0.45, (midi - 60) / 60));

  const midiR = Math.round(midi);
  let aFirst = 0; // partial-1 level, used to scale thump/growl/shimmer

  const addPartial = (fn, a, tauS, tauF, wFast, gL, gR) => {
    if (fn > sr * 0.45 || a < 1e-4) return;
    let envS = (1 - wFast) * a, envF = wFast * a;
    const mS = Math.exp(-1 / (tauS * sr));
    const mF = Math.exp(-1 / (tauF * sr));
    const end = Math.min(len, Math.ceil(tauS * sr * Math.log(Math.max(envS, 1e-9) / 2e-5)));
    if (end <= 0) return;
    const w = 2 * Math.PI * fn / sr;
    const cw = Math.cos(w), sw = Math.sin(w);
    let cph = 1, sph = 0;
    for (let i = 0; i < end; i++) {
      const v = (envF + envS) * sph;
      dataL[i] += v * gL;
      dataR[i] += v * gR;
      const nc = cph * cw - sph * sw;
      sph = sph * cw + cph * sw;
      cph = nc;
      envS *= mS; envF *= mF;
    }
  };

  cents.forEach((c, s) => {
    const f0 = freq * Math.pow(2, c / 1200);
    const pan = basePan + (s - (cents.length - 1) / 2) * 0.1;
    const th = (Math.max(-1, Math.min(1, pan)) + 1) * Math.PI / 4;
    const gL = Math.cos(th), gR = Math.sin(th);
    for (let n = 1; n <= nPart; n++) {
      const fn = f0 * n * Math.sqrt(1 + B * n * n);        // inharmonic partial
      if (fn > sr * 0.45) break;
      let a = Math.pow(n, -p) * Math.abs(Math.sin(Math.PI * n * strike));
      // hammer force-pulse rolloff. The nonlinear felt sharpens the pulse, so
      // its effective bandwidth is ~3/τc (not the half-sine's 1/πτc) — corner
      // ≈ 2.6 kHz at C4 ff, ≈ 1.7 kHz at pp: brightness grows superlinearly.
      a /= 1 + Math.pow(fn * tauC / 3.1, 2);
      a *= fn * fn / (fn * fn + 95 * 95);                  // soundboard radiation: weak deep fundamental
      a *= Math.pow(10, (pHash(midiR, n, s) - 0.5) * 7 / 20); // board-resonance ripple ±3.5 dB
      if (n === 1) aFirst = Math.max(aFirst, a);
      const tauS = tau0 / (1 + 0.08 * (n - 1));            // aftersound (slow)
      addPartial(fn, a, tauS, tauS * 0.22, 0.55, gL, gR);
    }

    // longitudinal modes (bass only): the metallic growl of a hard-hit low
    // string — nonlinearly excited, so amp rides vel², dies fast
    if (midi < 52) {
      for (let k = 0; k < 2; k++) {
        const fL = f0 * (13.5 + 4.5 * pHash(midiR, k, 11));
        addPartial(fL, aFirst * 0.22 * vel * vel * (k ? 0.6 : 1), 0.35, 0.1, 0.6, gL, gR);
      }
    }
    // duplex-scale shimmer (treble only): quiet, undamped halo above the note
    if (midi > 62) {
      const fD = f0 * (4.05 + 0.35 * pHash(midiR, 5, 13));
      addPartial(fD, aFirst * 0.05 * vel, 0.9, 0.5, 0.3, gL, gR);
    }
  });

  // attack: a resonant knock (the board thud), not hiss — plus a whisper of
  // lowpassed hammer noise. Both ride velocity hard, like real felt.
  {
    const th = (basePan + 1) * Math.PI / 4;
    const gL = Math.cos(th), gR = Math.sin(th);
    const knockAmp = aFirst * Math.pow(vel, 1.5) * (1.2 - 0.6 * reg) * 0.55 * T.thumpMul;
    addPartial(95 + 130 * reg, knockAmp, 0.03, 0.012, 0.5, gL, gR);
    const alpha = Math.min(0.6, (2 * Math.PI * (700 + 3800 * vel + freq * 0.25)) / sr);
    const nLen = Math.min(len, Math.floor(sr * 0.012));
    let lp = 0;
    for (let i = 0; i < nLen; i++) {
      const w = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.003));
      lp += alpha * (w - lp);
      const v = knockAmp * 0.7 * lp;
      dataL[i] += v * gL; dataR[i] += v * gR;
    }
  }

  // click-proof the edges: velocity-shaped bloom in (soft = slower), fade out
  const aLen = Math.floor(sr * (0.0008 + 0.0035 * (1 - vel)));
  const fLen = Math.min(len, Math.floor(sr * 0.06));
  for (const d of [dataL, dataR]) {
    for (let i = 0; i < aLen; i++) d[i] *= i / aLen;
    for (let i = 0; i < fLen; i++) d[len - 1 - i] *= i / fLen;
  }

  // normalize both channels together; loudness is applied per-note in build()
  let peak = 0;
  for (let i = 0; i < len; i++) {
    const l = Math.abs(dataL[i]), r = Math.abs(dataR[i]);
    if (l > peak) peak = l;
    if (r > peak) peak = r;
  }
  if (peak > 0) {
    const sc = 0.92 / peak;
    for (let i = 0; i < len; i++) { dataL[i] *= sc; dataR[i] *= sc; }
  }
  return buf;
}

function buildModelPiano(freq, vel, t) {
  const midiR = Math.round(69 + 12 * Math.log2(freq / 440));
  const bucket = vel < 0.45 ? 0 : vel < 0.75 ? 1 : 2;
  const key = `${midiR}|${bucket}|${pianoTone}`;
  let buf = pianoCache.get(key);
  if (!buf) {
    buf = renderPianoBuffer(midiToFreq(midiR), PIANO_VELS[bucket], pianoTone);
    if (pianoCache.size >= PIANO_CACHE_MAX) pianoCache.delete(pianoCache.keys().next().value);
    pianoCache.set(key, buf);
  }

  const src = ctx.createBufferSource();
  src.buffer = buf;
  const cents = 1200 * Math.log2(freq / midiToFreq(midiR));
  if (Math.abs(cents) > 0.5) src.detune.value = cents; // future-proof: microtuning

  const gain = ctx.createGain();
  const peak = 0.5 * (0.35 + 0.65 * vel); // decay is baked into the buffer
  gain.gain.value = peak;
  gain.gain.setValueAtTime(peak, t);
  src.connect(gain).connect(master);

  // quiet sends: the soundboard for body, the string bank for sympathy
  const send = ctx.createGain();
  send.gain.value = 0.15;
  gain.connect(send).connect(getSoundboard().input);
  const symSend = ctx.createGain();
  symSend.gain.value = 0.6;
  gain.connect(symSend).connect(getSympathy().input);

  src.start(t);
  const pan = Math.max(-0.45, Math.min(0.45, (midiR - 60) / 60));
  return {
    gain, oscs: [src], rel: 0.18,
    // the felt landing back on the string, scaled by the note's current level
    damper: rt => damperNoise(rt, gain.gain.value * (0.35 + 0.65 * vel), pan),
  };
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
  piano:    { label: 'piano',     build: buildModelPiano },
  softpiano:{ label: 'piano · soft synth', build: buildPiano },
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

// ---------- ear-challenge: timbre & register ladder ----------
// The whole app trains on one clean voice in one register — real hearing has to
// survive different instruments and extreme registers. When the challenge is on,
// each musical "gesture" (a chord or a short progression — notes within ~1.2s)
// gets a random voice, and at the top level a random ±octave shift. The shift is
// answer-preserving (an octave keeps every pitch class, interval and function),
// and one shift per gesture keeps a progression's bass line and voice leading
// intact. Level 0 = off (uses the chosen voice), 1 = timbres, 2 = + register.
const VOICE_IDS = Object.keys(VOICE_DEFS);
let challenge = 0;
let chVoice = null, chShift = 0, lastGestureT = -1e9;

function setChallenge(level) { challenge = Math.max(0, Math.min(2, level | 0)); }
function getChallenge() { return challenge; }

function rollGesture(t) {
  if (challenge === 0) { chVoice = null; chShift = 0; return; }
  if (t - lastGestureT > 1.2) {
    chVoice = VOICE_IDS[Math.floor(Math.random() * VOICE_IDS.length)];
    chShift = challenge >= 2 ? (Math.floor(Math.random() * 3) - 1) * 12 : 0; // -12 / 0 / +12
  }
  lastGestureT = t;
}
const challengeVoice = () => (challenge > 0 && chVoice ? chVoice : currentVoice);
const challengeFreq = midi => midiToFreq(midi + chShift);

// ---------- note lifecycle ----------

function noteOn(midi, velocity = 0.8) {
  ensureCtx();
  noteOff(midi, true);

  const t = ctx.currentTime;
  rollGesture(t);
  const v = VOICE_DEFS[challengeVoice()].build(challengeFreq(midi), velocity, t);

  const handle = {
    stop(now = false) {
      const rt = ctx.currentTime;
      if (!now && v.damper) v.damper(rt); // dampers land only on a gentle release
      // read the ramped value BEFORE cancelling: cancelScheduledValues removes
      // the in-flight ramp, which snaps .value back to the attack peak — pin
      // the release to where the envelope actually is or every retriggered
      // note (chords sharing tones, replays) pops
      const cur = v.gain.gain.value;
      v.gain.gain.cancelScheduledValues(rt);
      v.gain.gain.setValueAtTime(Math.max(cur, 0.0001), rt);
      v.gain.gain.exponentialRampToValueAtTime(0.0001, rt + (now ? 0.02 : v.rel));
      v.oscs.forEach(o => o.stop(rt + (now ? 0.05 : v.rel + 0.1)));
    },
  };
  voices.set(midi, handle);
  return handle;
}

function noteOff(midi, immediate = false) {
  const v = voices.get(midi);
  if (!v) return;
  voices.delete(midi);
  // sustain pedal down: the key comes up but the damper stays off the string —
  // the note keeps ringing until the pedal is lifted
  if (pedalOn && !immediate) { sustained.add(v); return; }
  v.stop(immediate);
}

function playChord(midiNotes, dur = 1.4, velocity = 0.7) {
  ensureCtx();
  const started = midiNotes.map(m => [m, noteOn(m, velocity)]);
  // only release the voices THIS call started: if the same midi was
  // retriggered meanwhile (a replay, the next chord), the stale timer must
  // not cut the new note short
  setTimeout(() => started.forEach(([m, h]) => { if (voices.get(m) === h) noteOff(m); }), dur * 1000);
}

function allNotesOff() {
  for (const m of [...voices.keys()]) noteOff(m, true);
  for (const v of sustained) v.stop(true); // pedal-held notes too
  sustained.clear();
}

// ---------- scheduled playback (standards player) ----------
// Fire-and-forget notes at a future AudioContext time. The release is
// scheduled up front, so nothing is tracked in the voices map and these
// never collide with interactively held notes.

function playNoteAt(midi, when, dur, velocity = 0.7) {
  ensureCtx();
  const t = Math.max(ctx.currentTime + 0.005, when);
  rollGesture(when); // key on musical time so a chord/short progression shares a voice
  const v = VOICE_DEFS[challengeVoice()].build(challengeFreq(midi), velocity, t);
  const end = t + Math.max(0.06, dur);
  v.gain.gain.setTargetAtTime(0.0001, end, Math.max(0.02, v.rel / 4));
  v.oscs.forEach(o => o.stop(end + v.rel + 0.4));
}

function playChordAt(midiNotes, when, dur, velocity = 0.7) {
  for (const m of midiNotes) playNoteAt(m, when, dur, velocity);
}

// short metronome tick for count-ins; accent marks the downbeat
function clickAt(when, accent = false) {
  ensureCtx();
  const t = Math.max(ctx.currentTime + 0.005, when);
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.value = accent ? 1660 : 1245;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(accent ? 0.2 : 0.13, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + 0.1);
}

function audioNow() {
  ensureCtx();
  return ctx.currentTime;
}

export {
  noteOn, noteOff, playChord, allNotesOff, ensureCtx,
  playNoteAt, playChordAt, clickAt, audioNow,
  VOICES, setVoice, getVoice, setChallenge, getChallenge, setMasterVolume,
  setPianoTone, getPianoTone, setSustainPedal, getPedalState,
  renderPianoBuffer, // exported for tests — asserts the model's energy/decay
};
