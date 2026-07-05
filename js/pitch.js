// pitch.js — monophonic pitch detection from the microphone. Unlike the
// polyphonic chromagram in listen.js (which guesses chords and is rough by
// nature), a single melodic line — your voice or a solo instrument — is a much
// easier, much more reliable problem: normalized autocorrelation (the McLeod
// pitch method) nails a sung or played note to within a few cents.
//
// This powers the sing-back drills (audiation: sing before you play) and the
// hum-to-note button in the solo-transcription room.

let ctx = null, stream = null, analyser = null, buf = null, raf = 0;

const MIN_FREQ = 70;    // ~D2 — below a typical bass/male low voice
const MAX_FREQ = 1100;  // ~C#6 — above a soprano's working range
const CLARITY_MIN = 0.9; // NSDF peak height gate — voice is noisy, keep it high

// Normalized Square Difference Function (McLeod). Returns { freq, clarity } or
// null when the frame is too quiet or too noisy to trust.
function detect(samples, sampleRate) {
  const n = samples.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += samples[i] * samples[i];
  rms = Math.sqrt(rms / n);
  if (rms < 0.01) return null; // silence gate

  const maxLag = Math.floor(sampleRate / MIN_FREQ);
  const minLag = Math.floor(sampleRate / MAX_FREQ);
  const nsdf = new Float32Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let acf = 0, div = 0;
    for (let i = 0; i < n - lag; i++) {
      acf += samples[i] * samples[i + lag];
      div += samples[i] * samples[i] + samples[i + lag] * samples[i + lag];
    }
    nsdf[lag] = div > 0 ? (2 * acf) / div : 0;
  }

  // first key maximum: after the NSDF drops below zero, take the highest peak
  let lag = minLag;
  while (lag <= maxLag && nsdf[lag] > 0) lag++; // skip the lag-0 shoulder
  let bestLag = -1, bestVal = 0;
  for (; lag < maxLag; lag++) {
    if (nsdf[lag] > 0 && nsdf[lag] > nsdf[lag - 1] && nsdf[lag] >= nsdf[lag + 1]) {
      if (nsdf[lag] > bestVal) { bestVal = nsdf[lag]; bestLag = lag; }
      while (lag < maxLag && nsdf[lag + 1] <= nsdf[lag]) lag++; // to the trough
      if (bestVal > 0.95) break; // strong enough — take the first clear period
    }
  }
  if (bestLag < 0 || bestVal < CLARITY_MIN) return null;

  // parabolic interpolation around the peak for sub-sample accuracy
  const a = nsdf[bestLag - 1], b = nsdf[bestLag], c = nsdf[bestLag + 1];
  const shift = (a + c - 2 * b) ? (0.5 * (a - c)) / (a - 2 * b + c) : 0;
  const freq = sampleRate / (bestLag + shift);
  if (freq < MIN_FREQ || freq > MAX_FREQ) return null;
  return { freq, clarity: bestVal };
}

function freqToMidiCents(freq) {
  const midiFloat = 69 + 12 * Math.log2(freq / 440);
  const midi = Math.round(midiFloat);
  return { midi, cents: Math.round((midiFloat - midi) * 100) };
}

function isMicOn() { return !!stream; }

function stopMic() {
  if (raf) { cancelAnimationFrame(raf); raf = 0; }
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  if (ctx) { ctx.close(); ctx = null; }
  analyser = null;
}

// onPitch({ midi, cents, freq, clarity }) fires every frame a confident pitch
// is present, and onPitch(null) when the line goes quiet. onStop() fires if the
// mic track ends. Throws if permission is denied / no mic.
async function startMic(onPitch, onStop) {
  stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  const src = ctx.createMediaStreamSource(stream);
  analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  src.connect(analyser);
  buf = new Float32Array(analyser.fftSize);

  const tick = () => {
    if (!analyser) return;
    analyser.getFloatTimeDomainData(buf);
    const d = detect(buf, ctx.sampleRate);
    onPitch(d ? { ...freqToMidiCents(d.freq), freq: d.freq, clarity: d.clarity } : null);
    raf = requestAnimationFrame(tick);
  };
  tick();

  stream.getAudioTracks()[0].addEventListener('ended', () => { stopMic(); if (onStop) onStop(); });
}

export { startMic, stopMic, isMicOn, freqToMidiCents };
