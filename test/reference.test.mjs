// Chord-symbol parsing + alignment grading — how every transcription is scored.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProgression, gradeProgression, alignSequences } from '../js/reference.js';

test('parseProgression reads bar lines and shorthand', () => {
  const p = parseProgression('Dm7 | G7 | Cmaj7');
  assert.equal(p.length, 3);
  assert.equal(p[0].root, 2);   // D
  assert.equal(p[2].root, 0);   // C
});

test('an identical progression grades 100%', () => {
  const ref = parseProgression('Dm7 G7 Cmaj7');
  const g = gradeProgression(ref, ref);
  assert.equal(g.pct, 100);
});

test('right root wrong quality is partial credit, not zero', () => {
  const user = parseProgression('C7');   // right root, wrong quality
  const ref = parseProgression('Cmaj7');
  const g = gradeProgression(user, ref);
  assert.ok(g.pct > 0 && g.pct < 100);
});

test('a completely wrong chord scores low', () => {
  const g = gradeProgression(parseProgression('F#m7'), parseProgression('Cmaj7'));
  assert.ok(g.pct < 60);
});

test('alignSequences handles a missed (inserted) chord', () => {
  const ref = parseProgression('Dm7 G7 Cmaj7');
  const user = parseProgression('Dm7 Cmaj7'); // dropped the G7
  const g = gradeProgression(user, ref);
  assert.ok(g.pct > 0 && g.pct < 100);
  assert.equal(g.pairs.length >= ref.length, true);
});
