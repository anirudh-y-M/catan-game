// Small seedable PRNG (mulberry32). Injected into the game so shuffles and dice
// are deterministic and reproducible — which makes the engine unit-testable and
// lets us save/restore a game mid-stream.

/**
 * @param {number} seed  Any 32-bit-ish integer.
 * @returns RNG with float/int/pick/shuffle/rollDie plus state()/restore() for persistence.
 */
export function createRng(seed) {
  let a = seed >>> 0;

  function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  const rng = {
    /** Float in [0, 1). */
    next,
    /** Integer in [0, n). */
    int(n) {
      return Math.floor(next() * n);
    },
    /** A random element of arr. */
    pick(arr) {
      return arr[rng.int(arr.length)];
    },
    /** Fisher–Yates shuffle; returns a new array (does not mutate input). */
    shuffle(arr) {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    /** A single die: 1..6. */
    rollDie() {
      return rng.int(6) + 1;
    },
    /** Current internal state (for persistence). */
    state() {
      return a >>> 0;
    },
    /** Restore a previously captured state. */
    restore(s) {
      a = s >>> 0;
    },
  };

  return rng;
}
