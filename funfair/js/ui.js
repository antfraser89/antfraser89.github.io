// The DOM layer: HUD, bottom navigation, sheets, modals and toasts.
// Sheets are built once when opened and then refreshed in place, so buttons
// never get replaced under the player's finger.
import { ATTRACTIONS, CURRENCY, GAME_TITLE, PARK, SHOP, TOWNS, TUNING, VERSION } from './config.js';
import * as E from './economy.js';
import { fmt, fmtClock, fmtTime, money } from './format.js';
import { currentGoal } from './goals.js';
import { thumbnail, townFor } from './render.js';
import * as S from './sim.js';
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
  el.style.display = on ? '' : 'none';
};

const STAR = '<span class="star">★</span>';
const svg = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICON = {
  rides: svg('<circle cx="12" cy="10" r="7"/><path d="M12 3v14M5 10h14M7 5l10 10M17 5 7 15M8 21l4-11 4 11"/>'),
  park: svg('<path d="M4 10v4h3l6 4V6l-6 4H4zM17 9a4 4 0 0 1 0 6M19.5 6.5a8 8 0 0 1 0 11"/>'),
  fire: svg('<path d="M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3.5 3.5M15.5 15.5 19 19M19 5l-3.5 3.5M8.5 15.5 5 19"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/>'),
  shop: svg('<path d="m12 3 2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9l-5.4 2.9 1.1-6.1L3.2 9.4l6.1-.8L12 3z"/>'),
  tour: svg('<path d="M3 17V8a2 2 0 0 1 2-2h9l4 4h1a2 2 0 0 1 2 2v5h-2M7 17h8"/><circle cx="5.5" cy="17.5" r="2"/><circle cx="16.5" cy="17.5" r="2"/><path d="M7 9h4v3H7z"/>'),
  gear: svg('<path d="M4 7h10M18 7h2M4 12h2M10 12h10M4 17h12M20 17h0"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="18" cy="17" r="2"/>'),
  close: svg('<path d="M5 5l14 14M19 5 5 19" stroke-width="3"/>'),
};

// Tap to act once; press and hold to keep going.
function holdable(btn, fn) {
  let timer = null;
  let repeated = false;
  const stop = () => {
    clearTimeout(timer);
    clearInterval(timer);
    timer = null;
  };
  btn.addEventListener('pointerdown', () => {
    repeated = false;
    stop();
    timer = setTimeout(() => {
      timer = setInterval(() => {
        if (btn.disabled) return stop();
        repeated = true;
        fn();
      }, 80);
    }, 380);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, stop);
  btn.addEventListener('click', () => {
    if (repeated) {
      repeated = false;
      return;
    }
    fn();
  });
}

export function createUI({ world, renderer, audio, onSave, onReplaceSave, onReset }) {
  const root = document.getElementById('ui');
  const st = () => world.state;
  const thumbs = new Map();
  const thumbURL = (i) => {
    if (!thumbs.has(i)) thumbs.set(i, thumbnail(i, 88, 74).toDataURL());
    return thumbs.get(i);
  };
  const click = () => audio.play('click');
  const nope = () => audio.play('error');
  const tried = (ok) => {
    if (!ok) nope();
    refresh();
    return ok;
  };

  // ---- HUD ----------------------------------------------------------------

  const cashEl = h('div', { class: 'cash' }, CURRENCY + '0');
  const rateEl = h('div', { class: 'rate' }, '');
  const starsEl = h('span', null, '0');
  const starsBtn = h('button', { class: 'chip-btn', 'aria-label': 'Star shop', onclick: () => { click(); openTab('shop'); } },
    h('span', { class: 'star' }, '★'), starsEl);
  const gearBtn = h('button', { class: 'chip-btn icon', 'aria-label': 'Settings', html: ICON.gear, onclick: () => { click(); openSettings(); } });
  const goalText = h('div', { class: 'goal-text' });
  const goalBar = h('i');
  const goalReward = h('span', { class: 'goal-reward' });
  const goalBtn = h('button', { class: 'goal', onclick: onGoalClick },
    h('div', { class: 'goal-main' }, h('div', { class: 'goal-label' }, 'Goal'), goalText, h('div', { class: 'bar' }, goalBar)),
    goalReward);
  const boostsEl = h('div', { class: 'boosts' });
  const hud = h('div', { class: 'hud' },
    h('div', { class: 'hud-row' },
      h('div', { class: 'cash-card' }, h('div', { class: 'coin' }, CURRENCY), h('div', { class: 'cash-text' }, cashEl, rateEl)),
      starsBtn, gearBtn),
    goalBtn, boostsEl);

  function onGoalClick() {
    const goal = currentGoal(st());
    if (goal.done) {
      S.claimGoal(world);
      refresh();
    } else if (goal.point >= 0) {
      click();
      openAttraction(goal.point);
    } else {
      click();
    }
  }

  // ---- nav ----------------------------------------------------------------

  const navBtns = {};
  const navBtn = (key, label) => {
    const b = h('button', { class: 'nav-btn', 'data-tab': key, onclick: () => { click(); openTab(key); } },
      h('span', { html: ICON[key] }), label, h('i', { class: 'dot' }));
    navBtns[key] = b;
    return b;
  };
  const fireLabel = h('span', null, 'Ready');
  const fireBtn = h('button', { class: 'fire-btn', 'aria-label': 'Fireworks', onclick: () => tried(S.launchFireworks(world)) },
    h('div', { class: 'inner' }, h('span', { html: ICON.fire }), fireLabel));
  const nav = h('nav', { class: 'nav' }, h('div', { class: 'nav-inner' },
    navBtn('rides', 'Rides'), navBtn('park', 'Park'), fireBtn, navBtn('shop', 'Stars'), navBtn('tour', 'Tour')));

  // ---- sheet --------------------------------------------------------------

  const sheetTitle = h('div', { class: 'sheet-title' });
  const sheetTools = h('div', { class: 'head-tools' });
  const sheetBody = h('div', { class: 'sheet-body' });
  const sheet = h('div', { class: 'sheet', role: 'dialog' },
    h('div', { class: 'sheet-head' }, sheetTitle,
      h('button', { class: 'close-btn', 'aria-label': 'Close', html: ICON.close, onclick: () => { click(); closeSheet(); } })),
    sheetTools, sheetBody);
  let current = null; // { key, refresh }

  function setSheet(key, title, tools, body, refreshFn) {
    sheetTitle.replaceChildren(...[title].flat());
    sheetTools.replaceChildren(...(tools ? [tools].flat() : []));
    show(sheetTools, !!tools);
    sheetBody.replaceChildren(...[body].flat());
    sheetBody.scrollTop = 0;
    current = { key, refresh: refreshFn };
    sheet.classList.add('open');
    for (const [k, b] of Object.entries(navBtns)) toggle(b, 'active', k === key);
    refreshFn();
    // offsetHeight ignores the slide-in transform, so this is the final resting size
    renderer.setSheetCover(sheet.offsetHeight + nav.offsetHeight);
  }

  function closeSheet() {
    if (!current) return;
    current = null;
    sheet.classList.remove('open');
    for (const b of Object.values(navBtns)) b.classList.remove('active');
    renderer.setSelected(-1);
    renderer.setSheetCover(0);
  }

  function openTab(key) {
    if (current && current.key === key) return closeSheet();
    renderer.setSelected(-1);
    ({ rides: openRides, park: openPark, shop: openShop, tour: openTour })[key]();
  }

  function buyModeControl() {
    const modes = [['1', '×1'], ['10', '×10'], ['next', 'Next ★'], ['max', 'Max']];
    const btns = modes.map(([m, label]) => h('button', {
      onclick: () => {
        click();
        st().settings.buyMode = m;
        refresh();
      },
    }, label));
    const el = h('div', { class: 'seg', role: 'group', 'aria-label': 'Upgrade amount' }, btns);
    el.sync = () => modes.forEach(([m], k) => toggle(btns[k], 'on', st().settings.buyMode === m));
    return el;
  }

  // What the upgrade button will buy right now.
  function upgradeOffer(i) {
    const s = st();
    const a = s.attractions[i];
    const d = ATTRACTIONS[i];
    const n = E.buyCount(s.settings.buyMode, d, a.level, s.cash);
    const cost = E.bulkCost(d, a.level, n);
    return { n, cost, can: s.cash >= cost };
  }

  // ---- rides list ---------------------------------------------------------

  function openRides() {
    const seg = buyModeControl();
    const rows = ATTRACTIONS.map((d) => {
      const i = d.index;
      const name = h('div', { class: 'name' }, d.name);
      const sub = h('div', { class: 'sub' });
      const bar = h('i');
      const barWrap = h('div', { class: 'bar' }, bar);
      const upBtn = h('button', { class: 'btn' });
      const hireBtn = h('button', { class: 'btn blue small' });
      const buildBtn = h('button', { class: 'btn', onclick: () => tried(S.build(world, i)) });
      holdable(upBtn, () => {
        const offer = upgradeOffer(i);
        tried(offer.can && S.upgrade(world, i, offer.n) > 0);
      });
      hireBtn.addEventListener('click', () => tried(S.hire(world, i)));
      const img = h('img', { class: 'thumb', src: thumbURL(i), alt: '' });
      const row = h('div', { class: 'row' }, img, h('div', { class: 'meta', onclick: () => { click(); openAttraction(i); } }, name, sub, barWrap),
        h('div', { class: 'side' }, upBtn, hireBtn, buildBtn));
      return { i, d, row, sub, bar, barWrap, upBtn, hireBtn, buildBtn };
    });
    setSheet('rides', 'Attractions', [h('span', null, 'Upgrade'), seg], rows.map((r) => r.row), () => {
      const s = st();
      seg.sync();
      const next = s.attractions.findIndex((a) => !a.built);
      for (const r of rows) {
        const a = s.attractions[r.i];
        show(r.upBtn, a.built);
        show(r.hireBtn, a.built && !a.operator);
        show(r.buildBtn, !a.built);
        show(r.barWrap, a.built);
        toggle(r.row, 'locked', !a.built && r.i !== next);
        if (a.built) {
          const offer = upgradeOffer(r.i);
          setHTML(r.sub, `<b>Lv ${a.level}</b> · ${money(E.ticketPrice(s, r.i))} a ticket · ${money(E.attractionRate(s, r.i) * E.boostMult(s))}/s`);
          const prev = E.milestoneCount(a.level) ? E.milestoneThreshold(E.milestoneCount(a.level) - 1) : 1;
          const nextMs = E.nextMilestone(a.level);
          r.bar.style.width = Math.round(((a.level - prev) / (nextMs - prev)) * 100) + '%';
          setHTML(r.upBtn, `+${offer.n} level${offer.n > 1 ? 's' : ''}<small>${money(offer.cost)}</small>`);
          r.upBtn.disabled = !offer.can;
          setHTML(r.hireBtn, `Hire ${money(r.d.opCost)}`);
          r.hireBtn.disabled = s.cash < r.d.opCost;
        } else {
          setText(r.sub, r.i === next ? r.d.blurb : `Build the ${ATTRACTIONS[r.i - 1].name} first`);
          setHTML(r.buildBtn, `Build<small>${money(r.d.cost)}</small>`);
          r.buildBtn.disabled = r.i !== next || s.cash < r.d.cost;
        }
      }
    });
  }

  // ---- one attraction -----------------------------------------------------

  function openAttraction(i) {
    const d = ATTRACTIONS[i];
    const seg = buyModeControl();
    const stat = (label) => {
      const b = h('b');
      return { el: h('div', { class: 'stat' }, b, h('span', null, label)), b };
    };
    const ticket = stat('Ticket');
    const seats = stat(d.kind === 'ride' ? 'Seats' : 'Serves');
    const cycle = stat(d.kind === 'ride' ? 'Ride' : 'Wait');
    const earn = stat('Takings');
    const msLeft = h('span');
    const msRight = h('span');
    const msBar = h('i');
    const blurb = h('div', { class: 'sub' }, d.blurb);
    const levelLine = h('div', { class: 'sub level-line' });
    const upBtn = h('button', { class: 'btn big' });
    const hireBtn = h('button', { class: 'btn blue big', onclick: () => tried(S.hire(world, i)) });
    const runBtn = h('button', { class: 'btn gold big go', onclick: () => tried(S.tapAttraction(world, i)) }, 'GO!');
    const opLine = h('div', { class: 'ok-line' }, '✔ Operator on duty. Runs itself, even while you are away.');
    const buildBtn = h('button', { class: 'btn big wide', onclick: () => tried(S.build(world, i)) });
    const buildNote = h('div', { class: 'note' });
    holdable(upBtn, () => {
      const offer = upgradeOffer(i);
      tried(offer.can && S.upgrade(world, i, offer.n) > 0);
    });
    const builtView = h('div', null,
      levelLine,
      h('div', { class: 'stats' }, ticket.el, seats.el, cycle.el, earn.el),
      h('div', { class: 'ms-line' }, msLeft, msRight),
      h('div', { class: 'bar' }, msBar),
      h('div', { class: 'actions' }, upBtn),
      h('div', { class: 'actions' }, hireBtn, runBtn, opLine));
    const plotView = h('div', null,
      h('div', { class: 'detail-top' }, h('img', { class: 'thumb big', src: thumbURL(i), alt: '' }),
        h('div', { class: 'meta' }, blurb, buildNote)),
      h('div', { class: 'actions' }, buildBtn));

    renderer.setSelected(i);
    setSheet('attraction:' + i, d.name, [h('span', null, 'Upgrade'), seg], [builtView, plotView], () => {
      const s = st();
      const a = s.attractions[i];
      seg.sync();
      show(builtView, a.built);
      show(plotView, !a.built);
      show(sheetTools, a.built);
      if (!a.built) {
        const next = s.attractions.findIndex((x) => !x.built);
        setHTML(buildBtn, `Build for ${money(d.cost)}`);
        buildBtn.disabled = i !== next || s.cash < d.cost;
        setHTML(buildNote, i !== next
          ? `Plots open in order. Build the <b>${ATTRACTIONS[i - 1].name}</b> first.`
          : `Tickets start at <b>${money(d.price * E.globalMult(s))}</b>, ${d.cap} guests at a time.`);
        return;
      }
      const m = E.milestoneCount(a.level);
      setHTML(levelLine, `<b>Level ${a.level}</b> · ${'★'.repeat(Math.min(m, 12)) || 'no stars yet'} · ${fmt(a.served)} served`);
      setText(ticket.b, money(E.ticketPrice(s, i)));
      setText(seats.b, String(E.capacity(d, a.level)));
      setText(cycle.b, E.cycleTime(d, a.level).toFixed(1) + 's');
      setText(earn.b, money(E.attractionRate(s, i) * E.boostMult(s)) + '/s');
      const prev = m ? E.milestoneThreshold(m - 1) : 1;
      const nextMs = E.nextMilestone(a.level);
      setText(msLeft, `Next star at level ${nextMs}`);
      setText(msRight, m < 6 ? 'tickets ×2, more room, quicker' : 'tickets ×2');
      msBar.style.width = Math.round(((a.level - prev) / (nextMs - prev)) * 100) + '%';
      const offer = upgradeOffer(i);
      setHTML(upBtn, `Upgrade +${offer.n}<small>${money(offer.cost)}</small>`);
      upBtn.disabled = !offer.can;
      show(runBtn, !a.operator);
      runBtn.disabled = !S.isReady(world, i);
      show(hireBtn, !a.operator);
      show(opLine, a.operator);
      setHTML(hireBtn, `Hire operator<small>${money(d.opCost)}</small>`);
      hireBtn.disabled = s.cash < d.opCost;
    });
    renderer.focus(i);
  }

  // ---- park upgrades ------------------------------------------------------

  function openPark() {
    const rows = Object.keys(PARK).map((key) => {
      const p = PARK[key];
      const name = h('div', { class: 'name' });
      const sub = h('div', { class: 'sub' });
      const btn = h('button', { class: 'btn' });
      holdable(btn, () => tried(S.buyPark(world, key)));
      return { key, p, name, sub, btn, row: h('div', { class: 'row' }, h('div', { class: 'meta' }, name, sub), h('div', { class: 'side' }, btn)) };
    });
    const intro = h('div', { class: 'note' }, 'Improvements for the whole fair. They stay behind when you go on tour.');
    setSheet('park', 'Park office', null, [intro, ...rows.map((r) => r.row)], () => {
      const s = st();
      for (const r of rows) {
        const lv = s.park[r.key];
        const maxed = lv >= r.p.max;
        const step = r.key === 'marketing' ? ` · ${r.p.steps[Math.min(lv, r.p.steps.length - 1)]}` : '';
        setText(r.name, `${r.p.name} · Lv ${lv}${step}`);
        setHTML(r.sub, `${r.p.desc}<br><b>${E.parkEffect(r.key, lv)}</b>${maxed ? '' : ' → ' + E.parkEffect(r.key, lv + 1)}`);
        const cost = E.parkCost(r.key, lv);
        setHTML(r.btn, maxed ? 'Maxed' : `Upgrade<small>${money(cost)}</small>`);
        r.btn.disabled = maxed || s.cash < cost;
      }
    });
  }

  // ---- star shop ----------------------------------------------------------

  function openShop() {
    const rows = Object.keys(SHOP).map((key) => {
      const item = SHOP[key];
      const name = h('div', { class: 'name' });
      const sub = h('div', { class: 'sub' });
      const btn = h('button', { class: 'btn gold', onclick: () => tried(S.buyShop(world, key)) });
      return { key, item, name, sub, btn, row: h('div', { class: 'row' }, h('div', { class: 'meta' }, name, sub), h('div', { class: 'side' }, btn)) };
    });
    const have = h('div', { class: 'note' });
    setSheet('shop', 'Star shop', null, [have, ...rows.map((r) => r.row)], () => {
      const s = st();
      setHTML(have, `You have <b>★ ${fmt(s.stars)}</b>. Stars come from goals, attraction milestones, balloons and tours. Everything here is kept for good.`);
      for (const r of rows) {
        const lv = s.shop[r.key];
        const maxed = E.shopMaxed(r.key, lv);
        const cost = E.shopCost(r.key, lv);
        if (r.key === 'warp') {
          const amount = E.totalRate(s) * TUNING.warpHours * 3600;
          setText(r.name, r.item.name);
          setHTML(r.sub, `${r.item.desc}<br><b>${money(amount)}</b> right now`);
          r.btn.disabled = s.stars < cost || amount <= 0;
        } else {
          setText(r.name, `${r.item.name} · Lv ${lv}`);
          const now = r.key === 'headstart' ? money(E.startingCash(s)) + ' float' : E.shopEffect(r.key, lv);
          const then = r.key === 'headstart' ? money(r.item.cash[lv + 1] || 0) + ' float' : E.shopEffect(r.key, lv + 1);
          setHTML(r.sub, `${r.item.desc}<br><b>${now}</b>${maxed ? '' : ' → ' + then}`);
          r.btn.disabled = maxed || s.stars < cost;
        }
        setHTML(r.btn, maxed ? 'Maxed' : `★ ${fmt(cost)}`);
      }
    });
  }

  // ---- tour ---------------------------------------------------------------

  function openTour() {
    const kicker = h('div', { class: 'kicker' }, 'Now showing in');
    const townName = h('h3');
    const townTag = h('div', { class: 'tag' });
    const fameNow = h('b');
    const fameThen = h('b');
    const line = h('div', { class: 'note' });
    const bar = h('i');
    const barWrap = h('div', { class: 'bar' }, bar);
    const btn = h('button', { class: 'btn red big wide', onclick: confirmTour });
    const body = [
      h('div', { class: 'banner' }, kicker, townName, townTag),
      h('div', { class: 'fame-grid' },
        h('div', { class: 'stat' }, fameNow, h('span', null, 'Fame now')),
        h('div', { class: 'stat' }, fameThen, h('span', null, 'After touring'))),
      line, barWrap,
      h('div', { class: 'keep' },
        h('div', null, h('b', null, 'You keep'), 'Fame, stars and everything from the Star shop'),
        h('div', null, h('b', null, 'Left behind'), 'Cash, attractions, operators and park upgrades')),
      btn,
    ];
    setSheet('tour', 'Go on tour', null, body, () => {
      const s = st();
      const town = townFor(s);
      const next = TOWNS[(s.tours + 1) % TOWNS.length];
      const gain = E.fameGain(s);
      setText(townName, town.name);
      setText(townTag, town.tag);
      setHTML(fameNow, `${fmt(s.fame)} <small>(×${E.fameMult(s.fame).toFixed(2)})</small>`);
      setHTML(fameThen, `${fmt(s.fame + gain)} <small>(×${E.fameMult(s.fame + gain).toFixed(2)})</small>`);
      const can = E.canTour(s);
      show(barWrap, !can);
      if (can) {
        setHTML(line, `Word has spread. Pack up for <b>${next.name}</b> and arrive with <b>+${fmt(gain)} fame</b>: every ticket you ever sell is worth more. The longer you stay here, the more fame you take with you.`);
      } else {
        const need = E.earnedForFame(TUNING.tourMinFame);
        setHTML(line, `Fame makes every ticket worth more, for good. Take <b>${money(Math.max(0, need - s.runEarned))}</b> more in ${town.name} to earn a following worth touring with.`);
        bar.style.width = Math.min(100, (s.runEarned / need) * 100) + '%';
      }
      setText(btn, can ? `Pack up for ${next.name}` : 'Not famous enough yet');
      btn.disabled = !can;
    });
  }

  function confirmTour() {
    const s = st();
    if (!E.canTour(s)) return nope();
    click();
    const next = TOWNS[(s.tours + 1) % TOWNS.length];
    const gain = E.fameGain(s);
    modal([
      h('h2', null, 'Pack up the fair?'),
      h('p', { html: `You will leave for <b>${next.name}</b> with <b>+${fmt(gain)} fame</b> and ${TUNING.tourStars} stars.` }),
      h('p', null, 'Your cash, attractions, operators and park upgrades stay behind.'),
      h('div', { class: 'actions' },
        h('button', { class: 'btn plain big', onclick: () => { click(); closeModal(); } }, 'Stay'),
        h('button', {
          class: 'btn red big',
          onclick: () => {
            closeModal();
            closeSheet();
            curtain(next.name, next.tag, () => {
              S.goOnTour(world);
              renderer.resetView();
              onSave();
            });
          },
        }, 'On the road!')),
    ]);
  }

  // ---- modals -------------------------------------------------------------

  let modalEl = null;
  function modal(children, { dismiss = true } = {}) {
    closeModal();
    const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, children);
    modalEl = h('div', { class: 'backdrop' }, box);
    if (dismiss) {
      modalEl.addEventListener('click', (e) => {
        if (e.target === modalEl) closeModal();
      });
    }
    root.append(modalEl);
    return box;
  }
  function closeModal() {
    if (modalEl) modalEl.remove();
    modalEl = null;
  }

  const curtainEl = h('div', { class: 'curtain' });
  function curtain(title, sub, midway) {
    curtainEl.replaceChildren(h('div', null, h('h2', null, title), h('p', null, sub)));
    curtainEl.classList.add('on');
    audio.play('tour');
    setTimeout(() => {
      midway();
      refresh();
      setTimeout(() => curtainEl.classList.remove('on'), 900);
    }, 500);
  }

  function showWelcome() {
    const art = h('img', { class: 'art', alt: '', src: thumbnail(10, 190, 150).toDataURL() });
    modal([
      art,
      h('div', { class: 'logo', html: 'Starlight <span>Funfair</span>' }),
      h('p', null, 'An empty field, thirty pounds and a dream of fairy lights.'),
      h('ul', null,
        h('li', null, h('i', null, '1'), 'Build attractions and tap GO! to serve your first guests.'),
        h('li', null, h('i', null, '2'), 'Hire operators so the fair runs itself, even while you are away.'),
        h('li', null, h('i', null, '3'), 'Upgrade, pop prize balloons, then take the whole show on tour.')),
      h('div', { class: 'actions' },
        h('button', { class: 'btn big wide', onclick: () => { audio.unlock(); click(); closeModal(); } }, 'Open the gates')),
    ], { dismiss: false });
  }

  function showAway(res, seconds) {
    const s = st();
    const manual = s.attractions.some((a) => a.built && !a.operator);
    modal([
      h('h2', null, 'Welcome back!'),
      h('p', null, `You were away for ${fmtTime(seconds)}. Your operators kept the fair turning.`),
      h('div', { class: 'amount' }, '+' + money(res.amount)),
      res.capped ? h('p', { class: 'fineprint' }, `The crew clocks off after ${fmtTime(res.counted)}. Night Crew in the Star shop keeps them going longer.`) : null,
      manual ? h('p', { class: 'fineprint' }, 'Attractions without an operator earn nothing while you are away.') : null,
      h('div', { class: 'actions' },
        h('button', { class: 'btn big wide', onclick: () => { audio.unlock(); audio.play('claim'); closeModal(); } }, 'Lovely')),
    ]);
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
    const code = h('textarea', { 'aria-label': 'Save code', placeholder: 'Paste a save code here to load it', spellcheck: 'false' });
    const msg = h('p', { class: 'fineprint' }, 'Your game saves on this device automatically.');
    const stats = [
      ['Total takings', money(s.stats.earned)],
      ['Guests served', fmt(s.stats.served)],
      ['Rides run', fmt(s.stats.cycles)],
      ['Balloons popped', fmt(s.stats.balloons)],
      ['Firework shows', fmt(s.stats.fireworks)],
      ['Tours', fmt(s.tours)],
      ['Fame', fmt(s.fame)],
      ['Time played', fmtTime(s.stats.playTime)],
    ];
    modal([
      h('h2', null, 'Settings'),
      sw('sfx', 'Sound effects'),
      sw('music', 'Fairground organ'),
      h('h4', null, 'Your fair so far'),
      h('div', { class: 'stat-list' }, stats.map(([k, v]) => [h('span', null, k), h('b', null, v)])),
      h('h4', null, 'Move your save'),
      code,
      h('div', { class: 'actions' },
        h('button', {
          class: 'btn blue',
          onclick: async () => {
            click();
            code.value = exportCode(st());
            code.select();
            try {
              await navigator.clipboard.writeText(code.value);
              setText(msg, 'Save code copied. Keep it somewhere safe.');
            } catch {
              setText(msg, 'Copy the code above and keep it somewhere safe.');
            }
          },
        }, 'Copy save code'),
        h('button', {
          class: 'btn plain',
          onclick: () => {
            const loaded = importCode(code.value);
            if (!loaded) {
              nope();
              setText(msg, 'That does not look like a save code.');
              return;
            }
            click();
            onReplaceSave(loaded);
          },
        }, 'Load code')),
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
      h('p', null, 'This wipes your whole fair: cash, stars, fame, everything. It cannot be undone.'),
      h('div', { class: 'actions' },
        h('button', { class: 'btn plain big', onclick: () => { click(); openSettings(); } }, 'Keep my fair'),
        h('button', { class: 'btn red big', onclick: () => onReset() }, 'Wipe it')),
    ]);
  }

  // ---- toasts -------------------------------------------------------------

  const toasts = h('div', { class: 'toasts', 'aria-live': 'polite' });
  function toast(html, kind = '') {
    while (toasts.children.length >= 3) toasts.firstChild.remove();
    const el = h('div', { class: 'toast ' + kind, html });
    toasts.append(el);
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3000);
  }

  // ---- refresh ------------------------------------------------------------

  let lastBoostKey = '';
  function refresh() {
    const s = st();
    const boost = E.boostMult(s);
    setText(cashEl, money(s.cash));
    setText(rateEl, `+${money(E.totalRate(s) * boost)}/s` + (boost > 1 ? `  ×${boost}` : ''));
    toggle(rateEl, 'boosted', boost > 1);
    setText(starsEl, fmt(s.stars));

    const goal = currentGoal(s);
    setText(goalText, goal.text);
    goalBar.style.width = Math.round((goal.cur / goal.target) * 100) + '%';
    toggle(goalBtn, 'done', goal.done);
    setHTML(goalReward, goal.done ? `Claim ${STAR}${goal.stars}` : `${fmt(goal.cur)}/${fmt(goal.target)} · ${STAR}${goal.stars}`);
    // point at the goal's attraction, or at the plot that has to be built first
    let point = -1;
    if (!goal.done && goal.point >= 0 && s.goal.index < 9) {
      const open = s.attractions.findIndex((a) => !a.built);
      point = !s.attractions[goal.point].built && open >= 0 ? Math.min(goal.point, open) : goal.point;
    }
    renderer.setPointer(point);

    const chips = [];
    if (s.boosts.fireworks > 0) chips.push(['fw', `Fireworks ×${TUNING.fireworksMult} · ${fmtClock(s.boosts.fireworks)}`, 'boost']);
    if (s.boosts.rush > 0) chips.push(['rush', `Rush hour ×${TUNING.rushMult} · ${fmtClock(s.boosts.rush)}`, 'boost rush']);
    if (s.fame > 0) chips.push(['fame', `Fame ×${E.fameMult(s.fame).toFixed(2)}`, 'boost town']);
    const key = chips.map((c) => c[0]).join();
    if (key !== lastBoostKey) {
      lastBoostKey = key;
      boostsEl.replaceChildren(...chips.map((c) => h('div', { class: c[2], 'data-k': c[0] })));
      placeToasts();
    }
    chips.forEach((c, k) => setText(boostsEl.children[k], c[1]));

    // fireworks button
    const cd = E.fireworksCooldown(s);
    const live = s.boosts.fireworks > 0;
    const ready = s.fireworksCd <= 0 && s.attractions[0].built;
    toggle(fireBtn, 'ready', ready && !live);
    toggle(fireBtn, 'live', live);
    fireBtn.style.setProperty('--ready', (live ? 100 : Math.round((1 - s.fireworksCd / cd) * 100)) + '%');
    setText(fireLabel, live ? '×' + TUNING.fireworksMult : ready ? 'Ready' : s.fireworksCd > 0 ? fmtClock(s.fireworksCd) : '');

    // nav dots
    const next = s.attractions.findIndex((a) => !a.built);
    let ridesDot = next >= 0 && s.cash >= ATTRACTIONS[next].cost;
    for (let i = 0; i < ATTRACTIONS.length && !ridesDot; i++) {
      const a = s.attractions[i];
      if (a.built && (s.cash >= E.levelCost(ATTRACTIONS[i], a.level) || (!a.operator && s.cash >= ATTRACTIONS[i].opCost))) ridesDot = true;
    }
    toggle(navBtns.rides, 'has-dot', ridesDot);
    toggle(navBtns.park, 'has-dot', Object.keys(PARK).some((k) => s.park[k] < PARK[k].max && s.cash >= E.parkCost(k, s.park[k])));
    toggle(navBtns.shop, 'has-dot', Object.keys(SHOP).some((k) => !SHOP[k].repeat && !E.shopMaxed(k, s.shop[k]) && s.stars >= E.shopCost(k, s.shop[k])));
    toggle(navBtns.tour, 'has-dot', E.canTour(s));

    if (current) current.refresh();
  }

  root.append(hud, toasts, sheet, nav, curtainEl);

  // The map is framed between the goal bar and the nav. Boost chips come and
  // go, so they only push the toasts down, never the camera.
  function placeToasts() {
    toasts.style.top = hud.getBoundingClientRect().bottom + 8 + 'px';
  }
  function measure() {
    renderer.setInsets(goalBtn.getBoundingClientRect().bottom + 6, nav.getBoundingClientRect().height);
    placeToasts();
  }
  measure();

  return {
    refresh,
    measure,
    toast,
    openAttraction,
    closeSheet,
    showWelcome,
    showAway,
    get sheetKey() { return current ? current.key : null; },
    get modalOpen() { return !!modalEl; },
  };
}
