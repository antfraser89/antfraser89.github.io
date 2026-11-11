// Lucky Chests, on its painting: six prizes round the ring, six chests below.
import * as E from '../economy.js';
import { fmt, money } from '../format.js';
import * as C from '../games/chests.js';
import * as R from '../rules.js';

// Where each ring prize's painted number is, clockwise from the top.
const RING = [[195, 188], [300, 251], [300, 372], [195, 432], [88, 372], [88, 254]];
// Centres of the six chests.
const CHEST = [[75, 570], [195, 570], [318, 570], [72, 668], [195, 668], [318, 668]];

export default function install(kit) {
  const { h, setText, setHTML, toggle, st, ART, rand, click, nope, buzz, audio, describe, toast, celebrate, refresh, onSave, clock, openScene, at, hot, sceneClose, sceneInfo, adFor, symURL, packURL, fx } = kit;

  const label = (state, reward) => (reward.pack ? '×1' : reward.coins ? money(reward.coins * E.unit(state.town)) : reward.wheel ? '×' + reward.wheel : fmt(reward.energy || reward.tokens || 0));
  const icon = (reward) => (reward.pack ? packURL(reward.pack) : reward.coins ? symURL('coin') : reward.wheel ? symURL('ball') : reward.energy ? ART('ico-energy') : symURL('token'));

  function open() {
    const labels = RING.map(([x, y]) => at(h('b', { class: 'lc-label' }), x - 28, y - 10, 56, 20));
    const fill = h('i');
    const barText = h('span');
    const level = at(h('b', { class: 'lc-level' }), 296, 49, 30, 28);
    const note = at(h('div', { class: 'lc-note' }), 148, 76, 94, 21);
    const keys = at(h('b', { class: 'lc-keys' }), 172, 775, 54, 30);
    const tiles = CHEST.map(([x, y], i) => {
      const tile = at(h('div', { class: 'lc-won' }), x - 40, y - 62, 80, 40);
      const btn = hot(x - 48, y - 42, 96, 84, `Chest ${i + 1}`, () => pick(i), 'lc-chest');
      return { tile, btn };
    });

    function pick(i) {
      const s = st();
      if (s.chests.open.includes(i)) return void nope();
      if (s.inv.keys < 1) {
        nope();
        toast('No keys. Tap + for more, or win them from bells on the reels.');
        return;
      }
      const level0 = s.chests.level;
      const prizes = C.CHESTS.prizes(level0);
      const res = C.openChest(s, i, rand);
      if (!res) return;
      audio.play('dig');
      buzz(16);
      onSave();
      tiles[i].btn.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 260 });
      if (res.levelUp) {
        fx.rain(50);
        celebrate({ kicker: `Level ${res.levelUp.level} complete!`, title: 'Lucky Chests', sub: `The last chest held ${describe(res.reward)}. The next level has better prizes.`, reward: res.levelUp.reward, art: 'ico-chest-open' });
      } else if (res.boardDone) {
        toast(`All six opened: ${describe(res.reward)}. A fresh set is out.`, 'gold');
      } else {
        toast(`In the chest: ${describe(res.reward)}`, 'gold');
      }
      // remember what this chest held so the board can show it until the next set
      shown[i] = prizes[res.prize];
      if (res.boardDone) for (let k = 0; k < 6; k++) shown[k] = null;
      refresh();
    }
    // what each opened chest held (worked out again from the save when the screen opens)
    const shown = [null, null, null, null, null, null];
    {
      const s = st();
      const prizes = C.CHESTS.prizes(s.chests.level);
      for (const i of s.chests.open) shown[i] = prizes[s.chests.order[i]];
    }

    openScene('chests', 'bg-chests', [
      sceneInfo(25, 57, 'Lucky Chests', ['The six prizes on the ring are hidden in the six chests, one in each.', 'A key opens a chest. Open all six and a fresh set is put out.', 'Three sets finish the level, pay a bonus, and make every prize bigger.', 'Keys come from bells on the reels, missions, chests in the park and the Park Pass.']),
      sceneClose(365, 57),
      at(h('div', { class: 'lc-bar' }, fill, barText), 102, 50, 192, 26), level, note, labels,
      tiles.map((t) => [t.btn, t.tile]), keys,
      hot(228, 772, 34, 36, 'More keys', async () => {
        if (R.adLeft(st(), 'keys', clock()) > 0 && kit.adsReady()) await adFor('keys', keys);
        else toast('Keys come from bells on the reels, missions and the Park Pass.');
      }),
    ], () => {
      const s = st();
      const c = s.chests;
      const prizes = C.CHESTS.prizes(c.level);
      prizes.forEach((p, i) => {
        setText(labels[i], label(s, p));
        toggle(labels[i], 'won', c.open.some((chest) => c.order[chest] === i));
      });
      fill.style.width = ((c.board + c.open.length / 6) / C.CHESTS.boards) * 100 + '%';
      setText(barText, `${c.board}/${C.CHESTS.boards}`);
      setText(level, String(c.level));
      setText(note, '1 key a chest');
      setText(keys, fmt(s.inv.keys));
      tiles.forEach((t, i) => {
        const open2 = c.open.includes(i);
        toggle(t.btn, 'opened', open2);
        t.btn.disabled = open2;
        toggle(t.tile, 'on', open2 && !!shown[i]);
        if (open2 && shown[i] && t.tile.__k !== JSON.stringify(shown[i])) {
          t.tile.__k = JSON.stringify(shown[i]);
          t.tile.replaceChildren(h('img', { src: icon(shown[i]), alt: '' }), h('b', null, label(s, shown[i])));
        }
      });
    });
    void click;
    void setHTML;
  }

  return { open };
}
