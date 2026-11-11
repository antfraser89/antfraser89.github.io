// The Park Expedition, on its three paintings: the trail itself, the sword
// garden that feeds it, and the cannon that feeds the garden.
import { ADS } from '../config.js';
import { fmt, fmtClock } from '../format.js';
import * as T from '../games/trail.js';
import * as R from '../rules.js';

// The flags on the painting, from the bridge up to the top of the beach.
const NODES = [[195, 548], [202, 358], [115, 342], [165, 250], [258, 258], [105, 202]];
// The jars: five across, four down.
const JAR_X = [45, 120, 195, 270, 345];
const JAR_Y = [290, 365, 440, 520];

export default function install(kit) {
  const { h, setText, setHTML, toggle, st, ART, click, nope, buzz, audio, describe, toast, celebrate, refresh, onSave, clock, openScene, closeScene, at, hot, sceneClose, sceneInfo, itemIcon, adFor, wait, fx } = kit;

  // ---- the trail ---------------------------------------------------------------

  function open() {
    const swords = at(h('b', { class: 'tr-cover tr-swords' }), 44, 111, 54, 26);
    const stage = at(h('b', { class: 'tr-cover tr-stage' }), 180, 111, 68, 26);
    const fill = h('i');
    const barText = h('span');
    const prize = at(h('b', { class: 'tr-cover tr-chest' }), 262, 178, 56, 24);
    const marks = NODES.map(([x, y], i) => at(h('div', { class: 'tr-node' }, h('b', null, String(i + 1))), x - 17, y - 17, 34, 34));
    const next = h('div', { class: 'tr-next' });
    const go = h('button', { class: 'btn big gold', onclick: () => {
      const res = T.advance(st());
      if (!res) {
        nope();
        toast('Not enough swords. Collect some from the Sword Garden.');
        return;
      }
      audio.play(res.stageDone ? 'bigwin' : 'upgrade');
      buzz(res.stageDone ? [20, 30, 40] : 14);
      onSave();
      if (res.stageDone) {
        fx.rain(50);
        celebrate({ kicker: `Stage ${res.stage + 1} complete!`, title: 'Treasure found', sub: 'The trail goes on, a little harder.', reward: res.reward, art: 'ico-chest-open' });
      } else {
        toast(`Flag ${res.node + 1} cleared: ${describe(res.reward)}`, 'gold');
      }
      refresh();
    } });
    const pill = (x, y, text) => at(h('span', { class: 'tr-pill' }, text), x - 32, y, 64, 17);
    openScene('trail', 'bg-trail', [
      sceneInfo(28, 72, 'Park Expedition', ['Swords clear the way from flag to flag. Every flag pays a prize, and the last one on each stage is a chest.', 'Swords grow in the <b>Sword Garden</b>. Plant food makes them grow faster.', 'The <b>cannon</b> wins swords and plant food: fire at a jar to see what is inside.']),
      sceneClose(362, 72),
      swords, stage, at(h('div', { class: 'tr-bar' }, fill, barText), 122, 162, 142, 26), prize, marks,
      hot(322, 288, 58, 58, 'Cannon', () => openCannon()), pill(351, 343, 'Cannon'),
      hot(322, 348, 58, 58, 'Sword Garden', () => openGarden()), pill(351, 401, 'Garden'),
      hot(322, 406, 58, 50, 'Prizes on this stage', () => showPrizes()), pill(351, 452, 'Prizes'),
      at(h('div', { class: 'tr-foot' }, next, go), 20, 742, 350, 92),
    ], () => {
      const s = st();
      const n = T.nextNode(s);
      setText(swords, fmt(s.inv.swords));
      setText(stage, `Stage ${n.stage + 1}`);
      fill.style.width = (n.node / T.TRAIL.nodes) * 100 + '%';
      setText(barText, `${n.node}/${T.TRAIL.nodes}`);
      setText(prize, 'Chest');
      marks.forEach((m, i) => {
        toggle(m, 'done', i < n.node);
        toggle(m, 'now', i === n.node);
        m.firstChild.textContent = i < n.node ? '✓' : String(i + 1);
      });
      setHTML(next, `<small>Flag ${n.node + 1} of ${T.TRAIL.nodes}${n.last ? ' · the chest' : ''}</small><b>${describe(n.reward, true)}</b>`);
      setHTML(go, `Clear the way ${itemIcon('swords')}${fmt(n.cost)}`);
      go.disabled = s.inv.swords < n.cost;
    });
  }

  function showPrizes() {
    const s = st();
    const stage = s.trail.path.stage;
    kit.modal([
      h('h2', null, `Stage ${stage + 1}`),
      h('div', { class: 'ms-track' }, Array.from({ length: T.TRAIL.nodes }, (_, i) => h('div', { class: 'ms' + (i < s.trail.path.node ? ' got' : i === s.trail.path.node ? ' next' : '') }, h('b', null, `${i + 1} · ${itemIcon('swords').length ? '' : ''}${fmt(T.TRAIL.nodeCost(stage, i))}`), h('span', { html: describe(T.TRAIL.nodeReward(stage, i), true) })))),
      h('div', { class: 'actions' }, h('button', { class: 'btn big wide', onclick: () => { click(); kit.closeModal(); } }, 'OK')),
    ]);
  }

  // ---- the sword garden -----------------------------------------------------------

  function openGarden() {
    const swords = at(h('b', { class: 'gd-cover gd-swords' }), 42, 141, 56, 28);
    const level = at(h('b', { class: 'gd-cover gd-level' }), 148, 141, 96, 28);
    const foodFill = h('i');
    const foodText = h('span');
    const nextLv = at(h('b', { class: 'gd-cover gd-next' }), 288, 227, 20, 20);
    const ready = at(h('b', { class: 'gd-cover gd-ready' }), 170, 663, 86, 28);
    const rate = at(h('div', { class: 'gd-cover gd-rate' }), 130, 760, 190, 28);
    const feed = at(h('button', { class: 'btn small gd-feed', onclick: () => {
      const fed = T.feedPlant(st());
      if (!fed) {
        nope();
        toast(st().inv.food < 1 ? 'No plant food. The cannon wins it.' : 'The plant is fully grown.');
        return;
      }
      audio.play(fed.levels ? 'milestone' : 'token');
      if (fed.levels) toast(`The plant grew to level ${st().trail.plant.level}!`, 'gold');
      onSave();
      refresh();
    } }), 128, 244, 134, 30);
    openScene('garden', 'bg-plant', [
      sceneInfo(28, 82, 'Sword Garden', ['The plant grows swords all the time, even while you are away, until it is holding as many as it can.', 'Feed it plant food to raise its level: it grows faster and holds more.', 'Plant food comes from the cannon.']),
      sceneClose(360, 82, () => open()),
      swords, level, at(h('div', { class: 'gd-bar' }, foodFill, foodText), 126, 206, 140, 28), nextLv, feed, ready, rate,
      hot(95, 695, 200, 56, 'Collect swords', () => {
        const got = T.collectSwords(st());
        if (!got) return void nope();
        audio.play('claim');
        buzz(12);
        toast(`Collected ${itemIcon('swords')}${fmt(got.swords)}`, 'gold');
        onSave();
        refresh();
      }),
    ], () => {
      const s = st();
      const p = s.trail.plant;
      setText(swords, fmt(s.inv.swords));
      setText(level, `LEVEL ${p.level}`);
      const need = T.TRAIL.foodFor(p.level);
      const maxed = p.level >= T.TRAIL.plantMax;
      foodFill.style.width = maxed ? '100%' : (p.fed / need) * 100 + '%';
      setText(foodText, maxed ? 'Fully grown' : `${p.fed}/${need}`);
      setText(nextLv, maxed ? '★' : String(p.level + 1));
      setHTML(feed, `Feed ${itemIcon('food')}${fmt(s.inv.food)}`);
      feed.disabled = maxed || s.inv.food < 1;
      setText(ready, `${fmt(Math.floor(p.stored))}/${fmt(T.plantStore(s))}`);
      const full = T.plantFullIn(s);
      setText(rate, full > 0 ? `${Math.round(T.plantRate(s))} an hour · full in ${fmtClock(full)}` : 'Full: collect to keep growing');
    }, { onClose: null });
  }

  // ---- the cannon -----------------------------------------------------------------

  function openCannon() {
    let firing = false;
    const level = at(h('b', { class: 'cn-cover cn-level' }), 140, 153, 110, 22);
    const fill = h('i');
    const shots = at(h('button', { class: 'cn-shots', 'aria-label': 'Cannonballs. Watch an advert for more', onclick: async () => {
      click();
      if (R.adLeft(st(), 'shots', clock()) > 0 && kit.adsReady()) await adFor('shots', shots);
      else toast('Cannonballs come from beach balls on the reels, missions and the Park Pass.');
    } }), 14, 596, 112, 40);
    const jars = [];
    JAR_Y.forEach((y, r) => JAR_X.forEach((x, c) => {
      const i = r * 5 + c;
      const tile = at(h('div', { class: 'cn-tile' }), x - 34, y - 40, 68, 80);
      const btn = hot(x - 32, y - 36, 64, 72, `Jar ${i + 1}`, () => shoot(i), 'cn-jar');
      jars.push({ i, x, y, tile, btn });
    }));
    const ball = at(h('i', { class: 'cn-ball' }), 183, 690, 24, 24);

    async function shoot(i) {
      if (firing) return;
      const s = st();
      if (s.trail.cannon.open.includes(i)) return void nope();
      if (s.inv.shots < 1) {
        nope();
        toast('No cannonballs left. Tap the counter for more.');
        return;
      }
      firing = true;
      const j = jars[i];
      audio.play('spin');
      const fly = ball.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${j.x - 195}px, ${j.y - 702}px) scale(0.55)`, opacity: 1 }], { duration: 330, easing: 'ease-out' });
      await fly.finished.catch(() => {});
      const res = T.fire(st(), i);
      firing = false;
      if (!res) return;
      audio.play(res.target ? 'bigwin' : 'dig');
      buzz(res.target ? [20, 30, 40] : 16);
      onSave();
      if (res.target) {
        fx.rain(40);
        celebrate({ kicker: `Level ${res.level} target found!`, title: 'Bullseye', sub: 'A new set of jars is being rolled out.', reward: res.reward, art: 'ico-compass' });
      } else {
        toast(`In the jar: ${describe(res.reward)}`, 'gold');
      }
      refresh();
    }

    openScene('cannon', 'bg-cannon', [
      sceneInfo(30, 47, 'The cannon', ['Twenty jars. One hides the target; the rest hide swords and plant food.', 'Tap a jar to fire at it. Each shot uses a cannonball.', 'Find the target to finish the level. The next level has bigger prizes.']),
      sceneClose(360, 50, () => open()),
      level, at(h('div', { class: 'cn-bar' }, fill), 143, 178, 104, 12),
      jars.map((j) => [j.tile, j.btn]), shots, ball,
    ], () => {
      const s = st();
      const c = s.trail.cannon;
      setText(level, `LEVEL ${c.level}`);
      fill.style.width = (c.open.length / (T.TRAIL.jars - 1)) * 100 + '%';
      setHTML(shots, `<i class="cn-dot"></i><b>${fmt(s.inv.shots)}</b><span>+</span>`);
      for (const j of jars) {
        const open2 = c.open.includes(j.i);
        toggle(j.tile, 'on', open2);
        j.btn.disabled = open2;
        if (open2) {
          const p = T.jarPrize(s, j.i);
          const key = p ? Object.keys(p)[0] : 'target';
          if (j.tile.__k !== key + c.level) {
            j.tile.__k = key + c.level;
            j.tile.replaceChildren(h('img', { src: ART(key === 'swords' ? 'ico-sword' : key === 'food' ? 'ico-food' : 'ico-compass'), alt: '' }), h('b', null, p ? fmt(p[key]) : ''));
          }
        } else {
          j.tile.__k = '';
        }
      }
    });
    void ADS;
  }

  return { open, openGarden, openCannon };
}
