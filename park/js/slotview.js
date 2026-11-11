// The three reels, drawn on their own small canvas. The result is decided by
// the rules before the reels move; this only shows it.
import { SYMBOLS, SYMBOL_ART } from './config.js';

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
  ['coin', 'fish', 'star'].forEach((s, i) => { reels[i].ring[reels[i].pos % RING] = s; });

  // The symbols are pictures; each is loaded once.
  const ART = (name) => (window.PARK_ART && window.PARK_ART[name]) || `img/${name}.webp`;
  const sprites = new Map();
  for (const [sym, file] of Object.entries(SYMBOL_ART)) {
    const img = new Image();
    img.src = ART(file);
    sprites.set(sym, img);
  }
  let spriteSize = 0;
  function stamp(sym, cx, cy, size) {
    const img = sprites.get(sym);
    if (!img) return;
    if (img.getContext) {
      // a site badge, drawn by the page: its picture fills four fifths of the canvas
      const s2 = size * 1.2;
      ctx.drawImage(img, cx - s2 / 2, cy - s2 / 2 + s2 * 0.02, s2, s2);
      return;
    }
    if (!img.complete || !img.naturalWidth) return;
    const k = size / Math.max(img.naturalWidth, img.naturalHeight * 1.08);
    const [w2, h2] = [img.naturalWidth * k, img.naturalHeight * k];
    ctx.drawImage(img, cx - w2 / 2, cy - h2 / 2, w2, h2);
  }
  // The eight site symbols are badges the page draws from the park's painting,
  // and redraws as the park is built.
  const setSprite = (sym, canvas) => sprites.set(sym, canvas);

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
    const gap = Math.max(6, Math.round(w * 0.022));
    const rw = (w - gap * 2) / 3;
    // three rows when the window is tall, one and a bit when it is short
    // three rows in view, as on the machine's painted window
    const cell = h / 3.3;
    const symSize = Math.min(cell * 0.98, rw * 0.74);
    if (Math.abs(symSize - spriteSize) > 1) {
      spriteSize = symSize;
    }
    const cy = h / 2;
    // each reel is a drum: symbols ride round it, foreshortening as they turn away
    const R = h * 1.05;
    const arc = cell / R; // the angle between one symbol and the next
    const rows = Math.ceil(1.5 / arc);
    const flashing = time < flashUntil;
    const beat = Math.sin((flashUntil - time) * 14);
    for (let i = 0; i < 3; i++) {
      const r = reels[i];
      const x = i * (rw + gap);
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, 0, rw, h, 7);
      ctx.clip();
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#b9ad92');
      bg.addColorStop(0.22, '#f6efde');
      bg.addColorStop(0.5, '#fdf9ee');
      bg.addColorStop(0.78, '#f6efde');
      bg.addColorStop(1, '#b9ad92');
      ctx.fillStyle = bg;
      ctx.fillRect(x, 0, rw, h);
      // the pay line: a warm band behind the middle row
      const band = ctx.createLinearGradient(0, cy - cell / 2, 0, cy + cell / 2);
      band.addColorStop(0, 'rgba(217,185,118,0)');
      band.addColorStop(0.1, 'rgba(217,185,118,0.26)');
      band.addColorStop(0.5, 'rgba(245,230,189,0.36)');
      band.addColorStop(0.9, 'rgba(217,185,118,0.26)');
      band.addColorStop(1, 'rgba(217,185,118,0)');
      ctx.fillStyle = band;
      ctx.fillRect(x, cy - cell / 2, rw, cell);
      const base = Math.floor(r.pos);
      const speed = r.spinning ? Math.abs(r.to - r.pos) : 0;
      const blur = Math.min(1, Math.max(0, (speed - 5) / 14)); // 0 at rest, 1 flat out
      for (let o = -rows; o <= rows + 1; o++) {
        const idx = base + o;
        const sym = r.ring[((idx % RING) + RING) % RING];
        const turn = (idx - r.pos) * arc;
        if (Math.abs(turn) > 1.5) continue;
        const y = cy - Math.sin(turn) * R;
        const facing = Math.cos(turn);
        const centre = Math.abs(idx - r.pos) < 0.02;
        let size = symSize;
        if (flashing && centre && flashMask[i]) size *= 1.08 + beat * 0.08;
        ctx.globalAlpha = (r.spinning ? 1 - blur * 0.45 : centre ? 1 : 0.86) * Math.min(1, facing * 1.6);
        ctx.save();
        ctx.translate(x + rw / 2, y);
        // squashed by the curve of the drum, and smeared along its travel at speed
        ctx.scale(1, facing * (1 + blur * 1.3));
        stamp(sym, 0, 0, size);
        ctx.restore();
        // the joint in the reel strip between this symbol and the next
        const seam = (idx + 0.5 - r.pos) * arc;
        if (Math.abs(seam) < 1.5) {
          ctx.globalAlpha = 0.16 * Math.cos(seam);
          ctx.fillStyle = '#5a4628';
          ctx.fillRect(x, cy - Math.sin(seam) * R - 0.75, rw, 1.5);
        }
      }
      ctx.globalAlpha = 1;
      if (blur > 0.05) {
        ctx.fillStyle = `rgba(255,250,240,${blur * 0.3})`;
        ctx.fillRect(x, 0, rw, h);
      }
      if (teasing && i < 2) {
        const glow = 0.5 + Math.sin(time * 16) * 0.5;
        ctx.strokeStyle = `rgba(227,197,131,${0.45 + glow * 0.5})`;
        ctx.lineWidth = 4 + glow * 3;
        ctx.beginPath();
        ctx.roundRect(x + 3, cy - cell / 2 + 2, rw - 6, cell - 4, 12);
        ctx.stroke();
      }
      if (teasing && i === 2) {
        // the reel still turning gets a hot wash
        ctx.fillStyle = `rgba(229,72,77,${0.08 + Math.sin(time * 16) * 0.05})`;
        ctx.fillRect(x, 0, rw, h);
      }
      // shade the top and bottom so the reel looks curved
      const shade = ctx.createLinearGradient(0, 0, 0, h);
      shade.addColorStop(0, 'rgba(20,12,6,0.9)');
      shade.addColorStop(0.1, 'rgba(40,26,12,0.55)');
      shade.addColorStop(0.32, 'rgba(60,40,20,0)');
      shade.addColorStop(0.68, 'rgba(60,40,20,0)');
      shade.addColorStop(0.9, 'rgba(40,26,12,0.55)');
      shade.addColorStop(1, 'rgba(20,12,6,0.9)');
      ctx.fillStyle = shade;
      ctx.fillRect(x, 0, rw, h);
      // a soft highlight down the left of the drum
      const sheen = ctx.createLinearGradient(x, 0, x + rw, 0);
      sheen.addColorStop(0, 'rgba(60,40,20,0.16)');
      sheen.addColorStop(0.1, 'rgba(255,255,255,0.22)');
      sheen.addColorStop(0.24, 'rgba(255,255,255,0)');
      sheen.addColorStop(0.9, 'rgba(60,40,20,0)');
      sheen.addColorStop(1, 'rgba(60,40,20,0.2)');
      ctx.fillStyle = sheen;
      ctx.fillRect(x, 0, rw, h);
      if (flashing && flashMask[i]) {
        ctx.strokeStyle = `rgba(227,197,131,${0.55 + beat * 0.4})`;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.roundRect(x + 2.5, cy - cell / 2 + 2, rw - 5, cell - 4, 12);
        ctx.stroke();
        ctx.fillStyle = `rgba(255,236,170,${0.12 + beat * 0.08})`;
        ctx.fillRect(x, cy - cell / 2, rw, cell);
      }
      ctx.restore();
    }
    // pay line markers
    const mk = Math.max(8, Math.min(13, cell * 0.11));
    for (const [x, dir] of [[0, 1], [w, -1]]) {
      ctx.beginPath();
      ctx.moveTo(x, cy - mk);
      ctx.lineTo(x + dir * (mk + 2), cy);
      ctx.lineTo(x, cy + mk);
      ctx.closePath();
      ctx.fillStyle = '#e3c583';
      ctx.fill();
      ctx.strokeStyle = '#5e4619';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  resize();
  return { spin, skip, flash, draw, resize, setSprite, get spinning() { return running; }, get teasing() { return teasing; } };
}
