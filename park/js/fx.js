// Full-screen flourishes drawn over everything: the coin shower on a big win.
const TAU = Math.PI * 2;

export function createFx(canvas) {
  const ctx = canvas.getContext('2d');
  const parts = [];
  let w = 300;
  let h = 300;
  let dpr = 1;
  let dirty = false;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }

  // Coins tumble down from the top of the screen.
  function rain(count) {
    for (let k = 0; k < count && parts.length < 260; k++) {
      parts.push({
        x: Math.random() * w,
        y: -20 - Math.random() * h * 0.7,
        vx: (Math.random() - 0.5) * 70,
        vy: 240 + Math.random() * 300,
        rot: Math.random() * TAU,
        vr: (Math.random() - 0.5) * 16,
        size: 8 + Math.random() * 10,
        star: Math.random() < 0.12,
      });
    }
  }

  function draw(dt) {
    if (!parts.length) {
      if (dirty) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        dirty = false;
      }
      return;
    }
    dirty = true;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    for (let k = parts.length - 1; k >= 0; k--) {
      const p = parts[k];
      p.vy += 520 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.y > h + 40) {
        parts.splice(k, 1);
        continue;
      }
      const squash = Math.abs(Math.cos(p.rot));
      ctx.save();
      ctx.translate(p.x, p.y);
      if (p.star) {
        ctx.rotate(p.rot * 0.4);
        ctx.fillStyle = '#fbf1d2';
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? p.size * 0.45 : p.size;
          const a = (i * Math.PI) / 5;
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
      } else {
        // a struck gold coin, turning as it falls
        ctx.rotate(p.rot * 0.15);
        const rx = p.size * squash + 1.2;
        ctx.beginPath();
        ctx.ellipse(0, 1.5, rx, p.size, 0, 0, TAU);
        ctx.fillStyle = '#6e4a0c';
        ctx.fill();
        const g = ctx.createLinearGradient(-rx, -p.size, rx, p.size);
        g.addColorStop(0, '#fdeeb5');
        g.addColorStop(0.5, '#e6ba4f');
        g.addColorStop(1, '#a06e16');
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, p.size, 0, 0, TAU);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(0, 0, Math.max(0.5, rx * 0.7), p.size * 0.72, 0, 0, TAU);
        ctx.strokeStyle = 'rgba(110,74,12,0.6)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(-rx * 0.3, -p.size * 0.42, Math.max(0.5, rx * 0.2), p.size * 0.13, 0, 0, TAU);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fill();
      }
      ctx.restore();
    }
  }

  resize();
  return { rain, draw, resize };
}
