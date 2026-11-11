// Rockpool Merge: a board of shells. The basket drops a shell for a point of
// energy; two the same make the next one along the chain. Making the last
// shell in the chain finishes the round.
import { ITEMS } from '../config.js';
import { grant, hash, int, weighted } from '../core.js';
import { talent } from '../pets.js';

export const MERGE = {
  cols: 7,
  rows: 7,
  chain: 9, // how many shells there are, plainest to rarest
  energyCap: 30,
  energyEvery: 180, // seconds for a point of energy to come back
  mults: [1, 2, 4, 8], // spend more energy at once for a better shell
  drop: [[1, 70], [2, 24], [3, 6]], // the level a plain drop lands at
  // the first time each shell is made in a round
  firsts: { 3: { gems: 2 }, 4: { gems: 4, coins: 6 }, 5: { gems: 6, tokens: 5 }, 6: { gems: 10, coins: 25 }, 7: { gems: 15, tokens: 12 }, 8: { gems: 25, pack: 'silver' } },
  final: (round) => ({ tokens: 40 + round * 10, gems: 60 + round * 10, coins: 120 + round * 30, pack: 'gold' }),
  buried: 10, // shells half-buried in the sand at the start of a round
};
const CELLS = MERGE.cols * MERGE.rows;

// A round starts with a few shells buried in the top rows. A buried shell
// cannot be moved, but its match can be dropped onto it.
function layout(seed, round) {
  const cells = new Array(CELLS).fill(0);
  const spots = [];
  for (let i = 0; i < MERGE.cols * 2; i++) spots.push(i);
  for (let n = 0; n < MERGE.buried; n++) {
    const pick = Math.floor(hash(seed % 9973, round, n) * spots.length);
    const at = spots.splice(pick, 1)[0];
    cells[at] = -(1 + Math.floor(hash(seed % 7919, round + 0.5, n) * 4));
  }
  return cells;
}

export const freshMerge = (seed = 1, now = 0) => ({ cells: layout(seed, 0), round: 0, best: 0, mult: 1, at: now });

export function cleanMerge(raw, seed) {
  const m = freshMerge(seed);
  if (!raw || typeof raw !== 'object') return m;
  m.round = int(raw.round);
  if (Array.isArray(raw.cells) && raw.cells.length === CELLS) {
    m.cells = raw.cells.map((v) => (Number.isInteger(v) && Math.abs(v) <= MERGE.chain ? v : 0));
  } else {
    m.cells = layout(seed, m.round);
  }
  m.best = Math.min(int(raw.best), MERGE.chain);
  m.mult = MERGE.mults.includes(raw.mult) ? raw.mult : 1;
  m.at = typeof raw.at === 'number' && Number.isFinite(raw.at) ? raw.at : 0;
  return m;
}

export const energyCap = (state) => MERGE.energyCap + Math.round(talent(state, 'energy'));

// Energy trickles back up to the cap. Prizes can take it over.
export function mergeTick(state, now) {
  const m = state.merge;
  const cap = energyCap(state);
  if (state.inv.energy >= cap || !(m.at > 0) || m.at > now) {
    m.at = now;
    return 0;
  }
  const every = MERGE.energyEvery * 1000;
  const n = Math.floor((now - m.at) / every);
  if (n <= 0) return 0;
  const add = Math.min(n, cap - state.inv.energy);
  state.inv.energy += add;
  m.at = state.inv.energy >= cap ? now : m.at + n * every;
  return add;
}
export const nextEnergyIn = (state, now) => (state.inv.energy >= energyCap(state) ? 0 : Math.max(0, (state.merge.at + MERGE.energyEvery * 1000 - now) / 1000));

export function setMult(state, mult) {
  if (MERGE.mults.includes(mult)) state.merge.mult = mult;
  return state.merge.mult;
}

// Drop a shell from the basket into a free cell.
export function generate(state, rand, now = 0) {
  const m = state.merge;
  const free = [];
  m.cells.forEach((v, i) => { if (v === 0) free.push(i); });
  if (!free.length) return { ok: false, why: 'full' };
  const cost = m.mult;
  if (state.inv.energy < cost) return { ok: false, why: 'energy' };
  if (state.inv.energy >= energyCap(state) && state.inv.energy - cost < energyCap(state)) m.at = now;
  state.inv.energy -= cost;
  const level = Math.min(MERGE.chain - 1, weighted(rand, MERGE.drop) + Math.log2(m.mult));
  // prefer the lower rows, where there is room to work
  const low = free.filter((i) => i >= MERGE.cols * 2);
  const pool = low.length ? low : free;
  const index = pool[Math.floor(rand() * pool.length)];
  m.cells[index] = level;
  return { ok: true, index, level, cost };
}

// Note that a shell of this level now exists; pay for the first of its kind.
function made(state, level, out) {
  const m = state.merge;
  if (level > m.best) {
    for (let l = m.best + 1; l <= level; l++) {
      if (MERGE.firsts[l]) out.rewards.push({ level: l, reward: grant(state, MERGE.firsts[l]) });
    }
    m.best = level;
  }
  if (level >= MERGE.chain) {
    out.done = true;
    out.final = grant(state, MERGE.final(m.round));
    m.round++;
    m.best = 0;
    m.cells = layout(state.seed, m.round);
    state.stats.mergeRounds++;
  }
}

// Drag the shell in `from` onto `to`.
export function move(state, from, to) {
  const m = state.merge;
  const a = m.cells[from];
  const b = m.cells[to];
  if (from === to || !(a > 0) || b === undefined) return { ok: false };
  const out = { ok: true, kind: 'move', level: a, rewards: [], done: false, final: null };
  if (b === 0) {
    m.cells[to] = a;
    m.cells[from] = 0;
  } else if (Math.abs(b) === a && a < MERGE.chain) {
    m.cells[from] = 0;
    m.cells[to] = a + 1;
    out.kind = 'merge';
    out.level = a + 1;
    state.stats.merges++;
    made(state, a + 1, out);
  } else if (b > 0) {
    m.cells[to] = a;
    m.cells[from] = b;
    out.kind = 'swap';
  } else {
    return { ok: false };
  }
  return out;
}

// Hand a shell back to the sea to free its cell. Worth a little energy.
export function sell(state, i) {
  const m = state.merge;
  const v = m.cells[i];
  if (!(v > 0)) return null;
  m.cells[i] = 0;
  const energy = v >= 4 ? Math.pow(2, v - 3) : 0;
  if (energy) state.inv.energy += energy;
  return { level: v, energy };
}

export const boardFull = (state) => state.merge.cells.every((v) => v !== 0);
// Whether any two movable shells (or a shell and a buried one) could merge.
export function anyMerge(state) {
  const seen = new Map();
  for (const v of state.merge.cells) {
    if (v === 0) continue;
    const l = Math.abs(v);
    const e = seen.get(l) || { free: 0, buried: 0 };
    if (v > 0) e.free++; else e.buried++;
    seen.set(l, e);
  }
  for (const [l, e] of seen) if (l < MERGE.chain && (e.free >= 2 || (e.free >= 1 && e.buried >= 1))) return true;
  return false;
}
export const ENERGY_NAME = ITEMS.energy.name;
