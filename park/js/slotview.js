// The three reels, drawn on their own small canvas. The result is decided by
// the rules before the reels move; this only shows it.
import { SYMBOLS } from './config.js';
import { drawSymbol } from './art.js';

const RING = 24;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// ease out with a small overshoot, so each reel lands with a bounce
const settle = (u) => {
  const c1 = 1.1;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
};

export function createSlotView(canvas, hooks = {}) {
  const ctx = canvas.getContext('2d');
  let w = 300;
  let h = 120;
  let dpr = 1;
  let time = 0;
  let flashUntil = 0;
  let flashMask = [false, false, false];
  let running = false;
  let teasing = false;

  const pickSym = () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
  const reels = [0, 1, 2].map((i) => ({
    ring: Array.from({ length: RING }, pickSym),
    pos: i * 3 + 1,
    from: 0,
    to: 0,
    t0: 0,
    dur: 0,
    spinning: false,
    lastTick: 0,
  }));
  // start on a tidy non-winning line
  ['coin', 'star', 'token'].forEach((s, i) => { reels[i].ring[reels[i].pos % RING] = s; });

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth || 300;
    h = canvas.clientHeight || 120;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }

  // Send the reels round to land on `symbols` (one per reel).
  // `tease` holds the last reel back when the first two already match.
  function spin(symbols, quick = false, tease = false) {
    running = true;
    teasing = false;
    flashUntil = 0;
    reels.forEach((r, i) => {
      const start = Math.round(r.pos);
      const land = start + RING * (quick ? 1 : 2) + 5 + i * 4;
      r.ring[((land % RING) + RING) % RING] = symbols[i];
      // neighbours differ from the result so a win reads clearly
      for (const off of [-1, 1]) {
        let s = pickSym();
        while (s === symbols[i]) s = pickSym();
        r.ring[(((land + off) % RING) + RING) % RING] = s;
      }
      r.from = r.pos;
      r.to = land;
      r.t0 = time;
      r.dur = (quick ? 0.45 : 0.95) + i * (quick ? 0.16 : 0.34);
      if (tease && i === 2 && !quick) {
        r.to += RING;
        r.ring[((r.to % RING) + RING) % RING] = symbols[i];
        for (const off of [-1, 1]) {
          let s = pickSym();
          while (s === symbols[i]) s = pickSym();
          r.ring[(((r.to + off) % RING) + RING) % RING] = s;
        }
        r.dur += 1.05;
      }
      r.tease = tease && i === 2 && !quick;
      r.spinning = true;
    });
  }

  // Bring a spin in progress to a quick stop: jump to a couple of symbols
  // short of the landing spot and settle from there.
  function skip() {
    reels.forEach((r, i) => {
      if (!r.spinning || r.to - r.pos <= 3) return;
      r.from = r.to - (2.5 + i * 0.6);
      r.pos = r.from;
      r.t0 = time;
      r.dur = 0.16 + i * 0.09;
    });
  }

  function flash(mask, seconds = 1.4) {
    flashMask = mask;
    flashUntil = time + seconds;
  }

  function draw(dt) {
    time += dt;
    let any = false;
    reels.forEach((r, i) => {
      if (!r.spinning) return;
      const u = clamp((time - r.t0) / r.dur, 0, 1);
      r.pos = r.from + (r.to - r.from) * settle(u);
      const tick = Math.floor(r.pos);
      if (tick !== r.lastTick) {
        r.lastTick = tick;
        if (i === 2 && u < 0.9 && hooks.onTick) hooks.onTick();
      }
      if (u >= 1) {
        r.pos = r.to;
        r.spinning = false;
        if (hooks.onReelStop) hooks.onReelStop(i);
        // two matching reels down and one still turning: build the suspense
        if (i === 1 && reels[2].spinning && reels[2].tease) {
          teasing = true;
          if (hooks.onTease) hooks.onTease();
        }
        if (i === 2) teasing = false;
      } else {
        any = true;
      }
    });
    if (running && !any) {
      running = false;
      if (hooks.onStop) hooks.onStop();
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const gap = 8;
    const rw = (w - gap * 2) / 3;
    const cell = h * 0.56;
    const cy = h / 2;
    const flashing = time < flashUntil;
    for (let i = 0; i < 3; i++) {
      const r = reels[i];
      const x = i * (rw + gap);
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, 0, rw, h, 14);
      ctx.clip();
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#d9cfb4');
      bg.addColorStop(0.18, '#fffaf0');
      bg.addColorStop(0.82, '#fffaf0');
      bg.addColorStop(1, '#d9cfb4');
      ctx.fillStyle = bg;
      ctx.fillRect(x, 0, rw, h);
      const base = Math.floor(r.pos);
      const speed = r.spinning ? Math.abs(r.to - r.pos) : 0;
      const blur = Math.min(1, Math.max(0, (speed - 5) / 14)); // 0 at rest, 1 flat out
      for (let o = -2; o <= 2; o++) {
        const idx = base + o;
        const sym = r.ring[((idx % RING) + RING) % RING];
        const y = cy - (idx - r.pos) * cell;
        if (y < -cell || y > h + cell) continue;
        let size = cell * 0.9;
        const centre = Math.abs(idx - r.pos) < 0.02;
        if (flashing && centre && flashMask[i]) size *= 1 + Math.sin((flashUntil - time) * 14) * 0.08 + 0.08;
        ctx.globalAlpha = !r.spinning && !centre ? 0.42 : 1 - blur * 0.45;
        if (blur > 0.05) {
          // smear the symbol along its direction of travel
          ctx.save();
          ctx.translate(x + rw / 2, y);
          ctx.scale(1, 1 + blur * 1.3);
          drawSymbol(ctx, sym, 0, 0, size);
          ctx.restore();
        } else {
          drawSymbol(ctx, sym, x + rw / 2, y, size);
        }
      }
      ctx.globalAlpha = 1;
      if (blur > 0.05) {
        ctx.fillStyle = `rgba(255,250,240,${blur * 0.3})`;
        ctx.fillRect(x, 0, rw, h);
      }
      if (teasing && i < 2) {
        const glow = 0.5 + Math.sin(time * 16) * 0.5;
        ctx.strokeStyle = `rgba(255,197,61,${0.45 + glow * 0.5})`;
        ctx.lineWidth = 4 + glow * 3;
        ctx.beginPath();
        ctx.roundRect(x + 3, cy - cell / 2 + 2, rw - 6, cell - 4, 12);
        ctx.stroke();
      }
      // shade the top and bottom so the reel looks curved
      const shade = ctx.createLinearGradient(0, 0, 0, h);
      shade.addColorStop(0, 'rgba(60,40,20,0.45)');
      shade.addColorStop(0.22, 'rgba(60,40,20,0)');
      shade.addColorStop(0.78, 'rgba(60,40,20,0)');
      shade.addColorStop(1, 'rgba(60,40,20,0.45)');
      ctx.fillStyle = shade;
      ctx.fillRect(x, 0, rw, h);
      if (flashing && flashMask[i]) {
        ctx.strokeStyle = `rgba(255,197,61,${0.5 + Math.sin((flashUntil - time) * 14) * 0.4})`;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.roundRect(x + 2.5, cy - cell / 2 + 2, rw - 5, cell - 4, 12);
        ctx.stroke();
      }
      ctx.restore();
    }
    // pay line markers
    ctx.fillStyle = '#ffc53d';
    for (const [x, dir] of [[0, 1], [w, -1]]) {
      ctx.beginPath();
      ctx.moveTo(x, cy - 8);
      ctx.lineTo(x + dir * 9, cy);
      ctx.lineTo(x, cy + 8);
      ctx.closePath();
      ctx.fill();
    }
  }

  resize();
  return { spin, skip, flash, draw, resize, get spinning() { return running; }, get teasing() { return teasing; } };
}
