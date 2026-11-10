// Headless balance check: a bot plays the real rules for a number of days and
// prints how far it gets. Usage: node tools/balance.mjs [days] [sessionsPerDay] [seed]
import { CARDS, CARD_SETS, PACKS, PLOTS, STAGES, TUNING } from '../js/config.js';
import * as E from '../js/economy.js';
import { fmt } from '../js/format.js';
import { currentMission } from '../js/goals.js';
import * as R from '../js/rules.js';
import * as S from '../js/sim.js';
import { newState } from '../js/state.js';

const days = Number(process.argv[2]) || 7;
const sessions = Number(process.argv[3]) || 4;
const seed = Number(process.argv[4]) || 7;
const rand = S.mulberry32(seed);

const DAY = 24 * 3600e3;
let now = 20000 * DAY + 8 * 3600e3; // 8 in the morning
const state = newState(now);
state.seed = seed;
const world = S.createWorld(state, rand);
const tally = { fromRegen: 0, sessions: 0 };

// The till: measure what a finished fair takes per hour, in units.
{
  const probe = newState(now);
  probe.plots.forEach((p) => { p.stage = STAGES; p.cap = true; });
  const w = S.createWorld(probe, S.mulberry32(3));
  for (let t = 0; t < 900; t += 0.1) S.step(w, 0.1);
  w.events.length = 0;
  const perHour = (E.idleRate(probe) * 3600) / E.unit(0);
  console.log(`A finished fair takes ${perHour.toFixed(1)} units an hour from guests; a spin is worth ${E.spinEV().toFixed(2)} units.`);
  console.log(`So the till is worth about ${(perHour / E.spinEV()).toFixed(1)} spins an hour.\n`);
}

function spendCoins() {
  for (let guard = 0; guard < 200; guard++) {
    if (E.townComplete(state)) {
      const from = state.town;
      R.travel(state);
      S.resetWorld(world);
      console.log(`  day ${(((now - 20000 * DAY) / DAY) + 1).toFixed(1).padStart(4)}  finished town ${from + 1} after ${state.stats.spins} spins (${state.stats.tokensSpent} tokens)`);
      continue;
    }
    let best = -1;
    let bestCost = Infinity;
    for (const p of PLOTS) {
      const plot = state.plots[p.index];
      if (plot.splat) {
        R.repairPlot(state, p.index);
        continue;
      }
      if (plot.stage >= STAGES && plot.cap) continue;
      const cost = E.stageCost(state.town, p.index, Math.min(plot.stage, STAGES) + 1);
      if (cost < bestCost) {
        bestCost = cost;
        best = p.index;
      }
    }
    if (best < 0 || state.coins < bestCost) break;
    R.upgradePlot(state, best);
  }
}

function housekeeping() {
  for (const type of Object.keys(PACKS)) while (state.cards.packs[type] > 0) R.openPack(state, type, rand);
  for (const set of CARD_SETS) R.claimSet(state, set.index);
  if (R.albumComplete(state)) R.claimAlbum(state);
  for (const id of ['grand', 'big', 'small']) while (R.vaultBuy(state, id, rand)) { /* spend stars */ }
  R.feedPet(state);
  while (state.wheel.tickets > 0) R.wheelSpin(state, rand);
  while (currentMission(state).done) S.claimMission(world);
  world.events.length = 0;
}

function session() {
  tally.sessions++;
  const before = state.tokens;
  const res = R.tick(state, now, rand, TUNING.incomingMaxAway);
  tally.fromRegen += state.tokens - before;
  if (res.league) { /* prize already granted */ }
  R.claimDaily(state, now);
  housekeeping();
  for (let guard = 0; guard < 100000 && state.tokens >= 1; guard++) {
    const bets = E.availableBets(state);
    R.setBet(state, bets[Math.max(0, bets.length - 2)]);
    const r = R.spin(state, rand, now);
    if (!r.ok) break;
    if (state.pending?.type === 'attack') {
      const free = PLOTS.map((p) => p.index).filter((k) => !state.pending.rival.splats[k]);
      R.resolveAttack(state, free[Math.floor(rand() * free.length)]);
    } else if (state.pending?.type === 'raid') {
      const order = [0, 1, 2, 3].sort(() => rand() - 0.5);
      for (const tub of order.slice(0, 3)) R.raidPick(state, tub);
    }
    spendCoins();
    housekeeping();
    now += 4000; // a spin takes a few seconds
  }
  spendCoins();
}

for (let d = 0; d < days; d++) {
  const dayStart = now;
  for (let k = 0; k < sessions; k++) {
    now = dayStart + (k * 14 * 3600e3) / Math.max(1, sessions - 1 || 1);
    const before = state.coins;
    S.applyOffline(world, 2 * 3600); // the till, between sessions
    tally.idle = (tally.idle || 0) + state.coins - before;
    session();
    // keep the fair's flow estimate alive for the till
    for (let t = 0; t < 120; t += 0.1) S.step(world, 0.1);
    world.events.length = 0;
  }
  now = dayStart + DAY;
  const owned = R.cardsOwned(state);
  console.log(
    `day ${String(d + 1).padStart(2)}: town ${state.town + 1}, ${state.stats.spins} spins, ${state.stats.tokensSpent} tokens spent, ` +
    `cards ${owned}/${CARDS.length} (season ${state.cards.season}), sets ${state.cards.sets.filter(Boolean).length}, ` +
    `Chips lv ${state.pet.level}, mission #${state.mission.index}, coins ${fmt(state.coins)}`,
  );
}

console.log(`\nTokens from the timer: ${tally.fromRegen} of ${state.stats.tokensSpent} spent (${Math.round((tally.fromRegen / state.stats.tokensSpent) * 100)}%).`);
console.log(`Attacks ${state.stats.attacks}, lucky dips ${state.stats.raids}, jackpots ${state.stats.jackpots}, pies taken ${state.stats.pied}, pies blocked ${state.stats.shielded}.`);
