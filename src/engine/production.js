// Dice roll -> resource production, honouring the robber block and the bank-shortage
// rule. Registers the `rollDice` action.

import { registerHandlers } from './actions.js';
import { rngFrom, commitRng, logMsg } from './state.js';
import { RESOURCES, ROBBER_HAND_LIMIT } from './constants.js';

function handSize(player) {
  return Object.values(player.resources).reduce((a, b) => a + b, 0);
}

/**
 * Distribute resources for a (non-7) roll. Mutates state (players + bank).
 * @returns {Object} perPlayerGains: { [playerId]: { [resource]: n } } actually granted.
 */
export function produce(state, roll) {
  // 1. Tentative gains from every matching, unblocked hex.
  const gains = state.players.map(() => Object.fromEntries(RESOURCES.map((r) => [r, 0])));
  for (const hex of state.board.hexes) {
    if (hex.token !== roll || hex.id === state.board.robberHex || !hex.resource) continue;
    for (const vId of hex.vertices) {
      const b = state.board.vertices[vId].building;
      if (!b) continue;
      gains[b.player][hex.resource] += b.type === 'city' ? 2 : 1;
    }
  }

  // 2. Apply the bank-shortage rule per resource.
  for (const r of RESOURCES) {
    const claimants = gains.filter((g) => g[r] > 0);
    const demand = claimants.reduce((a, g) => a + g[r], 0);
    if (demand === 0) continue;
    if (demand <= state.bank[r]) {
      for (const g of gains) { state.bank[r] -= g[r]; }
    } else if (claimants.length === 1) {
      const give = state.bank[r]; // give whatever is left to the sole claimant
      state.bank[r] -= give;
      claimants[0][r] = give;
      for (const g of gains) if (g !== claimants[0]) g[r] = 0;
    } else {
      for (const g of gains) g[r] = 0; // shortage affecting many -> nobody gets it
    }
  }

  // 3. Credit players.
  const perPlayerGains = {};
  gains.forEach((g, pid) => {
    for (const r of RESOURCES) state.players[pid].resources[r] += g[r];
    const nonEmpty = Object.fromEntries(Object.entries(g).filter(([, n]) => n > 0));
    if (Object.keys(nonEmpty).length) perPlayerGains[pid] = nonEmpty;
  });
  return perPlayerGains;
}

registerHandlers({
  rollDice(state) {
    if (state.phase !== 'roll') throw new Error('Not in the roll phase');
    const rng = rngFrom(state);
    const d1 = rng.rollDie();
    const d2 = rng.rollDie();
    commitRng(state, rng);
    state.dice = [d1, d2];
    const sum = d1 + d2;
    state.lastRoll = sum;
    logMsg(state, `${state.players[state.current].name} rolled ${sum} (${d1}+${d2}).`);

    if (sum === 7) {
      state.robberReturnPhase = 'main'; // roller resumes their turn after the robber
      state.pendingDiscards = state.players
        .filter((p) => handSize(p) > ROBBER_HAND_LIMIT)
        .map((p) => p.id);
      state.phase = state.pendingDiscards.length ? 'discard' : 'moveRobber';
      logMsg(state, 'Rolled a 7 — the robber stirs!');
    } else {
      const gains = produce(state, sum);
      state.phase = 'main';
      const summary = Object.entries(gains)
        .map(([pid, g]) => `${state.players[pid].name}: ${Object.entries(g).map(([r, n]) => `${n} ${r}`).join(', ')}`)
        .join('; ');
      if (summary) logMsg(state, `Produced — ${summary}.`);
    }
  },
});
