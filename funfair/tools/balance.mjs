// Headless balance check: a greedy bot plays the real simulation and prints
// when it reaches each attraction and tour. Usage: node tools/balance.mjs [hours] [seed]
import { ATTRACTIONS, PARK, TUNING } from '../js/config.js';
import * as E from '../js/economy.js';
import { fmt, fmtTime } from '../js/format.js';
import { currentGoal } from '../js/goals.js';
import * as S from '../js/sim.js';
import { newState } from '../js/state.js';

const hours = Number(process.argv[2]) || 3;
const seed = Number(process.argv[3]) || 7;
const quiet = process.argv.includes('--quiet');

// Experimental overrides for tuning: RC / RP are the per-tier cost and price ratios.
const nice = (n) => {
  const p = Math.pow(10, Math.floor(Math.log10(n)) - 1);
  return Math.round(n / p) * p;
};
if (process.env.RC || process.env.RP) {
  const rc = Number(process.env.RC) || 9;
  const rp = Number(process.env.RP) || 6.67;
  const p0 = Number(process.env.P0) || 1;
  ATTRACTIONS.forEach((d, k) => {
    d.cost = k === 0 ? 20 : nice(20 * Math.pow(rc, k));
    d.price = k === 0 ? p0 : nice(p0 * Math.pow(rp, k));
    d.opCost = k === 0 ? 45 : Math.round(d.cost * 1.4);
  });
  if (process.env.SHOW) console.log(ATTRACTIONS.map((d) => `${d.id}: cost ${d.cost} price ${d.price}`).join('\n'));
}
if (process.env.LIGHTS) {
  const [b, g] = process.env.LIGHTS.split(',').map(Number);
  PARK.lights.baseCost = b;
  PARK.lights.growth = g;
}

const state = newState();
const world = S.createWorld(state, S.mulberry32(seed));
const log = (msg) => {
  if (!quiet) console.log(`${fmtTime(world.time).padStart(9)}  ${msg}`);
};

const timeline = [];

function options() {
  const s = state;
  const total = E.totalRate(s);
  const built = s.attractions.filter((a) => a.built);
  const avgFlow = built.length ? built.reduce((n, a) => n + a.flow, 0) / built.length : 0.3;
  const opts = [];
  for (let i = 0; i < ATTRACTIONS.length; i++) {
    const a = s.attractions[i];
    const def = ATTRACTIONS[i];
    if (!a.built) {
      const gain = Math.max(0.25, avgFlow) * def.price * E.globalMult(s);
      opts.push({ kind: 'build', i, cost: def.cost, gain, run: () => S.build(world, i) });
      break; // only consider the next plot
    }
    const flow = Math.max(a.flow, 0.05);
    const price = E.ticketPrice(s, i);
    const priceAt = (lv) => def.price * lv * Math.pow(2, E.milestoneCount(lv)) * E.globalMult(s);
    opts.push({
      kind: 'level', i, cost: E.levelCost(def, a.level), gain: flow * (priceAt(a.level + 1) - price),
      run: () => S.upgrade(world, i, 1),
    });
    const toNext = E.nextMilestone(a.level) - a.level;
    if (toNext > 1) {
      opts.push({
        kind: 'milestone', i, cost: E.bulkCost(def, a.level, toNext),
        gain: flow * (priceAt(a.level + toNext) - price), run: () => S.upgrade(world, i, toNext),
      });
    }
    if (!a.operator) {
      opts.push({ kind: 'hire', i, cost: def.opCost, gain: Math.max(flow * price, def.opCost / 60), run: () => S.hire(world, i) });
    }
  }
  const parkGain = {
    marketing: total * (TUNING.arrivalPerLevel / E.arrivalRate(s)) * 0.8,
    passes: total * (1 / E.visitsPerGuest(s)) * 0.7,
    paths: total * 0.05,
    lights: total * (0.5 / (1 + 0.5 * s.park.lights)),
  };
  for (const key of Object.keys(PARK)) {
    if (s.park[key] >= PARK[key].max) continue;
    opts.push({ kind: key, i: -1, cost: E.parkCost(key, s.park[key]), gain: parkGain[key], run: () => S.buyPark(world, key) });
  }
  for (const o of opts) o.payback = o.gain > 0 ? o.cost / o.gain : Infinity;
  return opts.sort((a, b) => a.payback - b.payback);
}

function think() {
  const s = state;
  if (currentGoal(s).done) S.claimGoal(world);
  for (let i = 0; i < ATTRACTIONS.length; i++) S.tapAttraction(world, i);
  for (const b of [...world.balloons]) if (b.y < 1200) S.popBalloon(world, b);
  if (s.fireworksCd <= 0) S.launchFireworks(world);
  while (s.stars >= E.shopCost('golden', s.shop.golden)) S.buyShop(world, 'golden');

  for (let guard = 0; guard < 200; guard++) {
    const opts = options();
    if (!opts.length) break;
    const best = opts[0];
    const pick = opts.find((o) => o.cost <= s.cash && o.payback <= best.payback * 3);
    if (!pick) break;
    const before = s.cash;
    pick.run();
    if (s.cash === before) break;
    if (pick.kind === 'build') {
      timeline.push({ t: world.time, what: ATTRACTIONS[pick.i].name, tour: s.tours });
      log(`BUILD ${ATTRACTIONS[pick.i].name}  (rate ${fmt(E.totalRate(s))}/s)`);
    }
  }

  const gain = E.fameGain(s);
  if (gain >= Math.max(10, s.fame)) {
    const next = s.attractions.findIndex((a) => !a.built);
    const rate = Math.max(E.totalRate(s), 1);
    const wait = next < 0 ? Infinity : (ATTRACTIONS[next].cost - s.cash) / rate;
    if (wait > 900) {
      log(`TOUR +${gain} fame (total ${s.fame + gain}), earned ${fmt(s.runEarned)}, built ${s.attractions.filter((a) => a.built).length}`);
      timeline.push({ t: world.time, what: `TOUR +${gain}`, tour: s.tours });
      S.goOnTour(world);
    }
  }
}

const dt = 0.1;
const end = hours * 3600;
let nextThink = 0;
let maxGuests = 0;
const REPORT = Number(process.env.REPORT) || 600;
let nextReport = REPORT;
while (world.time < end) {
  S.step(world, dt);
  world.events.length = 0;
  if (world.guests.length > maxGuests) maxGuests = world.guests.length;
  if (world.time >= nextThink) {
    think();
    nextThink += 0.5;
  }
  if (world.time >= nextReport) {
    nextReport += REPORT;
    const lv = state.attractions.filter((a) => a.built).map((a) => a.level).join(',');
    log(`cash ${fmt(state.cash)}  rate ${fmt(E.totalRate(state))}/s  guests ${world.guests.length}  stars ${state.stars}  mk ${state.park.marketing} pa ${state.park.passes} pt ${state.park.paths} li ${state.park.lights}  lv [${lv}]`);
  }
}

console.log('\nSummary');
for (const e of timeline) console.log(`  ${fmtTime(e.t).padStart(9)}  tour ${e.tour}  ${e.what}`);
console.log(`  final: fame ${state.fame}, tours ${state.tours}, stars ${state.stars}, goal #${state.goal.index}, earned ${fmt(state.stats.earned)}, served ${fmt(state.stats.served)}, peak guests ${maxGuests}`);
