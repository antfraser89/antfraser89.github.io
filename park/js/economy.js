// Pure economy maths: no DOM, no randomness, no mutation.
import {
  BELL, CAP_STEPS, HOMES, MIXED_WEIGHTS, OPENING_SPINS, OUTCOMES, PACKS, PAY, PLOTS, RUSH, STAGES, TUNING as T, homeSite, levelOf, levelStars, unlockLevel,
} from './config.js';
import { nice, unit } from './core.js';
import { petCap, talent } from './pets.js';

export { nice, unit };

const sum = (list) => list.reduce((a, b) => a + b, 0);
const OUTCOME_TOTAL = sum(OUTCOMES.map((o) => o.w));
export const outcomeChance = (kind) => OUTCOMES.find((o) => o.kind === kind).w / OUTCOME_TOTAL;

// ---- what the reels pay --------------------------------------------------------

const SLOT_SUM = sum(T.slotWeights);
const STEP_SUM = sum(T.stageWeights) + sum(T.capWeights);
const MIXED_TOTAL = sum(Object.values(MIXED_WEIGHTS));
const SITE_CHANCE = MIXED_WEIGHTS.s0 / MIXED_TOTAL; // one site, on one reel of a mixed spin
// bigger sites pay more: each one's weight against the average
const REL = T.slotWeights.map((w) => (w * PLOTS.length) / SLOT_SUM);

// How much of its full rate a site is working at: nothing until it is built,
// then up with every star, and each capacity step adds a share on top.
export const siteLevel = (plot) => (plot.stage > 0 ? (PAY.siteOpen + ((1 - PAY.siteOpen) * plot.stage) / STAGES) * (1 + T.capBoost * plot.cap) : 0);
// Creatures from finished card sets live at a site and make it pay more.
export function homeBonus(state, k) {
  const homes = state.cards.homes;
  let n = 0;
  for (let s = 0; s < homes.length; s++) if (homeSite(s) === k) n += homes[s];
  return n * HOMES.boost;
}
export const rushing = (state, k) => !!state.hot && state.hot.left > 0 && state.hot.site === k;
// Units one symbol of site k pays on the line, at a bet of one.
export const sitePay = (state, k) => PAY.site * REL[k] * siteLevel(state.plots[k]) * (1 + homeBonus(state, k)) * (rushing(state, k) ? RUSH.hotMult : 1);
// The same for the star or capacity step after this one: what building buys.
export function sitePayAfter(state, k, what) {
  const p = state.plots[k];
  const next = what === 'cap' ? { stage: p.stage, cap: p.cap + 1 } : { stage: p.stage + 1, cap: p.cap };
  return PAY.site * REL[k] * siteLevel(next) * (1 + homeBonus(state, k));
}
// The prize on the bell tower, in units at a bet of one.
const parkWorth = (plots) => plots.reduce((n, p, k) => n + REL[k] * siteLevel(p), 0);
export const bellPrize = (state) => BELL.base + BELL.perPark * parkWorth(state.plots);

// Average coins a spin returns in a park built this far, in units at a bet of
// one, with no pets, card creatures or rush hour helping.
function evOf(plots) {
  const worth = parkWorth(plots);
  const built = plots.filter((p) => p.stage > 0).length;
  const mixed = 3 * ((MIXED_WEIGHTS.coin * PAY.coin + MIXED_WEIGHTS.sack * PAY.sack) / MIXED_TOTAL + SITE_CHANCE * PAY.site * worth);
  const rush = outcomeChance('rush') / PLOTS.length; // the chance of a rush hour at any one site
  const after = RUSH.hotSpins * outcomeChance('mixed') * 3 * SITE_CHANCE * (RUSH.hotMult - 1); // symbols' worth of extra in the spins that follow
  return (
    (outcomeChance('mixed') + rush * (PLOTS.length - built)) * mixed +
    rush * (RUSH.mult + after) * PAY.site * worth +
    outcomeChance('coins3') * PAY.coins3 +
    outcomeChance('jackpot') * PAY.jackpot +
    outcomeChance('bell') * BELL.typical * (BELL.base + BELL.perPark * worth)
  );
}
export const spinEV = (state) => evOf(state.plots);

// How many bet-one spins a park is meant to take from empty to finished.
export const townSpins = (town) => Math.min(90 + 80 * town + 10 * town * town, T.spinsCap);

// The reels pay little in an empty park and a lot in a full one, so prices are
// set against the average over a whole build: play a park through, always
// buying the cheapest thing on offer, and see what a spin was worth on the way.
export const BUILD_EV = (() => {
  const plots = PLOTS.map(() => ({ stage: 0, cap: 0 }));
  const price = (k, p, cap) => T.slotWeights[k] * (cap ? T.capWeights[p.cap] : T.stageWeights[p.stage]);
  let spins = 0;
  for (;;) {
    let best = null;
    plots.forEach((p, k) => {
      if (p.stage < STAGES && (!best || price(k, p, false) < best.cost)) best = { k, cap: false, cost: price(k, p, false) };
      if (p.cap < CAP_STEPS && p.stage >= (p.cap + 1) * 2 && (!best || price(k, p, true) < best.cost)) best = { k, cap: true, cost: price(k, p, true) };
    });
    if (!best) break;
    spins += best.cost / (SLOT_SUM * STEP_SUM) / evOf(plots);
    if (best.cap) plots[best.k].cap++;
    else plots[best.k].stage++;
  }
  return 1 / spins;
})();
export const EV_EMPTY = evOf(PLOTS.map(() => ({ stage: 0, cap: 0 })));
export const EV_FULL = evOf(PLOTS.map(() => ({ stage: STAGES, cap: CAP_STEPS })));

const share = (town, slot, weight) => nice((BUILD_EV * unit(town) * townSpins(town) * T.slotWeights[slot] * weight) / (SLOT_SUM * STEP_SUM));

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
export const rushBonus = (state) => 1 + talent(state, 'rush');

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
  return p.stage > 0 ? ticket(state.town, p.stage) * (1 + T.capBoost * p.cap) * (1 + talent(state, 'gate')) * (1 + homeBonus(state, k)) : 0;
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
