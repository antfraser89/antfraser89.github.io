// The DOM layer: the app shell (HUD, tab bar, the machine page, the park
// page), sheets, mini-games and modals.
// Sheets are built once when opened and refreshed in place, so buttons never
// get replaced under the player's finger.
import {
  ADS, CARDS, CARD_SETS, CURRENCY, GAME_TITLE, ITEMS, PACKS, PARKS_TOTAL, PAY, PLOTS, SYMBOL_ART, WHEEL, STORE_PREVIEW, TOWN_REWARD, UNLOCKS, VAULT, setUnlockTown, townInfo, unlockLevel,
} from './config.js';
import * as E from './economy.js';
import { createFx } from './fx.js';
import { fmt, fmtClock, fmtTime, money } from './format.js';
import { currentMission } from './goals.js';
import { STAGE_H, STAGE_W } from './parkview.js';
import * as G from './game.js';
import { activePet } from './pets.js';
import * as R from './rules.js';
import { installScreens } from './screens/index.js';
import * as S from './sim.js';
import { createSlotView } from './slotview.js';

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === false || v == null) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const setText = (el, text) => {
  if (el.textContent !== text) el.textContent = text;
};
const setHTML = (el, html) => {
  if (el.__html !== html) {
    el.__html = html;
    el.innerHTML = html;
  }
};
const toggle = (el, name, on) => el.classList.toggle(name, !!on);
const show = (el, on) => {
  el.hidden = !on;
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const svg = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICON = {
  build: svg('<path d="M14 5l5 5-2 2-5-5zM12 7l-8 8 3 3 8-8M4 20h7"/>'),
  album: svg('<rect x="4" y="5" width="11" height="15" rx="2"/><path d="M8 5V3h10a2 2 0 0 1 2 2v12h-2M9.500 12.300l1.500-3 1.500 3 3 .4-2.200 2 .6 3-2.900-1.600L8.100 17.700l.6-3-2.200-2z" stroke-width="1.600"/>'),
  events: svg('<path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 14v4M8 20h8"/>'),
  news: svg('<path d="M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7M10 20a2 2 0 0 0 4 0"/>'),
  gear: svg('<path d="M4 7h10M18 7h2M4 12h2M10 12h10M4 17h12M20 17h0"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="18" cy="17" r="2"/>'),
  park: svg('<path d="M12 3v3M3 20h18M5 20v-8l7-6 7 6v8M10 20v-5h4v5"/><path d="M12 3l4 1.500-4 1.500" fill="currentColor"/>'),
  spin: svg('<rect x="3" y="5" width="18" height="14" rx="3.500"/><path d="M9 5v14M15 5v14"/><circle cx="6" cy="12" r="1.300" fill="currentColor"/><circle cx="12" cy="12" r="1.300" fill="currentColor"/><circle cx="18" cy="12" r="1.300" fill="currentColor"/>'),
  shop: svg('<path d="M5 8h14l-1 12H6L5 8zM9 8V6a3 3 0 0 1 6 0v2"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.300v.4"/>'),
  close: svg('<path d="M5 5l14 14M19 5 5 19" stroke-width="3"/>'),
  back: svg('<path d="M14 5l-7 7 7 7" stroke-width="3"/>'),
  stop: svg('<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>'),
};
const STAR = '<span class="star">★</span>';
const img = (src, cls = 'ico') => `<img class="${cls}" src="${src}" alt="">`;

export function createUI({ world, renderer, audio, clock, onSave, onReplaceSave, onReset }) {
  const root = document.getElementById('ui');
  const st = () => world.state;
  const rand = () => Math.random();
  const symURL = (id) => ((window.PARK_ART && window.PARK_ART[SYMBOL_ART[id]]) || `img/${SYMBOL_ART[id]}.webp`);
  const TOKEN = img(symURL('token'));
  const COIN = img(symURL('coin'));
  const CHIPS = img(symURL('chips'));

  const cache = new Map();
  const memo = (key, make) => {
    if (!cache.has(key)) cache.set(key, make());
    return cache.get(key);
  };
  // A card pack: a foil pouch, drawn as a small SVG so it is sharp at any size.
  const PACK_FOIL = {
    bronze: ['#f0a064', '#c66a2c', '#7c3a12', '#ffd9b0'],
    silver: ['#eef3fa', '#aab8cc', '#5f6f8a', '#ffffff'],
    gold: ['#fff0a0', '#ffc02e', '#b86a00', '#fffbe0'],
  };
  const packURL = (type) => memo('pack' + type, () => {
    const [hi, mid, lo, shine] = PACK_FOIL[type] || PACK_FOIL.bronze;
    const teeth = (y, dir) => Array.from({ length: 13 }, (_, i) => `${18 + i * 10.33},${y + (i % 2 ? dir * 7 : 0)}`).join(' ');
    const star = Array.from({ length: 10 }, (_, i) => { const r = i % 2 ? 11 : 26; const a = -Math.PI / 2 + (i * Math.PI) / 5; return `${(80 + Math.cos(a) * r).toFixed(1)},${(112 + Math.sin(a) * r).toFixed(1)}`; }).join(' ');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 220">
<defs><linearGradient id="f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hi}"/><stop offset=".5" stop-color="${mid}"/><stop offset="1" stop-color="${lo}"/></linearGradient>
<linearGradient id="s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${shine}" stop-opacity="0"/><stop offset=".5" stop-color="${shine}" stop-opacity=".75"/><stop offset="1" stop-color="${shine}" stop-opacity="0"/></linearGradient></defs>
<ellipse cx="80" cy="208" rx="52" ry="7" fill="#0b2a66" opacity=".28"/>
<polygon points="${teeth(14, 1)} 142,196 ${teeth(196, -1).split(' ').reverse().join(' ')} 18,14" fill="url(#f)" stroke="${lo}" stroke-width="4" stroke-linejoin="round"/>
<rect x="20" y="32" width="120" height="5" fill="${lo}" opacity=".35"/><rect x="20" y="180" width="120" height="5" fill="${lo}" opacity=".35"/>
<polygon points="34,40 62,40 40,178 22,178 22,60" fill="url(#s)" opacity=".8"/>
<circle cx="80" cy="112" r="40" fill="#fffaf0" stroke="${lo}" stroke-width="4"/>
<circle cx="80" cy="112" r="33" fill="none" stroke="${mid}" stroke-width="2" stroke-dasharray="3 5"/>
<polygon points="${star}" fill="${mid}" stroke="${lo}" stroke-width="3" stroke-linejoin="round"/>
</svg>`;
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  });
  // the pearl dive's shells: closed, opened on treasure, or opened on nothing
  const tubURL = (open, found) => (open && found ? symURL('sack') : symURL('barrel'));
  // One cell of a set's painted sheet, as a background.
  const cellStyle = (card) => `background-image:url(${ART(card.sheet)});background-position:${(card.cell % 3) * 50}% ${Math.floor(card.cell / 3) * 50}%`;
  // A card: its painting, its name, a gem for each star, and a corner tag.
  // The tag sits where the mock-up painted a count, so it is always there.
  function cardFace(card, cls = '') {
    const tag = h('b', { class: 'cardf-tag' }, '×1');
    const el = h('div', { class: `cardf ${cls}${card.gold ? ' gold' : ''}`, role: 'img', 'aria-label': card.name },
      h('div', { class: 'cardf-gems' }, Array.from({ length: card.stars }, () => h('i'))),
      h('div', { class: 'cardf-art', style: cellStyle(card) }),
      tag,
      h('div', { class: 'cardf-name' }, card.name));
    el.setCount = (n) => {
      toggle(el, 'missing', n < 1);
      setText(tag, n < 1 ? '?' : '×' + n);
    };
    return el;
  }
  // A player's face: one cell of the sixteen on img/avatars.webp.
  const faceStyle = (i) => `background-image:url(${ART('avatars')});background-size:400% 400%;background-position:${((i % 4) / 3) * 100}% ${(Math.floor((i % 16) / 4) / 3) * 100}%`;
  const itemIcon = (id) => img(ART(ITEMS[id].icon));

  // "Park!" with its exclamation mark set apart, so it can bounce
  // Artwork cut from the style-guide mockups lives in img/. A single-file build
  // can hand the same pictures over as data URIs in window.PARK_ART.
  // A cannonball has no painting of its own, so it is drawn here.
  const DRAWN = {
    'ico-cannonball': 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><radialGradient id="g" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#e6bcff"/><stop offset=".45" stop-color="#8a3ae0"/><stop offset="1" stop-color="#3f128a"/></radialGradient></defs><circle cx="32" cy="34" r="27" fill="#2a0a5a"/><circle cx="32" cy="31" r="27" fill="url(#g)"/><ellipse cx="23" cy="20" rx="9" ry="6" fill="#fff" opacity=".55" transform="rotate(-28 23 20)"/></svg>'),
  };
  const ART = (name) => DRAWN[name] || (window.PARK_ART && window.PARK_ART[name]) || `img/${name}.webp`;
  const wordmark = () => h('div', { class: 'wordmark' }, h('img', { src: ART('logo'), alt: GAME_TITLE }));
  // The host, in one of his poses: welcome, thumbs, party or sad.
  const host = (cls, pose = 'thumbs') => h('img', { class: cls, src: ART('panda-' + pose), alt: '' });
  // The tab bar's icons.
  const TABICON = {
    shop: `<img src="${ART('tab-shop')}" alt="">`,
    park: `<img src="${ART('tab-park')}" alt="">`,
    machine: `<img src="${ART('tab-slots')}" alt="">`,
    album: `<img src="${ART('tab-album')}" alt="">`,
    events: `<img src="${ART('tab-club')}" alt="">`,
  };

  const click = () => audio.play('click');
  const nope = () => audio.play('error');
  const buzz = (ms) => {
    if (st().settings.haptics && navigator.vibrate) {
      try {
        navigator.vibrate(ms);
      } catch {
        /* not allowed here */
      }
    }
  };

  // What a reward is worth, as text. `raw` rewards hold coins in units.
  function describe(reward, raw = false) {
    if (!reward) return '';
    const parts = [];
    if (reward.tokens) parts.push(`${TOKEN}${fmt(reward.tokens)}`);
    if (reward.coins) parts.push(`${COIN}${fmt(raw ? reward.coins * E.unit(st().town) : reward.coins)}`);
    if (reward.treats) parts.push(`${CHIPS}${reward.treats}`);
    if (reward.wheel) parts.push(`${img(symURL('ball'))}${reward.wheel}`);
    for (const id of Object.keys(ITEMS)) if (reward[id] > 0) parts.push(`${itemIcon(id)}${fmt(reward[id])}`);
    if (reward.boost) parts.push(`<span class="pk gold">2× takings · ${reward.boost} min</span>`);
    if (reward.pack) parts.push(`<span class="pk ${reward.pack}">${PACKS[reward.pack].name}</span>`);
    if (reward.packs) {
      for (const type of Object.keys(PACKS)) {
        const n = reward.packs[type] || 0;
        if (n > 0) parts.push(`<span class="pk ${type}">${n} × ${PACKS[type].name}</span>`);
      }
    }
    return parts.join(' ');
  }

  // ---- HUD ----------------------------------------------------------------

  // The task chip: collect the prize if it is won, otherwise go where the task is.
  function onMission() {
    click();
    const m = currentMission(st());
    if (m.done) {
      const from = missionBtn;
      const reward = S.claimMission(world);
      if (reward && reward.tokens) fly(TOKEN, from, tokenTarget(), 6);
      if (reward && reward.coins) fly(COIN, from, coinCard, 6);
      refresh();
      return;
    }
    goTo(m.go);
  }

  // Take the player to wherever a task or mission is done.
  function goTo(where) {
    const needs = { cards: 'cards', draw: 'draw', merge: 'merge', trail: 'trail', chests: 'chests', club: 'club', missions: 'missions', pass: 'pass', festival: 'festival' }[where];
    if (needs && !E.unlocked(st(), needs)) return lockedToast(needs);
    if (where === 'spin') { closeSheet(); setBase('machine'); }
    else if (where === 'build') openBuild();
    else if (where === 'cards') openAlbum();
    else if (where === 'pet') screens.pets.open();
    else if (where === 'wheel') openWheel();
    else if (where === 'draw') screens.draw.open();
    else if (where === 'merge') screens.merge.open();
    else if (where === 'trail') screens.trail.open();
    else if (where === 'chests') screens.chests.open();
    else if (where === 'free') screens.offers.openFree();
    else if (where === 'club') screens.club.open();
    else if (where === 'missions') screens.missions.open();
    else if (where === 'pass') screens.pass.open();
    else if (where === 'festival') screens.festival.open();
    return undefined;
  }

  const coinsEl = h('b', null, CURRENCY + '0');
  const tillEl = h('small');
  const tokensEl = h('b', null, '0');
  const tokenTimer = h('small');
  const starsEl = h('b', null, '0');
  const starCard = h('button', { class: 'stat-card stars', 'aria-label': 'Your level', onclick: () => { click(); screens.profile.openLevel(); } },
    h('span', { class: 'ico-wrap star-ico' }, '★'), h('div', null, starsEl));
  const coinCard = h('button', { class: 'stat-card coins', 'aria-label': 'Coins. Open the offers', onclick: () => { click(); openShop(); } },
    h('span', { class: 'ico-wrap', html: COIN }), h('div', null, coinsEl, tillEl), h('i', { class: 'plus' }, '+'));
  const tokenCard = h('button', { class: 'stat-card tokens', 'aria-label': 'Spins. Open the offers', onclick: () => { click(); openShop(); } },
    h('span', { class: 'ico-wrap', html: TOKEN }), h('div', null, tokensEl, tokenTimer), h('i', { class: 'plus' }, '+'));
  const gearBtn = h('button', { class: 'round-btn', 'aria-label': 'Menu and settings', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"><path d="M5 6.500h14M5 12h14M5 17.500h14"/></svg>', onclick: () => { click(); screens.profile.openMenu(); } });
  const missionText = h('div', { class: 'goal-text' });
  const missionBar = h('i');
  const missionReward = h('span', { class: 'goal-reward' });
  const missionBtn = h('button', { class: 'goal', onclick: onMission },
    h('span', { class: 'goal-ico' }, '🔨'),
    h('div', { class: 'goal-main' }, missionText, h('div', { class: 'bar' }, missionBar)),
    missionReward);
  const hud = h('div', { class: 'hud' }, h('div', { class: 'hud-row' }, starCard, coinCard, tokenCard, gearBtn), missionBtn);

  // ---- the shell: two base pages and a tab bar ---------------------------------
  // The machine and the park are the two places you can be. Album, events and
  // shop open as full pages over either; everything else is a sheet or pop-up.

  let base = 'machine';
  let baseAt = 0;
  let seenPark = false;

  const setBadge = (btn, n) => {
    show(btn.badge, n > 0);
    if (n > 0) setText(btn.badge, n > 99 ? '99+' : String(n));
  };
  const bump = (el) => {
    el.classList.remove('bump');
    void el.offsetWidth; // restart the animation
    el.classList.add('bump');
  };
  const tabs = {};
  const tab = (key, label, icon, fn) => {
    const badge = h('i', { class: 'badge' });
    const b = h('button', { class: 'tab t-' + key, 'aria-label': label, onclick: () => { click(); fn(); } }, h('span', { html: icon }), h('small', null, label), badge);
    b.badge = badge;
    tabs[key] = b;
    return b;
  };
  const tabbar = h('nav', { class: 'tabbar', 'aria-label': 'Main' }, h('div', { class: 'tabbar-inner' },
    tab('shop', 'Offers', TABICON.shop, () => openShop()),
    tab('park', 'Park', TABICON.park, () => setBase('park')),
    tab('machine', 'Slots', TABICON.machine, () => setBase('machine')),
    tab('album', 'Cards', TABICON.album, () => openAlbum()),
    tab('events', 'Club', TABICON.events, () => (E.unlocked(st(), 'club') ? screens.club.open() : screens.club.openBonus()))));

  // ---- the park page ---------------------------------------------------------
  // These sit over their painted counterparts, inside the park view so that
  // they move with the painting.
  const townChipText = h('span');
  const townChipBar = h('i');
  const townBarText = h('b');
  const townChip = h('button', { class: 'park-chip', 'aria-label': 'Everything in this park', onclick: () => { click(); openBuild(); } }, townChipText);
  const townBar = h('button', { class: 'park-bar', 'aria-label': 'Park progress', onclick: () => { click(); openBuild(); } }, townChipBar, townBarText);
  const mapBtn = h('button', { class: 'pv-hot map', 'aria-label': 'Park map', onclick: () => { click(); openMap(); } });
  const takeBtn = h('button', { class: 'pv-hot takings', 'aria-label': 'Gate takings', onclick: () => { click(); openTakings(); } });
  const chestBtn = h('button', { class: 'pv-hot chest', 'aria-label': 'Park chests', onclick: () => { click(); screens.park.openChest(); } });
  renderer.layer.append(townChip, townBar, mapBtn, takeBtn, chestBtn);
  const parkUI = renderer.el;

  // ---- the slots page ---------------------------------------------------------
  // The scene is the painted machine. Everything live (reels, counters, the
  // bonus track, both rails of shortcuts) is placed exactly over the painting.

  const reelCanvas = h('canvas', { class: 'reels', 'aria-label': 'Slot machine reels' });
  const banner = h('div', { class: 'win-banner' });
  const eventName = h('b');
  const eventBar = h('i');
  const eventText = h('span');
  const bonus = h('button', { class: 'bonus', 'aria-label': 'Event prizes', onclick: () => { click(); screens.club.openBonus(); } }, eventName, h('div', { class: 'bar' }, eventBar), eventText);
  const betVal = h('b', null, 'BET x1');
  const betMinus = h('button', { class: 'bet-arrow', 'aria-label': 'Lower the bet', onclick: () => stepBet(-1) });
  const betPlus = h('button', { class: 'bet-arrow', 'aria-label': 'Raise the bet', onclick: () => stepBet(1) });
  const betBox = h('div', { class: 'bet-box' }, betMinus, h('div', { class: 'bet-val' }, betVal), betPlus);
  const autoBtn = h('div', { class: 'auto-chip' }, 'AUTO · tap to stop');
  const spinLabel = h('b', null, 'SPIN');
  const spinCost = h('small');
  const spinBtn = h('button', { class: 'spin-btn', 'aria-label': 'Spin' }, h('span', { class: 'spin-dome' }), h('span', { class: 'spin-face' }, spinLabel, spinCost));
  const gaugeCount = h('b');
  const gaugeTimer = h('small');
  const gauge = h('button', { class: 'gauge', 'aria-label': 'Spins. Open the offers', onclick: () => { click(); openShop(); } }, gaugeCount, gaugeTimer);
  const adLine = h('b');
  const adBtn = h('button', { class: 'ad-btn', 'aria-label': 'Watch an advert for free spins', onclick: () => { click(); adTokens(adBtn); } },
    h('span', { class: 'ad-play' }, '▶'), h('span', null, 'Watch ad'), adLine);
  const windowEl = h('div', { class: 'window' }, reelCanvas);
  const cabinet = h('div', { class: 'cabinet' }, windowEl);
  const mCab = cabinet;

  // Shortcuts either side of the machine: offers and freebies on the left,
  // games and events on the right. Each sits on its painted icon.
  const rails = {};
  const rail = (key, side, i, label, fn, needs = null) => {
    const left = side === 'l';
    const badge = h('i', { class: 'badge' });
    const pill = h('span', { class: 'rail-pill' }, label);
    const hot = h('button', { class: 'rail-hot', 'aria-label': label, style: `left:${left ? 5.4 : 339}px;top:${(left ? 107.2 : 108.7) + i * (left ? 59.5 : 59.7)}px`, onclick: () => { click(); if (needs && !E.unlocked(st(), needs)) return lockedToast(needs); return fn(hot); } }, badge);
    pill.style.cssText = `left:${left ? 4 : 337.5}px;top:${(left ? 147.9 : 151.3) + i * (left ? 59.6 : 59.4)}px`;
    badge.hidden = true;
    hot.badge = badge;
    hot.pill = pill;
    hot.label = label;
    hot.needs = needs;
    rails[key] = hot;
    return [hot, pill];
  };
  // `needs` names the feature a shortcut belongs to; until the player's level
  // opens it, the shortcut is dimmed and says which level it wants.
  const railEls = [
    rail('daily', 'l', 0, 'Gift', () => screens.profile.openDaily()),
    rail('offers', 'l', 1, 'Offers', () => openShop()),
    rail('lucky', 'l', 2, 'Lucky', () => luckyTap()),
    rail('coins', 'l', 3, 'Coins', () => openShop('coins')),
    rail('starter', 'l', 4, 'Bundles', () => openShop('bundle')),
    rail('free', 'l', 5, 'Free', () => screens.offers.openFree()),
    rail('pass', 'l', 6, 'Pass', () => screens.pass.open(), 'pass'),
    rail('vault', 'l', 7, 'Vault', () => openVault(), 'cards'),
    rail('noads', 'l', 8, 'Stamps', () => screens.offers.openStamps()),
    rail('wheel', 'r', 0, 'Wheel', () => openWheel()),
    rail('trail', 'r', 1, 'Trail', () => screens.trail.open(), 'trail'),
    rail('draw', 'r', 2, 'Draw', () => screens.draw.open(), 'draw'),
    rail('pet', 'r', 3, 'Pets', () => screens.pets.open()),
    rail('tasks', 'r', 4, 'Missions', () => screens.missions.open(), 'missions'),
    rail('event', 'r', 5, 'Festival', () => screens.festival.open(), 'chests'),
    rail('bonus', 'r', 6, 'Bonus', () => screens.club.openBonus()),
    rail('league', 'r', 7, 'Team', () => screens.club.open(), 'club'),
    rail('merge', 'r', 8, 'Merge', () => screens.merge.open(), 'merge'),
  ];
  const perch = rails.pet;
  const machine = h('section', { class: 'machine', 'aria-label': 'The slot machine' },
    railEls, bonus, banner, cabinet, betBox, gauge, spinBtn, autoBtn, adBtn);
  // spins are counted on the machine itself while it is on show, and in the top bar elsewhere
  const tokenTarget = () => (root.classList.contains('on-machine') ? gauge : tokenCard);
  const fxCanvas = h('canvas', { id: 'fx', 'aria-hidden': 'true' });
  const fx = createFx(fxCanvas);

  function syncTabs() {
    const active = current && current.tab ? current.tab : base;
    for (const [key, b] of Object.entries(tabs)) toggle(b, 'on', key === active);
    const page = !!(current && current.page);
    toggle(parkUI, 'on', base === 'park' && !page);
    toggle(root, 'on-machine', base === 'machine' && !page);
    toggle(root, 'hud-machine', base === 'machine'); // the painted bar behind it is laid out differently on each page
  }

  // Switch between the machine and the park.
  function setBase(next) {
    closeSheet();
    if (base === next) return;
    base = next;
    baseAt = performance.now();
    setAuto(false);
    toggle(machine, 'away', base !== 'machine');
    audio.play('swish');
    seenPark = seenPark || base === 'park';
    syncTabs();
    refresh();
  }

  function stepBet(dir) {
    const s = st();
    const bets = E.availableBets(s);
    const i = Math.max(0, bets.indexOf(s.bet));
    const next = bets[Math.max(0, Math.min(bets.length - 1, i + dir))];
    if (next === s.bet) return nope();
    click();
    R.setBet(s, next);
    bump(betVal);
    return refresh();
  }

  // What three of each symbol does, with real amounts for this town and bet.
  function paytable() {
    const s = st();
    const u = E.unit(s.town) * s.bet;
    const row = (syms, text, value) => h('div', { class: 'pay-row' },
      h('div', { class: 'syms', html: syms.map((x) => `<img src="${symURL(x)}" alt="">`).join('') }), h('span', { html: text }), h('b', { html: value }));
    modal([
      h('div', { class: 'kicker' }, `At a bet of ×${s.bet}`),
      h('h2', null, 'What the reels pay'),
      row(['star', 'star', 'star'], '<b>Jackpot</b> and a silver pack', money(PAY.jackpot * u)),
      row(['sack', 'sack', 'sack'], 'Three chests', money(PAY.sacks3 * u)),
      row(['coin', 'coin', 'coin'], 'Three coins', money(PAY.coins3 * u)),
      row(['sack'], 'Each chest on the line', money(PAY.sack * u)),
      row(['coin'], 'Each coin on the line', money(PAY.coin * u)),
      row(['barrel', 'barrel', 'barrel'], '<b>Pearl dive!</b> Three goes at four shells', `up to ${money(PAY.raidStash[1] * u * E.raidBonus(s))}`),
      row(['ball', 'ball', 'ball'], '<b>Prize wheel!</b> A turn on the wheel', `+${s.bet}`),
      row(['token', 'token', 'token'], 'Free spins', `+${PAY.tokens * s.bet}`),
      row(['chips', 'chips', 'chips'], 'Cherries for your pet', `+${PAY.treats * s.bet}`),
      row(['fish'], 'Starfish pay nothing', '–'),
      h('p', { class: 'fineprint' }, 'Prizes grow with your bet and with every park you reach.'),
      h('div', { class: 'actions' }, h('button', { class: 'btn big wide', onclick: () => { click(); closeModal(); } }, 'Got it')),
    ]);
  }

  let auto = false;
  let held = null; // the result waiting for the reels to stop
  let hideBanner = 0;
  const shown = { coins: st().coins, tokens: st().tokens };

  const slot = createSlotView(reelCanvas, {
    onTick: () => audio.play('tick'),
    onReelStop: () => {
      audio.play('clunk');
      buzz(8);
      // each reel lands with a little thump
      windowEl.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(3px)' }, { transform: 'translateY(0)' }], { duration: 130, easing: 'ease-out' });
    },
    onTease: () => {
      audio.play('tease');
      buzz([10, 50, 10, 50, 10]);
    },
    onStop: () => reveal(),
  });

  function shake() {
    mCab.classList.remove('shake');
    void mCab.offsetWidth; // restart the animation
    mCab.classList.add('shake');
    setTimeout(() => mCab.classList.remove('shake'), 500);
  }

  // The headline moment: huge lettering over the park.
  function bigWin(title, sub) {
    const el = h('div', { class: 'bigwin' }, h('span', null, title), h('b', null, sub));
    root.append(el);
    setTimeout(() => el.remove(), 2300);
  }

  // press and hold the spin button for auto-spin
  let holdTimer = null;
  let heldLong = false;
  spinBtn.addEventListener('pointerdown', () => {
    heldLong = false;
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      heldLong = true;
      setAuto(!auto);
      if (auto) doSpin();
    }, 480);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) spinBtn.addEventListener(ev, () => clearTimeout(holdTimer));
  spinBtn.addEventListener('click', () => {
    if (heldLong) {
      heldLong = false;
      return;
    }
    if (auto) {
      setAuto(false);
      return;
    }
    doSpin();
  });

  function setAuto(on) {
    auto = on;
    toggle(spinBtn, 'auto', on);
    toggle(autoBtn, 'on', on);
    if (on) buzz(20);
  }

  const busy = () => !!overlayEl || !!modalEl;

  let counting = 0;
  function say(html, cls = '', ms = 1500) {
    counting++;
    banner.className = 'win-banner on ' + cls;
    setHTML(banner, html);
    banner.__html = null;
    hideBanner = performance.now() + ms;
  }
  // A win that counts up across the sign.
  function sayCount(amount, cls, ms) {
    say(`+${money(0)}`, cls, ms);
    const id = counting;
    const t0 = performance.now();
    const dur = Math.min(1200, ms * 0.5);
    const step = (t) => {
      if (id !== counting) return;
      const u = Math.min(1, (t - t0) / dur);
      banner.textContent = `+${money(amount * (1 - Math.pow(1 - u, 3)))}`;
      if (u < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  // the room lights up for a proper win
  function lightUp(ms) {
    machine.classList.add('win');
    setTimeout(() => machine.classList.remove('win'), ms);
  }

  function doSpin() {
    audio.unlock();
    if (busy()) return;
    if (base !== 'machine' || current) {
      setBase('machine'); // spinning happens on the machine page
      return;
    }
    if (slot.spinning) {
      slot.skip();
      return;
    }
    const s = st();
    if (s.pending) {
      openPending();
      return;
    }
    const res = R.spin(s, rand, clock());
    if (!res.ok) {
      const wasAuto = auto;
      setAuto(false);
      nope();
      const secs = R.nextTokenIn(s, clock());
      say(secs > 0 ? `Out of spins. Next one in ${fmtClock(secs)}` : 'Out of spins', 'quiet', 2200);
      tokenTarget().animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }], { duration: 260 });
      if (!wasAuto) outOfTokens();
      return;
    }
    held = res;
    banner.classList.remove('on');
    audio.play('spin');
    buzz(12);
    cabinet.classList.remove('won');
    cabinet.classList.add('spinning');
    slot.spin(res.reels, auto || st().settings.fast, res.kind !== 'mixed');
    refresh();
  }

  // The reels have stopped: show what the spin won.
  function reveal() {
    const res = held;
    held = null;
    if (!res) return;
    const mask = res.kind === 'mixed' ? res.reels.map((sym) => sym === 'coin' || sym === 'sack') : [true, true, true];
    const big = res.kind === 'jackpot' || res.kind === 'sacks3';
    if (mask.some(Boolean) && (res.kind !== 'mixed' || res.coins > 0)) slot.flash(mask, big ? 2.2 : 1.2);
    cabinet.classList.remove('spinning');
    if (res.kind !== 'mixed') {
      cabinet.classList.add('won');
      setTimeout(() => cabinet.classList.remove('won'), big ? 2400 : 1300);
    }
    switch (res.kind) {
      case 'mixed':
        if (res.coins > 0) {
          say(`+${money(res.coins)}`, 'coins');
          audio.play('coin');
          fly(COIN, reelCanvas, coinCard, 4);
        }
        break;
      case 'coins3':
        sayCount(res.coins, 'coins big', 1800);
        lightUp(1500);
        audio.play('win');
        fly(COIN, reelCanvas, coinCard, 9);
        fx.rain(18);
        break;
      case 'sacks3':
        sayCount(res.coins, 'coins big', 2600);
        lightUp(2400);
        audio.play('bigwin');
        fly(COIN, reelCanvas, coinCard, 16);
        fx.rain(80);
        bigWin('Big win!', `+${money(res.coins)}`);
        shake();
        buzz([30, 40, 30]);
        break;
      case 'jackpot':
        sayCount(res.coins, 'jackpot', 3200);
        lightUp(3200);
        audio.play('jackpot');
        fly(COIN, reelCanvas, coinCard, 22);
        fx.rain(190);
        bigWin('Jackpot!', `+${money(res.coins)}`);
        shake();
        renderer.fireworks(4);
        buzz([40, 40, 40, 40, 80]);
        toast(`Jackpot! A ${PACKS.silver.name.toLowerCase()} is waiting in your cards.`, 'gold');
        break;
      case 'wheel':
        say(res.wheel > 1 ? `${res.wheel} turns on the wheel!` : 'A turn on the wheel!', 'tokens', 1700);
        audio.play('fanfare');
        fly(`<img class="ico" src="${symURL('ball')}" alt="">`, reelCanvas, rails.wheel, 5);
        buzz([20, 30, 20]);
        break;
      case 'tokens':
        say(`+${res.tokens} free spins`, 'tokens');
        audio.play('token');
        fly(TOKEN, reelCanvas, tokenTarget(), 6);
        break;
      case 'treats':
        say(`+${res.treats} cherries for ${activePet(st()).name}`, 'treats');
        audio.play('token');
        fly(CHIPS, reelCanvas, perch, 5);
        break;
      case 'raid':
        say('PEARL DIVE!', 'raid', 1200);
        shake();
        audio.play('fanfare');
        buzz([30, 30, 60]);
        break;
      default:
        break;
    }
    for (const m of res.milestones) toast(`Event prize: ${describe(m)}`, 'gold');
    refresh();
    if (res.pending) {
      setAuto(false);
      setTimeout(openPending, 750);
    } else if (auto) {
      setTimeout(() => {
        if (auto && !busy() && !slot.spinning) doSpin();
      }, res.kind === 'mixed' ? 280 : 900);
    }
  }

  // Coins (or tokens) hop from one element to another.
  // Where an element sits on the stage, in stage pixels (the stage is scaled to fit the screen).
  function place(node) {
    const r = node.getBoundingClientRect();
    const o = root.getBoundingClientRect();
    const k = o.width / STAGE_W || 1;
    return { left: (r.left - o.left) / k, top: (r.top - o.top) / k, width: r.width / k, height: r.height / k, right: (r.right - o.left) / k, bottom: (r.bottom - o.top) / k };
  }

  function fly(iconHTML, from, to, count) {
    const a = place(from);
    const b = place(to);
    for (let k = 0; k < count; k++) {
      const el = h('div', { class: 'fly', html: iconHTML });
      const sx = a.left + a.width * (0.25 + Math.random() * 0.5);
      const sy = a.top + a.height * (0.3 + Math.random() * 0.4);
      const ex = b.left + Math.min(b.width / 2, 22);
      const ey = b.top + b.height / 2;
      root.append(el);
      const mx = (sx + ex) / 2 + (Math.random() - 0.5) * 120;
      const my = Math.min(sy, ey) - 40 - Math.random() * 60;
      const anim = el.animate([
        { transform: `translate(${sx}px, ${sy}px) scale(0.6)`, opacity: 0 },
        { transform: `translate(${sx}px, ${sy}px) scale(1.1)`, opacity: 1, offset: 0.12 },
        { transform: `translate(${mx}px, ${my}px) scale(1)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${ex}px, ${ey}px) scale(0.5)`, opacity: 0.9 },
      ], { duration: 620 + Math.random() * 260, delay: k * 34, easing: 'ease-in-out', fill: 'backwards' });
      anim.onfinish = () => el.remove();
      anim.oncancel = () => el.remove();
    }
    to.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 300, delay: 560 });
  }

  // ---- sheets ---------------------------------------------------------------

  const sheetTitle = h('div', { class: 'sheet-title' });
  const sheetBack = h('button', { class: 'close-btn', 'aria-label': 'Back', html: ICON.back });
  const sheetBody = h('div', { class: 'sheet-body' });
  const sheet = h('div', { class: 'sheet', role: 'dialog' },
    h('div', { class: 'sheet-head' }, sheetBack, sheetTitle,
      h('button', { class: 'close-btn', 'aria-label': 'Close', html: ICON.close, onclick: () => { click(); closeSheet(); } })),
    sheetBody);
  let current = null;

  // opts: back (a function for the back arrow), page (fill the screen), tab
  // (which tab to light up while it is open)
  function setSheet(key, title, body, refreshFn, opts = {}) {
    setAuto(false);
    sheetTitle.replaceChildren(...[title].flat());
    sheetBody.replaceChildren(...[body].flat(Infinity).filter(Boolean));
    sheetBody.scrollTop = 0;
    show(sheetBack, !!opts.back);
    sheetBack.onclick = opts.back ? () => { click(); opts.back(); } : null;
    toggle(sheet, 'page', !!opts.page);
    toggle(sheet, 'site', !!opts.site);
    current = { key, refresh: refreshFn, tab: opts.tab || null, page: !!opts.page };
    sheet.classList.add('open');
    refreshFn();
    syncTabs();
  }

  function closeSheet() {
    if (!current) return;
    current = null;
    sheet.classList.remove('open');
    renderer.select(-1);
    syncTabs();
  }

  // ---- scenes --------------------------------------------------------------------
  // A scene is a painted full-screen page (a side game). Its live parts are
  // placed in stage pixels over the painting, the way the slots page is built.

  const sceneEl = h('div', { class: 'scene' });
  let sceneNow = null;
  function openScene(key, art, nodes, refreshFn, opts = {}) {
    setAuto(false);
    closeSheet();
    sceneEl.className = 'scene on s-' + key;
    sceneEl.style.backgroundImage = art ? `url(${ART(art)})` : '';
    sceneEl.replaceChildren(...[nodes].flat(Infinity).filter(Boolean));
    sceneNow = { key, refresh: refreshFn || (() => {}), onClose: opts.onClose || null };
    audio.play('swish');
    sceneNow.refresh();
    coach(null);
  }
  function closeScene() {
    if (!sceneNow) return;
    const was = sceneNow;
    sceneNow = null;
    sceneEl.classList.remove('on');
    sceneEl.replaceChildren();
    if (was.onClose) was.onClose();
    refresh();
  }
  // Put an element at a spot on the stage.
  const at = (el, x, y, w, ht) => {
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    if (w != null) el.style.width = w + 'px';
    if (ht != null) el.style.height = ht + 'px';
    return el;
  };
  // An invisible button over something painted.
  const hot = (x, y, w, ht, label, fn, cls = '') => at(h('button', { class: 'hot ' + cls, 'aria-label': label, onclick: () => { click(); fn(); } }), x, y, w, ht);
  // The round "i" and "x" buttons most paintings have in their top corners.
  const sceneClose = (x, y, fn = closeScene, drawn = false) => hot(x - 22, y - 22, 44, 44, 'Close', fn, drawn ? 'drawn-x' : '');
  // The "i" button. The first time a screen is opened it explains itself unasked.
  const sceneInfo = (x, y, title, lines, drawn = false) => {
    const show1 = () => modal(howTo(title, lines));
    const key = 'how-' + title.toLowerCase().replace(/[^a-z]+/g, '').slice(0, 18);
    if (!st().seen[key]) {
      st().seen[key] = true;
      setTimeout(show1, 350);
    }
    return hot(x - 22, y - 22, 44, 44, 'How it works', show1, drawn ? 'drawn-i' : '');
  };
  const howTo = (title, lines) => ([
    h('h2', null, title), h('div', { class: 'how' }, lines.map((line) => h('p', { html: line }))),
    h('div', { class: 'actions' }, h('button', { class: 'btn big wide', onclick: () => { click(); closeModal(); } }, 'Got it')),
  ]);

  // ---- the park's own screens live in screens/park.js --------------------------

  const openBuild = (k = -1) => screens.park.openBuild(k);
  const openMap = () => screens.park.openMap();
  const openTakings = () => screens.park.openStats();

  // ---- the park map, takings, tasks ------------------------------------------------

  // The task in hand, and what comes after it.
  function openMissions() {
    const s = st();
    const m = currentMission(s);
    modal([
      h('div', { class: 'kicker' }, `Task ${s.mission.index + 1}`),
      h('h2', null, m.text),
      h('div', { class: 'bar task-bar' }, h('i', { style: `width:${Math.min(100, (m.cur / m.target) * 100)}%` })),
      h('p', { html: `<b>${fmt(Math.min(m.cur, m.target))} of ${fmt(m.target)}</b> · prize: ${describe(m.reward)}` }),
      h('div', { class: 'actions' },
        h('button', { class: 'btn plain big', onclick: () => { click(); closeModal(); } }, 'Close'),
        h('button', { class: 'btn big', onclick: () => { click(); closeModal(); onMission(); } }, m.done ? 'Collect' : 'Go')),
    ]);
  }

  function openDive() {
    const s = st();
    modal([
      h('img', { class: 'big-sym', src: symURL('barrel'), alt: '' }),
      h('h2', null, 'Pearl dive'),
      h('p', { html: 'Line up <b>three shells</b> on the reels to go diving. Three of four shells hold treasure, and you get three goes. A bigger bet means a bigger haul.' }),
      h('p', { html: `Dives so far: <b>${fmt(s.stats.raids)}</b> · clean sweeps: <b>${fmt(s.stats.sweeps)}</b>` }),
      h('div', { class: 'actions' }, h('button', { class: 'btn big wide', onclick: () => { click(); closeModal(); } }, 'Got it')),
    ]);
  }

  // One free turn on the wheel every day.
  function luckyTap() {
    const s = st();
    const today = R.dayNumber(clock());
    if (s.wheel.day !== today) {
      s.wheel.day = today;
      s.wheel.tickets++;
      toast('Today’s free turn on the wheel!', 'gold');
      onSave();
    }
    openWheel();
  }

  // ---- the prize wheel ---------------------------------------------------------

  function openWheel() {
    const n = WHEEL.length;
    const icon = (reward) => (reward.pack ? packURL(reward.pack) : symURL(reward.tokens ? 'token' : reward.treats ? 'chips' : reward.coins >= 100 ? 'sack' : 'coin'));
    const label = (reward) => (reward.pack ? PACKS[reward.pack].name.replace(' pack', '') : reward.tokens ? fmt(reward.tokens) : reward.treats ? fmt(reward.treats) : money(reward.coins * E.unit(st().town)));
    const disc = h('div', { class: 'wheel-disc', style: `background:conic-gradient(from ${-180 / n}deg, ${WHEEL.map((_, i) => `${['#ff5b8f', '#ffc83d', '#2f9cf5', '#8b66ff'][i % 4]} ${(i / n) * 360}deg ${((i + 1) / n) * 360}deg`).join(',')})` },
      WHEEL.map((wedge, i) => h('div', { class: 'wheel-prize', style: `transform:rotate(${(i / n) * 360}deg) translateY(-98px)` }, h('img', { src: icon(wedge.reward), alt: '' }), h('b', null, label(wedge.reward)))));
    const tickets = h('div', { class: 'kicker' });
    const result = h('div', { class: 'result' });
    const go = h('button', { class: 'btn big gold' });
    let turned = 0;
    let busyNow = false;
    const update = () => {
      const left = st().wheel.tickets;
      setText(tickets, left === 1 ? '1 turn left' : `${left} turns left`);
      setText(go, left > 0 ? 'Spin the wheel' : 'No turns left');
      go.disabled = busyNow || left < 1;
    };
    go.addEventListener('click', () => {
      const turn = R.wheelSpin(st(), rand);
      if (!turn) return nope();
      busyNow = true;
      setHTML(result, '');
      update();
      audio.play('spin');
      // land with the winning wedge under the pointer at the top
      const at = (((-turn.index / n) * 360) % 360 + 360) % 360;
      turned = Math.ceil(turned / 360) * 360 + 360 * 4 + at;
      disc.style.transform = `rotate(${turned}deg)`;
      setTimeout(() => {
        busyNow = false;
        audio.play('win');
        buzz([20, 30, 20]);
        setHTML(result, `You won <b>${describe(turn.reward)}</b>`);
        fx.rain(14);
        refresh();
        update();
        onSave();
      }, 3300);
    });
    overlay('wheel', [
      h('div', { class: 'kicker' }, 'Prize wheel'),
      h('div', { class: 'pwheel' }, disc, h('div', { class: 'wheel-pin' }), h('div', { class: 'wheel-hub' }, h('img', { src: symURL('ball'), alt: '' }))),
      tickets, result,
      h('p', { class: 'fineprint' }, 'Three beach balls on the reels win a turn. So does the Lucky shortcut, once a day.'),
      h('div', { class: 'actions' }, h('button', { class: 'btn plain big', onclick: () => { if (busyNow) return; click(); closeOverlay(); refresh(); } }, 'Close'), go),
    ]);
    update();
  }

  let prompted = -1; // the town we have already offered to leave
  function townDone() {
    if (!E.townComplete(st())) {
      nextPopup(); // already moved on: let anything queued behind this show
      return;
    }
    const s = st();
    renderer.fireworks(5);
    celebrate({
      kicker: 'Park complete!',
      title: townInfo(s.town).name,
      sub: `Every ride and every facility at the top level. Open <b>${townInfo(s.town + 1).name}</b> and these are yours.`,
      reward: TOWN_REWARD,
      raw: true,
      actions: [['Stay a while', null, 'btn plain big'], ['Next park', () => travelNow(), 'btn gold big']],
    });
  }

  async function travelNow() {
    if (!E.townComplete(st())) return nope();
    const next = townInfo(st().town + 1);
    closeSheet();
    await interstitial('travel');
    if (!E.townComplete(st())) return undefined;
    return curtain(next.name, next.tag, () => {
      const moved = R.travel(st());
      S.resetWorld(world);
      onSave();
      if (moved) toast(`Welcome to <b>${next.name}</b>! ${describe(moved.reward)}`, 'gold');
    });
  }

  // ---- album ----------------------------------------------------------------

  function openAlbum() {
    const have = h('div', { class: 'note' });
    const packTiles = Object.keys(PACKS).map((type) => {
      const count = h('b');
      const openBtn = h('button', { class: 'btn small', onclick: () => openPack(type) }, 'Open');
      const buyBtn = h('button', { class: 'btn plain small', onclick: () => {
        if (!R.buyPack(st(), type)) return nope();
        audio.play('upgrade');
        refresh();
      } });
      return { type, count, openBtn, buyBtn, el: h('div', { class: 'pack-tile ' + type }, h('img', { src: packURL(type), alt: '' }), h('div', { class: 'pk-name' }, PACKS[type].name, count), openBtn, buyBtn) };
    });
    const vaultBtn = h('button', { class: 'btn gold wide', onclick: () => { click(); openVault(); } });
    const albumBtnBig = h('button', { class: 'btn gold big wide', onclick: () => {
      const reward = R.claimAlbum(st());
      if (!reward) return nope();
      celebrate({ kicker: 'Album complete!', title: `Season ${st().cards.season - 1} finished`, sub: 'Every card collected. A fresh season of cards starts now.', reward });
      onSave();
      refresh();
    } }, 'Claim the album prize');
    const tiles = CARD_SETS.map((set) => {
      const s = set.index;
      const dots = set.cards.map(() => h('i'));
      const state = h('div', { class: 'set-state' });
      const claim = h('button', { class: 'btn small gold', onclick: (e) => {
        e.stopPropagation();
        const reward = R.claimSet(st(), s);
        if (!reward) return nope();
        celebrate({ kicker: 'Set complete!', title: set.name, sub: 'All nine cards, safe in the album.', reward });
        onSave();
        refresh();
      } }, 'Claim');
      const el = h('button', { class: 'set-tile', style: `--set:${set.color}`, onclick: () => { click(); openSet(s); } },
        h('div', { class: 'set-art' }, h('i', { style: cellStyle(set.cards[8]) })),
        h('div', { class: 'set-name' }, set.name), h('div', { class: 'dots' }, dots), state, claim);
      return { s, set, dots, state, claim, el };
    });
    setSheet('album', 'Cards', [have, h('div', { class: 'packs' }, packTiles.map((p) => p.el)), vaultBtn, albumBtnBig, h('div', { class: 'sets' }, tiles.map((t) => t.el))], () => {
      const s = st();
      const sets = R.unlockedSets(s);
      setHTML(have, `Season ${s.cards.season} · <b>${R.cardsOwned(s)} of ${CARDS.length}</b> cards. Finish a set for spins; finish the album for <b>${TOKEN}500</b>.`);
      for (const p of packTiles) {
        const n = s.cards.packs[p.type];
        setText(p.count, n > 0 ? ` ×${n}` : '');
        show(p.openBtn, n > 0);
        show(p.buyBtn, n === 0);
        const price = E.packPrice(s.town, p.type);
        setHTML(p.buyBtn, money(price));
        p.buyBtn.disabled = s.coins < price;
      }
      setHTML(vaultBtn, `Star vault · ${STAR} ${fmt(s.cards.stars)} from spare cards`);
      show(albumBtnBig, R.albumComplete(s));
      for (const t of tiles) {
        const unlocked = sets.includes(t.s);
        toggle(t.el, 'locked', !unlocked);
        t.set.cards.forEach((c, i) => {
          toggle(t.dots[i], 'on', R.hasCard(s, c.id));
          toggle(t.dots[i], 'gold', c.gold);
        });
        const complete = R.setComplete(s, t.s);
        show(t.claim, complete && !s.cards.sets[t.s]);
        setHTML(t.state, !unlocked ? `Opens at park ${setUnlockTown(t.s) + 1}`
          : s.cards.sets[t.s] ? 'Complete ✓'
            : complete ? '' : `${R.setCount(s, t.s)}/9 · prize ${TOKEN}${t.set.reward}`);
      }
    }, { page: true, tab: 'album' });
  }

  function openSet(s) {
    const set = CARD_SETS[s];
    const cells = set.cards.map((c) => {
      const face = cardFace(c);
      const el = h('div', { class: 'card-cell', onclick: () => {
        const n = st().cards.owned[c.id] || 0;
        if (n > 0) {
          click();
          zoomCard(c, n);
        }
      } }, face);
      return { c, face, el };
    });
    const note = h('div', { class: 'note' });
    setSheet('set:' + s, set.name, [note, h('div', { class: 'card-grid' }, cells.map((c) => c.el))], () => {
      const state = st();
      setHTML(note, `Collect all nine for <b>${TOKEN}${set.reward}</b>. The five-star card is gold: it only comes from gold packs and the star vault.`);
      for (const cell of cells) {
        const n = state.cards.owned[cell.c.id] || 0;
        cell.face.setCount(n);
        toggle(cell.el, 'has', n > 0);
      }
    }, { back: openAlbum, page: true, tab: 'album' });
  }

  function openVault() {
    const have = h('div', { class: 'note' });
    const rows = VAULT.map((tier) => {
      const btn = h('button', { class: 'btn gold', onclick: () => {
        const got = R.vaultBuy(st(), tier.id, rand);
        if (!got) return nope();
        audio.play('milestone');
        onSave();
        refresh();
        if (got.cards.length) showCards(got.cards, got.pack ? `A ${PACKS[got.pack].name.toLowerCase()} is in your album too.` : '');
        else toast(`${PACKS[got.pack].name} added to your album.`, 'gold');
      } });
      const sub = h('div', { class: 'sub' });
      return { tier, btn, sub, el: h('div', { class: 'row' }, h('div', { class: 'meta' }, h('div', { class: 'name' }, tier.name), sub), h('div', { class: 'side-col' }, btn)) };
    });
    setSheet('vault', 'Star vault', [have, rows.map((r) => r.el)], () => {
      const s = st();
      setHTML(have, `Spare cards turn into stars. You have <b>${STAR} ${fmt(s.cards.stars)}</b>. Everything here is something you do not own yet.`);
      for (const r of rows) {
        const offer = R.vaultOffer(s, r.tier.id);
        setHTML(r.btn, `${STAR} ${r.tier.cost}`);
        r.btn.disabled = !offer.affordable || !offer.available;
        setText(r.sub, r.tier.gold ? (offer.available ? 'Picks a gold card missing from your album' : 'You have every gold card on offer')
          : r.tier.fresh ? 'Four cards, plus one you are guaranteed not to have' : 'Three cards from the sets you have unlocked');
      }
    }, { back: openAlbum, page: true, tab: 'album' });
  }

  function openPack(type) {
    const cards = R.openPack(st(), type, rand);
    if (!cards) return nope();
    onSave();
    refresh();
    return showCards(cards, '', type);
  }

  // The reveal: cards arrive face down and flip one at a time.
  function showCards(cards, note = '', packType = null) {
    const row = h('div', { class: 'reveal-row' + (cards.length <= 3 ? ' few' : '') });
    const title = h('h2', null, packType ? PACKS[packType].name : 'New cards');
    const more = h('div', { class: 'actions' });
    const foot = h('p', { class: 'fineprint' }, note);
    const packImg = packType ? h('img', { class: 'pack-big painted ' + packType, src: ART('pack-art'), alt: '' }) : null;
    overlay('reveal', [title, packImg, row, foot, more], { dismiss: false });
    const flips = cards.map((c) => {
      const def = CARDS.find((d) => d.id === c.id);
      const tag = h('div', { class: 'tag ' + (c.isNew ? 'new' : 'dupe'), html: c.isNew ? 'NEW' : `+${c.stars} ${STAR}` });
      const el = h('div', { class: 'flip' + (def.gold ? ' gold' : '') },
        h('div', { class: 'flip-inner' },
          h('div', { class: 'flip-back' }),
          cardFace(def, 'flip-front')),
        h('div', { class: 'shine' }), tag);
      return { el, def, c };
    });
    (async () => {
      if (packImg) {
        audio.play('pack');
        await wait(650);
        packImg.classList.add('gone');
        await wait(260);
        packImg.remove();
      }
      for (const f of flips) row.append(f.el);
      await wait(250);
      for (const f of flips) {
        f.el.classList.add('shown');
        audio.play(f.def.gold ? 'jackpot' : f.c.isNew ? 'cardnew' : 'card');
        buzz(f.c.isNew ? 18 : 8);
        await wait(f.def.gold ? 900 : 430);
      }
      const s = st();
      const next = Object.keys(PACKS).find((t) => s.cards.packs[t] > 0);
      more.append(h('button', { class: 'btn plain big', onclick: () => { click(); closeOverlay(); refresh(); } }, 'Done'));
      if (next) more.append(h('button', { class: 'btn big', onclick: () => { closeOverlay(); openPack(next); } }, `Open another (${Object.values(s.cards.packs).reduce((a, b) => a + b, 0)})`));
    })();
  }

  // ---- news -------------------------------------------------------------------

  // ---- overlays (mini-games and reveals) ----------------------------------------

  let overlayEl = null;
  function overlay(cls, children, { dismiss = false } = {}) {
    if (overlayEl) overlayEl.remove();
    setAuto(false);
    const box = h('div', { class: 'ov-box' }, children);
    overlayEl = h('div', { class: 'overlay ' + cls }, h('div', { class: 'rays' }), box);
    if (dismiss) overlayEl.addEventListener('click', (e) => { if (e.target === overlayEl) closeOverlay(); });
    root.append(overlayEl);
    return box;
  }
  function closeOverlay() {
    if (overlayEl) overlayEl.remove();
    overlayEl = null;
    nextPopup();
  }

  function lootItems(reward, raw = false) {
    const items = [];
    if (!reward) return items;
    if (reward.tokens) items.push([symURL('token'), fmt(reward.tokens), 'spins']);
    if (reward.coins) items.push([symURL('coin'), money(raw ? reward.coins * E.unit(st().town) : reward.coins), 'coins']);
    if (reward.treats) items.push([symURL('chips'), String(reward.treats), 'cherries']);
    if (reward.wheel) items.push([symURL('ball'), '×' + reward.wheel, reward.wheel === 1 ? 'wheel turn' : 'wheel turns']);
    for (const id of Object.keys(ITEMS)) if (reward[id] > 0) items.push([ART(ITEMS[id].icon), fmt(reward[id]), reward[id] === 1 ? ITEMS[id].one : ITEMS[id].name]);
    if (reward.pack) items.push([packURL(reward.pack), '×1', PACKS[reward.pack].name]);
    if (reward.packs) {
      for (const type of Object.keys(PACKS)) if (reward.packs[type]) items.push([packURL(type), '×' + reward.packs[type], PACKS[type].name]);
    }
    return items;
  }

  // The big reveal for prizes worth stopping for.
  function celebrate({ kicker, title, sub, reward, raw = false, actions, art = null }) {
    audio.play('bigwin');
    fx.rain(70);
    buzz([20, 30, 40]);
    const buttons = actions || [['Collect', null, 'btn big wide']];
    overlay('celebrate', [
      art ? h('img', { class: 'ov-art', src: ART(art), alt: '' }) : host('ov-host', 'party'),
      h('div', { class: 'kicker' }, kicker),
      h('h2', null, title),
      sub ? h('p', { html: sub }) : null,
      h('div', { class: 'loot' }, lootItems(reward, raw).map(([src, big, small], i) => h('div', { class: 'loot-item', style: `--i:${i}` }, h('img', { src, alt: '' }), h('b', null, big), h('small', null, small)))),
      h('div', { class: 'actions' }, buttons.map(([label, fn, cls]) => h('button', { class: cls || 'btn big', onclick: () => {
        click();
        closeOverlay();
        if (fn) fn();
        refresh();
      } }, label))),
    ]);
  }

  // A card held up to the light: it tilts and catches a shine under the finger.
  function zoomCard(card, count) {
    const face = cardFace(card);
    face.setCount(count);
    const inner = h('div', { class: 'zoom-inner' }, face);
    const wrap = h('div', { class: 'zoom-card' + (card.gold ? ' gold' : '') }, inner);
    const tilt = (e) => {
      const r = wrap.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      const y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
      inner.style.setProperty('--ry', `${(x - 0.5) * 28}deg`);
      inner.style.setProperty('--rx', `${(0.5 - y) * 22}deg`);
      inner.style.setProperty('--mx', `${x * 100}%`);
      inner.style.setProperty('--my', `${y * 100}%`);
    };
    wrap.addEventListener('pointermove', tilt);
    wrap.addEventListener('pointerleave', () => {
      inner.style.setProperty('--ry', '0deg');
      inner.style.setProperty('--rx', '0deg');
    });
    overlay('zoom', [
      wrap,
      h('h2', null, card.name),
      h('p', null, `${CARD_SETS[card.set].name} · ${'★'.repeat(card.stars)}${card.gold ? ' · gold card' : ''}`),
      h('p', null, count > 1 ? `You have ${count}. The spares became stars for the vault.` : 'You have one of these.'),
      h('div', { class: 'actions' }, h('button', { class: 'btn plain big wide', onclick: () => { click(); closeOverlay(); } }, 'Close')),
    ], { dismiss: true });
    audio.play('card');
  }

  function openPending() {
    const p = st().pending;
    if (!p || busy()) return;
    closeSheet();
    openRaid(p);
  }

  function openRaid(p) {
    const total = h('div', { class: 'result' });
    const done = h('div', { class: 'actions' });
    const goes = h('div', { class: 'kicker' }, 'Three goes');
    let sum = 0;
    const tubs = [0, 1, 2, 3].map((i) => {
      const image = h('img', { src: tubURL(false, false), alt: '' });
      const tag = h('div', { class: 'tub-tag' });
      const el = h('button', { class: 'tub', 'aria-label': 'Tub ' + (i + 1), onclick: () => dip(i) }, image, tag);
      return { i, el, image, tag, open: false };
    });
    // if the game was closed mid-dip, show the tubs already searched
    for (const i of p.picks) {
      const t = tubs[i];
      t.open = true;
      t.image.src = tubURL(true, p.tubs[i] > 0);
      toggle(t.el, 'empty', !(p.tubs[i] > 0));
      setHTML(t.tag, p.tubs[i] > 0 ? money(p.tubs[i]) : 'Empty');
      t.el.disabled = true;
      sum += p.tubs[i];
    }
    const bonus = Math.round((E.raidBonus(st()) - 1) * 100);
    overlay('raid', [
      h('div', { class: 'kicker' }, 'Pearl dive!'),
      h('p', { class: 'dive-how' }, 'Three of these four shells hold treasure. You have three goes.'),
      h('div', { class: 'tubs' }, tubs.map((t) => t.el)), goes, total,
      bonus > 0 ? h('p', { class: 'fineprint' }, `${activePet(st()).name} is helping: +${bonus}% in every shell.`) : null, done,
    ]);
    const update = () => {
      const left = 3 - st().pending?.picks.length;
      setText(goes, st().pending ? `${left} ${left === 1 ? 'go' : 'goes'} left` : 'All done');
      setHTML(total, sum > 0 ? `So far: ${COIN}${fmt(sum)}` : '');
    };
    update();

    function dip(i) {
      const t = tubs[i];
      const res = R.raidPick(st(), i);
      if (!res) return nope();
      t.open = true;
      t.el.disabled = true;
      t.image.src = tubURL(true, res.amount > 0);
      toggle(t.el, 'empty', !(res.amount > 0));
      setHTML(t.tag, res.amount > 0 ? money(res.amount) : 'Empty');
      t.el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 260 });
      sum += res.amount;
      if (res.amount > 0) {
        audio.play('dig');
        fly(COIN, t.el, coinCard, 8);
        buzz(18);
      } else {
        audio.play('error');
      }
      if (res.done) {
        tubs.forEach((tub, k) => {
          tub.el.disabled = true;
          if (!tub.open) {
            tub.image.src = tubURL(true, res.tubs[k] > 0);
            setHTML(tub.tag, res.tubs[k] > 0 ? money(res.tubs[k]) : 'Empty');
            tub.el.classList.add('missed');
          }
        });
        setText(goes, res.sweep ? 'Clean sweep!' : 'All done');
        setHTML(total, `<b>${res.sweep ? 'You found the lot!' : 'Not bad!'}</b> ${COIN}${fmt(res.total)}`);
        if (res.sweep) {
          audio.play('bigwin');
          buzz([30, 30, 60]);
        }
        done.append(h('button', { class: 'btn big wide', onclick: () => { click(); closeOverlay(); refresh(); } }, 'Carry on'));
        onSave();
      } else {
        update();
      }
      refresh();
    }
  }

  // ---- modals -----------------------------------------------------------------

  let modalEl = null;
  const queue = [];
  function modal(children, { dismiss = true } = {}) {
    if (modalEl) modalEl.remove();
    setAuto(false);
    const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, children);
    modalEl = h('div', { class: 'backdrop' }, box);
    if (dismiss) modalEl.addEventListener('click', (e) => { if (e.target === modalEl) closeModal(); });
    root.append(modalEl);
    return box;
  }
  function closeModal() {
    if (modalEl) modalEl.remove();
    modalEl = null;
    nextPopup();
  }
  // Pop-ups wait their turn rather than stacking.
  function popup(fn) {
    queue.push(fn);
    nextPopup();
  }
  function nextPopup() {
    if (busy() || !queue.length) return;
    queue.shift()();
  }

  const curtainEl = h('div', { class: 'curtain' });
  function curtain(title, sub, midway) {
    // the flight to the next park: the painted globe, with a bar that fills
    const fill = h('i');
    curtainEl.style.backgroundImage = `url(${ART('bg-load')})`;
    curtainEl.replaceChildren(h('div', { class: 'fly-to' }, h('small', null, 'Next stop'), h('b', null, title), h('span', null, sub)), h('div', { class: 'fly-bar' }, fill));
    curtainEl.classList.add('on');
    audio.play('tour');
    requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = '100%'; }));
    setTimeout(() => {
      // whatever happens behind it, the curtain always lifts again
      try {
        midway();
        refresh();
      } finally {
        setTimeout(() => curtainEl.classList.remove('on'), 1100);
      }
    }, 700);
  }

  function showWelcome() {
    popup(() => modal([
      host('modal-host', 'welcome'),
      wordmark(),
      h('p', null, 'A sleepy park, a pocketful of spins and a lucky machine.'),
      h('ul', null,
        h('li', null, h('i', null, '1'), 'Spin the machine to win coins.'),
        h('li', null, h('i', null, '2'), 'Spend coins on four rides, the entrance, parking, restrooms and food stalls. Finish them all to open the next park.'),
        h('li', null, h('i', null, '3'), 'Level up to open more: cards, missions, pets, a prize draw, a merge game and an expedition.')),
      h('div', { class: 'actions' },
        h('button', { class: 'btn big wide', onclick: () => { audio.unlock(); click(); closeModal(); } }, 'Open the gates')),
    ], { dismiss: false }));
  }

  function showAway(seconds, till, tokens) {
    const lines = [];
    if (till.amount > 0) lines.push(h('li', null, h('i', { html: COIN }), h('span', { html: `The park took <b>${money(till.amount)}</b> at the gate.` })));
    if (tokens > 0) lines.push(h('li', null, h('i', { html: TOKEN }), h('span', { html: `<b>${tokens}</b> spins are back in the meter.` })));
    if (!lines.length) return;
    popup(() => modal([
      h('h2', null, 'Welcome back!'),
      h('p', null, `You were away for ${fmtTime(seconds)}.`),
      h('ul', { class: 'away' }, lines),
      till.capped ? h('p', { class: 'fineprint' }, `The gate only keeps ${Math.round(E.awayHours(st()) * 10) / 10} hours of takings while you are away.`) : null,
      h('div', { class: 'actions stack' },
        till.amount > 0 && adsReady() ? h('button', { class: 'btn gold big', onclick: async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          if (await watchAd('away')) {
            st().coins += till.amount;
            audio.play('win');
            toast(`Doubled: another ${COIN}${fmt(till.amount)}`, 'gold');
            closeModal();
            onSave();
            refresh();
          } else {
            btn.disabled = false;
          }
        } }, h('span', { class: 'ad' }, 'AD'), 'Double the takings') : null,
        h('button', { class: 'btn big', onclick: () => { audio.unlock(); audio.play('claim'); closeModal(); } }, 'Lovely')),
    ]));
  }

  function showLeague(result) {
    if (!result) return;
    popup(() => celebrate({
      kicker: 'Club League',
      title: result.rank === 1 ? 'You won the league!' : `You came ${['', '1st', '2nd', '3rd'][result.rank] || result.rank + 'th'}`,
      sub: `${fmt(result.points)} points yesterday.`,
      reward: result.reward,
    }));
  }

  const showDaily = () => screens.profile.showDaily();

  // ---- shop and adverts --------------------------------------------------------
  // A native wrapper (or any payment / advert integration) plugs in by setting
  // window.ParkBridge = { showRewarded, showInterstitial, purchase, prices }.
  // Without one, STORE_PREVIEW decides between a stand-in and "coming soon".

  const bridge = () => (typeof window.ParkBridge === 'object' && window.ParkBridge) || null;
  const adsReady = () => !!(bridge() && bridge().showRewarded) || STORE_PREVIEW;
  const priceOf = (product) => (bridge() && bridge().prices && bridge().prices[product.id]) || product.price;

  async function watchAd(placement) {
    const b = bridge();
    if (b && b.showRewarded) {
      try {
        return !!(await b.showRewarded(placement));
      } catch {
        return false;
      }
    }
    return STORE_PREVIEW ? previewAd() : false;
  }

  async function interstitial(placement) {
    const b = bridge();
    if (st().shop.noAds || !b || !b.showInterstitial) return;
    try {
      await b.showInterstitial(placement);
    } catch {
      /* an advert that fails to show must never block the game */
    }
  }

  // The stand-in advert: a few seconds of nothing, then the reward.
  function previewAd() {
    return new Promise((resolve) => {
      const bar = h('i');
      const el = h('div', { class: 'overlay ad' }, h('div', { class: 'ad-box' },
        h('div', { class: 'kicker' }, 'Advert'),
        h('h2', null, 'Your advert plays here'),
        h('p', null, 'This is a stand-in. Connect an advert provider and a real one runs in its place.'),
        h('div', { class: 'bar' }, bar)));
      root.append(el);
      const started = performance.now();
      const timer = setInterval(() => {
        const u = Math.min(1, (performance.now() - started) / 2500);
        bar.style.width = u * 100 + '%';
        if (u >= 1) {
          clearInterval(timer);
          el.remove();
          resolve(true);
        }
      }, 80);
    });
  }

  function previewPurchase(product) {
    return new Promise((resolve) => {
      const done = (ok) => {
        closeModal();
        resolve(ok);
      };
      modal([
        h('div', { class: 'kicker' }, 'Preview purchase'),
        h('h2', null, product.name),
        h('div', { class: 'prize', html: describe(product.grant, true) || product.desc || '' }),
        h('p', null, `In the finished game this costs ${priceOf(product)}. No payment provider is connected in this build, so nothing is charged.`),
        h('div', { class: 'actions' },
          h('button', { class: 'btn plain big', onclick: () => { click(); done(false); } }, 'Cancel'),
          h('button', { class: 'btn gold big', onclick: () => done(true) }, 'Get it')),
      ], { dismiss: false });
    });
  }

  async function buy(product) {
    if (R.productOwned(st(), product.id, clock())) return;
    const b = bridge();
    let ok = false;
    if (b && b.purchase) {
      try {
        ok = !!(await b.purchase(product.id));
      } catch {
        ok = false;
      }
    } else if (STORE_PREVIEW) {
      ok = await previewPurchase(product);
    } else {
      toast('The shop opens soon.');
      return;
    }
    if (!ok) return;
    const reward = R.applyPurchase(st(), product.id, clock());
    if (!reward) return;
    if (lootItems(reward).length) celebrate({ kicker: 'Thank you!', title: product.name, reward });
    else toast(`Thank you! ${product.name} is yours.`, 'gold');
    onSave();
    refresh();
  }

  // Watch an advert for something. `id` is a placement in ADS; the prize is
  // only handed over once the advert has been watched to the end.
  async function adFor(id, from) {
    if (R.adLeft(st(), id, clock()) <= 0) {
      nope();
      return null;
    }
    if (!(await watchAd(id))) return null;
    const reward = R.claimAd(st(), id, clock());
    if (!reward) return null;
    audio.play('token');
    if (reward.tokens) fly(TOKEN, from || spinBtn, tokenTarget(), 8);
    toast(`Thanks for watching: ${describe(reward)}`, 'gold');
    onSave();
    refresh();
    return reward;
  }
  const adTokens = (from) => adFor('tokens', from);
  const openShop = (section = '') => screens.offers.open(section);
  const outOfTokens = () => screens.offers.outOfSpins();
  const lockedToast = (id) => {
    const u = UNLOCKS.find((x) => x.id === id);
    nope();
    toast(`<b>${u ? u.name : 'This'}</b> opens at level ${unlockLevel(id)}. Build in the park to level up.`);
  };

  // ---- splash -----------------------------------------------------------------

  // The painted loading screen, with a real bar and button laid over its own.
  // `loading(onProgress)` fetches the first pictures and resolves when they
  // are in; until then the button stays hidden.
  function showSplash(done, loading) {
    const fill = h('i');
    const tap = h('div', { class: 'tap' }, 'Tap to play');
    const el = h('div', { class: 'splash loading', role: 'button', tabindex: '0', 'aria-label': 'Tap to play' },
      h('div', { class: 'splash-art' }, h('div', { class: 'load-bar' }, fill), tap));
    let ready = false;
    const finish = () => {
      ready = true;
      fill.style.width = '100%';
      setTimeout(() => el.classList.remove('loading'), 250);
    };
    if (loading) loading((u) => { fill.style.width = Math.round(8 + u * 92) + '%'; }).then(finish, finish);
    else setTimeout(finish, 900);
    const go = () => {
      if (!ready || el.classList.contains('gone')) return;
      audio.unlock();
      audio.play('fanfare');
      el.classList.add('gone');
      setTimeout(() => el.remove(), 480);
      done();
    };
    el.addEventListener('click', go);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') go(); });
    root.append(el);
  }

  // ---- coach marks ---------------------------------------------------------------

  const coachText = h('div', { class: 'coach-text' });
  const coachIn = h('div', { class: 'coach-in' }, coachText, h('div', { class: 'coach-arrow' }));
  const coachEl = h('div', { class: 'coach', 'aria-hidden': 'true' }, coachIn);

  function coach(target, text) {
    const r = target && place(target);
    if (!r || !r.width) {
      coachEl.classList.remove('on');
      return;
    }
    const below = r.top < 130;
    toggle(coachEl, 'below', below);
    coachIn.style.left = Math.max(84, Math.min(STAGE_W - 84, r.left + r.width / 2)) + 'px';
    coachIn.style.top = (below ? r.bottom + 5 : r.top - 5) + 'px';
    setText(coachText, text);
    coachEl.classList.add('on');
  }

  // Point a new player at the next thing to press. Stops after the first builds.
  function updateCoach() {
    const s = st();
    if (busy() || sceneNow || slot.spinning || held || s.stats.upgrades >= 2 || s.mission.index > 2 || document.querySelector('.splash')) return coach(null);
    if (current) {
      if (current.key === 'build' && s.mission.index >= 1 && s.stats.upgrades === 0) return coach(sheetBody.querySelector('.site-buy:not([disabled])'), 'Build it!');
      return coach(null);
    }
    if (s.mission.index === 0 && currentMission(s).done) return coach(missionReward, 'Collect your prize');
    if (s.stats.spins === 0 && base === 'machine' && !current) return coach(spinBtn, 'Tap to spin!');
    if (s.mission.index >= 1 && s.stats.upgrades === 0) {
      const cheapest = Math.min(...PLOTS.map((p) => E.stageCost(s.town, p.index, 1)));
      if (s.coins >= cheapest) {
        if (base === 'machine' && !current) return coach(tabs.park, 'Spend your coins here');
        if (base === 'park' && !current) {
          const k = PLOTS.findIndex((p) => s.coins >= E.stageCost(s.town, p.index, 1) && p.index !== 2 && p.index !== 3);
          return coach(renderer.siteEl(k < 0 ? 0 : k), 'Tap to build');
        }
      }
    }
    return coach(null);
  }

  // ---- toasts -----------------------------------------------------------------

  const toasts = h('div', { class: 'toasts', 'aria-live': 'polite' });
  function toast(html, kind = '') {
    while (toasts.children.length >= 3) toasts.firstChild.remove();
    const el = h('div', { class: 'toast ' + kind, html });
    toasts.append(el);
    setTimeout(() => el.classList.add('out'), 2800);
    setTimeout(() => el.remove(), 3200);
  }

  // ---- refresh ----------------------------------------------------------------

  // Every frame: reels and the coin counter.
  function frame(dt) {
    slot.draw(dt);
    fx.draw(dt);
    const s = st();
    // while the reels turn, do not give the result away in the totals
    const target = s.coins - (held ? held.coins : 0);
    shown.coins += (target - shown.coins) * (1 - Math.exp(-dt * 9));
    if (Math.abs(target - shown.coins) < Math.max(1, target * 1e-4)) shown.coins = target;
    setText(coinsEl, money(shown.coins));
    if (hideBanner && performance.now() > hideBanner) {
      hideBanner = 0;
      banner.classList.remove('on');
    }
  }

  function refresh() {
    const s = st();
    const now = clock();
    const cap = E.tokenCap(s);
    const heldTokens = held ? held.tokens + held.milestones.reduce((n, m) => n + m.tokens, 0) : 0;
    const tokens = s.tokens - heldTokens;
    setText(tokensEl, fmt(tokens));
    const secs = R.nextTokenIn(s, now);
    setText(tokenTimer, tokens >= cap ? 'Full' : `next ${fmtClock(secs)}`);
    setText(tillEl, `${money(E.idleRate(s) * 60)}/min`);
    setText(starsEl, 'Lv ' + E.level(s));

    const mission = currentMission(s);
    setText(missionText, mission.text);
    missionBar.style.width = Math.round((mission.cur / mission.target) * 100) + '%';
    toggle(missionBtn, 'done', mission.done);
    setHTML(missionReward, mission.done ? `Claim ${describe(mission.reward, true)}` : `${fmt(mission.cur)}/${fmt(mission.target)} · ${describe(mission.reward, true)}`);

    // the slots page
    const info = townInfo(s.town);
    const built = E.stagesBuilt(s);
    const ev = R.eventInfo(s, now);
    setText(eventName, ev.theme.name);
    setHTML(eventText, ev.next ? `${fmt(ev.points)} / ${fmt(ev.next.at)}<small>next: ${describe(ev.next.reward, true)}</small>` : 'All prizes won');
    eventBar.style.width = ev.next ? Math.min(100, ((ev.points - ev.prev) / (ev.next.at - ev.prev)) * 100) + '%' : '100%';
    R.setBet(s, s.bet);
    const bets = E.availableBets(s);
    const bi = bets.indexOf(s.bet);
    setText(betVal, `BET x${s.bet}`);
    betMinus.disabled = bi <= 0;
    betPlus.disabled = bi >= bets.length - 1;
    const spinning = slot.spinning;
    setText(spinLabel, s.pending && !spinning ? 'DIVE!' : tokens < 1 && !spinning ? 'EMPTY' : '');
    setHTML(spinCost, '');
    toggle(spinBtn, 'empty', tokens < 1 && !spinning && !s.pending);
    toggle(spinBtn, 'ready', tokens >= 1 && !spinning && !auto && !held);
    if (auto && tokens < s.bet && !spinning && !held) setAuto(false);
    setHTML(gaugeCount, `${fmt(tokens)} <span>spins</span>`);
    setText(gaugeTimer, tokens >= cap ? `full · ${cap} max` : `+1 in ${fmtClock(secs)}`);
    if (tokens > shown.tokens) { bump(tokensEl); bump(gaugeCount); }
    shown.tokens = tokens;
    const adsLeft = R.adLeft(s, 'tokens', now);
    setText(adLine, adsLeft > 0 ? `+${ADS.tokens.reward.tokens} spins` : 'Back tomorrow');
    toggle(adBtn, 'out', adsLeft <= 0);

    // the park page and the tabs
    setHTML(townChipText, `${info.name} <i>•</i> Park ${info.number} / ${PARKS_TOTAL}`);
    townChipBar.style.width = (built / E.PARK_STARS) * 100 + '%';
    setText(townBarText, `${built} / ${E.PARK_STARS}`);
    let canBuild = 0;
    for (const p of PLOTS) {
      const cost = E.cheapest(s, p.index);
      if (cost != null && s.coins >= cost) canBuild++;
    }
    const wait = G.waiting(s, now);
    setBadge(tabs.park, canBuild + (E.townComplete(s) ? 1 : 0) + wait.parkChests);
    toggle(chestBtn, 'ready', wait.parkChests > 0);
    const packs = Object.values(s.cards.packs).reduce((a, b) => a + b, 0);
    const claimable = CARD_SETS.filter((set) => !s.cards.sets[set.index] && R.setComplete(s, set.index)).length;
    setBadge(tabs.album, packs + claimable);
    setBadge(tabs.events, wait.club + (s.league.last && !s.league.last.seen ? 1 : 0));
    setBadge(tabs.shop, s.shop.stamps >= 3 ? 1 : 0);
    setBadge(tabs.machine, 0);
    // the shortcut rails
    const today = R.dayNumber(now);
    setBadge(rails.daily, R.dailyReady(s, now) ? 1 : 0);
    setBadge(rails.lucky, s.wheel.day !== today ? 1 : 0);
    setBadge(rails.free, Object.keys(ADS).reduce((n, id) => n + R.adLeft(s, id, now), 0));
    setBadge(rails.wheel, s.wheel.tickets);
    setBadge(rails.pet, s.pet.treats);
    setBadge(rails.tasks, wait.missions);
    setBadge(rails.pass, wait.pass);
    setBadge(rails.event, wait.festival + wait.chests);
    setBadge(rails.league, wait.club);
    setBadge(rails.merge, wait.merge);
    setBadge(rails.draw, wait.draw);
    setBadge(rails.trail, wait.trail);
    setBadge(rails.noads, s.shop.stamps >= 3 ? 1 : 0);
    setBadge(rails.vault, 0);
    setText(rails.bonus.pill, fmtTime((ev.endsAt - now) / 1000));
    for (const r of Object.values(rails)) {
      const locked = !!r.needs && !E.unlocked(s, r.needs);
      toggle(r, 'locked', locked);
      if (r !== rails.bonus) setText(r.pill, locked ? 'Lv ' + unlockLevel(r.needs) : r.label);
      if (locked) r.badge.hidden = true;
    }
    // prizes for levels reached, one pop-up at a time
    if (s.level < E.level(s) && !busy() && !slot.spinning && !held) screens.profile.levelUp();
    updateCoach();

    // early on, point at the first plot worth building
    let point = -1;
    if (s.stats.upgrades < 3 && s.stats.upgrades > 0 && !current && base === 'park') {
      point = PLOTS.findIndex((p) => E.cheapest(s, p.index) != null && s.coins >= E.cheapest(s, p.index));
    }
    renderer.setPointer(point);

    // a finished park: offer to move on, once, as soon as nothing else is showing
    if (E.townComplete(s) && prompted !== s.town && !busy() && !slot.spinning && !held) {
      prompted = s.town;
      setTimeout(() => popup(townDone), 900);
    }

    if (current) current.refresh();
    if (sceneNow) sceneNow.refresh();
  }

  root.append(machine, hud, parkUI, sheet, tabbar, sceneEl, toasts, coachEl, fxCanvas, curtainEl);

  // Everything a screen module needs from the shell.
  const kit = {
    h, setText, setHTML, toggle, show, wait, root, world, renderer, audio, clock, st, rand, fx,
    ART, symURL, img, TOKEN, COIN, CHIPS, STAR, ICON, itemIcon, faceStyle, packURL, cardFace, cellStyle, host, wordmark,
    click, nope, buzz, describe, lootItems, fly, place, toast, celebrate, curtain,
    setSheet, closeSheet, sheetBody, sheetTitle, openScene, closeScene, at, hot, sceneClose, sceneInfo, overlay, closeOverlay, modal, closeModal, popup, nextPopup, busy: () => busy(),
    refresh, onSave, onReplaceSave, onReset, setBase, goTo, lockedToast, setAuto,
    watchAd, adFor, adsReady, buy, priceOf, bridge, interstitial, travelNow,
    openAlbum, openVault, openWheel, openPack, showCards, openTask: openMissions, openDive, paytable,
    coinCard, tokenTarget, spinBtn, tabs, rails,
    get base() { return base; },
    get current() { return current; },
    get scene() { return sceneNow ? sceneNow.key : null; },
  };
  const screens = installScreens(kit);


  // The whole game is laid out on a fixed 390 x 847 stage (the shape of the
  // paintings) and scaled to fit the screen.
  const safeProbe = h('div', { style: 'position:fixed;left:0;bottom:0;width:0;height:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none' });
  document.body.append(safeProbe);
  function measure() {
    const inset = safeProbe.offsetHeight || 0; // the home indicator's strip, where there is one
    const k = Math.min(window.innerWidth / STAGE_W, (window.innerHeight - inset * 0.5) / STAGE_H);
    root.style.setProperty('--s', k.toFixed(4));
    root.style.setProperty('--up', (inset * 0.25).toFixed(1) + 'px');
    renderer.setScale(k);
    slot.resize();
    fx.resize();
  }
  syncTabs();
  refresh();
  measure();

  return {
    refresh,
    frame,
    measure,
    toast,
    describe,
    spin: doSpin,
    setBase,
    openBuild,
    openPending,
    closeSheet,
    showSplash,
    showWelcome,
    openShop,
    showAway,
    showLeague,
    showDaily,
    fly,
    // how many things are open over the two main pages
    get layers() { return (overlayEl ? 1 : 0) + (modalEl ? 1 : 0) + (sceneNow ? 1 : 0) + (current ? 1 : 0); },
    // close the topmost of them; false if there was nothing to close
    back() {
      if (document.querySelector('.overlay.ad')) return true; // an advert is playing: stay put
      if (modalEl) { closeModal(); return true; }
      if (overlayEl) {
        // prizes and mini-games are closed with their own button, so nothing is skipped by accident
        const only = overlayEl.querySelectorAll('.actions .btn');
        if (only.length === 1) only[0].click();
        return true;
      }
      if (sceneNow) { const x = sceneEl.querySelector('.hot[aria-label="Close"]'); if (x) x.click(); else closeScene(); return true; }
      if (current) { closeSheet(); return true; }
      return false;
    },
    get sheetKey() { return current ? current.key : null; },
    get sceneKey() { return sceneNow ? sceneNow.key : null; },
    closeScene,
    get base() { return base; },
    // the park only needs drawing when it can be seen
    get parkVisible() { return (base === 'park' && !(current && current.page)) || performance.now() - baseAt < 480; },
    get busy() { return busy(); },
    get coinCard() { return coinCard; },
    screens,
    kit,
  };
}
