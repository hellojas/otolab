// The SRS / progress store: accuracy, response-time weighting, confusion pairs,
// schema migration, and cross-write merge. This is the memory the whole
// curriculum rests on, so it's the most important thing to have tests around.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  record, stats, confusions, catItemStats, exportData, importData, reset,
} from '../js/progress.js';

test('record tallies accuracy', () => {
  reset();
  record('interval', 'M3', true);
  record('interval', 'M3', false);
  record('interval', 'M3', true);
  const it = exportData().items.M3;
  assert.equal(it.seen, 3);
  assert.equal(it.correct, 2);
  assert.equal(stats().overall.pct, Math.round(200 / 3));
});

test('wrong answers with a guess build the confusion table', () => {
  reset();
  record('degrees', 'ii7', false, { guess: 'IV' });
  record('degrees', 'ii7', false, { guess: 'IV' });
  record('degrees', 'ii7', false, { guess: 'vi7' });
  assert.equal(exportData().items.ii7.confuse.IV, 2);
  const c = confusions('degrees');
  assert.equal(c[0].answer, 'ii7');
  assert.equal(c[0].guess, 'IV');
  assert.equal(c[0].n, 2);
});

test('response time weights the spacing: fluent recall earns more', () => {
  reset();
  record('t', 'fast', true, { ms: 800 });   // instant
  record('t', 'slow', true, { ms: 9000 });   // laboured
  const s = exportData().items;
  assert.ok(s.fast.ease > s.slow.ease, 'fluent hit should raise ease more');
  assert.ok(s.fast.intervalMin > s.slow.intervalMin, 'fluent hit should push the next review further');
  assert.equal(s.fast.msCount, 1);
  assert.equal(s.fast.msSum, 800);
});

test('catItemStats reports a median response time across a unit\'s items', () => {
  reset();
  record('intervals', 'P4', true, { ms: 1000 });
  record('intervals', 'P5', true, { ms: 3000 });
  record('intervals', 'M3', true, { ms: 5000 });   // per-item medians: 1000, 3000, 5000
  const s = catItemStats('intervals', ['P4', 'P5', 'M3']);
  assert.equal(s.medianMs, 3000);
  assert.equal(s.pct, 100);
});

test('catItemStats medianMs is null until response times are logged (back-compat)', () => {
  reset();
  record('intervals', 'P4', true);   // no ms
  record('intervals', 'P5', false);
  const s = catItemStats('intervals', ['P4', 'P5']);
  assert.equal(s.medianMs, null);
});

test('record without meta still works (back-compat)', () => {
  reset();
  record('q', 'maj7', true);
  const it = exportData().items.maj7;
  assert.equal(it.seen, 1);
  assert.equal(it.msCount, 0);
  assert.deepEqual(it.confuse, {});
});

test('a v1 store (no version, no ms/confuse fields) migrates cleanly on import', () => {
  reset();
  const v1 = {
    items: { M3: { seen: 4, correct: 3, streak: 1, ease: 2.3, intervalMin: 10, due: 0, cat: 'intervals' } },
    log: [], daily: { '2020-01-01': { total: 4, correct: 3 } },
  };
  assert.equal(importData(v1), true);
  const s = exportData();
  assert.equal(s.version, 2);
  assert.equal(s.items.M3.msSum, 0);
  assert.deepEqual(s.items.M3.confuse, {});
  assert.equal(catItemStats('intervals', ['M3']).correct, 3);
});

test('merge prefers the record with more attempts (no clobber)', () => {
  reset();
  record('x', 'a', true);                     // seen 1 locally
  importData({ version: 2, items: { a: { seen: 5, correct: 5, streak: 5, ease: 2.5, intervalMin: 100, due: 0, cat: 'x', msSum: 0, msCount: 0, confuse: {} } }, log: [], daily: {} });
  assert.equal(exportData().items.a.seen, 5); // the busier record survived
});

test('reset clears everything', () => {
  record('z', 'zz', true);
  reset();
  assert.equal(stats().overall.seen, 0);
  assert.deepEqual(exportData().items, {});
});
