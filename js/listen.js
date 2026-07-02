// listen.js — suggest chords from the audio itself. The YouTube iframe's
// stream is cross-origin (untouchable), but Chrome's getDisplayMedia can
// capture *tab audio* the user explicitly shares — including this tab while
// the video plays. We run a chromagram over it and template-match triads and
// sevenths. It's a rough ear, not ground truth: clear mixes work well, dense
// voicings often collapse to their triad.

let ctx = null, analyser = null, stream = null, timer = null, freqData = null;

const TEMPLATES = [
  { quality: '',     iv: [0, 4, 7] },
  { quality: 'm',    iv: [0, 3, 7] },
  { quality: '7',    iv: [0, 4, 7, 10] },
  { quality: 'maj7', iv: [0, 4, 7, 11] },
  { quality: 'm7',   iv: [0, 3, 7, 10] },
];

const FRAME_MS = 250;
const STABLE_FRAMES = 3;    // ~0.75s of agreement before a chord is reported
const MIN_SCORE = 0.12;     // template contrast gate
const MIN_ENERGY = 1e-4;    // silence gate

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
    const pc = (((Math.round(12 * Math.log2(f / 440)) + 69) % 12) + 12) % 12;
    c[pc] += mag;
  }
  const max = Math.max(...c);
  if (max <= 0) return { chroma: null, energy: 0 };
  return { chroma: c.map(v => v / max), energy };
}

function matchTemplate(chroma) {
  let best = null;
  for (let root = 0; root < 12; root++) {
    for (const t of TEMPLATES) {
      const on = new Set(t.iv.map(iv => (root + iv) % 12));
      let sOn = 0, sOff = 0;
      for (let pc = 0; pc < 12; pc++) (on.has(pc) ? (sOn += chroma[pc]) : (sOff += chroma[pc]));
      const score = sOn / on.size - sOff / (12 - on.size);
      if (!best || score > best.score) best = { root, quality: t.quality, score };
    }
  }
  return best;
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

  let lastKey = null, run = 0, announced = null;
  timer = setInterval(() => {
    const { chroma, energy } = computeChroma();
    if (!chroma || energy < MIN_ENERGY) { lastKey = null; run = 0; return; }
    const det = matchTemplate(chroma);
    if (!det || det.score < MIN_SCORE) { lastKey = null; run = 0; return; }
    const key = det.root + ':' + det.quality;
    run = key === lastKey ? run + 1 : 1;
    lastKey = key;
    if (run === STABLE_FRAMES && key !== announced) {
      announced = key;
      onChord(det);
    }
  }, FRAME_MS);

  stream.getAudioTracks()[0].addEventListener('ended', () => { stopListen(); onStop(); });
}

export { startListen, stopListen, isListening };
