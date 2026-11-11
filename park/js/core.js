// Small things every rule module needs: weighted picks, a steady hash, the
// calendar day, and handing over rewards.
import { ITEMS, PACKS, TUNING as T } from './config.js';

export const HOUR = 3600e3;
export const DAY = 24 * HOUR;

export function weighted(rand, entries) {
  let total = 0;
  for (const [, w] of entries) total += w;
  let roll = rand() * total;
  for (const [value, w] of entries) {
    roll -= w;
    if (w > 0 && roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

// The same answer every time for the same three numbers: used wherever the
// computer-run players need to look the same each time you look at them.
export const hash = (a, b = 0, c = 0) => {
  const v = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
  return v - Math.floor(v);
};

// The local calendar day, as a whole number.
export const dayNumber = (now) => Math.floor((now - new Date(now).getTimezoneOffset() * 60e3) / DAY);
// Which block of `hours` the clock is in, and when that block ends.
export const period = (now, hours) => Math.floor(now / (hours * HOUR));
export const periodEnd = (now, hours) => (period(now, hours) + 1) * hours * HOUR;

// Round to two significant figures so prices read cleanly.
export function nice(n) {
  if (n <= 0) return 0;
  const p = Math.pow(10, Math.floor(Math.log10(n)) - 1);
  return Math.round(n / p) * p;
}

// The coin "unit" for a park: every payout and price in that park scales with it.
// Prices are capped: after a while a new park costs what the last one did.
export const unit = (town) => nice(T.unitBase * Math.pow(T.unitGrowth, Math.min(town, T.unitCapPark)));

export function earn(state, coins) {
  state.coins += coins;
  state.stats.coinsWon += coins;
}

// Hand over a reward and report what was actually given, in real amounts.
// A reward can hold: tokens (spins), coins (in units), treats (cherries),
// pack / packs (cards), wheel (turns), points (Park Pass points), and any of
// the things in ITEMS.
export function grant(state, reward) {
  const out = { tokens: 0, coins: 0, treats: 0, pack: null, packs: null };
  if (!reward) return out;
  if (reward.packs) {
    out.packs = {};
    for (const type of Object.keys(PACKS)) {
      const n = reward.packs[type] || 0;
      if (n > 0) {
        out.packs[type] = n;
        state.cards.packs[type] += n;
      }
    }
  }
  if (reward.tokens) {
    out.tokens = reward.tokens;
    state.tokens += reward.tokens;
  }
  if (reward.coins) {
    out.coins = reward.coins * unit(state.town);
    earn(state, out.coins);
  }
  if (reward.treats) {
    out.treats = reward.treats;
    state.pet.treats += reward.treats;
  }
  if (reward.pack) {
    out.pack = reward.pack;
    state.cards.packs[reward.pack]++;
  }
  if (reward.wheel) {
    out.wheel = reward.wheel;
    state.wheel.tickets += reward.wheel;
  }
  if (reward.points) {
    out.points = reward.points;
    state.pass.points += reward.points;
  }
  if (reward.boost) {
    out.boost = reward.boost; // minutes of doubled takings
    state.boost = Math.max(0, state.boost) + reward.boost * 60;
  }
  for (const id of Object.keys(ITEMS)) {
    if (reward[id] > 0) {
      out[id] = reward[id];
      state.inv[id] += reward[id];
    }
  }
  return out;
}

// Add two rewards together (for showing several prizes as one haul).
export function addRewards(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) {
    if (v == null) continue;
    if (k === 'packs') {
      out.packs = { ...(out.packs || {}) };
      for (const [type, n] of Object.entries(v)) out.packs[type] = (out.packs[type] || 0) + n;
    } else if (k === 'pack') {
      out.packs = { ...(out.packs || {}) };
      out.packs[v] = (out.packs[v] || 0) + 1;
    } else {
      out[k] = (out[k] || 0) + v;
    }
  }
  if (out.pack && out.packs) {
    out.packs[out.pack] = (out.packs[out.pack] || 0) + 1;
    delete out.pack;
  }
  return out;
}

// Spend something from the bag; false (and nothing taken) if there is not enough.
export function spend(state, id, n = 1) {
  if (!(state.inv[id] >= n)) return false;
  state.inv[id] -= n;
  return true;
}

export const int = (v, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback);
export const num = (v, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);
