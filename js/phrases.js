// phrases.js — generate short, idiomatic jazz lines to hear and reproduce.
// A phrase is { type, key, chords, melody, label } where chords is
// [{root, quality, beats}] and melody is [{beat, midi, dur}] in the same token
// space standards.js parseMelody emits, so the echo tab can play it on the
// synth and grade an echo with the same alignment scorer the melody quiz uses.
//
// Three line styles, all over a ii–V–I (major or minor):
//   guide     — a guide-tone line: land on the 3rd/7th, connect smoothly
//   bebop     — scalar eighth-note runs, chromatic passing, chord tones on beats
//   enclosure — approach each chord's target tone from above and below

import { qualityIntervals, guideTones, pcName, useFlats } from './theory.js';

const rand = n => Math.floor(Math.random() * n);
const pick = a => a[rand(a.length)];

// chord-scale for a quality (pitch-class intervals from the root)
const SCALES = {
  '':      [0, 2, 4, 5, 7, 9, 11], 'maj7': [0, 2, 4, 5, 7, 9, 11], '6': [0, 2, 4, 5, 7, 9, 11],
  'maj9':  [0, 2, 4, 5, 7, 9, 11], 'maj7#11': [0, 2, 4, 6, 7, 9, 11],
  'm':     [0, 2, 3, 5, 7, 9, 10], 'm7': [0, 2, 3, 5, 7, 9, 10], 'm9': [0, 2, 3, 5, 7, 9, 10],
  'm6':    [0, 2, 3, 5, 7, 9, 11], 'm11': [0, 2, 3, 5, 7, 9, 10],
  '7':     [0, 2, 4, 5, 7, 9, 10], '9': [0, 2, 4, 5, 7, 9, 10], '13': [0, 2, 4, 5, 7, 9, 10],
  '7b9':   [0, 1, 3, 4, 6, 7, 10], '7#9': [0, 1, 3, 4, 6, 8, 10], '7#11': [0, 2, 4, 6, 7, 9, 10],
  '7b5':   [0, 2, 4, 6, 8, 10],    '7#5': [0, 2, 4, 6, 8, 10],
  'm7b5':  [0, 2, 3, 5, 6, 8, 10], 'dim7': [0, 2, 3, 5, 6, 8, 9, 11],
};
const scaleFor = q => SCALES[q] || SCALES[''];

// nearest midi of a pitch class to a reference midi (within a tritone)
function nearestMidi(pc, ref) {
  let m = ref + ((((pc - ref) % 12) + 12) % 12);
  if (m - ref > 6) m -= 12;
  return fold(m);
}
// keep the line in a comfortable singable / playable band (~D4–A5)
function fold(m) {
  while (m > 81) m -= 12;
  while (m < 62) m += 12;
  return m;
}
// chord tones (root/3/5/7) as pitch classes
const chordTonePcs = (root, quality) =>
  qualityIntervals(quality).map(iv => (root + iv) % 12);

// step to the next scale tone from `cur` in `dir` (±1); returns a midi
function stepScale(cur, scalePcs, dir) {
  for (let d = 1; d <= 12; d++) {
    const cand = cur + dir * d;
    if (scalePcs.includes(((cand % 12) + 12) % 12)) return cand;
  }
  return cur + dir;
}

// ---- harmonic context: a ii–V–I ----
function iiVI(tonic, mode) {
  if (mode === 'minor') {
    return [
      { root: (tonic + 2) % 12, quality: 'm7b5', beats: 2 },
      { root: (tonic + 7) % 12, quality: '7b9',  beats: 2 },
      { root: tonic % 12,       quality: 'm7',   beats: 4 },
    ];
  }
  return [
    { root: (tonic + 2) % 12, quality: 'm7',   beats: 2 },
    { root: (tonic + 7) % 12, quality: '7',    beats: 2 },
    { root: tonic % 12,       quality: 'maj7', beats: 4 },
  ];
}

// ---- line styles ----

function guideLine(chords) {
  const mel = [];
  let beat = 0, prev = 71 + rand(3);
  chords.forEach((c, i) => {
    const gts = guideTones(c.root, c.quality);
    let best = null;
    for (const gt of gts) {
      const m = nearestMidi(gt.pc, prev);
      if (best == null || Math.abs(m - prev) < Math.abs(best - prev)) best = m;
    }
    if (best == null) best = nearestMidi(c.root, prev);
    // on the final tonic, resolve and hold; elsewhere sometimes add a tail step
    if (i < chords.length - 1 && c.beats >= 2 && Math.random() < 0.6) {
      mel.push({ beat, midi: best, dur: c.beats - 1 });
      const scale = scaleFor(c.quality).map(iv => (c.root + iv) % 12);
      mel.push({ beat: beat + c.beats - 1, midi: stepScale(best, scale, pick([1, -1])), dur: 1 });
    } else {
      mel.push({ beat, midi: best, dur: c.beats });
    }
    prev = best; beat += c.beats;
  });
  return mel;
}

function bebopLine(chords, difficulty) {
  const mel = [];
  let beat = 0, cur = 69 + rand(5), dir = pick([1, -1]);
  const chrom = difficulty >= 2 ? 0.22 : 0.1;
  chords.forEach((c, ci) => {
    const scale = scaleFor(c.quality).map(iv => (c.root + iv) % 12);
    const tones = chordTonePcs(c.root, c.quality);
    let t = 0;
    while (t < c.beats - 1e-6) {
      const onBeat = Math.abs(t % 1) < 1e-6;
      // land a chord tone on the beat; run scale/chromatic off the beat
      if (onBeat && !tones.includes(((cur % 12) + 12) % 12) && Math.random() < 0.7) {
        cur = nearestMidi(pick(tones), cur);
      } else if (!onBeat && Math.random() < chrom) {
        cur = cur + dir; // chromatic passing tone
      } else {
        cur = stepScale(cur, scale, dir);
      }
      if (cur > 83) dir = -1; else if (cur < 60) dir = 1;
      else if (Math.random() < 0.18) dir = -dir;
      mel.push({ beat: beat + t, midi: cur, dur: 0.5 });
      t += 0.5;
    }
    beat += c.beats;
  });
  // resolve the last note to a chord tone of the final chord
  const last = chords[chords.length - 1];
  const tones = chordTonePcs(last.root, last.quality);
  const tail = mel[mel.length - 1];
  tail.midi = nearestMidi(pick([last.root, (last.root + qualityIntervals(last.quality)[1]) % 12]), tail.midi);
  return mel;
}

function enclosureLine(chords) {
  const mel = [];
  let beat = 0, prev = 72;
  chords.forEach((c, i) => {
    const ivs = qualityIntervals(c.quality);
    const targetPc = (c.root + (ivs[1] ?? 4)) % 12; // the 3rd
    const target = nearestMidi(targetPc, prev);
    if (c.beats >= 2) {
      // upper scale neighbor, lower chromatic neighbor, target, then a rest tone
      const scale = scaleFor(c.quality).map(iv => (c.root + iv) % 12);
      const above = stepScale(target, scale, 1);
      const below = target - 1;
      mel.push({ beat, midi: above, dur: 0.5 });
      mel.push({ beat: beat + 0.5, midi: below, dur: 0.5 });
      mel.push({ beat: beat + 1, midi: target, dur: Math.max(1, c.beats - 1) });
    } else {
      mel.push({ beat, midi: target, dur: c.beats });
    }
    prev = target; beat += c.beats;
  });
  return mel;
}

const GENERATORS = { guide: guideLine, bebop: bebopLine, enclosure: enclosureLine };
const TYPE_LABEL = { guide: 'guide-tone line', bebop: 'bebop run', enclosure: 'enclosure' };

// generatePhrase({ type, tonic, mode, difficulty }) → phrase
function generatePhrase(opts = {}) {
  const type = opts.type && GENERATORS[opts.type] ? opts.type : pick(Object.keys(GENERATORS));
  const tonic = opts.tonic != null ? opts.tonic : rand(12);
  const mode = opts.mode || 'major';
  const difficulty = opts.difficulty || 1;
  const chords = iiVI(tonic, mode);
  const melody = GENERATORS[type](chords, difficulty);
  const flats = useFlats(tonic, mode);
  const label = `${TYPE_LABEL[type]} · ii–V–I in ${pcName(tonic, flats)}${mode === 'minor' ? 'm' : ''}`;
  return { type, key: { tonic, mode }, chords, melody, label };
}

// transpose a phrase's chords + melody by `semis`, folding melody register so it
// never jumps more than a tritone
function transposePhrase(phrase, semis) {
  const shift = ((semis % 12) + 12) % 12;
  const melShift = shift > 6 ? shift - 12 : shift;
  return {
    ...phrase,
    key: { tonic: (phrase.key.tonic + shift) % 12, mode: phrase.key.mode },
    chords: phrase.chords.map(c => ({ ...c, root: (c.root + shift) % 12 })),
    melody: phrase.melody.map(n => ({ ...n, midi: n.midi + melShift })),
  };
}

export { generatePhrase, transposePhrase, TYPE_LABEL };
