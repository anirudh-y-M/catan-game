# Catan — Hot-Seat Web Game (Design Spec)

**Date:** 2026-07-14
**Status:** Approved design, ready for planning
**Author:** anirudh + Claude

## 1. Goal

A visually polished, fully client-side implementation of the **base game of Catan**,
playable by **2–4 players hot-seat** (pass-and-play on one device), hosted on
**GitHub Pages**. It ships with **two visual themes** and **two rule variants**, and is
built to be **fun for everyone** — low-friction UX, clear affordances, tasteful
animations, and accessibility (color-blind-safe colors, keyboard operation, ARIA).

Rules are faithful to the official 2020/2015 5th-edition base rulebook.

## 2. Constraints & non-goals

- **Static hosting only** (GitHub Pages). No server → **no online multiplayer**.
- **No build step.** Plain static files served from repo root. Deploy = push + enable Pages.
- The author pushes to GitHub themselves. We only commit locally, never push.
- **Non-goals:** expansions (Seafarers, Cities & Knights), online play, AI opponents,
  accounts/persistence beyond local device.

## 3. Faithful base-game constants (from the official rulebook)

- **Terrain (19 hexes):** 4 forest→lumber, 4 pasture→wool, 4 fields→grain,
  3 hills→brick, 3 mountains→ore, 1 desert.
- **Number tokens (18):** 2–12 except 7; one each of `2` and `12`; two each of
  `3,4,5,6,8,9,10,11`. **`6` and `8` are red**; in random setup no two red tokens are
  adjacent. Pips: 2→1, 3→2, 4→3, 5→4, 6→5, 8→5, 9→4, 10→3, 11→2, 12→1.
- **Resource bank:** 19 cards each of brick, lumber, wool, grain, ore (95 total).
- **Dev-card deck (25):** 14 Knight, 5 Victory Point, 2 Road Building, 2 Year of Plenty,
  2 Monopoly.
- **Pieces per player:** 5 settlements, 4 cities, 15 roads.
- **Build costs:** road = brick+lumber; settlement = brick+lumber+wool+grain;
  city = 3 ore+2 grain (upgrades a settlement); dev card = ore+wool+grain.
- **Victory points:** settlement 1, city 2, Longest Road (≥5 segments) 2,
  Largest Army (≥3 knights) 2, VP card 1 each. **Standard target = 10.**
- **Ports (9):** 4 generic 3:1 + five 2:1 (one per resource).
- **Robber / roll 7:** no production; every player with **>7** cards discards
  `floor(n/2)`; mover relocates robber to a different hex (or desert) and steals 1 random
  card from an opponent with a building on that hex.
- **Longest Road:** longest continuous path (branches don't count); an opponent's
  settlement/city on an intermediate vertex breaks the path. Award reassigns only when a
  strictly longer road exists; ties leave the card with the current holder, or set it
  aside if the holder loses the lead and 2+ players tie.
- **Largest Army:** first to 3 played knights; reassigns when another strictly exceeds.
- **Dev-card rules:** at most 1 dev card played per turn (Knight or Progress); a card may
  not be played the turn it was bought (VP cards excepted — they may be revealed to win at
  any time). Playable any time during the owner's turn.
- **Bank-shortage rule:** if the bank can't pay all claimants of a resource in a
  production step, none is paid — unless exactly one player is affected, who then takes
  whatever remains.

## 4. Architecture

Two clean layers with a one-way dependency (UI depends on engine; engine has no DOM).

### 4.1 Engine (pure, no DOM, deterministic via seedable RNG)

Testable in Node's built-in test runner. Modules under `src/engine/`:

- `constants.js` — all counts above (terrain distribution, token multiset, deck
  composition, costs, target-VP by variant, colors).
- `rng.js` — small seedable PRNG (mulberry32) for shuffles/dice, injected into the game
  so tests are deterministic.
- `board.js` — radius-2 axial hex grid → 19 hexes. Derives **54 vertices** and
  **72 edges** by deduping shared corners/sides; builds adjacency graphs
  (vertex↔vertex, vertex↔hex, edge↔vertex, edge↔edge). Assigns terrain + tokens
  (random-balanced enforcing no adjacent red, or fixed beginner layout). Places 9 ports on
  fixed coastal vertex-pairs with shuffled port types.
- `state.js` — `createGame(config)` factory and state-shape helpers.
- `rules.js` — pure validators: `canPlaceSetupSettlement`, `canBuildSettlement`
  (distance rule + own-road connectivity), `canBuildRoad` (connectivity, empty edge),
  `canBuildCity`, `canAfford`, port trade-rate lookup.
- `production.js` — dice roll → per-player resource distribution honoring robber block
  and bank-shortage rule.
- `robber.js` — discard computation, robber move validation, steal-target resolution.
- `devcards.js` — deck build/shuffle/draw and effect application (Knight, Road Building,
  Year of Plenty, Monopoly, VP).
- `longestRoad.js` — longest-path search over a player's road subgraph, respecting
  opponent-building breaks; returns length per player.
- `awards.js` — Longest Road / Largest Army reassignment, per-player VP scoring
  (hidden VP cards included), win detection against target VP.
- `actions.js` — the single dispatch surface: pure reducers `(state, action) → state`
  covering every legal move (see §6). Each validates, mutates a cloned state, appends a
  log entry, and recomputes awards/win.

### 4.2 UI (browser only), under `src/ui/`

- `render.js` — SVG board: hex polygons (terrain fill + icon), number tokens (value +
  pips, red 6/8), robber, settlements (house) / cities (church), roads (colored bars),
  ports on the coast. Renders vertex/edge hit-targets only when a placement mode is active.
- `hud.js` — player panels (color, VP, resource counts; active player's full hand;
  opponents' dev-card count only), action bar (Roll, Build ▸, Buy Dev, Play Dev ▸, Trade ▸,
  End Turn) with enable/disable by phase & affordability, dice display, turn/phase banner.
- `modals.js` — bank trade, player-trade offer/accept, discard-on-7, dev-card play flows,
  Year of Plenty / Monopoly pickers, and the win screen.
- `input.js` — click handling and **legal-move highlighting** (only valid vertices/edges
  glow in a placement mode).
- `animations.js` — dice-roll, resource-gain popups, robber slide, award-change toast.
- `themes.js` — theme switch via `:root[data-theme]`.
- `persistence.js` — autosave game state to `localStorage` after each action; offer
  **Resume** on load; **New Game** clears it.
- `src/main.js` — setup screen + wiring (create game → render → dispatch → re-render).

## 5. Board model detail

- Axial coords `(q,r)` for all `|q|,|r|,|q+r| ≤ 2` → 19 hexes.
- Each hex's 6 corners map to shared vertices; 6 sides map to shared edges. Dedupe by a
  rounded geometric key. Result: 54 vertices, 72 edges.
- Pointy-top rendering yields the classic 3-4-5-4-3 rows.
- Ports: 9 fixed coastal edges (each associated with its 2 vertices); port **type**
  assignment shuffled per game (4×3:1, 2:1 for each of the 5 resources).

## 6. Game flow (finite-state machine)

```
SETUP → [per turn: ROLL → (7 ⇒ DISCARD → MOVE_ROBBER → STEAL) → MAIN → END] → GAME_OVER
```

- **SETUP:** 2 rounds, snake order. R1 forward (each: settlement → adjacent road);
  R2 reverse (each: settlement → adjacent road), and the 2nd settlement grants starting
  resources from its adjacent hexes. Distance rule enforced throughout.
- **ROLL:** roll 2d6; on non-7, run production; on 7, enter robber sequence.
- **DISCARD:** each player with >7 cards discards `floor(n/2)` (modal per player).
- **MOVE_ROBBER / STEAL:** move to a different hex; steal 1 random from a chosen adjacent
  opponent (also reached via Knight).
- **MAIN:** combined trade/build in any order — bank trade (4:1 / 3:1 / 2:1 via ports),
  player trade (active player only), build road/settlement/city, buy dev card, play ≤1 dev
  card (subject to rules). Awards & win recomputed after each action.
- **END:** advance to next player. **GAME_OVER** when a player reaches target VP on their
  turn.

**Action set:** `placeSetupSettlement`, `placeSetupRoad`, `rollDice`, `discard`,
`moveRobber`, `steal`, `buildRoad`, `buildSettlement`, `buildCity`, `buyDevCard`,
`playKnight`, `playRoadBuilding`, `playYearOfPlenty`, `playMonopoly`, `bankTrade`,
`offerPlayerTrade`, `resolvePlayerTrade`, `endTurn`.

## 7. Versions

### Visual themes (CSS-variable driven; adding more is trivial)
- **Classic** — warm parchment/wood, earthy terrain palette, subtle texture, serif accents.
- **Modern** — flat, bold, geometric fills, clean sans-serif, soft shadows.
- Original styling only; no trademarked Catan artwork.

### Rule variants (chosen on setup screen)
- **Standard** — target 10 VP; full rules.
- **Quick Play** — target 8 VP + a small starting boost (each player draws 1 extra random
  resource after setup) for shorter sessions.
- **Board toggle:** random-balanced (default) vs. fixed beginner layout.

## 8. Hot-seat UX

- Shared-screen pass-and-play, 2–4 players (names + color chosen at setup).
- **Resources shown openly** for all; **dev cards hidden** (opponents see count only) to
  preserve Largest-Army bluffing and the surprise VP-card win.
- **No forced privacy interstitial by default**; optional "hide hands between turns"
  pass-the-device toggle.
- Player trade: active player builds an offer (give/get), targets one opponent, who
  accepts/rejects on the same device.

## 9. Visual & accessibility standards

- Legal-move-only highlighting; hover/focus states; dice + resource + robber animations.
- Color-blind-safe player colors reinforced with shape/pattern cues.
- Keyboard-operable controls, visible focus rings, ARIA labels, adequate contrast in both
  themes. Responsive: board scales via SVG `viewBox`; layout works on laptop and tablet.

## 10. Testing & deployment

- **Engine is TDD'd** with `node --test`: unit tests per module (board geometry counts,
  distance rule, production incl. shortage, robber discard/steal, dev-card effects,
  longest-road graph cases, awards/scoring/win) + **one integration test** scripting a
  short seeded 2-player game to a win.
- **Deploy:** static files at repo root; include `.nojekyll`; `README.md` documents local
  run (`python3 -m http.server`) and "Settings → Pages → deploy from `main` / root."

## 11. File structure

```
index.html
.nojekyll
README.md
styles/            base.css, theme-classic.css, theme-modern.css, game.css
src/
  engine/          constants, rng, board, state, rules, production, robber,
                   devcards, longestRoad, awards, actions
  ui/              render, hud, modals, input, animations, themes, persistence
  main.js
tests/             board, rules, production, robber, devcards, longestRoad,
                   awards, integration
docs/superpowers/specs/2026-07-14-catan-game-design.md
```

## 12. Phasing

1. **Engine core** — constants, rng, board (geometry + ports), state, rules. (tests)
2. **Turn loop** — setup phase, roll/production (+shortage), robber (discard/move/steal). (tests)
3. **Economy & endgame** — building, dev cards, trading, longest road, largest army,
   scoring, win. (tests + integration)
4. **UI board** — SVG render, HUD, input + legal-move highlighting.
5. **UI depth** — modals (trade/discard/dev/win), animations, 2 themes, 2 variants,
   persistence.
6. **Polish** — accessibility pass, README + deploy docs, full manual playtest.
