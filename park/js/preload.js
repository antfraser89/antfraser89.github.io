// Fetch the pictures the first screens need before the game is shown, and
// report how far along that is. The rest load when they are first used.
const FIRST = [
  'splash', 'logo', 'slots', 'spin-dome', 'park-coral', 'sym-coin', 'sym-chest', 'sym-shell', 'ico-ticket', 'sym-bell', 'sym-cherry', 'sym-ball', 'sym-star',
  'tab-shop', 'tab-park', 'tab-slots', 'tab-album', 'tab-club', 'panda-welcome', 'panda-party', 'panda-thumbs', 'panda-sad',
];
// Worth having soon after: fetched quietly once the game is on screen.
const SOON = [
  'park-pirate', 'park-jungle', 'park-winter', 'avatars', 'pets', 'cards-pond', 'ico-energy', 'ico-gem', 'ico-pearl', 'ico-key', 'ico-sword', 'ico-food',
  'ico-chest-open', 'ico-coins', 'ico-tickets', 'hdr-daily', 'bg-draw', 'bg-chests', 'bg-trail', 'bg-plant', 'bg-cannon', 'bg-team',
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
