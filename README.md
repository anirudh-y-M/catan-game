# ⚓ Catan — Hot Seat

A visually polished, fully client-side implementation of the **base game of Catan**,
playable **2–4 players hot-seat** (pass-and-play on one device) right in the browser.
No build step, no server — just static files, so it hosts on **GitHub Pages** as-is.

## Features

- **Full base ruleset** — settlements, cities, roads, the robber, resource & development
  cards, maritime + player trading, ports, Longest Road, Largest Army, and the 10-VP win,
  faithful to the official 2020/2015 rulebook.
- **Three rule variants** — *Standard* (10 VP), *Quick Play* (8 VP + a small starting
  boost), and *The Works* (8 VP · **3** starting settlements each · +3 bonus resources · a
  free development card · discard only above 9 cards) for a fast, action-packed game.
- **Two visual themes** — *Classic* (warm parchment & wood) and *Modern* (flat, dark
  slate). Switch live from the top bar.
- **Synthesized sound effects** — dice, building, dev cards, the robber, trades, and a
  victory fanfare, all generated in-browser (no files, works offline), with a **mute
  toggle** in the top bar (preference persists).
- **Random balanced board** (no adjacent red 6/8) or a fixed **Beginner** layout.
- **Smooth hot-seat UX** — open resources, hidden dev cards (so Largest-Army bluffs and
  surprise VP wins survive), optional "hide hands between turns", only *legal* moves
  highlighted, dice animation, autosave & resume.

## Play locally

Any static file server works — for example:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

(Or just open `index.html`; a server is only needed because the app uses ES modules.)

## Deploy to GitHub Pages

A ready-to-use workflow is included at `.github/workflows/deploy.yml`. It runs the engine
tests, then publishes the site on every push to `main`.

**Recommended (automatic, via the workflow):**
1. Push this repository to GitHub.
2. In the repo, go to **Settings → Pages → Build and deployment** and set
   **Source = GitHub Actions**.
3. That's it — each push to `main` runs the workflow and deploys. The URL appears in the
   workflow's summary and under Settings → Pages (e.g. `https://<you>.github.io/<repo>/`).

**Alternative (no workflow):** set **Source = Deploy from a branch**, choose `main` /
`/ (root)`, and save. (If you use this route you can delete the workflow file.)

The included `.nojekyll` file tells Pages to serve everything verbatim (no Jekyll
processing). There is no build step either way.

## Run the tests

The game engine is pure and unit-tested with Node's built-in runner:

```bash
node --test
```

## How it's built

- **`src/engine/`** — pure, DOM-free, deterministic (seedable RNG) game engine:
  board generation, rules, production, robber, dev cards, longest road, awards, and the
  single `applyAction(state, action)` reducer. Fully unit-tested.
- **`src/ui/`** — the browser layer: an SVG board renderer, the HUD, modals, theming, and
  localStorage persistence, wired together by `src/main.js`.
- **`styles/`** — structural CSS plus one file per theme (CSS custom properties).

Design and implementation notes live in `docs/superpowers/`.

## Credits

Catan is designed by Klaus Teuber. This is an unofficial, non-commercial fan
implementation for personal play; it uses original styling and no trademarked artwork.
