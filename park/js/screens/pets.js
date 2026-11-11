// Your pets: the one walking with you, feeding, and the pet shop.
import * as E from '../economy.js';
import { money } from '../format.js';
import { PETS, PET_MAX, PET_TUNING, activePet, buyPet, feedPet, setPet } from '../pets.js';

export default function install(kit) {
  const { h, setText, setHTML, toggle, st, ART, TOKEN, COIN, CHIPS, click, nope, audio, toast, celebrate, setSheet, refresh, onSave, lockedToast } = kit;

  const artStyle = (pet) => `background-image:url(${ART(pet.art[0])});background-size:300% 300%;background-position:${(pet.art[1] % 3) * 50}% ${Math.floor(pet.art[1] / 3) * 50}%`;
  const talentText = (pet, level) => {
    const v = pet.per * level;
    return {
      dive: `Pearl dives pay +${Math.round(v * 100)}%`, gate: `The gate takes +${Math.round(v * 100)}%`, reels: `Coin wins pay +${Math.round(v * 100)}%`,
      away: `Earns for +${Math.round(v * 100)}% longer while you are away`, energy: `+${Math.round(v)} merge energy`, treats: `+${Math.round(v * 100)}% cherries`,
      stars: `Spare cards are worth +${Math.round(v * 100)}% stars`, draw: `Prize Draw prizes +${Math.round(v * 100)}%`, swords: `The sword plant grows +${Math.round(v * 100)}% faster`,
      wheel: `Wheel coin prizes +${Math.round(v * 100)}%`,
    }[pet.perk];
  };

  function open() {
    const pic = h('div', { class: 'pet-pic' });
    const tag = h('b', { class: 'cardf-tag' });
    pic.append(tag);
    const name = h('h3');
    const bar = h('i');
    const xp = h('span');
    const perk = h('div', { class: 'note' });
    const feedBtn = h('button', { class: 'btn big wide', onclick: () => {
      const fed = feedPet(st());
      if (!fed) return nope();
      audio.play(fed.levels ? 'milestone' : 'token');
      pic.animate([{ transform: 'translateY(0) rotate(0)' }, { transform: 'translateY(-14px) rotate(-6deg)' }, { transform: 'translateY(0) rotate(4deg)' }, { transform: 'translateY(0) rotate(0)' }], { duration: 480 });
      if (fed.levels) toast(`Pet level ${st().pet.level}! ${TOKEN}${fed.tokens}`, 'gold');
      for (const p of fed.arrived) celebrate({ kicker: 'A new pal!', title: p.name, sub: `${p.name} the ${p.kind} has come to stay. ${p.blurb}`, reward: null });
      onSave();
      refresh();
      return undefined;
    } });
    const tiles = PETS.map((pet) => {
      const btn = h('button', { class: 'btn small' });
      const sub = h('small');
      const el = h('div', { class: 'pal' }, h('div', { class: 'pal-pic', style: artStyle(pet) }), h('b', null, pet.name), sub, btn);
      btn.addEventListener('click', () => {
        const s = st();
        if (s.pet.owned.includes(pet.id)) {
          click();
          setPet(s, pet.id);
        } else if (pet.how === 'buy') {
          if (!E.unlocked(s, 'pets')) return lockedToast('pets');
          if (!buyPet(s, pet.id, E.unit(s.town))) return nope();
          audio.play('upgrade');
          setPet(s, pet.id);
          celebrate({ kicker: 'A new pal!', title: pet.name, sub: `${pet.name} the ${pet.kind} is walking with you. ${pet.blurb}`, reward: null });
        } else {
          return nope();
        }
        onSave();
        refresh();
        return undefined;
      });
      return { pet, el, btn, sub };
    });
    setSheet('pet', 'Pets', [
      h('div', { class: 'pet-top' }, pic, h('div', { class: 'meta' }, name, h('div', { class: 'bar' }, bar), h('div', { class: 'ms-line' }, xp))),
      perk, feedBtn,
      h('h5', null, 'Your pals'),
      h('div', { class: 'pals' }, tiles.map((t) => t.el)),
      h('p', { class: 'note' }, 'There is one pet level, and it belongs to all of them. Only the pal walking with you uses its talent. Every level also adds two spins to the meter.'),
    ], () => {
      const s = st();
      const pet = activePet(s);
      pic.style.cssText = artStyle(pet);
      setText(tag, 'Lv.' + s.pet.level);
      setText(name, `${pet.name} the ${pet.kind}`);
      const need = PET_TUNING.xpFor(s.pet.level);
      const maxed = s.pet.level >= PET_MAX;
      bar.style.width = maxed ? '100%' : Math.min(100, (s.pet.xp / need) * 100) + '%';
      setHTML(xp, maxed ? 'Top level' : `${s.pet.xp}/${need} cherries to level ${s.pet.level + 1} · prize ${TOKEN}${PET_TUNING.levelTokens(s.pet.level + 1)}`);
      setHTML(perk, `<b>${talentText(pet, s.pet.level)}</b> · next level: ${talentText(pet, s.pet.level + 1).replace(/^[^+]*/, '')}<br>${pet.blurb} Win cherries on the reels, the prize wheel and from events.`);
      setHTML(feedBtn, s.pet.treats > 0 ? `Feed ${CHIPS}${s.pet.treats}` : 'No cherries to feed');
      feedBtn.disabled = !(s.pet.treats > 0) || maxed;
      for (const t of tiles) {
        const has = s.pet.owned.includes(t.pet.id);
        const on = s.pet.active === t.pet.id;
        toggle(t.el, 'on', on);
        toggle(t.el, 'away', !has);
        setText(t.sub, talentText(t.pet, Math.max(1, s.pet.level)).replace(/[+\d%]+ ?/g, '').replace(/\s+/g, ' ').trim());
        if (has) {
          setText(t.btn, on ? 'With you' : 'Walk');
          t.btn.disabled = on;
          t.btn.className = 'btn small ' + (on ? 'plain' : '');
        } else if (t.pet.how === 'buy') {
          const cost = t.pet.price * E.unit(s.town);
          setHTML(t.btn, `${COIN}${money(cost)}`);
          t.btn.disabled = s.coins < cost || !E.unlocked(s, 'pets');
          t.btn.className = 'btn small gold';
        } else {
          setText(t.btn, `Pet level ${t.pet.level}`);
          t.btn.disabled = true;
          t.btn.className = 'btn small plain';
        }
      }
    }, { page: true });
  }

  return { open };
}
