# ⚓ Catan — Hot Seat

A visually polished, fully client-side implementation of the **base game of Catan**,
playable **2–4 players** in the browser — pass-and-play on one device **or** peer-to-peer
online over the same Wi-Fi. No build step, no server — just static files, so it hosts on
**GitHub Pages** as-is, and it's responsive down to phones.

## Features

- **Local or online** — pass-and-play on one device, or peer-to-peer online over the same
  Wi-Fi (WebRTC data channels, no server, no third-party service). Online, each player
  sees only their own hand and can act only on their turn.
- **Responsive** — adapts from desktop to phones (portrait layout, large touch targets).
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

## Online play (peer-to-peer)

Online uses **WebRTC data channels with manual signalling** — no server and no
third-party service, so it ships on GitHub Pages untouched. One player hosts (they run
the authoritative game and relay state); others join. To connect:

1. Everyone opens the site. The **host** picks *Host online*, sets the rules, and clicks
   **Generate invite code**.
2. The host copies the invite code and sends it to a player (any chat/DM).
3. That player picks *Join online*, pastes the code, clicks **Generate my answer**, and
   sends their answer code back to the host.
4. The host pastes the answer and clicks **Connect player**. Repeat 2–4 for up to three
   joiners, then **Start Game**.

**Which setups connect?** With no STUN/TURN configured (the default), peers connect over
the **same local network**:

| Setup | Works by default? |
| --- | --- |
| Both on the same Wi-Fi | ✅ yes |
| One phone shares a **hotspot**, the other **joins that hotspot** | ✅ yes (same network) |
| One phone on Wi-Fi, the other on **separate cellular data** | ❌ no — different networks |

(The only same-network gotcha is a router/hotspot with "client isolation" enabled, which
blocks devices from talking to each other — most phone hotspots don't.)

**Cross-network play** (genuinely different networks) needs NAT traversal, which is
configurable and **off by default**:
- Set `ICE_SERVERS` in `src/ui/net.js` (or `?ice=stun:host:port` / `localStorage['catan-ice']`).
- **STUN** covers most home-network ↔ home-network cases. **TURN** (a relay server, with
  credentials) is required for strict/symmetric NATs such as **cellular data**.
- Both are external services and, per Mercari policy, may require the internal
  **External Service Review** before use — hence empty by default.

### Optional: short room codes (`ABC-DEF-GHI`)

Instead of the copy/paste handshake, the host can share a **9-letter room code** and
joiners just type it — no code exchange. This needs a tiny signalling relay to pass the
connection info under the code, so it is **off by default** and, because it introduces a
third-party service, **requires the internal External Service Review before use**.

To enable it:
1. Create a **Firebase Realtime Database** (free tier) and note its URL, e.g.
   `https://your-project-default-rtdb.firebaseio.com`. Set its rules so `/rooms` is
   read/write (open, or with a short TTL — it only holds transient offer/answer blobs).
2. Put that URL in `SIGNALING_URL` in `src/ui/signaling.js` (or, for a quick test, append
   `?sig=<url>` to the page URL, or set `localStorage['catan-sig']`).
3. Complete your org's External Service Review for Firebase before real use.

With a URL configured, *Host online* shows a room code and *Join online* asks for one;
with nothing configured, the app falls back to the serverless copy/paste flow above. Any
REST key-value store exposing Firebase-style `${base}/${path}.json` GET/PUT works.

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
