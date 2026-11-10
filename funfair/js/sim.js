// The funfair simulation: guests, queues, ride cycles and every player action.
// No DOM in here, so the same code runs headless in tests and the balance tool.
import { ATTRACTIONS, GUEST_LOOKS, PARK, TUNING as T, WORLD as W } from './config.js';
import * as E from './economy.js';
import { advanceGoal, currentGoal } from './goals.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const newRt = () => ({
  queue: [], riders: [], phase: 'idle', t: 0, dur: 1, sinceBoard: 0, boardCd: 0, inbound: 0, anim: 0, pulse: 0,
});

export function createWorld(state, rand = Math.random) {
  return {
    state,
    rand,
    guests: [],
    rt: ATTRACTIONS.map(newRt),
    balloons: [],
    events: [],
    spawnAcc: 0,
    balloonIn: 22,
    nextId: 1,
    time: 0,
  };
}

// ---- geometry -------------------------------------------------------------

export function queueSlot(i, k) {
  const d = ATTRACTIONS[i];
  return { x: W.aveX + d.side * (W.entranceOffset - k * W.queueGap), y: d.y + 10 };
}

export function serveSlot(i, k, cap) {
  const d = ATTRACTIONS[i];
  const gap = Math.min(17, 96 / Math.max(1, cap - 1));
  return { x: d.x + (k - (cap - 1) / 2) * gap, y: d.y + 5 };
}

export function exitPoint(i, k = 0) {
  const d = ATTRACTIONS[i];
  return { x: W.aveX + d.side * (W.entranceOffset - 14 - (k % 6) * 9), y: d.y + 34 + (k % 2) * 5 };
}

function moveToward(g, x, y, step) {
  const dx = x - g.x;
  const dy = y - g.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.01) return true;
  if (Math.abs(dx) > 0.5) g.face = dx > 0 ? 1 : -1;
  g.moving = true;
  if (d <= step) {
    g.x = x;
    g.y = y;
    return true;
  }
  g.x += (dx / d) * step;
  g.y += (dy / d) * step;
  return false;
}

function route(g, dest) {
  const pts = [];
  const dy = dest.y - g.y;
  const lane = W.aveX + (dy < 0 ? 15 : -15) + g.jx;
  const sameSide = (g.x - W.aveX) * (dest.x - W.aveX) > 0;
  if (sameSide && Math.abs(dy) < 60 && Math.abs(g.x - W.aveX) > W.aveHalf) {
    pts.push({ x: dest.x, y: g.y }); // back round to the same queue
  } else {
    if (Math.abs(g.x - W.aveX) > W.aveHalf) pts.push({ x: lane, y: g.y });
    pts.push({ x: lane, y: dest.y });
  }
  pts.push(dest);
  return pts;
}

// ---- guests ---------------------------------------------------------------

const pick = (rand, n) => Math.floor(rand() * n);

function spawnGuest(world) {
  const r = world.rand;
  const g = {
    id: world.nextId++,
    x: W.aveX + 15 + (r() - 0.5) * 30,
    y: W.spawnY + r() * 24,
    jx: (r() - 0.5) * 22,
    path: null,
    pi: 0,
    mode: 'walk',
    target: -1,
    last: -1,
    visits: E.visitsPerGuest(world.state),
    sp: 0.85 + r() * 0.3,
    bob: r() * 6.283,
    face: 1,
    moving: false,
    alpha: 0,
    emote: null,
    emoteT: 0,
    shirt: pick(r, GUEST_LOOKS.shirts.length),
    skin: pick(r, GUEST_LOOKS.skins.length),
    hair: pick(r, GUEST_LOOKS.hairs.length),
    legs: pick(r, GUEST_LOOKS.trousers.length),
    tall: 0.9 + r() * 0.22,
    hat: r() < 0.14,
  };
  const j = chooseTarget(world, g, -1);
  if (j < 0) return null;
  sendTo(world, g, j);
  world.guests.push(g);
  return g;
}

const weights = new Array(ATTRACTIONS.length).fill(0);

function chooseTarget(world, g, exclude) {
  const s = world.state;
  let total = 0;
  for (let i = 0; i < ATTRACTIONS.length; i++) {
    let w = 0;
    if (s.attractions[i].built && i !== exclude) {
      const rt = world.rt[i];
      const load = (rt.queue.length + rt.inbound) / T.queueLimit;
      if (load < 1) w = ATTRACTIONS[i].appeal * (1 - 0.75 * load) * (i === g.last ? 0.3 : 1);
    }
    weights[i] = w;
    total += w;
  }
  if (total <= 0) return -1;
  let roll = world.rand() * total;
  for (let i = 0; i < ATTRACTIONS.length; i++) {
    roll -= weights[i];
    if (weights[i] > 0 && roll <= 0) return i;
  }
  for (let i = ATTRACTIONS.length - 1; i >= 0; i--) if (weights[i] > 0) return i;
  return -1;
}

function sendTo(world, g, j) {
  const rt = world.rt[j];
  g.target = j;
  g.mode = 'walk';
  g.path = route(g, queueSlot(j, Math.min(rt.queue.length + rt.inbound, T.queueLimit - 1)));
  g.pi = 0;
  rt.inbound++;
}

function sendHome(g) {
  g.target = -1;
  g.mode = 'leave';
  g.path = route(g, { x: W.aveX - 15 + g.jx, y: W.spawnY + 40 });
  g.pi = 0;
}

function onArrive(world, g) {
  if (g.mode === 'leave') {
    g.dead = true;
    return;
  }
  const j = g.target;
  const rt = world.rt[j];
  rt.inbound = Math.max(0, rt.inbound - 1);
  if (world.state.attractions[j].built && rt.queue.length < T.queueLimit) {
    rt.queue.push(g);
    g.mode = 'queue';
    return;
  }
  const next = chooseTarget(world, g, j);
  if (next >= 0) {
    sendTo(world, g, next);
  } else {
    g.emote = 'sad';
    g.emoteT = 1.6;
    sendHome(g);
  }
}

function spawnGuests(world, dt) {
  const s = world.state;
  if (!s.attractions.some((a) => a.built)) return;
  world.spawnAcc += E.arrivalRate(s) * dt;
  // Jittered arrivals: each whole unit of the accumulator admits one guest.
  while (world.spawnAcc >= 1) {
    world.spawnAcc -= 0.6 + world.rand() * 0.8;
    if (world.guests.length < T.maxGuests) spawnGuest(world);
  }
}

function updateGuests(world, dt) {
  const speed = E.walkSpeed(world.state);
  let anyDead = false;
  for (const g of world.guests) {
    if (g.emoteT > 0) g.emoteT -= dt;
    if (g.mode === 'walk' || g.mode === 'leave') {
      g.moving = false;
      const p = g.path[g.pi];
      if (moveToward(g, p.x, p.y, speed * g.sp * dt)) {
        g.pi++;
        if (g.pi >= g.path.length) onArrive(world, g);
      }
    } else if (g.mode === 'serve') {
      g.moving = false;
      moveToward(g, g.sx, g.sy, speed * dt);
    }
    if (g.mode === 'ride') g.alpha = Math.max(0, g.alpha - dt * 7);
    else if (g.alpha < 1) g.alpha = Math.min(1, g.alpha + dt * 5);
    if (g.dead) anyDead = true;
  }
  if (anyDead) world.guests = world.guests.filter((g) => !g.dead);
}

// ---- attractions ----------------------------------------------------------

const EMOTES = ['heart', 'smile', 'star', 'note', 'smile', 'heart'];

function startRide(world, i) {
  const s = world.state;
  const rt = world.rt[i];
  rt.phase = 'run';
  rt.t = 0;
  rt.dur = E.cycleTime(ATTRACTIONS[i], s.attractions[i].level);
  s.stats.cycles++;
  world.events.push({ type: 'start', i });
}

function earn(state, amount) {
  state.cash += amount;
  state.runEarned += amount;
  state.stats.earned += amount;
}

function finishRide(world, i) {
  const s = world.state;
  const a = s.attractions[i];
  const rt = world.rt[i];
  const def = ATTRACTIONS[i];
  const n = rt.riders.length;
  const amount = E.ticketPrice(s, i) * n * E.boostMult(s);
  earn(s, amount);
  a.served += n;
  s.stats.served += n;
  a.flow += n / T.flowTau;
  rt.pulse = 1;
  world.events.push({ type: 'pay', i, amount, n, x: def.x, y: def.y });
  for (let k = 0; k < n; k++) {
    const g = rt.riders[k];
    if (def.kind === 'ride') {
      const p = exitPoint(i, k);
      g.x = p.x;
      g.y = p.y;
      g.alpha = 0;
    }
    g.last = i;
    g.visits--;
    if (world.rand() < 0.4) {
      g.emote = EMOTES[pick(world.rand, EMOTES.length)];
      g.emoteT = 1.4;
    }
    const next = g.visits > 0 ? chooseTarget(world, g, -1) : -1;
    // Customers at a counter step back to the exit lane first, so they walk
    // round the queue rather than through it.
    const counterY = g.y;
    if (def.kind !== 'ride') g.y = def.y + 34;
    if (next >= 0) sendTo(world, g, next);
    else sendHome(g);
    if (def.kind !== 'ride') {
      g.path.unshift({ x: g.x, y: g.y });
      g.y = counterY;
    }
  }
  rt.riders.length = 0;
  rt.phase = 'idle';
  rt.sinceBoard = 0;
  rt.boardCd = 0.25;
}

function updateAttractions(world, dt) {
  const s = world.state;
  const speed = E.walkSpeed(s);
  const decay = Math.exp(-dt / T.flowTau);
  for (let i = 0; i < ATTRACTIONS.length; i++) {
    const a = s.attractions[i];
    if (!a.built) continue;
    a.flow *= decay;
    const rt = world.rt[i];
    const def = ATTRACTIONS[i];
    if (rt.pulse > 0) rt.pulse = Math.max(0, rt.pulse - dt * 2.5);

    let frontReady = false;
    for (let k = 0; k < rt.queue.length; k++) {
      const g = rt.queue[k];
      const slot = queueSlot(i, k);
      g.moving = false;
      const there = moveToward(g, slot.x, slot.y, speed * g.sp * dt);
      if (k === 0) frontReady = there;
    }

    if (rt.phase === 'idle') {
      rt.boardCd -= dt;
      const cap = E.capacity(def, a.level);
      if (frontReady && rt.riders.length < cap && rt.boardCd <= 0) {
        const g = rt.queue.shift();
        const seat = rt.riders.length;
        rt.riders.push(g);
        if (def.kind === 'ride') {
          g.mode = 'ride';
        } else {
          const p = serveSlot(i, seat, cap);
          g.mode = 'serve';
          g.sx = p.x;
          g.sy = p.y;
        }
        rt.boardCd = T.boardInterval;
        rt.sinceBoard = 0;
      }
      if (rt.riders.length > 0) {
        rt.sinceBoard += dt;
        if (a.operator && (rt.riders.length >= cap || rt.sinceBoard >= T.boardWait)) startRide(world, i);
      }
    } else {
      rt.t += dt;
      rt.anim += dt;
      if (rt.t >= rt.dur) finishRide(world, i);
    }
  }
}

export const isReady = (world, i) => {
  const a = world.state.attractions[i];
  const rt = world.rt[i];
  return a.built && !a.operator && rt.phase === 'idle' && rt.riders.length > 0;
};

// ---- balloons -------------------------------------------------------------

const BALLOON_COLORS = ['#e5484d', '#ffc53d', '#3e63dd', '#46a758', '#e93d82', '#8e4ec6'];

function updateBalloons(world, dt) {
  const s = world.state;
  if (s.attractions[0].built || s.stats.served > 0) {
    world.balloonIn -= dt;
    if (world.balloonIn <= 0) {
      world.balloonIn = E.balloonInterval(s, world.rand());
      if (world.balloons.length < 2) {
        world.balloons.push({
          id: world.nextId++,
          x0: 140 + world.rand() * (W.w - 280),
          x: 0,
          y: W.h + 60,
          vy: 62 + world.rand() * 20,
          t: 0,
          ph: world.rand() * 6.283,
          color: BALLOON_COLORS[pick(world.rand, BALLOON_COLORS.length)],
        });
      }
    }
  }
  for (const b of world.balloons) {
    b.t += dt;
    b.y -= b.vy * dt;
    b.x = b.x0 + Math.sin(b.t * 0.9 + b.ph) * 34;
  }
  if (world.balloons.length && world.balloons[0].y < -140) world.balloons.shift();
}

// ---- the tick -------------------------------------------------------------

export function step(world, dt) {
  const s = world.state;
  world.time += dt;
  s.stats.playTime += dt;
  s.clock = (s.clock + dt / T.dayLength) % 1;
  if (s.boosts.fireworks > 0) s.boosts.fireworks = Math.max(0, s.boosts.fireworks - dt);
  if (s.boosts.rush > 0) s.boosts.rush = Math.max(0, s.boosts.rush - dt);
  if (s.fireworksCd > 0) s.fireworksCd = Math.max(0, s.fireworksCd - dt);
  spawnGuests(world, dt);
  updateAttractions(world, dt);
  updateGuests(world, dt);
  updateBalloons(world, dt);
  if (world.events.length > 4000) world.events.length = 0; // nobody is listening
}

// ---- player actions -------------------------------------------------------

export function build(world, i) {
  const s = world.state;
  const a = s.attractions[i];
  const def = ATTRACTIONS[i];
  if (!def || a.built || s.cash < def.cost) return false;
  if (i > 0 && !s.attractions[i - 1].built) return false; // plots open in order
  s.cash -= def.cost;
  a.built = true;
  a.level = 1;
  a.flow = 0;
  world.events.push({ type: 'build', i });
  return true;
}

// Buys exactly n levels or nothing. Returns the number of levels bought.
export function upgrade(world, i, n = 1) {
  const s = world.state;
  const a = s.attractions[i];
  const def = ATTRACTIONS[i];
  n = Math.floor(n);
  if (!def || !a.built || n < 1) return 0;
  const cost = E.bulkCost(def, a.level, n);
  if (s.cash < cost) return 0;
  const before = E.milestoneCount(a.level);
  s.cash = Math.max(0, s.cash - cost);
  a.level += n;
  s.stats.upgrades += n;
  const after = E.milestoneCount(a.level);
  world.events.push({ type: 'upgrade', i, n });
  if (after > before) {
    let stars = 0;
    if (after > a.bestMs) {
      stars = after - Math.max(before, a.bestMs);
      a.bestMs = after;
      s.stars += stars;
    }
    world.events.push({ type: 'milestone', i, tier: after, stars });
  }
  return n;
}

export function hire(world, i) {
  const s = world.state;
  const a = s.attractions[i];
  const def = ATTRACTIONS[i];
  if (!def || !a.built || a.operator || s.cash < def.opCost) return false;
  s.cash -= def.opCost;
  a.operator = true;
  world.events.push({ type: 'hire', i });
  return true;
}

// A tap on an attraction with no operator starts the ride by hand.
export function tapAttraction(world, i) {
  if (!isReady(world, i)) return false;
  world.state.stats.manualRuns++;
  startRide(world, i);
  return true;
}

export function buyPark(world, key) {
  const s = world.state;
  const level = s.park[key];
  if (level === undefined || level >= PARK[key].max) return false;
  const cost = E.parkCost(key, level);
  if (s.cash < cost) return false;
  s.cash = Math.max(0, s.cash - cost);
  s.park[key] = level + 1;
  world.events.push({ type: 'park', key });
  return true;
}

export function buyShop(world, key) {
  const s = world.state;
  const level = s.shop[key];
  if (level === undefined || E.shopMaxed(key, level)) return false;
  const cost = E.shopCost(key, level);
  if (s.stars < cost) return false;
  let amount = 0;
  if (key === 'warp') {
    amount = E.totalRate(s) * T.warpHours * 3600;
    if (amount <= 0) return false;
    earn(s, amount);
  }
  s.stars -= cost;
  s.shop[key] = level + 1;
  world.events.push({ type: 'shop', key, amount });
  return true;
}

export function popBalloon(world, balloon) {
  const k = world.balloons.indexOf(balloon);
  if (k < 0) return null;
  world.balloons.splice(k, 1);
  const s = world.state;
  s.stats.balloons++;
  const roll = world.rand();
  let reward;
  if (roll < T.balloonStarChance) {
    s.stars += 1;
    reward = { kind: 'star', amount: 1 };
  } else if (roll < T.balloonStarChance + T.balloonRushChance) {
    s.boosts.rush = T.rushDuration;
    reward = { kind: 'rush', amount: T.rushDuration };
  } else {
    const amount = Math.max(E.totalRate(s) * T.balloonCashSeconds, 20);
    earn(s, amount);
    reward = { kind: 'cash', amount };
  }
  world.events.push({ type: 'balloon', x: balloon.x, y: balloon.y, color: balloon.color, reward });
  return reward;
}

export function launchFireworks(world) {
  const s = world.state;
  if (s.fireworksCd > 0 || !s.attractions.some((a) => a.built)) return false;
  s.boosts.fireworks = T.fireworksDuration;
  s.fireworksCd = E.fireworksCooldown(s);
  s.stats.fireworks++;
  world.events.push({ type: 'fireworks' });
  return true;
}

export function claimGoal(world) {
  const s = world.state;
  const goal = currentGoal(s);
  if (!goal.done) return false;
  s.stars += goal.stars;
  advanceGoal(s);
  world.events.push({ type: 'goal', stars: goal.stars, text: goal.text });
  return true;
}

export function goOnTour(world) {
  const s = world.state;
  const gain = E.fameGain(s);
  if (gain < T.tourMinFame) return false;
  s.fame += gain;
  s.tours++;
  s.stars += T.tourStars;
  s.runEarned = 0;
  for (const a of s.attractions) {
    a.built = false;
    a.level = 0;
    a.operator = false;
    a.flow = 0;
    a.served = 0;
  }
  for (const k of Object.keys(s.park)) s.park[k] = 0;
  s.boosts.fireworks = 0;
  s.boosts.rush = 0;
  s.fireworksCd = 0;
  s.cash = E.startingCash(s);
  world.guests = [];
  world.balloons = [];
  world.rt = ATTRACTIONS.map(newRt);
  world.spawnAcc = 0;
  world.events.push({ type: 'tour', gain });
  return true;
}

// Credit the takings for time spent away. Returns what was paid out.
export function applyOffline(world, seconds) {
  const s = world.state;
  const counted = Math.min(Math.max(0, seconds), E.offlineCapSeconds(s));
  const amount = E.offlineEarnings(s, seconds);
  if (amount > 0) earn(s, amount);
  s.fireworksCd = Math.max(0, s.fireworksCd - seconds);
  s.boosts.fireworks = 0;
  s.boosts.rush = 0;
  return { amount, counted, capped: seconds > counted };
}
