// Special-card awards (Longest Road, Largest Army), victory-point scoring, and
// win detection. Recomputed after any action that can change the standings.

import { longestRoadLength } from './longestRoad.js';
import { logMsg } from './state.js';
import { VP, LONGEST_ROAD_MIN, LARGEST_ARMY_MIN } from './constants.js';

function buildingPoints(state, playerId) {
  let pts = 0;
  for (const v of state.board.vertices) {
    if (v.building && v.building.player === playerId) {
      pts += v.building.type === 'city' ? VP.city : VP.settlement;
    }
  }
  return pts;
}

/** Total victory points for a player (buildings + awards + VP dev cards). */
export function score(state, playerId) {
  let pts = buildingPoints(state, playerId);
  if (state.awards.longestRoad === playerId) pts += VP.longestRoad;
  if (state.awards.largestArmy === playerId) pts += VP.largestArmy;
  pts += state.players[playerId].dev.filter((c) => c.type === 'victoryPoint').length * VP.victoryPoint;
  return pts;
}

/** Reassign the Longest Road card per the rulebook's tie/reassignment rules. */
export function updateLongestRoad(state) {
  const lengths = state.players.map((p) => longestRoadLength(state, p.id));
  const max = Math.max(...lengths);
  const holder = state.awards.longestRoad;

  if (max < LONGEST_ROAD_MIN) {
    if (holder !== null) logMsg(state, 'Longest Road is now unclaimed.');
    state.awards.longestRoad = null;
    state.awards.longestRoadLen = 0;
    return;
  }
  // The holder keeps the card while still tied for (or holding) the lead.
  if (holder !== null && lengths[holder] === max) {
    state.awards.longestRoadLen = max;
    return;
  }
  const leaders = state.players.filter((p) => lengths[p.id] === max).map((p) => p.id);
  if (leaders.length === 1) {
    if (state.awards.longestRoad !== leaders[0]) {
      logMsg(state, `${state.players[leaders[0]].name} takes Longest Road (${max}).`);
    }
    state.awards.longestRoad = leaders[0];
    state.awards.longestRoadLen = max;
  } else {
    // Holder lost the lead and two or more tie -> set aside.
    state.awards.longestRoad = null;
    state.awards.longestRoadLen = 0;
  }
}

/** Reassign Largest Army: first to 3 knights; only a strictly larger army takes it. */
export function updateLargestArmy(state) {
  const knights = state.players.map((p) => p.playedKnights);
  const max = Math.max(...knights);
  const holder = state.awards.largestArmy;

  if (max < LARGEST_ARMY_MIN) {
    state.awards.largestArmy = null;
    state.awards.largestArmySize = 0;
    return;
  }
  if (holder !== null && knights[holder] === max) {
    state.awards.largestArmySize = max;
    return;
  }
  const leaders = state.players.filter((p) => knights[p.id] === max).map((p) => p.id);
  if (leaders.length === 1) {
    if (state.awards.largestArmy !== leaders[0]) {
      logMsg(state, `${state.players[leaders[0]].name} takes Largest Army (${max} knights).`);
    }
    state.awards.largestArmy = leaders[0];
    state.awards.largestArmySize = max;
  }
  // A tie above the holder (not reachable one-knight-at-a-time) leaves the card put.
}

/** Recompute both awards. */
export function updateAwards(state) {
  updateLongestRoad(state);
  updateLargestArmy(state);
}

/** Declare a winner if the current player has reached the target on their turn. */
export function checkWin(state) {
  if (state.phase === 'setup' || state.phase === 'gameOver') return;
  const pid = state.current;
  const pts = score(state, pid);
  if (pts >= state.config.targetVP) {
    state.winner = pid;
    state.phase = 'gameOver';
    logMsg(state, `${state.players[pid].name} wins with ${pts} victory points!`);
  }
}
