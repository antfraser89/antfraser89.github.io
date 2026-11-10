// The living park: guests walk in, queue, ride and pay a little into the till.
// It is scenery with a small income attached; the real money comes from spins.
// No DOM in here, so the same code runs headless in tests.
import { ATTRACTIONS, GUEST_LOOKS, PLOTS, TUNING as T, WORLD as W, townInfo } from './config.js';
import * as E from './economy.js';
import { along, layoutFor, nearestNode, nodeRoute } from './layout.js';
import { advanceMission, currentMission } from './goals.js';
import { grant } from './rules.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const newRt = () => ({ queue: [], riders: [], phase: 'idle', t: 0, dur: 1, sinceBoard: 0, boardCd: 0, inbound: 0, pulse: 0 });

export function createWorld(state, rand = Math.random) {
  return {
    state,
    rand,
    guests: [],
    rt: PLOTS.map(newRt),
    balloons: [],
    events: [],
    spawnAcc: 0,
    balloonIn: 30,
    nextId: 1,
    time: 0,
  };
}

// Clear the field, e.g. after moving town.
export function resetWorld(world) {
  world.guests = [];
  world.balloons = [];
  world.rt = PLOTS.map(newRt);
  world.spawnAcc = 0;
}

export const designAt = (state, k) => ATTRACTIONS[townInfo(state.town).lineup[k]];
export const isOpen = (state, k) => state.plots[k].stage > 0 && !state.plots[k].splat;
export const capacity = (def, stage) => def.cap + Math.floor(def.cap * 0.15 * Math.max(0, stage - 1));
export const cycleTime = (def, stage) => def.cycle * (1 - 0.04 * Math.max(0, stage - 1));

// ---- geometry -------------------------------------------------------------
// All of it comes from the town's layout: see layout.js.

const lay = (world) => layoutFor(world.state.town);

// Where the nth person in the queue stands.
export function queueSlot(L, k, n) {
  return along(L.plots[k].q, n * W.queueGap);
}

export function serveSlot(L, k, n, cap) {
  const p = L.plots[k];
  const gap = Math.min(17, 96 / Math.max(1, cap - 1));
  return { x: p.x + (n - (cap - 1) / 2) * gap, y: p.y + 5 };
}

// Riders step off into a lane beside the queue, on the side nearer the viewer.
export function exitPoint(L, k, n = 0) {
  const [a, b] = L.plots[k].q;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const dx = (b[0] - a[0]) / len;
  const dy = (b[1] - a[1]) / len;
  let px = -dy;
  let py = dx;
  if (py < 0) {
    px = -px;
    py = -py;
  }
  const d = 14 + (n % 6) * 9;
  const o = 24 + (n % 2) * 5;
  return { x: a[0] + dx * d + px * o, y: a[1] + dy * d + py * o };
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

// Along the walkways from wherever the guest is to `dest`, keeping right so
// that people going opposite ways pass each other.
function route(L, g, dest) {
  if (Math.hypot(dest.x - g.x, dest.y - g.y) < 64) return [dest];
  const ids = nodeRoute(L, nearestNode(L, g.x, g.y), nearestNode(L, dest.x, dest.y));
  const lane = 9 + g.jx * 0.55;
  const pts = [];
  for (let i = 0; i < ids.length; i++) {
    const n = L.nodes[ids[i]];
    const p = L.nodes[ids[Math.max(0, i - 1)]];
    const q = L.nodes[ids[Math.min(ids.length - 1, i + 1)]];
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.01) pts.push({ x: n.x, y: n.y });
    else pts.push({ x: n.x - (dy / len) * lane, y: n.y + (dx / len) * lane });
  }
  // no doubling back to a node we are already past
  while (pts.length > 1 && Math.hypot(pts[1].x - g.x, pts[1].y - g.y) < Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)) pts.shift();
  const last = pts[pts.length - 1];
  if (pts.length > 1 && Math.hypot(dest.x - pts[pts.length - 2].x, dest.y - pts[pts.length - 2].y) < Math.hypot(last.x - pts[pts.length - 2].x, last.y - pts[pts.length - 2].y)) pts.pop();
  pts.push(dest);
  return pts;
}

// ---- guests ---------------------------------------------------------------

const pick = (rand, n) => Math.floor(rand() * n);

const openCount = (state) => PLOTS.reduce((n, p) => n + (isOpen(state, p.index) ? 1 : 0), 0);

function spawnGuest(world) {
  const r = world.rand;
  const g = {
    id: world.nextId++,
    x: lay(world).gate.x + 15 + (r() - 0.5) * 30,
    y: W.spawnY + r() * 24,
    jx: (r() - 0.5) * 22,
    path: null,
    pi: 0,
    mode: 'walk',
    target: -1,
    last: -1,
    visits: 2 + Math.ceil(openCount(world.state) / 2),
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
  const k = chooseTarget(world, g, -1);
  if (k < 0) return null;
  sendTo(world, g, k);
  world.guests.push(g);
  return g;
}

const weights = new Array(PLOTS.length).fill(0);

function chooseTarget(world, g, exclude) {
  const s = world.state;
  let total = 0;
  for (let k = 0; k < PLOTS.length; k++) {
    let w = 0;
    if (isOpen(s, k) && k !== exclude) {
      const rt = world.rt[k];
      const load = (rt.queue.length + rt.inbound) / T.queueLimit;
      if (load < 1) w = (1 + 0.25 * s.plots[k].stage) * (1 - 0.75 * load) * (k === g.last ? 0.3 : 1);
    }
    weights[k] = w;
    total += w;
  }
  if (total <= 0) return -1;
  let roll = world.rand() * total;
  for (let k = 0; k < PLOTS.length; k++) {
    roll -= weights[k];
    if (weights[k] > 0 && roll <= 0) return k;
  }
  for (let k = PLOTS.length - 1; k >= 0; k--) if (weights[k] > 0) return k;
  return -1;
}

function sendTo(world, g, k) {
  const rt = world.rt[k];
  g.target = k;
  g.mode = 'walk';
  const L = lay(world);
  g.path = route(L, g, queueSlot(L, k, Math.min(rt.queue.length + rt.inbound, T.queueLimit - 1)));
  g.pi = 0;
  rt.inbound++;
}

function sendHome(world, g) {
  const L = lay(world);
  g.target = -1;
  g.mode = 'leave';
  g.path = route(L, g, { x: L.gate.x - 15 + g.jx, y: W.spawnY + 40 });
  g.pi = 0;
}

function moveOn(world, g, exclude) {
  const next = g.visits > 0 ? chooseTarget(world, g, exclude) : -1;
  if (next >= 0) sendTo(world, g, next);
  else sendHome(world, g);
}

function onArrive(world, g) {
  if (g.mode === 'leave') {
    g.dead = true;
    return;
  }
  const k = g.target;
  const rt = world.rt[k];
  rt.inbound = Math.max(0, rt.inbound - 1);
  if (isOpen(world.state, k) && rt.queue.length < T.queueLimit) {
    rt.queue.push(g);
    g.mode = 'queue';
    return;
  }
  const next = chooseTarget(world, g, k);
  if (next >= 0) {
    sendTo(world, g, next);
  } else {
    g.emote = 'sad';
    g.emoteT = 1.6;
    sendHome(world, g);
  }
}

function spawnGuests(world, dt) {
  const open = openCount(world.state);
  if (!open) return;
  world.spawnAcc += (0.1 + 0.07 * open) * dt;
  while (world.spawnAcc >= 1) {
    world.spawnAcc -= 0.6 + world.rand() * 0.8;
    if (world.guests.length < T.maxGuests) spawnGuest(world);
  }
}

function updateGuests(world, dt) {
  let anyDead = false;
  for (const g of world.guests) {
    if (g.emoteT > 0) g.emoteT -= dt;
    if (g.mode === 'walk' || g.mode === 'leave') {
      g.moving = false;
      const p = g.path[g.pi];
      if (moveToward(g, p.x, p.y, T.walkSpeed * g.sp * dt)) {
        g.pi++;
        if (g.pi >= g.path.length) onArrive(world, g);
      }
    } else if (g.mode === 'serve') {
      g.moving = false;
      moveToward(g, g.sx, g.sy, T.walkSpeed * dt);
    }
    if (g.mode === 'ride') g.alpha = Math.max(0, g.alpha - dt * 7);
    else if (g.alpha < 1) g.alpha = Math.min(1, g.alpha + dt * 5);
    if (g.dead) anyDead = true;
  }
  if (anyDead) world.guests = world.guests.filter((g) => !g.dead);
}

// ---- attractions ----------------------------------------------------------

const EMOTES = ['heart', 'smile', 'star', 'note', 'smile', 'heart'];

function release(world, g, k, n, def) {
  const L = lay(world);
  if (def.kind === 'ride') {
    const p = exitPoint(L, k, n);
    g.x = p.x;
    g.y = p.y;
    g.alpha = 0;
  }
  // Customers at a counter step back to the exit lane first, so they walk
  // round the queue rather than through it.
  moveOn(world, g, -1);
  if (def.kind !== 'ride') g.path.unshift({ x: g.x, y: L.plots[k].y + 34 });
}

function finishRide(world, k) {
  const s = world.state;
  const plot = s.plots[k];
  const rt = world.rt[k];
  const def = designAt(s, k);
  const n = rt.riders.length;
  const amount = E.ticket(s.town, plot.stage) * n;
  s.coins += amount;
  plot.served += n;
  s.stats.served += n;
  plot.flow += n / T.flowTau;
  rt.pulse = 1;
  world.events.push({ type: 'pay', k, amount, n });
  for (let i = 0; i < n; i++) {
    const g = rt.riders[i];
    g.last = k;
    g.visits--;
    if (world.rand() < 0.4) {
      g.emote = EMOTES[pick(world.rand, EMOTES.length)];
      g.emoteT = 1.4;
    }
    release(world, g, k, i, def);
  }
  rt.riders.length = 0;
  rt.phase = 'idle';
  rt.sinceBoard = 0;
  rt.boardCd = 0.25;
}

// A pie has landed: everyone at this attraction wanders off.
function clearOut(world, k) {
  const rt = world.rt[k];
  const def = designAt(world.state, k);
  rt.riders.forEach((g, i) => release(world, g, k, i, def));
  for (const g of rt.queue) moveOn(world, g, k);
  rt.riders.length = 0;
  rt.queue.length = 0;
  rt.phase = 'idle';
}

function updateAttractions(world, dt) {
  const s = world.state;
  const L = lay(world);
  const decay = Math.exp(-dt / T.flowTau);
  for (let k = 0; k < PLOTS.length; k++) {
    const plot = s.plots[k];
    const rt = world.rt[k];
    if (rt.pulse > 0) rt.pulse = Math.max(0, rt.pulse - dt * 2.5);
    if (!isOpen(s, k)) {
      if (rt.queue.length || rt.riders.length) clearOut(world, k);
      continue;
    }
    plot.flow *= decay;
    const def = designAt(s, k);

    let frontReady = false;
    for (let n = 0; n < rt.queue.length; n++) {
      const g = rt.queue[n];
      const slot = queueSlot(L, k, n);
      g.moving = false;
      const there = moveToward(g, slot.x, slot.y, T.walkSpeed * g.sp * dt);
      if (n === 0) frontReady = there;
    }

    if (rt.phase === 'idle') {
      rt.boardCd -= dt;
      const cap = capacity(def, plot.stage);
      if (frontReady && rt.riders.length < cap && rt.boardCd <= 0) {
        const g = rt.queue.shift();
        const seat = rt.riders.length;
        rt.riders.push(g);
        if (def.kind === 'ride') {
          g.mode = 'ride';
        } else {
          const p = serveSlot(L, k, seat, cap);
          g.mode = 'serve';
          g.sx = p.x;
          g.sy = p.y;
        }
        rt.boardCd = T.boardInterval;
        rt.sinceBoard = 0;
      }
      if (rt.riders.length > 0) {
        rt.sinceBoard += dt;
        if (rt.riders.length >= cap || rt.sinceBoard >= T.boardWait) {
          rt.phase = 'run';
          rt.t = 0;
          rt.dur = cycleTime(def, plot.stage);
        }
      }
    } else {
      rt.t += dt;
      if (rt.t >= rt.dur) finishRide(world, k);
    }
  }
}

// ---- balloons -------------------------------------------------------------

const BALLOON_COLORS = ['#e5484d', '#ffc53d', '#3e63dd', '#46a758', '#e93d82', '#8e4ec6'];

function updateBalloons(world, dt) {
  const s = world.state;
  if (s.stats.spins >= 3) {
    world.balloonIn -= dt;
    if (world.balloonIn <= 0) {
      const [lo, hi] = T.balloonEvery;
      world.balloonIn = lo + (hi - lo) * world.rand();
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

export function popBalloon(world, balloon) {
  const i = world.balloons.indexOf(balloon);
  if (i < 0) return null;
  world.balloons.splice(i, 1);
  const s = world.state;
  s.stats.balloons++;
  const roll = world.rand();
  let reward;
  if (roll < 0.25) reward = grant(s, { tokens: 3 });
  else if (roll < 0.4) reward = grant(s, { treats: 2 });
  else reward = grant(s, { coins: 4 + Math.floor(world.rand() * 5) });
  world.events.push({ type: 'balloon', x: balloon.x, y: balloon.y, color: balloon.color, reward });
  return reward;
}

// ---- the tick -------------------------------------------------------------

export function step(world, dt) {
  const s = world.state;
  world.time += dt;
  s.stats.playTime += dt;
  s.clock = (s.clock + dt / T.dayLength) % 1;
  spawnGuests(world, dt);
  updateAttractions(world, dt);
  updateGuests(world, dt);
  updateBalloons(world, dt);
  if (world.events.length > 4000) world.events.length = 0; // nobody is listening
}

// Credit the till for time spent away.
export function applyOffline(world, seconds) {
  const s = world.state;
  const counted = Math.min(Math.max(0, seconds), T.offlineCapHours * 3600);
  const amount = E.offlineEarnings(s, seconds);
  if (amount > 0) s.coins += amount;
  return { amount, counted, capped: seconds > counted };
}

export function claimMission(world) {
  const s = world.state;
  const mission = currentMission(s);
  if (!mission.done) return null;
  const reward = grant(s, mission.reward);
  advanceMission(s);
  world.events.push({ type: 'mission', reward, text: mission.text });
  return reward;
}
