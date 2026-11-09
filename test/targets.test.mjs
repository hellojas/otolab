// The target-tone engine behind the "blow" drill: what to play over each chord,
// how the sets are labelled, and how a played note is graded against them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DRILLS, targetsFor, targetLine, scaleFor, ivLabel, newChordSession, gradeNote, chordPassed,
} from '../js/targets.js';

const pcs = ts => ts.map(t => t.pc);
const labels = ts => ts.map(t => t.label);

test('every drill declares a label and an ordering rule', () => {
  for (const [id, d] of Object.entries(DRILLS)) {
    assert.equal(typeof d.label, 'string', id);
    assert.equal(typeof d.ordered, 'boolean', id);
  }
});

test('root / guide / arpeggio spell the chord tones', () => {
  const g7 = { root: 7, quality: '7', beats: 4 };
  assert.deepEqual(pcs(targetsFor('root', g7)), [7]);
  assert.deepEqual(pcs(targetsFor('guide', g7)).sort((a, b) => a - b), [5, 11]);   // B, F
  assert.deepEqual(labels(targetsFor('guide', g7)), ['3', '♭7']);
  assert.deepEqual(pcs(targetsFor('arp', g7)), [7, 11, 2, 5]);                      // G B D F ascending
  assert.deepEqual(labels(targetsFor('arp', { root: 0, quality: 'm7b5' })), ['R', '♭3', '♭5', '♭7']);
});

test('chord scale follows the quality and runs up from the root', () => {
  assert.deepEqual(scaleFor('m7'), [0, 2, 3, 5, 7, 9, 10]);          // dorian
  assert.deepEqual(scaleFor('7b9'), [0, 1, 3, 4, 6, 7, 10]);         // half–whole diminished
  const dm7 = targetsFor('scale', { root: 2, quality: 'm7', beats: 4 });
  assert.deepEqual(pcs(dm7), [2, 4, 5, 7, 9, 11, 0]);
  const midis = dm7.map(t => t.midi);
  for (let i = 1; i < midis.length; i++) assert.ok(midis[i] > midis[i - 1], 'scale ascends');
});

test('pentatonic and upper-structure sets fit the chord family', () => {
  assert.deepEqual(pcs(targetsFor('pent', { root: 0, quality: 'maj7' })), [0, 2, 4, 7, 9]);
  assert.deepEqual(pcs(targetsFor('pent', { root: 0, quality: 'm7' })), [0, 3, 5, 7, 10]);
  assert.deepEqual(labels(targetsFor('upper', { root: 0, quality: 'maj7' })), ['9', '♯11', '13']);
  assert.deepEqual(labels(targetsFor('upper', { root: 0, quality: 'm7' })), ['9', '11', '13']);
  assert.deepEqual(labels(targetsFor('upper', { root: 0, quality: '7b9' })), ['♭9', '♯9', '♯11', '13']); // diminished colours
  assert.deepEqual(labels(targetsFor('upper', { root: 0, quality: '7#9' })), ['♭9', '♯9', '♯11', '♭13']); // altered colours
  // tensions are never chord tones
  for (const q of ['maj7', 'm7', '7', 'm7b5', 'dim7', '7b9']) {
    const chordPcs = new Set(targetsFor('arp', { root: 0, quality: q }).map(t => t.pc));
    for (const t of targetsFor('upper', { root: 0, quality: q })) assert.ok(!chordPcs.has(t.pc), `${q}: ${t.label}`);
  }
});

test('walking bass: root, 3rd, 5th, then a chromatic approach into the next root', () => {
  const dm7 = { root: 2, quality: 'm7', beats: 4 };
  const g7 = { root: 7, quality: '7', beats: 4 };
  const line = targetsFor('bass', dm7, { next: g7 });
  assert.equal(line.length, 4);
  assert.deepEqual(line.map(t => t.beat), [0, 1, 2, 3]);
  assert.deepEqual(pcs(line).slice(0, 3), [2, 5, 9]);                  // D F A
  assert.ok(line[3].pc === 6 || line[3].pc === 8, 'approach a half step from G');
  // two-beat chords get root + fifth; one-beat chords just the root
  assert.deepEqual(pcs(targetsFor('bass', { ...dm7, beats: 2 }, { next: g7 })), [2, 9]);
  assert.deepEqual(pcs(targetsFor('bass', { ...dm7, beats: 1 }, { next: g7 })), [2]);
  for (const t of line) assert.ok(t.midi >= 28 && t.midi <= 55, 'bass register');
});

test('target-tone line voice-leads one guide tone per chord', () => {
  const chords = [
    { root: 2, quality: 'm7', beats: 2 }, { root: 7, quality: '7', beats: 2 }, { root: 0, quality: 'maj7', beats: 4 },
  ];
  const line = targetLine(chords);
  assert.equal(line.length, 3);
  for (const ts of line) assert.equal(ts.length, 1);
  // Dm7 → G7: F stays (common tone) or C → B — either way a step or less
  for (let i = 1; i < line.length; i++) assert.ok(Math.abs(line[i][0].midi - line[i - 1][0].midi) <= 2);
  for (const [t] of line) assert.ok(['3', '♭3', '7', '♭7', '6'].includes(t.label));
});

test('interval labels respect the chord: ♯9 on a 7♯9, ♭5 on a half-diminished, 4 on a sus', () => {
  assert.equal(ivLabel(3, '7#9'), '♯9');
  assert.equal(ivLabel(3, 'm7'), '♭3');
  assert.equal(ivLabel(6, 'm7b5'), '♭5');
  assert.equal(ivLabel(6, 'maj7'), '♯11');
  assert.equal(ivLabel(5, 'sus4'), '4');
  assert.equal(ivLabel(5, 'm7'), '11');
  assert.equal(ivLabel(9, '6'), '6');
  assert.equal(ivLabel(9, 'dim7'), '♭♭7');
});

test('grading, unordered: hits turn green once, repeats are neutral, strays are misses', () => {
  const s = newChordSession(targetsFor('guide', { root: 7, quality: '7' }), false);
  assert.equal(gradeNote(s, 11).result, 'hit');     // B
  assert.equal(gradeNote(s, 11 + 12).result, 'again'); // same pc, any octave
  assert.equal(gradeNote(s, 0).result, 'miss');     // C
  assert.equal(s.misses, 1);
  assert.equal(chordPassed(s), false, 'not all targets yet');
  assert.equal(gradeNote(s, 5).result, 'hit');      // F
  assert.equal(s.complete, true);
  assert.equal(chordPassed(s), true, 'one stray over two targets is still a pass');
});

test('grading, ordered: the next target must come next', () => {
  const s = newChordSession(targetsFor('arp', { root: 0, quality: 'maj7' }), true); // C E G B
  assert.equal(s.nextIdx, 0);
  assert.equal(gradeNote(s, 4).result, 'miss', 'E before C is out of order');
  assert.equal(gradeNote(s, 0).result, 'hit');
  assert.equal(s.nextIdx, 1);
  assert.equal(gradeNote(s, 0).result, 'again');
  gradeNote(s, 4); gradeNote(s, 7); gradeNote(s, 11);
  assert.equal(s.complete, true);
  assert.equal(chordPassed(s), true);
});

test('a chord with too many strays does not pass even when complete', () => {
  const s = newChordSession(targetsFor('root', { root: 0, quality: '' }), false);
  gradeNote(s, 1); gradeNote(s, 2); gradeNote(s, 0);
  assert.equal(s.complete, true);
  assert.equal(chordPassed(s), false);
});
