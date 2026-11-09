// targets.js — what to play over a chord. The pure engine behind the "blow"
// room (play or sing over the changes, EarBop-style): for each chord it writes
// the set of target tones a drill asks for — the root, the guide tones, an
// arpeggio, the chord scale, a pentatonic, the upper structure, a walking bass
// or a voice-led target-tone line — labels each one as an interval over the
// chord, and grades a played note against the set.
//
// A target is { pc, iv, label, midi, beat? }: pitch class, semitones above the
// root, an interval label ('3', '♭7', '♯11' …), a suggested register for the
// staff / audition, and for the bass drill the beat it falls on.

import { qualityIntervals, guideTones, qualityFamily } from './theory.js';

// ---- chord scales (semitones above the root) ----
const SCALES = {
  '':      [0, 2, 4, 5, 7, 9, 11], 'maj7': [0, 2, 4, 5, 7, 9, 11], '6': [0, 2, 4, 5, 7, 9, 11],
  'maj9':  [0, 2, 4, 5, 7, 9, 11], 'maj7#11': [0, 2, 4, 6, 7, 9, 11], 'add9': [0, 2, 4, 5, 7, 9, 11],
  '6/9':   [0, 2, 4, 5, 7, 9, 11], 'sus2': [0, 2, 4, 5, 7, 9, 11],
  'sus4':  [0, 2, 4, 5, 7, 9, 10], '7sus4': [0, 2, 4, 5, 7, 9, 10],
  'm':     [0, 2, 3, 5, 7, 9, 10], 'm7': [0, 2, 3, 5, 7, 9, 10], 'm9': [0, 2, 3, 5, 7, 9, 10],
  'm6':    [0, 2, 3, 5, 7, 9, 11], 'm11': [0, 2, 3, 5, 7, 9, 10], 'madd9': [0, 2, 3, 5, 7, 9, 10],
  'mMaj7': [0, 2, 3, 5, 7, 9, 11],
  '7':     [0, 2, 4, 5, 7, 9, 10], '9': [0, 2, 4, 5, 7, 9, 10], '13': [0, 2, 4, 5, 7, 9, 10],
  '7b9':   [0, 1, 3, 4, 6, 7, 10], '7#9': [0, 1, 3, 4, 6, 8, 10], '7#11': [0, 2, 4, 6, 7, 9, 10],
  '7b5':   [0, 2, 4, 6, 8, 10],    '7#5': [0, 2, 4, 6, 8, 10],
  'm7b5':  [0, 2, 3, 5, 6, 8, 10], 'dim7': [0, 2, 3, 5, 6, 8, 9, 11], 'dim': [0, 2, 3, 5, 6, 8, 9, 11],
  'aug':   [0, 2, 4, 6, 8, 10],    'maj7#5': [0, 2, 4, 6, 8, 9, 11],
};
function scaleFor(quality) {
  const q = quality || '';
  if (SCALES[q]) return SCALES[q];
  const fam = qualityFamily(q);
  return fam === 'minor' ? SCALES.m7 : fam === 'dom' ? SCALES['7'] : SCALES[''];
}

// ---- the drills ----
const DRILLS = {
  root:    { label: 'root', ordered: false,
             blurb: 'the root of every chord — the floor the changes stand on' },
  guide:   { label: 'guide tones · 3 & 7', ordered: false,
             blurb: 'the 3rd and 7th — the two notes that carry the quality and voice-lead the changes' },
  targets: { label: 'target-tone line', ordered: false,
             blurb: 'one guide tone per chord, the nearest to the last — the smoothest line through the tune' },
  arp:     { label: 'arpeggio · 1 3 5 7', ordered: true,
             blurb: 'spell each chord upward from the root, in order' },
  scale:   { label: 'chord scale', ordered: true,
             blurb: 'run the scale that fits each chord, root to 7th' },
  pent:    { label: 'pentatonic', ordered: true,
             blurb: 'the five-note shape that fits the chord family' },
  upper:   { label: 'upper structure · 9 11 13', ordered: false,
             blurb: 'the colour tones above the 7th — tensions that fit the chord' },
  bass:    { label: 'walking bass', ordered: true,
             blurb: 'root · 3rd · 5th, then a chromatic approach into the next root' },
};

// ---- interval labels, chord-aware ----
const has = (ivs, x) => ivs.includes(x);
function ivLabel(iv, quality) {
  const q = quality || '';
  const ivs = qualityIntervals(q);
  const i = ((iv % 12) + 12) % 12;
  switch (i) {
    case 0: return 'R';
    case 1: return '♭9';
    case 2: return q.startsWith('sus2') ? '2' : '9';
    case 3: return has(ivs, 4) ? '♯9' : '♭3';
    case 4: return '3';
    case 5: return q.includes('sus') ? '4' : '11';
    case 6: return has(ivs, 6) && !has(ivs, 7) ? '♭5' : '♯11';
    case 7: return '5';
    case 8: return has(ivs, 8) && !has(ivs, 7) ? '♯5' : '♭13';
    case 9: return q === 'dim7' ? '♭♭7' : (has(ivs, 9) && !has(ivs, 10) && !has(ivs, 11)) ? '6' : '13';
    case 10: return '♭7';
    default: return '7';
  }
}

// ---- register helpers ----
const mod12 = x => ((x % 12) + 12) % 12;
// lowest midi ≥ lo with this pitch class
const placeAbove = (pc, lo) => lo + mod12(pc - lo);
// the midi of `pc` nearest to `ref` (ties go down)
function nearest(pc, ref) {
  let m = ref + mod12(pc - ref);
  if (m - ref > 6) m -= 12;
  return m;
}
function clamp(m, lo, hi) {
  while (m < lo) m += 12;
  while (m > hi) m -= 12;
  return m;
}

const mk = (root, quality, iv, midi, extra = {}) =>
  ({ pc: mod12(root + iv), iv: mod12(iv), label: ivLabel(iv, quality), midi, ...extra });

// the four basic chord tones — root, a third, a fifth, a seventh (or 6th)
function basicTones(quality) {
  const ivs = qualityIntervals(quality);
  const first = cands => cands.find(c => ivs.includes(c));
  const out = [0];
  const third = first([4, 3, 5, 2]); if (third != null) out.push(third);
  const fifth = first([7, 6, 8]);    if (fifth != null) out.push(fifth);
  const seventh = first([10, 11]) ?? (ivs.includes(9) ? 9 : null);
  if (seventh != null) out.push(seventh);
  return out;
}

function pentFor(quality) {
  const q = quality || '';
  if (q === 'dim' || q === 'dim7') return [0, 3, 6, 9];
  if (q === 'm7b5') return [0, 3, 5, 6, 10];
  if (q === 'aug' || q === 'maj7#5') return [0, 2, 4, 8, 9];
  const fam = qualityFamily(q);
  if (fam === 'minor') return [0, 3, 5, 7, 10];
  if (fam === 'dom') {
    if (/#5|b5|b9|#9/.test(q)) return [1, 4, 6, 8, 10];   // altered: minor pentatonic a half step up
    if (q.includes('#11')) return [0, 2, 4, 6, 10];
    return [0, 2, 4, 7, 10];
  }
  return [0, 2, 4, 7, 9];
}

function upperFor(quality) {
  const q = quality || '';
  let set;
  if (q === 'dim' || q === 'dim7') set = [2, 5, 8, 11];
  else if (q === 'm7b5') set = [2, 5, 8];
  else {
    const fam = qualityFamily(q);
    if (fam === 'minor') set = [2, 5, 9];
    else if (fam === 'dom') {
      if (q === '7b9') set = [1, 3, 6, 9];                     // half–whole diminished colours
      else if (/#9|#5|b5/.test(q)) set = [1, 3, 6, 8];          // altered-scale colours
      else if (q.includes('#11')) set = [2, 6, 9];              // lydian dominant
      else set = [2, 9];
    }
    else set = [2, 6, 9];
  }
  const basic = new Set(basicTones(q));
  return set.filter(iv => !basic.has(iv));
}

// ---- walking bass over one chord ----
// `beats` of the chord, `next` the chord that follows (for the approach note).
function walkingBass(chord, next) {
  const { root, quality } = chord;
  const n = Math.max(1, Math.floor(chord.beats || 4));
  const basic = basicTones(quality);
  const third = basic[1] ?? 4, fifth = basic[2] ?? 7, seventh = basic[3] ?? 10;
  const rootMidi = placeAbove(root, 36);                       // C2..B2
  const tone = (iv, beat) => mk(root, quality, iv, clamp(rootMidi + iv, 28, 55), { beat });
  if (n === 1) return [tone(0, 0)];
  if (n === 2) return [tone(0, 0), tone(fifth, 1)];
  const out = [tone(0, 0)];
  const cycle = [third, fifth, seventh, fifth];
  for (let b = 1; b < n - 1; b++) out.push(tone(cycle[(b - 1) % cycle.length], b));
  // approach the next root by a half step — from below unless that note is a
  // tone of the current chord, then from above
  const nextRoot = next ? next.root : root;
  const chordPcs = new Set(basic.map(iv => mod12(root + iv)));
  const fromBelow = mod12(nextRoot - 1);
  const appPc = chordPcs.has(fromBelow) && !chordPcs.has(mod12(nextRoot + 1)) ? mod12(nextRoot + 1) : fromBelow;
  const prevMidi = out[out.length - 1].midi;
  const appMidi = clamp(nearest(appPc, prevMidi), 28, 55);
  out.push({ pc: appPc, iv: mod12(appPc - root), label: appPc === fromBelow ? 'ap↑' : 'ap↓', midi: appMidi, beat: n - 1 });
  return out;
}

// ---- the voice-led target-tone line ----
// One guide tone per chord, each the nearest to the previous target.
function targetFor(chord, prevMidi) {
  const gts = guideTones(chord.root, chord.quality);
  const ref = prevMidi ?? 67;
  let best = null;
  for (const gt of gts) {
    const m = nearest(gt.pc, ref);
    if (best == null || Math.abs(m - ref) < Math.abs(best - ref)) best = m;
  }
  if (best == null) best = nearest(chord.root, ref);
  best = clamp(best, 58, 81);
  return [mk(chord.root, chord.quality, best - chord.root, best)];
}
function targetLine(chords) {
  const out = [];
  let prev = null;
  for (const c of chords) {
    const t = targetFor(c, prev);
    out.push(t);
    prev = t[0].midi;
  }
  return out;
}

// ---- the dispatcher ----
// ctx: { prev: midi of the previous target (target line), next: the next chord (bass) }
function targetsFor(drill, chord, ctx = {}) {
  const { root, quality } = chord;
  const q = quality || '';
  const lo = placeAbove(root, 58);                         // Bb3..A4 — a mid register
  const stack = ivs => ivs.map(iv => mk(root, q, iv, lo + iv)); // ascending from the root
  const band = ivs => ivs.map(iv => mk(root, q, iv, clamp(lo + iv, 60, 74)));
  switch (drill) {
    case 'root':    return [mk(root, q, 0, lo)];
    case 'guide':   return band(guideTones(root, q).map(gt => mod12(gt.pc - root)));
    case 'targets': return targetFor(chord, ctx.prev);
    case 'arp':     return stack(basicTones(q));
    case 'scale':   return stack(scaleFor(q));
    case 'pent':    return stack(pentFor(q));
    case 'upper':   return band(upperFor(q));
    case 'bass':    return walkingBass(chord, ctx.next);
    default:        return stack(basicTones(q));
  }
}

// ---- grading ----
// A session tracks one chord: which targets have been hit, how many stray notes
// were played, and (ordered drills) which target is due next.
function newChordSession(targets, ordered) {
  return { targets, ordered: !!ordered, hits: new Set(), misses: 0, nextIdx: 0,
           complete: targets.length === 0 };
}

// grade one played/sung note → { result: 'hit' | 'again' | 'miss', idx, pc }
// 'again' = a target already hit (any octave) — neutral, not a stray.
function gradeNote(s, midi) {
  const pc = mod12(midi);
  const idxOfHit = [...s.hits].find(i => s.targets[i].pc === pc);
  if (s.ordered) {
    const due = s.targets[s.nextIdx];
    if (due && due.pc === pc) {
      s.hits.add(s.nextIdx); s.nextIdx++;
      s.complete = s.nextIdx >= s.targets.length;
      return { result: 'hit', idx: s.nextIdx - 1, pc };
    }
    if (idxOfHit != null) return { result: 'again', idx: idxOfHit, pc };
    s.misses++;
    return { result: 'miss', idx: s.nextIdx, pc };
  }
  const idx = s.targets.findIndex((t, i) => t.pc === pc && !s.hits.has(i));
  if (idx >= 0) {
    s.hits.add(idx);
    s.complete = s.hits.size >= s.targets.length;
    return { result: 'hit', idx, pc };
  }
  if (idxOfHit != null) return { result: 'again', idx: idxOfHit, pc };
  s.misses++;
  return { result: 'miss', idx: -1, pc };
}

// a chord passes when every target was found with at most one stray note per
// two targets (so a single-note drill has to be clean)
const chordPassed = s => s.complete && s.misses <= Math.floor(s.targets.length / 2);

export { DRILLS, SCALES, scaleFor, ivLabel, targetsFor, targetLine, walkingBass, newChordSession, gradeNote, chordPassed };
