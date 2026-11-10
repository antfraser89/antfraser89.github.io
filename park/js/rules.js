// The rules of the game: spinning, building, rivals, cards, the pet and the
// timed events. Everything here works on plain state with the clock and the
// random source passed in, so it runs the same in the browser and in tests.
import {
  ADS, ALBUM_REWARD, CARDS, CARD_SETS, DAILY, EVENT_MILESTONES, EVENT_POINTS, EVENT_THEMES, LEAGUE_POINTS, LEAGUE_PRIZES,
  MIXED_WEIGHTS, OPENING_SPINS, OUTCOMES, PACKS, PAY, PET, PLOTS, PRODUCTS, RIVALS, STAGES, TOWN_REWARD, TRIPLE, TUNING as T,
  UPGRADE_REWARDS, VAULT, setUnlockTown, townInfo,
} from './config.js';
import * as E from './economy.js';

const HOUR = 3600e3;

function weighted(rand, entries) {
  let total = 0;
  for (const [, w] of entries) total += w;
  let roll = rand() * total;
  for (const [value, w] of entries) {
    roll -= w;
    if (w > 0 && roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

function earn(state, coins) {
  state.coins += coins;
  state.stats.coinsWon += coins;
}

// Hand over a reward ({tokens, coins (in units), treats, pack}) and report
// what was actually given, in real amounts.
export function grant(state, reward) {
  const out = { tokens: 0, coins: 0, treats: 0, pack: null, packs: null };
  if (!reward) return out;
  if (reward.packs) {
    out.packs = {};
    for (const type of Object.keys(PACKS)) {
      const n = reward.packs[type] || 0;
      if (n > 0) {
        out.packs[type] = n;
        state.cards.packs[type] += n;
      }
    }
  }
  if (reward.tokens) {
    out.tokens = reward.tokens;
    state.tokens += reward.tokens;
  }
  if (reward.coins) {
    out.coins = reward.coins * E.unit(state.town);
    earn(state, out.coins);
  }
  if (reward.treats) {
    out.treats = reward.treats;
    state.pet.treats += reward.treats;
  }
  if (reward.pack) {
    out.pack = reward.pack;
    state.cards.packs[reward.pack]++;
  }
  return out;
}

// ---- tokens -----------------------------------------------------------------

export function regenTokens(state, now) {
  const cap = E.tokenCap(state);
  if (state.tokens >= cap) {
    state.tokenAt = now;
    return 0;
  }
  if (!(state.tokenAt > 0) || state.tokenAt > now) state.tokenAt = now;
  const every = T.tokenEvery * 1000;
  const n = Math.floor((now - state.tokenAt) / every);
  if (n <= 0) return 0;
  const add = Math.min(n, cap - state.tokens);
  state.tokens += add;
  state.tokenAt = state.tokens >= cap ? now : state.tokenAt + n * every;
  return add;
}

// Seconds until the next token arrives, or 0 when the meter is full.
export function nextTokenIn(state, now) {
  if (state.tokens >= E.tokenCap(state)) return 0;
  return Math.max(0, (state.tokenAt + T.tokenEvery * 1000 - now) / 1000);
}

export function setBet(state, bet) {
  const bets = E.availableBets(state);
  state.bet = bets.includes(bet) ? bet : bets[bets.length - 1];
  return state.bet;
}

// Step to the next bet on offer, wrapping back to one.
export function cycleBet(state) {
  const bets = E.availableBets(state);
  const i = bets.indexOf(state.bet);
  state.bet = bets[(i + 1) % bets.length];
  return state.bet;
}

// ---- rivals -----------------------------------------------------------------

function makeRival(state, rand, id = Math.floor(rand() * RIVALS.length)) {
  const stages = PLOTS.map(() => 2 + Math.floor(rand() * 4));
  const splats = PLOTS.map(() => rand() < 0.09);
  if (splats.filter(Boolean).length > 2) splats.fill(false);
  return { id: id % RIVALS.length, town: state.town, shield: rand() < T.rivalShieldChance, stages, splats };
}

export const rivalName = (id) => RIVALS[id % RIVALS.length].name;
export const rivalPark = (id) => RIVALS[id % RIVALS.length].park;

// ---- the machine ------------------------------------------------------------

function mixedReels(rand) {
  const entries = Object.entries(MIXED_WEIGHTS);
  const reels = [weighted(rand, entries), weighted(rand, entries), weighted(rand, entries)];
  // a mixed spin never shows three of a kind: nudge the last reel if it would
  for (let tries = 0; reels[0] === reels[1] && reels[1] === reels[2]; tries++) {
    reels[2] = tries < 8 ? weighted(rand, entries) : entries.find(([sym]) => sym !== reels[0])[0];
  }
  return reels;
}

export function canSpin(state) {
  return !state.pending && state.tokens >= Math.min(state.bet, 1) && state.tokens >= 1;
}

export function spin(state, rand, now) {
  if (state.pending) return { ok: false, why: 'pending' };
  setBet(state, state.bet);
  if (state.tokens < state.bet) setBet(state, 1);
  const bet = state.bet;
  if (state.tokens < bet) return { ok: false, why: 'tokens' };

  const cap = E.tokenCap(state);
  if (state.tokens >= cap && state.tokens - bet < cap) state.tokenAt = now;
  state.tokens -= bet;
  const n = state.stats.spins++;
  state.stats.tokensSpent += bet;

  const kind = n < OPENING_SPINS.length ? OPENING_SPINS[n] : weighted(rand, OUTCOMES.map((o) => [o.kind, o.w]));
  const reels = kind === 'mixed' ? mixedReels(rand) : [TRIPLE[kind], TRIPLE[kind], TRIPLE[kind]];
  const u = E.unit(state.town);
  const out = { ok: true, kind, reels, bet, coins: 0, tokens: 0, treats: 0, shield: 0, overflow: false, pack: null, pending: null };
  let points = EVENT_POINTS.spin;

  switch (kind) {
    case 'mixed':
      for (const sym of reels) out.coins += (PAY[sym] || 0) * u * bet;
      break;
    case 'coins3':
    case 'sacks3':
      out.coins = PAY[kind] * u * bet;
      points += EVENT_POINTS.triple;
      break;
    case 'jackpot':
      out.coins = PAY.jackpot * u * bet;
      out.pack = 'silver';
      state.cards.packs.silver++;
      state.stats.jackpots++;
      points += EVENT_POINTS.jackpot;
      break;
    case 'shield':
      if (state.shields < T.maxShields) {
        state.shields++;
        out.shield = 1;
      } else {
        out.overflow = true;
        out.coins = PAY.shieldOverflow * u * bet;
      }
      points += EVENT_POINTS.triple;
      break;
    case 'tokens':
      out.tokens = PAY.tokens * bet;
      state.tokens += out.tokens;
      points += EVENT_POINTS.triple;
      break;
    case 'treats':
      out.treats = PAY.treats * bet;
      state.pet.treats += out.treats;
      points += EVENT_POINTS.triple;
      break;
    case 'attack':
      state.pending = { type: 'attack', bet, revenge: false, rival: makeRival(state, rand) };
      points += EVENT_POINTS.attack;
      break;
    case 'raid': {
      const stash = u * bet * (PAY.raidStash[0] + (PAY.raidStash[1] - PAY.raidStash[0]) * rand()) * E.raidBonus(state);
      const tubs = PAY.raidShares.map((share) => E.nice(stash * share));
      for (let i = tubs.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [tubs[i], tubs[j]] = [tubs[j], tubs[i]];
      }
      state.pending = { type: 'raid', bet, revenge: false, rival: makeRival(state, rand), tubs, picks: [] };
      points += EVENT_POINTS.raid;
      break;
    }
    default:
      break;
  }
  if (out.coins) earn(state, out.coins);
  out.pending = state.pending;
  out.milestones = addEventPoints(state, points * bet, now);
  return out;
}

// Throw the pie at one of the rival's attractions.
export function resolveAttack(state, slot) {
  const p = state.pending;
  if (!p || p.type !== 'attack' || !PLOTS[slot] || p.rival.splats[slot]) return null;
  const blocked = p.rival.shield;
  const coins = (blocked ? PAY.attackBlocked : PAY.attackHit) * E.unit(state.town) * p.bet * (p.revenge ? 0.5 : 1);
  earn(state, coins);
  state.stats.attacks++;
  if (blocked) state.stats.blocked++;
  state.league.points += (blocked ? LEAGUE_POINTS.blocked : LEAGUE_POINTS.hit) * p.bet;
  state.pending = null;
  return { blocked, coins, slot, rival: p.rival };
}

// Rummage in one of the four tubs. Three goes; one tub is only sawdust.
export function raidPick(state, tub) {
  const p = state.pending;
  if (!p || p.type !== 'raid' || !(tub >= 0 && tub < 4) || p.picks.includes(tub) || p.picks.length >= 3) return null;
  p.picks.push(tub);
  const amount = p.tubs[tub];
  if (amount > 0) {
    earn(state, amount);
    state.league.points += LEAGUE_POINTS.barrel * p.bet;
  }
  const done = p.picks.length >= 3;
  const out = { amount, done, total: 0, sweep: false, tubs: null, rival: p.rival };
  if (done) {
    out.total = p.picks.reduce((n, k) => n + p.tubs[k], 0);
    out.sweep = p.picks.every((k) => p.tubs[k] > 0);
    out.tubs = p.tubs.slice();
    state.stats.raids++;
    if (out.sweep) {
      state.stats.sweeps++;
      state.league.points += LEAGUE_POINTS.sweep * p.bet;
    }
    state.pending = null;
  }
  return out;
}

function scheduleIncoming(state, from, rand) {
  const [lo, hi] = T.incomingEvery;
  state.nextAttackAt = from + (lo + (hi - lo) * rand()) * 60e3;
}

// Rivals throw pies back. A padlock stops one; otherwise an attraction closes
// until it has been cleaned up.
export function processIncoming(state, now, rand, max = 1) {
  const out = [];
  if (state.stats.spins < 12) return out;
  if (!(state.nextAttackAt > 0)) {
    scheduleIncoming(state, now, rand);
    return out;
  }
  let landed = 0;
  while (now >= state.nextAttackAt && out.length < max && landed < 2) {
    const at = state.nextAttackAt;
    scheduleIncoming(state, at, rand);
    const open = PLOTS.map((p) => p.index).filter((k) => state.plots[k].stage > 0 && !state.plots[k].splat);
    if (!open.length) continue;
    const rival = Math.floor(rand() * RIVALS.length);
    let item;
    if (state.shields > 0) {
      state.shields--;
      state.stats.shielded++;
      item = { t: at, rival, blocked: true, plot: 0, art: 0, revenge: false, seen: false };
    } else {
      const k = open[Math.floor(rand() * open.length)];
      state.plots[k].splat = true;
      state.stats.pied++;
      landed++; // never more than two closures to come back to
      item = { t: at, rival, blocked: false, plot: k, art: townInfo(state.town).lineup[k], revenge: true, seen: false };
    }
    state.news.unshift(item);
    out.push(item);
  }
  if (now >= state.nextAttackAt) scheduleIncoming(state, now, rand);
  if (state.news.length > 12) state.news.length = 12;
  return out;
}

// One free pie back at whoever got you.
export function startRevenge(state, item, rand) {
  if (state.pending || !item || !item.revenge) return false;
  item.revenge = false;
  state.pending = { type: 'attack', bet: 1, revenge: true, rival: makeRival(state, rand, item.rival) };
  return true;
}

// ---- building ---------------------------------------------------------------

export function upgradePlot(state, k) {
  const p = state.plots[k];
  if (!p || p.stage >= STAGES || p.splat) return null;
  const cost = E.stageCost(state.town, k, p.stage + 1);
  if (state.coins < cost) return null;
  state.coins -= cost;
  p.stage++;
  state.stats.upgrades++;
  return { stage: p.stage, cost, reward: UPGRADE_REWARDS[p.stage] ? grant(state, UPGRADE_REWARDS[p.stage]) : null, complete: E.townComplete(state) };
}

export function repairPlot(state, k) {
  const p = state.plots[k];
  if (!p || !p.splat) return null;
  const cost = E.repairCost(state.town, k, p.stage);
  if (state.coins < cost) return null;
  state.coins -= cost;
  p.splat = false;
  state.stats.repairs++;
  return { cost };
}

// Pack up a finished park and move to the next town.
export function travel(state) {
  if (!E.townComplete(state)) return null;
  const reward = grant(state, TOWN_REWARD);
  state.town++;
  state.stats.towns++;
  for (const p of state.plots) {
    p.stage = 0;
    p.splat = false;
    p.flow = 0;
    p.served = 0;
  }
  return { reward, town: state.town };
}

// ---- cards ------------------------------------------------------------------

export function unlockedSets(state) {
  return CARD_SETS.map((s) => s.index).filter((s) => s === 0 || setUnlockTown(s) <= state.town);
}

export const hasCard = (state, id) => (state.cards.owned[id] || 0) > 0;
export const setCount = (state, s) => CARD_SETS[s].cards.filter((c) => hasCard(state, c.id)).length;
export const setComplete = (state, s) => setCount(state, s) === CARD_SETS[s].cards.length;
export const cardsOwned = (state) => CARDS.filter((c) => hasCard(state, c.id)).length;
export const albumComplete = (state) => state.cards.sets.every(Boolean);

function addCard(state, card) {
  const had = state.cards.owned[card.id] || 0;
  state.cards.owned[card.id] = had + 1;
  state.stats.cards++;
  let stars = 0;
  if (had > 0) {
    stars = card.gold ? 10 : card.stars;
    state.cards.stars += stars;
  }
  return { id: card.id, isNew: had === 0, stars };
}

function missing(state, { gold }) {
  const sets = unlockedSets(state);
  return CARDS.filter((c) => sets.includes(c.set) && c.gold === gold && !hasCard(state, c.id));
}

function drawCard(state, type, rand) {
  const sets = unlockedSets(state);
  const stars = weighted(rand, PACKS[type].odds.map((w, i) => [i + 1, w]));
  // the newest set is a little likelier, so fresh cards keep arriving
  const s = weighted(rand, sets.map((id, i) => [id, i === sets.length - 1 ? 1.6 : 1]));
  const pool = CARD_SETS[s].cards.filter((c) => c.stars === stars);
  return pool[Math.floor(rand() * pool.length)];
}

export function openPack(state, type, rand) {
  if (!PACKS[type] || !(state.cards.packs[type] > 0)) return null;
  state.cards.packs[type]--;
  state.stats.packs++;
  const cards = [];
  for (let i = 0; i < PACKS[type].size; i++) cards.push(drawCard(state, type, rand));
  // No long droughts: after two packs with nothing new, the next one has a new card in it.
  const anyNew = cards.some((c, i) => !hasCard(state, c.id) && cards.findIndex((d) => d.id === c.id) === i);
  if (!anyNew) {
    state.cards.dry = (state.cards.dry || 0) + 1;
    const fresh = missing(state, { gold: false });
    if (state.cards.dry > 2 && fresh.length) {
      cards[cards.length - 1] = fresh[Math.floor(rand() * fresh.length)];
      state.cards.dry = 0;
    }
  } else {
    state.cards.dry = 0;
  }
  return cards.map((c) => addCard(state, c));
}

export function buyPack(state, type) {
  if (!PACKS[type]) return false;
  const price = E.packPrice(state.town, type);
  if (state.coins < price) return false;
  state.coins -= price;
  state.cards.packs[type]++;
  return true;
}

const seasonMult = (state) => 1 + 0.5 * (state.cards.season - 1);

export function claimSet(state, s) {
  if (!CARD_SETS[s] || state.cards.sets[s] || !setComplete(state, s)) return null;
  state.cards.sets[s] = true;
  state.stats.sets++;
  return grant(state, { tokens: Math.round(CARD_SETS[s].reward * seasonMult(state)), coins: 20 * (s + 1) });
}

// Finishing the album pays out and starts a fresh season of the same cards.
export function claimAlbum(state) {
  if (!albumComplete(state)) return null;
  const reward = grant(state, { tokens: Math.round(ALBUM_REWARD.tokens * seasonMult(state)), pack: 'gold' });
  state.cards.season++;
  state.cards.owned = {};
  state.cards.sets = CARD_SETS.map(() => false);
  state.cards.dry = 0;
  return reward;
}

export function vaultOffer(state, id) {
  const tier = VAULT.find((v) => v.id === id);
  if (!tier) return null;
  const pool = tier.gold ? missing(state, { gold: true }) : [];
  return { tier, affordable: state.cards.stars >= tier.cost, available: !tier.gold || pool.length > 0 };
}

export function vaultBuy(state, id, rand) {
  const offer = vaultOffer(state, id);
  if (!offer || !offer.affordable || !offer.available) return null;
  const { tier } = offer;
  state.cards.stars -= tier.cost;
  const cards = [];
  if (tier.pack) state.cards.packs[tier.pack]++;
  for (let i = 0; i < tier.fresh; i++) {
    const pool = missing(state, { gold: false });
    if (pool.length) cards.push(addCard(state, pool[Math.floor(rand() * pool.length)]));
  }
  if (tier.gold) {
    const pool = missing(state, { gold: true });
    cards.push(addCard(state, pool[Math.floor(rand() * pool.length)]));
  }
  return { pack: tier.pack, cards };
}

// ---- pet --------------------------------------------------------------------

export function feedPet(state, count = Infinity) {
  const used = Math.min(count, state.pet.treats);
  if (!(used > 0)) return null;
  state.pet.treats -= used;
  state.pet.xp += used;
  state.stats.fed += used;
  const out = { used, levels: 0, tokens: 0 };
  while (state.pet.level < PET.maxLevel && state.pet.xp >= PET.xpFor(state.pet.level)) {
    state.pet.xp -= PET.xpFor(state.pet.level);
    state.pet.level++;
    out.levels++;
    out.tokens += PET.levelTokens(state.pet.level);
  }
  state.tokens += out.tokens;
  return out;
}

// ---- the spin event ---------------------------------------------------------

export function eventInfo(state, now) {
  const len = T.eventHours * HOUR;
  if (!(state.event.start > 0) || now >= state.event.start + len || state.event.start > now) {
    state.event = { start: Math.floor(now / len) * len, points: 0, claimed: 0 };
  }
  const theme = EVENT_THEMES[Math.floor(state.event.start / len) % EVENT_THEMES.length];
  const next = EVENT_MILESTONES[state.event.claimed] || null;
  const prev = state.event.claimed > 0 ? EVENT_MILESTONES[state.event.claimed - 1].at : 0;
  return { theme, endsAt: state.event.start + len, points: state.event.points, claimed: state.event.claimed, next, prev };
}

function addEventPoints(state, points, now) {
  eventInfo(state, now);
  state.event.points += points;
  const got = [];
  while (state.event.claimed < EVENT_MILESTONES.length && state.event.points >= EVENT_MILESTONES[state.event.claimed].at) {
    got.push(grant(state, EVENT_MILESTONES[state.event.claimed].reward));
    state.event.claimed++;
  }
  return got;
}

// ---- the pie league ---------------------------------------------------------

const hash = (a, b, c) => {
  const v = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
  return v - Math.floor(v);
};

// Rival scores climb through the day at their own pace, the same every time
// you look, so the table can be rebuilt from the clock alone.
function rivalScore(state, cycle, i, hours) {
  const pace = 4 + hash(state.seed % 9973, cycle, i) * 30;
  const wobble = 0.85 + 0.3 * hash(state.seed % 7919, cycle + 0.5, i + hours * 0.01);
  return Math.floor(pace * hours * wobble * (1 + Math.min(state.town, 12) * 0.06));
}

function leagueRows(state, start, now, points) {
  const len = T.leagueHours * HOUR;
  const cycle = Math.floor(start / len);
  const hours = Math.min(T.leagueHours, Math.max(0, (now - start) / HOUR));
  const rows = RIVALS.map((r, i) => ({ name: r.name, id: i, you: false, points: rivalScore(state, cycle, i, hours) }));
  rows.push({ name: 'You', id: -1, you: true, points });
  rows.sort((a, b) => b.points - a.points || (a.you ? -1 : 1));
  return rows;
}

export const leaguePrize = (rank) => (LEAGUE_PRIZES.find((p) => rank <= p.upTo) || { reward: null }).reward;

// Roll the league over when its day ends, paying out the finished one.
export function leagueInfo(state, now) {
  const len = T.leagueHours * HOUR;
  let settled = null;
  if (!(state.league.start > 0) || state.league.start > now) {
    state.league.start = Math.floor(now / len) * len;
    state.league.points = 0;
  } else if (now >= state.league.start + len) {
    if (state.league.points > 0) {
      const rows = leagueRows(state, state.league.start, state.league.start + len, state.league.points);
      const rank = rows.findIndex((r) => r.you) + 1;
      settled = { rank, points: state.league.points, reward: grant(state, leaguePrize(rank)) };
      state.league.last = { rank, points: state.league.points, seen: false };
    }
    state.league.start = Math.floor(now / len) * len;
    state.league.points = 0;
  }
  const rows = leagueRows(state, state.league.start, now, state.league.points);
  return { rows, rank: rows.findIndex((r) => r.you) + 1, endsAt: state.league.start + len, settled };
}

// ---- daily gift -------------------------------------------------------------

export const dayNumber = (now) => Math.floor((now - new Date(now).getTimezoneOffset() * 60e3) / (24 * HOUR));
export const dailyReady = (state, now) => dayNumber(now) !== state.daily.last;

export function claimDaily(state, now) {
  if (!dailyReady(state, now)) return null;
  const index = state.daily.day % DAILY.length;
  const reward = grant(state, DAILY[index]);
  state.daily.day++;
  state.daily.last = dayNumber(now);
  return { reward, index };
}

// ---- shop and adverts ---------------------------------------------------------

export const productById = (id) => PRODUCTS.find((p) => p.id === id) || null;
export const productOwned = (state, id) => !!state.shop.owned[id];

// Hand over what a completed purchase paid for. Taking the money is the
// payment provider's job; this only runs once that has succeeded.
export function applyPurchase(state, id) {
  const product = productById(id);
  if (!product || (product.once && state.shop.owned[id])) return null;
  const reward = grant(state, product.grant || {});
  if (product.once) state.shop.owned[id] = true;
  if (product.noAds) state.shop.noAds = true;
  state.shop.bought++;
  return reward;
}

// Free tokens for watching an advert, a few times a day.
export function adTokensLeft(state, now) {
  return state.shop.adDay === dayNumber(now) ? Math.max(0, ADS.perDay - state.shop.adCount) : ADS.perDay;
}

export function claimAdTokens(state, now) {
  if (adTokensLeft(state, now) <= 0) return null;
  const day = dayNumber(now);
  if (state.shop.adDay !== day) {
    state.shop.adDay = day;
    state.shop.adCount = 0;
  }
  state.shop.adCount++;
  return grant(state, { tokens: ADS.tokens });
}

// ---- time passing -----------------------------------------------------------

// Everything driven by the wall clock: tokens trickle in, the event and the
// league roll over, and rivals take their shots.
export function tick(state, now, rand, maxIncoming = 1) {
  const tokens = regenTokens(state, now);
  eventInfo(state, now);
  const league = leagueInfo(state, now).settled;
  const incidents = processIncoming(state, now, rand, maxIncoming);
  return { tokens, league, incidents };
}
