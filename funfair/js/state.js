// The persistent game state, plus save / load / migration.
import { ATTRACTIONS, PARK, SHOP, TUNING, VERSION } from './config.js';

const newAttraction = () => ({ built: false, level: 0, operator: false, flow: 0, served: 0, bestMs: 0 });

export function newState() {
  return {
    v: 1,
    version: VERSION,
    cash: TUNING.startCash,
    stars: 0,
    fame: 0,
    tours: 0,
    runEarned: 0,
    attractions: ATTRACTIONS.map(newAttraction),
    park: Object.fromEntries(Object.keys(PARK).map((k) => [k, 0])),
    shop: Object.fromEntries(Object.keys(SHOP).map((k) => [k, 0])),
    boosts: { fireworks: 0, rush: 0 },
    fireworksCd: 0,
    goal: { index: 0, extra: null },
    stats: {
      earned: 0, served: 0, balloons: 0, fireworks: 0, cycles: 0, manualRuns: 0, playTime: 0, upgrades: 0,
    },
    settings: { sfx: true, music: true, buyMode: '1' },
    clock: 0.08,
    lastSaved: 0,
  };
}

const num = (v, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);
const int = (v, fallback = 0) => Math.floor(num(v, fallback));

// Rebuild a state from untrusted JSON: unknown keys are dropped, missing or
// malformed values fall back to defaults, so an old or hand-edited save can
// never crash the game.
export function hydrate(raw) {
  const s = newState();
  if (!raw || typeof raw !== 'object') return s;
  s.cash = num(raw.cash, s.cash);
  s.stars = int(raw.stars);
  s.fame = int(raw.fame);
  s.tours = int(raw.tours);
  s.runEarned = num(raw.runEarned);
  if (Array.isArray(raw.attractions)) {
    for (let i = 0; i < s.attractions.length; i++) {
      const r = raw.attractions[i];
      if (!r || typeof r !== 'object') continue;
      const a = s.attractions[i];
      a.built = !!r.built;
      a.level = a.built ? Math.max(1, int(r.level, 1)) : 0;
      a.operator = a.built && !!r.operator;
      a.flow = a.built ? Math.min(num(r.flow), 50) : 0;
      a.served = int(r.served);
      a.bestMs = int(r.bestMs);
    }
  }
  for (const k of Object.keys(s.park)) {
    s.park[k] = Math.min(int(raw.park && raw.park[k]), PARK[k].max);
  }
  for (const k of Object.keys(s.shop)) {
    const item = SHOP[k];
    s.shop[k] = item.repeat ? int(raw.shop && raw.shop[k]) : Math.min(int(raw.shop && raw.shop[k]), item.costs.length);
  }
  if (raw.boosts) {
    s.boosts.fireworks = Math.min(num(raw.boosts.fireworks), 600);
    s.boosts.rush = Math.min(num(raw.boosts.rush), 600);
  }
  s.fireworksCd = Math.min(num(raw.fireworksCd), TUNING.fireworksCooldown);
  if (raw.goal) {
    s.goal.index = int(raw.goal.index);
    const e = raw.goal.extra;
    if (e && typeof e === 'object' && typeof e.type === 'string') {
      s.goal.extra = { type: e.type, target: num(e.target, 1), idx: int(e.idx), stars: int(e.stars, 2) };
    }
  }
  if (raw.stats) for (const k of Object.keys(s.stats)) s.stats[k] = num(raw.stats[k]);
  if (raw.settings) {
    s.settings.sfx = raw.settings.sfx !== false;
    s.settings.music = raw.settings.music !== false;
    if (['1', '10', 'next', 'max'].includes(raw.settings.buyMode)) s.settings.buyMode = raw.settings.buyMode;
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
    return hydrate(JSON.parse(text));
  } catch {
    return null;
  }
}

// Export codes are just the save JSON, base64-wrapped so it survives chat apps.
export function exportCode(state) {
  const json = serialize(state);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function importCode(code) {
  try {
    const bin = atob(String(code).trim());
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const raw = JSON.parse(new TextDecoder().decode(bytes));
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.attractions)) return null;
    return hydrate(raw);
  } catch {
    return null;
  }
}
