// Tests for everything round the main loop: levels, the side games, missions,
// the pass, the festival, the club and pets.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ADS, CARDS, ITEMS, PLOTS, UNLOCKS, levelOf, levelStars } from '../js/config.js';
import { grant } from '../js/core.js';
import * as E from '../js/economy.js';
import * as G from '../js/game.js';
import * as Chests from '../js/games/chests.js';
import * as Draw from '../js/games/draw.js';
import * as Merge from '../js/games/merge.js';
import * as Trail from '../js/games/trail.js';
import * as Club from '../js/meta/club.js';
import * as Festival from '../js/meta/festival.js';
import * as Missions from '../js/meta/missions.js';
import * as Pass from '../js/meta/pass.js';
import * as Pets from '../js/pets.js';
import * as R from '../js/rules.js';
import * as S from '../js/sim.js';
import { hydrate, newState, serialize } from '../js/state.js';

const HOUR = 3600e3;
const T0 = new Date(2030, 5, 10, 12).getTime(); // a Monday at noon
const fresh = (seed = 7) => ({ state: newState(T0, seed), rand: S.mulberry32(seed) });
const everything = (state) => { state.stats.upgrades = levelStars(12); };

test('levels come from stars; each pays a prize once and says what it opens', () => {
  assert.equal(levelOf(0), 1);
  for (let l = 1; l < 40; l++) {
    assert.equal(levelOf(levelStars(l)), l);
    assert.equal(levelOf(levelStars(l + 1) - 1), l);
  }
  const { state } = fresh();
  assert.equal(E.unlocked(state, 'cards'), false);
  assert.deepEqual(R.levelUps(state), []);
  state.stats.upgrades = levelStars(4);
  const tokens = state.tokens;
  const ups = R.levelUps(state);
  assert.deepEqual(ups.map((u) => u.level), [2, 3, 4]);
  assert.ok(state.tokens > tokens);
  assert.deepEqual(ups.flatMap((u) => u.unlocks.map((x) => x.id)), UNLOCKS.filter((u) => u.level <= 4).map((u) => u.id));
  assert.deepEqual(R.levelUps(state), [], 'nothing twice');
  assert.ok(E.unlocked(state, 'cards') && E.unlocked(state, 'draw') && !E.unlocked(state, 'merge'));
  const p = E.levelProgress(state);
  assert.ok(p.level === 4 && p.have === 0 && p.need === levelStars(5) - levelStars(4));
});

test('finished parks keep earning, a boost doubles the gate, and both survive a save', () => {
  const { state } = fresh();
  const world = S.createWorld(state, S.mulberry32(1));
  state.town = 3;
  const legacy = E.legacyRate(state);
  assert.ok(legacy > 0 && E.idleRate(state) === legacy);
  assert.ok(E.legacyOf(2) > E.legacyOf(0), 'a later park is worth more');
  const noon = T0;
  assert.equal(R.claimAd(state, 'boost', noon).boost, ADS.boost.boost);
  assert.equal(E.idleRate(state), legacy * 2);
  const before = state.coins;
  for (let t = 0; t < 60; t += 0.5) S.step(world, 0.5);
  assert.ok(Math.abs(state.coins - before - legacy * 2 * 60) < legacy);
  assert.ok(state.boost < ADS.boost.boost * 60 && state.boost > 0);
  assert.equal(hydrate(JSON.parse(serialize(state))).boost, state.boost);
  state.boost = 0;
  assert.equal(E.idleRate(state), legacy);
});

test('adverts: each placement has its own daily allowance and waits for its game', () => {
  const { state } = fresh();
  assert.equal(R.adLeft(state, 'energy', T0), 0, 'merge is not open yet');
  everything(state);
  for (const id of Object.keys(ADS)) {
    for (let i = 0; i < ADS[id].perDay; i++) assert.ok(R.claimAd(state, id, T0), id);
    assert.equal(R.claimAd(state, id, T0), null);
    assert.equal(R.adLeft(state, id, T0 + 24 * HOUR), ADS[id].perDay);
  }
  assert.equal(state.stats.ads, Object.values(ADS).reduce((n, a) => n + a.perDay, 0));
});

test('rewards can hold anything in the bag, wheel turns and pass points', () => {
  const { state } = fresh();
  const before = { ...state.inv };
  const got = grant(state, { energy: 5, pearls: 2, swords: 9, food: 1, shots: 3, keys: 1, gems: 40, wheel: 2, points: 30, tokens: 4 });
  for (const id of Object.keys(ITEMS)) assert.equal(state.inv[id], before[id] + got[id]);
  assert.equal(state.wheel.tickets, 3);
  assert.equal(state.pass.points, 30);
  assert.deepEqual(R.itemsIn(got).map(([id]) => id), Object.keys(ITEMS));
});

test('merge: drops cost energy, pairs make the next shell, the last shell ends the round', () => {
  const { state, rand } = fresh();
  const m = state.merge;
  assert.equal(m.cells.length, Merge.MERGE.cols * Merge.MERGE.rows);
  assert.equal(m.cells.filter((v) => v < 0).length, Merge.MERGE.buried);
  const energy = state.inv.energy;
  const drop = Merge.generate(state, rand, T0);
  assert.ok(drop.ok && m.cells[drop.index] === drop.level);
  assert.equal(state.inv.energy, energy - 1);
  Merge.setMult(state, 8);
  assert.ok(Merge.generate(state, rand, T0).level >= 4, 'eight at once lands three shells higher');
  state.inv.energy = 0;
  assert.equal(Merge.generate(state, rand, T0).why, 'energy');
  // lay out a pair by hand
  m.cells.fill(0);
  m.cells[20] = 2;
  m.cells[21] = 2;
  m.cells[22] = 5;
  m.cells[0] = -3;
  assert.equal(Merge.move(state, 20, 30).kind, 'move');
  assert.equal(Merge.move(state, 30, 22).kind, 'swap');
  assert.equal(m.cells[30], 5);
  const merged = Merge.move(state, 22, 21);
  assert.ok(merged.kind === 'merge' && merged.level === 3 && m.cells[21] === 3 && m.cells[22] === 0);
  assert.equal(merged.rewards.length, 1, 'the first three of the round pays');
  assert.equal(Merge.move(state, 30, 0).ok, false, 'a buried shell only takes its match');
  const dug = Merge.move(state, 21, 0);
  assert.ok(dug.kind === 'merge' && m.cells[0] === 4);
  assert.equal(Merge.move(state, 0, 0).ok, false);
  // the top of the chain
  const top = Merge.MERGE.chain;
  m.cells[40] = top - 1;
  m.cells[41] = top - 1;
  const round = m.round;
  const fin = Merge.move(state, 40, 41);
  assert.ok(fin.done && fin.final.tokens > 0);
  assert.equal(m.round, round + 1);
  assert.equal(m.cells.filter((v) => v < 0).length, Merge.MERGE.buried, 'a fresh board');
  // energy comes back
  state.inv.energy = 0;
  m.at = T0;
  assert.equal(Merge.mergeTick(state, T0 + Merge.MERGE.energyEvery * 1000 * 5), 5);
  Merge.mergeTick(state, T0 + 100 * HOUR);
  assert.equal(state.inv.energy, Merge.energyCap(state));
  // a full board with nothing to pair says so
  m.cells = m.cells.map((_, i) => 1 + (i % 2 ? 2 : 4));
  assert.ok(Merge.boardFull(state) && Merge.anyMerge(state));
  assert.equal(Merge.generate(state, rand, T0).why, 'full');
  assert.ok(Merge.sell(state, 0).energy > 0 && m.cells[0] === 0);
});

test('prize draw: a big bubble at least every sixteen, the pearl at the end of the round', () => {
  const { state, rand } = fresh();
  state.inv.pearls = 0;
  assert.equal(Draw.drawOnce(state, rand), null);
  state.inv.pearls = 1000;
  let sinceBig = 0;
  let grands = 0;
  const seen = new Set();
  for (let i = 0; i < 400; i++) {
    const d = Draw.drawOnce(state, rand);
    seen.add(d.id);
    sinceBig = d.big ? 0 : sinceBig + 1;
    if (d.grand) {
      grands++;
      sinceBig = 0;
      assert.ok(d.grand.tokens >= 150);
    }
    const stockLeft = state.draw.stock.some((n) => n > 0);
    if (stockLeft) assert.ok(sinceBig < Draw.DRAW.bigEvery, 'never a longer wait than promised');
    assert.ok(Draw.grandIn(state) >= 1 && Draw.bigIn(state) >= 1);
  }
  assert.equal(grands, Math.floor(400 / Draw.DRAW.grandAt));
  assert.equal(state.inv.pearls, 600);
  assert.ok(seen.size >= Draw.DRAW.small.length + 2);
  assert.equal(Draw.drawMany(state, rand, 10).length, 10);
});

test('treasure trail: the plant grows swords, the trail spends them, the cannon finds the target', () => {
  const { state } = fresh();
  const p = state.trail.plant;
  Trail.trailTick(state, T0 + HOUR);
  assert.ok(Math.abs(p.stored - Trail.TRAIL.rate(1)) < 0.01);
  Trail.trailTick(state, T0 + 100 * HOUR);
  assert.equal(p.stored, Trail.plantStore(state), 'it only holds so much');
  assert.equal(Trail.plantFullIn(state), 0);
  assert.equal(Trail.collectSwords(state).swords, Trail.plantStore(state));
  assert.equal(Trail.collectSwords(state), null);
  state.inv.food = 500;
  const fed = Trail.feedPlant(state);
  assert.ok(fed.levels === 1 && p.level === 2 && state.inv.food === 500 - Trail.TRAIL.foodFor(1));
  // the trail
  state.inv.swords = 0;
  assert.equal(Trail.advance(state), null);
  state.inv.swords = 1e6;
  for (let n = 0; n < Trail.TRAIL.nodes; n++) {
    const step = Trail.advance(state);
    assert.equal(step.node, n);
    assert.equal(step.stageDone, n === Trail.TRAIL.nodes - 1);
  }
  assert.deepEqual(state.trail.path, { stage: 1, node: 0 });
  assert.ok(Trail.nextNode(state).cost > Trail.TRAIL.nodeCost(0, 0));
  // the cannon
  const c = state.trail.cannon;
  assert.equal(c.jars.filter((v) => v === -1).length, 1);
  state.inv.shots = 0;
  assert.equal(Trail.fire(state, 0), null);
  state.inv.shots = 100;
  const target = c.jars.indexOf(-1);
  const other = target === 0 ? 1 : 0;
  const miss = Trail.fire(state, other);
  assert.ok(!miss.target && (miss.reward.swords > 0 || miss.reward.food > 0));
  assert.deepEqual(Trail.jarPrize(state, other), Trail.TRAIL.jarPrizes(1)[c.jars[other]][0]);
  assert.equal(Trail.fire(state, other), null, 'a jar only breaks once');
  const hit = Trail.fire(state, target);
  assert.ok(hit.target && hit.level === 1 && c.level === 2 && c.open.length === 0);
  assert.equal(state.stats.shots, 2);
});

test('lucky chests: six prizes behind six chests, three boards to a level', () => {
  const { state, rand } = fresh();
  state.inv.keys = 0;
  assert.equal(Chests.openChest(state, 0, rand), null);
  state.inv.keys = 100;
  let levelUps = 0;
  for (let board = 0; board < Chests.CHESTS.boards * 2; board++) {
    const prizes = new Set();
    for (let chest = 0; chest < 6; chest++) {
      const got = Chests.openChest(state, chest, rand);
      prizes.add(got.prize);
      assert.equal(got.boardDone, chest === 5);
      if (got.levelUp) levelUps++;
    }
    assert.equal(prizes.size, 6, 'every prize is in there once');
  }
  assert.equal(levelUps, 2);
  assert.equal(state.chests.level, 3);
  assert.equal(state.inv.keys, 100 - 36);
  Chests.openChest(state, 2, rand);
  assert.equal(Chests.openChest(state, 2, rand), null);
});

test('missions: a fresh list each day and week, prizes once, chests along the way', () => {
  const { state } = fresh();
  everything(state);
  const info = Missions.missionsInfo(state, T0);
  assert.equal(info.daily.length, Missions.MISSIONS.daily);
  assert.equal(info.weekly.length, Missions.MISSIONS.weekly);
  assert.equal(new Set(info.daily.map((m) => m.stat)).size, info.daily.length, 'no job twice in a day');
  assert.equal(info.ready, 0);
  assert.equal(Missions.claimMission(state, false, 0, T0), null, 'not done yet');
  for (const m of info.daily) state.stats[m.stat] += m.target;
  const done = Missions.missionsInfo(state, T0);
  assert.ok(done.daily.every((m) => m.done) && done.ready >= done.daily.length);
  const tokens = state.tokens;
  for (const m of done.daily) assert.ok(Missions.claimMission(state, false, m.i, T0).tokens > 0);
  assert.equal(Missions.claimMission(state, false, 0, T0), null, 'once only');
  assert.ok(state.tokens > tokens);
  assert.equal(state.missions.points, 60);
  assert.equal(state.pass.points, 60, 'mission points count towards the pass');
  let chests = 0;
  while (Missions.claimMissionChest(state)) chests++;
  assert.equal(chests, 3);
  // tomorrow: new daily list, same week
  const next = Missions.missionsInfo(state, T0 + 24 * HOUR);
  assert.ok(next.daily.every((m) => !m.claimed && m.cur === 0));
  assert.equal(state.missions.points, 60);
  // next week: the chests start again
  Missions.missionsInfo(state, T0 + 7 * 24 * HOUR);
  assert.equal(state.missions.points, 0);
  // a new player is only asked for things that are open
  const { state: young } = fresh(9);
  assert.ok(Missions.missionsInfo(young, T0).daily.every((m) => !['merges', 'draws', 'shots', 'steps', 'chests', 'packs', 'helps'].includes(m.stat)));
});

test('park pass: points climb tiers, the premium row needs the pass, a new season starts clean', () => {
  const { state } = fresh();
  assert.equal(Pass.claimPass(state, T0), null);
  state.pass.points = Pass.PASS.perTier * 3 + 10;
  const info = Pass.passInfo(state, T0);
  assert.ok(info.tier === 3 && info.ready === 3 && info.into === 10);
  assert.equal(Pass.claimPass(state, T0).length, 3);
  assert.equal(Pass.claimPass(state, T0), null);
  assert.ok(R.applyPurchase(state, 'pass', T0));
  assert.equal(R.productOwned(state, 'pass', T0), true);
  assert.equal(Pass.passInfo(state, T0).ready, 3, 'the premium prizes already reached open at once');
  assert.equal(Pass.claimPass(state, T0).length, 3);
  state.pass.points = Pass.PASS.perTier * 999;
  assert.equal(Pass.passInfo(state, T0).tier, Pass.PASS.tiers);
  assert.equal(Pass.claimPass(state, T0).length, (Pass.PASS.tiers - 3) * 2);
  Pass.passInfo(state, T0 + Pass.PASS.days * 24 * HOUR);
  assert.ok(state.pass.points === 0 && !state.pass.premium && state.pass.free === 0);
});

test('festival: gems buy sixteen decorations, with a prize every fourth', () => {
  const { state } = fresh();
  assert.equal(Festival.buyDecor(state, 0, T0), null);
  state.inv.gems = 1e6;
  let prizes = 0;
  for (let i = 0; i < 4; i++) {
    for (let level = 1; level <= 4; level++) assert.equal(Festival.buyDecor(state, i, T0).level, level);
    assert.equal(Festival.buyDecor(state, i, T0), null);
  }
  while (Festival.claimFestival(state, T0)) prizes++;
  assert.equal(prizes, 4);
  assert.equal(Festival.festivalInfo(state, T0).bought, 16);
  const later = Festival.festivalInfo(state, T0 + 8 * 24 * HOUR);
  assert.ok(later.bought === 0 && later.name);
  assert.equal(state.inv.gems, 1e6 - Festival.FESTIVAL.items.reduce((n, it) => n + it.cost.reduce((a, b) => a + b, 0), 0), 'gems are kept between festivals');
});

test('park pals: helping, asking, and building together', () => {
  const { state } = fresh();
  state.town = 2;
  const reqs = Club.requests(state, T0);
  assert.equal(reqs.length, Club.CLUB.feedSize);
  assert.deepEqual(Club.requests(state, T0 + 60e3).map((r) => r.who.name), reqs.map((r) => r.who.name), 'the board holds still');
  const spins = reqs.find((r) => !r.card);
  const card = reqs.find((r) => r.card);
  if (spins) {
    const tokens = state.tokens;
    assert.ok(Club.help(state, spins.id, T0).reward.coins > 0);
    assert.equal(state.tokens, tokens - Club.CLUB.spinGift);
    assert.equal(Club.help(state, spins.id, T0), null);
  }
  if (card) {
    assert.equal(Club.help(state, card.id, T0), null, 'no spare to give');
    state.cards.owned[card.card.id] = 2;
    assert.ok(Club.help(state, card.id, T0));
    assert.equal(state.cards.owned[card.card.id], 1);
  }
  // asking for spins
  assert.equal(Club.spinsStatus(state, T0).state, 'can');
  assert.equal(Club.askSpins(state, T0), true);
  assert.equal(Club.spinsStatus(state, T0 + 60e3).state, 'waiting');
  assert.equal(Club.collectSpins(state, T0 + 60e3), null);
  const tokens = state.tokens;
  assert.equal(Club.collectSpins(state, T0 + 21 * 60e3).tokens, Club.CLUB.spinsGot);
  assert.equal(state.tokens, tokens + Club.CLUB.spinsGot);
  assert.equal(Club.spinsStatus(state, T0 + HOUR).state, 'cooldown');
  assert.equal(Club.spinsStatus(state, T0 + 5 * HOUR).state, 'can');
  // asking for a card
  const want = CARDS.find((c) => !c.gold && !state.cards.owned[c.id]);
  const gold = CARDS.find((c) => c.gold);
  assert.equal(Club.askCard(state, gold.id, T0), false, 'gold cards cannot be asked for');
  assert.equal(Club.askCard(state, want.id, T0), true);
  assert.equal(Club.collectCard(state, T0 + 31 * 60e3).id, want.id);
  assert.equal(state.cards.owned[want.id], 1);
  // the team build
  const t0 = Club.teamInfo(state, T0);
  assert.ok(t0.jobs.every((j) => !j.done) && !t0.canFinish);
  for (const j of Club.CLUB.jobs) state.stats[j.stat] += j.n;
  const t1 = Club.teamInfo(state, T0);
  assert.ok(t1.jobs.every((j) => j.done));
  for (const j of t1.jobs) assert.ok(Club.claimJob(state, j.i, T0).pts > 0);
  assert.equal(Club.claimJob(state, 0, T0), null);
  const late = T0 + 70 * HOUR;
  const t2 = Club.teamInfo(state, late - (late % 1) );
  assert.ok(t2.total > t2.mine, 'the pals chip in');
  assert.ok(t2.table.some((r) => r.you) && t2.table.length === 8);
  let steps = 0;
  while (Club.claimProject(state, T0 + 70 * HOUR)) steps++;
  assert.equal(steps, Club.teamInfo(state, T0 + 70 * HOUR).built);
  if (Club.teamInfo(state, T0 + 70 * HOUR).canFinish) {
    assert.ok(Club.claimTeam(state, T0 + 70 * HOUR).tokens > 0);
    assert.equal(Club.claimTeam(state, T0 + 70 * HOUR), null);
  }
  const fresher = Club.teamInfo(state, T0 + 4 * 24 * HOUR);
  assert.ok(fresher.jobs.every((j) => !j.claimed), 'a new build starts clean');
});

test('pets: one level, several pals, only the one walking with you uses its talent', () => {
  const { state } = fresh();
  assert.equal(Pets.activePet(state).id, 'puddle');
  state.pet.treats = 800;
  const fed = Pets.feedPet(state);
  assert.ok(fed.levels >= 10);
  assert.deepEqual(fed.arrived.map((p) => p.id), Pets.PETS.filter((p) => p.how === 'level' && p.level <= state.pet.level).map((p) => p.id));
  assert.ok(E.raidBonus(state) > 1);
  assert.equal(E.tokenCap(state), 60 + Pets.PET_TUNING.capPerLevel * state.pet.level);
  const shop = Pets.PETS.find((p) => p.perk === 'gate');
  assert.equal(Pets.buyPet(state, shop.id, E.unit(0)), null);
  state.coins = 1e9;
  assert.ok(Pets.buyPet(state, shop.id, E.unit(0)));
  assert.equal(Pets.buyPet(state, shop.id, E.unit(0)), null);
  state.plots[0].stage = 5;
  const plain = E.plotRate(state, 0);
  assert.equal(Pets.setPet(state, shop.id), true);
  assert.ok(E.plotRate(state, 0) > plain);
  assert.equal(E.raidBonus(state), 1, 'the duck stays at home');
  assert.equal(Pets.setPet(state, 'nobody'), false);
  assert.equal(hydrate(JSON.parse(serialize(state))).pet.active, shop.id);
});

test('the clock moves everything on, and the badges count what is waiting', () => {
  const { state } = fresh();
  everything(state);
  state.inv.energy = 0;
  G.tick(state, T0);
  G.tick(state, T0 + 2 * HOUR);
  assert.ok(state.inv.energy > 0 && state.trail.plant.stored > 0);
  const w = G.waiting(state, T0 + 2 * HOUR);
  assert.equal(w.merge, state.inv.energy);
  assert.equal(w.draw, state.inv.pearls);
  assert.equal(w.parkChests, 0);
  state.plots.forEach((p) => { p.stage = 10; });
  assert.equal(G.waiting(state, T0).parkChests, Math.floor((4 * 80) / E.PARK_STARS));
  // spins drop bits for the side games once they are open
  const rand = S.mulberry32(3);
  state.stats.spins = 99;
  state.tokens = 5000;
  const before = { ...state.inv };
  for (let i = 0; i < 2000; i++) {
    R.spin(state, rand, T0);
    if (state.pending) for (const tub of [0, 1, 2]) R.raidPick(state, tub);
  }
  assert.ok(state.inv.energy > before.energy && state.inv.pearls > before.pearls && state.inv.shots > before.shots && state.inv.keys > before.keys);
  for (const p of PLOTS) assert.ok(state.plots[p.index].stage === 10);
});
