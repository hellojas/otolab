// Tests for the chord-suggestion decoder in listen.js: the pure parts —
// template scoring and the online Viterbi smoother — fed synthetic chroma.
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchScores, makeDecoder } from '../js/listen.js';

// build a normalized chroma for a chord: chord tones hot, everything else at
// a noise floor, plus optional overtone leakage (fifth of the root) and jitter
function chroma(pcs, { noise = 0.08, leak = 0.25, jitter = 0 } = {}) {
  const c = new Array(12).fill(noise);
  for (const pc of pcs) c[pc % 12] = 1;
  c[(pcs[0] + 7) % 12] = Math.max(c[(pcs[0] + 7) % 12], leak); // 3rd harmonic
  if (jitter) for (let i = 0; i < 12; i++) c[i] += Math.random() * jitter;
  const m = Math.max(...c);
  return c.map(v => v / m);
}

const C = [0, 4, 7], F = [5, 9, 0], Am7 = [9, 0, 4, 7];

test('matchScores ranks the sounding chord first', () => {
  const best = matchScores(chroma(C)).sort((a, b) => b.score - a.score)[0];
  assert.equal(best.root, 0);
  assert.equal(best.quality, '');
});

test('decoder detects a held chord and reports it once', () => {
  const d = makeDecoder();
  const hits = [];
  for (let i = 0; i < 8; i++) {
    const r = d.push(chroma(C, { jitter: 0.05 }));
    if (r) hits.push(r);
  }
  assert.equal(hits.length, 1);
  assert.deepEqual({ root: hits[0].root, quality: hits[0].quality }, { root: 0, quality: '' });
});

test('one noisy frame cannot flip the chord (Viterbi stickiness)', () => {
  const d = makeDecoder();
  const hits = [];
  for (let i = 0; i < 4; i++) { const r = d.push(chroma(C)); if (r) hits.push(r); }
  // a single garbage frame that looks vaguely F-ish
  const r1 = d.push(chroma(F, { noise: 0.5 }));
  if (r1) hits.push(r1);
  for (let i = 0; i < 4; i++) { const r = d.push(chroma(C)); if (r) hits.push(r); }
  assert.equal(hits.length, 1, `expected only C, got ${JSON.stringify(hits)}`);
  assert.equal(hits[0].root, 0);
});

test('decoder follows a real chord change', () => {
  const d = makeDecoder();
  const hits = [];
  for (let i = 0; i < 5; i++) { const r = d.push(chroma(C)); if (r) hits.push(r); }
  for (let i = 0; i < 6; i++) { const r = d.push(chroma(F)); if (r) hits.push(r); }
  for (let i = 0; i < 6; i++) { const r = d.push(chroma(Am7)); if (r) hits.push(r); }
  assert.deepEqual(hits.map(h => `${h.root}:${h.quality}`), ['0:', '5:', '9:m7']);
});

test('silence resets tracking but does not duplicate the suggestion', () => {
  const d = makeDecoder();
  for (let i = 0; i < 5; i++) d.push(chroma(C));
  d.push(null);
  // same chord after the gap: already suggested, stays quiet…
  const dupes = [];
  for (let i = 0; i < 5; i++) { const r = d.push(chroma(C)); if (r) dupes.push(r); }
  assert.equal(dupes.length, 0, 'no duplicate for the same chord');
  // …but a new chord still comes through
  const hits = [];
  for (let i = 0; i < 5; i++) { const r = d.push(chroma(F)); if (r) hits.push(r); }
  assert.equal(hits.length, 1);
  assert.equal(hits[0].root, 5);
});
