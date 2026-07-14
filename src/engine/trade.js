// Trading (maritime bank trades + domestic player trades) and endTurn.

import { registerHandlers, currentPlayer } from './actions.js';
import { logMsg } from './state.js';
import { portRate } from './rules.js';
import { RESOURCES } from './constants.js';

function requireMain(state) {
  if (state.phase !== 'main') throw new Error('Trading happens during your build phase');
}

function total(map) {
  return Object.values(map).reduce((a, b) => a + b, 0);
}

registerHandlers({
  // Give `rate` of one resource to the bank for 1 of another (rate from ports).
  bankTrade(state, { give, get }) {
    requireMain(state);
    if (!RESOURCES.includes(give) || !RESOURCES.includes(get)) throw new Error('Unknown resource');
    if (give === get) throw new Error('Cannot trade a resource for itself');
    const player = currentPlayer(state);
    const rate = portRate(state, player.id, give);
    if (player.resources[give] < rate) throw new Error(`Need ${rate} ${give} to trade`);
    if (state.bank[get] < 1) throw new Error(`The bank is out of ${get}`);

    player.resources[give] -= rate;
    state.bank[give] += rate;
    state.bank[get] -= 1;
    player.resources[get] += 1;
    logMsg(state, `${player.name} traded ${rate} ${give} for 1 ${get} with the bank.`);
  },

  // The current player proposes a swap to one opponent.
  offerPlayerTrade(state, { to, give, get }) {
    requireMain(state);
    const from = state.current;
    if (to === from) throw new Error('Choose an opponent to trade with');
    if (total(give) === 0 || total(get) === 0) throw new Error('A trade must go both ways');
    for (const r of Object.keys(give)) {
      if (get[r] > 0) throw new Error('Cannot trade a resource for the same resource');
    }
    state.pendingTrade = { from, to, give, get };
    logMsg(state, `${state.players[from].name} proposes a trade to ${state.players[to].name}.`);
  },

  resolvePlayerTrade(state, { accept }) {
    const t = state.pendingTrade;
    if (!t) throw new Error('No trade to resolve');
    if (accept) {
      const from = state.players[t.from];
      const to = state.players[t.to];
      for (const [r, n] of Object.entries(t.give)) if (from.resources[r] < n) throw new Error('Proposer lacks the offered cards');
      for (const [r, n] of Object.entries(t.get)) if (to.resources[r] < n) throw new Error('Partner lacks the requested cards');
      for (const [r, n] of Object.entries(t.give)) { from.resources[r] -= n; to.resources[r] += n; }
      for (const [r, n] of Object.entries(t.get)) { to.resources[r] -= n; from.resources[r] += n; }
      logMsg(state, `${to.name} accepted the trade.`);
    } else {
      logMsg(state, `${state.players[t.to].name} declined the trade.`);
    }
    state.pendingTrade = null;
  },

  endTurn(state) {
    if (state.phase !== 'main') throw new Error('You must roll before ending your turn');
    state.devPlayedThisTurn = false;
    state.freeRoads = 0;
    state.pendingTrade = null;
    state.current = (state.current + 1) % state.config.playerCount;
    state.turn += 1;
    state.phase = 'roll';
    logMsg(state, `${currentPlayer(state).name}'s turn.`);
  },
});
