// Robber sequence: discard-on-7, move the robber, steal a card. Reached from a rolled
// 7 (via production) or from a played Knight (via devcards). Registers discard/
// moveRobber/steal actions.

import { registerHandlers, currentPlayer } from './actions.js';
import { rngFrom, commitRng, logMsg } from './state.js';
import { RESOURCES, ROBBER_HAND_LIMIT } from './constants.js';

function handSize(player) {
  return Object.values(player.resources).reduce((a, b) => a + b, 0);
}

/** Opponents of the current player who have a building on `hexId` and ≥1 card. */
export function robberCandidates(state, hexId) {
  const found = new Set();
  for (const vId of state.board.hexes[hexId].vertices) {
    const b = state.board.vertices[vId].building;
    if (b && b.player !== state.current && handSize(state.players[b.player]) > 0) {
      found.add(b.player);
    }
  }
  return [...found];
}

function afterRobberMove(state, hexId) {
  state.board.robberHex = hexId;
  logMsg(state, `Robber moved to the ${state.board.hexes[hexId].terrain}.`);
  state.stealCandidates = robberCandidates(state, hexId);
  state.phase = state.stealCandidates.length ? 'steal' : 'main';
}

registerHandlers({
  discard(state, { playerId, cards }) {
    if (state.phase !== 'discard') throw new Error('Not in the discard phase');
    if (!state.pendingDiscards.includes(playerId)) throw new Error('This player has no discard due');
    const player = state.players[playerId];
    const required = Math.floor(handSize(player) / 2);
    const total = Object.values(cards).reduce((a, b) => a + b, 0);
    if (total !== required) throw new Error(`Must discard exactly ${required} cards`);
    for (const [r, n] of Object.entries(cards)) {
      if ((player.resources[r] || 0) < n) throw new Error(`Not enough ${r} to discard`);
    }
    for (const [r, n] of Object.entries(cards)) {
      player.resources[r] -= n;
      state.bank[r] += n;
    }
    logMsg(state, `${player.name} discarded ${required} cards.`);
    state.pendingDiscards = state.pendingDiscards.filter((id) => id !== playerId);
    if (state.pendingDiscards.length === 0) state.phase = 'moveRobber';
  },

  moveRobber(state, { hexId }) {
    if (state.phase !== 'moveRobber') throw new Error('Not expecting a robber move');
    if (hexId === state.board.robberHex) throw new Error('Robber must move to a different hex');
    afterRobberMove(state, hexId);
  },

  steal(state, { targetPlayerId }) {
    if (state.phase !== 'steal') throw new Error('Not expecting a steal');
    if (!state.stealCandidates.includes(targetPlayerId)) throw new Error('Invalid steal target');
    const victim = state.players[targetPlayerId];
    const pool = [];
    for (const r of RESOURCES) for (let i = 0; i < victim.resources[r]; i++) pool.push(r);
    if (pool.length > 0) {
      const rng = rngFrom(state);
      const stolen = rng.pick(pool);
      commitRng(state, rng);
      victim.resources[stolen] -= 1;
      currentPlayer(state).resources[stolen] += 1;
      logMsg(state, `${currentPlayer(state).name} stole a card from ${victim.name}.`);
    }
    state.stealCandidates = [];
    state.phase = 'main';
  },
});

export { afterRobberMove };
