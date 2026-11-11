// The park's own screens: the list of sites, one site's upgrades, the chests
// along the progress bar, the map of parks, and what everything earns.
import { ADS, CAP_STEPS, CARD_SETS, PARKS_TOTAL, PARK_CHESTS, PLOTS, RUSH, STAGES, TOWN_REWARD, TUNING, capCount, homeSite, townInfo } from '../config.js';
import * as E from '../economy.js';
import { fmt, fmtTime, money } from '../format.js';
import * as R from '../rules.js';
import * as S from '../sim.js';

export default function install(kit) {
  const { h, setText, setHTML, toggle, show, st, ART, COIN, click, nope, buzz, audio, renderer, describe, toast, celebrate, setSheet, closeSheet, sheetTitle, modal, closeModal, refresh, onSave, openScene, closeScene, hot, at, adFor, clock } = kit;

  const starRow = (plot) => '★'.repeat(plot.stage) + `<s>${'★'.repeat(STAGES - plot.stage)}</s>`;
  // A site's picture is its badge from the reels, so the two are plainly the same thing.
  const thumbFor = (el, k) => {
    const url = kit.siteURL(k);
    if (url && el.__src !== url) {
      el.__src = url;
      el.src = url;
    }
  };
  // What a site's symbol pays on the line, in coins at the bet now set.
  const perSymbol = (s, units) => money(units * E.unit(s.town) * s.bet);
  const betNote = (s) => (s.bet > 1 ? ` at ×${s.bet}` : '');
  const plain = (s) => ({ ...s, hot: null }); // the same park with no rush hour on
  // Card creatures living at a site, by the name of their set.
  const livingAt = (s, k) => CARD_SETS.filter((set) => homeSite(set.index) === k && s.cards.homes[set.index] > 0).map((set) => set.name);

  // Everything in the park, as a list. Tap a row to open that site.
  function openBuild(focusPlot = -1) {
    if (kit.base !== 'park') kit.setBase('park');
    if (focusPlot >= 0) return openSite(focusPlot);
    const info = () => townInfo(st().town);
    const progress = h('i');
    const progressText = h('span');
    const rewardLine = h('p', { class: 'note' });
    const travelBtn = h('button', { class: 'btn big gold wide', onclick: () => { click(); kit.travelNow(); } });
    const chestRow = h('button', { class: 'row chest-row', onclick: () => { click(); openChest(); } });
    const rows = PLOTS.map((p) => {
      const k = p.index;
      const thumb = h('img', { class: 'thumb site-badge', src: kit.BLANK, alt: '' });
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
    setSheet('parklist', h('span', null, ''), [head, chestRow, rows.map((r) => r.row), rewardLine, travelBtn], () => {
      const s = st();
      setText(sheetTitle, `${info().name} · Park ${info().number}`);
      const built = E.stagesBuilt(s);
      setText(progressText, `★ ${built} of ${E.PARK_STARS}`);
      progress.style.width = (built / E.PARK_STARS) * 100 + '%';
      const done = E.townComplete(s);
      show(travelBtn, done);
      setText(travelBtn, `Open ${townInfo(s.town + 1).name}`);
      const due = E.parkChestsDue(s);
      toggle(chestRow, 'ready', due > 0);
      setHTML(chestRow, `<img src="${ART('ico-chest-open')}" alt=""><span><b>Park chests ${s.parkChests}/4</b><small>${due > 0 ? `${due} ready to open` : s.parkChests >= 4 ? 'All four opened' : `Next at ★ ${Math.ceil(((s.parkChests + 1) * E.PARK_STARS) / 4)}`}</small></span>`);
      setHTML(rewardLine, done
        ? `Everything is finished. Moving on pays <b>${describe(TOWN_REWARD, true)}</b>, and this park keeps earning.`
        : `Finishing ${info().name} pays <b>${describe(TOWN_REWARD, true)}</b> and opens ${townInfo(s.town + 1).name}.`);
      for (const r of rows) {
        const plot = s.plots[r.k];
        const d = S.designAt(s, r.k);
        thumbFor(r.thumb, r.k);
        setText(r.name, d.name);
        setHTML(r.stars, starRow(plot));
        const done1 = E.siteDone(plot);
        toggle(r.row, 'done', done1);
        const cost = E.cheapest(s, r.k);
        const can = !done1 && cost != null && s.coins >= cost;
        r.go.className = 'btn small ' + (can ? '' : 'blue');
        setText(r.go, done1 ? 'Done' : can ? 'Upgrade' : 'Open');
        const pays = perSymbol(s, E.sitePay(s, r.k));
        setText(r.sub, done1 ? `Top level · pays ${pays}` : plot.stage === 0 ? `Closed on the reels · build for ${money(cost)}` : `Lv ${plot.stage * 10} · pays ${pays} · next ${money(cost)}`);
      }
    });
    return undefined;
  }

  // A button that keeps buying while it is held down.
  const holdable = (btn, purchase) => {
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

  // One ride or facility: its level on one row, its capacity on the other.
  function openSite(k) {
    if (kit.base !== 'park') kit.setBase('park');
    const thumb = h('img', { class: 'thumb big site-badge', src: kit.BLANK, alt: '' });
    const reel = h('div', { class: 'site-reel' });
    const name = h('div', { class: 'site-name' });
    const stars = h('div', { class: 'stars' });
    const lvFill = h('i');
    const lvFrom = h('span');
    const lvTo = h('span');
    const priceWhat = h('div', { class: 'site-what' });
    const priceSub = h('div', { class: 'sub' });
    const capWhat = h('div', { class: 'site-what' });
    const capSub = h('div', { class: 'sub' });
    const purchase = (fn) => () => {
      const up = fn(st(), k);
      if (!up) {
        nope();
        return false;
      }
      onUpgrade(k, up);
      refresh();
      return true;
    };
    const buy = holdable(h('button', { class: 'btn site-buy' }), purchase(R.upgradePlot));
    const capBuy = holdable(h('button', { class: 'btn site-buy' }), purchase(R.upgradeCap));
    const step = (dir) => () => { click(); openSite((k + dir + PLOTS.length) % PLOTS.length); };
    const body = [
      h('div', { class: 'site-card head' }, thumb, h('div', { class: 'meta' }, name, stars, h('div', { class: 'lv-bar' }, lvFill, lvFrom, lvTo), reel)),
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
      thumbFor(thumb, k);
      const rate = E.sitePay(s, k);
      const pals = livingAt(s, k);
      setHTML(reel, (plot.stage === 0
        ? 'On the reels: <b>closed</b>. Build it and it pays every time it comes up.'
        : E.rushing(s, k)
          ? `<b class="rush">Rush hour!</b> Paying double: <b>${perSymbol(s, rate)}</b> a symbol${betNote(s)}, for ${s.hot.left} more ${s.hot.left === 1 ? 'spin' : 'spins'}.`
          : `On the reels: <b>${perSymbol(s, rate)}</b> a symbol${betNote(s)} · rush hour <b>${perSymbol(s, rate * RUSH.mult)}</b>`)
        + (pals.length ? `<br><span class="pals">${pals.join(' and ')} ${pals.length > 1 ? 'live' : 'lives'} here: +${Math.round(E.homeBonus(s, k) * 100)}%</span>` : ''));
      setHTML(stars, starRow(plot));
      const lv = plot.stage * 10;
      lvFill.style.width = lv + '%';
      setText(lvFrom, `Lv.${lv}`);
      setText(lvTo, 'Lv.100');
      const star = E.nextStar(s, k);
      if (star) {
        const after = E.sitePayAfter(s, k, 'star');
        setHTML(priceWhat, plot.stage === 0 ? `Build the ${d.name}` : `Level ${lv} <b>→ ${lv + 10}</b>`);
        setHTML(priceSub, plot.stage === 0 ? `${d.blurb} Opens it on the reels at <b>${perSymbol(s, after)}</b> a symbol.` : `On the reels: ${perSymbol(s, E.sitePay(plain(s), k))} <b>→ ${perSymbol(s, after)}</b> a symbol.`);
        buy.className = 'btn site-buy';
        setHTML(buy, `${plot.stage === 0 ? 'Build' : 'Upgrade'}<small>${COIN}${money(star.cost)}</small>`);
        buy.disabled = s.coins < star.cost;
      } else {
        setHTML(priceWhat, 'Level 100');
        setText(priceSub, `Top level. Takes ${money(E.plotRate(s, k) * 60)} a minute at the gate as well.`);
        buy.className = 'btn site-buy tick';
        setHTML(buy, '✓');
        buy.disabled = true;
      }
      const cap = E.nextCap(s, k);
      const count = capCount(d, plot.cap);
      if (cap) {
        setHTML(capWhat, `${d.cap}: ${count} <b>→ ${capCount(d, cap.step)}</b>`);
        setHTML(capSub, cap.open ? `More room: ${perSymbol(s, E.sitePay(plain(s), k))} <b>→ ${perSymbol(s, E.sitePayAfter(s, k, 'cap'))}</b> a symbol. Step ${cap.step} of ${CAP_STEPS}.` : `<span class="need">Opens at level ${cap.needs * 10} of ${d.name}.</span>`);
        capBuy.className = 'btn site-buy' + (cap.open ? '' : ' locked');
        setHTML(capBuy, `Upgrade<small>${COIN}${money(cap.cost)}</small>`);
        capBuy.disabled = !cap.open || s.coins < cap.cost;
      } else {
        setHTML(capWhat, `${d.cap}: ${count}`);
        setText(capSub, `Fully fitted out: +${Math.round(TUNING.capBoost * CAP_STEPS * 100)}% on the reels and at the gate.`);
        capBuy.className = 'btn site-buy tick';
        setHTML(capBuy, '✓');
        capBuy.disabled = true;
      }
    }, { site: true });
    renderer.select(k);
  }

  function onUpgrade(k, up) {
    const s = st();
    const d = S.designAt(s, k);
    const done = E.siteDone(s.plots[k]);
    const top = done || (up.kind === 'star' && up.stage === STAGES);
    audio.play(up.kind === 'star' && up.stage === 1 ? 'build' : top ? 'milestone' : 'upgrade');
    renderer.celebrate(k, top);
    buzz(top ? [20, 30, 40] : 14);
    if (done) toast(`<b>${d.name}</b> is finished!`, 'gold');
    else if (up.kind === 'star' && up.stage === 1) toast(`<b>${d.name}</b> is open for business!`);
    else if (up.kind === 'star' && up.stage === STAGES) toast(`<b>${d.name}</b> has reached level 100!`, 'gold');
    if (up.reward && (up.reward.tokens || up.reward.pack)) toast(`Upgrade bonus: ${describe(up.reward)}`, 'gold');
    if (up.complete) renderer.fireworks(6);
    if (E.parkChestsDue(s) > 0 && !up.complete) toast('A <b>park chest</b> is ready: tap the chest on the progress bar.', 'gold');
    onSave();
  }

  // The chests along the park's progress bar.
  function openChest() {
    const s = st();
    if (E.parkChestsDue(s) < 1) {
      const next = s.parkChests >= 4 ? null : Math.ceil(((s.parkChests + 1) * E.PARK_STARS) / 4);
      modal([
        h('img', { class: 'big-sym', src: ART('ico-chest-open'), alt: '' }),
        h('h2', null, 'Park chests'),
        h('p', { html: next ? `There are four chests along the progress bar, one for every quarter of the park. The next opens at <b>★ ${next}</b>; you have ★ ${E.stagesBuilt(s)}.` : 'All four of this park’s chests are open. There are four more in the next park.' }),
        next ? h('div', { class: 'prize', html: describe(PARK_CHESTS[s.parkChests], true) }) : null,
        h('div', { class: 'actions' }, h('button', { class: 'btn big wide', onclick: () => { click(); closeModal(); } }, 'OK')),
      ]);
      return;
    }
    const got = R.claimParkChest(s);
    onSave();
    celebrate({
      kicker: `Park chest ${got.index + 1} of 4`, title: 'Treasure!', sub: `${townInfo(s.town).name} is ${Math.round(((got.index + 1) / 4) * 100)}% built.`, reward: got.reward, art: 'ico-chest-open',
      actions: E.parkChestsDue(s) > 0 ? [['Next chest', () => openChest(), 'btn big wide']] : null,
    });
  }

  // The road ahead: every park, with the ones behind you open to visit.
  function openMap() {
    const s = st();
    const rows = [];
    const from = Math.max(0, s.town - 4);
    for (let t = from; t < Math.min(PARKS_TOTAL, from + 14); t++) {
      const info = townInfo(t);
      const state = t < s.town ? 'done' : t === s.town ? 'here' : 'ahead';
      rows.push(h('div', { class: 'map-row ' + state },
        h('div', { class: 'map-pic', style: `background-image:url(${ART('park-' + info.theme.key)})` }),
        h('div', { class: 'meta' }, h('div', { class: 'name' }, `${info.number}. ${info.name}`),
          h('div', { class: 'sub' }, state === 'done' ? `Earning ${money(E.legacyOf(t) * 60)} a minute` : state === 'here' ? `★ ${E.stagesBuilt(s)} / ${E.PARK_STARS}` : info.tag)),
        state === 'done' ? h('button', { class: 'btn small', onclick: () => { click(); visit(t); } }, 'Visit')
          : h('span', { class: 'map-mark' }, state === 'here' ? 'You are here' : '🔒')));
    }
    setSheet('map', 'Park map', [
      h('p', { class: 'note', html: `You are in <b>${townInfo(s.town).name}</b>, park ${s.town + 1} of ${PARKS_TOTAL}. Finished parks stay open and keep earning. Prices stop climbing after park ${TUNING.unitCapPark + 1}.` }),
      rows,
    ], () => {}, { page: true });
  }

  // Look round a finished park.
  function visit(t) {
    const info = townInfo(t);
    openScene('visit', 'park-' + info.theme.key, [
      h('div', { class: 'visit-top' }, h('b', null, `${info.number}. ${info.name}`), h('span', null, 'Finished · every site at level 100')),
      h('div', { class: 'visit-card' },
        h('div', { class: 'kicker' }, 'Still earning'),
        h('div', { class: 'prize', html: `${COIN}${money(E.legacyOf(t) * 60)} a minute` }),
        h('p', null, 'It is added to the gate takings of the park you are building now.'),
        h('button', { class: 'btn big wide', onclick: () => { click(); closeScene(); } }, 'Back to the map')),
    ]);
  }

  // What everything earns.
  function openStats() {
    const rows = PLOTS.map((p) => {
      const rate = h('b');
      const sub = h('div', { class: 'sub' });
      const name = h('div', { class: 'name' });
      const thumb = h('img', { class: 'thumb site-badge', src: kit.BLANK, alt: '' });
      return { k: p.index, rate, sub, name, thumb, row: h('div', { class: 'row', onclick: () => { click(); openSite(p.index); } }, thumb, h('div', { class: 'meta' }, name, sub), h('div', { class: 'side-col rate' }, rate)) };
    });
    const total = h('div', { class: 'prize' });
    const split = h('p', { class: 'note' });
    const boostBtn = h('button', { class: 'btn gold wide', onclick: async (e) => { await adFor('boost', e.currentTarget); } });
    setSheet('takings', 'Park stats', [total, split, boostBtn, rows.map((r) => r.row),
      h('p', { class: 'note' }, 'The parks earn while you are away too, for a few hours at a time.')], () => {
      const s = st();
      setHTML(total, `${COIN}${money(E.idleRate(s) * 60)} a minute`);
      setHTML(split, `This park: <b>${money(E.parkRate(s) * 60)}</b> · ${s.town} finished ${s.town === 1 ? 'park' : 'parks'}: <b>${money(E.legacyRate(s) * 60)}</b>${E.boosted(s) ? ` · <b>doubled</b> for ${fmtTime(s.boost)}` : ''}`);
      const left = R.adLeft(s, 'boost', clock());
      setHTML(boostBtn, `<span class="ad">AD</span> Double the takings for ${ADS.boost.boost} minutes · ${left} left today`);
      boostBtn.disabled = left < 1 || !kit.adsReady();
      for (const r of rows) {
        const plot = s.plots[r.k];
        const d = S.designAt(s, r.k);
        thumbFor(r.thumb, r.k);
        setText(r.name, d.name);
        setText(r.sub, plot.stage ? `Level ${plot.stage * 10} · ${d.cap.toLowerCase()} ${fmt(capCount(d, plot.cap))}` : 'Not built yet');
        setText(r.rate, plot.stage ? `${money(E.plotRate(s, r.k) * 60)}/min` : '–');
      }
    }, { page: true });
  }

  return { openBuild, openSite, openChest, openMap, openStats, visit };
}
