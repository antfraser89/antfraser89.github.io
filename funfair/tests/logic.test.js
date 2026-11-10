import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ATTRACTIONS, PARK, SHOP, TUNING } from '../js/config.js';
import * as E from '../js/economy.js';
import { fmt, fmtClock, fmtTime, money } from '../js/format.js';
import { GOALS, currentGoal } from '../js/goals.js';
import * as S from '../js/sim.js';
import { exportCode, hydrate, importCode, newState, parseSave, serialize } from '../js/state.js';

const run = (world, seconds, dt = 0.1, each) => {
  for (let t = 0; t < seconds; t += dt) {
    S.step(world, dt);
    if (each) each();
    world.events.length = 0;
  }
};

const freshWorld = (seed = 1) => S.createWorld(newState(), S.mulberry32(seed));

// ---- formatting ----------------------------------------------------------

test('fmt keeps three significant figures and rounds down', () => {
  assert.equal(fmt(0), '0');
  assert.equal(fmt(7), '7');
  assert.equal(fmt(2.25), '2.2');
  assert.equal(fmt(999), '999');
  assert.equal(fmt(1000), '1.00K');
  assert.equal(fmt(1239), '1.23K');
  assert.equal(fmt(12399), '12.3K');
  assert.equal(fmt(999999), '999K');
  assert.equal(fmt(1e6), '1.00M');
  assert.equal(fmt(2.5e9), '2.50B');
  assert.equal(fmt(1e15), '1.00Qa');
  assert.equal(fmt(1e60), '1.00e60');
  assert.equal(money(1500), '£1.50K');
});

test('fmtTime and fmtClock', () => {
  assert.equal(fmtTime(42), '42s');
  assert.equal(fmtTime(125), '2m 05s');
  assert.equal(fmtTime(3 * 3600 + 120), '3h 02m');
  assert.equal(fmtClock(75), '1:15');
  assert.equal(fmtClock(0), '0:00');
});

// ---- economy -------------------------------------------------------------

test('milestones follow the level table and continue every 100 levels', () => {
  assert.equal(E.milestoneCount(1), 0);
  assert.equal(E.milestoneCount(10), 1);
  assert.equal(E.milestoneCount(24), 1);
  assert.equal(E.milestoneCount(25), 2);
  assert.equal(E.milestoneCount(500), 11);
  assert.equal(E.milestoneCount(600), 12);
  assert.equal(E.nextMilestone(1), 10);
  assert.equal(E.nextMilestone(10), 25);
  assert.equal(E.nextMilestone(500), 600);
});

test('bulk cost is the sum of single level costs', () => {
  const def = ATTRACTIONS[3];
  let sum = 0;
  for (let l = 7; l < 7 + 13; l++) sum += E.levelCost(def, l);
  assert.ok(Math.abs(E.bulkCost(def, 7, 13) - sum) / sum < 1e-9);
  assert.equal(E.bulkCost(def, 7, 0), 0);
});

test('maxAffordable buys as many levels as the cash allows and no more', () => {
  const def = ATTRACTIONS[0];
  for (const cash of [0, 19, 20, 21, 500, 12345, 9.9e9]) {
    const n = E.maxAffordable(def, 1, cash);
    assert.ok(E.bulkCost(def, 1, n) <= cash);
    assert.ok(E.bulkCost(def, 1, n + 1) > cash);
  }
});

test('ticket price stacks level, milestones, lights, golden tickets and fame', () => {
  const s = newState();
  s.attractions[0].built = true;
  s.attractions[0].level = 1;
  assert.equal(E.ticketPrice(s, 0), 1);
  s.attractions[0].level = 10;
  assert.equal(E.ticketPrice(s, 0), 20);
  s.park.lights = 2;
  assert.equal(E.ticketPrice(s, 0), 40);
  s.shop.golden = 1;
  assert.equal(E.ticketPrice(s, 0), 80);
  s.fame = 20;
  assert.equal(E.ticketPrice(s, 0), 160);
});

test('capacity grows and cycles shorten with milestones, within bounds', () => {
  for (const def of ATTRACTIONS) {
    assert.equal(E.capacity(def, 1), def.cap);
    assert.ok(E.capacity(def, 1000) <= def.cap * 2.5 + 0.5);
    assert.ok(E.cycleTime(def, 1000) >= def.cycle * 0.6);
    assert.ok(E.cycleTime(def, 1000) < def.cycle);
  }
});

test('fame formula round-trips', () => {
  assert.equal(E.fameForEarned(0), 0);
  for (const f of [1, 5, 40, 1234]) assert.equal(E.fameForEarned(E.earnedForFame(f)), f);
});

test('attraction costs and prices rise with every tier', () => {
  for (let i = 1; i < ATTRACTIONS.length; i++) {
    assert.ok(ATTRACTIONS[i].cost > ATTRACTIONS[i - 1].cost * 5);
    assert.ok(ATTRACTIONS[i].price > ATTRACTIONS[i - 1].price * 3);
  }
});

// ---- saves ---------------------------------------------------------------

test('hydrate survives junk and clamps bad values', () => {
  for (const junk of [null, 42, 'x', [], { attractions: 'no' }, { cash: -5, stars: NaN, park: { marketing: 999 } }]) {
    const s = hydrate(junk);
    assert.ok(s.cash >= 0);
    assert.equal(s.attractions.length, ATTRACTIONS.length);
    assert.ok(s.park.marketing <= PARK.marketing.max);
    assert.ok(Number.isFinite(s.stars));
  }
  const s = hydrate({ attractions: [{ built: false, level: 9, operator: true }], shop: { golden: 999 } });
  assert.equal(s.attractions[0].level, 0);
  assert.equal(s.attractions[0].operator, false);
  assert.equal(s.shop.golden, SHOP.golden.costs.length);
});

test('save, export and import round-trip the state', () => {
  const world = freshWorld(3);
  S.build(world, 0);
  world.state.cash = 1e6;
  S.upgrade(world, 0, 12);
  S.hire(world, 0);
  run(world, 60);
  const s = world.state;
  const viaJson = parseSave(serialize(s, 1234));
  assert.deepEqual(viaJson, s);
  assert.equal(viaJson.lastSaved, 1234);
  assert.deepEqual(importCode(exportCode(s)), hydrate(JSON.parse(JSON.stringify(s))));
  assert.equal(importCode('not a save'), null);
  assert.equal(parseSave('{broken'), null);
});

// ---- simulation ----------------------------------------------------------

test('nothing happens until the first attraction is built', () => {
  const world = freshWorld();
  run(world, 30);
  assert.equal(world.guests.length, 0);
  assert.equal(world.state.cash, TUNING.startCash);
});

test('a stall with no operator needs tapping; an operator runs it', () => {
  const world = freshWorld(5);
  const s = world.state;
  assert.equal(S.build(world, 0), true);
  assert.equal(S.build(world, 0), false);
  assert.equal(s.cash, TUNING.startCash - ATTRACTIONS[0].cost);
  run(world, 40);
  assert.equal(s.stats.earned, 0, 'no takings without a tap');
  assert.ok(world.rt[0].riders.length > 0, 'customers are waiting at the counter');
  assert.equal(S.isReady(world, 0), true);
  assert.equal(S.tapAttraction(world, 0), true);
  assert.equal(S.tapAttraction(world, 0), false);
  run(world, 5);
  assert.ok(s.stats.earned > 0);
  assert.equal(s.stats.manualRuns, 1);

  s.cash = ATTRACTIONS[0].opCost;
  assert.equal(S.hire(world, 0), true);
  assert.equal(S.hire(world, 0), false);
  const before = s.stats.earned;
  run(world, 60);
  assert.ok(s.stats.earned > before + 10, 'operator keeps the stall earning');
  assert.equal(S.tapAttraction(world, 0), false);
});

test('upgrades are all-or-nothing and award milestone stars once', () => {
  const world = freshWorld();
  const s = world.state;
  S.build(world, 0);
  s.cash = 5;
  assert.equal(S.upgrade(world, 0, 1), 0);
  s.cash = E.bulkCost(ATTRACTIONS[0], 1, 9);
  assert.equal(S.upgrade(world, 0, 10), 0);
  assert.equal(S.upgrade(world, 0, 9), 9);
  assert.equal(s.attractions[0].level, 10);
  assert.ok(s.cash >= 0 && s.cash < 1e-6);
  assert.equal(s.stars, 1);
  assert.equal(S.upgrade(world, 1, 1), 0, 'cannot upgrade an unbuilt plot');
  // after a tour the same milestone pays no second star
  s.runEarned = E.earnedForFame(TUNING.tourMinFame);
  assert.equal(S.goOnTour(world), true);
  const stars = s.stars;
  S.build(world, 0);
  s.cash = 1e9;
  S.upgrade(world, 0, 9);
  assert.equal(s.stars, stars);
  S.upgrade(world, 0, 15);
  assert.equal(s.stars, stars + 1);
});

test('the simulation keeps its invariants over a long busy session', () => {
  const world = freshWorld(11);
  const s = world.state;
  s.cash = 1e15;
  for (let i = 0; i < ATTRACTIONS.length; i++) {
    S.build(world, i);
    if (i % 3 !== 0) S.hire(world, i);
  }
  for (let k = 0; k < 16; k++) S.buyPark(world, 'marketing');
  for (let k = 0; k < 5; k++) S.buyPark(world, 'passes');
  let peak = 0;
  run(world, 900, 0.1, () => {
    peak = Math.max(peak, world.guests.length);
    if (world.rand() < 0.05) for (let i = 0; i < ATTRACTIONS.length; i += 3) S.tapAttraction(world, i);
    for (let i = 0; i < ATTRACTIONS.length; i++) {
      const rt = world.rt[i];
      assert.ok(rt.queue.length <= TUNING.queueLimit);
      assert.ok(rt.inbound >= 0);
      assert.ok(rt.riders.length <= E.capacity(ATTRACTIONS[i], s.attractions[i].level));
    }
  });
  assert.ok(peak > 40 && peak <= TUNING.maxGuests, `peak guests ${peak}`);
  for (const g of world.guests) {
    assert.ok(Number.isFinite(g.x) && Number.isFinite(g.y));
    assert.ok(g.x > 60 && g.x < 940, `guest wandered off the map: x=${g.x}`);
  }
  for (let i = 0; i < ATTRACTIONS.length; i++) assert.ok(s.attractions[i].served > 0, `${ATTRACTIONS[i].id} served nobody`);
  // the smoothed flow estimate tracks what was really served
  const flow = s.attractions.reduce((n, a) => n + a.flow, 0);
  assert.ok(flow > 1 && flow < 20, `flow ${flow}`);
});

test('same seed, same game', () => {
  const play = () => {
    const world = freshWorld(42);
    S.build(world, 0);
    world.state.cash = 500;
    S.hire(world, 0);
    run(world, 120);
    return JSON.stringify(world.state);
  };
  assert.equal(play(), play());
});

test('boosts multiply takings and run out', () => {
  const world = freshWorld(2);
  const s = world.state;
  S.build(world, 0);
  assert.equal(E.boostMult(s), 1);
  assert.equal(S.launchFireworks(world), true);
  assert.equal(S.launchFireworks(world), false, 'cooldown');
  assert.equal(E.boostMult(s), TUNING.fireworksMult);
  s.boosts.rush = 10;
  assert.equal(E.boostMult(s), TUNING.fireworksMult * TUNING.rushMult);
  run(world, TUNING.fireworksDuration + 1);
  assert.equal(E.boostMult(s), 1);
  assert.ok(s.fireworksCd > 0);
  run(world, TUNING.fireworksCooldown);
  assert.equal(S.launchFireworks(world), true);
});

test('balloons appear, pay out and can only be popped once', () => {
  const world = freshWorld(8);
  const s = world.state;
  S.build(world, 0);
  let seen = null;
  run(world, 200, 0.1, () => {
    if (!seen && world.balloons.length) seen = world.balloons[0];
  });
  assert.ok(seen, 'a balloon drifted past');
  world.balloons.push(seen);
  const before = { cash: s.cash, stars: s.stars, rush: s.boosts.rush };
  const reward = S.popBalloon(world, seen);
  assert.ok(reward);
  assert.ok(s.cash > before.cash || s.stars > before.stars || s.boosts.rush > before.rush);
  assert.equal(S.popBalloon(world, seen), null);
  assert.equal(s.stats.balloons, 1);
});

test('time away pays only for attractions with an operator, up to the cap', () => {
  const world = freshWorld(4);
  const s = world.state;
  s.cash = 1e6;
  S.build(world, 0);
  S.build(world, 1);
  S.hire(world, 0);
  run(world, 180, 0.1, () => S.tapAttraction(world, 1));
  const auto = E.attractionRate(s, 0);
  assert.ok(auto > 0 && E.attractionRate(s, 1) > 0);
  assert.ok(Math.abs(E.offlineEarnings(s, 100) - auto * 100) < 1e-6);
  const cap = E.offlineCapSeconds(s);
  assert.equal(E.offlineEarnings(s, cap * 10), E.offlineEarnings(s, cap));
  const cash = s.cash;
  const res = S.applyOffline(world, 600);
  assert.ok(Math.abs(s.cash - cash - auto * 600) < 1e-6);
  assert.equal(res.capped, false);
  assert.equal(S.applyOffline(world, cap + 5).capped, true);
});

test('going on tour resets the fair but keeps fame, stars and the star shop', () => {
  const world = freshWorld(6);
  const s = world.state;
  S.build(world, 0);
  assert.equal(S.goOnTour(world), false, 'not famous enough yet');
  s.cash = 1e9;
  S.build(world, 1);
  S.upgrade(world, 0, 30);
  S.buyPark(world, 'marketing');
  s.stars = 100;
  assert.equal(S.buyShop(world, 'golden'), true);
  assert.equal(S.buyShop(world, 'headstart'), true);
  run(world, 30);
  s.runEarned = E.earnedForFame(12) + 1;
  const stars = s.stars;
  assert.equal(S.goOnTour(world), true);
  assert.equal(s.fame, 12);
  assert.equal(s.tours, 1);
  assert.equal(s.stars, stars + TUNING.tourStars);
  assert.equal(s.shop.golden, 1);
  assert.equal(s.cash, SHOP.headstart.cash[1]);
  assert.equal(s.runEarned, 0);
  assert.equal(s.park.marketing, 0);
  assert.ok(s.attractions.every((a) => !a.built && a.level === 0 && !a.operator));
  assert.equal(world.guests.length, 0);
  assert.equal(E.globalMult(s), 2 * E.fameMult(12));
});

test('park and shop purchases respect costs and caps', () => {
  const world = freshWorld();
  const s = world.state;
  s.cash = 0;
  assert.equal(S.buyPark(world, 'marketing'), false);
  s.cash = 1e30;
  for (let k = 0; k < PARK.passes.max; k++) assert.equal(S.buyPark(world, 'passes'), true);
  assert.equal(S.buyPark(world, 'passes'), false);
  assert.equal(E.visitsPerGuest(s), TUNING.baseVisits + PARK.passes.max);
  assert.equal(S.buyPark(world, 'nonsense'), false);

  s.stars = 5;
  assert.equal(S.buyShop(world, 'golden'), false);
  s.stars = 1e6;
  for (let k = 0; k < SHOP.owls.costs.length; k++) assert.equal(S.buyShop(world, 'owls'), true);
  assert.equal(S.buyShop(world, 'owls'), false);
  assert.equal(E.offlineCapSeconds(s), 24 * 3600);
  assert.equal(S.buyShop(world, 'warp'), false, 'nothing to warp with no income');
});

test('goals are claimable in order and never run out', () => {
  const world = freshWorld(9);
  const s = world.state;
  assert.equal(currentGoal(s).done, false);
  assert.equal(S.claimGoal(world), false);
  S.build(world, 0);
  assert.equal(currentGoal(s).done, true);
  assert.equal(S.claimGoal(world), true);
  assert.equal(s.stars, GOALS[0].stars);
  assert.equal(s.goal.index, 1);
  // skip to the end of the scripted list: generated goals take over
  s.goal.index = GOALS.length - 1;
  s.attractions[0].level = 200;
  assert.equal(S.claimGoal(world), true);
  const g1 = currentGoal(s);
  assert.ok(g1.text.length > 0 && g1.target > 0 && !g1.done);
  const saved = parseSave(serialize(s));
  assert.deepEqual(currentGoal(saved), g1);
  s.stats.earned = g1.target;
  s.stats.served = 1e9;
  for (let k = 0; k < 6; k++) {
    const g = currentGoal(s);
    if (g.point >= 0) s.attractions[g.point].level = g.target;
    s.stats.earned = Math.max(s.stats.earned, g.target);
    s.stats.served = Math.max(s.stats.served, g.target);
    assert.equal(S.claimGoal(world), true, g.text);
  }
});

test('every scripted goal can be read against a fresh state', () => {
  const s = newState();
  for (let i = 0; i < GOALS.length; i++) {
    s.goal.index = i;
    const g = currentGoal(s);
    assert.ok(g.text && g.target > 0 && g.stars > 0 && g.cur >= 0);
  }
});
