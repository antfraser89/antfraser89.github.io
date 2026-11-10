// A single always-on objective that walks new players through the game and
// keeps handing out stars afterwards.
import { ATTRACTIONS, PARK } from './config.js';
import { nextMilestone } from './economy.js';
import { fmt, money } from './format.js';

const idx = (id) => ATTRACTIONS.findIndex((d) => d.id === id);
const nameOf = (id) => ATTRACTIONS[idx(id)].name;

const build = (id, stars) => ({
  text: `Build the ${nameOf(id)}`, target: 1, stars, point: idx(id),
  cur: (s) => (s.attractions[idx(id)].built ? 1 : 0),
});
const level = (id, n, stars) => ({
  text: `Upgrade the ${nameOf(id)} to level ${n}`, target: n, stars, point: idx(id),
  cur: (s) => s.attractions[idx(id)].level,
});
const anyLevel = (n, stars) => ({
  text: `Get any attraction to level ${n}`, target: n, stars,
  cur: (s) => Math.max(...s.attractions.map((a) => a.level)),
});
const operator = (id, stars) => ({
  text: `Hire an operator for the ${nameOf(id)}`, target: 1, stars, point: idx(id),
  cur: (s) => (s.attractions[idx(id)].operator ? 1 : 0),
});
const operators = (n, stars) => ({
  text: `Have ${n} operators on the payroll`, target: n, stars,
  cur: (s) => s.attractions.filter((a) => a.operator).length,
});
const stat = (key, n, stars, text, point) => ({ text, target: n, stars, point, cur: (s) => s.stats[key] });
const park = (key, n, stars) => ({
  text: `Get ${PARK[key].name} to level ${n}`, target: n, stars,
  cur: (s) => s.park[key],
});
const tours = (n, stars) => ({
  text: n === 1 ? 'Take the fair on tour' : `Complete ${n} tours`, target: n, stars,
  cur: (s) => s.tours,
});

export const GOALS = [
  build('toffee', 1),
  stat('manualRuns', 3, 1, 'Tap GO! to serve customers 3 times', 0),
  level('toffee', 5, 1),
  operator('toffee', 1),
  build('ducks', 1),
  park('marketing', 1, 1),
  level('toffee', 10, 2),
  stat('balloons', 1, 1, 'Pop a prize balloon'),
  build('teacups', 2),
  stat('fireworks', 1, 1, 'Set off the fireworks'),
  operators(3, 2),
  stat('served', 300, 2, 'Serve 300 guests'),
  build('helter', 2),
  park('passes', 1, 2),
  anyLevel(25, 2),
  build('coconut', 2),
  stat('earned', 1e6, 2, `Take ${money(1e6)} in total`),
  park('paths', 2, 2),
  build('floss', 3),
  operators(6, 3),
  park('marketing', 6, 2),
  build('dodgems', 3),
  anyLevel(50, 3),
  stat('balloons', 10, 2, 'Pop 10 prize balloons'),
  build('carousel', 3),
  stat('served', 5000, 3, 'Serve 5,000 guests'),
  tours(1, 5),
  build('ghost', 3),
  anyLevel(100, 4),
  stat('fireworks', 10, 3, 'Set off the fireworks 10 times'),
  build('waltzer', 4),
  tours(2, 5),
  stat('served', 50000, 4, 'Serve 50,000 guests'),
  build('wheel', 4),
  anyLevel(150, 4),
  build('coaster', 5),
  operators(12, 5),
  tours(4, 5),
  anyLevel(200, 5),
];

const nice = (n) => {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(1, n))));
  return Math.ceil(n / p) * p;
};

// Once the scripted list runs out, goals are generated from the state at the
// moment the previous one was claimed and stored in the save.
function generate(state, index) {
  const kind = index % 3;
  if (kind === 0) {
    return { type: 'earned', target: nice(Math.max(1e6, state.stats.earned * 25)), idx: 0, stars: 3 };
  }
  if (kind === 1) {
    let pick = 0;
    for (let i = 0; i < state.attractions.length; i++) {
      if (state.attractions[i].built) pick = i;
    }
    const lv = state.attractions[pick].level;
    return { type: 'level', target: nextMilestone(Math.max(lv, 1)), idx: pick, stars: 3 };
  }
  return { type: 'served', target: nice(Math.max(1000, state.stats.served * 1.6)), idx: 0, stars: 2 };
}

function fromExtra(e) {
  switch (e.type) {
    case 'earned':
      return { text: `Take ${money(e.target)} in total`, target: e.target, stars: e.stars, cur: (s) => s.stats.earned };
    case 'level': {
      const i = Math.min(e.idx, ATTRACTIONS.length - 1);
      return {
        text: `Upgrade the ${ATTRACTIONS[i].name} to level ${e.target}`, target: e.target, stars: e.stars, point: i,
        cur: (s) => s.attractions[i].level,
      };
    }
    default:
      return { text: `Serve ${fmt(e.target)} guests in total`, target: e.target, stars: e.stars, cur: (s) => s.stats.served };
  }
}

export function currentGoal(state) {
  let def;
  if (state.goal.index < GOALS.length) {
    def = GOALS[state.goal.index];
  } else {
    if (!state.goal.extra) state.goal.extra = generate(state, state.goal.index);
    def = fromExtra(state.goal.extra);
  }
  const cur = Math.min(def.cur(state), def.target);
  return {
    text: def.text,
    cur,
    target: def.target,
    stars: def.stars,
    point: def.point ?? -1,
    done: cur >= def.target,
  };
}

export function advanceGoal(state) {
  state.goal.index++;
  state.goal.extra = state.goal.index >= GOALS.length ? generate(state, state.goal.index) : null;
}
