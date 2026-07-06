// The progression gates: a unit is mastered only when its goal items are both
// accurate AND fluent, and a completed unit decays back into the pool when its
// accuracy falls. These drive what the "path" tab shows and what the daily
// workout picks, so they're worth pinning down. Driven through the real
// progress store — no DOM, no localStorage shim (both are guarded).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { record, reset } from '../js/progress.js';
import { masteryOf, reconcile, isComplete } from '../js/curriculum.js';

// int-perfect: cat 'intervals', goalItems P4/P5/M3/m3, goalPct 85, goalCount 20.
const rep = (items, n, ok, ms) => {
  for (let i = 0; i < n; i++) for (const id of items) record('intervals', id, ok, { ms });
};

test('mastery needs fluency, not just accuracy: slow-but-correct is not done', () => {
  reset();
  const items = ['P4', 'P5', 'M3', 'm3'];
  rep(items, 5, true, 8000);            // 20 correct, but laboured (median 8000ms)

  let m = masteryOf('int-perfect');
  assert.equal(m.seen, 20);
  assert.equal(m.pct, 100);             // accurate…
  assert.equal(m.fluent, false);        // …but not fluent
  assert.equal(m.met, false);
  reconcile();
  assert.equal(isComplete('int-perfect'), false, 'a slow unit should not complete');

  // Now recall the same items quickly — the median drops under the fluency bar.
  rep(items, 25, true, 500);
  m = masteryOf('int-perfect');
  assert.equal(m.fluent, true);
  assert.equal(m.met, true);
  reconcile();
  assert.equal(isComplete('int-perfect'), true, 'fluent + accurate completes the unit');
});

test('a completed unit decays back into the pool when its accuracy falls', () => {
  reset();
  const items = ['P4', 'P5', 'M3', 'm3'];
  rep(items, 5, true, 500);             // 20 fast correct → mastered
  reconcile();
  assert.equal(isComplete('int-perfect'), true);

  // Sustained misses pull cumulative accuracy below goalPct - margin (85 - 12).
  rep(items, 5, false, 500);            // 20 correct + 20 wrong → 50%
  assert.ok(masteryOf('int-perfect').pct < 73);
  reconcile();
  assert.equal(isComplete('int-perfect'), false, 'decayed unit should re-lock');

  // Re-earning accuracy re-completes it — the gate is symmetric.
  rep(items, 30, true, 500);
  reconcile();
  assert.equal(isComplete('int-perfect'), true, 'a re-mastered unit completes again');
});
