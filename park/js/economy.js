// Pure economy maths: no DOM, no randomness, no mutation.
import { MIXED_WEIGHTS, OPENING_SPINS, OUTCOMES, PACKS, PAY, PET, PLOTS, STAGES, TUNING as T } from './config.js';

// Round to two significant figures so prices read cleanly.
export function nice(n) {
  if (n <= 0) return 0;
  const p = Math.pow(10, Math.floor(Math.log10(n)) - 1);
  return Math.round(n / p) * p;
}

// The coin "unit" for a town: every payout and price in that town scales with it.
export const unit = (town) => nice(T.unitBase * Math.pow(T.unitGrowth, town));

const sum = (list) => list.reduce((a, b) => a + b, 0);
const OUTCOME_TOTAL = sum(OUTCOMES.map((o) => o.w));
export const outcomeChance = (kind) => OUTCOMES.find((o) => o.kind === kind).w / OUTCOME_TOTAL;

// Average coins a spin returns, in units, at a bet of one and no pet bonus.
export function spinEV() {
  const mixedTotal = sum(Object.values(MIXED_WEIGHTS));
  const perReel = (MIXED_WEIGHTS.coin * PAY.coin + MIXED_WEIGHTS.sack * PAY.sack) / mixedTotal;
  const raid = ((PAY.raidStash[0] + PAY.raidStash[1]) / 2) * 0.75; // three picks out of four tubs
  const attack = (1 - T.rivalShieldChance) * PAY.attackHit + T.rivalShieldChance * PAY.attackBlocked;
  return (
    outcomeChance('coins3') * PAY.coins3 +
    outcomeChance('sacks3') * PAY.sacks3 +
    outcomeChance('jackpot') * PAY.jackpot +
    outcomeChance('attack') * attack +
    outcomeChance('raid') * raid +
    outcomeChance('mixed') * perReel * 3
  );
}

// How many bet-one spins a town is meant to take from empty field to finished.
export const townSpins = (town) => 40 + 60 * town + 10 * town * town;

const SLOT_SUM = sum(T.slotWeights);
const STAGE_SUM = sum(T.stageWeights);

// Coins to take plot `slot` up to `stage` (1..5) in a given town.
export function stageCost(town, slot, stage) {
  const total = spinEV() * unit(town) * townSpins(town);
  return nice((total * T.slotWeights[slot] * T.stageWeights[stage - 1]) / (SLOT_SUM * STAGE_SUM));
}

export function townCost(town) {
  let total = 0;
  for (const p of PLOTS) for (let s = 1; s <= STAGES; s++) total += stageCost(town, p.index, s);
  return total;
}

export const repairCost = (town, slot, stage) => nice(stageCost(town, slot, Math.max(1, stage)) * T.repairShare);

export const petLevel = (state) => state.pet.level;
export const tokenCap = (state) => T.tokenCap + PET.capPerLevel * state.pet.level;
export const raidBonus = (state) => 1 + PET.raidBonusPerLevel * state.pet.level;

// Bets on offer: always one, larger ones once you hold enough tokens to use them.
export function availableBets(state) {
  if (state.stats.spins < OPENING_SPINS.length) return [1]; // the opening spins are always single
  return T.bets.filter((b) => b === 1 || state.tokens >= b * T.betNeedsTokens);
}

// What each rider pays into the till.
export const ticket = (town, stage) => unit(town) * T.ticketRate * stage;

export function plotRate(state, k) {
  const p = state.plots[k];
  return p.stage > 0 && !p.splat ? p.flow * ticket(state.town, p.stage) : 0;
}
export const idleRate = (state) => state.plots.reduce((n, _, k) => n + plotRate(state, k), 0);

export function offlineEarnings(state, seconds) {
  return idleRate(state) * Math.min(Math.max(0, seconds), T.offlineCapHours * 3600);
}

export const packPrice = (town, type) => unit(town) * PACKS[type].price;

export const stagesBuilt = (state) => state.plots.reduce((n, p) => n + p.stage, 0);
export const townComplete = (state) => state.plots.every((p) => p.stage >= STAGES);
