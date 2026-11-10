// The persistent game state, plus save / load / validation.
import { CARD_BY_ID, CARD_SETS, PACKS, PLOTS, PRODUCTS, STAGES, TUNING, VERSION } from './config.js';

const newPlot = () => ({ stage: 0, splat: false, flow: 0, served: 0 });

export function newState(now = 0) {
  return {
    v: 2,
    version: VERSION,
    seed: 1 + Math.floor(Math.random() * 1e9),
    coins: 0,
    tokens: TUNING.startTokens,
    tokenAt: now,
    shields: 0,
    bet: 1,
    town: 0,
    plots: PLOTS.map(newPlot),
    pending: null, // an attack or raid won on the machine and not yet played
    cards: {
      owned: {},
      stars: 0,
      season: 1,
      sets: CARD_SETS.map(() => false), // set reward claimed
      packs: { bronze: 0, silver: 0, gold: 0 },
      dry: 0, // packs in a row with nothing new
    },
    pet: { level: 0, xp: 0, treats: 0 },
    event: { start: 0, points: 0, claimed: 0 },
    league: { start: 0, points: 0, last: null },
    daily: { day: 0, last: -1 },
    mission: { index: 0, extra: null },
    shop: { noAds: false, owned: {}, adDay: -1, adCount: 0, bought: 0 },
    news: [],
    nextAttackAt: 0,
    stats: {
      spins: 0, tokensSpent: 0, coinsWon: 0, attacks: 0, blocked: 0, raids: 0, sweeps: 0, jackpots: 0, upgrades: 0,
      repairs: 0, towns: 0, packs: 0, cards: 0, sets: 0, fed: 0, balloons: 0, served: 0, playTime: 0, pied: 0, shielded: 0,
    },
    settings: { sfx: true, music: true, haptics: true },
    clock: 0.08,
    lastSaved: 0,
  };
}

const num = (v, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);
const int = (v, fallback = 0) => Math.floor(num(v, fallback));

function cleanPending(p) {
  if (!p || typeof p !== 'object' || (p.type !== 'attack' && p.type !== 'raid')) return null;
  const r = p.rival;
  if (!r || typeof r !== 'object') return null;
  const out = {
    type: p.type,
    bet: Math.max(1, int(p.bet, 1)),
    revenge: !!p.revenge,
    rival: {
      id: int(r.id),
      town: int(r.town),
      shield: !!r.shield,
      stages: PLOTS.map((_, k) => Math.min(STAGES, Math.max(1, int(r.stages && r.stages[k], 3)))),
      splats: PLOTS.map((_, k) => !!(r.splats && r.splats[k])),
    },
  };
  if (p.type === 'raid') {
    if (!Array.isArray(p.tubs) || p.tubs.length !== 4) return null;
    out.tubs = p.tubs.map((v) => num(v));
    out.picks = Array.isArray(p.picks) ? p.picks.map((v) => int(v)).filter((v, i, a) => v < 4 && a.indexOf(v) === i).slice(0, 3) : [];
  }
  return out;
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
  s.shields = Math.min(int(raw.shields), TUNING.maxShields);
  s.bet = TUNING.bets.includes(raw.bet) ? raw.bet : 1;
  s.town = Math.min(int(raw.town), 500);
  if (Array.isArray(raw.plots)) {
    s.plots.forEach((p, k) => {
      const r = raw.plots[k];
      if (!r || typeof r !== 'object') return;
      p.stage = Math.min(int(r.stage), STAGES);
      p.splat = p.stage > 0 && !!r.splat;
      p.flow = p.stage > 0 ? Math.min(num(r.flow), 20) : 0;
      p.served = int(r.served);
    });
  }
  s.pending = cleanPending(raw.pending);
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
  if (raw.pet) {
    s.pet.level = Math.min(int(raw.pet.level), 30);
    s.pet.xp = int(raw.pet.xp);
    s.pet.treats = int(raw.pet.treats);
  }
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
    s.shop.adDay = typeof raw.shop.adDay === 'number' && Number.isFinite(raw.shop.adDay) ? Math.floor(raw.shop.adDay) : -1;
    s.shop.adCount = int(raw.shop.adCount);
    s.shop.bought = int(raw.shop.bought);
  }
  if (Array.isArray(raw.news)) {
    s.news = raw.news.slice(0, 12).filter((n) => n && typeof n === 'object').map((n) => ({
      t: num(n.t), rival: int(n.rival), blocked: !!n.blocked, plot: Math.min(int(n.plot), PLOTS.length - 1),
      art: int(n.art), revenge: !!n.revenge, seen: !!n.seen,
    }));
  }
  s.nextAttackAt = num(raw.nextAttackAt);
  if (raw.stats) for (const k of Object.keys(s.stats)) s.stats[k] = num(raw.stats[k]);
  if (raw.settings) {
    for (const k of Object.keys(s.settings)) s.settings[k] = raw.settings[k] !== false;
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
