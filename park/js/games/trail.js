// The Treasure Trail: three screens that feed each other.
//   The sword plant grows swords over time; plant food makes it grow faster.
//   The trail spends swords to clear its way from flag to flag, with prizes.
//   The cannon fires at jars: each hides swords, plant food or coins, and one
//   hides the target that finishes the level.
import { grant, hash, int, num } from '../core.js';
import { talent } from '../pets.js';

export const TRAIL = {
  // the plant
  rate: (level) => 30 + level * 12, // swords an hour
  storeHours: 4, // it holds this many hours of growth
  foodFor: (level) => 20 + level * 15, // plant food to reach the next level
  plantMax: 30,
  // the trail: six flags a stage; the last one is the stage's chest
  nodes: 6,
  nodeCost: (stage, node) => Math.round((60 + stage * 40) * [1, 1.2, 1.5, 1.8, 2.2, 3][node]),
  nodeReward: (stage, node) => [
    { coins: 15 + Math.min(stage, 20) * 3 }, { tokens: 3 + Math.min(Math.floor(stage / 2), 3) }, { gems: 6 + Math.min(stage, 20) }, { coins: 30 + Math.min(stage, 20) * 5 }, { tokens: 5 + Math.min(stage, 5), energy: 6 },
    { tokens: 15 + Math.min(stage * 2, 10), gems: 25 + Math.min(stage, 20) * 3, pack: stage % 3 === 2 ? 'gold' : 'silver' },
  ][node],
  // the cannon: twenty jars a level
  jars: 20,
  jarPrizes: (level) => [
    [{ swords: 15 + level * 4 }, 7], [{ swords: 35 + level * 8 }, 4], [{ swords: 80 + level * 15 }, 2],
    [{ food: 4 + level }, 4], [{ food: 10 + level * 2 }, 2],
  ],
  targetReward: (level) => ({ swords: 100 + level * 30, food: 10 + level * 3, gems: 5 + level }),
};

function fillJars(seed, level) {
  // 19 prizes laid out from the table in proportion, then shuffled; one target
  const table = TRAIL.jarPrizes(level);
  const total = table.reduce((n, [, w]) => n + w, 0);
  const jars = [];
  table.forEach(([, w], i) => { for (let n = 0; n < w; n++) jars.push(i); });
  while (jars.length < TRAIL.jars - 1) jars.push(0);
  jars.length = TRAIL.jars - 1;
  jars.push(-1); // the target
  for (let i = jars.length - 1; i > 0; i--) {
    const j = Math.floor(hash(seed % 9973, level, i) * (i + 1));
    [jars[i], jars[j]] = [jars[j], jars[i]];
  }
  return total > 0 ? jars : jars;
}

export const freshTrail = (seed = 1, now = 0) => ({
  plant: { level: 1, fed: 0, stored: 0, at: now },
  path: { stage: 0, node: 0 },
  cannon: { level: 1, jars: fillJars(seed, 1), open: [] },
});

export function cleanTrail(raw, seed) {
  const t = freshTrail(seed);
  if (!raw || typeof raw !== 'object') return t;
  if (raw.plant) {
    t.plant.level = Math.max(1, Math.min(int(raw.plant.level, 1), TRAIL.plantMax));
    t.plant.fed = int(raw.plant.fed);
    t.plant.stored = num(raw.plant.stored);
    t.plant.at = num(raw.plant.at);
  }
  if (raw.path) {
    t.path.stage = int(raw.path.stage);
    t.path.node = Math.min(int(raw.path.node), TRAIL.nodes - 1);
  }
  if (raw.cannon) {
    t.cannon.level = Math.max(1, int(raw.cannon.level, 1));
    const jars = raw.cannon.jars;
    const kinds = TRAIL.jarPrizes(t.cannon.level).length;
    const sound = Array.isArray(jars) && jars.length === TRAIL.jars && jars.filter((v) => v === -1).length === 1 && jars.every((v) => Number.isInteger(v) && v >= -1 && v < kinds);
    t.cannon.jars = sound ? jars.slice() : fillJars(seed, t.cannon.level);
    if (Array.isArray(raw.cannon.open)) t.cannon.open = raw.cannon.open.map((v) => int(v)).filter((v, i, a) => v < TRAIL.jars && a.indexOf(v) === i);
  }
  return t;
}

// ---- the plant ----------------------------------------------------------------

export const plantRate = (state) => TRAIL.rate(state.trail.plant.level) * (1 + talent(state, 'swords'));
export const plantStore = (state) => Math.round(TRAIL.rate(state.trail.plant.level) * TRAIL.storeHours);

export function trailTick(state, now) {
  const p = state.trail.plant;
  if (!(p.at > 0) || p.at > now) {
    p.at = now;
    return;
  }
  const grown = (plantRate(state) * (now - p.at)) / 3600e3;
  p.stored = Math.min(plantStore(state), p.stored + grown);
  p.at = now;
}
// Seconds until the plant is full (0 when it is).
export function plantFullIn(state) {
  const p = state.trail.plant;
  return p.stored >= plantStore(state) ? 0 : ((plantStore(state) - p.stored) / plantRate(state)) * 3600;
}

export function collectSwords(state) {
  const p = state.trail.plant;
  const n = Math.floor(p.stored);
  if (n < 1) return null;
  p.stored -= n;
  state.inv.swords += n;
  return { swords: n };
}

export function feedPlant(state, count = Infinity) {
  const p = state.trail.plant;
  if (p.level >= TRAIL.plantMax) return null;
  const used = Math.min(count, state.inv.food, TRAIL.foodFor(p.level) - p.fed);
  if (!(used > 0)) return null;
  state.inv.food -= used;
  p.fed += used;
  const out = { used, levels: 0 };
  while (p.level < TRAIL.plantMax && p.fed >= TRAIL.foodFor(p.level)) {
    p.fed -= TRAIL.foodFor(p.level);
    p.level++;
    out.levels++;
  }
  return out;
}

// ---- the trail ----------------------------------------------------------------

export const nextNode = (state) => {
  const { stage, node } = state.trail.path;
  return { stage, node, cost: TRAIL.nodeCost(stage, node), reward: TRAIL.nodeReward(stage, node), last: node === TRAIL.nodes - 1 };
};

// Clear the way to the next flag.
export function advance(state) {
  const next = nextNode(state);
  if (state.inv.swords < next.cost) return null;
  state.inv.swords -= next.cost;
  const reward = grant(state, next.reward);
  state.stats.steps++;
  const path = state.trail.path;
  let stageDone = false;
  if (next.last) {
    path.stage++;
    path.node = 0;
    stageDone = true;
  } else {
    path.node++;
  }
  return { node: next.node, stage: next.stage, cost: next.cost, reward, stageDone };
}

// ---- the cannon ---------------------------------------------------------------

// Fire at a jar. Finding the target finishes the level and sets up the next.
export function fire(state, jar) {
  const c = state.trail.cannon;
  if (!(jar >= 0 && jar < TRAIL.jars) || c.open.includes(jar) || !(state.inv.shots >= 1)) return null;
  state.inv.shots--;
  state.stats.shots++;
  c.open.push(jar);
  const what = c.jars[jar];
  if (what < 0) {
    const reward = grant(state, TRAIL.targetReward(c.level));
    const level = c.level;
    c.level++;
    c.jars = fillJars(state.seed, c.level);
    c.open = [];
    return { jar, target: true, level, reward };
  }
  return { jar, target: false, level: c.level, reward: grant(state, TRAIL.jarPrizes(c.level)[what][0]) };
}
// What a jar already opened held (for redrawing the board).
export function jarPrize(state, jar) {
  const c = state.trail.cannon;
  const what = c.jars[jar];
  return what < 0 ? null : TRAIL.jarPrizes(c.level)[what][0];
}
