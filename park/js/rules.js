// The rules of the main game: spinning, building, cards and the timed
// events. Everything here works on plain state with the clock and the random
// source passed in, so it runs the same in the browser and in tests. The side
// games and the club have their own modules (see games/ and meta/).
import {
  ADS, ALBUM_REWARD, BELL, CAP_STEPS, CARDS, CARD_SETS, DAILY, EVENT_MILESTONES, EVENT_POINTS, EVENT_THEMES, HOMES, ITEMS, LEAGUE_POINTS, LEAGUE_PRIZES,
  MIXED_WEIGHTS, OPENING_SPINS, OUTCOMES, PACKS, PARK_CHESTS, PAY, PRODUCTS, REEL_DROPS, RIVALS, RUSH, SITE_SYMBOLS, STAGES, TOWN_REWARD, TRIPLE, TUNING as T,
  UNLOCKS, UPGRADE_REWARDS, VAULT, WHEEL, homeSite, levelReward, setUnlockTown, siteOf,
} from './config.js';
import { HOUR, dayNumber, earn, grant, hash, weighted } from './core.js';
import * as E from './economy.js';
import { talent } from './pets.js';

export { dayNumber, grant };
export { feedPet, setPet, buyPet, activePet } from './pets.js';

// ---- spins ------------------------------------------------------------------

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

// Seconds until the next spin arrives, or 0 when the meter is full.
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
  return !state.pending && state.tokens >= 1;
}

// A rush hour needs a site that is open. Early spins follow the script, and
// there it goes to the best site built so far.
function rushSite(state, rand, scripted) {
  if (!scripted) {
    const k = Math.floor(rand() * state.plots.length);
    return state.plots[k].stage > 0 ? k : -1;
  }
  let best = -1;
  state.plots.forEach((p, k) => {
    if (p.stage > 0 && (best < 0 || E.sitePay(state, k) > E.sitePay(state, best))) best = k;
  });
  return best;
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

  const scripted = n < OPENING_SPINS.length;
  let kind = scripted ? OPENING_SPINS[n] : weighted(rand, OUTCOMES.map((o) => [o.kind, o.w]));
  let site = -1;
  if (kind === 'rush') {
    site = rushSite(state, rand, scripted);
    if (site < 0) kind = scripted ? 'coins3' : 'mixed';
  }
  const sym = kind === 'rush' ? SITE_SYMBOLS[site] : TRIPLE[kind];
  const reels = kind === 'mixed' ? mixedReels(rand) : [sym, sym, sym];
  const u = E.unit(state.town);
  const out = { ok: true, kind, reels, bet, site, coins: 0, pays: [0, 0, 0], tokens: 0, treats: 0, wheel: 0, pack: null, pending: null, drops: {}, hot: null };
  let points = EVENT_POINTS.spin;
  const coinBoost = 1 + talent(state, 'reels');
  // what one symbol on the line pays this spin, in coins
  const symbolPay = (s) => {
    const k = siteOf(s);
    return (k >= 0 ? E.sitePay(state, k) : PAY[s] || 0) * u * bet * coinBoost;
  };

  switch (kind) {
    case 'mixed':
      out.pays = reels.map((s) => Math.round(symbolPay(s)));
      out.coins = out.pays[0] + out.pays[1] + out.pays[2];
      break;
    case 'rush':
      out.coins = symbolPay(sym) * RUSH.mult * E.rushBonus(state);
      state.stats.rushes++;
      points += EVENT_POINTS.rush;
      break;
    case 'coins3':
      out.coins = PAY.coins3 * u * bet * coinBoost;
      points += EVENT_POINTS.triple;
      break;
    case 'jackpot':
      out.coins = PAY.jackpot * u * bet * coinBoost;
      out.pack = 'silver';
      state.cards.packs.silver++;
      state.stats.jackpots++;
      points += EVENT_POINTS.jackpot;
      break;
    case 'wheel':
      out.wheel = bet;
      state.wheel.tickets += bet;
      points += EVENT_POINTS.triple;
      break;
    case 'tokens':
      out.tokens = PAY.tokens * bet;
      state.tokens += out.tokens;
      points += EVENT_POINTS.triple;
      break;
    case 'treats':
      out.treats = Math.round(PAY.treats * bet * (1 + talent(state, 'treats')));
      state.pet.treats += out.treats;
      points += EVENT_POINTS.triple;
      break;
    case 'bell':
      state.pending = { type: 'bell', bet, stash: E.nice(E.bellPrize(state) * u * bet), swings: [] };
      points += EVENT_POINTS.bell;
      break;
    default:
      break;
  }
  if (out.coins) {
    out.coins = Math.round(out.coins);
    earn(state, out.coins);
  }
  // a rush hour in progress runs down by one spin; a new one starts after this spin
  if (state.hot && --state.hot.left <= 0) state.hot = null;
  if (kind === 'rush') state.hot = { site, left: RUSH.hotSpins };
  out.hot = state.hot ? { ...state.hot } : null;
  // bits and pieces for the side games, once they are open
  if (!scripted) {
    for (const d of REEL_DROPS) {
      if (!E.unlocked(state, d.needs)) continue;
      for (const s of reels) {
        if (s === d.sym && rand() < d.chance) out.drops[d.item] = (out.drops[d.item] || 0) + d.n;
      }
    }
    grant(state, out.drops);
  }
  out.pending = state.pending;
  out.milestones = addEventPoints(state, points * bet, now);
  return out;
}

// What a swing of the mallet pays, as a share of that swing's slice of the prize.
export const bellShare = (power) => (power >= BELL.ringAt ? 1 : BELL.low + BELL.slope * power);

// One swing at the bell tower. `power` runs from 0 to 1 and comes from the
// player's timing; 0.85 or better sends the puck all the way up.
export function bellSwing(state, power) {
  const p = state.pending;
  if (!p || p.type !== 'bell' || p.swings.length >= BELL.shares.length) return null;
  const hit = Math.max(0, Math.min(1, Number(power) || 0));
  const rung = hit >= BELL.ringAt;
  const amount = E.nice(p.stash * BELL.shares[p.swings.length] * bellShare(hit));
  p.swings.push({ power: hit, amount });
  earn(state, amount);
  state.league.points += (LEAGUE_POINTS.swing + (rung ? LEAGUE_POINTS.ring : 0)) * p.bet;
  const done = p.swings.length >= BELL.shares.length;
  const out = { power: hit, rung, amount, done, total: 0, peal: false, bonus: 0 };
  if (done) {
    out.peal = p.swings.every((w) => w.power >= BELL.ringAt);
    if (out.peal) {
      out.bonus = E.nice(p.stash * BELL.peal);
      earn(state, out.bonus);
      state.stats.peals++;
      state.league.points += LEAGUE_POINTS.peal * p.bet;
    }
    out.total = p.swings.reduce((n, w) => n + w.amount, 0) + out.bonus;
    state.stats.bells++;
    state.pending = null;
  }
  return out;
}

// ---- building ---------------------------------------------------------------

// Buy the next star for a site.
export function upgradePlot(state, k) {
  const next = state.plots[k] && E.nextStar(state, k);
  if (!next || state.coins < next.cost) return null;
  const p = state.plots[k];
  state.coins -= next.cost;
  p.stage++;
  state.stats.upgrades++;
  return { kind: 'star', stage: p.stage, cap: p.cap, cost: next.cost, reward: UPGRADE_REWARDS[next.stage] ? grant(state, UPGRADE_REWARDS[next.stage]) : null, complete: E.townComplete(state) };
}

// Buy the next capacity step for a site (more seats, gates, spaces...).
export function upgradeCap(state, k) {
  const next = state.plots[k] && E.nextCap(state, k);
  if (!next || !next.open || state.coins < next.cost) return null;
  const p = state.plots[k];
  state.coins -= next.cost;
  p.cap++;
  state.stats.upgrades++;
  return { kind: 'cap', stage: p.stage, cap: p.cap, cost: next.cost, reward: null, complete: E.townComplete(state) };
}

// Open the next chest on the park's progress bar.
export function claimParkChest(state) {
  if (E.parkChestsDue(state) < 1) return null;
  const index = state.parkChests++;
  return { index, reward: grant(state, PARK_CHESTS[index]) };
}

// Collect anything owed for levels reached since the last look.
export function levelUps(state) {
  const out = [];
  const now = E.level(state);
  while (state.level < now) {
    state.level++;
    out.push({ level: state.level, reward: grant(state, levelReward(state.level)), unlocks: UNLOCKS.filter((u) => u.level === state.level) });
  }
  return out;
}

// One turn of the prize wheel.
export function wheelSpin(state, rand) {
  if (state.wheel.tickets < 1) return null;
  state.wheel.tickets--;
  state.wheel.spun++;
  state.stats.wheels++;
  const index = weighted(rand, WHEEL.map((wedge, i) => [i, wedge.w]));
  state.league.points += LEAGUE_POINTS.wheel;
  const prize = { ...WHEEL[index].reward };
  if (prize.coins) prize.coins = Math.round(prize.coins * (1 + talent(state, 'wheel')));
  return { index, reward: grant(state, prize) };
}

// Leave a finished park for the next one. The old park goes on earning.
export function travel(state) {
  if (!E.townComplete(state)) return null;
  const reward = grant(state, TOWN_REWARD);
  state.town++;
  state.stats.towns++;
  state.parkChests = 0;
  state.hot = null;
  for (const p of state.plots) {
    p.stage = 0;
    p.cap = 0;
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
    stars = Math.round((card.gold ? 10 : card.stars) * (1 + talent(state, 'stars')));
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
  // the set's creatures move into the park, to the same site in every park
  const moved = state.cards.homes[s] < HOMES.max;
  if (moved) state.cards.homes[s]++;
  const reward = grant(state, { tokens: Math.round(CARD_SETS[s].reward * seasonMult(state)), coins: 20 * (s + 1) });
  reward.home = moved ? { site: homeSite(s), level: state.cards.homes[s] } : null;
  return reward;
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

// ---- the league table ---------------------------------------------------------

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
  const rows = RIVALS.map((r, i) => ({ name: r.name, id: i, face: r.face, you: false, points: rivalScore(state, cycle, i, hours) }));
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
// "Owned" means it cannot be bought again right now: one-off products once
// bought, the daily bundle until tomorrow, the pass for the rest of its season.
export function productOwned(state, id, now = 0) {
  const p = productById(id);
  if (!p) return false;
  if (p.daily) return state.shop.dailyDay === dayNumber(now);
  if (p.pass) return state.pass.premium;
  return !!state.shop.owned[id];
}

// Hand over what a completed purchase paid for. Taking the money is the
// payment provider's job; this only runs once that has succeeded.
export function applyPurchase(state, id, now = 0) {
  const product = productById(id);
  if (!product || productOwned(state, id, now)) return null;
  const reward = grant(state, product.grant || {});
  if (product.once) state.shop.owned[id] = true;
  if (product.daily) state.shop.dailyDay = dayNumber(now);
  if (product.noAds) state.shop.noAds = true;
  if (product.pass) state.pass.premium = true;
  state.shop.bought++;
  state.shop.stamps = Math.min(3, (state.shop.stamps || 0) + 1);
  return reward;
}

// Every purchase stamps the card; three stamps pay out and the card starts again.
export const STAMP_REWARD = { tokens: 75, pack: 'gold' };
export function claimStamps(state) {
  if (!(state.shop.stamps >= 3)) return null;
  state.shop.stamps = 0;
  return grant(state, STAMP_REWARD);
}

// Rewarded adverts: each placement has its own daily allowance.
function adDay(state, now) {
  const day = dayNumber(now);
  if (state.ads.day !== day) state.ads = { day, counts: {} };
  return state.ads;
}
export function adLeft(state, id, now) {
  const def = ADS[id];
  if (!def || (def.needs && !E.unlocked(state, def.needs))) return 0;
  const used = state.ads.day === dayNumber(now) ? state.ads.counts[id] || 0 : 0;
  return Math.max(0, def.perDay - used);
}
// Call only once the advert has been watched to the end.
export function claimAd(state, id, now) {
  if (adLeft(state, id, now) <= 0) return null;
  const ads = adDay(state, now);
  ads.counts[id] = (ads.counts[id] || 0) + 1;
  state.stats.ads++;
  const def = ADS[id];
  if (def.boost) {
    state.boost = Math.max(state.boost, 0) + def.boost * 60;
    return { boost: def.boost };
  }
  return grant(state, def.reward);
}
export const adTokensLeft = (state, now) => adLeft(state, 'tokens', now);
export const claimAdTokens = (state, now) => claimAd(state, 'tokens', now);

// ---- time passing -----------------------------------------------------------

// Everything driven by the wall clock: spins trickle in and the event and the
// league roll over. The side games keep their own clocks (see game.js).
export function tick(state, now) {
  const tokens = regenTokens(state, now);
  eventInfo(state, now);
  const league = leagueInfo(state, now).settled;
  return { tokens, league };
}

// Things in ITEMS that a reward handed over, as [id, amount] pairs.
export const itemsIn = (reward) => Object.keys(ITEMS).filter((id) => reward && reward[id] > 0).map((id) => [id, reward[id]]);
export { CAP_STEPS, STAGES };
