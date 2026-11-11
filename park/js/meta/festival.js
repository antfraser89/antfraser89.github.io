// The festival: a week-long theme that ties the side games together. Gems
// turn up as prizes all over the game; here they buy decorations for the
// pier. Four decorations, four sizes each: sixteen purchases, with a prize
// every fourth and a grand prize for the lot.
import { HOUR, grant, int, period, periodEnd } from '../core.js';

export const FESTIVAL = {
  days: 7,
  themes: ['Tide Fair', 'Lantern Week', 'Shell Jamboree', 'Pier Party'],
  items: [
    { id: 'globe', name: 'Sailboat Snow Globe', art: 'decor-globe', cost: [30, 60, 100, 160] },
    { id: 'helmet', name: 'Diving Helmet', art: 'decor-helmet', cost: [40, 80, 130, 200] },
    { id: 'chest', name: 'Treasure Chest', art: 'decor-chest', cost: [60, 110, 180, 260] },
    { id: 'harp', name: 'Coral Harp', art: 'decor-harp', cost: [60, 110, 180, 260] },
  ],
  // once the pier is fully dressed, spare gems can still be traded in
  trade: { cost: 200, reward: { pack: 'silver', tokens: 10, energy: 10 } },
  prizes: [
    { at: 4, reward: { tokens: 30, coins: 60 } },
    { at: 8, reward: { tokens: 50, pack: 'silver', energy: 30 } },
    { at: 12, reward: { tokens: 80, pack: 'gold', pearls: 5 } },
    { at: 16, reward: { tokens: 200, packs: { gold: 2 }, keys: 5 } },
  ],
};
const HOURS = FESTIVAL.days * 24;
const fresh = (week) => ({ week, levels: FESTIVAL.items.map(() => 0), claimed: 0 });

export const freshFestival = () => fresh(-1);

export function cleanFestival(raw) {
  const f = fresh(-1);
  if (!raw || typeof raw !== 'object') return f;
  f.week = Number.isInteger(raw.week) ? raw.week : -1;
  if (Array.isArray(raw.levels)) f.levels = f.levels.map((_, i) => Math.min(int(raw.levels[i]), 4));
  f.claimed = Math.min(int(raw.claimed), FESTIVAL.prizes.length);
  return f;
}

export function festivalTick(state, now) {
  const week = period(now, HOURS);
  if (state.festival.week !== week) state.festival = fresh(week);
}

export function festivalInfo(state, now) {
  festivalTick(state, now);
  const f = state.festival;
  const bought = f.levels.reduce((a, b) => a + b, 0);
  const next = FESTIVAL.prizes[f.claimed] || null;
  return { name: FESTIVAL.themes[((f.week % 4) + 4) % 4], endsAt: periodEnd(now, HOURS), bought, total: 16, next, ready: !!next && bought >= next.at, levels: f.levels.slice(), claimed: f.claimed };
}

export function buyDecor(state, i, now) {
  festivalTick(state, now);
  const f = state.festival;
  const item = FESTIVAL.items[i];
  if (!item || f.levels[i] >= 4) return null;
  const cost = item.cost[f.levels[i]];
  if (state.inv.gems < cost) return null;
  state.inv.gems -= cost;
  f.levels[i]++;
  state.stats.decor++;
  return { item, level: f.levels[i], cost };
}

export function claimFestival(state, now) {
  const info = festivalInfo(state, now);
  if (!info.ready) return null;
  state.festival.claimed++;
  return grant(state, info.next.reward);
}
// Swap spare gems for a small parcel, as often as you like.
export function tradeGems(state) {
  if (state.inv.gems < FESTIVAL.trade.cost) return null;
  state.inv.gems -= FESTIVAL.trade.cost;
  return grant(state, FESTIVAL.trade.reward);
}
export const FESTIVAL_MS = HOURS * HOUR;
