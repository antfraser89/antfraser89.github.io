import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CARDS, CARD_SETS, DAILY, EVENT_MILESTONES, OPENING_SPINS, OUTCOMES, PACKS, PLOTS, RIVALS, STAGES, THEMES, TUNING, VAULT, WORLD, townInfo,
} from '../js/config.js';
import * as E from '../js/economy.js';
import { fmt, fmtClock, fmtTime, money } from '../js/format.js';
import { MISSIONS, currentMission } from '../js/goals.js';
import * as R from '../js/rules.js';
import * as S from '../js/sim.js';
import { layoutFor, nearestNode, nodeRoute } from '../js/layout.js';
import { exportCode, hydrate, importCode, newState, parseSave, serialize } from '../js/state.js';

const T0 = 1.8e12; // a fixed "now" in milliseconds
const MIN = 60e3;
const HOUR = 3600e3;

const fresh = (seed = 1) => {
  const state = newState(T0);
  state.seed = seed;
  return { state, rand: S.mulberry32(seed) };
};
// Skip the scripted opening so spins are random.
const seasoned = (seed = 1) => {
  const g = fresh(seed);
  g.state.stats.spins = OPENING_SPINS.length;
  return g;
};
const playOut = (state, rand) => {
  if (state.pending?.type === 'attack') {
    return R.resolveAttack(state, PLOTS.findIndex((p) => !state.pending.rival.splats[p.index]));
  }
  let last = null;
  if (state.pending?.type === 'raid') for (const tub of [0, 1, 2]) last = R.raidPick(state, tub);
  return last;
};

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

test('outcome weights add up and the average spin is worth what the costs assume', () => {
  const total = OUTCOMES.reduce((n, o) => n + o.w, 0);
  assert.ok(Math.abs(total - 100) < 1e-9);
  const { state, rand } = seasoned(5);
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
  assert.ok(Math.abs(measured - E.spinEV()) / E.spinEV() < 0.06, `measured ${measured.toFixed(2)} vs ${E.spinEV().toFixed(2)}`);
});

test('a town costs about its target number of spins, and each town costs more', () => {
  for (let t = 0; t < 30; t++) {
    const spins = E.townCost(t) / (E.spinEV() * E.unit(t));
    assert.ok(Math.abs(spins - E.townSpins(t)) / E.townSpins(t) < 0.05, `town ${t}: ${spins}`);
    assert.ok(E.townCost(t + 1) > E.townCost(t) * 1.5);
  }
  for (const p of PLOTS) {
    for (let s = 1; s < STAGES; s++) assert.ok(E.stageCost(0, p.index, s + 1) > E.stageCost(0, p.index, s));
  }
});

test('every town has six attractions with the tall ones at the back', () => {
  for (let t = 0; t < 40; t++) {
    const info = townInfo(t);
    assert.equal(new Set(info.lineup).size, PLOTS.length);
    assert.ok(info.name.length > 0 && info.theme.ground);
  }
  assert.notEqual(townInfo(0).name, townInfo(15).name);
});

// ---- tokens --------------------------------------------------------------

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
    if (r.kind === 'attack') {
      assert.equal(R.spin(state, rand, T0).why, 'pending', 'cannot spin with a pie in hand');
      assert.ok(playOut(state, rand).coins > 0);
    } else if (r.kind === 'raid') {
      const end = playOut(state, rand);
      assert.equal(end.done, true);
      assert.ok(end.total >= 0);
    }
  }
  assert.deepEqual(seen, OPENING_SPINS);
  assert.ok(prizeTokens >= 6, 'the script includes a token win');
  assert.equal(state.tokens, TUNING.startTokens - OPENING_SPINS.length + prizeTokens);
  assert.equal(state.shields, 1);
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

test('padlocks stack to three, then pay coins instead', () => {
  const { state } = seasoned();
  state.tokens = 100;
  const always = (kind) => () => (OUTCOMES.slice(0, OUTCOMES.findIndex((o) => o.kind === kind)).reduce((n, o) => n + o.w, 0) + 0.01) / 100;
  for (let i = 0; i < TUNING.maxShields; i++) assert.equal(R.spin(state, always('shield'), T0).shield, 1);
  const coins = state.coins;
  const over = R.spin(state, always('shield'), T0);
  assert.equal(over.overflow, true);
  assert.equal(state.shields, TUNING.maxShields);
  assert.ok(state.coins > coins);
});

// ---- rivals --------------------------------------------------------------

test('a pie pays more when the rival has no padlock; a lucky dip is three goes at four tubs', () => {
  const { state, rand } = seasoned(6);
  state.pending = { type: 'attack', bet: 2, revenge: false, rival: { id: 1, town: 0, shield: false, stages: [3, 3, 3, 3, 3, 3], splats: [true, false, false, false, false, false] } };
  assert.equal(R.resolveAttack(state, 0), null, 'that one is already splatted');
  const hit = R.resolveAttack(state, 2);
  assert.equal(hit.blocked, false);
  state.pending = { type: 'attack', bet: 2, revenge: false, rival: { id: 1, town: 0, shield: true, stages: [3, 3, 3, 3, 3, 3], splats: PLOTS.map(() => false) } };
  const blocked = R.resolveAttack(state, 2);
  assert.equal(blocked.blocked, true);
  assert.ok(hit.coins > blocked.coins && blocked.coins > 0);
  assert.equal(state.pending, null);
  assert.equal(state.stats.attacks, 2);

  state.pending = { type: 'raid', bet: 1, revenge: false, rival: { id: 2, town: 0, shield: false, stages: [], splats: [] }, tubs: [500, 0, 300, 200], picks: [] };
  const before = state.coins;
  assert.equal(R.raidPick(state, 0).amount, 500);
  assert.equal(R.raidPick(state, 0), null, 'same tub twice');
  assert.equal(R.raidPick(state, 2).done, false);
  const end = R.raidPick(state, 3);
  assert.deepEqual([end.done, end.total, end.sweep], [true, 1000, true]);
  assert.equal(state.coins - before, 1000);
  assert.equal(state.pending, null);
  assert.equal(R.raidPick(state, 1), null);
});

test('rivals throw pies back: padlocks block them, otherwise an attraction closes until cleaned', () => {
  const { state, rand } = seasoned(8);
  state.stats.spins = 50;
  state.plots[0].stage = 3;
  state.plots[1].stage = 2;
  state.shields = 1;
  assert.deepEqual(R.processIncoming(state, T0, rand), [], 'first call only sets the timer');
  assert.ok(state.nextAttackAt > T0);
  const first = R.processIncoming(state, state.nextAttackAt + 1, rand);
  assert.equal(first.length, 1);
  assert.equal(first[0].blocked, true);
  assert.equal(state.shields, 0);
  const second = R.processIncoming(state, state.nextAttackAt + 1, rand);
  assert.equal(second[0].blocked, false);
  const k = second[0].plot;
  assert.equal(state.plots[k].splat, true);
  assert.equal(R.upgradePlot(state, k), null, 'no upgrades until it is cleaned');
  state.coins = 0;
  assert.equal(R.repairPlot(state, k), null);
  state.coins = E.repairCost(0, k, state.plots[k].stage);
  assert.ok(R.repairPlot(state, k));
  assert.equal(state.plots[k].splat, false);
  assert.equal(state.coins, 0);
  // a long absence is capped
  const many = R.processIncoming(state, state.nextAttackAt + 100 * HOUR, rand, TUNING.incomingMaxAway);
  assert.ok(many.length <= TUNING.incomingMaxAway);
  assert.ok(state.nextAttackAt > T0 + 100 * HOUR);
  // revenge is a free pie at the culprit
  assert.equal(R.startRevenge(state, second[0], rand), true);
  assert.equal(state.pending.rival.id, second[0].rival % RIVALS.length);
  assert.equal(R.startRevenge(state, second[0], rand), false);
});

// ---- building ------------------------------------------------------------

test('upgrades cost coins, pay their rewards, and a finished fair moves on', () => {
  const { state } = fresh();
  assert.equal(R.upgradePlot(state, 0), null);
  state.coins = E.townCost(0);
  const tokens = state.tokens;
  for (const p of PLOTS) {
    for (let s = 1; s <= STAGES; s++) {
      assert.equal(R.travel(state), null);
      const up = R.upgradePlot(state, p.index);
      assert.equal(up.stage, s);
    }
    assert.equal(R.upgradePlot(state, p.index), null, 'five stars is the top');
  }
  assert.ok(Math.abs(state.coins) < 1e-6);
  assert.equal(state.tokens, tokens + 3 * PLOTS.length);
  assert.equal(state.cards.packs.bronze, PLOTS.length);
  assert.equal(E.townComplete(state), true);
  const moved = R.travel(state);
  assert.equal(moved.town, 1);
  assert.equal(state.cards.packs.gold, 1);
  assert.ok(state.plots.every((p) => p.stage === 0 && !p.splat));
  assert.ok(E.unit(1) > E.unit(0));
});

// ---- cards ---------------------------------------------------------------

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
  state.town = 5;
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

test('feeding Chips levels him up, pays tokens and raises the token cap', () => {
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
  assert.ok(E.raidBonus(state) > 1);
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

test('guests visit open attractions, pay into the till, and avoid closed ones', () => {
  const { state } = fresh();
  const world = S.createWorld(state, S.mulberry32(21));
  for (let t = 0; t < 30; t += 0.1) S.step(world, 0.1);
  assert.equal(world.guests.length, 0, 'an empty field draws nobody');
  state.plots.forEach((p) => { p.stage = 3; });
  let peak = 0;
  for (let t = 0; t < 600; t += 0.1) {
    S.step(world, 0.1);
    peak = Math.max(peak, world.guests.length);
    for (const p of PLOTS) {
      const rt = world.rt[p.index];
      assert.ok(rt.queue.length <= TUNING.queueLimit && rt.inbound >= 0);
      assert.ok(rt.riders.length <= S.capacity(S.designAt(state, p.index), 3));
    }
    world.events.length = 0;
  }
  assert.ok(peak > 15 && peak <= TUNING.maxGuests, `peak ${peak}`);
  assert.ok(state.coins > 0);
  assert.ok(state.plots.every((p) => p.served > 0));
  for (const g of world.guests) assert.ok(g.x > 40 && g.x < 1040 && Number.isFinite(g.y)); // inside the fence
  assert.ok(E.idleRate(state) > 0);

  state.plots[2].splat = true;
  const served = state.plots[2].served;
  for (let t = 0; t < 120; t += 0.1) S.step(world, 0.1);
  assert.equal(world.rt[2].queue.length + world.rt[2].riders.length, 0);
  assert.equal(state.plots[2].served, served);
  assert.equal(E.plotRate(state, 2), 0);

  const coins = state.coins;
  const away = S.applyOffline(world, 100 * 3600);
  assert.equal(away.capped, true);
  assert.ok(Math.abs(state.coins - coins - E.idleRate(state) * TUNING.offlineCapHours * 3600) < 1e-6);
});

test('balloons drift past and pay a small prize once', () => {
  const { state } = seasoned();
  const world = S.createWorld(state, S.mulberry32(8));
  let seen = null;
  for (let t = 0; t < 200 && !seen; t += 0.1) {
    S.step(world, 0.1);
    seen = world.balloons[0] || null;
  }
  assert.ok(seen);
  const before = JSON.stringify([state.coins, state.tokens, state.pet.treats]);
  assert.ok(S.popBalloon(world, seen));
  assert.notEqual(JSON.stringify([state.coins, state.tokens, state.pet.treats]), before);
  assert.equal(S.popBalloon(world, seen), null);
});

// ---- saves ---------------------------------------------------------------

test('hydrate survives junk and clamps bad values', () => {
  for (const junk of [null, 42, 'x', [], { plots: 'no' }, { coins: -5, tokens: NaN, shields: 99, bet: 7, town: -3 }]) {
    const s = hydrate(junk);
    assert.ok(s.coins >= 0 && Number.isFinite(s.tokens));
    assert.equal(s.plots.length, PLOTS.length);
    assert.ok(s.shields <= TUNING.maxShields);
    assert.equal(s.bet, 1);
    assert.equal(s.town, 0);
  }
  const s = hydrate({
    plots: [{ stage: 99, splat: true }, { stage: 0, splat: true }],
    cards: { owned: { 'sweets-0': 2, nonsense: 5 }, packs: { gold: 1e9 } },
    pending: { type: 'raid', rival: {}, tubs: [1, 2, 3] },
  });
  assert.equal(s.plots[0].stage, STAGES);
  assert.equal(s.plots[1].splat, false);
  assert.deepEqual(s.cards.owned, { 'sweets-0': 2 });
  assert.equal(s.cards.packs.gold, 9999);
  assert.equal(s.pending, null, 'a broken pending raid is dropped rather than trusted');
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
  const big = PRODUCTS.find((p) => p.id === 'tokens_m');
  assert.equal(R.applyPurchase(state, 'tokens_m').tokens, big.grant.tokens);
  assert.equal(state.tokens, tokens + big.grant.tokens);
  assert.ok(R.applyPurchase(state, 'tokens_m'), 'token bundles can be bought again');
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
  assert.deepEqual(hydrate({ plots: [], shop: { owned: { tokens_m: true, starter: true, junk: 1 } } }).shop.owned, { starter: true });

  // advert tokens: a few a day, then tomorrow
  const noon = new Date(2030, 5, 10, 12).getTime();
  for (let i = 0; i < ADS.perDay; i++) assert.equal(R.claimAdTokens(state, noon).tokens, ADS.tokens);
  assert.equal(R.adTokensLeft(state, noon), 0);
  assert.equal(R.claimAdTokens(state, noon + HOUR), null);
  assert.equal(R.adTokensLeft(state, noon + 24 * HOUR), ADS.perDay);
});

test('every kind of town has a map the guests can walk', () => {
  const seen = new Set();
  for (let town = 0; town < THEMES.length; town++) {
    const L = layoutFor(town);
    seen.add(L.key);
    assert.equal(L.plots.length, PLOTS.length);
    assert.equal(layoutFor(town + THEMES.length), L, 'towns of the same kind share a map');
    // the walkways are one connected network
    for (let k = 0; k < L.nodes.length; k++) assert.equal(nodeRoute(L, L.gateNode, k).at(-1), k, `${L.key}: node ${k} is cut off`);
    const gate = L.nodes[L.gateNode];
    assert.ok(Math.hypot(gate.x - L.gate.x, gate.y - L.gate.y) < 90);
    for (const p of L.plots) {
      assert.ok(p.x > 100 && p.x < WORLD.w - 100 && p.y > 300 && p.y < WORLD.gateY, `${L.key}: plot ${p.index} is off the map`);
      // nobody queues in the water, and the queue is within reach of a path
      for (let n = 0; n < TUNING.queueLimit; n++) {
        const slot = S.queueSlot(L, p.index, n);
        assert.ok(!L.wet(slot.x, slot.y), `${L.key}: plot ${p.index} queues in the water`);
        const node = L.nodes[nearestNode(L, slot.x, slot.y)];
        assert.ok(Math.hypot(node.x - slot.x, node.y - slot.y) < 70, `${L.key}: plot ${p.index} queue is off the paths`);
      }
      const out = S.exitPoint(L, p.index, 3);
      assert.ok(!L.wet(out.x, out.y));
    }
    // plots do not sit on top of one another
    for (const a of L.plots) for (const b of L.plots) if (a.index < b.index) assert.ok(Math.abs(a.x - b.x) > 250 || Math.abs(a.y - b.y) > 150, `${L.key}: plots ${a.index} and ${b.index} overlap`);
  }
  assert.ok(seen.size >= 5);
});
