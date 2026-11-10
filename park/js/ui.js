// The DOM layer: the app shell (HUD, tab bar, the machine page, the park
// page), sheets, mini-games and modals.
// Sheets are built once when opened and refreshed in place, so buttons never
// get replaced under the player's finger.
import {
  ADS, CARDS, CARD_SETS, CURRENCY, DAILY, EVENT_MILESTONES, GAME_TITLE, GUEST_LOOKS, LEAGUE_PRIZES, PACKS, PARKS_TOTAL, PAY, PET, PLOTS, STAGES, SYMBOL_ART, WHEEL,
  PRODUCTS, STORE_PREVIEW, TOWN_REWARD, TUNING, UPGRADE_REWARDS, VAULT, VERSION, setUnlockTown, townInfo,
} from './config.js';
import * as A from './art.js';
import { cardImage, symbolImage } from './cardart.js';
import * as E from './economy.js';
import { createFx } from './fx.js';
import { fmt, fmtClock, fmtTime, money } from './format.js';
import { currentMission } from './goals.js';
import { SITES, STAGE_H, STAGE_W, siteThumbStyle } from './parkview.js';
import * as R from './rules.js';
import * as S from './sim.js';
import { createSlotView } from './slotview.js';
import { exportCode, importCode } from './state.js';

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
  const packURL = (type) => memo('pack' + type, () => {
    const cv = document.createElement('canvas');
    cv.width = 160;
    cv.height = 220;
    A.drawPack(cv.getContext('2d'), 80, 112, 2, type);
    return cv.toDataURL();
  });
  // the pearl dive's shells: closed, opened on treasure, or opened on nothing
  const tubURL = (open, found) => (open && found ? symURL('sack') : symURL('barrel'));
  const gullURL = (happy) => memo('gull' + happy, () => {
    const cv = document.createElement('canvas');
    cv.width = 300;
    cv.height = 240;
    A.drawGull(cv.getContext('2d'), 130, 220, 2, 0.5, happy);
    return cv.toDataURL();
  });
  const faceURL = (id) => memo('face' + id, () => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 96;
    const c = cv.getContext('2d');
    const L = GUEST_LOOKS;
    c.fillStyle = L.shirts[(id * 5 + 2) % L.shirts.length];
    c.beginPath();
    c.arc(48, 48, 48, 0, 7);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.25)';
    c.beginPath();
    c.ellipse(48, 104, 40, 34, 0, 0, 7);
    c.fill();
    c.fillStyle = L.skins[(id * 2 + 1) % L.skins.length];
    c.beginPath();
    c.arc(48, 46, 24, 0, 7);
    c.fill();
    c.fillStyle = L.hairs[(id * 3) % L.hairs.length];
    c.beginPath();
    c.arc(48, 42, 25, Math.PI * 1.02, Math.PI * 1.98);
    c.closePath();
    c.fill();
    c.fillStyle = '#2b2140';
    c.fillRect(22, 14, 52, 7);
    c.fillRect(31, 0, 34, 16);
    c.fillStyle = '#e5484d';
    c.fillRect(31, 10, 34, 5);
    c.fillStyle = '#2b2140';
    for (const x of [39, 57]) {
      c.beginPath();
      c.arc(x, 48, 2.6, 0, 7);
      c.fill();
    }
    c.strokeStyle = '#2b2140';
    c.lineWidth = 2.4;
    c.beginPath();
    c.arc(48, 54, 9, 0.2 * Math.PI, 0.8 * Math.PI);
    c.stroke();
    return cv.toDataURL();
  });

  // "Park!" with its exclamation mark set apart, so it can bounce
  // Artwork cut from the style-guide mockups lives in img/. A single-file build
  // can hand the same pictures over as data URIs in window.PARK_ART.
  const ART = (name) => (window.PARK_ART && window.PARK_ART[name]) || `img/${name}.webp`;
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
    if (m.go === 'spin') setBase('machine');
    else if (m.go === 'build') openBuild();
    else if (m.go === 'cards') openAlbum();
    else if (m.go === 'pet') openPet();
    else if (m.go === 'wheel') openWheel();
  }

  const coinsEl = h('b', null, CURRENCY + '0');
  const tillEl = h('small');
  const tokensEl = h('b', null, '0');
  const tokenTimer = h('small');
  const starsEl = h('b', null, '0');
  const starCard = h('button', { class: 'stat-card stars', 'aria-label': 'Stars earned. Open the park map', onclick: () => { click(); openMap(); } },
    h('span', { class: 'ico-wrap star-ico' }, '★'), h('div', null, starsEl));
  const coinCard = h('button', { class: 'stat-card coins', 'aria-label': 'Coins. Open the offers', onclick: () => { click(); openShop(); } },
    h('span', { class: 'ico-wrap', html: COIN }), h('div', null, coinsEl, tillEl), h('i', { class: 'plus' }, '+'));
  const tokenCard = h('button', { class: 'stat-card tokens', 'aria-label': 'Spins. Open the offers', onclick: () => { click(); openShop(); } },
    h('span', { class: 'ico-wrap', html: TOKEN }), h('div', null, tokensEl, tokenTimer), h('i', { class: 'plus' }, '+'));
  const gearBtn = h('button', { class: 'round-btn', 'aria-label': 'Menu and settings', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"><path d="M5 6.500h14M5 12h14M5 17.500h14"/></svg>', onclick: () => { click(); openSettings(); } });
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
    tab('events', 'Club', TABICON.events, () => openEvents())));

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
  renderer.layer.append(townChip, townBar, mapBtn, takeBtn);
  const parkUI = renderer.el;

  // ---- the slots page ---------------------------------------------------------
  // The scene is the painted machine. Everything live (reels, counters, the
  // bonus track, both rails of shortcuts) is placed exactly over the painting.

  const reelCanvas = h('canvas', { class: 'reels', 'aria-label': 'Slot machine reels' });
  const banner = h('div', { class: 'win-banner' });
  const eventName = h('b');
  const eventBar = h('i');
  const eventText = h('span');
  const bonus = h('button', { class: 'bonus', 'aria-label': 'Event prizes', onclick: () => { click(); openEvents(); } }, eventName, h('div', { class: 'bar' }, eventBar), eventText);
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
  const rail = (key, side, i, label, fn) => {
    const left = side === 'l';
    const badge = h('i', { class: 'badge' });
    const pill = h('span', { class: 'rail-pill' }, label);
    const hot = h('button', { class: 'rail-hot', 'aria-label': label, style: `left:${left ? 5.4 : 339}px;top:${(left ? 107.2 : 108.7) + i * (left ? 59.5 : 59.7)}px`, onclick: () => { click(); fn(hot); } }, badge);
    pill.style.cssText = `left:${left ? 4 : 337.5}px;top:${(left ? 147.9 : 151.3) + i * (left ? 59.6 : 59.4)}px`;
    badge.hidden = true;
    hot.badge = badge;
    hot.pill = pill;
    rails[key] = hot;
    return [hot, pill];
  };
  const railEls = [
    rail('daily', 'l', 0, 'Gift', () => dailyTap()),
    rail('offers', 'l', 1, 'Offers', () => openShop()),
    rail('lucky', 'l', 2, 'Lucky', () => luckyTap()),
    rail('coins', 'l', 3, 'Coins', () => openShop('coins')),
    rail('starter', 'l', 4, 'Starter', () => openShop('starter')),
    rail('free', 'l', 5, 'Free', (el) => adTokens(el)),
    rail('packs', 'l', 6, 'Packs', () => openAlbum()),
    rail('vault', 'l', 7, 'Vault', () => openVault()),
    rail('noads', 'l', 8, 'No ads', () => openShop('noads')),
    rail('wheel', 'r', 0, 'Wheel', () => openWheel()),
    rail('map', 'r', 1, 'Map', () => openMap()),
    rail('dive', 'r', 2, 'Dive', () => openDive()),
    rail('pet', 'r', 3, PET.name, () => openPet()),
    rail('tasks', 'r', 4, 'Tasks', () => openMissions()),
    rail('event', 'r', 5, 'Event', () => openEvents()),
    rail('stats', 'r', 6, 'Stats', () => openTakings()),
    rail('league', 'r', 7, 'League', () => openEvents(true)),
    rail('pays', 'r', 8, 'Pays', () => paytable()),
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
      row(['chips', 'chips', 'chips'], `Treats for ${PET.name}`, `+${PAY.treats * s.bet}`),
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
    slot.spin(res.reels, auto, res.kind !== 'mixed');
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
        say(`+${res.treats} chips for ${PET.name}`, 'treats');
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

  // ---- build ----------------------------------------------------------------

  const starRow = (plot) => '★'.repeat(plot.stage) + '☆'.repeat(STAGES - plot.stage);
  const siteDone = (plot) => plot.stage >= STAGES && plot.cap;
  const nextCost = (s, k) => E.stageCost(s.town, k, Math.min(s.plots[k].stage, STAGES) + 1);

  // Everything in the park, as a list. Tap a row to open that site.
  function openBuild(focusPlot = -1) {
    if (base !== 'park') setBase('park');
    if (focusPlot >= 0) return openSite(focusPlot);
    const info = () => townInfo(st().town);
    const progress = h('i');
    const progressText = h('span');
    const rewardLine = h('p', { class: 'note' });
    const travelBtn = h('button', { class: 'btn big gold wide', onclick: () => { click(); travelNow(); } });
    const rows = PLOTS.map((p) => {
      const k = p.index;
      const thumb = h('div', { class: 'thumb' });
      const name = h('div', { class: 'name' });
      const stars = h('div', { class: 'stars' });
      const sub = h('div', { class: 'sub' });
      const go = h('button', { class: 'btn small blue' }, 'Open');
      const row = h('div', { class: 'row', onclick: () => { click(); openSite(k); } }, thumb, h('div', { class: 'meta' }, name, stars, sub), h('div', { class: 'side-col' }, go));
      return { k, row, thumb, name, stars, sub, go };
    });
    const head = h('div', { class: 'town-head' },
      h('div', { class: 'ms-line' }, progressText, h('span', null, 'Finish everything to move on')),
      h('div', { class: 'bar' }, progress));
    setSheet('parklist', h('span', null, ''), [head, rows.map((r) => r.row), rewardLine, travelBtn], () => {
      const s = st();
      setText(sheetTitle, `${info().name} · Park ${info().number}`);
      const built = E.stagesBuilt(s);
      setText(progressText, `★ ${built} of ${E.PARK_STARS}`);
      progress.style.width = (built / E.PARK_STARS) * 100 + '%';
      const done = E.townComplete(s);
      show(travelBtn, done);
      setText(travelBtn, `Open ${townInfo(s.town + 1).name}`);
      setHTML(rewardLine, done
        ? `Everything is at the top level. Moving on pays <b>${describe(TOWN_REWARD, true)}</b>.`
        : `Finishing ${info().name} pays <b>${describe(TOWN_REWARD, true)}</b> and opens ${townInfo(s.town + 1).name}.`);
      for (const r of rows) {
        const plot = s.plots[r.k];
        const d = S.designAt(s, r.k);
        if (r.thumb.__t !== s.town) {
          r.thumb.__t = s.town;
          r.thumb.style.cssText = siteThumbStyle(s.town, r.k);
        }
        setText(r.name, d.name);
        setText(r.stars, starRow(plot));
        const done1 = siteDone(plot);
        toggle(r.row, 'done', done1);
        const can = !done1 && s.coins >= nextCost(s, r.k);
        r.go.className = 'btn small ' + (can ? '' : 'blue');
        setText(r.go, done1 ? 'Done' : can ? 'Upgrade' : 'Open');
        setText(r.sub, done1 ? 'Top level, fully fitted out.' : plot.stage === 0 ? `Not built yet · ${money(nextCost(s, r.k))}` : `Level ${plot.stage * 10} · next ${money(nextCost(s, r.k))}`);
      }
    });
  }

  // One ride or facility: its level, the next upgrade, and its capacity.
  function openSite(k) {
    if (base !== 'park') setBase('park');
    const thumb = h('div', { class: 'thumb big' });
    const name = h('div', { class: 'site-name' });
    const stars = h('div', { class: 'stars' });
    const lvFill = h('i');
    const lvFrom = h('span');
    const lvTo = h('span');
    const priceWhat = h('div', { class: 'site-what' });
    const priceSub = h('div', { class: 'sub' });
    const capWhat = h('div', { class: 'site-what' });
    const capSub = h('div', { class: 'sub' });
    const purchase = () => {
      const up = R.upgradePlot(st(), k);
      if (!up) {
        nope();
        return false;
      }
      onUpgrade(k, up);
      refresh();
      return true;
    };
    // hold the button to keep upgrading
    const holdable = (btn) => {
      let timer = null;
      let fired = false;
      const stop = () => { clearInterval(timer); clearTimeout(timer); timer = null; };
      btn.addEventListener('pointerdown', () => {
        fired = false;
        stop();
        timer = setTimeout(() => {
          timer = setInterval(() => {
            fired = true;
            if (btn.disabled || !purchase()) stop();
          }, 150);
        }, 380);
      });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, stop);
      btn.addEventListener('click', () => {
        if (fired) {
          fired = false;
          return;
        }
        purchase();
      });
      return btn;
    };
    const buy = holdable(h('button', { class: 'btn site-buy' }));
    const capBuy = holdable(h('button', { class: 'btn site-buy' }));
    const step = (dir) => () => { click(); openSite((k + dir + PLOTS.length) % PLOTS.length); };
    const body = [
      h('div', { class: 'site-card head' }, thumb, h('div', { class: 'meta' }, name, stars, h('div', { class: 'lv-bar' }, lvFill, lvFrom, lvTo))),
      h('div', { class: 'site-card' }, h('span', { class: 'site-ico up' }, '▲'), h('div', { class: 'meta' }, priceWhat, priceSub), buy),
      h('div', { class: 'site-card' }, h('span', { class: 'site-ico cap' }, '＋'), h('div', { class: 'meta' }, capWhat, capSub), capBuy),
      h('div', { class: 'site-nav' },
        h('button', { 'aria-label': 'Previous', onclick: step(-1) }, '‹'),
        h('button', { 'aria-label': 'Close', onclick: () => { click(); closeSheet(); } }, '✕'),
        h('button', { 'aria-label': 'Next', onclick: step(1) }, '›')),
    ];
    setSheet('build', h('span', null, ''), body, () => {
      const s = st();
      const plot = s.plots[k];
      const d = S.designAt(s, k);
      setText(sheetTitle, d.name);
      setText(name, d.name);
      if (thumb.__t !== s.town) {
        thumb.__t = s.town;
        thumb.style.cssText = siteThumbStyle(s.town, k, 86, 74);
      }
      setText(stars, starRow(plot));
      const lv = plot.stage * 10;
      lvFill.style.width = lv + '%';
      setText(lvFrom, `Lv.${lv}`);
      setText(lvTo, 'Lv.100');
      const ticket = E.ticket(s.town, Math.max(1, Math.min(STAGES, plot.stage + (plot.stage < STAGES ? 1 : 0)))) * 60;
      if (plot.stage < STAGES) {
        const cost = nextCost(s, k);
        setHTML(priceWhat, plot.stage === 0 ? `Build the ${d.name}` : `Level ${lv} <b>→ ${lv + 10}</b>`);
        setText(priceSub, plot.stage === 0 ? d.blurb : `Takes ${money(ticket)} a minute at the gate.`);
        buy.className = 'btn site-buy';
        setHTML(buy, `${plot.stage === 0 ? 'Build' : 'Upgrade'}<small>${COIN}${money(cost)}</small>`);
        buy.disabled = s.coins < cost;
      } else {
        setHTML(priceWhat, 'Level 100');
        setText(priceSub, `Takes ${money(E.plotRate(s, k) * 60)} a minute at the gate.`);
        buy.className = 'btn site-buy tick';
        setHTML(buy, '✓');
        buy.disabled = true;
      }
      const capCost = E.stageCost(s.town, k, STAGES + 1);
      setHTML(capWhat, `${d.cap}${plot.cap ? ': full' : ''}`);
      if (plot.cap) {
        setText(capSub, 'Extra capacity fitted: half as much again at the gate.');
        capBuy.className = 'btn site-buy tick';
        setHTML(capBuy, '✓');
        capBuy.disabled = true;
      } else {
        const locked = plot.stage < STAGES;
        setHTML(capSub, locked ? `<span class="need">Level 100 of ${d.name} required.</span>` : `Add more ${d.cap.toLowerCase()}: half as much again at the gate.`);
        capBuy.className = 'btn site-buy' + (locked ? ' locked' : '');
        setHTML(capBuy, `Upgrade<small>${COIN}${money(capCost)}</small>`);
        capBuy.disabled = locked || s.coins < capCost;
      }
    }, { site: true });
    renderer.select(k);
  }

  function onUpgrade(k, up) {
    const d = S.designAt(st(), k);
    const top = up.cap || up.stage === STAGES;
    audio.play(up.stage === 1 && !up.cap ? 'build' : top ? 'milestone' : 'upgrade');
    renderer.celebrate(k, top);
    buzz(top ? [20, 30, 40] : 14);
    if (up.cap) toast(`<b>${d.name}</b> is finished!`, 'gold');
    else if (up.stage === 1) toast(`<b>${d.name}</b> is open for business!`);
    else if (up.stage === STAGES) toast(`<b>${d.name}</b> has reached level 100!`, 'gold');
    if (up.reward && (up.reward.tokens || up.reward.pack)) toast(`Upgrade bonus: ${describe(up.reward)}`, 'gold');
    if (up.complete) renderer.fireworks(6);
    onSave();
  }

  // ---- the park map, takings, tasks ------------------------------------------------

  // The road ahead: every park, with the ones behind you ticked off.
  function openMap() {
    const s = st();
    const rows = [];
    const from = Math.max(0, s.town - 2);
    for (let t = from; t < Math.min(PARKS_TOTAL, from + 12); t++) {
      const info = townInfo(t);
      const state = t < s.town ? 'done' : t === s.town ? 'here' : 'ahead';
      rows.push(h('div', { class: 'map-row ' + state },
        h('div', { class: 'map-pic', style: `background-image:url(${ART('park-' + info.theme.key)})` }),
        h('div', { class: 'meta' }, h('div', { class: 'name' }, info.name), h('div', { class: 'sub' }, `Park ${info.number} of ${PARKS_TOTAL} · ${info.tag}`)),
        h('span', { class: 'map-mark' }, state === 'done' ? '✓' : state === 'here' ? `★ ${E.stagesBuilt(s)}/${E.PARK_STARS}` : '🔒')));
    }
    setSheet('map', 'Park map', [
      h('p', { class: 'note', html: `You are in <b>${townInfo(s.town).name}</b>, park ${s.town + 1} of ${PARKS_TOTAL}. Finish everything in a park to open the next. Prices stop climbing after park ${TUNING.unitCapPark + 1}.` }),
      rows,
    ], () => {}, { page: true });
  }

  // What each site takes at the gate.
  function openTakings() {
    const rows = PLOTS.map((p) => {
      const rate = h('b');
      const sub = h('div', { class: 'sub' });
      const name = h('div', { class: 'name' });
      const thumb = h('div', { class: 'thumb' });
      return { k: p.index, rate, sub, name, thumb, row: h('div', { class: 'row', onclick: () => { click(); openSite(p.index); } }, thumb, h('div', { class: 'meta' }, name, sub), h('div', { class: 'side-col rate' }, rate)) };
    });
    const total = h('div', { class: 'prize' });
    setSheet('takings', 'Gate takings', [total, rows.map((r) => r.row),
      h('p', { class: 'note' }, `The park earns while you are away, for up to ${TUNING.offlineCapHours} hours at a time.`)], () => {
      const s = st();
      setHTML(total, `${COIN}${money(E.idleRate(s) * 60)} a minute`);
      for (const r of rows) {
        const plot = s.plots[r.k];
        if (r.thumb.__t !== s.town) {
          r.thumb.__t = s.town;
          r.thumb.style.cssText = siteThumbStyle(s.town, r.k);
        }
        setText(r.name, S.designAt(s, r.k).name);
        setText(r.sub, plot.stage ? `Level ${plot.stage * 10}${plot.cap ? ' · full capacity' : ''}` : 'Not built yet');
        setText(r.rate, plot.stage ? `${money(E.plotRate(s, r.k) * 60)}/min` : '–');
      }
    }, { page: true });
  }

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

  function dailyTap() {
    if (R.dailyReady(st(), clock())) showDaily();
    else toast('Today’s gift is collected. Come back tomorrow for the next.');
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
        h('img', { class: 'set-art', src: ART('cover-' + (['sweets', 'games', 'show', 'lights', 'seaside', 'rides'][set.index] || 'rides')), alt: '' }),
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
        setHTML(t.state, !unlocked ? `Arrives in ${townInfo(setUnlockTown(t.s)).name}`
          : s.cards.sets[t.s] ? 'Complete ✓'
            : complete ? '' : `${R.setCount(s, t.s)}/9 · prize ${TOKEN}${t.set.reward}`);
      }
    }, { page: true, tab: 'album' });
  }

  function openSet(s) {
    const set = CARD_SETS[s];
    const cells = set.cards.map((c) => {
      const image = h('img', { alt: c.name });
      const count = h('i', { class: 'count' });
      const el = h('div', { class: 'card-cell', onclick: () => {
        const n = st().cards.owned[c.id] || 0;
        if (n > 0) {
          click();
          zoomCard(c, n);
        }
      } }, image, count);
      return { c, image, count, el };
    });
    const note = h('div', { class: 'note' });
    setSheet('set:' + s, set.name, [note, h('div', { class: 'card-grid' }, cells.map((c) => c.el))], () => {
      const state = st();
      setHTML(note, `Collect all nine for <b>${TOKEN}${set.reward}</b>. The five-star card is gold: it only comes from gold packs and the star vault.`);
      for (const cell of cells) {
        const n = state.cards.owned[cell.c.id] || 0;
        const key = n > 0 ? 1 : 0;
        if (cell.image.__k !== key) {
          cell.image.__k = key;
          cell.image.src = cardImage(cell.c, n > 0);
        }
        toggle(cell.el, 'has', n > 0);
        show(cell.count, n > 1);
        setText(cell.count, '×' + n);
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
    const packImg = packType ? h('img', { class: 'pack-big', src: packURL(packType), alt: '' }) : null;
    overlay('reveal', [title, packImg, row, foot, more], { dismiss: false });
    const flips = cards.map((c) => {
      const def = CARDS.find((d) => d.id === c.id);
      const tag = h('div', { class: 'tag ' + (c.isNew ? 'new' : 'dupe'), html: c.isNew ? 'NEW' : `+${c.stars} ${STAR}` });
      const el = h('div', { class: 'flip' + (def.gold ? ' gold' : '') },
        h('div', { class: 'flip-inner' },
          h('div', { class: 'flip-back' }),
          h('img', { class: 'flip-front', src: cardImage(def, true), alt: def.name })),
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

  // ---- events ---------------------------------------------------------------

  function openEvents(toLeague = false) {
    const evName = h('h3');
    const evTag = h('div', { class: 'tag-line' });
    const evTime = h('div', { class: 'kicker' });
    const track = EVENT_MILESTONES.map((m) => {
      const el = h('div', { class: 'ms' }, h('b', null, fmt(m.at)), h('span', { html: describe(m.reward, true) }));
      return { m, el };
    });
    const lgTime = h('div', { class: 'kicker' });
    const table = h('div', { class: 'league' });
    const prizes = h('div', { class: 'note' });
    setSheet('events', 'Club', [
      h('div', { class: 'banner' }, evTime, evName, evTag),
      h('div', { class: 'ms-track' }, track.map((t) => t.el)),
      h('div', { class: 'banner league-banner' }, lgTime, h('h3', null, 'Club League'), h('div', { class: 'tag-line' }, 'Pearl dives and turns on the wheel score points. Top of the table at midnight wins. The other clubs are run by the game until online play is added.')),
      table, prizes,
    ], () => {
      const s = st();
      const now = clock();
      const ev = R.eventInfo(s, now);
      setText(evName, ev.theme.name);
      setText(evTag, `${ev.theme.blurb} You have ${fmt(ev.points)} points. Bigger bets earn more.`);
      setText(evTime, `Spin event · ends in ${fmtTime((ev.endsAt - now) / 1000)}`);
      track.forEach((t, i) => {
        toggle(t.el, 'got', i < ev.claimed);
        toggle(t.el, 'next', i === ev.claimed);
      });
      const lg = R.leagueInfo(s, now);
      setText(lgTime, `Daily league · ends in ${fmtTime((lg.endsAt - now) / 1000)}`);
      const html = lg.rows.map((r, i) => `<div class="lg-row${r.you ? ' you' : ''}"><i>${i + 1}</i>${r.you ? '' : `<img src="${faceURL(r.id)}" alt="">`}<span>${r.name}</span><b>${fmt(r.points)}</b></div>`).join('');
      setHTML(table, html);
      setHTML(prizes, LEAGUE_PRIZES.map((p, i) => `<b>${i === 0 ? '1st' : `Top ${p.upTo}`}</b> ${describe(p.reward, true)}`).join(' &nbsp;·&nbsp; '));
      if (s.league.last && !s.league.last.seen) s.league.last.seen = true;
    }, { page: true, tab: 'events' });
    if (toLeague) sheetBody.querySelector('.league-banner').scrollIntoView({ block: 'start' });
  }

  // ---- Chips ------------------------------------------------------------------

  function openPet() {
    const pic = h('img', { class: 'pet-pic', src: gullURL(false), alt: '' });
    const level = h('h3');
    const bar = h('i');
    const xp = h('span');
    const perks = h('div', { class: 'note' });
    const feedBtn = h('button', { class: 'btn big wide', onclick: () => {
      const fed = R.feedPet(st());
      if (!fed) return nope();
      audio.play(fed.levels ? 'milestone' : 'token');
      pic.src = gullURL(true);
      pic.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-14px)' }, { transform: 'translateY(0)' }], { duration: 360 });
      setTimeout(() => { pic.src = gullURL(false); }, 1400);
      if (fed.levels) toast(`${PET.name} reached level ${st().pet.level}! ${TOKEN}${fed.tokens}`, 'gold');
      onSave();
      refresh();
    } });
    setSheet('pet', `${PET.name} the gull`, [
      h('div', { class: 'pet-top' }, pic, h('div', { class: 'meta' }, level, h('div', { class: 'bar' }, bar), h('div', { class: 'ms-line' }, xp))),
      perks, feedBtn,
    ], () => {
      const s = st();
      const need = PET.xpFor(s.pet.level);
      const maxed = s.pet.level >= PET.maxLevel;
      setText(level, `Level ${s.pet.level}`);
      bar.style.width = maxed ? '100%' : Math.min(100, (s.pet.xp / need) * 100) + '%';
      setHTML(xp, maxed ? 'Top level' : `${s.pet.xp}/${need} chips to level ${s.pet.level + 1} · prize ${TOKEN}${PET.levelTokens(s.pet.level + 1)}`);
      setHTML(perks, `${PET.name} sniffs out the best shells and keeps watch over your spins.<br><b>Pearl dives pay +${Math.round((E.raidBonus(s) - 1) * 100)}%</b> · <b>Token meter holds ${E.tokenCap(s)}</b><br>Win chips on the machine (three cones), from balloons and from events.`);
      setHTML(feedBtn, s.pet.treats > 0 ? `Feed ${PET.name} ${CHIPS}${s.pet.treats}` : 'No chips to feed');
      feedBtn.disabled = !(s.pet.treats > 0);
    });
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
    if (reward.tokens) items.push([symURL('token'), fmt(reward.tokens), 'tokens']);
    if (reward.coins) items.push([symURL('coin'), money(raw ? reward.coins * E.unit(st().town) : reward.coins), 'coins']);
    if (reward.treats) items.push([symURL('chips'), String(reward.treats), 'chips']);
    if (reward.pack) items.push([packURL(reward.pack), '×1', PACKS[reward.pack].name]);
    if (reward.packs) {
      for (const type of Object.keys(PACKS)) if (reward.packs[type]) items.push([packURL(type), '×' + reward.packs[type], PACKS[type].name]);
    }
    return items;
  }

  // The big reveal for prizes worth stopping for.
  function celebrate({ kicker, title, sub, reward, raw = false, actions }) {
    audio.play('bigwin');
    fx.rain(70);
    buzz([20, 30, 40]);
    const buttons = actions || [['Collect', null, 'btn big wide']];
    overlay('celebrate', [
      host('ov-host', 'party'),
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
    const inner = h('div', { class: 'zoom-inner' }, h('img', { src: cardImage(card, true, 300), alt: card.name }));
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
      bonus > 0 ? h('p', { class: 'fineprint' }, `${PET.name} is helping: +${bonus}% in every tub.`) : null, done,
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
    curtainEl.replaceChildren(h('div', { class: 'rays' }), h('div', null, h('h2', null, title), h('p', null, sub)));
    curtainEl.classList.add('on');
    audio.play('tour');
    setTimeout(() => {
      // whatever happens behind it, the curtain always lifts again
      try {
        midway();
        refresh();
      } finally {
        setTimeout(() => curtainEl.classList.remove('on'), 900);
      }
    }, 500);
  }

  function showWelcome() {
    popup(() => modal([
      host('modal-host', 'welcome'),
      wordmark(),
      h('p', null, 'A sleepy park, a pocketful of spins and a lucky machine.'),
      h('ul', null,
        h('li', null, h('i', null, '1'), 'Spin the machine to win coins.'),
        h('li', null, h('i', null, '2'), 'Spend coins on four rides, the entrance, parking, restrooms and food stalls. Take them all to level 100 to open the next park.'),
        h('li', null, h('i', null, '3'), 'Win turns on the prize wheel, go pearl diving, collect cards and look after Chips.')),
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
      till.capped ? h('p', { class: 'fineprint' }, `The gate only keeps ${TUNING.offlineCapHours} hours of takings while you are away.`) : null,
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
      kicker: 'The Pie League',
      title: result.rank === 1 ? 'You won the league!' : `You came ${['', '1st', '2nd', '3rd'][result.rank] || result.rank + 'th'}`,
      sub: `${fmt(result.points)} points yesterday.`,
      reward: result.reward,
    }));
  }

  function showDaily() {
    if (!R.dailyReady(st(), clock())) return;
    popup(() => {
      const s = st();
      if (!R.dailyReady(s, clock())) {
        nextPopup(); // collected in the meantime
        return;
      }
      const today = s.daily.day % DAILY.length;
      modal([
        h('div', { class: 'kicker' }, 'Daily gift'),
        h('h2', null, `Day ${today + 1}`),
        h('div', { class: 'daily' }, DAILY.map((r, i) => h('div', { class: 'day' + (i < today ? ' got' : i === today ? ' today' : '') }, h('small', null, `Day ${i + 1}`), h('span', { html: describe(r, true) })))),
        h('div', { class: 'actions' }, h('button', { class: 'btn big wide', onclick: () => {
          const got = R.claimDaily(st(), clock());
          audio.play('claim');
          closeModal();
          if (got) toast(`Daily gift: ${describe(got.reward)}`, 'gold');
          onSave();
          refresh();
        } }, 'Collect')),
      ], { dismiss: false });
    });
  }

  function openSettings() {
    const s = st();
    const sw = (key, label) => {
      const b = h('button', { class: 'switch' + (s.settings[key] ? ' on' : ''), role: 'switch', 'aria-label': label });
      b.addEventListener('click', () => {
        s.settings[key] = !s.settings[key];
        toggle(b, 'on', s.settings[key]);
        audio.sync();
        click();
        onSave();
      });
      return h('div', { class: 'set-row' }, h('span', null, label), b);
    };
    const code = h('textarea', { id: 'save-code', 'aria-label': 'Save code', placeholder: 'Paste a save code here to load it', spellcheck: 'false' });
    const msg = h('p', { class: 'fineprint' }, 'Your game saves on this device automatically.');
    const stats = [
      ['Parks finished', fmt(s.stats.towns)], ['Spins', fmt(s.stats.spins)], ['Coins won', money(s.stats.coinsWon)],
      ['Pies thrown', fmt(s.stats.attacks)], ['Lucky dips', fmt(s.stats.raids)], ['Jackpots', fmt(s.stats.jackpots)],
      ['Cards collected', fmt(s.stats.cards)], ['Guests served', fmt(s.stats.served)], ['Time played', fmtTime(s.stats.playTime)],
    ];
    modal([
      h('h2', null, 'Settings'),
      sw('sfx', 'Sound effects'), sw('music', 'Fairground organ'), sw('haptics', 'Vibration'),
      h('h4', null, 'Your park so far'),
      h('div', { class: 'stat-list' }, stats.map(([k, v]) => [h('span', null, k), h('b', null, v)])),
      h('h4', null, 'Move your save'),
      code,
      h('div', { class: 'actions' },
        h('button', { class: 'btn blue', onclick: async () => {
          click();
          code.value = exportCode(st());
          code.select();
          try {
            await navigator.clipboard.writeText(code.value);
            setText(msg, 'Save code copied. Keep it somewhere safe.');
          } catch {
            setText(msg, 'Copy the code above and keep it somewhere safe.');
          }
        } }, 'Copy save code'),
        h('button', { class: 'btn plain', onclick: () => {
          const loaded = importCode(code.value);
          if (!loaded) {
            nope();
            setText(msg, 'That does not look like a save code.');
            return;
          }
          click();
          onReplaceSave(loaded);
        } }, 'Load code')),
      msg,
      h('div', { class: 'actions' },
        h('button', { class: 'btn red', onclick: () => { click(); confirmReset(); } }, 'Start over'),
        h('button', { class: 'btn big', onclick: () => { click(); closeModal(); } }, 'Done')),
      h('p', { class: 'fineprint' }, `${GAME_TITLE} v${VERSION}`),
    ]);
  }

  function confirmReset() {
    modal([
      h('h2', null, 'Start over?'),
      h('p', null, 'This wipes everything: your parks, cards, spins and Chips. It cannot be undone.'),
      h('div', { class: 'actions' },
        h('button', { class: 'btn plain big', onclick: () => { click(); openSettings(); } }, 'Keep my park'),
        h('button', { class: 'btn red big', onclick: () => onReset() }, 'Wipe it')),
    ]);
  }

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
        h('div', { class: 'prize', html: describe(product.grant, true) || 'No more adverts between towns' }),
        h('p', null, `In the finished game this costs ${priceOf(product)}. No payment provider is connected in this build, so nothing is charged.`),
        h('div', { class: 'actions' },
          h('button', { class: 'btn plain big', onclick: () => { click(); done(false); } }, 'Cancel'),
          h('button', { class: 'btn gold big', onclick: () => done(true) }, 'Get it')),
      ], { dismiss: false });
    });
  }

  async function buy(product) {
    if (R.productOwned(st(), product.id)) return;
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
    const reward = R.applyPurchase(st(), product.id);
    if (!reward) return;
    if (lootItems(reward).length) celebrate({ kicker: 'Thank you!', title: product.name, reward });
    else toast(`Thank you! ${product.name} is yours.`, 'gold');
    onSave();
    refresh();
  }

  async function adTokens(from) {
    if (R.adTokensLeft(st(), clock()) <= 0) return nope();
    if (!(await watchAd('tokens'))) return undefined;
    const reward = R.claimAdTokens(st(), clock());
    if (!reward) return undefined;
    audio.play('token');
    fly(TOKEN, from || spinBtn, tokenTarget(), 8);
    toast(`Thanks for watching: ${describe(reward)}`, 'gold');
    onSave();
    refresh();
    return reward;
  }

  function openShop(section = '') {
    const preview = !(bridge() && bridge().purchase);
    const adSub = h('div', { class: 'sub' });
    const adBtn = h('button', { class: 'btn gold', onclick: (e) => adTokens(e.currentTarget) }, h('span', { class: 'ad' }, 'AD'), 'Watch');
    const tiles = PRODUCTS.map((p) => {
      const btn = h('button', { class: 'btn', onclick: () => buy(p) });
      const what = h('div', { class: 'what' });
      const stack = p.grant && p.grant.tokens ? Math.min(4, 1 + Math.floor(Math.log10(p.grant.tokens / 30))) : 0;
      const art = h('div', { class: 'art', html: p.grant && p.grant.tokens && p.group === 'tokens' ? TOKEN.repeat(stack)
        : p.id === 'coins' ? COIN.repeat(3)
          : p.grant && p.grant.packs ? `<img src="${packURL('gold')}" alt="">`.repeat(Math.min(3, p.grant.packs.gold || 1))
            : `<img src="${ART('ico-crown')}" alt="">` });
      const wide = p.group !== 'tokens';
      const el = wide
        ? h('div', { class: 'product wide' }, art, h('div', { class: 'meta' }, h('div', { class: 'name' }, p.name), what), btn, p.tag ? h('div', { class: 'ribbon', style: 'left:auto;right:10px;transform:none' }, p.tag) : null)
        : h('div', { class: 'product' }, p.tag ? h('div', { class: 'ribbon' }, p.tag) : null, art, what, h('div', { class: 'name' }, p.name), btn);
      el.dataset.pid = p.id;
      return { p, el, btn, what, wide };
    });
    const group = (name) => tiles.filter((t) => t.p.group === name).map((t) => t.el);
    setSheet('shop', 'Offers', [
      preview ? h('div', { class: 'shop-note' }, STORE_PREVIEW
        ? 'Preview shop: no payment or advert provider is connected yet, so purchases are free and adverts are stand-ins.'
        : 'The shop opens soon.') : null,
      h('h5', null, 'Free'),
      h('div', { class: 'product wide' }, h('div', { class: 'art', html: TOKEN }), h('div', { class: 'meta' }, h('div', { class: 'name' }, `${ADS.tokens} free spins`), adSub), adBtn),
      h('h5', null, 'Spin packs'),
      h('div', { class: 'shop-grid' }, group('tokens')),
      h('h5', null, 'Bundles'),
      h('div', { class: 'shop-grid' }, group('bundle')),
      h('h5', null, 'Extras'),
      h('div', { class: 'shop-grid' }, group('extra')),
    ], () => {
      const s = st();
      const left = R.adTokensLeft(s, clock());
      setText(adSub, !adsReady() ? 'Adverts are not available yet' : left > 0 ? `Watch a short advert · ${left} left today` : 'Come back tomorrow for more');
      adBtn.disabled = left <= 0 || !adsReady();
      for (const t of tiles) {
        const owned = R.productOwned(s, t.p.id);
        toggle(t.el, 'owned', owned);
        setHTML(t.what, t.wide ? `<span class="sub">${t.p.desc || describe(t.p.grant, true)}</span>` : `${TOKEN}${fmt(t.p.grant.tokens)}`);
        setText(t.btn, owned ? 'Owned' : priceOf(t.p));
        t.btn.disabled = owned || (preview && !STORE_PREVIEW);
      }
    }, { page: true, tab: 'shop' });
    const jump = section && sheetBody.querySelector(`[data-pid="${section}"]`);
    if (jump) jump.scrollIntoView({ block: 'center' });
  }

  function outOfTokens() {
    if (busy()) return;
    const s = st();
    const left = R.adTokensLeft(s, clock());
    const secs = R.nextTokenIn(s, clock());
    modal([
      host('modal-host', 'sad'),
      h('div', { class: 'kicker' }, 'Out of spins'),
      h('h2', null, 'The machine needs feeding'),
      h('p', { html: `A spin comes back every ${TUNING.tokenEvery / 60} minutes${secs > 0 ? `; the next is <b>${fmtClock(secs)}</b> away` : ''}.` }),
      h('div', { class: 'actions stack' },
        left > 0 && adsReady() ? h('button', { class: 'btn gold big', onclick: async (e) => {
          const from = e.currentTarget;
          closeModal();
          await adTokens(from);
        } }, h('span', { class: 'ad' }, 'AD'), `Watch for ${ADS.tokens} spins`) : null,
        h('button', { class: 'btn big', onclick: () => { click(); closeModal(); openShop(); } }, 'Visit the shop'),
        h('button', { class: 'btn plain big', onclick: () => { click(); closeModal(); } }, 'Wait')),
    ]);
  }

  // ---- splash -----------------------------------------------------------------

  function showSplash(done) {
    // the painted loading screen, with a real bar and button laid over its own
    const fill = h('i');
    const el = h('div', { class: 'splash loading', role: 'button', tabindex: '0', 'aria-label': 'Tap to play' },
      h('div', { class: 'splash-art' }, h('div', { class: 'load-bar' }, fill), h('div', { class: 'tap' }, 'Tap to play')));
    requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = '100%'; }));
    setTimeout(() => el.classList.remove('loading'), 1250);
    const go = () => {
      if (el.classList.contains('gone')) return;
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
    if (busy() || slot.spinning || held || s.stats.upgrades >= 2 || s.mission.index > 2 || document.querySelector('.splash')) return coach(null);
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
    setText(starsEl, fmt(s.stats.upgrades));

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
    const adsLeft = R.adTokensLeft(s, now);
    setText(adLine, adsLeft > 0 ? `+${ADS.tokens} spins` : 'Back tomorrow');
    toggle(adBtn, 'out', adsLeft <= 0);

    // the park page and the tabs
    setHTML(townChipText, `${info.name} <i>•</i> Park ${info.number} / ${PARKS_TOTAL}`);
    townChipBar.style.width = (built / E.PARK_STARS) * 100 + '%';
    setText(townBarText, `${built} / ${E.PARK_STARS}`);
    let canBuild = 0;
    for (const p of PLOTS) {
      const plot = s.plots[p.index];
      if (!(plot.stage >= STAGES && plot.cap) && s.coins >= E.stageCost(s.town, p.index, Math.min(plot.stage, STAGES) + 1)) canBuild++;
    }
    setBadge(tabs.park, canBuild + (E.townComplete(s) ? 1 : 0));
    const packs = Object.values(s.cards.packs).reduce((a, b) => a + b, 0);
    const claimable = CARD_SETS.filter((set) => !s.cards.sets[set.index] && R.setComplete(s, set.index)).length;
    setBadge(tabs.album, packs + claimable);
    setBadge(tabs.events, s.league.last && !s.league.last.seen ? 1 : 0);
    setBadge(tabs.shop, 0);
    setBadge(tabs.machine, 0);
    // the shortcut rails
    const today = R.dayNumber(now);
    setBadge(rails.daily, R.dailyReady(s, now) ? 1 : 0);
    setBadge(rails.lucky, s.wheel.day !== today ? 1 : 0);
    setBadge(rails.free, adsLeft);
    setBadge(rails.packs, packs);
    setBadge(rails.wheel, s.wheel.tickets);
    setBadge(rails.pet, s.pet.treats);
    setBadge(rails.tasks, mission.done ? 1 : 0);
    setText(rails.event.pill, fmtTime((ev.endsAt - now) / 1000));
    setText(rails.league.pill, fmtTime((R.leagueInfo(s, now).endsAt - now) / 1000));
    updateCoach();

    // early on, point at the first plot worth building
    let point = -1;
    if (s.stats.upgrades < 3 && s.stats.upgrades > 0 && !current && base === 'park') {
      point = PLOTS.findIndex((p) => s.plots[p.index].stage < STAGES && s.coins >= E.stageCost(s.town, p.index, s.plots[p.index].stage + 1));
    }
    renderer.setPointer(point);

    // a finished park: offer to move on, once, as soon as nothing else is showing
    if (E.townComplete(s) && prompted !== s.town && !busy() && !slot.spinning && !held) {
      prompted = s.town;
      setTimeout(() => popup(townDone), 900);
    }

    if (current) current.refresh();
  }

  root.append(machine, hud, parkUI, sheet, tabbar, toasts, coachEl, fxCanvas, curtainEl);

  // The whole game is laid out on a fixed 390 x 847 stage (the shape of the
  // paintings) and scaled to fit the screen.
  function measure() {
    const k = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
    root.style.setProperty('--s', k.toFixed(4));
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
    get sheetKey() { return current ? current.key : null; },
    get base() { return base; },
    // the park only needs drawing when it can be seen
    get parkVisible() { return (base === 'park' && !(current && current.page)) || performance.now() - baseAt < 480; },
    get busy() { return busy(); },
    get coinCard() { return coinCard; },
  };
}
