// The pictures the code names must exist, and the preload list must cover the
// whole img folder so that one visit is enough to play offline.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const files = readdirSync(new URL('img/', root)).filter((f) => f.endsWith('.webp')).map((f) => f.slice(0, -5));
const DRAWN = ['ico-cannonball']; // drawn in ui.js, no file

test('every picture named in the code is in img/', () => {
  const sources = ['js/ui.js', 'js/config.js', 'js/pets.js', 'js/meta/festival.js', 'js/parkview.js', 'js/slotview.js', ...readdirSync(new URL('js/screens/', root)).map((f) => 'js/screens/' + f)];
  const named = new Set();
  for (const path of sources) {
    const text = read(path);
    for (const m of text.matchAll(/ART\('([a-z0-9-]+)'\)|(?:art|icon|sheet): '([a-z0-9-]+)'|art: \['([a-z0-9-]+)'/g)) named.add(m[1] || m[2] || m[3]);
    named.forEach((n) => { if (n.endsWith('-')) named.delete(n); }); // a prefix that the code finishes, such as 'cards-' + id
  }
  assert.ok(named.size > 40);
  for (const name of named) assert.ok(files.includes(name) || DRAWN.includes(name), `img/${name}.webp is missing`);
});

test('the preload list covers the img folder, with nothing extra', () => {
  const text = read('js/preload.js');
  const listed = new Set([...text.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]).filter((n) => n !== 'img'));
  for (const name of files) assert.ok(listed.has(name), `${name} is not in the preload list`);
  for (const name of listed) assert.ok(files.includes(name), `the preload list names ${name}, which is not in img/`);
});

test('the service worker is cut for this version', () => {
  const version = /VERSION = '([^']+)'/.exec(read('js/config.js'))[1];
  assert.ok(read('sw.js').includes(`'park-v${version}'`), 'bump CACHE in sw.js with the version');
  assert.equal(JSON.parse(read('package.json')).version, version);
});
