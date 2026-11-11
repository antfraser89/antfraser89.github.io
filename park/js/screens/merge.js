// Rockpool Merge: the board. Tap the basket to drop a shell, drag one shell
// onto its twin to make the next.
import { ADS } from '../config.js';
import { fmt, fmtClock } from '../format.js';
import * as M from '../games/merge.js';
import * as R from '../rules.js';

const CELL = 48;
const LEFT = 27;
const TOP = 158;
// the pictures, plainest to rarest (img/merge-NN.webp), and what each is called
const SHELLS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 12];
const NAMES = ['Pearl', 'Pink scallop', 'Striped scallop', 'Fan clam', 'Cookie clam', 'Spiral conch', 'Whelk', 'Sunset scallop', 'Spiky murex', 'Royal conch'];
// low shells are drawn smaller, so the chain grows as it goes
const SIZE = [26, 30, 33, 38, 39, 40, 42, 41, 43, 46];

export default function install(kit) {
  const { h, setText, setHTML, toggle, st, ART, rand, click, nope, buzz, audio, describe, toast, celebrate, refresh, onSave, clock, openScene, closeScene, at, sceneClose, sceneInfo, itemIcon, adFor, root, fx } = kit;
  const art = (level) => ART('merge-' + String(SHELLS[level - 1]).padStart(2, '0'));
  const cellXY = (i) => [LEFT + (i % M.MERGE.cols) * CELL, TOP + Math.floor(i / M.MERGE.cols) * CELL];

  function open() {
    let picked = -1; // the cell whose details are showing
    let drag = null;
    const board = at(h('div', { class: 'mg-board' }), LEFT, TOP, CELL * M.MERGE.cols, CELL * M.MERGE.rows);
    const strip = at(h('div', { class: 'mg-strip' }, Array.from({ length: M.MERGE.chain }, (_, i) => h('img', { src: art(i + 1), alt: '' }))), 27, 108, 336, 40);
    const final = at(h('div', { class: 'mg-final' }), 80, 30, 230, 66);
    const energy = at(h('button', { class: 'mg-energy', 'aria-label': 'Energy. Watch an advert for more', onclick: () => moreEnergy() }), 18, 510, 104, 44);
    const gen = at(h('button', { class: 'mg-gen', 'aria-label': 'Drop a shell' }, h('img', { src: ART('merge-gen'), alt: '' })), 132, 502, 126, 60);
    const mult = at(h('button', { class: 'mg-mult', 'aria-label': 'How much energy to use at once', onclick: () => {
      click();
      const list = M.MERGE.mults;
      M.setMult(st(), list[(list.indexOf(st().merge.mult) + 1) % list.length]);
      refresh();
    } }), 268, 510, 104, 44);
    const info = at(h('div', { class: 'mg-info' }), 18, 572, 354, 62);
    const timer = at(h('div', { class: 'mg-timer' }), 18, 640, 354, 20);
    const nextPrize = at(h('div', { class: 'mg-next' }), 18, 668, 354, 66);

    const toStage = (e) => {
      const r = root.getBoundingClientRect();
      const k = r.width / 390 || 1;
      return [(e.clientX - r.left) / k, (e.clientY - r.top) / k];
    };
    const cellAt = (x, y) => {
      const c = Math.floor((x - LEFT) / CELL);
      const r = Math.floor((y - TOP) / CELL);
      return c >= 0 && c < M.MERGE.cols && r >= 0 && r < M.MERGE.rows ? r * M.MERGE.cols + c : -1;
    };

    function paint() {
      const cells = st().merge.cells;
      board.replaceChildren(...cells.map((v, i) => {
        if (v === 0) return null;
        const [x, y] = cellXY(i);
        const el = h('div', { class: 'mg-item' + (v < 0 ? ' buried' : '') + (i === picked ? ' picked' : ''), style: `left:${x - LEFT}px;top:${y - TOP}px` }, h('img', { src: art(Math.abs(v)), alt: NAMES[Math.abs(v) - 1], draggable: 'false', style: `width:${SIZE[Math.abs(v) - 1]}px` }));
        el.dataset.i = String(i);
        return el;
      }).filter(Boolean));
      board.__k = cells.join(',') + picked;
    }

    function after(res, to) {
      if (res.kind === 'merge') {
        audio.play(res.done ? 'bigwin' : 'upgrade');
        buzz(12);
        const [x, y] = cellXY(to);
        const pop = at(h('div', { class: 'mg-pop' }), x, y, CELL, CELL);
        scene().append(pop);
        setTimeout(() => pop.remove(), 500);
        for (const r of res.rewards) toast(`First ${NAMES[r.level - 1]}: ${describe(r.reward)}`, 'gold');
        if (res.done) {
          fx.rain(60);
          celebrate({ kicker: 'Round complete!', title: NAMES[M.MERGE.chain - 1], sub: 'The rarest shell in the rockpool. A fresh board is waiting.', reward: res.final });
        }
      } else {
        audio.play('click');
      }
      picked = st().merge.cells[to] > 0 ? to : -1;
      onSave();
      paint();
      refresh();
    }
    const scene = () => board.parentNode;

    board.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('.mg-item');
      if (!el) return;
      const i = Number(el.dataset.i);
      picked = i;
      if (st().merge.cells[i] < 0) {
        paint();
        refresh();
        return;
      }
      const [sx, sy] = toStage(e);
      drag = { i, el, sx, sy, moved: false };
      el.classList.add('held');
      try { board.setPointerCapture(e.pointerId); } catch { /* not every browser */ }
      e.preventDefault();
    });
    board.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const [x, y] = toStage(e);
      const dx = x - drag.sx;
      const dy = y - drag.sy;
      if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
      drag.el.style.transform = `translate(${dx}px, ${dy}px) scale(1.12)`;
    });
    const drop = (e) => {
      if (!drag) return;
      const d = drag;
      drag = null;
      const [x, y] = toStage(e);
      const to = cellAt(x, y);
      if (d.moved && to >= 0 && to !== d.i) {
        const res = M.move(st(), d.i, to);
        if (res.ok) return after(res, to);
        nope();
      }
      paint();
      refresh();
      return undefined;
    };
    board.addEventListener('pointerup', drop);
    board.addEventListener('pointercancel', drop);

    gen.addEventListener('click', () => {
      const res = M.generate(st(), rand, clock());
      if (!res.ok) {
        nope();
        toast(res.why === 'full' ? 'The rockpool is full. Merge some shells, or hand one back.' : 'Out of energy. It comes back with time, or watch an advert for more.');
        return;
      }
      audio.play('token');
      buzz(8);
      picked = res.index;
      onSave();
      paint();
      const el = board.querySelector(`[data-i="${res.index}"]`);
      if (el) el.animate([{ transform: 'scale(0.2)', opacity: 0 }, { transform: 'scale(1.15)', opacity: 1 }, { transform: 'scale(1)' }], { duration: 260 });
      refresh();
    });

    async function moreEnergy() {
      click();
      if (R.adLeft(st(), 'energy', clock()) > 0 && kit.adsReady()) await adFor('energy', energy);
      else toast('Energy comes back with time. It is also a prize in missions, chests and the Prize Draw.');
    }

    openScene('merge', null, [
      sceneInfo(28, 62, 'Rockpool Merge', ['Tap the basket to drop a shell. It costs a point of energy.', 'Drag a shell onto one the same to make the next shell along the row at the top.', 'Shells half-buried in the sand cannot be moved, but their match can be dropped onto them.', 'The first of each new shell pays a prize. Make the last shell in the row to finish the round.', 'Stuck? Pick a shell and hand it back to free its square.'], true),
      sceneClose(362, 62, undefined, true),
      final, strip, board, energy, gen, mult, info, timer, nextPrize,
    ], () => {
      const s = st();
      const m = s.merge;
      if (!drag && board.__k !== m.cells.join(',') + picked) paint();
      setHTML(final, `<small>Round ${m.round + 1} · final prize</small><b>${describe(M.MERGE.final(m.round), true)}</b>`);
      [...strip.children].forEach((img, i) => { toggle(img, 'made', i < m.best); toggle(img, 'next', i === m.best); });
      setHTML(energy, `${itemIcon('energy')}<b>${fmt(s.inv.energy)}</b><i>+</i>`);
      setText(mult, 'x' + m.mult);
      toggle(gen, 'empty', s.inv.energy < m.mult);
      const v = picked >= 0 ? m.cells[picked] : 0;
      if (v !== 0) {
        const level = Math.abs(v);
        info.replaceChildren(h('img', { src: art(level), alt: '' }), h('div', null, h('b', null, `${NAMES[level - 1]} · level ${level}`),
          h('small', null, v < 0 ? 'Buried in the sand: drop its twin on it.' : level >= M.MERGE.chain ? 'The rarest shell.' : 'Merge with its twin to make the next shell.')),
        v > 0 ? h('button', { class: 'btn small plain', onclick: () => {
          const sold = M.sell(st(), picked);
          if (!sold) return void nope();
          click();
          if (sold.energy) toast(`Handed back: ${itemIcon('energy')}${sold.energy}`);
          picked = -1;
          onSave();
          paint();
          refresh();
        } }, 'Hand back') : null);
      } else {
        info.replaceChildren(h('div', null, h('b', null, M.boardFull(s) && !M.anyMerge(s) ? 'No pairs left' : 'Tap a shell to see what it is'), h('small', null, M.boardFull(s) && !M.anyMerge(s) ? 'Pick a shell and hand it back to make room.' : `The basket drops a shell for ${m.mult} energy.`)));
      }
      // the next shell that will pay a prize for being the first of its kind
      const nextLevel = Object.keys(M.MERGE.firsts).map(Number).find((l) => l > m.best);
      setHTML(nextPrize, nextLevel ? `<img src="${art(nextLevel)}" alt=""><div><small>First ${NAMES[nextLevel - 1]} this round</small><b>${describe(M.MERGE.firsts[nextLevel], true)}</b></div>` : `<img src="${art(M.MERGE.chain)}" alt=""><div><small>Make the ${NAMES[M.MERGE.chain - 1]}</small><b>to win the final prize</b></div>`);
      const secs = M.nextEnergyIn(s, clock());
      setText(timer, secs > 0 ? `+1 energy in ${fmtClock(secs)} · ${R.adLeft(s, 'energy', clock())} free top-ups left today (+${ADS.energy.reward.energy})` : `Energy is full (${M.energyCap(s)})`);
    });
    paint();
  }

  return { open };
}
