// Pure economy maths: no DOM, no randomness, no mutation.
import { ATTRACTIONS, MILESTONE_LEVELS, PARK, SHOP, TUNING } from './config.js';

// ---- attraction levels -------------------------------------------------

export function milestoneThreshold(n) {
  if (n < MILESTONE_LEVELS.length) return MILESTONE_LEVELS[n];
  return MILESTONE_LEVELS[MILESTONE_LEVELS.length - 1] + (n - MILESTONE_LEVELS.length + 1) * 100;
}

export function milestoneCount(level) {
  let n = 0;
  while (level >= milestoneThreshold(n)) n++;
  return n;
}

export const nextMilestone = (level) => milestoneThreshold(milestoneCount(level));

// Cost of going from `level` to `level + 1`.
export function levelCost(def, level) {
  return def.cost * TUNING.levelCostFactor * Math.pow(TUNING.levelCostGrowth, level - 1);
}

export function bulkCost(def, level, n) {
  if (n <= 0) return 0;
  const g = TUNING.levelCostGrowth;
  return levelCost(def, level) * (Math.pow(g, n) - 1) / (g - 1);
}

export function maxAffordable(def, level, cash) {
  const g = TUNING.levelCostGrowth;
  const first = levelCost(def, level);
  if (cash < first) return 0;
  let n = Math.floor(Math.log(1 + cash * (g - 1) / first) / Math.log(g));
  // guard against floating point drift at the boundary
  while (n > 0 && bulkCost(def, level, n) > cash) n--;
  while (bulkCost(def, level, n + 1) <= cash) n++;
  return n;
}

// How many levels a buy-mode press should attempt: '1', '10', 'next' or 'max'.
export function buyCount(mode, def, level, cash) {
  if (mode === 'max') return Math.max(1, maxAffordable(def, level, cash));
  if (mode === 'next') return nextMilestone(level) - level;
  return Number(mode) || 1;
}

export function capacity(def, level) {
  const m = Math.min(milestoneCount(level), 6);
  return Math.round(def.cap * (1 + 0.25 * m));
}

export function cycleTime(def, level) {
  const m = Math.min(milestoneCount(level), 6);
  return def.cycle * (1 - 0.065 * m);
}

// ---- multipliers --------------------------------------------------------

export const fameMult = (fame) => 1 + TUNING.famePerPoint * fame;

export function fameForEarned(earned) {
  return Math.floor(Math.sqrt(Math.max(0, earned) / TUNING.fameDivisor));
}

export function earnedForFame(fame) {
  return fame * fame * TUNING.fameDivisor;
}

export function globalMult(state) {
  return (1 + 0.5 * state.park.lights) * Math.pow(2, state.shop.golden) * fameMult(state.fame);
}

export function boostMult(state) {
  return (state.boosts.fireworks > 0 ? TUNING.fireworksMult : 1) * (state.boosts.rush > 0 ? TUNING.rushMult : 1);
}

export function ticketPrice(state, i) {
  const a = state.attractions[i];
  const level = Math.max(1, a.level);
  return ATTRACTIONS[i].price * level * Math.pow(2, milestoneCount(level)) * globalMult(state);
}

// Smoothed takings per second for one attraction, before temporary boosts.
export function attractionRate(state, i) {
  const a = state.attractions[i];
  return a.built ? a.flow * ticketPrice(state, i) : 0;
}

export function totalRate(state, autoOnly = false) {
  let sum = 0;
  for (let i = 0; i < ATTRACTIONS.length; i++) {
    const a = state.attractions[i];
    if (!a.built || (autoOnly && !a.operator)) continue;
    sum += attractionRate(state, i);
  }
  return sum;
}

// ---- park-wide upgrades --------------------------------------------------

export function parkCost(key, level) {
  const p = PARK[key];
  return p.baseCost * Math.pow(p.growth, level);
}

export const arrivalRate = (state) => TUNING.baseArrival + TUNING.arrivalPerLevel * state.park.marketing;
export const visitsPerGuest = (state) => TUNING.baseVisits + state.park.passes;
export const walkSpeed = (state) => TUNING.baseWalkSpeed * (1 + TUNING.walkSpeedPerLevel * state.park.paths);

export function parkEffect(key, level) {
  switch (key) {
    case 'marketing': return Math.round((TUNING.baseArrival + TUNING.arrivalPerLevel * level) * 60) + ' guests/min';
    case 'passes': return (TUNING.baseVisits + level) + ' attractions each';
    case 'paths': return '+' + Math.round(TUNING.walkSpeedPerLevel * level * 100) + '% walking speed';
    case 'lights': return '×' + (1 + 0.5 * level).toFixed(1) + ' ticket prices';
    default: return '';
  }
}

// ---- star shop -----------------------------------------------------------

export function shopCost(key, level) {
  const item = SHOP[key];
  if (item.repeat) return item.costs[0];
  return level < item.costs.length ? item.costs[level] : Infinity;
}

export const shopMaxed = (key, level) => !SHOP[key].repeat && level >= SHOP[key].costs.length;

export function shopEffect(key, level) {
  switch (key) {
    case 'golden': return '×' + Math.pow(2, level) + ' tickets';
    case 'owls': return TUNING.offlineCapHours[Math.min(level, TUNING.offlineCapHours.length - 1)] + 'h away time';
    case 'crate': return Math.round(fireworksCooldownAt(level) / 60) + ' min recharge';
    case 'seller': return '+' + level * 30 + '% balloons';
    case 'headstart': return level === 0 ? 'No float' : 'Float ready';
    default: return '';
  }
}

const fireworksCooldownAt = (crate) => TUNING.fireworksCooldown - 60 * crate;
export const fireworksCooldown = (state) => fireworksCooldownAt(state.shop.crate);
export const offlineCapSeconds = (state) =>
  TUNING.offlineCapHours[Math.min(state.shop.owls, TUNING.offlineCapHours.length - 1)] * 3600;
export const balloonInterval = (state, rand) => {
  const [lo, hi] = TUNING.balloonEvery;
  return (lo + (hi - lo) * rand) / (1 + 0.3 * state.shop.seller);
};
export const startingCash = (state) => Math.max(TUNING.startCash, SHOP.headstart.cash[state.shop.headstart] || 0);

// ---- away earnings -------------------------------------------------------

// Only attractions with an operator earn while the player is away.
export function offlineEarnings(state, seconds) {
  const counted = Math.min(Math.max(0, seconds), offlineCapSeconds(state));
  return totalRate(state, true) * counted;
}

export const fameGain = (state) => fameForEarned(state.runEarned);
export const canTour = (state) => fameGain(state) >= TUNING.tourMinFame;
