// Fetch the pictures the first screens need before the game is shown, and
// report how far along that is. The rest load when they are first used.
const FIRST = [
  'splash', 'logo', 'slots', 'spin-dome', 'park-coral', 'sym-coin', 'sym-chest', 'sym-shell', 'ico-ticket', 'sym-bell', 'sym-cherry', 'sym-ball', 'sym-star',
  'tab-shop', 'tab-park', 'tab-slots', 'tab-album', 'tab-club', 'panda-welcome', 'panda-party', 'panda-thumbs', 'panda-sad',
];
// Every other picture: fetched quietly once the game is on screen, so the
// whole game is there when the connection is not. (tests/assets.test.js
// checks this list against the img folder.)
const SOON = [
  'avatars', 'bg-cannon', 'bg-chests', 'bg-draw', 'bg-load', 'bg-plant', 'bg-team', 'bg-trail', 'cards-desert', 'cards-ember', 'cards-garden',
  'cards-grotto', 'cards-hatch', 'cards-lava', 'cards-leafy', 'cards-pond', 'cards-tropic', 'decor-chest', 'decor-globe', 'decor-harp',
  'decor-helmet', 'hdr-bundle', 'hdr-coinshop', 'hdr-daily', 'hdr-pets', 'host-dog', 'host-gull', 'ico-boost', 'ico-chest-gold', 'ico-chest-open',
  'ico-coins', 'ico-coins-big', 'ico-compass', 'ico-crown', 'ico-energy', 'ico-food', 'ico-gem', 'ico-gift', 'ico-key', 'ico-pearl', 'ico-spinpack',
  'ico-spins', 'ico-stamp', 'ico-sword', 'ico-tickets', 'ico-trophy', 'merge-01', 'merge-02', 'merge-03', 'merge-04', 'merge-05', 'merge-06',
  'merge-07', 'merge-08', 'merge-09', 'merge-12', 'merge-gen', 'pack-art', 'park-jungle', 'park-pirate', 'park-winter', 'pets', 'prize-04',
  'prize-05', 'prize-06',
];

const src = (name) => (window.PARK_ART && window.PARK_ART[name]) || `img/${name}.webp`;

function fetchOne(name) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = img.onerror = () => resolve();
    img.src = src(name);
  });
}

// Resolves when the first pictures are in (or after `limit` ms, whichever
// comes first: a slow connection must not keep anyone out).
export function preload(onProgress, limit = 9000) {
  let done = 0;
  const all = Promise.all(FIRST.map((name) => fetchOne(name).then(() => {
    done++;
    onProgress(done / FIRST.length);
  })));
  return Promise.race([all, new Promise((resolve) => setTimeout(resolve, limit))]).then(() => onProgress(1));
}

export function preloadRest() {
  const queue = SOON.slice();
  const next = () => {
    const name = queue.shift();
    if (name) fetchOne(name).then(next);
  };
  next();
  next();
}
