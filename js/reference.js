// reference.js — parse pasted chord symbols ("Fmaj7 | Dm7 G7 | C") into the
// app's chord vocabulary, and grade a transcription against them by sequence
// alignment (Needleman–Wunsch), so a missed or extra chord shifts instead of
// wrecking everything after it.

import { qualityFamily } from './theory.js';

const ROOT_PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

// symbol suffix → quality name used by theory.js QUALITIES
const QUAL_ALIASES = {
  '': '', 'maj': '', 'major': '', 'M': '',
  'm': 'm', 'min': 'm', 'minor': 'm', '-': 'm',
  '5': '',
  '7': '7', 'dom7': '7',
  'maj7': 'maj7', 'M7': 'maj7', 'ma7': 'maj7', 'Δ': 'maj7', 'Δ7': 'maj7', '△7': 'maj7',
  'm7': 'm7', 'min7': 'm7', '-7': 'm7',
  'm7b5': 'm7b5', 'min7b5': 'm7b5', 'ø': 'm7b5', 'ø7': 'm7b5', 'Ø7': 'm7b5', 'm7♭5': 'm7b5',
  'dim': 'dim', '°': 'dim', 'o': 'dim',
  'dim7': 'dim7', '°7': 'dim7', 'o7': 'dim7',
  'aug': 'aug', '+': 'aug', '#5': 'aug',
  '6': '6', 'maj6': '6', 'M6': '6',
  'm6': 'm6', 'min6': 'm6', '-6': 'm6',
  'mMaj7': 'mMaj7', 'mM7': 'mMaj7', 'minmaj7': 'mMaj7', 'm(maj7)': 'mMaj7', '-Δ7': 'mMaj7',
  'sus': 'sus4', 'sus4': 'sus4', 'sus2': 'sus2', '7sus': '7sus4', '7sus4': '7sus4',
  'add9': 'add9', 'madd9': 'madd9', '6/9': '6/9', '69': '6/9',
  '9': '9', 'maj9': 'maj9', 'M9': 'maj9', 'm9': 'm9', 'min9': 'm9', '-9': 'm9',
  'm11': 'm11', '11': 'm11',
  '7b9': '7b9', '7♭9': '7b9', '7#9': '7#9', '7♯9': '7#9',
  '7#11': '7#11', '13': '13', 'maj7#11': 'maj7#11',
  '7#5': '7#5', '7+': '7#5', '7b5': '7b5', 'maj7#5': 'maj7#5',
};

function parseAccidental(pc, acc) {
  if (acc === '#' || acc === '♯') return (pc + 1) % 12;
  if (acc === 'b' || acc === '♭') return (pc + 11) % 12;
  return pc;
}

// "F#m7b5" → { root, quality, bass, raw }; unknown suffix → quality null
// (still gradeable on the root). Non-chord tokens → null.
function parseChordSymbol(tok) {
  const m = tok.match(/^([A-Ga-g])([#♯b♭]?)(.*)$/);
  if (!m) return null;
  const root = parseAccidental(ROOT_PC[m[1].toLowerCase()], m[2]);
  let rest = m[3];
  let bass = null;
  const slash = rest.match(/\/([A-Ga-g])([#♯b♭]?)$/);
  if (slash && rest !== '6/9') {
    bass = parseAccidental(ROOT_PC[slash[1].toLowerCase()], slash[2]);
    rest = rest.slice(0, slash.index);
  }
  let quality = QUAL_ALIASES[rest];
  if (quality === undefined) quality = QUAL_ALIASES[rest.toLowerCase()];
  if (quality === undefined) quality = null;
  return { root, quality, bass, raw: tok };
}

// whole pasted string → chord list; bars (|), commas, repeats (%) ignored
function parseProgression(text) {
  const toks = (text || '').split(/[\s|,·]+/);
  const out = [];
  for (const t of toks) {
    if (!t || t === '%' || t === '/' || t === '-' || t === ':') continue;
    const c = parseChordSymbol(t);
    if (c) out.push(c);
  }
  return out;
}

// 1 exact · 0.75 right root + right family (C6 vs Cmaj7) · 0.5 right root · 0 wrong
function pairScore(a, b) {
  if (!a || !b || a.root !== b.root) return 0;
  if (a.quality == null || b.quality == null) return 0.5;
  if (a.quality === b.quality) return 1;
  if (qualityFamily(a.quality) === qualityFamily(b.quality)) return 0.75;
  return 0.5;
}

// Generic Needleman–Wunsch alignment of two sequences under any pair scorer.
// user & ref: arrays → { pairs, total, refCount, pct }
// pairs: { user, ref, score } — user null = you missed one, ref null = extra
function alignSequences(user, ref, scoreFn, GAP = -0.25) {
  const n = user.length, m = ref.length;
  const S = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) S[i][0] = i * GAP;
  for (let j = 1; j <= m; j++) S[0][j] = j * GAP;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      S[i][j] = Math.max(
        S[i - 1][j - 1] + scoreFn(user[i - 1], ref[j - 1]),
        S[i - 1][j] + GAP,
        S[i][j - 1] + GAP,
      );
    }
  }
  const pairs = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && S[i][j] === S[i - 1][j - 1] + scoreFn(user[i - 1], ref[j - 1])) {
      pairs.unshift({ user: user[i - 1], ref: ref[j - 1], score: scoreFn(user[i - 1], ref[j - 1]) });
      i--; j--;
    } else if (i > 0 && (j === 0 || S[i][j] === S[i - 1][j] + GAP)) {
      pairs.unshift({ user: user[i - 1], ref: null, score: 0 });
      i--;
    } else {
      pairs.unshift({ user: null, ref: ref[j - 1], score: 0 });
      j--;
    }
  }
  const total = pairs.reduce((s, p) => s + p.score, 0);
  return { pairs, total, refCount: m, pct: m ? Math.round((100 * total) / m) : 0 };
}

function gradeProgression(user, ref) {
  return alignSequences(user, ref, pairScore);
}

export { parseChordSymbol, parseProgression, gradeProgression, alignSequences };
