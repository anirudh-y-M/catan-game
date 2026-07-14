# Catan Hot-Seat Web Game — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement
> this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a buildless, GitHub Pages-hosted base-game Catan playable 2–4 players
hot-seat, with 2 visual themes and 2 rule variants.

**Architecture:** Pure engine layer (no DOM, seedable RNG, `node --test`) under `src/engine/`
+ browser UI layer (SVG board, HUD, modals) under `src/ui/`, wired by `src/main.js`.
Single reducer `applyAction(state, action) → state` is the only mutation surface.

**Tech Stack:** Vanilla ES modules, SVG, CSS custom properties, `node --test`. No bundler.

## Global Constraints

- No build step; static files served from repo root. Include `.nojekyll`.
- Never `git push` (author pushes). Commit locally only.
- Faithful base-game constants (verbatim from spec §3): 19 hexes (4 forest,4 pasture,4 fields,3 hills,3 mountains,1 desert); 18 tokens (one each 2/12, two each 3-6/8-11; 6&8 red, no adjacent red in random); bank 19×5; dev deck 14 knight/5 VP/2 road-building/2 year-of-plenty/2 monopoly; pieces 5 settlement/4 city/15 road; costs road=brick+lumber, settlement=brick+lumber+wool+grain, city=3ore+2grain, dev=ore+wool+grain; VP settlement1/city2/LR2/LA2/VPcard1; ports 4×3:1 + five 2:1; robber >7 discard floor(n/2); LR ≥5 & branch-free & opponent-building breaks; LA ≥3 knights; ≤1 dev/turn, not the turn bought (VP exempt); bank-shortage rule.
- Standard target VP = 10; Quick Play = 8 + 1 bonus resource each after setup.
- 54 vertices, 72 edges on the 19-hex board (assert in tests).

## Shared data shapes (authoritative — all tasks depend on these)

```
Terrain = 'forest'|'pasture'|'fields'|'hills'|'mountains'|'desert'
Resource = 'lumber'|'wool'|'grain'|'brick'|'ore'
PortType = '3:1'|'lumber'|'wool'|'grain'|'brick'|'ore'
DevType  = 'knight'|'roadBuilding'|'yearOfPlenty'|'monopoly'|'victoryPoint'
Phase    = 'setup'|'roll'|'discard'|'moveRobber'|'steal'|'main'|'gameOver'

Hex    = { id, q, r, terrain, resource|null, token|null, vertices:[6 ids], edges:[6 ids] }
Vertex = { id, x, y, hexes:[1-3 ids], edges:[2-3 ids], adj:[2-3 vertexIds],
           port:portId|null, building:{ type:'settlement'|'city', player:playerId }|null }
Edge   = { id, x1,y1,x2,y2, vertices:[vId,vId], road:playerId|null }
Port   = { id, type:PortType, vertices:[vId,vId] }
Player = { id, name, color, resources:{brick,lumber,wool,grain,ore},
           dev:[{ type:DevType, boughtTurn, played:bool }], playedKnights,
           pieces:{ settlements, cities, roads } }   // pieces = remaining in supply
State  = { config, seed, rng, board:{hexes,vertices,edges,ports,robberHex},
           players:[Player], current, bank:{5 resources}, devDeck:[DevType],
           phase, turn, dice:[d1,d2]|null, devPlayedThisTurn, freeRoads,
           setup:{round,order:[idx],step,pointer,lastVertex}, pendingDiscards:[idx],
           awards:{longestRoad,longestRoadLen,largestArmy}, log:[str], winner }
```

---

## Phase 1 — Engine core

### Task 1: Constants
**Files:** Create `src/engine/constants.js`; Test `tests/constants.test.js`
**Produces:** `TERRAIN_COUNTS`, `TOKEN_MULTISET` (array of 18), `RED_TOKENS=[6,8]`, `PIPS`,
`RESOURCES`, `TERRAIN_RESOURCE` map, `BANK_PER_RESOURCE=19`, `DEV_DECK_COUNTS`,
`PIECE_LIMITS={settlements:5,cities:4,roads:15}`, `COSTS`, `VP={settlement,city,...}`,
`PORT_TYPES` (9-entry multiset), `PLAYER_COLORS`, `TARGET_VP={standard:10,quick:8}`.
- [ ] Test: `TOKEN_MULTISET` has length 18, one 2, one 12, two 6, two 8; sum of terrain counts = 19; dev counts sum 25 (knight14/VP5/rb2/yop2/mono2); PORT_TYPES length 9 with four `3:1`.
- [ ] Run `node --test tests/constants.test.js` → FAIL, then implement, then PASS. Commit.

### Task 2: Seedable RNG
**Files:** Create `src/engine/rng.js`; Test `tests/rng.test.js`
**Produces:** `createRng(seed) → { next():float, int(n):int, pick(arr), shuffle(arr):arr, rollDie():1-6, state():number, restore(n) }` (mulberry32).
- [ ] Test: same seed → identical `next()` sequence; `shuffle` is a permutation (same multiset); `int(6)` ∈ [0,6); `rollDie` ∈ [1,6]; `state()/restore()` reproduces subsequent values.
- [ ] FAIL → implement → PASS. Commit.

### Task 3: Board geometry
**Files:** Create `src/engine/board.js`; Test `tests/board.test.js`
**Consumes:** constants, rng.
**Produces:** `generateBoard({ mode:'random'|'beginner', rng }) → { hexes, vertices, edges, ports, robberHex }`. Internal helpers: axial hexes for `|q|,|r|,|q+r|≤2`; pointy-top pixel corners; dedupe vertices/edges by rounded key; build adjacency; place terrain+tokens; place 9 ports on fixed coastal vertex-pairs with shuffled types.
- [ ] Test: 19 hexes, 54 vertices, 72 edges, 9 ports. Desert hex has `token===null` and `resource===null`; all 18 non-desert have tokens matching `TOKEN_MULTISET`. `robberHex` = desert hex id.
- [ ] Test: every edge has exactly 2 vertices; every vertex lists 2–3 edges and 2–3 hexes; adjacency is symmetric (`a.adj∋b ⟺ b.adj∋a`).
- [ ] Test (random mode, fixed seed): no two red tokens (6/8) on adjacent hexes.
- [ ] Test (beginner mode): matches the fixed rulebook layout (spot-check 3 hex terrains+tokens).
- [ ] FAIL → implement → PASS. Commit.

### Task 4: State factory
**Files:** Create `src/engine/state.js`; Test `tests/state.test.js`
**Consumes:** constants, rng, board.
**Produces:** `createGame({ players:[{name,color}], variant, boardMode, seed, hideHands, theme }) → State` in `phase:'setup'`, snake `setup.order`, empty hands, full bank, shuffled `devDeck`; `cloneState(state)`; `logMsg(state,str)`.
- [ ] Test: 2–4 players accepted, `<2` or `>4` throws; bank starts 19 each; devDeck length 25; `setup.order` is snake (R1 forward, R2 reverse) length 2×N; `current` = first in order; `targetVP` from variant.
- [ ] FAIL → implement → PASS. Commit.

### Task 5: Rules / validators
**Files:** Create `src/engine/rules.js`; Test `tests/rules.test.js`
**Consumes:** state, board, constants.
**Produces:** `canPlaceSetupSettlement(state,vId)`, `canBuildSettlement(state,playerId,vId)` (distance rule + touches own road), `canBuildRoad(state,playerId,eId)` (empty + connects to own road/building, not through opponent building), `canBuildCity(state,playerId,vId)`, `canAfford(player,cost)`, `legalSettlementVertices(state,playerId)`, `legalRoadEdges(state,playerId)`, `legalCityVertices`, `portRate(state,playerId,resource) → 4|3|2`.
- [ ] Test: distance rule blocks a vertex adjacent to an existing building; allows a legal one.
- [ ] Test: road must connect to own network; blocked on occupied edge; a road cannot extend past an opponent's settlement on the shared vertex.
- [ ] Test: `portRate` returns 2 for a matching special port owner, 3 for generic port owner, else 4.
- [ ] FAIL → implement → PASS. Commit.

---

## Phase 2 — Turn loop

### Task 6: Setup phase actions
**Files:** Create `src/engine/actions.js` (start here); Test `tests/setup.test.js`
**Consumes:** rules, state.
**Produces:** `applyAction(state,action)` handling `placeSetupSettlement{vId}` and
`placeSetupRoad{eId}`; advances `setup.pointer/round/step`; grants 2nd-settlement starting
resources; transitions to `phase:'roll'` with `current` = last placer; applies Quick Play
bonus resource after setup.
- [ ] Test: full 3-player setup script places 6 settlements + 6 roads in snake order; illegal placement (distance/connection) throws; after 2nd settlement a player's resources equal the sum over adjacent producing hexes; phase becomes `roll` and starting player correct.
- [ ] Test: Quick Play grants exactly 1 extra resource per player post-setup.
- [ ] FAIL → implement → PASS. Commit.

### Task 7: Dice + production
**Files:** Create `src/engine/production.js`; extend `actions.js`; Test `tests/production.test.js`
**Consumes:** rng, board, state.
**Produces:** `produce(state, roll) → {perPlayerGains, bankAfter}` and `rollDice` action
that sets `state.dice`, runs production on non-7, honors robber block + bank-shortage rule,
then sets `phase:'main'`; on 7 sets `phase:'discard'` (or `moveRobber` if none over 7).
- [ ] Test: settlement on a hex yields 1, city yields 2; robber-blocked hex yields 0.
- [ ] Test: bank shortage — if 2 players each claim the last-but-one of a resource and bank can't cover both, neither receives it; single-player short case gives remainder.
- [ ] Test: rolling 7 with a player holding 9 cards → `phase:'discard'`, `pendingDiscards` includes them; nobody over 7 → `phase:'moveRobber'`.
- [ ] FAIL → implement → PASS. Commit.

### Task 8: Robber (discard/move/steal)
**Files:** Create `src/engine/robber.js`; extend `actions.js`; Test `tests/robber.test.js`
**Consumes:** rng, board, state.
**Produces:** `discard{playerId,cards}` (validates count = floor(hand/2), removes from
`pendingDiscards`, → `moveRobber` when empty), `moveRobber{hexId}` (must differ from current),
`steal{targetPlayerId}` (random card via rng; resolves adjacency candidates; → `main`).
`robberCandidates(state,hexId) → [playerId]`.
- [ ] Test: discard rejects wrong count; when last discarder finishes → `moveRobber`.
- [ ] Test: moveRobber to same hex throws; to new hex sets `robberHex` and computes candidates.
- [ ] Test: steal moves exactly 1 random card from target to mover; no-card target → no transfer; phase → `main`.
- [ ] FAIL → implement → PASS. Commit.

---

## Phase 3 — Economy & endgame

### Task 9: Building actions
**Files:** extend `actions.js`; Test `tests/build.test.js`
**Consumes:** rules, awards (fwd ref), state.
**Produces:** `buildRoad{eId}` (pays cost unless `freeRoads>0`, decrements piece supply),
`buildSettlement{vId}`, `buildCity{vId}` (returns settlement to supply, places city). Each
checks affordability + legality + supply, returns resources to bank, recomputes awards/win.
- [ ] Test: building deducts exact cost to bank and decrements supply; over-supply throws (e.g. 6th settlement); unaffordable throws.
- [ ] Test: city upgrade replaces settlement, +1 to settlement supply, -1 city supply, doubles production at that vertex.
- [ ] FAIL → implement → PASS. Commit.

### Task 10: Longest Road graph
**Files:** Create `src/engine/longestRoad.js`; Test `tests/longestRoad.test.js`
**Consumes:** board, state.
**Produces:** `longestRoadLength(state, playerId) → int` — DFS longest simple path over the
player's road edges, not passing through a vertex occupied by an opponent building.
- [ ] Test: straight line of 5 roads → 5; a fork (Y shape) counts only the longest branch, not the sum.
- [ ] Test: opponent settlement mid-path splits the count into the longer segment.
- [ ] Test: a loop of 6 roads → 6.
- [ ] FAIL → implement → PASS. Commit.

### Task 11: Awards, scoring, win
**Files:** Create `src/engine/awards.js`; extend `actions.js`; Test `tests/awards.test.js`
**Consumes:** longestRoad, constants, state.
**Produces:** `updateLongestRoad(state)` (≥5, strictly-longer reassignment, tie set-aside
rules), `updateLargestArmy(state)` (≥3 knights, strictly-more reassignment),
`score(state,playerId) → int` (buildings + awards + VP dev cards), `checkWin(state)` (sets
`winner` + `phase:'gameOver'` only on the current player's turn at ≥ targetVP).
- [ ] Test: first to 5-length road gets LR (2 VP); a strictly longer road steals it; equal length does not steal.
- [ ] Test: first to 3 knights gets LA; 4th knight by another steals it.
- [ ] Test: score sums settlements/cities/awards/VP-cards; reaching target on own turn sets winner; reaching it off-turn does not.
- [ ] FAIL → implement → PASS. Commit.

### Task 12: Dev cards
**Files:** Create `src/engine/devcards.js`; extend `actions.js`; Test `tests/devcards.test.js`
**Consumes:** rng, robber, awards, state.
**Produces:** `buyDevCard` (pays ore+wool+grain, draws from `devDeck`, tags `boughtTurn`),
and play actions `playKnight{hexId,targetPlayerId}`, `playRoadBuilding{edges:[eId,eId]}`
(sets/consumes `freeRoads`), `playYearOfPlenty{resources:[r,r]}`, `playMonopoly{resource}`.
Enforce ≤1 dev/turn (`devPlayedThisTurn`) and not-the-turn-bought (VP exempt & auto-counts).
- [ ] Test: buy deducts cost + shrinks deck; empty deck buy throws.
- [ ] Test: can't play a card bought this turn; can't play a 2nd dev card same turn.
- [ ] Test: knight moves robber + steals + increments `playedKnights` + may grant LA.
- [ ] Test: monopoly transfers all of one resource from every opponent; year-of-plenty adds 2 from bank; road-building places 2 free roads.
- [ ] Test: VP cards count toward score immediately and toward a win.
- [ ] FAIL → implement → PASS. Commit.

### Task 13: Trading + endTurn + integration
**Files:** extend `actions.js`; Test `tests/trade.test.js`, `tests/integration.test.js`
**Consumes:** rules (portRate), state.
**Produces:** `bankTrade{give:{resource,count}, get:resource}` (validates rate 4/3/2 & bank
stock), `offerPlayerTrade{from,to,give,get}` + `resolvePlayerTrade{accept}` (only current
player; no like-for-like; no giveaways), `endTurn` (clears per-turn flags, advances `current`,
`phase:'roll'`, checks nothing/win).
- [ ] Test: 4:1 bank trade; 3:1/2:1 with a port; wrong ratio throws; insufficient bank throws.
- [ ] Test: player trade moves agreed cards both ways; like-for-like and one-sided rejected.
- [ ] Integration: seeded scripted 2-player game — setup, several turns of roll/build/trade/dev, to a legitimate `winner` at target VP. Assert final invariants (VP total, piece supplies, bank conservation of cards).
- [ ] FAIL → implement → PASS. Commit.

---

## Phase 4 — UI board

### Task 14: Page shell + setup screen
**Files:** Create `index.html`, `.nojekyll`, `styles/base.css`, `src/main.js`.
**Produces:** setup screen (2–4 player rows: name+color; variant Standard/Quick; theme
Classic/Modern; board Random/Beginner; hide-hands toggle; Start). Calls `createGame` and
mounts the game screen. Manual verification (open in browser via `python3 -m http.server`).
- [ ] Verify: setup screen renders, validates 2–4 players + unique colors, Start builds a game object logged to console.
- [ ] Commit.

### Task 15: SVG board render
**Files:** Create `src/ui/render.js`, `styles/game.css`.
**Consumes:** State.
**Produces:** `renderBoard(svgEl, state, {onVertex,onEdge,onHex, highlight})` drawing hexes
(terrain fill+icon), tokens (value+pips, red 6/8), robber, buildings (house/church), roads,
ports; highlights only supplied legal targets; hit-targets call callbacks.
- [ ] Verify: board renders correctly for a fresh game; clicking a highlighted vertex logs its id; robber shown on desert; scales with viewport.
- [ ] Commit.

### Task 16: HUD + turn wiring
**Files:** Create `src/ui/hud.js`; extend `src/main.js`.
**Produces:** player panels (VP, resource counts, active hand, opponents' dev count), action
bar (Roll/Build▸/BuyDev/PlayDev▸/Trade▸/EndTurn enabled by phase+affordability), dice
display, phase banner. Main loop: dispatch `applyAction` → re-render.
- [ ] Verify: play the full setup by clicking; roll dice distributes resources on screen; build a road/settlement by clicking highlighted targets; End Turn advances player.
- [ ] Commit.

---

## Phase 5 — UI depth

### Task 17: Modals — robber, trade, dev cards, win
**Files:** Create `src/ui/modals.js`; extend `main.js`.
**Produces:** discard-on-7 modal (per over-limit player), move-robber + steal-target flow,
bank-trade + player-trade offer/accept, Year-of-Plenty/Monopoly pickers, Road-Building
placement, win screen with final standings.
- [ ] Verify: roll a 7 → discard flow → move robber → steal; bank & player trades update hands; each dev card resolves via its modal; reaching target VP shows win screen.
- [ ] Commit.

### Task 18: Animations, themes, persistence
**Files:** Create `src/ui/animations.js`, `src/ui/themes.js`, `src/ui/persistence.js`,
`styles/theme-classic.css`, `styles/theme-modern.css`; extend `main.js`.
**Produces:** dice-roll + resource-gain + robber-slide + award-toast animations; live theme
switch (`:root[data-theme]`); autosave to `localStorage` after each action + Resume/New Game.
- [ ] Verify: both themes restyle fully; dice/resource animations play; reload offers Resume and restores exact state.
- [ ] Commit.

---

## Phase 6 — Polish

### Task 19: Accessibility + responsiveness
**Files:** touch `styles/*`, `src/ui/*`.
**Produces:** color-blind-safe colors + pattern cues, keyboard operability, focus rings,
ARIA labels, contrast in both themes, laptop/tablet layouts.
- [ ] Verify: tab-navigate the action bar; screen-reader labels present; board usable at narrow widths.
- [ ] Commit.

### Task 20: README + deploy + full playtest
**Files:** Create `README.md`.
**Produces:** local-run + "Settings → Pages → deploy from `main`/root" instructions;
run `node --test` (all green); a complete manual 2-player and 4-player playtest to a win in
both themes and both variants.
- [ ] Verify: `node --test` passes; a full game completes end-to-end; README steps accurate.
- [ ] Commit.

---

## Self-Review

- **Spec coverage:** constants (T1), RNG determinism (T2), board 54/72/9 + no-adjacent-red +
  beginner (T3), state/variants (T4), rules/ports (T5), setup+starting resources+Quick bonus
  (T6), production+shortage+robber-block (T7), robber discard/move/steal (T8), building/supply
  (T9), longest road graph (T10), awards/scoring/win (T11), dev cards + all effects + timing
  (T12), trading + endTurn + integration (T13); UI shell/board/HUD (T14–16); modals for every
  interactive flow (T17); animations/2 themes/persistence (T18); a11y (T19); deploy+playtest
  (T20). All spec sections mapped.
- **Placeholders:** none — engine tasks carry concrete test assertions; UI tasks carry
  concrete manual verifications (UI is hard to unit-test buildless, so verified by driving it).
- **Type consistency:** shapes fixed in "Shared data shapes"; `applyAction(state,action)` is
  the sole reducer name used throughout; action `type` strings match spec §6 verbatim.
