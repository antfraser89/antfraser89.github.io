// Missions: six fresh jobs a day and four bigger ones a week. Each one counts
// something the game already keeps a tally of, from the moment it was set.
// Finished missions pay a prize and mission points; the points fill a row of
// chests and also count towards the Park Pass.
import { dayNumber, grant, hash, int } from '../core.js';
import * as E from '../economy.js';

// stat: the tally it reads. n: [daily target, weekly target] at level one.
const KINDS = [
  { stat: 'spins', n: [20, 300], text: (n) => `Spin the machine ${n} times`, go: 'spin' },
  { stat: 'upgrades', n: [5, 60], text: (n) => `Buy ${n} upgrades in the park`, go: 'build' },
  { stat: 'wheels', n: [2, 15], text: (n) => `Take ${n} turns on the prize wheel`, go: 'wheel' },
  { stat: 'bells', n: [1, 10], text: (n) => `Have ${n} ${n === 1 ? 'go' : 'goes'} at Ring the Bell`, go: 'spin' },
  { stat: 'packs', n: [2, 15], text: (n) => `Open ${n} card packs`, go: 'cards', needs: 'cards' },
  { stat: 'fed', n: [6, 60], text: (n) => `Feed your pet ${n} cherries`, go: 'pet' },
  { stat: 'draws', n: [3, 30], text: (n) => `Burst ${n} Prize Draw bubbles`, go: 'draw', needs: 'draw' },
  { stat: 'merges', n: [15, 200], text: (n) => `Merge shells ${n} times`, go: 'merge', needs: 'merge' },
  { stat: 'shots', n: [4, 30], text: (n) => `Fire the cannon ${n} times`, go: 'trail', needs: 'trail' },
  { stat: 'steps', n: [1, 8], text: (n) => `Clear ${n} ${n === 1 ? 'flag' : 'flags'} on the Expedition`, go: 'trail', needs: 'trail' },
  { stat: 'chests', n: [2, 18], text: (n) => `Open ${n} Lucky Chests`, go: 'chests', needs: 'chests' },
  { stat: 'ads', n: [1, 8], text: (n) => `Watch ${n} ${n === 1 ? 'advert' : 'adverts'} for a prize`, go: 'free' },
  { stat: 'helps', n: [2, 15], text: (n) => `Help your Park Pals ${n} times`, go: 'club', needs: 'club' },
];
const KIND = Object.fromEntries(KINDS.map((k) => [k.stat, k]));

export const MISSIONS = {
  daily: 6,
  weekly: 4,
  points: [10, 30], // mission points for a daily and a weekly mission
  reward: (state, weekly) => (weekly ? { tokens: 20, coins: 60, gems: 20 } : { tokens: 3 + Math.floor(Math.min(E.level(state), 30) / 10), coins: 12 }),
  // the row of chests: mission points needed, and what is inside
  chests: [
    { at: 20, reward: { tokens: 6, coins: 20 } },
    { at: 40, reward: { tokens: 10, energy: 10, pearls: 1 } },
    { at: 60, reward: { tokens: 15, pack: 'silver', keys: 1 } },
    { at: 120, reward: { tokens: 30, pack: 'gold', gems: 30 } },
  ],
};

function pick(state, slot, salt, weekly) {
  const open = KINDS.filter((k) => !k.needs || E.unlocked(state, k.needs));
  const taken = new Set();
  const list = [];
  const count = weekly ? MISSIONS.weekly : MISSIONS.daily;
  for (let i = 0; list.length < count && i < 60; i++) {
    const k = open[Math.floor(hash(state.seed % 9973, slot + salt, i) * open.length)];
    if (taken.has(k.stat)) continue;
    taken.add(k.stat);
    const scale = 1 + Math.min(E.level(state), 40) * 0.04;
    const target = Math.max(1, Math.round(k.n[weekly ? 1 : 0] * scale));
    list.push({ stat: k.stat, target, base: state.stats[k.stat] || 0, claimed: false });
  }
  return list;
}

export const freshMissions = () => ({ day: -1, week: -1, daily: [], weekly: [], points: 0, chests: 0 });

export function cleanMissions(raw) {
  const m = freshMissions();
  if (!raw || typeof raw !== 'object') return m;
  const list = (v, max) => (Array.isArray(v) ? v.slice(0, max).filter((x) => x && KIND[x.stat]).map((x) => ({ stat: x.stat, target: Math.max(1, int(x.target, 1)), base: int(x.base), claimed: !!x.claimed })) : []);
  m.day = Number.isInteger(raw.day) ? raw.day : -1;
  m.week = Number.isInteger(raw.week) ? raw.week : -1;
  m.daily = list(raw.daily, MISSIONS.daily);
  m.weekly = list(raw.weekly, MISSIONS.weekly);
  m.points = int(raw.points);
  m.chests = Math.min(int(raw.chests), MISSIONS.chests.length);
  return m;
}

// Roll the lists over when the day or the week changes.
export function missionsTick(state, now) {
  const m = state.missions;
  const day = dayNumber(now);
  const week = Math.floor((day + 3) / 7); // weeks turn over on a Monday
  if (m.week !== week || !m.weekly.length) {
    m.week = week;
    m.weekly = pick(state, week, 0.5, true);
    m.points = 0;
    m.chests = 0;
  }
  if (m.day !== day || !m.daily.length) {
    m.day = day;
    m.daily = pick(state, day, 0, false);
  }
}

const view = (state, x, weekly, i) => {
  const cur = Math.max(0, Math.min(x.target, (state.stats[x.stat] || 0) - x.base));
  return { i, weekly, stat: x.stat, text: KIND[x.stat].text(x.target), go: KIND[x.stat].go, cur, target: x.target, done: cur >= x.target, claimed: x.claimed, reward: MISSIONS.reward(state, weekly), points: MISSIONS.points[weekly ? 1 : 0] };
};

export function missionsInfo(state, now) {
  missionsTick(state, now);
  const m = state.missions;
  const daily = m.daily.map((x, i) => view(state, x, false, i));
  const weekly = m.weekly.map((x, i) => view(state, x, true, i));
  const ready = [...daily, ...weekly].filter((x) => x.done && !x.claimed).length;
  const chests = MISSIONS.chests.map((c, i) => ({ ...c, i, open: i < m.chests, ready: i === m.chests && m.points >= c.at }));
  return { daily, weekly, points: m.points, chests, ready: ready + chests.filter((c) => c.ready).length, dayEnds: (dayNumber(now) + 1) * 864e5 + new Date(now).getTimezoneOffset() * 60e3 };
}

export function claimMission(state, weekly, i, now) {
  missionsTick(state, now);
  const x = (weekly ? state.missions.weekly : state.missions.daily)[i];
  if (!x || x.claimed || (state.stats[x.stat] || 0) - x.base < x.target) return null;
  x.claimed = true;
  const points = MISSIONS.points[weekly ? 1 : 0];
  state.missions.points += points;
  state.stats.missions++;
  return grant(state, { ...MISSIONS.reward(state, weekly), points });
}

export function claimMissionChest(state) {
  const m = state.missions;
  const c = MISSIONS.chests[m.chests];
  if (!c || m.points < c.at) return null;
  m.chests++;
  return grant(state, c.reward);
}
