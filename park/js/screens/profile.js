// You: the menu behind the top-right button, your level and what it opens,
// the daily bonus, and settings.
import { DAILY, GAME_TITLE, UNLOCKS, VERSION, levelReward, levelStars } from '../config.js';
import * as E from '../economy.js';
import { fmt, fmtTime, money } from '../format.js';
import * as R from '../rules.js';
import { exportCode, importCode } from '../state.js';

export default function install(kit) {
  const { h, setText, toggle, st, ART, click, nope, audio, describe, toast, celebrate, modal, closeModal, popup, nextPopup, refresh, onSave, clock, faceStyle, setSheet } = kit;

  const playerName = () => st().profile.name || 'Park Keeper';
  // A short code a support team could ask for. It says nothing about the player.
  const supportCode = () => String(1000 + (st().seed % 9000));

  // The menu behind the three bars.
  function openMenu() {
    const s = st();
    const item = (icon, label, fn, badge = 0) => h('button', { class: 'menu-item', onclick: () => { click(); closeModal(); fn(); } }, h('span', { class: 'menu-ico' }, icon), label, badge ? h('i', { class: 'badge' }, String(badge)) : null);
    modal([
      h('button', { class: 'me', onclick: () => { click(); closeModal(); openProfile(); } },
        h('span', { class: 'face', style: faceStyle(s.profile.face) }), h('b', null, playerName()), h('small', null, `Level ${E.level(s)}`)),
      h('div', { class: 'menu' },
        item('★', 'Level and unlocks', openLevel),
        item('🎁', 'Daily bonus', openDaily, R.dailyReady(s, clock()) ? 1 : 0),
        item('📈', 'Park stats', () => kit.screens.park.openStats()),
        item('🗺', 'Park map', () => kit.screens.park.openMap()),
        item('🎰', 'Pay table', () => kit.paytable()),
        item('⚙', 'Settings', openSettings),
        item('✉', 'Support', openSupport)),
      h('div', { class: 'actions' }, h('button', { class: 'btn plain big wide', onclick: () => { click(); closeModal(); } }, 'Close')),
    ]);
  }

  // Name and face.
  function openProfile() {
    const s = st();
    const input = h('input', { class: 'name-input', type: 'text', maxlength: '14', value: s.profile.name, placeholder: 'Park Keeper', 'aria-label': 'Your name', autocomplete: 'off', spellcheck: 'false' });
    const faces = Array.from({ length: 16 }, (_, i) => {
      const b = h('button', { class: 'face pick' + (i === s.profile.face ? ' on' : ''), style: faceStyle(i), 'aria-label': 'Face ' + (i + 1), onclick: () => {
        click();
        s.profile.face = i;
        faces.forEach((f, k) => toggle(f, 'on', k === i));
      } });
      return b;
    });
    modal([
      h('h2', null, 'You'),
      input,
      h('div', { class: 'faces' }, faces),
      h('div', { class: 'stat-list' }, [
        ['Level', fmt(E.level(s))], ['Stars', fmt(s.stats.upgrades)], ['Parks finished', fmt(s.stats.towns)], ['Spins', fmt(s.stats.spins)],
        ['Coins won', money(s.stats.coinsWon)], ['Jackpots', fmt(s.stats.jackpots)], ['Cards collected', fmt(s.stats.cards)], ['Time played', fmtTime(s.stats.playTime)],
      ].map(([k, v]) => [h('span', null, k), h('b', null, v)])),
      h('div', { class: 'actions' }, h('button', { class: 'btn big wide', onclick: () => {
        click();
        s.profile.name = input.value.replace(/[<>&"']/g, '').trim().slice(0, 14);
        onSave();
        closeModal();
        refresh();
      } }, 'Done')),
    ]);
  }

  // Your level, what it has opened, and what is next.
  function openLevel() {
    const bar = h('i');
    const line = h('span');
    const next = h('div', { class: 'prize' });
    const tiles = UNLOCKS.map((u) => {
      const el = h('div', { class: 'unlock' }, h('small', null, `Level ${u.level}`), h('b', null, u.name), h('span', null, u.blurb), h('i', { class: 'state' }));
      return { u, el };
    });
    setSheet('level', 'Your level', [
      h('div', { class: 'level-head' }, h('div', { class: 'level-star' }, h('b', { id: 'lv-num' })), h('div', { class: 'meta' }, h('div', { class: 'bar big' }, bar), line)),
      next,
      h('p', { class: 'note' }, 'Every star you buy in any park counts towards your level. Each level pays a prize, and some open something new.'),
      h('div', { class: 'unlocks' }, tiles.map((t) => t.el)),
    ], () => {
      const s = st();
      const p = E.levelProgress(s);
      setText(document.getElementById('lv-num'), String(p.level));
      bar.style.width = Math.min(100, (p.have / p.need) * 100) + '%';
      setText(line, `★ ${fmt(s.stats.upgrades)} · ${p.need - p.have} more for level ${p.level + 1}`);
      kit.setHTML(next, `Level ${p.level + 1} pays ${describe(levelReward(p.level + 1), true)}`);
      for (const t of tiles) {
        const open = p.level >= t.u.level;
        toggle(t.el, 'open', open);
        setText(t.el.lastChild, open ? '✓' : `★ ${fmt(levelStars(t.u.level))}`);
      }
    }, { page: true });
  }

  // Prizes for any levels reached since the last look. One pop-up each.
  function levelUp() {
    const ups = R.levelUps(st());
    if (!ups.length) return;
    onSave();
    for (const up of ups) {
      popup(() => celebrate({
        kicker: 'Level up!', title: `Level ${up.level}`,
        sub: up.unlocks.length ? up.unlocks.map((u) => `<b>${u.name}</b> is open: ${u.blurb}`).join('<br>') : 'Keep building to open more.',
        reward: up.reward,
        actions: up.unlocks.length ? [['Later', null, 'btn plain big'], ['Show me', () => kit.goTo({ cards: 'cards', missions: 'missions', draw: 'draw', pets: 'pet', merge: 'merge', club: 'club', trail: 'trail', chests: 'chests', pass: 'pass', festival: 'festival' }[up.unlocks[0].id]), 'btn gold big']] : null,
      }));
    }
  }

  // ---- the daily bonus -----------------------------------------------------------

  function dailyModal() {
    const s = st();
    const ready = R.dailyReady(s, clock());
    const today = s.daily.day % DAILY.length;
    // before today's is collected `today` is the one on offer; after, it is tomorrow's
    modal([
      h('div', { class: 'daily-head' }, h('img', { src: ART('hdr-daily'), alt: '' }), h('h2', null, 'Daily bonus')),
      h('div', { class: 'daily' }, DAILY.map((r, i) => h('div', { class: 'day' + (i < today ? ' got' : i === today && ready ? ' today' : '') + (i === DAILY.length - 1 ? ' last' : '') },
        h('small', null, `Day ${i + 1}`), h('span', { html: describe(r, true) }), i < today ? h('i', { class: 'tick' }, '✓') : null))),
      h('div', { class: 'actions' }, ready ? h('button', { class: 'btn big wide', onclick: () => {
        const got = R.claimDaily(st(), clock());
        audio.play('claim');
        closeModal();
        if (got) {
          R.grant(st(), { points: 10 });
          toast(`Daily bonus: ${describe(got.reward)}`, 'gold');
        }
        onSave();
        refresh();
      } }, 'Claim') : h('button', { class: 'btn plain big wide', onclick: () => { click(); closeModal(); } }, 'Come back tomorrow')),
    ], { dismiss: !ready });
  }
  const openDaily = () => dailyModal();
  // On arriving: only if there is something to collect, and in the pop-up queue.
  function showDaily() {
    if (!R.dailyReady(st(), clock())) return;
    popup(() => {
      if (!R.dailyReady(st(), clock())) return nextPopup();
      return dailyModal();
    });
  }

  // ---- settings ------------------------------------------------------------------

  function openSettings() {
    const s = st();
    const sw = (key, label) => {
      const b = h('button', { class: 'switch' + (s.settings[key] ? ' on' : ''), role: 'switch', 'aria-label': label, 'aria-checked': String(!!s.settings[key]) });
      b.addEventListener('click', () => {
        s.settings[key] = !s.settings[key];
        toggle(b, 'on', s.settings[key]);
        b.setAttribute('aria-checked', String(!!s.settings[key]));
        audio.sync();
        click();
        onSave();
      });
      return h('div', { class: 'set-row' }, h('span', null, label), b);
    };
    const link = (label, href) => h('a', { class: 'btn small blue', href, target: '_blank', rel: 'noopener' }, label);
    modal([
      h('h2', null, 'Settings'),
      sw('sfx', 'Sound'), sw('music', 'Music'), sw('haptics', 'Vibration'), sw('fast', 'Fast spins'),
      h('h4', null, 'Your save'),
      h('p', { class: 'fineprint' }, 'The game saves on this device by itself. A save code moves it to another device.'),
      h('div', { class: 'actions' },
        h('button', { class: 'btn blue', onclick: () => { click(); openSaveCode(); } }, 'Save code'),
        h('button', { class: 'btn red', onclick: () => { click(); confirmReset(); } }, 'Erase my data')),
      h('h4', null, 'The small print'),
      h('div', { class: 'actions' }, link('Privacy', 'privacy.html'), link('Terms', 'terms.html'), h('button', { class: 'btn small blue', onclick: () => { click(); openSupport(); } }, 'Support')),
      h('div', { class: 'actions' }, h('button', { class: 'btn big wide', onclick: () => { click(); closeModal(); } }, 'Done')),
      h('p', { class: 'fineprint' }, `${GAME_TITLE} v${VERSION} · support code ${supportCode()}`),
    ]);
  }

  function openSaveCode() {
    const code = h('textarea', { id: 'save-code', 'aria-label': 'Save code', placeholder: 'Paste a save code here to load it', spellcheck: 'false' });
    const msg = h('p', { class: 'fineprint' }, 'Copy the code to keep your game safe, or paste one to load it.');
    modal([
      h('h2', null, 'Save code'),
      code,
      h('div', { class: 'actions' },
        h('button', { class: 'btn blue', onclick: async () => {
          click();
          code.value = exportCode(st());
          code.select();
          try {
            await navigator.clipboard.writeText(code.value);
            setText(msg, 'Save code copied. Keep it somewhere safe.');
          } catch {
            setText(msg, 'Copy the code above and keep it somewhere safe.');
          }
        } }, 'Copy my code'),
        h('button', { class: 'btn plain', onclick: () => {
          const loaded = importCode(code.value);
          if (!loaded) {
            nope();
            setText(msg, 'That does not look like a save code.');
            return;
          }
          click();
          kit.onReplaceSave(loaded);
        } }, 'Load a code')),
      msg,
      h('div', { class: 'actions' }, h('button', { class: 'btn big wide', onclick: () => { click(); openSettings(); } }, 'Back')),
    ]);
  }

  function confirmReset() {
    modal([
      h('h2', null, 'Erase everything?'),
      h('p', null, 'This wipes your parks, cards, spins, pets and purchases from this device. It cannot be undone.'),
      h('div', { class: 'actions' },
        h('button', { class: 'btn plain big', onclick: () => { click(); openSettings(); } }, 'Keep my park'),
        h('button', { class: 'btn red big', onclick: () => kit.onReset() }, 'Erase it')),
    ]);
  }

  function openSupport() {
    modal([
      h('h2', null, 'Support'),
      h('p', null, 'If something has gone wrong, quote this code when you get in touch. It identifies this save and nothing else.'),
      h('div', { class: 'code-box' }, supportCode().split('').map((c) => h('b', null, c))),
      h('p', { class: 'fineprint' }, `${GAME_TITLE} v${VERSION}`),
      h('div', { class: 'actions' },
        h('button', { class: 'btn blue', onclick: async () => {
          click();
          try {
            await navigator.clipboard.writeText(supportCode());
            toast('Code copied.');
          } catch {
            toast('Copy the four digits above.');
          }
        } }, 'Copy code'),
        h('button', { class: 'btn big', onclick: () => { click(); closeModal(); } }, 'Done')),
    ]);
  }

  return { openMenu, openProfile, openLevel, levelUp, openDaily, showDaily, openSettings, openSupport, playerName };
}
