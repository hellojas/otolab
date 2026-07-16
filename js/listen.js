// listen.js — suggest chords from the audio itself. The YouTube iframe's
// stream is cross-origin (untouchable), but Chrome's getDisplayMedia can
// capture *tab audio* the user explicitly shares — including this tab while
// the video plays. We run a chromagram over it, score weighted chord
// templates, and decode the frame sequence with an online Viterbi smoother
// (an HMM-lite cousin of the CRF decoding real chord models use): chords are
// states, staying in a chord is cheap, switching costs — so one noisy frame
// can't flip the label. It's still a rough ear, not ground truth: clear mixes
// work well, dense voicings often collapse to their triad.

let ctx = null, analyser = null, stream = null, timer = null, freqData = null;

// weighted templates: the root counts extra (it's usually the bass), the
// quality-defining third/seventh a bit more than the fifth
const TEMPLATES = [
  { quality: '',     iv: [[0, 1.6], [4, 1.2], [7, 1.0]] },
  { quality: 'm',    iv: [[0, 1.6], [3, 1.2], [7, 1.0]] },
  { quality: '7',    iv: [[0, 1.6], [4, 1.2], [7, 0.9], [10, 1.1]] },
  { quality: 'maj7', iv: [[0, 1.6], [4, 1.2], [7, 0.9], [11, 1.1]] },
  { quality: 'm7',   iv: [[0, 1.6], [3, 1.2], [7, 0.9], [10, 1.1]] },
];

const FRAME_MS = 250;
const MIN_SCORE = 0.1;      // template contrast gate (per frame)
const MIN_ENERGY = 1e-4;    // silence gate

// score every (root, quality) template against one normalized chroma frame:
// weighted mean of the chord tones minus mean of everything else
function matchScores(chroma) {
  const out = [];
  for (let root = 0; root < 12; root++) {
    for (const t of TEMPLATES) {
      let sOn = 0, wOn = 0, on = 0;
      for (const [iv, w] of t.iv) { sOn += w * chroma[(root + iv) % 12]; wOn += w; on |= 1 << ((root + iv) % 12); }
      let sOff = 0, nOff = 0;
      for (let pc = 0; pc < 12; pc++) if (!(on & (1 << pc))) { sOff += chroma[pc]; nOff++; }
      out.push({ root, quality: t.quality, score: sOn / wOn - sOff / nOff });
    }
  }
  return out;
}

// Online Viterbi over the chord states. Each frame: a state either keeps its
// own accumulated path (staying is free) or takes over the best other path at
// a switch penalty — then everything is renormalized so the accumulator can't
// drift. A chord is reported once it has been the best path for `report`
// consecutive frames and differs from the last announced one.
function makeDecoder({ switchPenalty = 0.22, report = 2 } = {}) {
  let path = null;      // accumulated per-state path scores
  let announced = null; // last reported state key
  let bestKey = null, run = 0;

  const reset = () => { path = null; bestKey = null; run = 0; };

  return {
    reset,
    // chroma: normalized 12-vector or null (silence) -> {root, quality} | null
    push(chroma) {
      if (!chroma) { reset(); return null; }
      const frame = matchScores(chroma);
      if (Math.max(...frame.map(f => f.score)) < MIN_SCORE) { reset(); return null; }
      if (!path) path = frame.map(f => f.score);
      else {
        const bestPrev = Math.max(...path);
        path = frame.map((f, i) => f.score + Math.max(path[i], bestPrev - switchPenalty));
        const m = Math.max(...path);
        path = path.map(v => v - m); // renormalize
      }
      let bi = 0;
      for (let i = 1; i < path.length; i++) if (path[i] > path[bi]) bi = i;
      const f = frame[bi];
      const key = f.root + ':' + f.quality;
      run = key === bestKey ? run + 1 : 1;
      bestKey = key;
      if (run >= report && key !== announced) {
        announced = key;
        return { root: f.root, quality: f.quality };
      }
      return null;
    },
  };
}

function computeChroma() {
  analyser.getFloatFrequencyData(freqData);
  const sr = ctx.sampleRate, n = analyser.fftSize;
  const c = new Array(12).fill(0);
  let energy = 0;
  for (let i = 1; i < freqData.length; i++) {
    const f = (i * sr) / n;
    if (f < 60) continue;
    if (f > 1200) break;    // fundamentals region; cuts overtone confusion
    const mag = Math.pow(10, freqData[i] / 20);
    energy += mag;
    // log-compress so one loud partial can't dominate the vector, and weight
    // the bass octaves up — the fundamental usually lives there
    const w = f < 260 ? 1.35 : 1.0;
    const pc = (((Math.round(12 * Math.log2(f / 440)) + 69) % 12) + 12) % 12;
    c[pc] += w * Math.log1p(mag * 1e4);
  }
  const max = Math.max(...c);
  if (max <= 0) return { chroma: null, energy: 0 };
  return { chroma: c.map(v => v / max), energy };
}

function isListening() { return !!timer; }

function stopListen() {
  if (timer) { clearInterval(timer); timer = null; }
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  if (ctx) { ctx.close(); ctx = null; }
}

// onChord({root, quality}) fires once per stable chord change;
// onStop() fires when capture ends (stop button or browser "stop sharing").
async function startListen(onChord, onStop) {
  stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  if (!stream.getAudioTracks().length) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
    throw new Error('no audio in capture — pick a tab and tick “also share tab audio”');
  }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  const src = ctx.createMediaStreamSource(stream);
  analyser = ctx.createAnalyser();
  analyser.fftSize = 8192;
  analyser.smoothingTimeConstant = 0.5;
  src.connect(analyser);
  freqData = new Float32Array(analyser.frequencyBinCount);

  const decoder = makeDecoder();
  timer = setInterval(() => {
    const { chroma, energy } = computeChroma();
    const det = decoder.push(energy < MIN_ENERGY ? null : chroma);
    if (det) onChord(det);
  }, FRAME_MS);

  stream.getAudioTracks()[0].addEventListener('ended', () => { stopListen(); onStop(); });
}

export { startListen, stopListen, isListening, matchScores, makeDecoder };
