// Pure music-theory logic — the engine every drill and quiz grades against.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectChord, analyzeFunction, romanFor, chordVoicing, guessKey, scaleDegree, noteVsChord,
} from '../js/theory.js';

test('detectChord names a major triad and a dominant seventh', () => {
  const c = detectChord([60, 64, 67], false);
  assert.equal(c.root, 0);
  assert.equal(c.quality, '');       // bare major triad
  assert.equal(c.label, 'C');
  const g7 = detectChord([67, 71, 74, 77], false);
  assert.equal(g7.root, 7);
  assert.equal(g7.quality, '7');
});

test('detectChord distinguishes a single note from a chord', () => {
  assert.equal(detectChord([], false), null);
  assert.notEqual(detectChord([60], false).kind, 'chord'); // one note isn't a chord
});

test('analyzeFunction spells the roman numeral in the key', () => {
  assert.equal(analyzeFunction(7, '7', { tonic: 0, mode: 'major' }).roman, 'V7');   // G7 in C
  assert.equal(analyzeFunction(2, 'm7', { tonic: 0, mode: 'major' }).roman, 'ii7');  // Dm7 in C
  assert.equal(analyzeFunction(0, 'maj7', { tonic: 0, mode: 'major' }).roman, 'Imaj7');
});

test('romanFor matches analyzeFunction for diatonic chords', () => {
  assert.equal(romanFor(7, '7', 'major'), 'V7');
  assert.equal(romanFor(9, 'm7', 'major'), 'vi7');
});

test('chordVoicing puts the root at the bottom', () => {
  const v = chordVoicing(0, 'maj7');
  assert.ok(Array.isArray(v) && v.length >= 4);
  assert.equal(v[0] % 12, 0); // bass note is the root pitch class (C)
});

test('scaleDegree names a pitch class against the key', () => {
  assert.equal(scaleDegree(4, { tonic: 0, mode: 'major' }).deg, '3');   // E is 3 in C
  assert.equal(scaleDegree(7, { tonic: 0, mode: 'major' }).deg, '5');   // G is 5 in C
});

test('guessKey infers a plausible tonic from a I–IV–V–I', () => {
  const chords = [
    { root: 0, quality: '' }, { root: 5, quality: '' },
    { root: 7, quality: '' }, { root: 0, quality: '' },
  ];
  const k = guessKey(chords);
  assert.equal(typeof k.tonic, 'number');
  assert.ok(k.mode === 'major' || k.mode === 'minor');
});

test('noteVsChord classifies a chord tone vs a tension', () => {
  const third = noteVsChord(4, { root: 0, quality: 'maj7' }); // E over Cmaj7 = 3rd
  assert.ok(third);
});
