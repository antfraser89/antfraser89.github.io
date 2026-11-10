import { CURRENCY } from './config.js';

const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'Ud', 'Dd', 'Td'];

// Three significant figures, always rounded down so the display never
// promises more cash than the player actually has.
export function fmt(n) {
  if (!Number.isFinite(n)) return '∞';
  if (n < 0) return '-' + fmt(-n);
  if (n < 1000) {
    if (n >= 100 || Number.isInteger(n)) return String(Math.floor(n));
    const s = (Math.floor(n * 10) / 10).toFixed(1);
    return s.endsWith('.0') ? s.slice(0, -2) : s;
  }
  let tier = Math.floor(Math.log10(n) / 3);
  let v = n / Math.pow(10, tier * 3);
  if (v >= 1000) { v /= 1000; tier++; } // log10 rounding at exact powers
  if (v < 1) { v *= 1000; tier--; }
  if (tier >= SUFFIX.length) return n.toExponential(2).replace('+', '');
  let s;
  if (v >= 100) s = String(Math.floor(v));
  else if (v >= 10) s = (Math.floor(v * 10) / 10).toFixed(1);
  else s = (Math.floor(v * 100) / 100).toFixed(2);
  return s + SUFFIX[tier];
}

export const money = (n) => CURRENCY + fmt(n);

export function fmtTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm ' + String(s % 60).padStart(2, '0') + 's';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ' + String(m % 60).padStart(2, '0') + 'm';
  return Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
}

export function fmtClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
