// Park Pals: your club. There is no server behind this version, so the other
// members are run by the game: they ask for things, send things, and chip in
// to the team build. Everything they do is worked out from the clock and the
// save's seed, so it looks the same each time you look.
import { CARDS, RIVALS } from '../config.js';
import { HOUR, grant, hash, int, num, period, periodEnd } from '../core.js';

export const CLUB = {
  name: 'Park Pals',
  // helping a pal
  feedHours: 2, // a fresh batch of requests this often
  feedSize: 4,
  spinGift: 5, // spins it costs to answer a call for spins
  helpReward: { coins: 15, gems: 3 },
  // asking for help
  spinsEvery: 4, // hours between your own calls for spins
  spinsWait: 20, // minutes until the pals have answered
  spinsGot: 15,
  cardEvery: 8,
  cardWait: 30,
  // the team build
  teamHours: 72,
  projects: [
    { id: 'fountain', name: 'Park Fountain' }, { id: 'carousel', name: 'Carousel' }, { id: 'snacks', name: 'Snack Stand' },
    { id: 'arch', name: 'Garden Arch' }, { id: 'stage', name: 'Music Stage' },
  ],
  projectGoal: 400, // team points to finish one project
  jobs: [
    { stat: 'upgrades', n: 12, pts: 120, text: (n) => `Buy ${n} upgrades` },
    { stat: 'spins', n: 60, pts: 100, text: (n) => `Spin ${n} times` },
    { stat: 'cards', n: 8, pts: 80, text: (n) => `Collect ${n} cards` },
    { stat: 'wheels', n: 5, pts: 60, text: (n) => `Take ${n} turns on the wheel` },
    { stat: 'raids', n: 4, pts: 100, text: (n) => `Go on ${n} pearl dives` },
    { stat: 'helps', n: 3, pts: 70, text: (n) => `Help ${n} pals` },
  ],
  teamReward: { tokens: 120, coins: 250, packs: { gold: 1 }, gems: 60 },
  stepReward: { tokens: 20, coins: 40 }, // each finished project
};
const TEAM_GOAL = CLUB.projectGoal * CLUB.projects.length;

export const freshClub = () => ({
  helped: { block: -1, ids: [] },
  spins: { at: 0, due: false },
  card: { at: 0, id: null },
  team: { cycle: -1, base: Object.fromEntries(CLUB.jobs.map((j) => [j.stat, 0])), jobs: CLUB.jobs.map(() => false), steps: 0, done: false },
});

export function cleanClub(raw) {
  const c = freshClub();
  if (!raw || typeof raw !== 'object') return c;
  if (raw.helped) c.helped = { block: Number.isInteger(raw.helped.block) ? raw.helped.block : -1, ids: Array.isArray(raw.helped.ids) ? raw.helped.ids.map((v) => int(v)).slice(0, 12) : [] };
  if (raw.spins) c.spins = { at: num(raw.spins.at), due: !!raw.spins.due };
  if (raw.card) c.card = { at: num(raw.card.at), id: typeof raw.card.id === 'string' && CARDS.some((x) => x.id === raw.card.id) ? raw.card.id : null };
  const t = raw.team;
  if (t && typeof t === 'object') {
    c.team.cycle = Number.isInteger(t.cycle) ? t.cycle : -1;
    if (t.base && typeof t.base === 'object') for (const j of CLUB.jobs) c.team.base[j.stat] = int(t.base[j.stat]);
    c.team.jobs = CLUB.jobs.map((_, i) => !!(Array.isArray(t.jobs) && t.jobs[i]));
    c.team.steps = Math.min(int(t.steps), CLUB.projects.length);
    c.team.done = !!t.done;
  }
  return c;
}

export const members = () => RIVALS;

// ---- helping ------------------------------------------------------------------

// The requests on the board right now. A pal either wants spins or a card.
export function requests(state, now) {
  const block = period(now, CLUB.feedHours);
  if (state.club.helped.block !== block) state.club.helped = { block, ids: [] };
  const out = [];
  for (let i = 0; i < CLUB.feedSize; i++) {
    const who = Math.floor(hash(state.seed % 9973, block, i) * RIVALS.length);
    const wantsCard = hash(state.seed % 7919, block, i + 0.5) < 0.5;
    const pool = CARDS.filter((c) => !c.gold && c.set <= Math.min(state.town, 8));
    const card = wantsCard ? pool[Math.floor(hash(state.seed % 6007, block, i + 0.25) * pool.length)] : null;
    const ago = Math.floor(hash(state.seed % 5003, block, i) * 50) + 2;
    out.push({ id: i, who: RIVALS[who], card, ago, helped: state.club.helped.ids.includes(i), can: card ? (state.cards.owned[card.id] || 0) >= 2 : state.tokens >= CLUB.spinGift });
  }
  return out;
}

// Answer a pal's request: a spare card, or a few spins.
export function help(state, id, now) {
  const req = requests(state, now).find((r) => r.id === id);
  if (!req || req.helped || !req.can) return null;
  if (req.card) state.cards.owned[req.card.id]--;
  else state.tokens -= CLUB.spinGift;
  state.club.helped.ids.push(id);
  state.stats.helps++;
  return { req, reward: grant(state, CLUB.helpReward) };
}

// ---- asking -------------------------------------------------------------------

export function spinsStatus(state, now) {
  const s = state.club.spins;
  const waitMs = CLUB.spinsWait * 60e3;
  if (s.due) return now >= s.at + waitMs ? { state: 'ready' } : { state: 'waiting', in: (s.at + waitMs - now) / 1000 };
  const next = s.at + CLUB.spinsEvery * HOUR;
  return now >= next || !(s.at > 0) ? { state: 'can' } : { state: 'cooldown', in: (next - now) / 1000 };
}
export function askSpins(state, now) {
  if (spinsStatus(state, now).state !== 'can') return false;
  state.club.spins = { at: now, due: true };
  return true;
}
export function collectSpins(state, now) {
  if (spinsStatus(state, now).state !== 'ready') return null;
  state.club.spins.due = false;
  return grant(state, { tokens: CLUB.spinsGot });
}

export function cardStatus(state, now) {
  const c = state.club.card;
  const waitMs = CLUB.cardWait * 60e3;
  if (c.id) return now >= c.at + waitMs ? { state: 'ready', id: c.id } : { state: 'waiting', id: c.id, in: (c.at + waitMs - now) / 1000 };
  const next = c.at + CLUB.cardEvery * HOUR;
  return now >= next || !(c.at > 0) ? { state: 'can' } : { state: 'cooldown', in: (next - now) / 1000 };
}
// Ask for one card you do not have. Gold cards cannot be asked for.
export function askCard(state, id, now) {
  const card = CARDS.find((c) => c.id === id);
  if (!card || card.gold || (state.cards.owned[id] || 0) > 0 || cardStatus(state, now).state !== 'can') return false;
  state.club.card = { at: now, id };
  return true;
}
export function collectCard(state, now) {
  const st = cardStatus(state, now);
  if (st.state !== 'ready') return null;
  state.club.card.id = null;
  state.cards.owned[st.id] = (state.cards.owned[st.id] || 0) + 1;
  state.stats.cards++;
  return { id: st.id };
}

// ---- the team build -------------------------------------------------------------

function teamRoll(state, now) {
  const cycle = period(now, CLUB.teamHours);
  const t = state.club.team;
  if (t.cycle !== cycle) {
    state.club.team = { cycle, base: Object.fromEntries(CLUB.jobs.map((j) => [j.stat, state.stats[j.stat] || 0])), jobs: CLUB.jobs.map(() => false), steps: 0, done: false };
  }
  return state.club.team;
}

// What the pals have put in so far: steady through the event, different each time.
function palPoints(state, cycle, now) {
  const start = cycle * CLUB.teamHours * HOUR;
  const frac = Math.min(1, Math.max(0, (now - start) / (CLUB.teamHours * HOUR)));
  return RIVALS.slice(0, 7).map((r, i) => ({ who: r, points: Math.floor(TEAM_GOAL * 0.62 * frac * (0.06 + hash(state.seed % 9973, cycle, i) * 0.18)) }));
}

export function teamInfo(state, now) {
  const t = teamRoll(state, now);
  const jobs = CLUB.jobs.map((j, i) => {
    const cur = Math.max(0, Math.min(j.n, (state.stats[j.stat] || 0) - (t.base[j.stat] || 0)));
    return { i, text: j.text(j.n), cur, target: j.n, pts: j.pts, done: cur >= j.n, claimed: t.jobs[i] };
  });
  const mine = jobs.filter((j) => j.claimed).reduce((n, j) => n + j.pts, 0);
  const pals = palPoints(state, t.cycle, now);
  const total = Math.min(TEAM_GOAL, mine + pals.reduce((n, p) => n + p.points, 0));
  const built = Math.floor(total / CLUB.projectGoal);
  const projects = CLUB.projects.map((p, i) => ({ ...p, points: Math.max(0, Math.min(CLUB.projectGoal, total - i * CLUB.projectGoal)), goal: CLUB.projectGoal, done: i < built }));
  const table = [{ you: true, name: 'You', points: mine }, ...pals.map((p) => ({ you: false, name: p.who.name, face: p.who.face, points: p.points }))].sort((a, b) => b.points - a.points);
  return { jobs, mine, total, goal: TEAM_GOAL, projects, built, steps: t.steps, stepsReady: built - t.steps, done: t.done, canFinish: total >= TEAM_GOAL && !t.done, endsAt: periodEnd(now, CLUB.teamHours), table, ready: jobs.filter((j) => j.done && !j.claimed).length + Math.max(0, built - t.steps) + (total >= TEAM_GOAL && !t.done ? 1 : 0) };
}

export function claimJob(state, i, now) {
  const info = teamInfo(state, now);
  const j = info.jobs[i];
  if (!j || !j.done || j.claimed) return null;
  state.club.team.jobs[i] = true;
  return { pts: j.pts };
}
// A prize for each project the team has finished.
export function claimProject(state, now) {
  const info = teamInfo(state, now);
  if (info.stepsReady < 1) return null;
  state.club.team.steps++;
  return grant(state, CLUB.stepReward);
}
export function claimTeam(state, now) {
  const info = teamInfo(state, now);
  if (!info.canFinish) return null;
  state.club.team.done = true;
  return grant(state, CLUB.teamReward);
}
