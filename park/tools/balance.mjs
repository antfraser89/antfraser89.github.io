// Headless balance check: a bot plays the real rules for a number of days and
// prints how far it gets. Usage: node tools/balance.mjs [days] [sessionsPerDay] [seed]
// The bot plays everything: it spins, builds, opens chests, does its missions,
// plays the side games and helps its club. It never buys anything, and it
// watches no adverts unless the fourth argument is "ads".
import { ADS, CARDS, CARD_SETS, PACKS, PLOTS } from '../js/config.js';
import * as E from '../js/economy.js';
import { fmt } from '../js/format.js';
import * as G from '../js/game.js';
import * as Chests from '../js/games/chests.js';
import * as Draw from '../js/games/draw.js';
import * as Merge from '../js/games/merge.js';
import * as Trail from '../js/games/trail.js';
import { currentMission } from '../js/goals.js';
import * as Club from '../js/meta/club.js';
import * as Festival from '../js/meta/festival.js';
import * as Missions from '../js/meta/missions.js';
import * as Pass from '../js/meta/pass.js';
import * as R from '../js/rules.js';
import * as S from '../js/sim.js';
import { newState } from '../js/state.js';

const days = Number(process.argv[2]) || 7;
const sessions = Number(process.argv[3]) || 4;
const seed = Number(process.argv[4]) || 7;
const ads = process.argv.includes('ads');
const rand = S.mulberry32(seed);

const DAY = 24 * 3600e3;
let now = 20000 * DAY + 8 * 3600e3; // 8 in the morning
const state = newState(now, seed);
const world = S.createWorld(state, rand);
const tally = { fromRegen: 0, sessions: 0 };
const src = {};
const track = (name, fn) => { const before = state.tokens; const out = fn(); src[name] = (src[name] || 0) + state.tokens - before; return out; };

// The gate: measure what a finished park takes per hour, in units.
{
  const probe = newState(0, 1);
  probe.plots.forEach((p) => { p.stage = 10; p.cap = 5; });
  const perHour = (E.idleRate(probe) * 3600) / E.unit(0);
  console.log(`A finished park takes ${perHour.toFixed(1)} units an hour at the gate; a spin is worth ${E.spinEV().toFixed(2)} units.`);
  console.log(`So the gate is worth about ${(perHour / E.spinEV()).toFixed(1)} spins an hour, and each finished park adds ${((perHour * 0.06) / E.spinEV()).toFixed(1)} more.\n`);
}

function spendCoins() {
  for (let guard = 0; guard < 400; guard++) {
    while (R.claimParkChest(state)) { /* open it */ }
    if (E.townComplete(state)) {
      const from = state.town;
      R.travel(state);
      S.resetWorld(world);
      console.log(`  day ${(((now - 20000 * DAY) / DAY) + 1).toFixed(1).padStart(4)}  finished park ${from + 1} after ${state.stats.spins} spins (${state.stats.tokensSpent} spin tickets), level ${E.level(state)}`);
      continue;
    }
    let best = null;
    for (const p of PLOTS) {
      const star = E.nextStar(state, p.index);
      const cap = E.nextCap(state, p.index);
      if (star && (!best || star.cost < best.cost)) best = { cost: star.cost, fn: R.upgradePlot, k: p.index };
      if (cap && cap.open && (!best || cap.cost < best.cost)) best = { cost: cap.cost, fn: R.upgradeCap, k: p.index };
    }
    if (!best || state.coins < best.cost) break;
    best.fn(state, best.k);
  }
  R.levelUps(state);
}

function playMerge() {
  if (!E.unlocked(state, 'merge')) return;
  const m = state.merge;
  for (let guard = 0; guard < 600; guard++) {
    // merge whatever pairs there are
    let merged = true;
    while (merged) {
      merged = false;
      for (let a = 0; a < m.cells.length && !merged; a++) {
        if (!(m.cells[a] > 0)) continue;
        for (let b = 0; b < m.cells.length; b++) {
          if (a !== b && Math.abs(m.cells[b]) === m.cells[a] && m.cells[a] < Merge.MERGE.chain) {
            merged = Merge.move(state, a, b).ok;
            break;
          }
        }
      }
    }
    const drop = Merge.generate(state, rand, now);
    if (drop.ok) continue;
    if (drop.why === 'full' && !Merge.anyMerge(state)) {
      const lowest = m.cells.reduce((best, v, i) => (v > 0 && (best < 0 || v < m.cells[best]) ? i : best), -1);
      if (lowest >= 0 && Merge.sell(state, lowest)) continue;
    }
    break;
  }
}

function playSides() {
  playMerge();
  if (E.unlocked(state, 'draw')) while (Draw.drawOnce(state, rand)) { /* burst */ }
  if (E.unlocked(state, 'chests')) {
    for (let guard = 0; guard < 200 && state.inv.keys > 0; guard++) {
      const chest = [0, 1, 2, 3, 4, 5].find((i) => !state.chests.open.includes(i));
      if (chest == null || !Chests.openChest(state, chest, rand)) break;
    }
  }
  if (E.unlocked(state, 'trail')) {
    Trail.collectSwords(state);
    for (let guard = 0; guard < 200 && state.inv.shots > 0; guard++) {
      const jar = Array.from({ length: Trail.TRAIL.jars }, (_, i) => i).filter((i) => !state.trail.cannon.open.includes(i));
      if (!Trail.fire(state, jar[Math.floor(rand() * jar.length)])) break;
    }
    while (Trail.feedPlant(state)) { /* grow */ }
    while (Trail.advance(state)) { /* on to the next flag */ }
  }
  if (E.unlocked(state, 'festival')) {
    for (let guard = 0; guard < 16; guard++) {
      const i = state.festival.levels.findIndex((l, k) => l < 4 && state.inv.gems >= Festival.FESTIVAL.items[k].cost[l]);
      if (i < 0 || !Festival.buyDecor(state, i, now)) break;
    }
    while (Festival.claimFestival(state, now)) { /* prize */ }
    if (state.festival.levels.every((l) => l >= 4)) while (Festival.tradeGems(state)) { /* spare gems */ }
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
  if (E.unlocked(state, 'missions')) {
    const info = Missions.missionsInfo(state, now);
    for (const m of [...info.daily, ...info.weekly]) if (m.done && !m.claimed) Missions.claimMission(state, m.weekly, m.i, now);
    while (Missions.claimMissionChest(state)) { /* open */ }
  }
  if (E.unlocked(state, 'pass')) Pass.claimPass(state, now);
  if (E.unlocked(state, 'club')) {
    for (const r of Club.requests(state, now)) if (!r.helped && r.can) Club.help(state, r.id, now);
    Club.collectSpins(state, now);
    Club.askSpins(state, now);
    Club.collectCard(state, now);
    const want = CARDS.find((c) => !c.gold && R.unlockedSets(state).includes(c.set) && !R.hasCard(state, c.id));
    if (want) Club.askCard(state, want.id, now);
    for (const j of Club.teamInfo(state, now).jobs) Club.claimJob(state, j.i, now);
    while (Club.claimProject(state, now)) { /* built */ }
    Club.claimTeam(state, now);
  }
  world.events.length = 0;
}

function session() {
  tally.sessions++;
  const before = state.tokens;
  G.tick(state, now);
  tally.fromRegen += state.tokens - before;
  if (R.claimDaily(state, now)) R.grant(state, { points: 10 });
  if (ads) for (const id of Object.keys(ADS)) while (R.claimAd(state, id, now)) { /* watch */ }
  housekeeping();
  playSides();
  for (let guard = 0; guard < 100000 && state.tokens >= 1; guard++) {
    const bets = E.availableBets(state);
    R.setBet(state, bets[Math.max(0, bets.length - 2)]);
    const r = R.spin(state, rand, now);
    if (!r.ok) break;
    if (state.pending) {
      const order = [0, 1, 2, 3].sort(() => rand() - 0.5);
      for (const tub of order.slice(0, 3)) R.raidPick(state, tub);
    }
    src.reels = (src.reels || 0) + (r.tokens || 0);
    src.bonus = (src.bonus || 0) + r.milestones.reduce((n, m) => n + (m.tokens || 0), 0);
    track('park', spendCoins);
    track('upkeep', housekeeping);
    now += 4000; // a spin takes a few seconds
    if (guard % 40 === 39) track('sides', playSides);
  }
  track('park', spendCoins);
  track('sides', playSides);
  track('upkeep', housekeeping);
}

for (let d = 0; d < days; d++) {
  const dayStart = now;
  for (let k = 0; k < sessions; k++) {
    now = dayStart + (k * 14 * 3600e3) / Math.max(1, sessions - 1 || 1);
    S.applyOffline(world, 2 * 3600); // the gate, between sessions
    session();
    for (let t = 0; t < 120; t += 0.5) S.step(world, 0.5); // a couple of minutes on the park page
    world.events.length = 0;
  }
  const owned = R.cardsOwned(state);
  console.log(
    `day ${String(d + 1).padStart(2)}: park ${state.town + 1}, level ${E.level(state)}, ${state.stats.spins} spins, cards ${owned}/${CARDS.length} (season ${state.cards.season}), pet lv ${state.pet.level}, ` +
    `gems ${fmt(state.inv.gems)}, decor ${state.festival.levels.join('')}, pass tier ${Pass.passTier(state)}, merge round ${state.merge.round + 1}, draw round ${state.draw.round + 1}, ` +
    `trail stage ${state.trail.path.stage + 1}, cannon lv ${state.trail.cannon.level}, chests lv ${state.chests.level}, coins ${fmt(state.coins)}`,
  );
  now = dayStart + DAY;
}

console.log('\nWhere the spins came from: ' + Object.entries(src).map(([k, v]) => `${k} ${v}`).join(', '));
console.log(`\nSpin tickets from the timer: ${tally.fromRegen} of ${state.stats.tokensSpent} spent (${Math.round((tally.fromRegen / state.stats.tokensSpent) * 100)}%).`);
console.log(`Pearl dives ${state.stats.raids}, wheel turns ${state.stats.wheels}, jackpots ${state.stats.jackpots}, merges ${state.stats.merges}, draws ${state.stats.draws}, cannon shots ${state.stats.shots}, flags ${state.stats.steps}, chests ${state.stats.chests}, missions ${state.stats.missions}, helps ${state.stats.helps}.`);
