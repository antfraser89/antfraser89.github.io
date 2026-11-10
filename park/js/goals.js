// Missions: one always-on objective that teaches the game, then keeps paying.
import { townInfo } from './config.js';
import { cardsOwned } from './rules.js';

const stat = (key, target, reward, text, go) => ({ text, target, reward, go, cur: (s) => s.stats[key] });
const maxStage = (s) => Math.max(...s.plots.map((p) => p.stage));

export const MISSIONS = [
  stat('spins', 3, { tokens: 5 }, 'Spin the machine 3 times', 'spin'),
  { text: 'Build your first attraction', target: 1, reward: { tokens: 5 }, go: 'build', cur: (s) => Math.min(1, s.stats.upgrades) },
  { text: 'Upgrade an attraction to two stars', target: 2, reward: { pack: 'bronze' }, go: 'build', cur: (s) => Math.max(maxStage(s), s.stats.towns ? 2 : 0) },
  stat('packs', 1, { tokens: 10 }, 'Open a card pack', 'cards'),
  stat('attacks', 1, { tokens: 10 }, 'Splat a rival park with a pie', 'spin'),
  stat('raids', 1, { tokens: 10 }, "Rummage through a rival's lucky dip", 'spin'),
  { text: 'Take an attraction to five stars', target: 5, reward: { pack: 'silver' }, go: 'build', cur: (s) => Math.max(maxStage(s), s.stats.towns ? 5 : 0) },
  stat('fed', 6, { tokens: 10 }, 'Feed Chips 6 treats', 'pet'),
  { text: 'Collect 8 different cards', target: 8, reward: { tokens: 15 }, go: 'cards', cur: (s) => Math.max(cardsOwned(s), s.cards.season > 1 ? 8 : 0) },
  { text: `Finish your park in ${townInfo(0).name}`, target: 1, reward: { tokens: 25 }, go: 'build', cur: (s) => Math.min(1, s.stats.towns) },
  stat('spins', 100, { tokens: 20 }, 'Spin the machine 100 times', 'spin'),
  stat('sets', 1, { pack: 'gold' }, 'Complete a card set', 'cards'),
  stat('attacks', 10, { tokens: 20 }, 'Splat 10 rival parks', 'spin'),
  { text: `Open in ${townInfo(2).name}`, target: 2, reward: { tokens: 30 }, go: 'build', cur: (s) => s.stats.towns },
  { text: 'Raise Chips to level 3', target: 3, reward: { tokens: 20 }, go: 'pet', cur: (s) => s.pet.level },
  stat('raids', 5, { tokens: 20 }, 'Win 5 lucky dips', 'spin'),
  { text: 'Collect 25 different cards', target: 25, reward: { pack: 'silver' }, go: 'cards', cur: (s) => Math.max(cardsOwned(s), s.cards.season > 1 ? 25 : 0) },
  { text: `Open in ${townInfo(4).name}`, target: 4, reward: { pack: 'gold' }, go: 'build', cur: (s) => s.stats.towns },
  stat('sets', 3, { tokens: 60 }, 'Complete 3 card sets', 'cards'),
  stat('spins', 1000, { tokens: 50 }, 'Spin the machine 1,000 times', 'spin'),
];

// After the scripted list, missions are generated from the stats at the moment
// the last one was claimed, and stored in the save.
const ENDLESS = [
  { type: 'spins', step: 150, reward: { tokens: 25 }, text: (n) => `Spin the machine ${n} more times`, go: 'spin' },
  { type: 'attacks', step: 10, reward: { tokens: 25 }, text: (n) => `Splat ${n} more rival parks`, go: 'spin' },
  { type: 'upgrades', step: 20, reward: { pack: 'silver' }, text: (n) => `Make ${n} more upgrades`, go: 'build' },
  { type: 'raids', step: 6, reward: { tokens: 25 }, text: (n) => `Win ${n} more lucky dips`, go: 'spin' },
  { type: 'towns', step: 1, reward: { pack: 'gold' }, text: () => 'Finish another park', go: 'build' },
  { type: 'cards', step: 30, reward: { tokens: 30 }, text: (n) => `Collect ${n} more cards`, go: 'cards' },
];

function generate(state, index) {
  const def = ENDLESS[index % ENDLESS.length];
  return { type: def.type, target: def.step, base: state.stats[def.type] || 0 };
}

export function currentMission(state) {
  let def;
  if (state.mission.index < MISSIONS.length) {
    def = MISSIONS[state.mission.index];
  } else {
    if (!state.mission.extra || !ENDLESS.some((e) => e.type === state.mission.extra.type)) {
      state.mission.extra = generate(state, state.mission.index);
    }
    const e = state.mission.extra;
    const proto = ENDLESS.find((x) => x.type === e.type);
    def = { text: proto.text(e.target), target: e.target, reward: proto.reward, go: proto.go, cur: (s) => (s.stats[e.type] || 0) - e.base };
  }
  const cur = Math.max(0, Math.min(def.cur(state), def.target));
  return { text: def.text, cur, target: def.target, reward: def.reward, go: def.go || 'spin', done: cur >= def.target };
}

export function advanceMission(state) {
  state.mission.index++;
  state.mission.extra = state.mission.index >= MISSIONS.length ? generate(state, state.mission.index) : null;
}
