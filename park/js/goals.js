// Missions: one always-on objective that teaches the game, then keeps paying.
import { townInfo } from './config.js';
import { PETS } from './pets.js';
import { cardsOwned } from './rules.js';

const stat = (key, target, reward, text, go) => ({ text, target, reward, go, cur: (s) => s.stats[key] });
const maxStage = (s) => Math.max(...s.plots.map((p) => p.stage));

export const MISSIONS = [
  stat('spins', 3, { tokens: 5 }, 'Spin the machine 3 times', 'spin'),
  { text: 'Build your first ride', target: 1, reward: { tokens: 5 }, go: 'build', cur: (s) => Math.min(1, s.stats.upgrades) },
  { text: 'Take anything in the park to level 20', target: 2, reward: { pack: 'bronze' }, go: 'build', cur: (s) => Math.max(maxStage(s), s.stats.towns ? 2 : 0) },
  stat('packs', 1, { tokens: 10 }, 'Open a card pack', 'cards'),
  { text: 'Take a turn on the prize wheel', target: 1, reward: { tokens: 10 }, go: 'wheel', cur: (s) => s.stats.wheels },
  stat('bells', 1, { tokens: 10 }, 'Have a go at Ring the Bell', 'spin'),
  { text: 'Take anything in the park to level 50', target: 5, reward: { pack: 'silver' }, go: 'build', cur: (s) => Math.max(maxStage(s), s.stats.towns ? 5 : 0) },
  stat('fed', 6, { tokens: 10 }, `Feed ${PETS[0].name} 6 cherries`, 'pet'),
  { text: 'Collect 8 different cards', target: 8, reward: { tokens: 15 }, go: 'cards', cur: (s) => Math.max(cardsOwned(s), s.cards.season > 1 ? 8 : 0) },
  { text: 'Take anything in the park to level 100', target: 10, reward: { tokens: 15 }, go: 'build', cur: (s) => Math.max(maxStage(s), s.stats.towns ? 10 : 0) },
  { text: `Finish ${townInfo(0).name}`, target: 1, reward: { tokens: 25 }, go: 'build', cur: (s) => Math.min(1, s.stats.towns) },
  stat('spins', 100, { tokens: 20 }, 'Spin the machine 100 times', 'spin'),
  stat('sets', 1, { pack: 'gold' }, 'Complete a card set', 'cards'),
  { text: 'Spin the prize wheel 10 times', target: 10, reward: { tokens: 20 }, go: 'wheel', cur: (s) => s.stats.wheels },
  { text: `Open ${townInfo(2).name}`, target: 2, reward: { tokens: 30 }, go: 'build', cur: (s) => s.stats.towns },
  { text: 'Raise your pet to level 3', target: 3, reward: { tokens: 20 }, go: 'pet', cur: (s) => s.pet.level },
  stat('rushes', 5, { tokens: 20 }, 'Set off 5 rush hours', 'spin'),
  { text: 'Collect 25 different cards', target: 25, reward: { pack: 'silver' }, go: 'cards', cur: (s) => Math.max(cardsOwned(s), s.cards.season > 1 ? 25 : 0) },
  { text: `Open ${townInfo(4).name}`, target: 4, reward: { pack: 'gold' }, go: 'build', cur: (s) => s.stats.towns },
  stat('sets', 3, { tokens: 60 }, 'Complete 3 card sets', 'cards'),
  stat('spins', 1000, { tokens: 50 }, 'Spin the machine 1,000 times', 'spin'),
];

// After the scripted list, missions are generated from the stats at the moment
// the last one was claimed, and stored in the save.
const ENDLESS = [
  { type: 'spins', step: 150, reward: { tokens: 25 }, text: (n) => `Spin the machine ${n} more times`, go: 'spin' },
  { type: 'upgrades', step: 20, reward: { pack: 'silver' }, text: (n) => `Make ${n} more upgrades`, go: 'build' },
  { type: 'bells', step: 6, reward: { tokens: 25 }, text: (n) => `Have ${n} more goes at Ring the Bell`, go: 'spin' },
  { type: 'rushes', step: 8, reward: { tokens: 25 }, text: (n) => `Set off ${n} more rush hours`, go: 'spin' },
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
