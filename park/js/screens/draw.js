// The Prize Draw, on its painting. A pearl token bursts one bubble.
import { addRewards } from '../core.js';
import * as E from '../economy.js';
import { fmt, money } from '../format.js';
import * as D from '../games/draw.js';
import * as R from '../rules.js';

// Where each bubble sits on the painting, and where its painted number is.
const AT = {
  pack: [195, 290, 195, 314], coinsS: [100, 315, 100, 337], energy: [290, 315, 290, 337], gemsA: [45, 390, 45, 413], gemsB: [345, 390, 345, 413],
  coinsL: [45, 487, 45, 511], wheel: [345, 487, 345, 511], bigGems: [100, 580, 100, 599], bigEnergy: [195, 610, 195, 628], bigBoost: [290, 580, 290, 599],
};

export default function install(kit) {
  const { h, setText, setHTML, toggle, st, rand, nope, buzz, audio, describe, toast, celebrate, refresh, onSave, clock, openScene, at, hot, sceneClose, sceneInfo, adFor, wait } = kit;

  const label = (state, reward) => (reward.pack ? '×1' : reward.coins ? money(reward.coins * E.unit(state.town)) : reward.wheel ? '×' + reward.wheel : reward.boost ? reward.boost + 'm' : fmt(reward.energy || reward.gems || reward.tokens || 0));

  function open() {
    let busyNow = false;
    const labels = {};
    const stocks = {};
    const rings = {};
    const nodes = [];
    for (const def of [...D.DRAW.small, ...D.DRAW.big]) {
      const [cx, cy, lx, ly] = AT[def.id];
      const big = def.stock != null;
      labels[def.id] = at(h('b', { class: 'dr-label' + (big ? ' big' : '') }), lx - 30, ly - 10, 60, 20);
      rings[def.id] = at(h('i', { class: 'dr-ring' }), cx - 44, cy - 44, 88, 88);
      nodes.push(rings[def.id], labels[def.id]);
      if (big) {
        stocks[def.id] = at(h('small', { class: 'dr-stock' }), lx - 24, ly + 10, 48, 15);
        nodes.push(stocks[def.id]);
      }
    }
    const total = at(h('b', { class: 'dr-total' }), 22, 122, 50, 31);
    const bar = h('i');
    const barText = h('span');
    const count = at(h('b', { class: 'dr-count' }), 176, 167, 74, 31);
    const pearl = at(h('div', { class: 'dr-pearl' }), 128, 392, 134, 44);
    const pity = at(h('div', { class: 'dr-pity' }), 128, 490, 134, 40);
    const round = at(h('div', { class: 'dr-round' }), 104, 98, 182, 21);
    const more = at(h('button', { class: 'dr-more', 'aria-label': 'More pearl tokens', onclick: async () => {
      kit.click();
      if (R.adLeft(st(), 'pearls', clock()) > 0 && kit.adsReady()) await adFor('pearls', more);
      else toast('Pearl tokens come from shells on the reels, missions, chests and the Park Pass.');
    } }, '+'), 252, 170, 26, 26);

    async function go(n) {
      if (busyNow) return;
      const s = st();
      if (s.inv.pearls < n) {
        nope();
        toast(s.inv.pearls < 1 ? 'No pearl tokens. Three shells on the reels sometimes drop one.' : `That needs ${n} pearl tokens.`);
        return;
      }
      busyNow = true;
      const got = D.drawMany(s, rand, n);
      onSave();
      let haul = {};
      for (const one of got) {
        const ring = rings[one.id];
        ring.classList.remove('pop');
        void ring.offsetWidth;
        ring.classList.add('pop');
        audio.play(one.big ? 'milestone' : 'token');
        buzz(one.big ? [20, 20, 30] : 8);
        haul = addRewards(haul, one.reward);
        if (one.grand) haul = addRewards(haul, one.grand);
        refresh();
        await wait(n > 1 ? 170 : 420);
      }
      busyNow = false;
      const grand = got.find((g) => g.grand);
      if (grand) celebrate({ kicker: 'The pearl!', title: 'Grand prize', sub: 'The clam has given up its pearl. A new round begins.', reward: haul });
      else if (n > 1 || got.some((g) => g.big)) celebrate({ kicker: n > 1 ? `${got.length} draws` : 'Big bubble!', title: 'You won', reward: haul });
      else toast(`You won ${describe(got[0].reward)}`, 'gold');
      refresh();
    }

    openScene('draw', 'bg-draw', [
      sceneInfo(30, 65, 'Park Prize Draw', ['Each draw costs one pearl token and bursts a bubble: the prize inside is yours.', 'The three green bubbles are big prizes with a limited number each round. One is guaranteed at least every sixteen draws.', `Draw ${D.DRAW.grandAt} times in a round to win the pearl itself, then everything is refilled.`, 'Pearl tokens come from shells on the reels, missions, chests, the Park Pass and adverts you choose to watch.']),
      sceneClose(360, 65),
      round, total, at(h('div', { class: 'dr-bar' }, bar, barText), 73, 121, 246, 37), count, more, nodes, pearl, pity,
      hot(25, 685, 153, 76, 'Draw once', () => go(1)),
      hot(212, 685, 156, 76, 'Draw ten times', () => go(10)),
    ], () => {
      const s = st();
      const d = s.draw;
      for (const def of D.DRAW.small) setText(labels[def.id], label(s, def.reward));
      D.DRAW.big.forEach((def, i) => {
        setText(labels[def.id], label(s, def.reward));
        setText(stocks[def.id], `${d.stock[i]}/${def.stock}`);
        toggle(rings[def.id], 'gone', d.stock[i] < 1);
      });
      setHTML(total, `<small>Round</small>${d.round + 1}`);
      bar.style.width = (d.total / D.DRAW.grandAt) * 100 + '%';
      setText(barText, `${d.total} / ${D.DRAW.grandAt}`);
      setText(count, fmt(s.inv.pearls));
      setHTML(pearl, `<small>The pearl in</small><b>${D.grandIn(s)} ${D.grandIn(s) === 1 ? 'draw' : 'draws'}</b>`);
      setHTML(pity, d.stock.some((n) => n > 0) ? `<small>A big prize within</small><b>${D.bigIn(s)} ${D.bigIn(s) === 1 ? 'draw' : 'draws'}</b>` : '<small>Big prizes</small><b>All won</b>');
      setText(round, 'Draws this round');
    });
  }

  return { open };
}
