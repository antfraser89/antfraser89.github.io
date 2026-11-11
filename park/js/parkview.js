// The park page. The scene is the painted park for the current theme, shown
// whole on a 390 x 847 stage. Each of the eight sites has a tap area and a
// small tag; sites not yet built are shown drained of colour, and colour
// spreads out from each one as its stars go up, until the whole park is lit.
import { CARD_SETS, PLOTS, STAGES, homeSite, townInfo } from './config.js';
import * as E from './economy.js';
import { money } from './format.js';

export const STAGE_W = 390;
export const STAGE_H = 847;
const TAU = Math.PI * 2;

// Where each site sits in the painting (stage pixels): its middle, the area
// that takes a tap, where its tag goes, and the round crop (middle and radius)
// that makes its symbol on the reels. Every theme uses the same layout.
export const SITES = [
  { x: 99, y: 229, hit: [52, 182, 96, 92], tag: [99, 282], icon: [84, 228, 38] }, // swing ride
  { x: 245, y: 293, hit: [184, 232, 122, 120], tag: [245, 358], icon: [245, 290, 56] }, // centrepiece spinner
  { x: 124, y: 24, hit: [0, 0, 232, 46], tag: [124, 30], icon: [96, 36, 36] }, // coaster, along the top
  { x: 322, y: 24, hit: [232, 0, 158, 46], tag: [316, 30], icon: [344, 62, 44] }, // big wheel, top right
  { x: 188, y: 446, hit: [118, 398, 146, 118], tag: [188, 512], icon: [176, 442, 58] }, // entrance
  { x: 116, y: 590, hit: [0, 524, 232, 172], tag: [86, 668], icon: [70, 598, 52] }, // parking
  { x: 348, y: 414, hit: [306, 380, 84, 74], tag: [346, 452], icon: [346, 412, 38] }, // restrooms
  { x: 342, y: 248, hit: [298, 214, 92, 72], tag: [342, 290], icon: [348, 244, 36] }, // food stalls
];

const ART = (name) => (window.PARK_ART && window.PARK_ART[name]) || `img/${name}.webp`;
export const parkArt = (town) => ART('park-' + townInfo(town).theme.key);

// A crop of the painting centred on a site, as inline CSS for a thumbnail.
export function siteThumbStyle(town, k, w = 68, h = 58) {
  const s = SITES[k];
  const zoom = k === 5 ? 0.62 : k < 2 || k === 4 ? 0.86 : 1.15;
  const [cx, cy] = [s.x, Math.max(s.y, (h / 2) / zoom)];
  return `background-image:url(${parkArt(town)});background-size:${STAGE_W * zoom}px ${STAGE_H * zoom}px;background-position:${w / 2 - cx * zoom}px ${h / 2 - cy * zoom}px;`;
}

const el = (tag, cls, html) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (html) node.innerHTML = html;
  return node;
};

export function createParkView(world, hooks = {}) {
  const root = el('div', 'pv');
  const layer = el('div', 'pv-world');
  const grey = el('div', 'pv-art pv-grey');
  const colour = el('div', 'pv-art pv-colour');
  const fx = el('canvas', 'pv-fx');
  const ring = el('div', 'pv-ring');
  const pointer = el('div', 'pv-pointer');
  layer.append(grey, colour, ring);
  const sites = SITES.map((s, k) => {
    const hit = el('button', 'pv-site');
    hit.style.cssText = `left:${s.hit[0]}px;top:${s.hit[1]}px;width:${s.hit[2]}px;height:${s.hit[3]}px`;
    hit.addEventListener('click', () => hooks.onSite && hooks.onSite(k));
    const tag = el('div', 'pv-tag');
    tag.style.cssText = `left:${s.tag[0]}px;top:${s.tag[1]}px`;
    layer.append(hit, tag);
    return { hit, tag, shown: -1, key: '' };
  });
  layer.append(pointer, fx);
  root.append(layer);
  const ctx = fx.getContext('2d');

  let town = -1;
  let time = 0;
  let selected = -1;
  let pointAt = -1;
  let shift = 0;
  let scale = 1;
  let syncIn = 0;
  let showUntil = 0;
  let rocketIn = 0;
  const reach = PLOTS.map(() => 0); // how far colour has spread from each site
  const parts = [];

  function setTown() {
    if (world.state.town === town) return;
    town = world.state.town;
    const url = `url(${parkArt(town)})`;
    grey.style.backgroundImage = url;
    colour.style.backgroundImage = url;
    reach.fill(0);
    for (const s of sites) s.key = '';
    // a custom property is resolved against the stylesheet, so give it the full address
    root.style.setProperty('--art', parkArt(town).startsWith('data:') ? url : `url(${new URL(parkArt(town), document.baseURI).href})`);
    hooks.onTheme && hooks.onTheme(townInfo(town));
  }

  // How far colour should reach from a site: nothing until it is built.
  const want = (plot) => (plot.stage <= 0 ? 0 : 74 + plot.stage * 17 + plot.cap * 12);

  function paintMask() {
    const s = world.state;
    if (E.townComplete(s) && reach.every((r, k) => r >= want(s.plots[k]) - 1)) {
      colour.style.webkitMaskImage = colour.style.maskImage = 'none';
      return;
    }
    // the map and takings buttons and the ends of the progress bar are painted
    // into the scene, and always stay in colour
    const parts2 = [[29, 125], [29, 186], [100, 143], [284, 143]].map(([x, y]) => `radial-gradient(circle at ${x}px ${y}px, #000 25px, transparent 31px)`);
    for (let k = 0; k < SITES.length; k++) {
      if (reach[k] < 1) continue;
      parts2.push(`radial-gradient(circle at ${SITES[k].x}px ${SITES[k].y}px, #000 ${(reach[k] * 0.62).toFixed(1)}px, transparent ${reach[k].toFixed(1)}px)`);
    }
    const mask = parts2.join(',');
    colour.style.webkitMaskImage = colour.style.maskImage = mask;
  }

  function syncTags() {
    const s = world.state;
    SITES.forEach((site, k) => {
      const plot = s.plots[k];
      const done = E.siteDone(plot);
      const cost = done ? 0 : E.cheapest(s, k);
      const can = !done && cost != null && s.coins >= cost;
      const rush = E.rushing(s, k);
      // a creature from a finished card set that has moved in here
      const pal = CARD_SETS.find((set) => homeSite(set.index) === k && s.cards.homes[set.index] > 0);
      const key = `${plot.stage}|${plot.cap}|${can}|${cost}|${rush}|${pal ? pal.id : ''}`;
      if (sites[k].key === key) return;
      sites[k].key = key;
      const tag = sites[k].tag;
      const card = pal && pal.cards[8];
      const palIcon = card ? `<u style="background-image:url(${ART(card.sheet)});background-position:${(card.cell % 3) * 50}% ${Math.floor(card.cell / 3) * 50}%"></u>` : '';
      if (plot.stage === 0) {
        tag.className = 'pv-tag build' + (can ? ' can' : '');
        tag.innerHTML = `<b>Build</b> ${money(E.stageCost(s.town, k, 1))}`;
      } else if (done) {
        tag.className = 'pv-tag done' + (rush ? ' rush' : '');
        tag.innerHTML = `${palIcon}<b>${rush ? 'Rush ×2' : 'MAX'}</b>`;
      } else {
        tag.className = 'pv-tag' + (can ? ' can' : '') + (rush ? ' rush' : '');
        tag.innerHTML = `${palIcon}${can ? '<i>▲</i>' : ''}<b>${rush ? 'Rush ×2' : 'Lv.' + plot.stage * 10}</b>`;
      }
    });
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * Math.min(1.5, Math.max(1, scale));
    fx.width = Math.round(STAGE_W * dpr);
    fx.height = Math.round(STAGE_H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Throw a handful of bits into the air from a spot in the park.
  function burst(x, y, n, palette, o = {}) {
    for (let i = 0; i < n; i++) {
      if (parts.length > 400) parts.shift();
      const a = o.up ? -Math.PI / 2 + (Math.random() - 0.5) * 1.7 : Math.random() * TAU;
      const sp = (o.speed || 120) * (0.4 + Math.random() * 0.8);
      parts.push({
        x: x + (Math.random() - 0.5) * (o.spread || 10), y: y + (Math.random() - 0.5) * (o.spreadY ?? o.spread ?? 10),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: o.gravity ?? 320, t: 0, life: (o.life || 0.9) * (0.7 + Math.random() * 0.6),
        size: (o.size || 4) * (0.7 + Math.random() * 0.6), color: palette[Math.floor(Math.random() * palette.length)], shape: o.shape || 'rect',
        rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 14,
      });
    }
  }
  const CONFETTI = ['#ee3a3a', '#ffc83d', '#2f7fe6', '#3fc13a', '#ff5b8f', '#ffffff'];

  // Coins and a number floating up from a site as it takes money.
  function pay(k, text) {
    if (reach[k] < 1) return;
    const s = SITES[k];
    const y = Math.max(s.y - 26, 18);
    burst(s.x, y, 3, ['#ffc83d', '#ffe680'], { up: true, speed: 90, life: 0.7, shape: 'coin', size: 3.4 });
    const pop = el('div', 'pv-pop', text);
    pop.style.cssText = `left:${s.x}px;top:${y}px`;
    layer.append(pop);
    setTimeout(() => pop.remove(), 1300);
  }

  // A site has just been built or upgraded.
  function celebrate(k, big = false) {
    const s = SITES[k];
    const y = Math.max(s.y, 30);
    burst(s.x, y - 10, big ? 70 : 34, CONFETTI, { up: true, speed: 210, life: 1.3, spread: 50 });
    burst(s.x, y + 16, 14, ['#fff8e8', '#f1e6cc'], { up: true, speed: 50, life: 0.9, size: 9, shape: 'puff', spread: 70, spreadY: 10, gravity: -20 });
    sites[k].hit.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.6)' }, { filter: 'brightness(1)' }], { duration: 500 });
    layer.animate([{ transform: `translateY(${-shift}px) scale(1)` }, { transform: `translateY(${-shift}px) scale(1.012)` }, { transform: `translateY(${-shift}px) scale(1)` }], { duration: 260, easing: 'ease-out' });
  }

  function draw(dt) {
    time += dt;
    setTown();
    const s = world.state;
    let moved = false;
    for (let k = 0; k < SITES.length; k++) {
      const goal = want(s.plots[k]);
      if (Math.abs(goal - reach[k]) > 0.5) {
        reach[k] += (goal - reach[k]) * (1 - Math.exp(-dt * 3.2));
        moved = true;
      } else if (reach[k] !== goal) {
        reach[k] = goal;
        moved = true;
      }
    }
    if (moved) paintMask();
    syncIn -= dt;
    if (syncIn <= 0) {
      syncIn = 0.2;
      syncTags();
    }
    // fireworks
    if (time < showUntil) {
      rocketIn -= dt;
      if (rocketIn <= 0) {
        rocketIn = 0.3 + Math.random() * 0.4;
        const [x, y] = [40 + Math.random() * (STAGE_W - 80), 110 + Math.random() * 260];
        burst(x, y + shift, 30, [CONFETTI[Math.floor(Math.random() * CONFETTI.length)], '#ffffff'], { speed: 150, life: 1.0, size: 3, shape: 'spark', gravity: 60 });
        hooks.onBang && hooks.onBang();
      }
    }
    if (!parts.length && !fx.dataset.dirty) return;
    ctx.clearRect(0, 0, STAGE_W, STAGE_H);
    fx.dataset.dirty = parts.length ? '1' : '';
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.t += dt;
      if (p.t >= p.life) {
        parts.splice(i, 1);
        continue;
      }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      const a = 1 - p.t / p.life;
      ctx.globalAlpha = Math.min(1, a * 2);
      ctx.fillStyle = p.color;
      if (p.shape === 'puff') {
        ctx.globalAlpha = a * 0.6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 + (1 - a) * 1.4), 0, TAU);
        ctx.fill();
      } else if (p.shape === 'coin') {
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.size * Math.abs(Math.cos(p.rot)) + 0.8, p.size, 0, 0, TAU);
        ctx.fill();
      } else if (p.shape === 'spark') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1 + a * 2, 0, TAU);
        ctx.fill();
      } else {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  // Slide the park up so a low site clears an open sheet.
  function setShift(px) {
    shift = px;
    layer.style.transform = `translateY(${-shift}px)`;
    // labels that would slide under the top bar step aside
    SITES.forEach((site, k) => { sites[k].tag.style.opacity = px > 0 && site.tag[1] - px < 104 ? '0' : ''; });
  }
  function select(k) {
    selected = k;
    if (k < 0) {
      ring.classList.remove('on');
      setShift(0);
      return;
    }
    const s = SITES[k];
    ring.style.cssText = `left:${s.x}px;top:${Math.max(s.y, 26)}px;width:${s.hit[2] + 14}px;height:${Math.min(s.hit[3], 130) * 0.72 + 14}px`;
    ring.classList.add('on');
    // only the low sites need it; then go far enough that the top of the
    // painting is clear of the screen
    setShift(s.y > 330 ? Math.min(240, s.y - 250) : 0);
  }
  function setPointer(k) {
    if (k === pointAt) return;
    pointAt = k;
    pointer.classList.toggle('on', k >= 0);
    if (k >= 0) pointer.style.cssText = `left:${SITES[k].x}px;top:${Math.max(SITES[k].y - 44, 44)}px`;
  }

  setTown();
  resize();
  paintMask();
  syncTags();

  return {
    el: root,
    layer,
    draw,
    resize,
    pay,
    celebrate,
    burst,
    select,
    setPointer,
    siteEl: (k) => sites[k].tag,
    setScale: (v) => { scale = v; resize(); },
    fireworks: (seconds = 5) => { showUntil = time + seconds; },
    get selected() { return selected; },
    get time() { return time; },
  };
}
