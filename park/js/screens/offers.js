// Everything that costs money or an advert lives here, and only here: the
// Offers page, the list of free things, the stamp card, and the one polite
// note when the spins run out.
import { ADS, PACKS, PRODUCTS, STORE_PREVIEW, TUNING } from '../config.js';
import * as E from '../economy.js';
import { fmt, fmtClock } from '../format.js';
import * as R from '../rules.js';

export default function install(kit) {
  const { h, setText, setHTML, toggle, st, ART, TOKEN, click, audio, describe, toast, celebrate, modal, closeModal, refresh, onSave, clock, setSheet, sheetBody, host, adFor, buy, priceOf, bridge, adsReady, busy } = kit;

  const owned = (p) => R.productOwned(st(), p.id, clock());
  const amount = (p) => (p.grant.tokens && !p.grant.coins ? fmt(p.grant.tokens) : p.grant.coins && !p.grant.tokens ? fmt(p.grant.coins * E.unit(st().town)) : '');

  function tile(p) {
    const btn = h('button', { class: 'btn price', onclick: () => buy(p) });
    const big = h('b', { class: 'amount' });
    const el = h('div', { class: 'offer ' + p.group, 'data-pid': p.id },
      p.tag ? h('i', { class: 'ribbon' }, p.tag) : null,
      big, h('small', null, p.group === 'spins' ? 'spins' : p.name),
      h('img', { src: ART(p.art), alt: '' }),
      p.bonus ? h('i', { class: 'more' }, p.bonus) : h('i', { class: 'more none' }),
      btn);
    return { p, el, btn, big };
  }
  function wide(p) {
    const btn = h('button', { class: 'btn price', onclick: () => buy(p) });
    const what = h('div', { class: 'sub' });
    const el = h('div', { class: 'product wide', 'data-pid': p.id }, h('div', { class: 'meta' }, h('div', { class: 'name' }, p.name, p.tag ? h('i', { class: 'chip' }, p.tag) : null), what), btn);
    return { p, el, btn, what };
  }

  function open(section = '') {
    const preview = !(bridge() && bridge().purchase);
    const spins = PRODUCTS.filter((p) => p.group === 'spins').map(tile);
    const coins = PRODUCTS.filter((p) => p.group === 'coins').map(tile);
    const others = PRODUCTS.filter((p) => p.group === 'bundle' || p.group === 'extra').map(wide);
    const daily = others.find((t) => t.p.id === 'daily');
    const adBtn = h('button', { class: 'btn gold', onclick: (e) => adFor('tokens', e.currentTarget) }, h('span', { class: 'ad' }, 'AD'), 'Watch');
    const adSub = h('div', { class: 'sub' });
    const stampLine = h('button', { class: 'row stamp-row', onclick: () => { click(); openStamps(); } });
    setSheet('shop', 'Offers', [
      preview ? h('div', { class: 'shop-note' }, STORE_PREVIEW ? 'Preview shop: no payment or advert provider is connected in this build, so purchases are free and adverts are stand-ins.' : 'The shop opens soon.') : null,
      h('div', { class: 'hero', 'data-pid': 'daily' }, h('img', { src: ART('hdr-bundle'), alt: '' }), h('div', { class: 'hero-over' }, h('b', null, 'Daily bundle'), daily.what, daily.btn)),
      h('div', { class: 'product wide free' }, h('div', { class: 'art', html: TOKEN }), h('div', { class: 'meta' }, h('div', { class: 'name' }, `${ADS.tokens.reward.tokens} free spins`), adSub), adBtn,
        h('button', { class: 'more-free', onclick: () => { click(); openFree(); } }, 'All free prizes ›')),
      h('h5', { 'data-pid': 'spins' }, 'Spin packs'),
      h('div', { class: 'offer-grid' }, spins.map((t) => t.el)),
      h('h5', { 'data-pid': 'coins' }, 'Coin shop'),
      h('img', { class: 'shop-hdr', src: ART('hdr-coinshop'), alt: '' }),
      h('div', { class: 'offer-grid' }, coins.map((t) => t.el)),
      h('h5', { 'data-pid': 'bundle' }, 'Bundles and extras'),
      others.filter((t) => t !== daily).map((t) => t.el),
      stampLine,
      h('button', { class: 'linkish', onclick: () => { click(); openOdds(); } }, 'Card pack odds'),
    ], () => {
      const s = st();
      const left = R.adLeft(s, 'tokens', clock());
      setText(adSub, !adsReady() ? 'Adverts are not available yet' : left > 0 ? `Watch a short advert · ${left} left today` : 'Come back tomorrow for more');
      adBtn.disabled = left <= 0 || !adsReady();
      for (const t of [...spins, ...coins]) {
        setText(t.big, amount(t.p));
        setText(t.btn, priceOf(t.p));
        t.btn.disabled = preview && !STORE_PREVIEW;
      }
      for (const t of others) {
        const has = owned(t.p);
        toggle(t.el, 'owned', has);
        setHTML(t.what, t.p.desc || describe(t.p.grant, true));
        setText(t.btn, has ? (t.p.daily ? 'Tomorrow' : 'Owned') : priceOf(t.p));
        t.btn.disabled = has || (preview && !STORE_PREVIEW);
      }
      setHTML(stampLine, `<span class="stamps">${[0, 1, 2].map((i) => `<i class="${i < s.shop.stamps ? 'on' : ''}"></i>`).join('')}</span><span><b>Stamp card</b><small>${s.shop.stamps >= 3 ? 'Full: collect your prize' : 'Every purchase earns a stamp. Three stamps pay a prize.'}</small></span>`);
      toggle(stampLine, 'ready', s.shop.stamps >= 3);
    }, { page: true, tab: 'shop' });
    const jump = section && sheetBody.querySelector(`[data-pid="${section}"]`);
    if (jump) jump.scrollIntoView({ block: 'start' });
  }

  // Everything an advert can win today.
  function openFree() {
    const rows = Object.entries(ADS).map(([id, def]) => {
      const btn = h('button', { class: 'btn gold small', onclick: async (e) => { await adFor(id, e.currentTarget); } }, h('span', { class: 'ad' }, 'AD'), 'Watch');
      const sub = h('div', { class: 'sub' });
      const what = h('div', { class: 'name' });
      return { id, def, btn, sub, what, el: h('div', { class: 'row' }, h('div', { class: 'meta' }, what, sub), h('div', { class: 'side-col' }, btn)) };
    });
    setSheet('free', 'Free prizes', [
      h('p', { class: 'note' }, 'Adverts are always your choice. Watch one to the end and the prize is yours; if it fails to play, nothing is used up.'),
      rows.map((r) => r.el),
    ], () => {
      const s = st();
      for (const r of rows) {
        const locked = r.def.needs && !E.unlocked(s, r.def.needs);
        const left = R.adLeft(s, r.id, clock());
        setHTML(r.what, r.def.boost ? r.def.name : `${r.def.name}: ${describe(r.def.reward, true)}`);
        setText(r.sub, locked ? 'Opens later, as you level up' : left > 0 ? `${left} left today` : 'Back tomorrow');
        r.btn.disabled = locked || left < 1 || !adsReady();
        toggle(r.el, 'done', locked || left < 1);
      }
    }, { page: true, tab: 'shop', back: () => open() });
  }

  function openStamps() {
    const s = st();
    const full = s.shop.stamps >= 3;
    modal([
      h('img', { class: 'big-sym', src: ART('ico-stamp'), alt: '' }),
      h('h2', null, 'Stamp card'),
      h('p', null, 'Every purchase stamps the card. Three stamps pay out and the card starts again.'),
      h('div', { class: 'stamps big' }, [0, 1, 2].map((i) => h('i', { class: i < s.shop.stamps ? 'on' : '' }))),
      h('div', { class: 'prize', html: describe(R.STAMP_REWARD, true) }),
      h('div', { class: 'actions' },
        h('button', { class: 'btn plain big', onclick: () => { click(); closeModal(); } }, 'Close'),
        full ? h('button', { class: 'btn gold big', onclick: () => {
          const reward = R.claimStamps(st());
          closeModal();
          if (reward) celebrate({ kicker: 'Stamp card full!', title: 'Thank you', reward });
          onSave();
          refresh();
        } }, 'Collect') : h('button', { class: 'btn big', onclick: () => { click(); closeModal(); open(); } }, 'See offers')),
    ]);
  }

  // What is in a card pack, in plain numbers.
  function openOdds() {
    modal([
      h('h2', null, 'Card pack odds'),
      h('p', null, 'The chance of each card in a pack being of each rarity. Gold cards are the five-gem cards.'),
      h('table', { class: 'odds' },
        h('tr', null, h('th', null, 'Pack'), h('th', null, 'Cards'), [1, 2, 3, 4, 5].map((n) => h('th', null, '◆'.repeat(n)))),
        Object.values(PACKS).map((p) => h('tr', null, h('td', null, p.name.replace(' pack', '')), h('td', null, String(p.size)), p.odds.map((o) => h('td', null, o ? o + '%' : '–'))))),
      h('p', { class: 'fineprint' }, 'After two packs in a row with nothing new, the next pack always holds a card you do not have. Spare cards become stars for the vault.'),
      h('div', { class: 'actions' }, h('button', { class: 'btn big wide', onclick: () => { click(); closeModal(); } }, 'OK')),
    ]);
  }

  // Out of spins. The full note is shown once a session; after that a quiet
  // line is enough, and the ways to get more stay where they always are.
  let invited = false;
  function outOfSpins() {
    if (busy()) return;
    const s = st();
    const left = R.adLeft(s, 'tokens', clock());
    const secs = R.nextTokenIn(s, clock());
    if (invited) {
      toast(`Out of spins. ${secs > 0 ? `The next is ${fmtClock(secs)} away.` : ''}${left > 0 && adsReady() ? ' Watch an advert for more.' : ''}`);
      return;
    }
    invited = true;
    modal([
      host('modal-host', 'sad'),
      h('div', { class: 'kicker' }, 'Out of spins'),
      h('h2', null, 'The machine needs feeding'),
      h('p', { html: `A spin comes back every ${TUNING.tokenEvery / 60} minutes${secs > 0 ? `; the next is <b>${fmtClock(secs)}</b> away` : ''}.` }),
      h('div', { class: 'actions stack' },
        left > 0 && adsReady() ? h('button', { class: 'btn gold big', onclick: async (e) => {
          const from = e.currentTarget;
          closeModal();
          await adFor('tokens', from);
        } }, h('span', { class: 'ad' }, 'AD'), `Watch for ${ADS.tokens.reward.tokens} spins`) : null,
        h('button', { class: 'btn big', onclick: () => { click(); closeModal(); open('spins'); } }, 'See the offers'),
        h('button', { class: 'btn plain big', onclick: () => { click(); closeModal(); } }, 'Wait')),
    ]);
    audio.play('error');
  }

  return { open, openFree, openStamps, openOdds, outOfSpins };
}
