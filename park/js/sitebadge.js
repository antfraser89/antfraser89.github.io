// The park's eight sites as reel symbols. Each is a round badge cut from the
// park's own painting, with a coloured rim (so three of a kind reads at a
// glance) and the site's level in the corner. A site not built yet is drained
// of colour and has a CLOSED board across it; one in its rush hour glows.
import { SITES, STAGE_W } from './parkview.js';

export const BADGE = 192; // pixels square
export const RIMS = ['#ff5f9e', '#8f63f5', '#f0483e', '#2b8ef0', '#e9a81c', '#5f7896', '#12a898', '#f5801f'];
const FONT = '900 34px "Baloo 2", "Fredoka", "Nunito", system-ui, sans-serif';

const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k)))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
};

// Draw the badge for site k. `art` is the park painting (a loaded image);
// `level` is 0 for a closed site, otherwise what to print in the corner.
export function drawBadge(art, k, { level = 0, max = false, hot = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = BADGE;
  const ctx = canvas.getContext('2d');
  const [cx, cy, r] = [BADGE / 2, BADGE / 2 - 4, 78];
  const rim = RIMS[k % RIMS.length];
  const open = level > 0;

  // a soft shadow to sit on
  ctx.fillStyle = 'rgba(40,24,8,0.22)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + r + 8, r * 0.78, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  if (hot) {
    const glow = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r + 16);
    glow.addColorStop(0, 'rgba(255,196,60,0.95)');
    glow.addColorStop(1, 'rgba(255,120,30,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 16, 0, Math.PI * 2);
    ctx.fill();
  }

  // the picture
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r - 5, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#cfe6ee';
  ctx.fillRect(0, 0, BADGE, BADGE);
  if (art && art.naturalWidth) {
    const [ix, iy, ir] = SITES[k].icon;
    const z = art.naturalWidth / STAGE_W;
    ctx.drawImage(art, (ix - ir) * z, (iy - ir) * z, ir * 2 * z, ir * 2 * z, cx - r, cy - r, r * 2, r * 2);
  }
  if (!open) {
    // closed: no colour, and faded back
    ctx.globalCompositeOperation = 'saturation';
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, BADGE, BADGE);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(226,230,236,0.34)';
    ctx.fillRect(0, 0, BADGE, BADGE);
  }
  // a little depth: light from above, shade below
  const depth = ctx.createLinearGradient(0, cy - r, 0, cy + r);
  depth.addColorStop(0, 'rgba(255,255,255,0.22)');
  depth.addColorStop(0.35, 'rgba(255,255,255,0)');
  depth.addColorStop(1, 'rgba(20,10,0,0.25)');
  ctx.fillStyle = depth;
  ctx.fillRect(0, 0, BADGE, BADGE);
  ctx.restore();

  // the rim
  const ring = ctx.createLinearGradient(0, cy - r, 0, cy + r);
  const base = open ? rim : '#9aa3ad';
  ring.addColorStop(0, shade(base, 0.45));
  ring.addColorStop(0.5, base);
  ring.addColorStop(1, shade(base, -0.35));
  ctx.lineWidth = 12;
  ctx.strokeStyle = ring;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(50,30,10,0.55)';
  ctx.beginPath();
  ctx.arc(cx, cy, r + 1.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(50,30,10,0.35)';
  ctx.beginPath();
  ctx.arc(cx, cy, r - 11.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 3, Math.PI * 1.15, Math.PI * 1.6);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (!open) {
    // the board across a closed site
    ctx.save();
    ctx.translate(cx, cy + 6);
    ctx.rotate(-0.12);
    ctx.fillStyle = 'rgba(40,24,8,0.3)';
    ctx.beginPath();
    ctx.roundRect(-74, -19, 148, 44, 9);
    ctx.fill();
    ctx.fillStyle = '#fff6dd';
    ctx.strokeStyle = '#6a4a22';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(-74, -23, 148, 44, 9);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#7a3b1c';
    ctx.font = FONT.replace('34px', '31px');
    ctx.fillText('CLOSED', 0, 1);
    ctx.restore();
    return canvas;
  }
  // the level, bottom right
  const label = hot ? '×2' : max ? '★' : String(level);
  const [px, py, pr] = [BADGE - 40, BADGE - 46, 31];
  ctx.fillStyle = 'rgba(40,24,8,0.3)';
  ctx.beginPath();
  ctx.arc(px, py + 3, pr, 0, Math.PI * 2);
  ctx.fill();
  const plate = ctx.createLinearGradient(0, py - pr, 0, py + pr);
  const tone = hot ? '#ff7a1a' : max ? '#e9a81c' : rim;
  plate.addColorStop(0, shade(tone, 0.3));
  plate.addColorStop(1, shade(tone, -0.25));
  ctx.fillStyle = plate;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(px, py, pr, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.font = label.length > 2 ? FONT.replace('34px', '27px') : FONT;
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(40,24,8,0.55)';
  ctx.strokeText(label, px, py + 2);
  ctx.fillStyle = '#fff';
  ctx.fillText(label, px, py + 2);
  return canvas;
}
