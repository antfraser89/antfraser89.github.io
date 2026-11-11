// Lucky Pearl: a prize draw. Each draw costs a pearl token and bursts one of
// the bubbles round the clam. Three of the bubbles are big prizes with a
// limited stock, and one of them is guaranteed every so many draws. Enough
// draws in a round wins the pearl itself.
import { grant, int, weighted } from '../core.js';
import { talent } from '../pets.js';

// `at` is where the bubble sits on the painting (stage pixels), for the screen.
export const DRAW = {
  // everyday bubbles
  small: [
    { id: 'pack', reward: { pack: 'bronze' }, w: 8 },
    { id: 'coinsS', reward: { coins: 10 }, w: 26 },
    { id: 'energy', reward: { energy: 8 }, w: 18 },
    { id: 'gemsA', reward: { gems: 8 }, w: 14 },
    { id: 'gemsB', reward: { gems: 5 }, w: 16 },
    { id: 'coinsL', reward: { coins: 45 }, w: 10 },
    { id: 'wheel', reward: { wheel: 1 }, w: 8 },
  ],
  // big bubbles: each has a stock for the round
  big: [
    { id: 'bigGems', reward: { gems: 60 }, stock: 3 },
    { id: 'bigEnergy', reward: { energy: 60 }, stock: 5 },
    { id: 'bigSpins', reward: { tokens: 50 }, stock: 3 },
  ],
  bigChance: 0.04,
  bigEvery: 16, // a big bubble at least this often
  grandAt: 80, // draws in a round to win the pearl
  grand: (round) => ({ tokens: 150 + round * 25, gems: 100, pack: 'gold' }),
};

export const freshDraw = () => ({ round: 0, total: 0, sinceBig: 0, stock: DRAW.big.map((b) => b.stock), drawn: 0 });

export function cleanDraw(raw) {
  const d = freshDraw();
  if (!raw || typeof raw !== 'object') return d;
  d.round = int(raw.round);
  d.total = Math.min(int(raw.total), DRAW.grandAt);
  d.sinceBig = Math.min(int(raw.sinceBig), DRAW.bigEvery);
  if (Array.isArray(raw.stock)) d.stock = DRAW.big.map((b, i) => Math.min(int(raw.stock[i], b.stock), b.stock));
  d.drawn = int(raw.drawn);
  return d;
}

const boost = (state, reward) => {
  const k = 1 + talent(state, 'draw');
  const out = { ...reward };
  for (const key of ['coins', 'gems', 'energy']) if (out[key]) out[key] = Math.round(out[key] * k);
  return out;
};

// One draw. Returns which bubble burst and what it held.
export function drawOnce(state, rand) {
  const d = state.draw;
  if (!(state.inv.pearls >= 1)) return null;
  state.inv.pearls--;
  d.total++;
  d.drawn++;
  d.sinceBig++;
  state.stats.draws++;
  const out = { id: '', big: false, grand: null, reward: null };
  const left = DRAW.big.map((b, i) => [i, d.stock[i]]).filter(([, n]) => n > 0);
  if (left.length && (d.sinceBig >= DRAW.bigEvery || rand() < DRAW.bigChance)) {
    const i = weighted(rand, left);
    d.stock[i]--;
    d.sinceBig = 0;
    out.id = DRAW.big[i].id;
    out.big = true;
    out.reward = grant(state, boost(state, DRAW.big[i].reward));
  } else {
    const pick = weighted(rand, DRAW.small.map((s) => [s, s.w]));
    out.id = pick.id;
    out.reward = grant(state, boost(state, pick.reward));
  }
  if (d.total >= DRAW.grandAt) {
    out.grand = grant(state, DRAW.grand(d.round));
    d.round++;
    d.total = 0;
    d.sinceBig = 0;
    d.stock = DRAW.big.map((b) => b.stock);
  }
  return out;
}

export function drawMany(state, rand, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const one = drawOnce(state, rand);
    if (!one) break;
    out.push(one);
  }
  return out;
}

export const bigIn = (state) => Math.max(1, DRAW.bigEvery - state.draw.sinceBig);
export const grandIn = (state) => Math.max(1, DRAW.grandAt - state.draw.total);
