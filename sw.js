// Service worker: makes the game fully playable offline.
//
// On the first online visit it precaches the whole app shell (HTML, every JS
// module, CSS, manifest). After that the game opens with no network at all —
// airplane mode, no wifi — because every request is served from the cache.
//
// Strategy: stale-while-revalidate for same-origin GETs. The cached copy is
// returned instantly (fast + offline), while a background fetch refreshes the
// cache so a newer version you push is picked up on the *next* load. Bump
// CACHE below to force an immediate re-precache of everything.

const CACHE = 'catan-v1';

// Paths are relative to this file's location, so they resolve correctly
// whether the site is hosted at a domain root or a project subpath
// (e.g. username.github.io/Catan/).
const ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'styles/base.css',
  'styles/game.css',
  'styles/theme-classic.css',
  'styles/theme-modern.css',
  'src/main.js',
  'src/ui/dom.js',
  'src/ui/hud.js',
  'src/ui/modals.js',
  'src/ui/net.js',
  'src/ui/persistence.js',
  'src/ui/render.js',
  'src/ui/signaling.js',
  'src/ui/sound.js',
  'src/ui/themes.js',
  'src/engine/actions.js',
  'src/engine/awards.js',
  'src/engine/board.js',
  'src/engine/building.js',
  'src/engine/constants.js',
  'src/engine/devcards.js',
  'src/engine/index.js',
  'src/engine/longestRoad.js',
  'src/engine/production.js',
  'src/engine/rng.js',
  'src/engine/robber.js',
  'src/engine/rules.js',
  'src/engine/state.js',
  'src/engine/trade.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached || (req.mode === 'navigate' ? cache.match('index.html') : undefined));
        // Serve cache immediately when present; otherwise wait for the network.
        return cached || network;
      }),
    ),
  );
});
