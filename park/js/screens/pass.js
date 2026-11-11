// The Park Pass: thirty tiers, a free prize and a premium prize on each.
import { PRODUCTS } from '../config.js';
import { fmtTime } from '../format.js';
import * as P from '../meta/pass.js';

export default function install(kit) {
  const { h, setText, setHTML, toggle, st, nope, describe, celebrate, setSheet, refresh, onSave, clock, buy, priceOf } = kit;
  const product = PRODUCTS.find((p) => p.pass);

  function open() {
    const name = h('h3');
    const time = h('div', { class: 'kicker' });
    const bar = h('i');
    const line = h('span');
    const claim = h('button', { class: 'btn gold big', onclick: () => {
      const got = P.claimPass(st(), clock());
      if (!got) return void nope();
      onSave();
      const total = got.reduce((a, b) => R_add(a, b), {});
      celebrate({ kicker: 'Park Pass', title: `${got.length} ${got.length === 1 ? 'prize' : 'prizes'}`, reward: total });
      refresh();
    } });
    const premium = h('button', { class: 'btn', onclick: () => buy(product) });
    const rows = Array.from({ length: P.PASS.tiers }, (_, t) => {
      const free = h('div', { class: 'p-cell free' }, h('span', { html: describe(P.PASS.free(t), true) }));
      const paid = h('div', { class: 'p-cell paid' }, h('span', { html: describe(P.paidPrize(t), true) }));
      const el = h('div', { class: 'p-row' }, free, h('b', { class: 'p-tier' }, String(t + 1)), paid);
      return { el, free, paid };
    });
    setSheet('pass', 'Park Pass', [
      h('div', { class: 'banner pass-banner' }, time, name, h('div', { class: 'bar big' }, bar), line),
      h('div', { class: 'actions' }, claim, premium),
      h('div', { class: 'p-head' }, h('b', null, 'Free'), h('span'), h('b', null, 'Premium')),
      h('div', { class: 'p-ladder' }, rows.map((r) => r.el)),
      h('p', { class: 'note' }, 'Pass points come from missions, the daily bonus and mission chests. A new season starts every four weeks, and the ladder starts again.'),
    ], () => {
      const s = st();
      const now = clock();
      const info = P.passInfo(s, now);
      setText(name, info.name);
      setText(time, `Season ends in ${fmtTime((info.endsAt - now) / 1000)}`);
      bar.style.width = (info.into / info.per) * 100 + '%';
      setText(line, info.tier >= P.PASS.tiers ? 'Every tier reached' : `Tier ${info.tier} · ${info.into}/${info.per} points to the next`);
      setText(claim, info.ready ? `Claim ${info.ready}` : 'Nothing to claim');
      claim.disabled = info.ready < 1;
      setHTML(premium, info.premium ? 'Premium is open ✓' : `Open premium · ${priceOf(product)}`);
      premium.disabled = info.premium;
      rows.forEach((r, t) => {
        toggle(r.el, 'reached', t < info.tier);
        toggle(r.free, 'got', t < info.free);
        toggle(r.paid, 'got', t < info.paid);
        toggle(r.paid, 'locked', !info.premium);
      });
    }, { page: true });
    // start the ladder at the tier the player is on
    const info = P.passInfo(st(), clock());
    const row = rows[Math.min(P.PASS.tiers - 1, Math.max(0, info.tier - 1))];
    if (row && info.tier > 3) row.el.scrollIntoView({ block: 'center' });
  }

  // add two "what was given" records together for one haul
  function R_add(a, b) {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) {
      if (!v) continue;
      if (k === 'packs') {
        out.packs = { ...(out.packs || {}) };
        for (const [type, n] of Object.entries(v)) out.packs[type] = (out.packs[type] || 0) + n;
      } else if (k === 'pack') {
        out.packs = { ...(out.packs || {}) };
        out.packs[v] = (out.packs[v] || 0) + 1;
      } else {
        out[k] = (out[k] || 0) + v;
      }
    }
    return out;
  }

  return { open };
}
