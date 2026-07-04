// theory.js — pitch names, chord-symbol parsing, voicings, roman numerals.
// Ported from otolab's analyzer, trimmed to what the drills need.

const NOTE_NAMES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const NOTE_NAMES_FLAT  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];

const FLAT_MAJOR_TONICS = new Set([5, 10, 3, 8, 1, 6]);   // F Bb Eb Ab Db Gb
const FLAT_MINOR_TONICS = new Set([2, 7, 0, 5, 10, 3]);   // d g c f bb eb

function useFlats(tonicPc, mode) {
  return mode === 'minor' ? FLAT_MINOR_TONICS.has(tonicPc) : FLAT_MAJOR_TONICS.has(tonicPc);
}

function pcName(pc, flats) {
  return (flats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP)[((pc % 12) + 12) % 12];
}

// Chord quality → intervals from the root.
const QUALITY_INTERVALS = {
  '':        [0,4,7],
  'm':       [0,3,7],
  'dim':     [0,3,6],
  'aug':     [0,4,8],
  'sus4':    [0,5,7],
  'sus2':    [0,2,7],
  '7':       [0,4,7,10],
  'maj7':    [0,4,7,11],
  'm7':      [0,3,7,10],
  'm7b5':    [0,3,6,10],
  'dim7':    [0,3,6,9],
  '6':       [0,4,7,9],
  'm6':      [0,3,7,9],
  'mMaj7':   [0,3,7,11],
  '7sus4':   [0,5,7,10],
  'add9':    [0,2,4,7],
  'madd9':   [0,2,3,7],
  '6/9':     [0,2,4,9],
  '9':       [0,2,4,10],
  'maj9':    [0,2,4,11],
  'm9':      [0,2,3,10],
  'm11':     [0,3,5,10],
  '7b9':     [0,1,4,10],
  '7#9':     [0,3,4,10],
  '7#11':    [0,4,6,10],
  '13':      [0,4,9,10],
  'maj7#11': [0,4,6,11],
  '7#5':     [0,4,8,10],
  '7b5':     [0,4,6,10],
  'maj7#5':  [0,4,8,11],
};

// Common spellings on tab / chord sites → our canonical quality names.
const QUALITY_ALIASES = {
  '': '', 'maj': '', 'major': '',
  'm': 'm', 'min': 'm', 'minor': 'm', '-': 'm',
  'maj7': 'maj7', 'ma7': 'maj7', 'M7': 'maj7', 'Δ': 'maj7', 'Δ7': 'maj7',
  'm7': 'm7', 'min7': 'm7', '-7': 'm7',
  '7': '7', 'dom7': '7',
  'm7b5': 'm7b5', 'min7b5': 'm7b5', 'ø': 'm7b5', 'ø7': 'm7b5', '-7b5': 'm7b5',
  'dim': 'dim', '°': 'dim', 'o': 'dim',
  'dim7': 'dim7', '°7': 'dim7', 'o7': 'dim7',
  'aug': 'aug', '+': 'aug', '+5': 'aug',
  'sus': 'sus4', 'sus4': 'sus4', 'sus2': 'sus2',
  '7sus4': '7sus4', '7sus': '7sus4', '9sus4': '7sus4',
  '6': '6', 'maj6': '6', 'M6': '6',
  'm6': 'm6', 'min6': 'm6', '-6': 'm6',
  '6/9': '6/9', '69': '6/9', '6add9': '6/9',
  '9': '9', 'maj9': 'maj9', 'M9': 'maj9', 'm9': 'm9', 'min9': 'm9', '-9': 'm9',
  'add9': 'add9', 'add2': 'add9', 'madd9': 'madd9',
  'm11': 'm11', 'min11': 'm11', '11': 'm11',
  '13': '13', '7b9': '7b9', '7#9': '7#9', '7#11': '7#11',
  '7#5': '7#5', '7+5': '7#5', '7b5': '7b5', 'maj7#11': 'maj7#11', 'maj7#5': 'maj7#5',
  'mMaj7': 'mMaj7', 'mM7': 'mMaj7', 'minMaj7': 'mMaj7', 'mmaj7': 'mMaj7',
};

const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// 'F#m7/C#' → { root, quality, bass } (pcs), or null if it isn't a chord.
function parseChord(symbol) {
  if (!symbol) return null;
  let s = symbol.trim().replace(/\(([^)]*)\)/g, '$1'); // strip parens: m7(b5) → m7b5
  let bass = null;
  const slash = s.match(/^(.+)\/([A-G][#b]?)$/);
  if (slash && !s.endsWith('6/9')) { // 6/9 is a quality, not a slash chord
    s = slash[1];
    bass = LETTER_PC[slash[2][0]] + (slash[2][1] === '#' ? 1 : slash[2][1] === 'b' ? -1 : 0);
  }
  const m = s.match(/^([A-G])([#b]?)(.*)$/);
  if (!m) return null;
  const root = (LETTER_PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  let q = m[3].trim();
  let quality = QUALITY_ALIASES[q];
  if (quality === undefined) {
    // graceful fallbacks for exotic spellings
    if (/^m/.test(q)) quality = /7/.test(q) ? 'm7' : 'm';
    else if (/13/.test(q)) quality = '13';
    else if (/9/.test(q)) quality = '9';
    else if (/7/.test(q)) quality = '7';
    else if (/6/.test(q)) quality = '6';
    else return null; // e.g. lyrics word starting with A–G
  }
  return { root, quality, bass: bass == null ? null : ((bass + 12) % 12) };
}

// Compact keyboard voicing near middle C, plus a bass note an octave+ below.
function voicing(root, quality) {
  let ivs = QUALITY_INTERVALS[quality] || QUALITY_INTERVALS[''];
  const base = 60; // C4
  const notes = [...new Set(ivs.map(iv => base + (((root + iv) - base) % 12 + 12) % 12))]
    .sort((a, b) => a - b);
  return { notes, bass: 36 + root }; // bass in C2..B2
}

// ---- roman numerals / degrees ----

const DEGREE_NAMES = ['I','bII','II','bIII','III','IV','#IV','V','bVI','VI','bVII','VII'];
const DEGREE_TO_PC = { '1':0, 'b2':1, '2':2, 'b3':3, '3':4, '4':5, 'b5':6, '#4':6,
                       '5':7, 'b6':8, '6':9, 'b7':10, '7':11 };
const DEGREE_CHIPS = ['1','b2','2','b3','3','4','b5','5','b6','6','b7','7'];

const MINOR_QUALS = new Set(['m','m7','m6','m9','m11','madd9','mMaj7','dim','dim7','m7b5']);

function romanFor(deg, quality, mode) {
  let name = DEGREE_NAMES[deg];
  if (MINOR_QUALS.has(quality)) name = name.replace(/[IV]+/, s => s.toLowerCase());
  let suffix = quality;
  if (quality === 'm7')    suffix = '7';
  if (quality === 'm')     suffix = '';
  if (quality === 'm7b5')  suffix = 'ø7';
  if (quality === 'dim')   suffix = '°';
  if (quality === 'dim7')  suffix = '°7';
  if (quality === 'm6')    suffix = '6';
  if (quality === 'm9')    suffix = '9';
  if (quality === 'm11')   suffix = '11';
  if (quality === 'madd9') suffix = 'add9';
  if (quality === 'mMaj7') suffix = 'maj7';
  return name + suffix;
}

// Diatonic 7th chords by semitone degree (harmonic-minor V7 included, jazz convention).
const DIATONIC_MAJOR = { 0:'maj7', 2:'m7', 4:'m7', 5:'maj7', 7:'7', 9:'m7', 11:'m7b5' };
const DIATONIC_MINOR = { 0:'m7', 2:'m7b5', 3:'maj7', 5:'m7', 7:'7', 8:'maj7', 10:'7' };

function diatonicSevenths(key) {
  const table = key.mode === 'minor' ? DIATONIC_MINOR : DIATONIC_MAJOR;
  return Object.entries(table).map(([deg, q]) => {
    const d = Number(deg);
    return { root: (key.tonic + d) % 12, quality: q, deg: d, roman: romanFor(d, q, key.mode) };
  });
}

// Decoy romans for quiz chips that aren't in the song: common outside chords.
function outsideRomans(key) {
  const degs = key.mode === 'major'
    ? [[9,'7'],[2,'7'],[4,'7'],[1,'7'],[5,'m7'],[8,'maj7'],[10,'7'],[0,'7']]
    : [[2,'7'],[8,'7'],[1,'7'],[5,'maj7'],[0,'mMaj7'],[10,'m7']];
  return degs.map(([d, q]) => romanFor(d, q, key.mode));
}

// 'Em' / 'Bb' / 'F#m' → { tonic, mode }
function parseKey(str) {
  const m = str.trim().match(/^([A-G])([#b]?)(m|min|minor)?$/i);
  if (!m) return null;
  const tonic = (LETTER_PC[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  return { tonic, mode: m[3] ? 'minor' : 'major' };
}

function keyName(key) {
  return `${pcName(key.tonic, useFlats(key.tonic, key.mode))} ${key.mode}`;
}

// Guess a key from parsed chords: score diatonic hits, bonus for tonic bookends.
function guessKey(chords) {
  if (!chords.length) return null;
  const fits = (deg, quality, mode) => {
    const table = mode === 'minor' ? DIATONIC_MINOR : DIATONIC_MAJOR;
    const ref = table[deg];
    if (ref === undefined) return false;
    const minor = MINOR_QUALS.has(quality);
    if (ref === 'm7' || ref === 'm7b5') return minor;
    if (ref === 'maj7') return !minor && !/(^7|^9|^13)/.test(quality);
    return !minor; // dominant slot: any major-family or dom chord
  };
  let best = null;
  for (const mode of ['major', 'minor']) {
    for (let tonic = 0; tonic < 12; tonic++) {
      let score = 0;
      for (const c of chords) {
        if (fits(((c.root - tonic) + 12) % 12, c.quality, mode)) score += 1;
      }
      if (chords[0].root === tonic) score += 0.6;
      if (chords[chords.length - 1].root === tonic) score += 0.9;
      if (!best || score > best.score) best = { tonic, mode, score };
    }
  }
  return { tonic: best.tonic, mode: best.mode };
}

const INTERVALS = [
  { name: 'm2', semis: 1 },  { name: 'M2', semis: 2 },
  { name: 'm3', semis: 3 },  { name: 'M3', semis: 4 },
  { name: 'P4', semis: 5 },  { name: 'TT', semis: 6 },
  { name: 'P5', semis: 7 },  { name: 'm6', semis: 8 },
  { name: 'M6', semis: 9 },  { name: 'm7', semis: 10 },
  { name: 'M7', semis: 11 }, { name: 'P8', semis: 12 },
];

export {
  pcName, useFlats, parseChord, voicing, parseKey, keyName, guessKey,
  romanFor, diatonicSevenths, outsideRomans,
  DEGREE_TO_PC, DEGREE_CHIPS, INTERVALS, QUALITY_INTERVALS,
};
