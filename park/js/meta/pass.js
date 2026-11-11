// The Park Pass: a season of prizes. Pass points (from missions, the daily
// gift and levelling up) climb a ladder of tiers; every tier has a free prize
// and a premium one, and the premium row opens with a purchase.
import { HOUR, grant, int, period, periodEnd } from '../core.js';

export const PASS = {
  days: 28,
  tiers: 30,
  perTier: 60, // pass points to climb a tier
  free: (t) => [{ tokens: 10 }, { coins: 30 }, { energy: 15 }, { tokens: 15 }, { pearls: 2 }, { pack: 'silver' }][t % 6],
  paid: (t) => [{ tokens: 40 }, { coins: 150 }, { gems: 40 }, { tokens: 60, keys: 2 }, { pearls: 6, shots: 6 }, { pack: 'gold', tokens: 30 }][t % 6],
  finale: { tokens: 300, packs: { gold: 3 }, gems: 200 }, // the premium prize on the last tier
};
const HOURS = PASS.days * 24;

export const freshPass = () => ({ season: -1, points: 0, free: 0, paid: 0, premium: false });

export function cleanPass(raw) {
  const p = freshPass();
  if (!raw || typeof raw !== 'object') return p;
  p.season = Number.isInteger(raw.season) ? raw.season : -1;
  p.points = int(raw.points);
  p.free = Math.min(int(raw.free), PASS.tiers);
  p.paid = Math.min(int(raw.paid), PASS.tiers);
  p.premium = !!raw.premium;
  return p;
}

export function passTick(state, now) {
  const season = period(now, HOURS);
  if (state.pass.season !== season) state.pass = { ...freshPass(), season };
}

export const passTier = (state) => Math.min(PASS.tiers, Math.floor(state.pass.points / PASS.perTier));
export const paidPrize = (t) => (t === PASS.tiers - 1 ? PASS.finale : PASS.paid(t));

export function passInfo(state, now) {
  passTick(state, now);
  const p = state.pass;
  const tier = passTier(state);
  const ready = Math.max(0, tier - p.free) + (p.premium ? Math.max(0, tier - p.paid) : 0);
  return { tier, into: tier >= PASS.tiers ? PASS.perTier : p.points % PASS.perTier, per: PASS.perTier, ready, endsAt: periodEnd(now, HOURS), premium: p.premium, free: p.free, paid: p.paid, season: p.season, name: SEASONS[((p.season % SEASONS.length) + SEASONS.length) % SEASONS.length] };
}
const SEASONS = ['Summer Splash', 'Lantern Nights', 'Harvest Fair', 'Frost Festival'];

// Collect every prize that has been reached and not yet taken.
export function claimPass(state, now) {
  passTick(state, now);
  const p = state.pass;
  const tier = passTier(state);
  const got = [];
  while (p.free < tier) got.push(grant(state, PASS.free(p.free++)));
  if (p.premium) while (p.paid < tier) got.push(grant(state, paidPrize(p.paid++)));
  return got.length ? got : null;
}
export const PASS_HOURS = HOURS * HOUR;
