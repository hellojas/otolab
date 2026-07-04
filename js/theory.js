// theory.js — pitch classes, chord detection, roman-numeral / functional analysis

const NOTE_NAMES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const NOTE_NAMES_FLAT  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];

// Keys whose signatures use flats (major tonics / minor tonics by pitch class)
const FLAT_MAJOR_TONICS = new Set([5, 10, 3, 8, 1, 6]);        // F Bb Eb Ab Db Gb
const FLAT_MINOR_TONICS = new Set([2, 7, 0, 5, 10, 3]);        // d g c f bb eb

function useFlats(tonicPc, mode) {
  return mode === 'minor' ? FLAT_MINOR_TONICS.has(tonicPc) : FLAT_MAJOR_TONICS.has(tonicPc);
}

function pcName(pc, flats) {
  return (flats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP)[((pc % 12) + 12) % 12];
}

function midiName(midi, flats) {
  return pcName(midi % 12, flats) + (Math.floor(midi / 12) - 1);
}

// Chord quality templates. `pcs` are intervals from the root; `opt` intervals
// may be omitted by the player (usually the 5th) and the chord still counts.
// Order matters: earlier entries win when an interval signature is ambiguous.
const QUALITIES = [
  { name: '',        pcs: [0,4,7],          opt: [] },
  { name: 'm',       pcs: [0,3,7],          opt: [] },
  { name: 'dim',     pcs: [0,3,6],          opt: [] },
  { name: 'aug',     pcs: [0,4,8],          opt: [] },
  { name: 'sus4',    pcs: [0,5,7],          opt: [] },
  { name: 'sus2',    pcs: [0,2,7],          opt: [] },
  { name: '7',       pcs: [0,4,7,10],       opt: [7] },
  { name: 'maj7',    pcs: [0,4,7,11],       opt: [7] },
  { name: 'm7',      pcs: [0,3,7,10],       opt: [7] },
  { name: 'm7b5',    pcs: [0,3,6,10],       opt: [] },
  { name: 'dim7',    pcs: [0,3,6,9],        opt: [] },
  { name: '6',       pcs: [0,4,7,9],        opt: [7] },
  { name: 'm6',      pcs: [0,3,7,9],        opt: [7] },
  { name: 'mMaj7',   pcs: [0,3,7,11],       opt: [7] },
  { name: '7sus4',   pcs: [0,5,7,10],       opt: [7] },
  { name: 'add9',    pcs: [0,2,4,7],        opt: [] },
  { name: 'madd9',   pcs: [0,2,3,7],        opt: [] },
  { name: '6/9',     pcs: [0,2,4,7,9],      opt: [7] },
  { name: '9',       pcs: [0,2,4,7,10],     opt: [7] },
  { name: 'maj9',    pcs: [0,2,4,7,11],     opt: [7] },
  { name: 'm9',      pcs: [0,2,3,7,10],     opt: [7] },
  { name: 'm11',     pcs: [0,2,3,5,7,10],   opt: [2,7] },
  { name: '7b9',     pcs: [0,1,4,7,10],     opt: [7] },
  { name: '7#9',     pcs: [0,3,4,7,10],     opt: [7] },
  { name: '7#11',    pcs: [0,4,6,7,10],     opt: [7] },
  { name: '13',      pcs: [0,2,4,7,9,10],   opt: [2,7] },
  { name: 'maj7#11', pcs: [0,4,6,7,11],     opt: [7] },
  { name: '7#5',     pcs: [0,4,8,10],       opt: [] },
  { name: '7b5',     pcs: [0,4,6,10],       opt: [] },
  { name: 'maj7#5',  pcs: [0,4,8,11],       opt: [] },
];

// signature "0,3,7,10" -> { name, prio }
const SIG_MAP = new Map();
(function buildSigMap() {
  QUALITIES.forEach((q, prio) => {
    const optSubsets = subsets(q.opt);
    for (const omit of optSubsets) {
      const set = q.pcs.filter(p => !omit.includes(p));
      if (set.length < 2) continue;
      const sig = set.slice().sort((a, b) => a - b).join(',');
      if (!SIG_MAP.has(sig)) SIG_MAP.set(sig, { name: q.name, prio });
    }
  });
  function subsets(arr) {
    return arr.reduce((acc, x) => acc.concat(acc.map(s => s.concat(x))), [[]]);
  }
})();

const INTERVAL_NAMES = ['unison','m2','M2','m3','M3','P4','TT','P5','m6','M6','m7','M7'];

// midiNotes: array of held MIDI note numbers.
// Returns { kind:'note'|'interval'|'chord'|'unknown', root, quality, bass, label(flats) }
function detectChord(midiNotes, flats) {
  if (!midiNotes || midiNotes.length === 0) return null;
  const sorted = [...midiNotes].sort((a, b) => a - b);
  const bassPc = sorted[0] % 12;
  const pcs = [...new Set(sorted.map(n => n % 12))];

  if (pcs.length === 1) {
    return { kind: 'note', root: bassPc, quality: null, bass: bassPc,
             label: pcName(bassPc, flats) };
  }
  if (pcs.length === 2) {
    const iv = (pcs[0] === bassPc ? pcs[1] - pcs[0] : pcs[0] - pcs[1] + 12) % 12;
    const other = pcs[0] === bassPc ? pcs[1] : pcs[0];
    return { kind: 'interval', root: bassPc, quality: null, bass: bassPc,
             label: `${pcName(bassPc, flats)}–${pcName(other, flats)} (${INTERVAL_NAMES[(iv + 12) % 12]})` };
  }

  const candidates = [];
  for (const r of pcs) {
    const sig = pcs.map(p => ((p - r) + 12) % 12).sort((a, b) => a - b).join(',');
    const hit = SIG_MAP.get(sig);
    if (hit) candidates.push({ root: r, quality: hit.name, prio: hit.prio });
  }
  if (candidates.length === 0) {
    return { kind: 'unknown', root: bassPc, quality: '?', bass: bassPc,
             label: pcs.map(p => pcName(p, flats)).join(' ') + ' (?)' };
  }
  candidates.sort((a, b) =>
    ((a.root === bassPc ? 0 : 1) - (b.root === bassPc ? 0 : 1)) || (a.prio - b.prio));
  const c = candidates[0];
  const slash = c.root !== bassPc ? '/' + pcName(bassPc, flats) : '';
  return { kind: 'chord', root: c.root, quality: c.quality, bass: bassPc,
           label: pcName(c.root, flats) + c.quality + slash };
}

function chordLabel(root, quality, bass, flats) {
  const slash = (bass != null && bass !== root) ? '/' + pcName(bass, flats) : '';
  return pcName(root, flats) + (quality || '') + slash;
}

// ---- Roman numeral / functional analysis ----

// Degree names relative to the tonic, major-scale reference (jazz convention:
// bIII, bVI, bVII even in minor keys).
const DEGREE_NAMES = ['I','bII','II','bIII','III','IV','#IV','V','bVI','VI','bVII','VII'];

const MINOR_QUALS = new Set(['m','m7','m6','m9','m11','madd9','mMaj7','dim','dim7','m7b5']);
const DOM_QUALS   = new Set(['7','9','13','7b9','7#9','7#11','7b13','7#5','7b5','7sus4']);
const MAJ_FAMILY  = new Set(['','maj7','6','add9','6/9','maj9','maj7#11','sus2','sus4','maj7#5','aug']);

// Diatonic 7th-chord qualities by scale degree (semitones above tonic).
const DIATONIC_MAJOR = { 0:'maj7', 2:'m7', 4:'m7', 5:'maj7', 7:'7', 9:'m7', 11:'m7b5' };
// natural minor + the harmonic-minor V7 everyone actually plays
const DIATONIC_MINOR = { 0:'m7', 2:'m7b5', 3:'maj7', 5:'m7', 7:'7', 8:'maj7', 10:'7' };

function qualityFamily(q) {
  if (MINOR_QUALS.has(q)) return 'minor';
  if (DOM_QUALS.has(q)) return 'dom';
  return 'major';
}

// Loose diatonic membership: same degree, compatible family.
function isDiatonic(deg, quality, mode) {
  const table = mode === 'minor' ? DIATONIC_MINOR : DIATONIC_MAJOR;
  const ref = table[deg];
  if (ref === undefined) return false;
  if (ref === 'm7b5') return quality === 'm7b5' || quality === 'dim';
  const fam = qualityFamily(quality);
  if (ref === 'm7') return fam === 'minor' && quality !== 'dim7' && quality !== 'm7b5' && quality !== 'dim';
  if (ref === 'maj7') return fam === 'major';
  if (ref === '7') return fam === 'dom' || quality === '' || quality === 'sus4';
  return false;
}

function romanFor(deg, quality, mode) {
  let name = DEGREE_NAMES[deg];
  // in minor, the flat degrees ARE the scale — still spelled bIII/bVI/bVII by convention
  const fam = qualityFamily(quality);
  if (fam === 'minor') name = name.replace(/[IV]+/, m => m.toLowerCase());
  let suffix = quality;
  if (quality === 'm7')   suffix = '7';
  if (quality === 'm')    suffix = '';
  if (quality === 'm7b5') suffix = 'ø7';
  if (quality === 'dim')  suffix = '°';
  if (quality === 'dim7') suffix = '°7';
  if (quality === 'm6')   suffix = '6';
  if (quality === 'm9')   suffix = '9';
  if (quality === 'mMaj7') suffix = 'maj7';
  return name + suffix;
}

// analyze(root, quality, key) -> { roman, tag, detail }
// key: { tonic: pc, mode: 'major'|'minor' }
function analyzeFunction(root, quality, key) {
  if (!key || quality == null) return null;
  const deg = ((root - key.tonic) + 12) % 12;
  const roman = romanFor(deg, quality, key.mode);
  const flats = useFlats(key.tonic, key.mode);
  const table = key.mode === 'minor' ? DIATONIC_MINOR : DIATONIC_MAJOR;
  // degree name cased by the diatonic chord that lives there (V7/ii, not V7/II)
  const degName = t => {
    const d = ((t - key.tonic) + 12) % 12;
    const name = DEGREE_NAMES[d];
    const ref = table[d];
    return (ref === 'm7' || ref === 'm7b5') ? name.toLowerCase() : name;
  };

  if (isDiatonic(deg, quality, key.mode)) {
    return { roman, tag: 'diatonic', detail: 'diatonic' };
  }

  const borrowed =
    (key.mode === 'major' && isDiatonic(deg, quality, 'minor')) ? { roman, tag: 'borrowed',
      detail: `borrowed from ${pcName(key.tonic, true)} minor (modal interchange)` } :
    (key.mode === 'minor' && isDiatonic(deg, quality, 'major')) ? { roman, tag: 'borrowed',
      detail: `borrowed from ${pcName(key.tonic, flats)} major` } : null;

  if (qualityFamily(quality) === 'dom') {
    const target = (root + 5) % 12;                      // resolves down a fifth
    const tDeg = ((target - key.tonic) + 12) % 12;
    if (table[tDeg] !== undefined && tDeg !== 0) {
      return { roman, tag: 'secondary',
               detail: `V7/${degName(target)} — secondary dominant of ${pcName(target, flats)}` };
    }
    // borrowed reading (e.g. bVII7 backdoor) beats a stretch tritone-sub reading
    if (borrowed) {
      if (deg === 10) borrowed.detail = 'backdoor dominant — ' + borrowed.detail;
      return borrowed;
    }
    const subTarget = (root + 11) % 12;                  // resolves down a half step
    const sDeg = ((subTarget - key.tonic) + 12) % 12;
    if (table[sDeg] !== undefined) {
      return { roman, tag: 'tritone-sub',
               detail: `subV7/${degName(subTarget)} — tritone sub resolving to ${pcName(subTarget, flats)}` };
    }
  }

  if (quality === 'dim7' || quality === 'dim') {
    const target = (root + 1) % 12;
    const tDeg = ((target - key.tonic) + 12) % 12;
    if (table[tDeg] !== undefined) {
      return { roman, tag: 'passing-dim',
               detail: `vii°7/${degName(target)} — leads up into ${pcName(target, flats)}` };
    }
  }

  if (borrowed) return borrowed;

  return { roman, tag: 'outside', detail: 'chromatic / outside the key' };
}

// Build the clickable palette for a key: diatonic 7ths + common outside chords.
// Each entry: { root, quality, roman, tag }
function paletteForKey(key) {
  const t = key.tonic;
  const table = key.mode === 'minor' ? DIATONIC_MINOR : DIATONIC_MAJOR;
  const diatonic = Object.entries(table).map(([deg, q]) => {
    const d = Number(deg);
    return { root: (t + d) % 12, quality: q, roman: romanFor(d, q, key.mode), tag: 'diatonic' };
  });

  const outside = [];
  const add = (deg, q) => {
    const root = (t + deg) % 12;
    const a = analyzeFunction(root, q, key);
    outside.push({ root, quality: q, roman: a.roman, tag: a.tag, detail: a.detail });
  };
  if (key.mode === 'major') {
    add(9, '7');   // V7/ii
    add(11, '7');  // V7/iii
    add(0, '7');   // I7 = V7/IV
    add(2, '7');   // V7/V
    add(4, '7');   // V7/vi
    add(1, '7');   // bII7 = subV7
    add(5, 'm7');  // iv — borrowed
    add(8, 'maj7');// bVImaj7 — borrowed
    add(10, '7');  // bVII7 — backdoor dominant
    add(1, 'dim7');// #i°7 passing
  } else {
    add(2, '7');   // V7/V
    add(5, '7');   // V7/bVII? (IV7 — dorian)
    add(8, '7');   // bVI7
    add(1, '7');   // bII7 = subV7
    add(0, 'm6');  // i m6
    add(0, 'mMaj7');
    add(5, 'maj7');// IVmaj7 (dorian color)
    add(11, 'dim7');
  }
  return { diatonic, outside };
}

// Guess the key from a list of {root, quality} chords: score diatonic hits,
// with a bonus for the first/last chord being the tonic.
function guessKey(chords) {
  if (!chords.length) return null;
  let best = null;
  for (const mode of ['major', 'minor']) {
    for (let tonic = 0; tonic < 12; tonic++) {
      let score = 0;
      for (const c of chords) {
        if (c.quality == null) continue;
        const deg = ((c.root - tonic) + 12) % 12;
        if (isDiatonic(deg, c.quality, mode)) score += 1;
      }
      const first = chords[0], last = chords[chords.length - 1];
      if (first && first.root === tonic) score += 0.6;
      if (last && last.root === tonic) score += 0.9;
      if (!best || score > best.score) best = { tonic, mode, score };
    }
  }
  return best;
}

// ---- voicings & voice leading ----

// A playable root-position voicing near middle C, bass root an octave down.
function chordVoicing(root, quality) {
  const sig = {
    '': [0,4,7], m: [0,3,7], dim: [0,3,6], aug: [0,4,8], sus2: [0,2,7], sus4: [0,5,7],
    '7': [0,4,7,10], maj7: [0,4,7,11], m7: [0,3,7,10], m7b5: [0,3,6,10], dim7: [0,3,6,9],
    '6': [0,4,7,9], m6: [0,3,7,9], mMaj7: [0,3,7,11], '7sus4': [0,5,7,10],
    '9': [0,4,7,10,14], maj9: [0,4,7,11,14], m9: [0,3,7,10,14],
    '7b9': [0,4,10,13], '7#9': [0,4,10,15], '7#11': [0,4,10,18], '13': [0,4,10,14,21],
    '7#5': [0,4,8,10], '7b5': [0,4,6,10], 'maj7#5': [0,4,8,11], 'maj7#11': [0,4,11,18],
    add9: [0,4,7,14], madd9: [0,3,7,14], '6/9': [0,4,9,14], m11: [0,3,10,14,17],
  }[quality] || [0,4,7];
  const r = 60 + ((root % 12) + 12) % 12;
  const anchor = r > 66 ? r - 12 : r;
  return [anchor - 12, ...sig.map(iv => anchor + iv)];
}

function qualityIntervals(quality) {
  const q = QUALITIES.find(x => x.name === (quality || ''));
  return q ? q.pcs : [0, 4, 7];
}

// The guide tones (3rd and 7th — the notes that define a chord's color and
// carry the motion in jazz voice leading). 6th chords use the 6th; sus
// chords use the suspension.
function guideTones(root, quality) {
  const ivs = qualityIntervals(quality);
  const tones = [];
  const third = ivs.includes(4) ? 4 : ivs.includes(3) ? 3 : ivs.includes(5) ? 5 : ivs.includes(2) ? 2 : null;
  if (third != null) tones.push({ deg: '3', pc: (root + third) % 12 });
  const seventh = ivs.includes(11) ? 11 : ivs.includes(10) ? 10
    : (ivs.includes(9) && !ivs.includes(10) && !ivs.includes(11)) ? 9 : null;
  if (seventh != null) tones.push({ deg: seventh === 9 ? '6' : '7', pc: (root + seventh) % 12 });
  return tones;
}

// How each guide tone of `prev` moves to the nearest tone of `cur`.
// Returns [{ deg, from, to, d }] with d in signed semitones (0 = common tone).
function voiceLeading(prev, cur) {
  const curPcs = qualityIntervals(cur.quality).map(iv => ((cur.root + iv) % 12 + 12) % 12);
  const moves = [];
  for (const gt of guideTones(prev.root, prev.quality)) {
    let best = null;
    for (const pc of curPcs) {
      const d = ((pc - gt.pc + 6) % 12 + 12) % 12 - 6;
      if (!best || Math.abs(d) < Math.abs(best.d)) best = { pc, d };
    }
    if (best) moves.push({ deg: gt.deg, from: gt.pc, to: best.pc, d: best.d });
  }
  return moves;
}

export {
  NOTE_NAMES_SHARP, NOTE_NAMES_FLAT, useFlats, pcName, midiName,
  detectChord, chordLabel, analyzeFunction, paletteForKey, guessKey, romanFor,
  qualityFamily, chordVoicing, qualityIntervals, guideTones, voiceLeading,
};
