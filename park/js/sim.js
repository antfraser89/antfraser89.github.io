// The park ticking over. Visitors are decoration in this game: each site
// simply takes money at the gate according to its stars, whether or not
// anybody is watching. No DOM in here, so it runs headless in tests.
import { PLOTS, TUNING as T, buildingAt } from './config.js';
import * as E from './economy.js';
import { advanceMission, currentMission } from './goals.js';
import { grant } from './rules.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createWorld(state, rand = Math.random) {
  return { state, rand, events: [], time: 0, payIn: PLOTS.map((p) => 2 + p.index * 0.7) };
}

export function resetWorld(world) {
  world.events.length = 0;
}

export const designAt = (state, k) => buildingAt(state.town, k);
export const isOpen = (state, k) => state.plots[k].stage > 0;

// Advance the clock and bank the gate takings. Now and then a site reports
// what it has just taken, so the park page can show coins popping up.
export function step(world, dt) {
  const s = world.state;
  world.time += dt;
  s.stats.playTime += dt;
  s.clock = (s.clock + dt / T.dayLength) % 1;
  for (const p of PLOTS) {
    const rate = E.plotRate(s, p.index);
    if (rate <= 0) continue;
    const amount = rate * dt;
    s.coins += amount;
    s.stats.served += dt * 0.2 * s.plots[p.index].stage;
    world.payIn[p.index] -= dt;
    if (world.payIn[p.index] <= 0) {
      world.payIn[p.index] = 5 + world.rand() * 4;
      world.events.push({ type: 'pay', k: p.index, amount: rate * 6 });
    }
  }
  if (world.events.length > 400) world.events.length = 0; // nobody is listening
}

// Credit the till for time spent away.
export function applyOffline(world, seconds) {
  const s = world.state;
  const counted = Math.min(Math.max(0, seconds), T.offlineCapHours * 3600);
  const amount = E.offlineEarnings(s, seconds);
  if (amount > 0) s.coins += amount;
  return { amount, counted, capped: seconds > counted };
}

export function claimMission(world) {
  const s = world.state;
  const mission = currentMission(s);
  if (!mission.done) return null;
  const reward = grant(s, mission.reward);
  advanceMission(s);
  world.events.push({ type: 'mission', reward, text: mission.text });
  return reward;
}
