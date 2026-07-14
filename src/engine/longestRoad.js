// Longest Road: the longest continuous run of a player's roads, counting each road
// segment at most once (a trail — so a closed loop of 6 counts as 6). An opponent's
// settlement/city sitting on a vertex breaks continuity there: you may end at it but
// not pass through it.

/**
 * @returns {number} the length (in road segments) of the player's longest road.
 */
export function longestRoadLength(state, playerId) {
  const edges = state.board.edges.filter((e) => e.road === playerId);
  if (edges.length === 0) return 0;

  const incident = new Map(); // vertexId -> player's edges touching it
  for (const e of edges) {
    for (const v of e.vertices) {
      if (!incident.has(v)) incident.set(v, []);
      incident.get(v).push(e);
    }
  }

  const blockedByOpponent = (vId) => {
    const v = state.board.vertices[vId];
    return !!(v && v.building && v.building.player !== playerId);
  };

  const used = new Set();
  const dfs = (vId) => {
    let best = 0;
    for (const e of incident.get(vId) || []) {
      if (used.has(e.id)) continue;
      const other = e.vertices[0] === vId ? e.vertices[1] : e.vertices[0];
      used.add(e.id);
      // Count this segment; only continue past `other` if it isn't opponent-occupied.
      const candidate = blockedByOpponent(other) ? 1 : 1 + dfs(other);
      used.delete(e.id);
      if (candidate > best) best = candidate;
    }
    return best;
  };

  let longest = 0;
  for (const vId of incident.keys()) {
    const len = dfs(vId);
    if (len > longest) longest = len;
  }
  return longest;
}
