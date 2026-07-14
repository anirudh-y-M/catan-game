import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/engine/rng.js';

test('same seed yields identical sequences', () => {
  const a = createRng(12345);
  const b = createRng(12345);
  const seqA = Array.from({ length: 10 }, () => a.next());
  const seqB = Array.from({ length: 10 }, () => b.next());
  assert.deepEqual(seqA, seqB);
});

test('different seeds differ', () => {
  const a = createRng(1);
  const b = createRng(2);
  assert.notEqual(a.next(), b.next());
});

test('next() stays in [0,1), int(n) in [0,n), rollDie in [1,6]', () => {
  const r = createRng(999);
  for (let i = 0; i < 1000; i++) {
    const f = r.next();
    assert.ok(f >= 0 && f < 1);
    const n = r.int(6);
    assert.ok(n >= 0 && n < 6);
    const d = r.rollDie();
    assert.ok(d >= 1 && d <= 6);
  }
});

test('shuffle is a permutation and does not mutate input', () => {
  const r = createRng(42);
  const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const out = r.shuffle(input);
  assert.deepEqual(input, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]); // unchanged
  assert.equal(out.length, input.length);
  assert.deepEqual([...out].sort((a, b) => a - b), input); // same multiset
});

test('state()/restore() reproduce subsequent values', () => {
  const r = createRng(7);
  r.next();
  r.next();
  const snap = r.state();
  const after = [r.next(), r.next(), r.next()];
  r.restore(snap);
  assert.deepEqual([r.next(), r.next(), r.next()], after);
});
