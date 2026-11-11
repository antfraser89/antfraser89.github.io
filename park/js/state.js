// The persistent game state, plus save / load / validation.
import { CAP_STEPS, CARD_BY_ID, CARD_SETS, ITEMS, PACKS, PLOTS, PRODUCTS, STAGES, START_ITEMS, TUNING, VERSION } from './config.js';
import { hash, int, num } from './core.js';
import { cleanChests, freshChests } from './games/chests.js';
import { cleanDraw, freshDraw } from './games/draw.js';
import { cleanMerge, freshMerge } from './games/merge.js';
import { cleanTrail, freshTrail } from './games/trail.js';
import { cleanClub, freshClub } from './meta/club.js';
import { cleanFestival, freshFestival } from './meta/festival.js';
import { cleanMissions, freshMissions } from './meta/missions.js';
import { cleanPass, freshPass } from './meta/pass.js';
import { cleanPet, freshPet } from './pets.js';

const newPlot = () => ({ stage: 0, cap: 0 });
const STATS = [
  'spins', 'tokensSpent', 'coinsWon', 'raids', 'sweeps', 'jackpots', 'upgrades', 'towns', 'packs', 'cards', 'sets', 'fed', 'served', 'playTime',
  'wheels', 'merges', 'mergeRounds', 'draws', 'shots', 'steps', 'chests', 'ads', 'helps', 'missions', 'decor',
];

export function newState(now = 0, seed = 1 + Math.floor(Math.random() * 1e9)) {
  let n = 0;
  const seeded = () => hash(seed % 9973, 17, n++);
  return {
    v: 4,
    version: VERSION,
    seed,
    coins: 0,
    tokens: TUNING.startTokens,
    tokenAt: now,
    bet: 1,
    town: 0,
    plots: PLOTS.map(newPlot),
    parkChests: 0, // chests opened along this park's progress bar
    level: 1, // the last level whose prize has been collected
    boost: 0, // seconds of doubled takings left
    pending: null, // a pearl dive won on the machine and not yet played
    inv: { ...START_ITEMS },
    cards: {
      owned: {},
      stars: 0,
      season: 1,
      sets: CARD_SETS.map(() => false), // set reward claimed
      packs: { bronze: 0, silver: 0, gold: 0 },
      dry: 0, // packs in a row with nothing new
    },
    pet: freshPet(),
    event: { start: 0, points: 0, claimed: 0 },
    league: { start: 0, points: 0, last: null },
    daily: { day: 0, last: -1 },
    mission: { index: 0, extra: null },
    shop: { noAds: false, owned: {}, bought: 0, dailyDay: -1, stamps: 0 },
    ads: { day: -1, counts: {} },
    wheel: { tickets: 1, spun: 0, day: 0 },
    merge: freshMerge(seed, now),
    draw: freshDraw(),
    trail: freshTrail(seed, now),
    chests: freshChests(seeded),
    missions: freshMissions(),
    pass: freshPass(),
    festival: freshFestival(),
    club: freshClub(),
    profile: { name: '', face: 0 },
    seen: {}, // one-off hints already shown
    stats: Object.fromEntries(STATS.map((k) => [k, 0])),
    settings: { sfx: true, music: true, haptics: true, fast: false },
    clock: 0.08,
    lastSaved: 0,
  };
}

function cleanPending(p) {
  if (!p || typeof p !== 'object' || p.type !== 'raid') return null;
  if (!Array.isArray(p.tubs) || p.tubs.length !== 4) return null;
  return {
    type: 'raid',
    bet: Math.max(1, int(p.bet, 1)),
    tubs: p.tubs.map((v) => num(v)),
    picks: Array.isArray(p.picks) ? p.picks.map((v) => int(v)).filter((v, i, a) => v < 4 && a.indexOf(v) === i).slice(0, 3) : [],
  };
}

// Rebuild a state from untrusted JSON: unknown keys are dropped and bad values
// fall back to defaults, so an old or hand-edited save can never crash the game.
export function hydrate(raw) {
  const s = newState();
  if (!raw || typeof raw !== 'object') return s;
  s.seed = int(raw.seed, s.seed) || s.seed;
  s.coins = num(raw.coins);
  s.tokens = Math.min(int(raw.tokens, s.tokens), 1e7);
  s.tokenAt = num(raw.tokenAt);
  s.bet = TUNING.bets.includes(raw.bet) ? raw.bet : 1;
  s.town = Math.min(int(raw.town), 500);
  if (Array.isArray(raw.plots)) {
    s.plots.forEach((p, k) => {
      const r = raw.plots[k];
      if (!r || typeof r !== 'object') return;
      p.stage = Math.min(int(r.stage), STAGES);
      // an older save kept capacity as a single yes-or-no
      p.cap = r.cap === true ? CAP_STEPS : Math.min(int(r.cap), CAP_STEPS, Math.floor(p.stage / 2));
    });
  }
  s.parkChests = Math.min(int(raw.parkChests), 4);
  s.level = Math.max(1, int(raw.level, 1));
  s.boost = Math.min(num(raw.boost), 6 * 3600);
  s.pending = cleanPending(raw.pending);
  if (raw.inv && typeof raw.inv === 'object') for (const id of Object.keys(ITEMS)) s.inv[id] = Math.min(int(raw.inv[id], s.inv[id]), 1e7);
  const c = raw.cards;
  if (c && typeof c === 'object') {
    if (c.owned && typeof c.owned === 'object') {
      for (const id of Object.keys(c.owned)) {
        const n = int(c.owned[id]);
        if (CARD_BY_ID[id] && n > 0) s.cards.owned[id] = Math.min(n, 9999);
      }
    }
    s.cards.stars = int(c.stars);
    s.cards.season = Math.max(1, int(c.season, 1));
    if (Array.isArray(c.sets)) s.cards.sets = s.cards.sets.map((_, k) => !!c.sets[k]);
    for (const type of Object.keys(PACKS)) s.cards.packs[type] = Math.min(int(c.packs && c.packs[type]), 9999);
    s.cards.dry = Math.min(int(c.dry), 10);
  }
  s.pet = cleanPet(raw.pet);
  if (raw.event) {
    s.event.start = num(raw.event.start);
    s.event.points = int(raw.event.points);
    s.event.claimed = int(raw.event.claimed);
  }
  if (raw.league) {
    s.league.start = num(raw.league.start);
    s.league.points = int(raw.league.points);
    const l = raw.league.last;
    if (l && typeof l === 'object') s.league.last = { rank: Math.max(1, int(l.rank, 10)), points: int(l.points), seen: !!l.seen };
  }
  if (raw.daily) {
    s.daily.day = int(raw.daily.day);
    s.daily.last = typeof raw.daily.last === 'number' && Number.isFinite(raw.daily.last) ? Math.floor(raw.daily.last) : -1;
  }
  if (raw.mission) {
    s.mission.index = int(raw.mission.index);
    const e = raw.mission.extra;
    if (e && typeof e === 'object' && typeof e.type === 'string') {
      s.mission.extra = { type: e.type, target: Math.max(1, num(e.target, 1)), base: num(e.base) };
    }
  }
  if (raw.shop && typeof raw.shop === 'object') {
    s.shop.noAds = !!raw.shop.noAds;
    for (const p of PRODUCTS) if (p.once && raw.shop.owned && raw.shop.owned[p.id]) s.shop.owned[p.id] = true;
    s.shop.bought = int(raw.shop.bought);
    s.shop.dailyDay = Number.isInteger(raw.shop.dailyDay) ? raw.shop.dailyDay : -1;
    s.shop.stamps = Math.min(int(raw.shop.stamps), 3);
  }
  if (raw.ads && typeof raw.ads === 'object' && Number.isInteger(raw.ads.day) && raw.ads.counts && typeof raw.ads.counts === 'object') {
    s.ads.day = raw.ads.day;
    for (const [k, v] of Object.entries(raw.ads.counts)) s.ads.counts[k] = Math.min(int(v), 99);
  }
  if (raw.wheel && typeof raw.wheel === 'object') s.wheel = { tickets: Math.min(int(raw.wheel.tickets), 9999), spun: int(raw.wheel.spun), day: int(raw.wheel.day) };
  s.merge = cleanMerge(raw.merge, s.seed);
  s.draw = cleanDraw(raw.draw);
  s.trail = cleanTrail(raw.trail, s.seed);
  s.chests = cleanChests(raw.chests);
  s.missions = cleanMissions(raw.missions);
  s.pass = cleanPass(raw.pass);
  s.festival = cleanFestival(raw.festival);
  s.club = cleanClub(raw.club);
  if (raw.profile && typeof raw.profile === 'object') {
    s.profile.name = typeof raw.profile.name === 'string' ? raw.profile.name.replace(/[<>&"']/g, '').slice(0, 14) : '';
    s.profile.face = Math.min(int(raw.profile.face), 15);
  }
  if (raw.seen && typeof raw.seen === 'object') for (const k of Object.keys(raw.seen).slice(0, 60)) if (/^[a-z0-9_-]{1,24}$/i.test(k)) s.seen[k] = true;
  if (raw.stats) for (const k of STATS) s.stats[k] = num(raw.stats[k]);
  if (!s.stats.wheels && s.wheel.spun) s.stats.wheels = s.wheel.spun;
  if (raw.settings) {
    for (const k of ['sfx', 'music', 'haptics']) s.settings[k] = raw.settings[k] !== false;
    s.settings.fast = raw.settings.fast === true;
  }
  s.clock = num(raw.clock, s.clock) % 1;
  s.lastSaved = num(raw.lastSaved);
  return s;
}

export function serialize(state, now = Date.now()) {
  state.lastSaved = now;
  return JSON.stringify(state);
}

export function parseSave(text) {
  try {
    const raw = JSON.parse(text);
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.plots)) return null;
    return hydrate(raw);
  } catch {
    return null;
  }
}

// Export codes are the save JSON, base64-wrapped so it survives chat apps.
export function exportCode(state) {
  const bytes = new TextEncoder().encode(serialize(state));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function importCode(code) {
  try {
    const bin = atob(String(code).trim());
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return parseSave(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}
