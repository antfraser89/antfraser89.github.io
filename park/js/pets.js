// Pets. You have one pal level, raised by feeding cherries, and a few pals to
// choose between. Only the pal walking with you uses its talent; the talent
// grows with the pal level. `art` is a cell on a painted sheet in img/.
import { int } from './core.js';

export const PET_MAX = 30;
export const PET_TUNING = {
  xpFor: (level) => 6 + level * 6 + level * level,
  capPerLevel: 2, // every level adds this many spins to the meter, whoever is out
  levelTokens: (level) => 6 + level * 2,
};

// perk: what the talent changes; per: how much each pal level adds.
export const PETS = [
  { id: 'puddle', name: 'Puddle', kind: 'duck', art: ['cards-pond', 7], perk: 'dive', per: 0.05, how: 'start', blurb: 'Sniffs out the best shells: pearl dives pay more.' },
  { id: 'biscuit', name: 'Biscuit', kind: 'puppy', art: ['pets', 0], perk: 'gate', per: 0.04, how: 'buy', price: 250, blurb: 'Greets everyone at the gate: the park takes more.' },
  { id: 'mittens', name: 'Mittens', kind: 'kitten', art: ['pets', 1], perk: 'reels', per: 0.02, how: 'buy', price: 400, blurb: 'Bats at the reels: coin wins pay more.' },
  { id: 'clover', name: 'Clover', kind: 'bunny', art: ['pets', 2], perk: 'away', per: 0.1, how: 'buy', price: 400, blurb: 'Minds the park while you are out: it earns for longer.' },
  { id: 'pip', name: 'Pip', kind: 'bluebird', art: ['pets', 3], perk: 'energy', per: 2, how: 'level', level: 5, blurb: 'Tidies the rockpool: more merge energy.' },
  { id: 'shelby', name: 'Shelby', kind: 'turtle', art: ['pets', 4], perk: 'treats', per: 0.05, how: 'buy', price: 600, blurb: 'Finds the ripest cherries: more of them on every win.' },
  { id: 'nibbles', name: 'Nibbles', kind: 'hamster', art: ['pets', 5], perk: 'stars', per: 0.05, how: 'buy', price: 600, blurb: 'Hoards spare cards: they are worth more stars.' },
  { id: 'coral', name: 'Coral', kind: 'axolotl', art: ['pets', 6], perk: 'draw', per: 0.03, how: 'buy', price: 900, blurb: 'Blows lucky bubbles: Lucky Pearl prizes are bigger.' },
  { id: 'bandit', name: 'Bandit', kind: 'raccoon', art: ['pets', 7], perk: 'swords', per: 0.05, how: 'buy', price: 900, blurb: 'Digs in the garden: the sword plant grows faster.' },
  { id: 'snowy', name: 'Snowy', kind: 'llama', art: ['pets', 8], perk: 'wheel', per: 0.05, how: 'level', level: 10, blurb: 'Leans on the prize wheel: its coin prizes are bigger.' },
];
export const PET_BY_ID = Object.fromEntries(PETS.map((p) => [p.id, p]));

export const freshPet = () => ({ level: 0, xp: 0, treats: 0, owned: ['puddle'], active: 'puddle' });

export function cleanPet(raw) {
  const p = freshPet();
  if (!raw || typeof raw !== 'object') return p;
  p.level = Math.min(int(raw.level), PET_MAX);
  p.xp = int(raw.xp);
  p.treats = int(raw.treats);
  if (Array.isArray(raw.owned)) for (const id of raw.owned) if (PET_BY_ID[id] && !p.owned.includes(id)) p.owned.push(id);
  if (p.owned.includes(raw.active)) p.active = raw.active;
  return p;
}

export const activePet = (state) => PET_BY_ID[state.pet.active] || PETS[0];
// How much the pal walking with you adds for a perk (0 when it is another pal's).
export function talent(state, perk) {
  const pet = activePet(state);
  return pet.perk === perk ? pet.per * state.pet.level : 0;
}
export const petCap = (state) => PET_TUNING.capPerLevel * state.pet.level;

// Pals that have turned up because the pal level reached them.
export function petArrivals(state) {
  const out = [];
  for (const p of PETS) {
    if (p.how === 'level' && state.pet.level >= p.level && !state.pet.owned.includes(p.id)) {
      state.pet.owned.push(p.id);
      out.push(p);
    }
  }
  return out;
}

export function feedPet(state, count = Infinity) {
  const used = Math.min(count, state.pet.treats);
  if (!(used > 0)) return null;
  state.pet.treats -= used;
  state.pet.xp += used;
  state.stats.fed += used;
  const out = { used, levels: 0, tokens: 0, arrived: [] };
  while (state.pet.level < PET_MAX && state.pet.xp >= PET_TUNING.xpFor(state.pet.level)) {
    state.pet.xp -= PET_TUNING.xpFor(state.pet.level);
    state.pet.level++;
    out.levels++;
    out.tokens += PET_TUNING.levelTokens(state.pet.level);
  }
  state.tokens += out.tokens;
  out.arrived = petArrivals(state);
  return out;
}

export function setPet(state, id) {
  if (!state.pet.owned.includes(id)) return false;
  state.pet.active = id;
  return true;
}

// Coins to bring a pal home from the pet shop (prices are in units).
export function buyPet(state, id, unitNow) {
  const pet = PET_BY_ID[id];
  if (!pet || pet.how !== 'buy' || state.pet.owned.includes(id)) return null;
  const cost = pet.price * unitNow;
  if (state.coins < cost) return null;
  state.coins -= cost;
  state.pet.owned.push(id);
  return { cost, pet };
}
