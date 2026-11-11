// Missions: today's six, this week's four, and the chests they fill.
import { fmt, fmtTime } from '../format.js';
import * as M from '../meta/missions.js';

export default function install(kit) {
  const { h, setText, setHTML, toggle, st, ART, click, nope, audio, describe, toast, celebrate, setSheet, refresh, onSave, clock, goTo, closeSheet } = kit;

  function open(weekly = false) {
    let tab = weekly;
    const chestBar = h('i');
    const chestEls = M.MISSIONS.chests.map((c, i) => h('button', { class: 'm-chest', style: `left:${(c.at / M.MISSIONS.chests[M.MISSIONS.chests.length - 1].at) * 100}%`, 'aria-label': `Chest at ${c.at} points`, onclick: () => claimChest(i) }, h('img', { src: ART('ico-chest-gold'), alt: '' }), h('small', null, String(c.at))));
    const pts = h('b');
    const tabs = [h('button', { class: 'seg', onclick: () => { click(); tab = false; refresh(); } }, 'Today'), h('button', { class: 'seg', onclick: () => { click(); tab = true; refresh(); } }, 'This week')];
    const list = h('div', { class: 'm-list' });
    const foot = h('p', { class: 'note' });
    function claimChest(i) {
      const info = M.missionsInfo(st(), clock());
      const c = info.chests[i];
      if (!c.ready) {
        click();
        toast(c.open ? 'Already opened.' : `Opens at ${c.at} mission points: ${describe(c.reward, true)}`);
        return;
      }
      const got = M.claimMissionChest(st());
      onSave();
      if (got) celebrate({ kicker: 'Mission chest', title: `${c.at} points`, reward: got, art: 'ico-chest-open' });
      refresh();
    }
    setSheet('missions', 'Missions', [
      h('div', { class: 'm-head' }, h('div', { class: 'm-pts' }, pts, h('small', null, 'mission points this week')), h('div', { class: 'm-track' }, h('div', { class: 'bar' }, chestBar), chestEls)),
      h('div', { class: 'segs' }, tabs),
      list, foot,
    ], () => {
      const s = st();
      const now = clock();
      const info = M.missionsInfo(s, now);
      const top = M.MISSIONS.chests[M.MISSIONS.chests.length - 1].at;
      setText(pts, fmt(info.points));
      chestBar.style.width = Math.min(100, (info.points / top) * 100) + '%';
      info.chests.forEach((c, i) => {
        toggle(chestEls[i], 'open', c.open);
        const pic = ART(c.open ? 'ico-chest-open' : 'ico-chest-gold');
        if (chestEls[i].firstChild.getAttribute('src') !== pic) chestEls[i].firstChild.src = pic;
        toggle(chestEls[i], 'ready', c.ready);
      });
      toggle(tabs[0], 'on', !tab);
      toggle(tabs[1], 'on', tab);
      const rows = tab ? info.weekly : info.daily;
      const key = (tab ? 'w' : 'd') + rows.map((m) => `${m.stat}${m.cur}${m.claimed}`).join('|');
      if (list.__k !== key) {
        list.__k = key;
        list.replaceChildren(...rows.map((m) => h('div', { class: 'row mission' + (m.claimed ? ' done' : m.done ? ' ready' : '') },
          h('div', { class: 'meta' }, h('div', { class: 'name' }, m.text), h('div', { class: 'bar' }, h('i', { style: `width:${(m.cur / m.target) * 100}%` })),
            h('div', { class: 'sub', html: `${fmt(m.cur)}/${fmt(m.target)} · ${describe(m.reward, true)} · +${m.points} pts` })),
          h('div', { class: 'side-col' }, m.claimed ? h('span', { class: 'ok' }, '✓') : h('button', { class: 'btn small ' + (m.done ? 'gold' : 'blue'), onclick: () => {
            if (!m.done) {
              click();
              closeSheet();
              goTo(m.go);
              return;
            }
            const got = M.claimMission(st(), m.weekly, m.i, clock());
            if (!got) return void nope();
            audio.play('claim');
            toast(`Mission done: ${describe(got)}`, 'gold');
            onSave();
            refresh();
          } }, m.done ? 'Claim' : 'Go')))));
      }
      setHTML(foot, tab ? 'Weekly missions and the chests start again every Monday.' : `New missions in ${fmtTime((info.dayEnds - now) / 1000)}. Mission points also count towards the Park Pass.`);
    }, { page: true });
  }

  return { open };
}
