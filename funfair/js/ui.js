// The DOM layer: HUD, the slot machine dock, sheets, mini-games and modals.
// Sheets are built once when opened and refreshed in place, so buttons never
// get replaced under the player's finger.
import {
  CARDS, CARD_SETS, CURRENCY, DAILY, EVENT_MILESTONES, GAME_TITLE, GUEST_LOOKS, LEAGUE_PRIZES, PACKS, PET, PLOTS, STAGES,
  TOWN_REWARD, TUNING, UPGRADE_REWARDS, VAULT, VERSION, setUnlockTown, townInfo,
} from './config.js';
import * as A from './art.js';
import { cardImage, symbolImage } from './cardart.js';
import * as E from './economy.js';
import { fmt, fmtClock, fmtTime, money } from './format.js';
import { currentMission } from './goals.js';
import { thumbnail } from './render.js';
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
  close: svg('<path d="M5 5l14 14M19 5 5 19" stroke-width="3"/>'),
  back: svg('<path d="M14 5l-7 7 7 7" stroke-width="3"/>'),
  stop: svg('<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>'),
};
const STAR = '<span class="star">★</span>';
const img = (src, cls = 'ico') => `<img class="${cls}" src="${src}" alt="">`;

export function createUI({ world, renderer, audio, clock, onSave, onReplaceSave, onReset }) {
  const root = document.getElementById('ui');
  const st = () => world.state;
  const rand = Math.random;
  const TOKEN = img(symbolImage('token', 40));
  const COIN = img(symbolImage('coin', 40));
  const CHIPS = img(symbolImage('chips', 40));
  const LOCK = symbolImage('lock', 40);

  const cache = new Map();
  const memo = (key, make) => {
    if (!cache.has(key)) cache.set(key, make());
    return cache.get(key);
  };
  const thumbURL = (design) => memo('thumb' + design.index, () => thumbnail(design, 88, 74).toDataURL());
  const packURL = (type) => memo('pack' + type, () => {
    const cv = document.createElement('canvas');
    cv.width = 160;
    cv.height = 220;
    A.drawPack(cv.getContext('2d'), 80, 112, 2, type);
    return cv.toDataURL();
  });
  const tubURL = (open, found) => memo(`tub${open}${found}`, () => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 220;
    A.drawTub(cv.getContext('2d'), 110, 124, 2, open, found);
    return cv.toDataURL();
  });
  const gullURL = (happy) => memo('gull' + happy, () => {
    const cv = document.createElement('canvas');
    cv.width = 300;
    cv.height = 240;
    A.drawGull(cv.getContext('2d'), 130, 220, 2, 0.5, happy);
    return cv.toDataURL();
  });
  const pieURL = () => symbolImage('pie', 80);
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
    return parts.join(' ');
  }

  // ---- HUD ----------------------------------------------------------------

  const coinsEl = h('b', null, CURRENCY + '0');
  const tillEl = h('small');
  const tokensEl = h('b', null, '0');
  const tokenTimer = h('small');
  const shieldEls = [0, 1, 2].map(() => h('img', { src: LOCK, alt: '' }));
  const coinCard = h('div', { class: 'stat-card coins' }, h('span', { class: 'ico-wrap', html: COIN }), h('div', null, coinsEl, tillEl));
  const tokenCard = h('div', { class: 'stat-card tokens' }, h('span', { class: 'ico-wrap', html: TOKEN }), h('div', null, tokensEl, tokenTimer));
  const shieldCard = h('div', { class: 'stat-card shields', title: 'Padlocks stop pies thrown by rivals' }, shieldEls);
  const gearBtn = h('button', { class: 'round-btn', 'aria-label': 'Settings', html: ICON.gear, onclick: () => { click(); openSettings(); } });
  const missionText = h('div', { class: 'goal-text' });
  const missionBar = h('i');
  const missionReward = h('span', { class: 'goal-reward' });
  const missionBtn = h('button', { class: 'goal', onclick: onMission },
    h('div', { class: 'goal-main' }, h('div', { class: 'goal-label' }, 'Mission'), missionText, h('div', { class: 'bar' }, missionBar)),
    missionReward);
  const hud = h('div', { class: 'hud' }, h('div', { class: 'hud-row' }, coinCard, tokenCard, shieldCard, gearBtn), missionBtn);

  function onMission() {
    const mission = currentMission(st());
    if (mission.done) {
      S.claimMission(world);
      refresh();
      return;
    }
    click();
    if (mission.go === 'build') openBuild();
    else if (mission.go === 'cards') openAlbum();
    else if (mission.go === 'pet') openPet();
    else {
      closeSheet();
      spinBtn.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 420 });
    }
  }

  // ---- side buttons ---------------------------------------------------------

  const sideBtn = (key, label, icon, fn) => {
    const badge = h('i', { class: 'badge' });
    const b = h('button', { class: 'side-btn', 'aria-label': label, onclick: () => { click(); fn(); } }, h('span', { html: icon }), h('small', null, label), badge);
    b.badge = badge;
    return b;
  };
  const albumBtn = sideBtn('album', 'Album', ICON.album, () => openAlbum());
  const eventsBtn = sideBtn('events', 'Events', ICON.events, () => openEvents());
  const petBtn = sideBtn('pet', PET.name, `<img src="${gullURL(false)}" alt="">`, () => openPet());
  const newsBtn = sideBtn('news', 'News', ICON.news, () => openNews());
  const side = h('div', { class: 'side' }, h('div', { class: 'side-group' }, albumBtn, eventsBtn), h('div', { class: 'side-group' }, petBtn, newsBtn));
  const setBadge = (btn, n) => {
    show(btn.badge, n > 0);
    if (n > 0) setText(btn.badge, n > 99 ? '99+' : String(n));
  };

  // ---- the machine ----------------------------------------------------------

  const reelCanvas = h('canvas', { class: 'reels', 'aria-label': 'Slot machine reels' });
  const banner = h('div', { class: 'win-banner' });
  const townEl = h('button', { class: 'marquee-btn', onclick: () => { click(); openBuild(); } });
  const eventEl = h('button', { class: 'marquee-btn event', onclick: () => { click(); openEvents(); } });
  const eventBar = h('i');
  const buildBadge = h('i', { class: 'badge' });
  const buildBtn = h('button', { class: 'dock-btn', onclick: () => { click(); openBuild(); } }, h('span', { html: ICON.build }), 'Build', buildBadge);
  const betBtn = h('button', { class: 'dock-btn bet', onclick: () => { click(); R.cycleBet(st()); refresh(); } });
  const spinLabel = h('b', null, 'SPIN');
  const spinCost = h('small');
  const spinBtn = h('button', { class: 'spin-btn', 'aria-label': 'Spin' }, h('span', { class: 'spin-face' }, spinLabel, spinCost));
  const bulbs = h('div', { class: 'bulbs' }, Array.from({ length: 12 }, () => h('i')));
  const dock = h('div', { class: 'dock' },
    h('div', { class: 'marquee' }, townEl, h('div', { class: 'event-wrap' }, eventEl, h('div', { class: 'bar' }, eventBar))),
    h('div', { class: 'cabinet' }, bulbs, reelCanvas, banner),
    h('div', { class: 'controls' }, buildBtn, spinBtn, betBtn));

  let auto = false;
  let held = null; // the result waiting for the reels to stop
  let hideBanner = 0;
  const shown = { coins: st().coins };

  const slot = createSlotView(reelCanvas, {
    onTick: () => audio.play('tick'),
    onReelStop: () => {
      audio.play('clunk');
      buzz(8);
    },
    onStop: () => reveal(),
  });

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
    if (on) buzz(20);
  }

  const busy = () => !!overlayEl || !!modalEl;

  function say(html, cls = '', ms = 1500) {
    banner.className = 'win-banner on ' + cls;
    setHTML(banner, html);
    banner.__html = null;
    hideBanner = performance.now() + ms;
  }

  function doSpin() {
    audio.unlock();
    if (busy()) return;
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
      setAuto(false);
      nope();
      const secs = R.nextTokenIn(s, clock());
      say(secs > 0 ? `Out of tokens. Next one in ${fmtClock(secs)}` : 'Out of tokens', 'quiet', 2200);
      tokenCard.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }], { duration: 260 });
      return;
    }
    held = res;
    banner.classList.remove('on');
    audio.play('spin');
    buzz(12);
    slot.spin(res.reels, auto);
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
    switch (res.kind) {
      case 'mixed':
        if (res.coins > 0) {
          say(`+${money(res.coins)}`, 'coins');
          audio.play('coin');
          fly(COIN, reelCanvas, coinCard, 4);
        }
        break;
      case 'coins3':
        say(`+${money(res.coins)}`, 'coins big');
        audio.play('win');
        fly(COIN, reelCanvas, coinCard, 9);
        break;
      case 'sacks3':
        say(`BIG WIN  +${money(res.coins)}`, 'coins big', 2200);
        audio.play('bigwin');
        fly(COIN, reelCanvas, coinCard, 16);
        buzz([30, 40, 30]);
        break;
      case 'jackpot':
        say(`JACKPOT!  +${money(res.coins)}`, 'jackpot', 2600);
        audio.play('jackpot');
        fly(COIN, reelCanvas, coinCard, 22);
        renderer.fireworks(4);
        buzz([40, 40, 40, 40, 80]);
        toast(`Jackpot! A ${PACKS.silver.name.toLowerCase()} is waiting in your album.`, 'gold');
        break;
      case 'shield':
        say(res.overflow ? `Padlocks full: +${money(res.coins)}` : 'Padlock! Your fair is safer', 'shield');
        audio.play('lock');
        if (res.overflow) fly(COIN, reelCanvas, coinCard, 4);
        break;
      case 'tokens':
        say(`+${res.tokens} free spins`, 'tokens');
        audio.play('token');
        fly(TOKEN, reelCanvas, tokenCard, 6);
        break;
      case 'treats':
        say(`+${res.treats} chips for ${PET.name}`, 'treats');
        audio.play('token');
        fly(CHIPS, reelCanvas, petBtn, 5);
        break;
      case 'attack':
        say('PIE TIME!', 'attack', 1200);
        audio.play('fanfare');
        buzz([30, 30, 60]);
        break;
      case 'raid':
        say('LUCKY DIP!', 'raid', 1200);
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
  function fly(iconHTML, from, to, count) {
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
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

  function setSheet(key, title, body, refreshFn, back = null) {
    setAuto(false);
    sheetTitle.replaceChildren(...[title].flat());
    sheetBody.replaceChildren(...[body].flat(Infinity).filter(Boolean));
    sheetBody.scrollTop = 0;
    show(sheetBack, !!back);
    sheetBack.onclick = back ? () => { click(); back(); } : null;
    current = { key, refresh: refreshFn };
    sheet.classList.add('open');
    refreshFn();
    renderer.setSheetCover(wide() ? 0 : sheet.offsetHeight);
  }

  function closeSheet() {
    if (!current) return;
    current = null;
    sheet.classList.remove('open');
    renderer.setSelected(-1);
    renderer.setSheetCover(0);
  }

  // ---- build ----------------------------------------------------------------

  function openBuild(focusPlot = -1) {
    const info = () => townInfo(st().town);
    const progress = h('i');
    const progressText = h('span');
    const rewardLine = h('div', { class: 'note' });
    const travelBtn = h('button', { class: 'btn gold big wide', onclick: () => travelNow() });
    const rows = PLOTS.map((p) => {
      const k = p.index;
      const name = h('div', { class: 'name' });
      const stars = h('div', { class: 'stars' });
      const sub = h('div', { class: 'sub' });
      const thumb = h('img', { class: 'thumb', alt: '' });
      const btn = h('button', { class: 'btn' });
      btn.addEventListener('click', () => {
        const s = st();
        if (s.plots[k].splat) {
          const fixed = R.repairPlot(s, k);
          if (!fixed) return nope();
          audio.play('upgrade');
          toast(`${S.designAt(s, k).name} is clean and open again.`);
        } else {
          const up = R.upgradePlot(s, k);
          if (!up) return nope();
          onUpgrade(k, up);
        }
        refresh();
      });
      const row = h('div', { class: 'row' }, thumb, h('div', { class: 'meta', onclick: () => select(k) }, name, stars, sub), h('div', { class: 'side-col' }, btn));
      return { k, row, name, stars, sub, thumb, btn };
    });
    const select = (k) => {
      renderer.setSelected(k);
      renderer.focus(k);
      rows.forEach((r) => toggle(r.row, 'picked', r.k === k));
    };
    const head = h('div', { class: 'town-head' },
      h('div', { class: 'ms-line' }, progressText, h('span', null, 'Finish every attraction to move on')),
      h('div', { class: 'bar' }, progress));
    setSheet('build', h('span', null, ''), [head, rows.map((r) => r.row), rewardLine, travelBtn], () => {
      const s = st();
      setText(sheetTitle, info().name);
      const built = E.stagesBuilt(s);
      const total = PLOTS.length * STAGES;
      setText(progressText, `★ ${built} of ${total}`);
      progress.style.width = (built / total) * 100 + '%';
      const done = E.townComplete(s);
      show(travelBtn, done);
      setText(travelBtn, `Pack up for ${townInfo(s.town + 1).name}`);
      setHTML(rewardLine, done
        ? `Every attraction is at five stars. The road is calling: <b>${describe(TOWN_REWARD, true)}</b> when you move on.`
        : `Finishing ${info().name} pays <b>${describe(TOWN_REWARD, true)}</b> and opens ${townInfo(s.town + 1).name}.`);
      for (const r of rows) {
        const plot = s.plots[r.k];
        const d = S.designAt(s, r.k);
        if (r.thumb.__d !== d.index) {
          r.thumb.__d = d.index;
          r.thumb.src = thumbURL(d);
        }
        setText(r.name, d.name);
        setText(r.stars, '★'.repeat(plot.stage) + '☆'.repeat(STAGES - plot.stage));
        toggle(r.row, 'done', plot.stage >= STAGES && !plot.splat);
        r.btn.className = 'btn' + (plot.splat ? ' red' : '');
        if (plot.splat) {
          const cost = E.repairCost(s.town, r.k, plot.stage);
          setText(r.sub, 'Covered in custard. Closed until cleaned.');
          setHTML(r.btn, `Clean up<small>${money(cost)}</small>`);
          r.btn.disabled = s.coins < cost;
        } else if (plot.stage >= STAGES) {
          setText(r.sub, 'Five stars. Nothing left to add.');
          setHTML(r.btn, 'Complete');
          r.btn.disabled = true;
        } else {
          const cost = E.stageCost(s.town, r.k, plot.stage + 1);
          const bonus = UPGRADE_REWARDS[plot.stage + 1];
          setHTML(r.sub, plot.stage === 0 ? d.blurb : bonus ? `Next star pays ${describe(bonus)}` : 'More stars draw more guests');
          setHTML(r.btn, `${plot.stage === 0 ? 'Build' : 'Upgrade'}<small>${money(cost)}</small>`);
          r.btn.disabled = s.coins < cost;
        }
      }
    });
    if (focusPlot >= 0) {
      select(focusPlot);
      rows[focusPlot].row.scrollIntoView({ block: 'nearest' });
    }
  }

  function onUpgrade(k, up) {
    const p = PLOTS[k];
    const d = S.designAt(st(), k);
    audio.play(up.stage === 1 ? 'build' : up.stage === STAGES ? 'milestone' : 'upgrade');
    renderer.confetti(p.x, p.y - d.h * 0.5, up.stage === STAGES ? 70 : 30);
    buzz(up.stage === STAGES ? [20, 30, 40] : 14);
    if (up.stage === 1) toast(`<b>${d.name}</b> is open for business!`);
    else if (up.stage === STAGES) toast(`<b>${d.name}</b> is a five-star attraction!`, 'gold');
    if (up.reward && (up.reward.tokens || up.reward.pack)) toast(`Upgrade bonus: ${describe(up.reward)}`, 'gold');
    if (up.complete) renderer.fireworks(6);
    onSave();
  }

  let prompted = -1; // the town we have already offered to leave
  function townDone() {
    if (!E.townComplete(st())) {
      nextPopup(); // already moved on: let anything queued behind this show
      return;
    }
    const s = st();
    audio.play('tour');
    modal([
      h('div', { class: 'kicker' }, 'Fair complete'),
      h('h2', null, townInfo(s.town).name),
      h('p', { html: `Every attraction at five stars and the whole town talking. Next stop: <b>${townInfo(s.town + 1).name}</b>.` }),
      h('div', { class: 'prize', html: describe(TOWN_REWARD, true) }),
      h('div', { class: 'actions' },
        h('button', { class: 'btn plain big', onclick: () => { click(); closeModal(); } }, 'Stay a while'),
        h('button', { class: 'btn gold big', onclick: () => { closeModal(); travelNow(); } }, 'Pack up')),
    ]);
  }

  function travelNow() {
    if (!E.townComplete(st())) return nope();
    const next = townInfo(st().town + 1);
    closeSheet();
    curtain(next.name, next.tag, () => {
      const moved = R.travel(st());
      S.resetWorld(world);
      renderer.resetView();
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
      audio.play('jackpot');
      renderer.fireworks(6);
      toast(`Album complete! ${describe(reward)}. A new season begins.`, 'gold');
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
        audio.play('milestone');
        renderer.fireworks(3);
        toast(`${set.name} complete! ${describe(reward)}`, 'gold');
        onSave();
        refresh();
      } }, 'Claim');
      const el = h('button', { class: 'set-tile', style: `--set:${set.color}`, onclick: () => { click(); openSet(s); } },
        h('div', { class: 'set-name' }, set.name), h('div', { class: 'dots' }, dots), state, claim);
      return { s, set, dots, state, claim, el };
    });
    setSheet('album', 'Album', [have, h('div', { class: 'packs' }, packTiles.map((p) => p.el)), vaultBtn, albumBtnBig, h('div', { class: 'sets' }, tiles.map((t) => t.el))], () => {
      const s = st();
      const sets = R.unlockedSets(s);
      setHTML(have, `Season ${s.cards.season} · <b>${R.cardsOwned(s)} of ${CARDS.length}</b> cards. Finish a set for tokens; finish the album for <b>${TOKEN}500</b>.`);
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
    });
  }

  function openSet(s) {
    const set = CARD_SETS[s];
    const cells = set.cards.map((c) => {
      const image = h('img', { alt: c.name });
      const count = h('i', { class: 'count' });
      return { c, image, count, el: h('div', { class: 'card-cell' }, image, count) };
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
        show(cell.count, n > 1);
        setText(cell.count, '×' + n);
      }
    }, openAlbum);
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
    }, openAlbum);
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
    const row = h('div', { class: 'reveal-row' });
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
        tag);
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

  function openEvents() {
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
    setSheet('events', 'Events', [
      h('div', { class: 'banner' }, evTime, evName, evTag),
      h('div', { class: 'ms-track' }, track.map((t) => t.el)),
      h('div', { class: 'banner league-banner' }, lgTime, h('h3', null, 'The Pie League'), h('div', { class: 'tag-line' }, 'Pies and lucky dips score points. Top of the table at midnight wins.')),
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
    });
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
      setHTML(perks, `${PET.name} sniffs out the best tubs and keeps watch over your tokens.<br><b>Lucky dips pay +${Math.round((E.raidBonus(s) - 1) * 100)}%</b> · <b>Token meter holds ${E.tokenCap(s)}</b><br>Win chips on the machine (three cones), from balloons and from events.`);
      setHTML(feedBtn, s.pet.treats > 0 ? `Feed ${PET.name} ${CHIPS}${s.pet.treats}` : 'No chips to feed');
      feedBtn.disabled = !(s.pet.treats > 0);
    });
  }

  // ---- news -------------------------------------------------------------------

  function openNews() {
    const list = h('div');
    const empty = h('div', { class: 'note' }, 'All quiet. Rivals throw pies while you are away; padlocks from the machine stop them.');
    let built = '';
    setSheet('news', 'Fair news', [empty, list], () => {
      const s = st();
      const now = clock();
      const key = s.news.map((n) => `${n.t}${n.revenge}`).join('|') + (s.pending ? 'p' : '');
      show(empty, s.news.length === 0);
      if (key === built) return;
      built = key;
      list.replaceChildren(...s.news.map((item) => {
        const who = R.rivalName(item.rival);
        const ago = fmtTime(Math.max(0, (now - item.t) / 1000));
        const what = item.blocked
          ? `<b>${who}</b> threw a pie. Your padlock stopped it.`
          : `<b>${who}</b> pied your <b>${S.designAt(s, item.plot).name}</b>!`;
        const btn = item.revenge ? h('button', { class: 'btn red small', onclick: () => {
          if (!R.startRevenge(st(), item, rand)) return nope();
          click();
          closeSheet();
          openPending();
        } }, 'Get even') : null;
        return h('div', { class: 'row news' + (item.blocked ? ' ok' : '') }, h('img', { class: 'face', src: faceURL(item.rival), alt: '' }),
          h('div', { class: 'meta' }, h('div', { class: 'sub', html: what }), h('div', { class: 'when' }, `${ago} ago`)), btn && h('div', { class: 'side-col' }, btn));
      }));
      for (const n of s.news) n.seen = true;
    });
  }

  // ---- overlays (mini-games and reveals) ----------------------------------------

  let overlayEl = null;
  function overlay(cls, children, { dismiss = false } = {}) {
    if (overlayEl) overlayEl.remove();
    setAuto(false);
    const box = h('div', { class: 'ov-box' }, children);
    overlayEl = h('div', { class: 'overlay ' + cls }, box);
    if (dismiss) overlayEl.addEventListener('click', (e) => { if (e.target === overlayEl) closeOverlay(); });
    root.append(overlayEl);
    return box;
  }
  function closeOverlay() {
    if (overlayEl) overlayEl.remove();
    overlayEl = null;
    nextPopup();
  }

  function openPending() {
    const p = st().pending;
    if (!p || busy()) return;
    closeSheet();
    if (p.type === 'attack') openAttack(p);
    else openRaid(p);
  }

  function openAttack(p) {
    const result = h('div', { class: 'result' });
    const done = h('div', { class: 'actions' });
    let thrown = false;
    // show the rival's fair the way it stands: back row first
    const order = [4, 5, 2, 3, 0, 1];
    const tiles = order.map((k) => {
      const d = S.designAt({ town: p.rival.town }, k);
      const splat = h('div', { class: 'splat' });
      const el = h('button', { class: 'target' + (p.rival.splats[k] ? ' gone' : ''), disabled: p.rival.splats[k], 'aria-label': d.name, onclick: () => throwAt(k, el) },
        h('img', { src: thumbURL(d), alt: '' }), h('div', { class: 'stars' }, '★'.repeat(p.rival.stages[k])), splat);
      return { k, el };
    });
    const pie = h('img', { class: 'pie', src: pieURL(), alt: '' });
    const box = overlay('attack', [
      h('div', { class: 'kicker' }, p.revenge ? 'Getting even' : 'Pie time!'),
      h('div', { class: 'versus' }, h('img', { class: 'face', src: faceURL(p.rival.id), alt: '' }), h('div', null, h('h2', null, R.rivalFair(p.rival.id)), h('p', null, `Pick something of ${R.rivalName(p.rival.id)}'s to splat.`))),
      h('div', { class: 'targets' }, tiles.map((t) => t.el)), result, done, pie,
    ]);

    async function throwAt(k, el) {
      if (thrown) return;
      const res = R.resolveAttack(st(), k);
      if (!res) return nope();
      thrown = true;
      audio.play('whoosh');
      const a = box.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      const tx = b.left + b.width / 2 - a.left - 40;
      const ty = b.top + b.height / 2 - a.top - 40;
      pie.style.display = 'block';
      await pie.animate([
        { transform: `translate(${a.width / 2 - 40}px, ${a.height}px) scale(1.6) rotate(0deg)` },
        { transform: `translate(${tx}px, ${ty}px) scale(0.9) rotate(540deg)` },
      ], { duration: 480, easing: 'cubic-bezier(0.3, 0, 0.6, 1)' }).finished.catch(() => {});
      pie.style.display = 'none';
      for (const t of tiles) t.el.disabled = true;
      if (res.blocked) {
        el.classList.add('blocked');
        el.append(h('img', { class: 'lock-pop', src: LOCK, alt: '' }));
        audio.play('lock');
        setHTML(result, `<b>Blocked by a padlock!</b> Still, a little something: ${COIN}${fmt(res.coins)}`);
      } else {
        el.classList.add('hit');
        audio.play('splat');
        buzz([20, 20, 50]);
        setHTML(result, `<b>Splat!</b> You won ${COIN}${fmt(res.coins)}`);
      }
      fly(COIN, el, coinCard, res.blocked ? 5 : 14);
      onSave();
      refresh();
      done.append(h('button', { class: 'btn big wide', onclick: () => { click(); closeOverlay(); refresh(); } }, 'Back to the fair'));
    }
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
      setHTML(t.tag, p.tubs[i] > 0 ? money(p.tubs[i]) : 'Sawdust');
      t.el.disabled = true;
      sum += p.tubs[i];
    }
    const bonus = Math.round((E.raidBonus(st()) - 1) * 100);
    overlay('raid', [
      h('div', { class: 'kicker' }, 'Lucky dip!'),
      h('div', { class: 'versus' }, h('img', { class: 'face', src: faceURL(p.rival.id), alt: '' }), h('div', null, h('h2', null, R.rivalFair(p.rival.id)),
        h('p', null, `${R.rivalName(p.rival.id)} hid the takings in three of these tubs. The fourth is just sawdust.`))),
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
      setHTML(t.tag, res.amount > 0 ? money(res.amount) : 'Sawdust');
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
            setHTML(tub.tag, res.tubs[k] > 0 ? money(res.tubs[k]) : 'Sawdust');
            tub.el.classList.add('missed');
          }
        });
        setText(goes, res.sweep ? 'Clean sweep!' : 'All done');
        setHTML(total, `<b>${res.sweep ? 'You found the lot!' : 'Not bad!'}</b> ${COIN}${fmt(res.total)}`);
        if (res.sweep) {
          audio.play('bigwin');
          buzz([30, 30, 60]);
        }
        done.append(h('button', { class: 'btn big wide', onclick: () => { click(); closeOverlay(); refresh(); } }, 'Back to the fair'));
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
    curtainEl.replaceChildren(h('div', null, h('h2', null, title), h('p', null, sub)));
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
      h('img', { class: 'art', alt: '', src: thumbnail(S.designAt({ town: 1 }, 5), 190, 150).toDataURL() }),
      h('div', { class: 'logo', html: 'Starlight <span>Funfair</span>' }),
      h('p', null, 'An empty field, a pocketful of tokens and a lucky machine.'),
      h('ul', null,
        h('li', null, h('i', null, '1'), 'Spin the machine to win coins.'),
        h('li', null, h('i', null, '2'), 'Spend coins building attractions. Five stars on all six and the fair moves to a new town.'),
        h('li', null, h('i', null, '3'), 'Throw pies at rivals, raid their lucky dips, collect cards and look after Chips.')),
      h('div', { class: 'actions' },
        h('button', { class: 'btn big wide', onclick: () => { audio.unlock(); click(); closeModal(); } }, 'Open the gates')),
    ], { dismiss: false }));
  }

  function showAway(seconds, till, tokens, incidents) {
    const lines = [];
    if (till.amount > 0) lines.push(h('li', null, h('i', { html: COIN }), h('span', { html: `The fair took <b>${money(till.amount)}</b> at the gate.` })));
    if (tokens > 0) lines.push(h('li', null, h('i', { html: TOKEN }), h('span', { html: `<b>${tokens}</b> tokens are back in the meter.` })));
    for (const item of incidents) {
      const who = R.rivalName(item.rival);
      lines.push(h('li', null, h('i', null, h('img', { class: 'face', src: faceURL(item.rival), alt: '' })), h('span', { html: item.blocked
        ? `${who} threw a pie. Your padlock stopped it.`
        : `<b>${who} pied your ${S.designAt(st(), item.plot).name}!</b> It is closed until you clean it.` })));
    }
    if (!lines.length) return;
    popup(() => modal([
      h('h2', null, 'Welcome back!'),
      h('p', null, `You were away for ${fmtTime(seconds)}.`),
      h('ul', { class: 'away' }, lines),
      till.capped ? h('p', { class: 'fineprint' }, `The gate only keeps ${TUNING.offlineCapHours} hours of takings while you are away.`) : null,
      h('div', { class: 'actions' }, h('button', { class: 'btn big wide', onclick: () => { audio.unlock(); audio.play('claim'); closeModal(); } }, 'Lovely')),
    ]));
  }

  function showLeague(result) {
    if (!result) return;
    popup(() => modal([
      h('div', { class: 'kicker' }, 'The Pie League'),
      h('h2', null, result.rank === 1 ? 'You won the league!' : `You came ${['', '1st', '2nd', '3rd'][result.rank] || result.rank + 'th'}`),
      h('p', null, `${fmt(result.points)} points yesterday.`),
      h('div', { class: 'prize', html: describe(result.reward) || 'No prize this time' }),
      h('div', { class: 'actions' }, h('button', { class: 'btn big wide', onclick: () => { audio.play('claim'); closeModal(); refresh(); } }, 'Collect')),
    ]));
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
      ['Fairs finished', fmt(s.stats.towns)], ['Spins', fmt(s.stats.spins)], ['Coins won', money(s.stats.coinsWon)],
      ['Pies thrown', fmt(s.stats.attacks)], ['Lucky dips', fmt(s.stats.raids)], ['Jackpots', fmt(s.stats.jackpots)],
      ['Cards collected', fmt(s.stats.cards)], ['Guests served', fmt(s.stats.served)], ['Time played', fmtTime(s.stats.playTime)],
    ];
    modal([
      h('h2', null, 'Settings'),
      sw('sfx', 'Sound effects'), sw('music', 'Fairground organ'), sw('haptics', 'Vibration'),
      h('h4', null, 'Your fair so far'),
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
      h('p', { class: 'fineprint' }, `${GAME_TITLE} v${VERSION} · no adverts, no purchases`),
    ]);
  }

  function confirmReset() {
    modal([
      h('h2', null, 'Start over?'),
      h('p', null, 'This wipes everything: your fairs, cards, tokens and Chips. It cannot be undone.'),
      h('div', { class: 'actions' },
        h('button', { class: 'btn plain big', onclick: () => { click(); openSettings(); } }, 'Keep my fair'),
        h('button', { class: 'btn red big', onclick: () => onReset() }, 'Wipe it')),
    ]);
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
    setText(tokensEl, `${fmt(tokens)}/${cap}`);
    const secs = R.nextTokenIn(s, now);
    setText(tokenTimer, tokens >= cap ? 'Full' : `+1 · ${fmtClock(secs)}`);
    setText(tillEl, `+${money(E.idleRate(s) * 60)}/min`);
    const shields = s.shields - (held ? held.shield : 0);
    shieldEls.forEach((el, i) => toggle(el, 'on', i < shields));

    const mission = currentMission(s);
    setText(missionText, mission.text);
    missionBar.style.width = Math.round((mission.cur / mission.target) * 100) + '%';
    toggle(missionBtn, 'done', mission.done);
    setHTML(missionReward, mission.done ? `Claim ${describe(mission.reward, true)}` : `${fmt(mission.cur)}/${fmt(mission.target)} · ${describe(mission.reward, true)}`);

    // dock
    const info = townInfo(s.town);
    setHTML(townEl, `<b>${info.name}</b><small>${STAR} ${E.stagesBuilt(s)}/${PLOTS.length * STAGES}</small>`);
    const ev = R.eventInfo(s, now);
    setHTML(eventEl, ev.next ? `<b>${ev.theme.name}</b><small>${fmt(ev.points)}/${fmt(ev.next.at)} → ${describe(ev.next.reward, true)}</small>` : `<b>${ev.theme.name}</b><small>All prizes won</small>`);
    eventBar.style.width = ev.next ? Math.min(100, ((ev.points - ev.prev) / (ev.next.at - ev.prev)) * 100) + '%' : '100%';
    R.setBet(s, s.bet);
    const bets = E.availableBets(s);
    setHTML(betBtn, `<b>×${s.bet}</b>Bet`);
    betBtn.disabled = bets.length < 2;
    const spinning = slot.spinning;
    setText(spinLabel, auto ? 'AUTO' : s.pending && !spinning ? (s.pending.type === 'attack' ? 'PIE!' : 'DIP!') : 'SPIN');
    setHTML(spinCost, auto ? 'tap to stop' : tokens < 1 && !spinning ? (secs > 0 ? fmtClock(secs) : '') : `${s.bet} ${s.bet === 1 ? 'token' : 'tokens'}`);
    toggle(spinBtn, 'empty', tokens < 1 && !spinning && !s.pending);
    if (auto && tokens < s.bet && !spinning && !held) setAuto(false);

    let canBuild = 0;
    for (const p of PLOTS) {
      const plot = s.plots[p.index];
      if (plot.splat ? s.coins >= E.repairCost(s.town, p.index, plot.stage) : plot.stage < STAGES && s.coins >= E.stageCost(s.town, p.index, plot.stage + 1)) canBuild++;
    }
    setBadge({ badge: buildBadge }, canBuild + (E.townComplete(s) ? 1 : 0));
    const packs = Object.values(s.cards.packs).reduce((a, b) => a + b, 0);
    const claimable = CARD_SETS.filter((set) => !s.cards.sets[set.index] && R.setComplete(s, set.index)).length;
    setBadge(albumBtn, packs + claimable);
    setBadge(petBtn, s.pet.treats);
    setBadge(newsBtn, s.news.filter((n) => !n.seen).length);
    setBadge(eventsBtn, s.league.last && !s.league.last.seen ? 1 : 0);

    // early on, point at the first plot worth building
    let point = -1;
    if (s.stats.upgrades < 3 && !current) {
      const k = PLOTS.findIndex((p) => s.plots[p.index].stage < STAGES && s.coins >= E.stageCost(s.town, p.index, s.plots[p.index].stage + 1));
      point = k;
    }
    renderer.setPointer(point);

    // a finished fair: offer to move on, once, as soon as nothing else is showing
    if (E.townComplete(s) && prompted !== s.town && !busy() && !slot.spinning && !held) {
      prompted = s.town;
      setTimeout(() => popup(townDone), 900);
    }

    if (current) current.refresh();
  }

  root.append(hud, side, dock, sheet, toasts, curtainEl);

  const wide = () => root.classList.contains('wide');
  function measure() {
    const w = window.innerWidth;
    const hgt = window.innerHeight;
    toggle(root, 'wide', w >= 900 || (w > hgt && hgt < 560));
    const top = hud.getBoundingClientRect().bottom + 6;
    if (wide()) renderer.setInsets(top, 0, dock.offsetWidth + 20);
    else renderer.setInsets(top, dock.offsetHeight, 0);
    toasts.style.top = top + 4 + 'px';
    root.style.setProperty('--top', top + 'px');
    root.style.setProperty('--dock-h', dock.offsetHeight + 'px');
    slot.resize();
  }
  refresh();
  measure();

  return {
    refresh,
    frame,
    measure,
    toast,
    describe,
    spin: doSpin,
    openBuild,
    openPending,
    closeSheet,
    showWelcome,
    showAway,
    showLeague,
    showDaily,
    fly,
    get sheetKey() { return current ? current.key : null; },
    get busy() { return busy(); },
    get coinCard() { return coinCard; },
  };
}
