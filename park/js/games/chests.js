// Lucky Chests: six prizes on show, six chests, one key a chest. Every chest
// holds one of the prizes; open all six and the board is laid out again.
// Three boards make a level, and each level's prizes are better.
import { grant, int } from '../core.js';

export const CHESTS = {
  // the six prizes, in the order they sit round the ring on the painting
  prizes: (level) => [
    { coins: 60 + Math.min(level, 10) * 15 }, { pack: level >= 6 ? 'gold' : level >= 3 ? 'silver' : 'bronze' }, { coins: 20 + Math.min(level, 10) * 5 },
    { wheel: 1 }, { energy: 12 + Math.min(level, 10) * 2 }, { tokens: 6 + Math.min(level, 10) },
  ],
  boards: 3, // boards to a level
  levelReward: (level) => ({ tokens: 15 + Math.min(level, 10) * 2, gems: 30 + Math.min(level, 10) * 5 }),
};

function shuffle(rand) {
  const order = [0, 1, 2, 3, 4, 5];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

// order[chest] is the prize in that chest; open lists the chests opened.
export const freshChests = (rand = Math.random) => ({ level: 1, board: 0, order: shuffle(rand), open: [] });

export function cleanChests(raw, rand = Math.random) {
  const c = freshChests(rand);
  if (!raw || typeof raw !== 'object') return c;
  c.level = Math.max(1, int(raw.level, 1));
  c.board = Math.min(int(raw.board), CHESTS.boards - 1);
  if (Array.isArray(raw.order) && raw.order.slice().sort().join() === '0,1,2,3,4,5') c.order = raw.order.slice();
  if (Array.isArray(raw.open)) c.open = raw.open.map((v) => int(v)).filter((v, i, a) => v < 6 && a.indexOf(v) === i);
  return c;
}

export function openChest(state, chest, rand) {
  const c = state.chests;
  if (!(chest >= 0 && chest < 6) || c.open.includes(chest) || !(state.inv.keys >= 1)) return null;
  state.inv.keys--;
  state.stats.chests++;
  c.open.push(chest);
  const prize = c.order[chest];
  const out = { chest, prize, reward: grant(state, CHESTS.prizes(c.level)[prize]), boardDone: false, levelUp: null };
  if (c.open.length >= 6) {
    out.boardDone = true;
    c.board++;
    if (c.board >= CHESTS.boards) {
      out.levelUp = { level: c.level, reward: grant(state, CHESTS.levelReward(c.level)) };
      c.level++;
      c.board = 0;
    }
    c.order = shuffle(rand);
    c.open = [];
  }
  return out;
}
