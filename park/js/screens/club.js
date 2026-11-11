// The Club tab: Park Pals (requests, your own asks, the team build), the
// daily league table, and the Park Bonus spin event.
import { CARDS, CARD_SETS, EVENT_MILESTONES, LEAGUE_PRIZES } from '../config.js';
import * as E from '../economy.js';
import { fmt, fmtTime, money } from '../format.js';
import * as Club from '../meta/club.js';
import * as R from '../rules.js';

export default function install(kit) {
  const { h, setText, setHTML, toggle, st, TOKEN, click, nope, audio, describe, toast, celebrate, modal, closeModal, refresh, onSave, clock, setSheet, sheetBody, faceStyle, cardFace, openScene, closeScene, at, hot, sceneClose, sceneInfo, lockedToast } = kit;
  const C = Club.CLUB;
  const face = (i) => h('span', { class: 'face', style: faceStyle(i) });

  // ---- Park Bonus: the spin event --------------------------------------------------

  function openBonus() {
    const evName = h('h3');
    const evTag = h('div', { class: 'tag-line' });
    const evTime = h('div', { class: 'kicker' });
    const track = EVENT_MILESTONES.map((m) => ({ m, el: h('div', { class: 'ms' }, h('b', null, fmt(m.at)), h('span', { html: describe(m.reward, true) })) }));
    setSheet('bonus', 'Park Bonus', [
      h('div', { class: 'banner' }, evTime, evName, evTag),
      h('div', { class: 'ms-track' }, track.map((t) => t.el)),
      h('div', { class: 'rules' },
        h('div', null, h('b', null, 'Spin to earn'), h('span', null, 'Every spin: 1 point. Three of a kind: 4. A pearl dive: 13. The jackpot: 26. Bigger bets multiply the points.')),
        h('div', null, h('b', null, 'Reach the goals'), h('span', null, 'Each goal pays its prize the moment you reach it. The track starts again when the timer runs out.'))),
      h('button', { class: 'btn blue wide', onclick: () => { click(); kit.paytable(); } }, 'Pay table'),
    ], () => {
      const s = st();
      const now = clock();
      const ev = R.eventInfo(s, now);
      setText(evName, ev.theme.name);
      setText(evTag, `${ev.theme.blurb} You have ${fmt(ev.points)} points.`);
      setText(evTime, `Park Bonus · ends in ${fmtTime((ev.endsAt - now) / 1000)}`);
      track.forEach((t, i) => {
        toggle(t.el, 'got', i < ev.claimed);
        toggle(t.el, 'next', i === ev.claimed);
      });
    }, { page: true, tab: 'events' });
  }

  // ---- Park Pals ---------------------------------------------------------------------

  function open() {
    if (!E.unlocked(st(), 'club')) return lockedToast('club');
    const teamBar = h('i');
    const teamText = h('span');
    const teamTime = h('small');
    const teamBtn = h('button', { class: 'team-banner', onclick: () => { click(); openTeam(); } },
      h('b', null, 'Team build'), h('div', { class: 'bar' }, teamBar), teamText, teamTime, h('i', { class: 'badge' }));
    const feed = h('div', { class: 'feed' });
    const spinsBtn = h('button', { class: 'btn', onclick: () => askSpins() });
    const cardBtn = h('button', { class: 'btn blue', onclick: () => askCard() });
    const table = h('div', { class: 'league' });
    const lgTime = h('div', { class: 'kicker' });
    const prizes = h('div', { class: 'note' });
    setSheet('club', C.name, [
      h('div', { class: 'club-head' }, h('div', { class: 'club-crest' }, '★'), h('div', null, h('b', null, C.name), h('small', null, `${Club.members().length + 1} members · your pals are run by the game in this version`))),
      teamBtn,
      h('div', { class: 'ask' }, spinsBtn, cardBtn),
      h('h5', null, 'Pals asking for help'),
      feed,
      h('div', { class: 'banner league-banner' }, lgTime, h('h3', null, 'Daily league'), h('div', { class: 'tag-line' }, 'Pearl dives and turns on the wheel score points. Top of the table at midnight wins.')),
      table, prizes,
    ], () => {
      const s = st();
      const now = clock();
      const team = Club.teamInfo(s, now);
      teamBar.style.width = (team.total / team.goal) * 100 + '%';
      setText(teamText, `${fmt(team.total)} / ${fmt(team.goal)} points · ${team.built}/5 built`);
      setText(teamTime, `ends in ${fmtTime((team.endsAt - now) / 1000)}`);
      const badge = teamBtn.lastChild;
      badge.hidden = team.ready < 1;
      setText(badge, String(team.ready));
      // your own asks
      const sp = Club.spinsStatus(s, now);
      setHTML(spinsBtn, sp.state === 'ready' ? `Collect ${TOKEN}${C.spinsGot}` : sp.state === 'waiting' ? `Spins on the way · ${fmtTime(sp.in)}` : sp.state === 'cooldown' ? `Ask again in ${fmtTime(sp.in)}` : 'Request spins');
      spinsBtn.disabled = sp.state === 'waiting' || sp.state === 'cooldown';
      toggle(spinsBtn, 'gold', sp.state === 'ready');
      const cd = Club.cardStatus(s, now);
      setHTML(cardBtn, cd.state === 'ready' ? 'Collect your card' : cd.state === 'waiting' ? `Card on the way · ${fmtTime(cd.in)}` : cd.state === 'cooldown' ? `Ask again in ${fmtTime(cd.in)}` : 'Request a card');
      cardBtn.disabled = cd.state === 'waiting' || cd.state === 'cooldown' || !E.unlocked(s, 'cards');
      toggle(cardBtn, 'gold', cd.state === 'ready');
      // the board
      const reqs = Club.requests(s, now);
      const key = reqs.map((r) => `${r.who.name}${r.card ? r.card.id : 's'}${r.helped}${r.can}`).join('|');
      if (feed.__k !== key) {
        feed.__k = key;
        feed.replaceChildren(...reqs.map((r) => h('div', { class: 'row req' + (r.helped ? ' done' : '') },
          face(r.who.face),
          h('div', { class: 'meta' }, h('div', { class: 'name' }, r.who.name), h('div', { class: 'sub' }, r.card ? `Looking for ${r.card.name}` : `Needs ${C.spinGift} spins`, ` · ${r.ago}m ago`)),
          h('div', { class: 'side-col' }, r.helped ? h('span', { class: 'ok' }, 'Sent ✓') : h('button', { class: 'btn small', disabled: !r.can, onclick: () => {
            const done = Club.help(st(), r.id, clock());
            if (!done) return nope();
            audio.play('claim');
            toast(`Thanks from ${r.who.name}: ${describe(done.reward)}`, 'gold');
            onSave();
            refresh();
            return undefined;
          } }, r.card ? (r.can ? 'Send' : 'No spare') : 'Help')))));
      }
      // the league
      const lg = R.leagueInfo(s, now);
      setText(lgTime, `Ends in ${fmtTime((lg.endsAt - now) / 1000)}`);
      setHTML(table, lg.rows.map((r, i) => `<div class="lg-row${r.you ? ' you' : ''}"><i>${i + 1}</i><span class="face" style="${faceStyle(r.you ? s.profile.face : r.face)}"></span><span>${r.you ? 'You' : r.name}</span><b>${fmt(r.points)}</b></div>`).join(''));
      setHTML(prizes, LEAGUE_PRIZES.map((p, i) => `${i === 0 ? '1st' : `Top ${p.upTo}`}: ${describe(p.reward)}`).join(' · '));
      if (s.league.last && !s.league.last.seen) s.league.last.seen = true;
    }, { page: true, tab: 'events' });
    return undefined;
  }

  function askSpins() {
    const s = st();
    const sp = Club.spinsStatus(s, clock());
    if (sp.state === 'ready') {
      const got = Club.collectSpins(s, clock());
      audio.play('token');
      toast(`Your pals sent ${describe(got)}`, 'gold');
    } else if (sp.state === 'can') {
      Club.askSpins(s, clock());
      click();
      toast(`Asked the pals for spins. They will be here in about ${C.spinsWait} minutes.`);
    } else {
      return nope();
    }
    onSave();
    refresh();
    return undefined;
  }

  function askCard() {
    const s = st();
    const cd = Club.cardStatus(s, clock());
    if (cd.state === 'ready') {
      const got = Club.collectCard(s, clock());
      onSave();
      refresh();
      if (got) kit.showCards([{ id: got.id, isNew: true, stars: 0 }], 'From a Park Pal.');
      return;
    }
    if (cd.state !== 'can') return void nope();
    const sets = R.unlockedSets(s);
    const missing = CARDS.filter((c) => sets.includes(c.set) && !c.gold && !R.hasCard(s, c.id));
    if (!missing.length) return void toast('You have every card your pals could send. Gold cards cannot be asked for.');
    modal([
      h('h2', null, 'Request a card'),
      h('p', null, 'Pick a card you are missing. A pal will send it in about half an hour. Gold cards cannot be asked for.'),
      h('div', { class: 'pick-cards' }, missing.slice(0, 18).map((c) => {
        const f = cardFace(c);
        f.setCount(1);
        return h('button', { class: 'pick-card', 'aria-label': c.name, onclick: () => {
          if (!Club.askCard(st(), c.id, clock())) return nope();
          click();
          closeModal();
          toast(`Asked for <b>${c.name}</b> (${CARD_SETS[c.set].name}).`);
          onSave();
          refresh();
          return undefined;
        } }, f);
      })),
      h('div', { class: 'actions' }, h('button', { class: 'btn plain big wide', onclick: () => { click(); closeModal(); } }, 'Not now')),
    ]);
  }

  // ---- the team build: the painted board ---------------------------------------------

  // where each project's bar and count sit on the painting
  const PROJECT_AT = [[85, 235, 80, 255, 125], [262, 235, 76, 255, 302], [60, 425, 80, 445, 100], [292, 425, 73, 445, 330], [182, 585, 73, 605, 218]];

  function openTeam() {
    const bars = PROJECT_AT.map(([x, y, w, ty, tx]) => {
      const fill = h('i');
      const bar = at(h('div', { class: 'tm-bar' }, fill), x, y, w, 13);
      const text = at(h('b', { class: 'tm-count' }), tx - 30, ty - 8, 60, 16);
      return { fill, bar, text };
    });
    const totalFill = h('i');
    const totalText = h('b');
    const timer = at(h('div', { class: 'tm-timer' }), 142, 188, 108, 21);
    const rank = at(h('b', { class: 'tm-num tm-rank' }), 62, 788, 56, 26);
    const points = at(h('b', { class: 'tm-num tm-pts' }), 138, 790, 116, 24);
    const spins = at(h('b', { class: 'tm-num tm-spins' }), 300, 780, 50, 30);
    const jobsBtn = at(h('button', { class: 'btn gold tm-jobs', onclick: () => { click(); openJobs(); } }, 'Team jobs'), 125, 716, 140, 40);
    const jobsBadge = h('i', { class: 'badge' });
    jobsBtn.append(jobsBadge);
    openScene('team', 'bg-team', [
      sceneInfo(25, 62, 'Team build', ['Your club builds five projects together over three days.', 'Finish <b>team jobs</b> to add points. Your pals add theirs as the days go by.', 'Each finished project pays a prize, and finishing all five pays the team chest.', 'In this version your pals are run by the game.']),
      sceneClose(363, 62),
      at(h('div', { class: 'tm-cover tm-title' }, 'Park Pals team build'), 118, 56, 154, 18),
      at(h('b', { class: 'tm-n' }, money(C.teamReward.coins * E.unit(st().town))), 134, 93, 40, 14), at(h('b', { class: 'tm-n' }, String(C.teamReward.tokens)), 178, 93, 34, 14), at(h('b', { class: 'tm-n' }, '×1'), 224, 93, 28, 14),
      at(h('div', { class: 'tm-cover tm-names' }, h('span', null, C.name), h('span', null, 'The goal')), 28, 122, 334, 24),
      at(h('div', { class: 'tm-total' }, totalFill, totalText), 38, 146, 314, 28),
      timer, bars.map((b) => [b.bar, b.text]), rank, points, spins, jobsBtn,
      hot(352, 772, 34, 46, 'Offers', () => { closeScene(); kit.screens.offers.open('spins'); }),
    ], () => {
      const s = st();
      const now = clock();
      const t = Club.teamInfo(s, now);
      totalFill.style.width = (t.total / t.goal) * 100 + '%';
      setText(totalText, `${fmt(t.total)} / ${fmt(t.goal)}`);
      setText(timer, fmtTime((t.endsAt - now) / 1000));
      t.projects.forEach((p, i) => {
        bars[i].fill.style.width = (p.points / p.goal) * 100 + '%';
        setText(bars[i].text, p.done ? 'Built ✓' : `${Math.floor((p.points / p.goal) * 10)}/10`);
      });
      setText(rank, String(t.table.findIndex((r) => r.you) + 1));
      setText(points, fmt(t.mine));
      setText(spins, fmt(s.tokens));
      jobsBadge.hidden = t.ready < 1;
      setText(jobsBadge, String(t.ready));
    });
  }

  function openJobs() {
    const body = h('div');
    const redraw = () => {
      const s = st();
      const t = Club.teamInfo(s, clock());
      body.replaceChildren(
        h('div', { class: 'prize', html: `Team chest: ${describe(C.teamReward, true)}` }),
        ...t.jobs.map((j) => h('div', { class: 'row job' + (j.claimed ? ' done' : '') },
          h('div', { class: 'meta' }, h('div', { class: 'name' }, j.text), h('div', { class: 'bar' }, h('i', { style: `width:${(j.cur / j.target) * 100}%` })), h('div', { class: 'sub' }, `${j.cur}/${j.target} · ${j.pts} team points`)),
          h('div', { class: 'side-col' }, j.claimed ? h('span', { class: 'ok' }, '✓') : h('button', { class: 'btn small', disabled: !j.done, onclick: () => {
            if (!Club.claimJob(st(), j.i, clock())) return nope();
            audio.play('claim');
            onSave();
            refresh();
            redraw();
            return undefined;
          } }, j.done ? 'Add' : 'Go')))),
        t.stepsReady > 0 ? h('button', { class: 'btn gold wide', onclick: () => {
          const got = Club.claimProject(st(), clock());
          if (got) toast(`Project built: ${describe(got)}`, 'gold');
          audio.play('milestone');
          onSave();
          refresh();
          redraw();
        } }, `Collect for a finished project (${t.stepsReady})`) : null,
        t.canFinish ? h('button', { class: 'btn gold big wide', onclick: () => {
          const got = Club.claimTeam(st(), clock());
          closeModal();
          if (got) celebrate({ kicker: 'Team reward', title: 'Great work, team!', sub: 'All five projects are built.', reward: got, art: 'ico-chest-open' });
          onSave();
          refresh();
        } }, 'Open the team chest') : null,
        h('h4', null, 'Who has done what'),
        h('div', { class: 'league' }, t.table.map((r, i) => h('div', { class: 'lg-row' + (r.you ? ' you' : '') }, h('i', null, String(i + 1)), face(r.you ? s.profile.face : r.face), h('span', null, r.name), h('b', null, fmt(r.points))))),
      );
    };
    modal([h('h2', null, 'Team jobs'), body, h('div', { class: 'actions' }, h('button', { class: 'btn big wide', onclick: () => { click(); closeModal(); } }, 'Done'))]);
    redraw();
  }

  return { open, openBonus, openTeam, sheetBody };
}
