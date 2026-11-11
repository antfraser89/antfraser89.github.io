// Pure economy maths: no DOM, no randomness, no mutation.
import {
  CAP_STEPS, MIXED_WEIGHTS, OPENING_SPINS, OUTCOMES, PACKS, PAY, PLOTS, STAGES, TUNING as T, levelOf, levelStars, unlockLevel,
} from './config.js';
import { nice, unit } from './core.js';
import { petCap, talent } from './pets.js';

export { nice, unit };

const sum = (list) => list.reduce((a, b) => a + b, 0);
const OUTCOME_TOTAL = sum(OUTCOMES.map((o) => o.w));
export const outcomeChance = (kind) => OUTCOMES.find((o) => o.kind === kind).w / OUTCOME_TOTAL;

// Average coins a spin returns, in units, at a bet of one and no pet bonus.
export function spinEV() {
  const mixedTotal = sum(Object.values(MIXED_WEIGHTS));
  const perReel = (MIXED_WEIGHTS.coin * PAY.coin + MIXED_WEIGHTS.sack * PAY.sack) / mixedTotal;
  const raid = ((PAY.raidStash[0] + PAY.raidStash[1]) / 2) * 0.75; // three picks out of four shells
  return (
    outcomeChance('coins3') * PAY.coins3 +
    outcomeChance('sacks3') * PAY.sacks3 +
    outcomeChance('jackpot') * PAY.jackpot +
    outcomeChance('raid') * raid +
    outcomeChance('mixed') * perReel * 3
  );
}

// How many bet-one spins a park is meant to take from empty to finished.
export const townSpins = (town) => Math.min(90 + 80 * town + 10 * town * town, T.spinsCap);

const SLOT_SUM = sum(T.slotWeights);
const STEP_SUM = sum(T.stageWeights) + sum(T.capWeights);
const share = (town, slot, weight) => nice((spinEV() * unit(town) * townSpins(town) * T.slotWeights[slot] * weight) / (SLOT_SUM * STEP_SUM));

// Coins for star `stage` (1 to STAGES) of site `slot` in a given park.
export const stageCost = (town, slot, stage) => share(town, slot, T.stageWeights[stage - 1]);
// Coins for capacity step `step` (1 to CAP_STEPS).
export const capCost = (town, slot, step) => share(town, slot, T.capWeights[step - 1]);

export function townCost(town) {
  let total = 0;
  for (const p of PLOTS) {
    for (let s = 1; s <= STAGES; s++) total += stageCost(town, p.index, s);
    for (let c = 1; c <= CAP_STEPS; c++) total += capCost(town, p.index, c);
  }
  return total;
}

// What can be bought next at a site: the next star, and the next capacity
// step once the site's level has reached it.
export function nextStar(state, k) {
  const p = state.plots[k];
  return p.stage < STAGES ? { stage: p.stage + 1, cost: stageCost(state.town, k, p.stage + 1) } : null;
}
export const capNeeds = (step) => step * 2; // stars needed before capacity step `step`
export function nextCap(state, k) {
  const p = state.plots[k];
  if (p.cap >= CAP_STEPS) return null;
  const step = p.cap + 1;
  return { step, cost: capCost(state.town, k, step), needs: capNeeds(step), open: p.stage >= capNeeds(step) };
}
export const siteDone = (plot) => plot.stage >= STAGES && plot.cap >= CAP_STEPS;
// The cheapest thing on offer at a site, or null when it is finished.
export function cheapest(state, k) {
  const a = nextStar(state, k);
  const b = nextCap(state, k);
  const options = [a && a.cost, b && b.open ? b.cost : null].filter((v) => v != null);
  return options.length ? Math.min(...options) : null;
}

export const tokenCap = (state) => T.tokenCap + petCap(state);
export const raidBonus = (state) => 1 + talent(state, 'dive');

// Bets on offer: always one, larger ones once you hold enough spins to use them.
export function availableBets(state) {
  if (state.stats.spins < OPENING_SPINS.length) return [1]; // the opening spins are always single
  return T.bets.filter((b) => b === 1 || state.tokens >= b * T.betNeedsTokens);
}

// What a site takes at the gate, in coins a second. Visitors are decoration:
// the takings follow the stars, and each capacity step adds a share on top.
export const ticket = (town, stage) => unit(town) * T.gateRate * stage;
export function plotRate(state, k) {
  const p = state.plots[k];
  return p.stage > 0 ? ticket(state.town, p.stage) * (1 + T.capBoost * p.cap) * (1 + talent(state, 'gate')) : 0;
}
// A finished park goes on earning a share of what it took at its best.
const FULL = T.gateRate * STAGES * PLOTS.length * (1 + T.capBoost * CAP_STEPS);
export const legacyOf = (town) => unit(town) * FULL * T.legacyShare;
export function legacyRate(state) {
  let total = 0;
  for (let t = 0; t < state.town; t++) total += legacyOf(t);
  return total;
}
export const parkRate = (state) => state.plots.reduce((n, _, k) => n + plotRate(state, k), 0);
export const boosted = (state) => state.boost > 0;
export const idleRate = (state) => (parkRate(state) + legacyRate(state)) * (boosted(state) ? 2 : 1);

export const awayHours = (state) => T.offlineCapHours * (1 + talent(state, 'away'));
export function offlineEarnings(state, seconds) {
  return (parkRate(state) + legacyRate(state)) * Math.min(Math.max(0, seconds), awayHours(state) * 3600);
}

export const packPrice = (town, type) => unit(town) * PACKS[type].price;

export const PARK_STARS = PLOTS.length * (STAGES + CAP_STEPS);
export const stagesBuilt = (state) => state.plots.reduce((n, p) => n + p.stage + p.cap, 0);
export const townComplete = (state) => state.plots.every(siteDone);

// The player's level, from every star ever bought.
export const level = (state) => levelOf(state.stats.upgrades);
export function levelProgress(state) {
  const lv = level(state);
  const from = levelStars(lv);
  const to = levelStars(lv + 1);
  return { level: lv, have: state.stats.upgrades - from, need: to - from };
}
export const unlocked = (state, id) => level(state) >= unlockLevel(id);

// Park chests still to open: one for each quarter of the park's stars.
export const parkChestsDue = (state) => Math.max(0, Math.floor((4 * stagesBuilt(state)) / PARK_STARS) - state.parkChests);
