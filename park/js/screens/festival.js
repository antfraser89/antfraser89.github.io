// The festival: this week's theme, the decorations gems buy, and the way in
// to the side games that pay gems.
import { UNLOCKS, unlockLevel } from '../config.js';
import * as E from '../economy.js';
import { fmt, fmtTime } from '../format.js';
import * as F from '../meta/festival.js';

export default function install(kit) {
  const { h, setText, setHTML, toggle, st, ART, click, nope, audio, describe, toast, celebrate, setSheet, refresh, onSave, clock, itemIcon, lockedToast } = kit;
  const GAMES = [['merge', 'Rockpool Merge', 'merge-gen'], ['draw', 'Prize Draw', 'ico-pearl'], ['trail', 'Expedition', 'ico-sword'], ['chests', 'Lucky Chests', 'ico-key']];

  function open() {
    if (!E.unlocked(st(), 'festival') && !E.unlocked(st(), 'chests')) return lockedToast('chests');
    const name = h('h3');
    const time = h('div', { class: 'kicker' });
    const bar = h('i');
    const line = h('span');
    const gems = h('b', { class: 'gem-count' });
    const claim = h('button', { class: 'btn gold wide', onclick: () => {
      const got = F.claimFestival(st(), clock());
      if (!got) return void nope();
      onSave();
      celebrate({ kicker: 'Festival prize', title: F.festivalInfo(st(), clock()).name, reward: got });
      refresh();
    } });
    const items = F.FESTIVAL.items.map((item, i) => {
      const dots = h('div', { class: 'd-dots' }, [0, 1, 2, 3].map(() => h('i')));
      const btn = h('button', { class: 'btn small', onclick: () => {
        if (!E.unlocked(st(), 'festival')) return lockedToast('festival');
        const got = F.buyDecor(st(), i, clock());
        if (!got) return void nope();
        audio.play('upgrade');
        el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 260 });
        toast(`<b>${item.name}</b> is now size ${got.level} of 4.`);
        onSave();
        refresh();
        return undefined;
      } });
      const el = h('div', { class: 'decor' }, h('b', null, item.name), h('img', { src: ART(item.art), alt: '' }), dots, btn);
      return { el, dots, btn, item };
    });
    const trade = h('button', { class: 'btn blue wide', onclick: () => {
      const got = F.tradeGems(st());
      if (!got) return void nope();
      audio.play('claim');
      toast(`Traded: ${describe(got)}`, 'gold');
      onSave();
      refresh();
    } });
    const games = GAMES.map(([id, label, art]) => {
      const lock = h('small');
      const el = h('button', { class: 'game-link', onclick: () => { click(); kit.goTo(id); } }, h('img', { src: ART(art), alt: '' }), h('b', null, label), lock);
      return { id, el, lock };
    });
    setSheet('festival', 'Festival', [
      h('div', { class: 'banner fest-banner' }, time, name, h('div', { class: 'bar big' }, bar), line, gems),
      claim,
      h('h5', null, 'Dress the pier'),
      h('div', { class: 'decors' }, items.map((d) => d.el)),
      trade,
      h('h5', null, 'Win gems here'),
      h('div', { class: 'game-links' }, games.map((g) => g.el)),
      h('p', { class: 'note' }, 'Gems are prizes in every side game, in missions and on the Park Pass. The decorations start again each week; your gems are kept.'),
    ], () => {
      const s = st();
      const now = clock();
      const info = F.festivalInfo(s, now);
      setText(name, info.name);
      setText(time, `Ends in ${fmtTime((info.endsAt - now) / 1000)}`);
      bar.style.width = (info.bought / info.total) * 100 + '%';
      setHTML(line, info.next ? `${info.bought}/${info.total} decorations · at ${info.next.at}: ${describe(info.next.reward, true)}` : 'Every prize won this week');
      setHTML(gems, `${itemIcon('gems')}${fmt(s.inv.gems)}`);
      claim.hidden = !info.ready;
      setText(claim, 'Collect the festival prize');
      setHTML(trade, `Trade ${itemIcon('gems')}${F.FESTIVAL.trade.cost} for ${describe(F.FESTIVAL.trade.reward, true)}`);
      trade.disabled = s.inv.gems < F.FESTIVAL.trade.cost;
      const open2 = E.unlocked(s, 'festival');
      items.forEach((d, i) => {
        const level = info.levels[i];
        [...d.dots.children].forEach((dot, k) => toggle(dot, 'on', k < level));
        d.el.style.setProperty('--grow', String(0.7 + level * 0.075));
        if (level >= 4) {
          setText(d.btn, 'Finished ✓');
          d.btn.disabled = true;
        } else {
          setHTML(d.btn, open2 ? `${itemIcon('gems')}${d.item.cost[level]}` : `Level ${unlockLevel('festival')}`);
          d.btn.disabled = open2 && s.inv.gems < d.item.cost[level];
        }
      });
      for (const g of games) {
        const ok = E.unlocked(s, g.id);
        toggle(g.el, 'locked', !ok);
        setText(g.lock, ok ? '' : `Level ${(UNLOCKS.find((u) => u.id === g.id) || {}).level}`);
      }
    }, { page: true });
    return undefined;
  }

  return { open };
}
