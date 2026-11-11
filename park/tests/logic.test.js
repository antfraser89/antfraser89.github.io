import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BELL, CAP_STEPS, CARDS, CARD_SETS, DAILY, EVENT_MILESTONES, HOMES, MIXED_WEIGHTS, OPENING_SPINS, OUTCOMES, PACKS, PLOTS, RIVALS, RUSH, STAGES, TUNING, VAULT,
  WHEEL, homeSite, siteOf, townInfo,
} from '../js/config.js';
import * as E from '../js/economy.js';
import { fmt, fmtClock, fmtTime, money } from '../js/format.js';
import { MISSIONS, currentMission } from '../js/goals.js';
import * as R from '../js/rules.js';
import * as S from '../js/sim.js';
import { exportCode, hydrate, importCode, newState, parseSave, serialize } from '../js/state.js';

const T0 = 1.8e12; // a fixed "now" in milliseconds
const MIN = 60e3;
const HOUR = 3600e3;

const fresh = (seed = 1) => {
  const state = newState(T0, seed);
  return { state, rand: S.mulberry32(seed) };
};
// Skip the scripted opening so spins are random.
const seasoned = (seed = 1) => {
  const g = fresh(seed);
  g.state.stats.spins = OPENING_SPINS.length;
  return g;
};
// Play out a go at the bell tower with an ordinary player's swings: good, but
// not perfect, landing on what the economy assumes on average.
const playOut = (state, rand, power = () => 0.52 + 0.48 * rand()) => {
  let last = null;
  while (state.pending?.type === 'bell') last = R.bellSwing(state, power());
  return last;
};
const build = (state, stage, cap = 0) => state.plots.forEach((p) => { p.stage = stage; p.cap = cap; });

// ---- formatting ----------------------------------------------------------

test('fmt keeps three significant figures and rounds down', () => {
  assert.equal(fmt(0), '0');
  assert.equal(fmt(999), '999');
  assert.equal(fmt(1239), '1.23K');
  assert.equal(fmt(999999), '999K');
  assert.equal(fmt(2.5e9), '2.50B');
  assert.equal(fmt(1e60), '1.00e60');
  assert.equal(money(1500), '£1.50K');
  assert.equal(fmtTime(125), '2m 05s');
  assert.equal(fmtClock(75), '1:15');
});

// ---- economy -------------------------------------------------------------

test('outcome weights add up, and a spin is worth what the sums say in an empty, half-built and full park', () => {
  const total = OUTCOMES.reduce((n, o) => n + o.w, 0);
  assert.ok(Math.abs(total - 100) < 1e-9);
  assert.ok(Math.abs(Object.values(MIXED_WEIGHTS).reduce((a, b) => a + b, 0) - 100) < 1e-9);
  const worth = [];
  for (const [stage, cap] of [[0, 0], [5, 2], [STAGES, CAP_STEPS]]) {
    const { state, rand } = seasoned(5 + stage);
    build(state, stage, cap);
    state.tokens = 1e9;
    const spins = 60000;
    let coins = 0;
    for (let i = 0; i < spins; i++) {
      const before = state.coins;
      assert.equal(R.spin(state, rand, T0).ok, true);
      playOut(state, rand);
      coins += state.coins - before;
    }
    const measured = coins / spins / E.unit(0);
    const expected = E.spinEV(state);
    worth.push(expected);
    assert.ok(Math.abs(measured - expected) / expected < 0.06, `stage ${stage}: measured ${measured.toFixed(2)} vs ${expected.toFixed(2)}`);
  }
  assert.ok(worth[0] < worth[1] && worth[1] < worth[2], 'the more you build, the more the reels pay');
  assert.ok(worth[2] > worth[0] * 3, 'a full park pays several times what an empty one does');
  assert.ok(E.BUILD_EV > E.EV_EMPTY && E.BUILD_EV < E.EV_FULL);
});

test('a park costs about its target number of spins, and early parks each cost more', () => {
  // play each park through, buying the cheapest thing every time, and count the spins
  const spinsToBuild = (t) => {
    const { state } = fresh();
    state.town = t;
    let spins = 0;
    for (;;) {
      let best = null;
      for (const p of PLOTS) {
        const star = E.nextStar(state, p.index);
        const cap = E.nextCap(state, p.index);
        if (star && (!best || star.cost < best.cost)) best = { k: p.index, cap: false, cost: star.cost };
        if (cap && cap.open && (!best || cap.cost < best.cost)) best = { k: p.index, cap: true, cost: cap.cost };
      }
      if (!best) return spins;
      spins += best.cost / (E.spinEV(state) * E.unit(t));
      state.plots[best.k][best.cap ? 'cap' : 'stage']++;
    }
  };
  for (let t = 0; t < 30; t++) {
    const spins = spinsToBuild(t);
    assert.ok(Math.abs(spins - E.townSpins(t)) / E.townSpins(t) < 0.05, `park ${t}: ${spins}`);
    if (t < 8) assert.ok(E.townCost(t + 1) > E.townCost(t) * 1.3);
  }
  for (const p of PLOTS) {
    for (let s = 1; s < STAGES; s++) assert.ok(E.stageCost(0, p.index, s + 1) > E.stageCost(0, p.index, s));
  }
});

test('tokens trickle back up to the cap and no further', () => {
  const { state } = fresh();
  state.tokens = 10;
  state.tokenAt = T0;
  assert.equal(R.regenTokens(state, T0 + 119e3), 0);
  assert.equal(R.regenTokens(state, T0 + 120e3), 1);
  assert.equal(Math.round(R.nextTokenIn(state, T0 + 180e3)), 60);
  assert.equal(R.regenTokens(state, T0 + 10 * HOUR), E.tokenCap(state) - 11);
  assert.equal(state.tokens, E.tokenCap(state));
  assert.equal(R.nextTokenIn(state, T0 + 10 * HOUR), 0);
  state.tokens = 500; // prizes can push past the cap; the timer just waits
  assert.equal(R.regenTokens(state, T0 + 20 * HOUR), 0);
  assert.equal(state.tokens, 500);
});

test('bets open up with a bigger token pile, and the opening spins are single', () => {
  const { state } = fresh();
  state.tokens = 5000;
  assert.deepEqual(E.availableBets(state), [1]);
  state.stats.spins = OPENING_SPINS.length;
  assert.deepEqual(E.availableBets(state), TUNING.bets);
  state.tokens = 30;
  assert.deepEqual(E.availableBets(state), [1, 2]);
  state.bet = 50;
  assert.equal(R.setBet(state, 50), 2);
  assert.equal(R.cycleBet(state), 1);
});

// ---- the machine ---------------------------------------------------------

test('the opening spins follow the script and teach every mechanic', () => {
  const { state, rand } = fresh(3);
  const seen = [];
  let prizeTokens = 0;
  for (let i = 0; i < OPENING_SPINS.length; i++) {
    const r = R.spin(state, rand, T0);
    assert.equal(r.ok, true);
    assert.equal(r.bet, 1);
    seen.push(r.kind);
    prizeTokens += r.tokens + r.milestones.reduce((n, m) => n + m.tokens, 0);
    if (i === 0) assert.ok(R.upgradePlot(state, 3), 'the first win pays for the first ride');
    if (r.kind === 'rush') assert.equal(r.site, 3, 'the scripted rush hour goes to the ride just built');
    if (r.kind === 'bell') {
      assert.equal(R.spin(state, rand, T0).why, 'pending', 'cannot spin in the middle of a go at the bell');
      const end = playOut(state, rand);
      assert.equal(end.done, true);
      assert.ok(end.total >= 0);
    }
  }
  assert.deepEqual(seen, OPENING_SPINS);
  assert.ok(prizeTokens >= 6, 'the script includes a token win');
  assert.equal(state.tokens, TUNING.startTokens - OPENING_SPINS.length + prizeTokens);
  assert.equal(state.wheel.tickets, 2, 'the script wins a turn on the wheel');
  assert.equal(state.pet.treats, 3);
  assert.ok(state.coins > 0);
});

test('a spin costs the bet, pays in proportion to it, and stops at zero tokens', () => {
  const a = seasoned(9);
  const b = seasoned(9);
  a.state.tokens = b.state.tokens = 1e6;
  b.state.bet = 5;
  for (let i = 0; i < 300; i++) {
    const ra = R.spin(a.state, a.rand, T0);
    const rb = R.spin(b.state, b.rand, T0);
    assert.equal(ra.kind, rb.kind);
    assert.ok(Math.abs(rb.coins - ra.coins * 5) < 1e-6);
    assert.equal(rb.tokens, ra.tokens * 5);
    a.state.pending = b.state.pending = null;
  }
  const { state } = seasoned(2);
  const dull = () => 0.999; // always a mixed spin with no token win
  state.tokens = 2;
  assert.equal(R.spin(state, dull, T0).ok, true);
  assert.equal(R.spin(state, dull, T0).ok, true);
  const out = R.spin(state, dull, T0);
  assert.equal(out.ok, false);
  assert.equal(out.why, 'tokens');
  assert.equal(state.tokens, 0);
});

test('reels show three of a kind exactly when the spin is a triple', () => {
  const { state, rand } = seasoned(4);
  state.tokens = 1e6;
  state.plots[2].stage = 3; // one site open, so rush hours can happen
  const kinds = new Set();
  for (let i = 0; i < 4000; i++) {
    const r = R.spin(state, rand, T0);
    kinds.add(r.kind);
    const triple = r.reels[0] === r.reels[1] && r.reels[1] === r.reels[2];
    assert.equal(triple, r.kind !== 'mixed');
    state.pending = null;
  }
  assert.equal(kinds.size, OUTCOMES.length);
});

test('packs give cards from unlocked sets; spares become stars', () => {
  const { state, rand } = fresh(12);
  assert.equal(R.openPack(state, 'bronze', rand), null);
  state.cards.packs.bronze = 40;
  let stars = 0;
  for (let i = 0; i < 40; i++) {
    const cards = R.openPack(state, 'bronze', rand);
    assert.equal(cards.length, PACKS.bronze.size);
    for (const c of cards) {
      const def = CARDS.find((d) => d.id === c.id);
      assert.equal(def.set, 0, 'only the first set is unlocked in town one');
      assert.equal(def.gold, false, 'bronze packs never hold gold cards');
      assert.equal(c.isNew, c.stars === 0);
      stars += c.stars;
    }
  }
  assert.equal(state.cards.stars, stars);
  assert.ok(stars > 0);
  state.town = CARD_SETS.length - 1;
  assert.equal(R.unlockedSets(state).length, CARD_SETS.length);
});

test('no long droughts: the third pack in a row with nothing new is topped up', () => {
  const { state } = fresh();
  // own everything in set one except a single common card
  const hole = CARD_SETS[0].cards[0];
  for (const c of CARD_SETS[0].cards) if (c !== hole && !c.gold) state.cards.owned[c.id] = 1;
  state.cards.packs.bronze = 3;
  const high = () => 0.999; // always the same spare card
  assert.ok(R.openPack(state, 'bronze', high).every((c) => !c.isNew));
  assert.ok(R.openPack(state, 'bronze', high).every((c) => !c.isNew));
  const third = R.openPack(state, 'bronze', high);
  assert.ok(third.some((c) => c.isNew && c.id === hole.id));
});

test('finished sets pay tokens once; the vault sells cards you are missing; the album resets', () => {
  const { state, rand } = fresh(13);
  state.town = 5;
  assert.equal(R.claimSet(state, 0), null);
  for (const c of CARD_SETS[0].cards) state.cards.owned[c.id] = 1;
  const reward = R.claimSet(state, 0);
  assert.equal(reward.tokens, CARD_SETS[0].reward);
  assert.equal(R.claimSet(state, 0), null);

  assert.equal(R.vaultBuy(state, 'grand', rand), null, 'no stars yet');
  state.cards.stars = VAULT.find((v) => v.id === 'grand').cost + VAULT.find((v) => v.id === 'big').cost;
  const gold = R.vaultBuy(state, 'grand', rand);
  assert.equal(gold.cards.length, 1);
  assert.ok(gold.cards[0].isNew && CARDS.find((c) => c.id === gold.cards[0].id).gold);
  const big = R.vaultBuy(state, 'big', rand);
  assert.equal(big.pack, 'gold');
  assert.ok(big.cards[0].isNew);
  assert.equal(state.cards.stars, 0);

  for (const c of CARDS) state.cards.owned[c.id] = 1;
  assert.equal(R.vaultOffer(state, 'grand').available, false, 'nothing gold left to sell');
  assert.equal(R.claimAlbum(state), null, 'sets must be claimed first');
  for (const set of CARD_SETS) R.claimSet(state, set.index);
  const tokens = state.tokens;
  assert.ok(R.claimAlbum(state));
  assert.ok(state.tokens > tokens);
  assert.equal(state.cards.season, 2);
  assert.equal(R.cardsOwned(state), 0);
});

test('packs can be bought with coins at a price that follows the town', () => {
  const { state } = fresh();
  assert.equal(R.buyPack(state, 'silver'), false);
  state.coins = E.packPrice(0, 'silver');
  assert.equal(R.buyPack(state, 'silver'), true);
  assert.equal(state.coins, 0);
  assert.equal(state.cards.packs.silver, 1);
  assert.ok(E.packPrice(3, 'silver') > E.packPrice(0, 'silver'));
});

// ---- pet, events, league, daily -------------------------------------------

test('feeding the pet levels it up, pays spins and raises the spin meter', () => {
  const { state } = fresh();
  assert.equal(R.feedPet(state), null);
  state.pet.treats = 200;
  const cap = E.tokenCap(state);
  const tokens = state.tokens;
  const fed = R.feedPet(state);
  assert.equal(fed.used, 200);
  assert.ok(fed.levels >= 5);
  assert.equal(state.tokens, tokens + fed.tokens);
  assert.ok(E.tokenCap(state) > cap);
  assert.ok(E.rushBonus(state) > 1);
});

test('spinning earns event points and milestone prizes; the event rolls over', () => {
  const { state, rand } = seasoned(14);
  state.tokens = 1e6;
  state.bet = 10;
  const info = R.eventInfo(state, T0);
  assert.ok(info.theme.name && info.endsAt > T0);
  let prizes = 0;
  for (let i = 0; i < 400; i++) {
    prizes += R.spin(state, rand, T0).milestones.length;
    state.pending = null;
  }
  assert.equal(prizes, EVENT_MILESTONES.length);
  assert.equal(state.event.claimed, EVENT_MILESTONES.length);
  const later = R.eventInfo(state, T0 + TUNING.eventHours * HOUR + MIN);
  assert.equal(later.points, 0);
  assert.equal(later.claimed, 0);
});

test('the pie league ranks you against the rivals and pays out when the day ends', () => {
  const { state } = seasoned(15);
  const start = Math.floor(T0 / (24 * HOUR)) * 24 * HOUR;
  let info = R.leagueInfo(state, start + HOUR);
  assert.equal(info.rows.length, RIVALS.length + 1);
  assert.equal(info.settled, null);
  assert.deepEqual(R.leagueInfo(state, start + HOUR).rows, info.rows, 'same clock, same table');
  state.league.points = 1e6;
  info = R.leagueInfo(state, start + 2 * HOUR);
  assert.equal(info.rank, 1);
  const tokens = state.tokens;
  const next = R.leagueInfo(state, start + 25 * HOUR);
  assert.equal(next.settled.rank, 1);
  assert.equal(state.tokens, tokens + 100);
  assert.equal(state.cards.packs.gold, 1);
  assert.equal(state.league.points, 0);
  assert.equal(R.leagueInfo(state, start + 26 * HOUR).settled, null);
  // sitting a day out pays nothing and raises no result
  assert.equal(R.leagueInfo(state, start + 50 * HOUR).settled, null);
});

test('the daily gift can be claimed once per day and walks through the week', () => {
  const { state } = fresh();
  const noon = new Date(2030, 5, 10, 12).getTime();
  assert.equal(R.dailyReady(state, noon), true);
  assert.equal(R.claimDaily(state, noon).index, 0);
  assert.equal(R.claimDaily(state, noon + HOUR), null);
  for (let d = 1; d < DAILY.length + 1; d++) {
    const got = R.claimDaily(state, noon + d * 24 * HOUR);
    assert.equal(got.index, d % DAILY.length);
  }
});

// ---- missions ------------------------------------------------------------

test('missions pay out in order and never run out', () => {
  const { state } = fresh();
  const world = S.createWorld(state, S.mulberry32(1));
  assert.equal(currentMission(state).done, false);
  assert.equal(S.claimMission(world), null);
  state.stats.spins = 3;
  assert.equal(currentMission(state).done, true);
  const tokens = state.tokens;
  assert.ok(S.claimMission(world));
  assert.equal(state.tokens, tokens + 5);
  for (let i = 0; i < MISSIONS.length; i++) {
    state.mission.index = i;
    const m = currentMission(state);
    assert.ok(m.text && m.target > 0 && m.cur >= 0 && m.reward && m.go);
  }
  state.mission.index = MISSIONS.length;
  state.mission.extra = null;
  for (let i = 0; i < 12; i++) {
    const m = currentMission(state);
    assert.equal(m.done, false);
    assert.deepEqual(currentMission(parseSave(serialize(state))), m);
    const e = state.mission.extra;
    state.stats[e.type] += e.target;
    assert.ok(S.claimMission(world), m.text);
  }
});

// ---- the living fair -----------------------------------------------------

test('hydrate survives junk and clamps bad values', () => {
  for (const junk of [null, 42, 'x', [], { plots: 'no' }, { coins: -5, tokens: NaN, bet: 7, town: -3, inv: { energy: -4 }, merge: { cells: 'x' }, club: 7 }]) {
    const s = hydrate(junk);
    assert.ok(s.coins >= 0 && Number.isFinite(s.tokens));
    assert.equal(s.plots.length, PLOTS.length);
    assert.equal(s.bet, 1);
    assert.equal(s.town, 0);
  }
  const s = hydrate({
    plots: [{ stage: 99, cap: 99 }, { stage: 0, cap: 3 }, { stage: 10, cap: true }],
    cards: { owned: { 'pond-0': 2, nonsense: 5 }, packs: { gold: 1e9 } },
    pending: { type: 'raid', rival: {}, tubs: [1, 2, 3] },
    hot: { site: 99, left: 4 },
  });
  assert.equal(s.plots[0].stage, STAGES);
  assert.equal(s.plots[0].cap, CAP_STEPS);
  assert.equal(s.plots[1].cap, 0, 'no capacity without the levels for it');
  assert.equal(s.plots[2].cap, CAP_STEPS, 'an older save kept capacity as yes or no');
  assert.deepEqual(s.cards.owned, { 'pond-0': 2 });
  assert.equal(s.cards.packs.gold, 9999);
  assert.equal(s.pending, null, 'a pending game from an older version is dropped rather than trusted');
  assert.equal(s.hot, null);
  assert.equal(parseSave('{broken'), null);
  assert.equal(importCode('not a save'), null);
});

test('a played game survives save, export and import', () => {
  const { state, rand } = fresh(30);
  const world = S.createWorld(state, rand);
  let now = T0;
  for (let i = 0; i < 40; i++) {
    R.spin(state, rand, now);
    if (i % 3 === 0) playOut(state, rand);
    for (const p of PLOTS) R.upgradePlot(state, p.index);
    R.tick(state, now, rand);
    now += 5000;
  }
  state.cards.packs.bronze += 2;
  R.openPack(state, 'bronze', rand);
  R.feedPet(state);
  for (let t = 0; t < 60; t += 0.1) S.step(world, 0.1);
  const viaJson = parseSave(serialize(state, 1234));
  assert.deepEqual(viaJson, state);
  assert.deepEqual(importCode(exportCode(state)), parseSave(JSON.stringify(state)));
});

test('same seed, same game', () => {
  const play = () => {
    const { state, rand } = fresh(42);
    for (let i = 0; i < 200; i++) {
      state.tokens = Math.max(state.tokens, 5);
      R.spin(state, rand, T0 + i * 1000);
      playOut(state, rand);
      R.upgradePlot(state, i % PLOTS.length);
    }
    return JSON.stringify(state);
  };
  assert.equal(play(), play());
});

// ---- shop and adverts ------------------------------------------------------

test('a completed purchase hands over its contents; one-time items only once', async () => {
  const { PRODUCTS, ADS } = await import('../js/config.js');
  const { state } = fresh();
  state.town = 2;
  const tokens = state.tokens;
  const big = PRODUCTS.find((p) => p.id === 'spins_2');
  assert.equal(R.applyPurchase(state, 'spins_2').tokens, big.grant.tokens);
  assert.equal(state.tokens, tokens + big.grant.tokens);
  assert.ok(R.applyPurchase(state, 'spins_2'), 'spin packs can be bought again');
  const starter = R.applyPurchase(state, 'starter');
  assert.equal(starter.coins, 150 * E.unit(2), 'coins scale with the town');
  assert.equal(state.cards.packs.gold, 1);
  assert.equal(R.applyPurchase(state, 'starter'), null);
  assert.equal(R.productOwned(state, 'starter'), true);
  assert.equal(state.shop.noAds, false);
  assert.ok(R.applyPurchase(state, 'noads'));
  assert.equal(state.shop.noAds, true);
  assert.equal(R.applyPurchase(state, 'no-such-thing'), null);
  assert.equal(parseSave(serialize(state)).shop.noAds, true);
  assert.deepEqual(hydrate({ plots: [], shop: { owned: { spins_2: true, starter: true, junk: 1 } } }).shop.owned, { starter: true });

  // advert tokens: a few a day, then tomorrow
  const noon = new Date(2030, 5, 10, 12).getTime();
  for (let i = 0; i < ADS.tokens.perDay; i++) assert.equal(R.claimAdTokens(state, noon).tokens, ADS.tokens.reward.tokens);
  assert.equal(R.adTokensLeft(state, noon), 0);
  assert.equal(R.claimAdTokens(state, noon + HOUR), null);
  assert.equal(R.adTokensLeft(state, noon + 24 * HOUR), ADS.tokens.perDay);
  // the daily bundle comes back tomorrow; three purchases fill the stamp card
  assert.ok(R.applyPurchase(state, 'daily', noon));
  assert.equal(R.applyPurchase(state, 'daily', noon + HOUR), null);
  assert.ok(R.applyPurchase(state, 'daily', noon + 24 * HOUR));
  assert.equal(state.shop.stamps, 3);
  assert.ok(R.claimStamps(state).tokens > 0);
  assert.equal(R.claimStamps(state), null);
});


test('every park has four rides and four facilities, named for its theme', () => {
  assert.equal(PLOTS.length, 8);
  for (let t = 0; t < 9; t++) {
    const state = newState(0);
    state.town = t;
    const names = PLOTS.map((p) => S.designAt(state, p.index).name);
    assert.equal(new Set(names).size, 8);
    assert.deepEqual(PLOTS.map((p) => S.designAt(state, p.index).kind), ['ride', 'ride', 'ride', 'ride', 'facility', 'facility', 'facility', 'facility']);
    assert.ok(townInfo(t).name.length > 3 && townInfo(t).number === t + 1);
  }
  assert.notEqual(townInfo(0).theme.key, townInfo(1).theme.key);
});

test('a site has ten stars and five capacity steps; a finished park moves on', () => {
  const { state } = fresh();
  assert.equal(R.upgradePlot(state, 0), null, 'nothing is free');
  state.coins = 1e12;
  assert.equal(R.upgradeCap(state, 0), null, 'capacity waits for level 20');
  let last = 0;
  for (let stage = 1; stage <= STAGES; stage++) {
    const cost = E.stageCost(0, 0, stage);
    assert.ok(cost > last, 'each star costs more than the one before');
    last = cost;
    const up = R.upgradePlot(state, 0);
    assert.equal(up.stage, stage);
    assert.equal(E.nextCap(state, 0).open, stage >= 2, 'the first capacity step opens at level 20');
  }
  assert.equal(R.upgradePlot(state, 0), null, 'no more stars to buy');
  assert.equal(E.townComplete(state), false);
  for (let step = 1; step <= CAP_STEPS; step++) assert.equal(R.upgradeCap(state, 0).cap, step);
  assert.equal(R.upgradeCap(state, 0), null, 'nothing left to buy');
  assert.equal(E.cheapest(state, 0), null);
  assert.equal(R.travel(state), null, 'the park is not finished');
  for (const p of PLOTS.slice(1)) {
    for (let n = 0; n < STAGES; n++) assert.ok(R.upgradePlot(state, p.index));
    for (let n = 0; n < CAP_STEPS; n++) assert.ok(R.upgradeCap(state, p.index));
  }
  assert.ok(E.townComplete(state));
  assert.equal(E.stagesBuilt(state), E.PARK_STARS);
  assert.equal(E.parkChestsDue(state), 4, 'a chest for each quarter of the park');
  for (let i = 0; i < 4; i++) assert.equal(R.claimParkChest(state).index, i);
  assert.equal(R.claimParkChest(state), null);
  const tokens = state.tokens;
  const moved = R.travel(state);
  assert.equal(moved.town, 1);
  assert.ok(state.tokens > tokens);
  assert.ok(state.plots.every((p) => p.stage === 0 && p.cap === 0));
  assert.equal(state.parkChests, 0);
  assert.ok(E.legacyRate(state) > 0, 'the finished park goes on earning');
});

test('prices are capped: late parks cost what the one before did', () => {
  assert.ok(E.townCost(3) > E.townCost(2));
  assert.equal(E.unit(TUNING.unitCapPark + 20), E.unit(TUNING.unitCapPark));
  assert.equal(E.townSpins(90), TUNING.spinsCap);
  assert.equal(E.townCost(99), E.townCost(98));
});

test('the reels are the park: built sites pay by what is built, closed ones pay nothing', () => {
  const { state, rand } = seasoned(11);
  state.tokens = 1e6;
  const u = E.unit(0);
  assert.equal(E.sitePay(state, 0), 0, 'nothing built, nothing paid');
  state.plots[0].stage = 1;
  const opened = E.sitePay(state, 0);
  assert.ok(opened > 0);
  assert.ok(E.sitePayAfter(state, 0, 'star') > opened);
  state.plots[0].stage = STAGES;
  const starred = E.sitePay(state, 0);
  state.plots[0].cap = CAP_STEPS;
  const full = E.sitePay(state, 0);
  assert.ok(opened < starred && starred < full);
  assert.ok(Math.abs(full - starred * (1 + TUNING.capBoost * CAP_STEPS)) < 1e-9);
  state.plots[3].stage = STAGES;
  assert.ok(E.sitePay(state, 3) > starred, 'the big wheel pays more than the swing');
  // on the line, each reel pays its own symbol
  let seenSite = false;
  let seenClosed = false;
  for (let i = 0; i < 3000; i++) {
    const res = R.spin(state, rand, T0);
    playOut(state, rand);
    if (res.kind !== 'mixed') continue;
    res.reels.forEach((sym, r) => {
      const k = siteOf(sym);
      if (k < 0) return;
      // (a rush hour in progress doubles the site it is at)
      const rate = Math.round(E.sitePay({ ...state, hot: null }, k) * u);
      if (state.plots[k].stage > 0) {
        assert.ok(Math.abs(res.pays[r] - rate) <= 1 || Math.abs(res.pays[r] - rate * RUSH.hotMult) <= 1, `${sym} paid ${res.pays[r]}, not ${rate}`);
        seenSite = true;
      } else {
        assert.equal(res.pays[r], 0);
        seenClosed = true;
      }
    });
    assert.equal(res.coins, res.pays[0] + res.pays[1] + res.pays[2]);
  }
  assert.ok(seenSite && seenClosed);
});

test('three of the same site is its rush hour: ten symbols at once, then double there for five spins', () => {
  const { state, rand } = seasoned(2);
  state.tokens = 1e6;
  let res;
  for (let i = 0; i < 500; i++) assert.notEqual(R.spin(state, rand, T0).kind === 'rush', true, 'no rush hour in a park with nothing open');
  playOut(state, rand);
  state.pending = null;
  build(state, 4, 1);
  do {
    res = R.spin(state, rand, T0);
    playOut(state, rand);
  } while (res.kind !== 'rush');
  const k = res.site;
  assert.deepEqual(res.reels, [`s${k}`, `s${k}`, `s${k}`]);
  assert.deepEqual(state.hot, { site: k, left: RUSH.hotSpins });
  assert.ok(E.rushing(state, k));
  const plain = E.sitePay({ ...state, hot: null }, k);
  assert.ok(Math.abs(E.sitePay(state, k) - plain * RUSH.hotMult) < 1e-9);
  assert.ok(Math.abs(res.coins - plain * RUSH.mult * E.unit(0)) <= 1, 'the rush itself pays at the plain rate');
  assert.equal(hydrate(JSON.parse(serialize(state))).hot.left, RUSH.hotSpins);
  let left = RUSH.hotSpins;
  while (left > 0 && state.hot && state.hot.site === k) {
    res = R.spin(state, rand, T0);
    playOut(state, rand);
    if (res.kind === 'rush') break;
    left--;
    assert.equal(state.hot ? state.hot.left : 0, left);
  }
  // a new park starts quiet
  state.hot = { site: 1, left: 3 };
  build(state, STAGES, CAP_STEPS);
  R.travel(state);
  assert.equal(state.hot, null);
});

test('three bells start Ring the Bell: three swings, paid by how high the puck goes', () => {
  const find = (seed) => {
    const { state, rand } = seasoned(seed);
    build(state, 6, 2);
    state.tokens = 1e6;
    let res;
    do res = R.spin(state, rand, 0); while (res.kind !== 'bell');
    return { state, rand };
  };
  const { state, rand } = find(1);
  assert.equal(state.pending.type, 'bell');
  const stash = state.pending.stash;
  assert.equal(stash, E.nice(E.bellPrize(state) * E.unit(0)));
  assert.equal(R.spin(state, rand, 0).ok, false, 'no spinning until the swings are taken');
  // a save in the middle of a go comes back where it was
  const first = R.bellSwing(state, 0.5);
  assert.equal(first.rung, false);
  assert.equal(first.amount, E.nice(stash * BELL.shares[0] * (BELL.low + BELL.slope * 0.5)));
  const back = hydrate(JSON.parse(serialize(state)));
  assert.deepEqual(back.pending, state.pending);
  const coins = state.coins;
  const second = R.bellSwing(state, 0.9);
  assert.equal(second.rung, true);
  assert.equal(second.amount, E.nice(stash * BELL.shares[1]));
  const third = R.bellSwing(state, 7); // out-of-range power is clamped, not trusted
  assert.equal(third.power, 1);
  assert.equal(third.done, true);
  assert.equal(third.peal, false, 'one weak swing: no bonus');
  assert.equal(third.total, first.amount + second.amount + third.amount);
  assert.equal(state.coins, coins + second.amount + third.amount);
  assert.equal(state.pending, null);
  assert.equal(R.bellSwing(state, 1), null);
  assert.equal(state.stats.bells, 1);
  // three rings out of three: the full prize and a bonus on top
  const best = find(2);
  let won = 0;
  let end;
  for (let i = 0; i < 3; i++) {
    end = R.bellSwing(best.state, 0.95);
    won += end.amount;
  }
  assert.equal(end.peal, true);
  assert.equal(end.bonus, E.nice(best.state.stats.peals && E.bellPrize(best.state) * E.unit(0) * BELL.peal));
  assert.ok(end.total > won);
  // the worst anybody can do still pays something
  const worst = find(3);
  const prize = worst.state.pending.stash;
  let low = 0;
  for (let i = 0; i < 3; i++) low += R.bellSwing(worst.state, 0).amount;
  assert.ok(low >= prize * BELL.low * 0.95 && low < prize * 0.4);
  // and a bigger park hangs a bigger prize on the tower
  const small = fresh().state;
  assert.ok(E.bellPrize(best.state) > E.bellPrize(small));
});

test('finish a card set and its creatures move into the park for good', () => {
  const { state } = fresh();
  build(state, 5, 1);
  const k = homeSite(0);
  const plainPay = E.sitePay(state, k);
  const plainGate = E.plotRate(state, k);
  for (const c of CARD_SETS[0].cards) state.cards.owned[c.id] = 1;
  const reward = R.claimSet(state, 0);
  assert.deepEqual(reward.home, { site: k, level: 1 });
  assert.equal(state.cards.homes[0], 1);
  assert.ok(Math.abs(E.sitePay(state, k) - plainPay * (1 + HOMES.boost)) < 1e-9);
  assert.ok(Math.abs(E.plotRate(state, k) - plainGate * (1 + HOMES.boost)) < 1e-9);
  assert.equal(E.homeBonus(state, (k + 1) % PLOTS.length), 0);
  // they stay through a move to the next park and a new season of the album
  build(state, STAGES, CAP_STEPS);
  R.travel(state);
  assert.equal(E.homeBonus(state, k), HOMES.boost);
  for (const c of CARDS) state.cards.owned[c.id] = 1;
  CARD_SETS.forEach((set) => R.claimSet(state, set.index));
  R.claimAlbum(state);
  assert.equal(state.cards.homes[0], 1, 'already home: the first finish this season was counted');
  for (const c of CARD_SETS[0].cards) state.cards.owned[c.id] = 1;
  assert.equal(R.claimSet(state, 0).home.level, 2);
  assert.equal(hydrate(JSON.parse(serialize(state))).cards.homes[0], 2);
  // an older save had no homes: every set finished so far has moved in
  const old = JSON.parse(serialize(state));
  delete old.cards.homes;
  old.cards.season = 2;
  old.cards.sets = old.cards.sets.map((_, i) => i === 4);
  const carried = hydrate(old);
  assert.equal(carried.cards.homes[4], 2);
  assert.equal(carried.cards.homes[5], 1);
  for (let i = 0; i < 9; i++) state.cards.homes[0] = Math.min(HOMES.max, state.cards.homes[0] + 1);
  assert.equal(state.cards.homes[0], HOMES.max);
});

test('three balls win a turn on the prize wheel, and the wheel always pays', () => {
  const { state, rand } = fresh();
  assert.equal(state.wheel.tickets, 1, 'one turn to start with');
  state.stats.spins = 99;
  state.tokens = 1e6;
  let res;
  do {
    res = R.spin(state, rand, 0);
    playOut(state, rand);
  } while (res.kind !== 'wheel');
  assert.equal(res.wheel, 1);
  assert.equal(state.wheel.tickets, 2);
  const seen = new Set();
  state.wheel.tickets = 400;
  for (let i = 0; i < 400; i++) {
    const turn = R.wheelSpin(state, rand);
    assert.ok(turn.index >= 0 && turn.index < WHEEL.length && turn.reward);
    seen.add(turn.index);
  }
  assert.equal(seen.size, WHEEL.length, 'every wedge comes up');
  assert.equal(R.wheelSpin(state, rand), null, 'no tickets, no turn');
});

test('nothing ever attacks the park: no shields, no closures, no incoming', () => {
  const { state, rand } = fresh();
  state.coins = 1e12;
  for (const p of PLOTS) R.upgradePlot(state, p.index);
  state.stats.spins = 99;
  state.tokens = 5000;
  const kinds = new Set();
  for (let i = 0; i < 3000; i++) {
    const res = R.spin(state, rand, i * 1000);
    kinds.add(res.kind);
    playOut(state, rand);
    R.tick(state, i * 3600e3);
  }
  assert.ok(!kinds.has('attack') && !kinds.has('shield'));
  assert.ok(!('shields' in state) && state.plots.every((p) => !('splat' in p)));
});

test('the gate takes money in step with the stars, awake or away', () => {
  const { state } = fresh();
  const world = S.createWorld(state, S.mulberry32(3));
  for (let t = 0; t < 60; t += 0.1) S.step(world, 0.1);
  assert.equal(state.coins, 0, 'an empty park earns nothing');
  state.coins = 1e12;
  for (const p of PLOTS) for (let n = 0; n < 3; n++) R.upgradePlot(state, p.index);
  const rate = E.idleRate(state);
  assert.ok(rate > 0);
  const before = state.coins;
  for (let t = 0; t < 60; t += 0.1) S.step(world, 0.1);
  assert.ok(Math.abs(state.coins - before - rate * 60) < rate, 'a minute of takings');
  assert.ok(world.events.some((e) => e.type === 'pay'));
  for (let n = 0; n < 8; n++) R.upgradePlot(state, 0);
  assert.ok(E.idleRate(state) > rate, 'more stars and capacity take more');
  const away = S.applyOffline(world, 10 * 3600);
  assert.ok(away.capped && away.amount > 0);
});

