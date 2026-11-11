// Sound effects and a little fairground waltz, all synthesised with Web Audio.
// Nothing plays until the player has touched the page (browser autoplay rules).

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// A 16-bar waltz in C. Each bar: [bass note, [two chord notes], [[melody note, beats], ...]]
const C = [48, [64, 67]];
const G7 = [43, [59, 65]];
const Dm = [50, [62, 65]];
const F = [41, [60, 65]];
const Am = [45, [60, 64]];
const WALTZ = [
  [C, [[76, 1], [79, 1], [76, 1]]],
  [C, [[72, 2], [76, 1]]],
  [G7, [[74, 1], [77, 1], [74, 1]]],
  [G7, [[71, 2], [74, 1]]],
  [Dm, [[77, 1], [81, 1], [77, 1]]],
  [G7, [[74, 1], [79, 1], [77, 1]]],
  [C, [[76, 2], [79, 1]]],
  [C, [[72, 3]]],
  [F, [[81, 1], [79, 1], [77, 1]]],
  [F, [[69, 1], [72, 1], [77, 1]]],
  [C, [[79, 1], [76, 1], [72, 1]]],
  [Am, [[76, 2], [72, 1]]],
  [Dm, [[74, 1], [77, 1], [81, 1]]],
  [G7, [[79, 1], [77, 1], [74, 1]]],
  [C, [[72, 1], [76, 1], [79, 1]]],
  [C, [[84, 3]]],
];
const BEAT = 0.36;

export function createAudio(getSettings) {
  let ac = null;
  let sfxBus = null;
  let musicBus = null;
  let scheduler = null;
  let nextBarAt = 0;
  let bar = 0;
  const last = {};

  function ensure() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        ac = new AC();
      } catch {
        return null;
      }
      sfxBus = ac.createGain();
      sfxBus.gain.value = 0.55;
      sfxBus.connect(ac.destination);
      musicBus = ac.createGain();
      musicBus.gain.value = 0;
      const soften = ac.createBiquadFilter();
      soften.type = 'lowpass';
      soften.frequency.value = 2600;
      musicBus.connect(soften);
      soften.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  }

  function tone(freq, { to = freq, type = 'sine', dur = 0.12, vol = 0.2, at = 0, bus = sfxBus, attack = 0.005 } = {}) {
    const t0 = ac.currentTime + at;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(bus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  function noise({ dur = 0.2, vol = 0.2, at = 0, freq = 1200, q = 0.8 } = {}) {
    const t0 = ac.currentTime + at;
    const len = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const filter = ac.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ac.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(sfxBus);
    src.start(t0);
  }

  const arp = (notes, step, opts = {}) => notes.forEach((n, k) => tone(midi(n), { type: 'triangle', dur: 0.16, vol: 0.16, ...opts, at: (opts.at || 0) + k * step }));

  const SFX = {
    click: () => tone(620, { type: 'triangle', dur: 0.04, vol: 0.1 }),
    coin: () => {
      tone(1320, { dur: 0.06, vol: 0.07 });
      tone(1760, { dur: 0.09, vol: 0.07, at: 0.05 });
    },
    go: () => tone(880, { to: 1100, type: 'triangle', dur: 0.14, vol: 0.14 }),
    upgrade: () => tone(520, { to: 820, type: 'triangle', dur: 0.1, vol: 0.14 }),
    build: () => {
      noise({ dur: 0.12, vol: 0.12, freq: 500 });
      arp([72, 76, 79, 84], 0.08);
    },
    hire: () => arp([69, 76], 0.1, { type: 'square', vol: 0.07 }),
    milestone: () => arp([79, 83, 86, 91], 0.07, { vol: 0.15 }),
    claim: () => arp([76, 79, 84], 0.07, { vol: 0.15 }),
    pop: () => {
      noise({ dur: 0.07, vol: 0.3, freq: 1800, q: 0.5 });
      tone(520, { to: 180, dur: 0.1, vol: 0.12 });
    },
    bang: () => {
      noise({ dur: 0.35, vol: 0.16, freq: 700, q: 0.4 });
      tone(140, { to: 50, dur: 0.3, vol: 0.14 });
    },
    whoosh: () => noise({ dur: 0.4, vol: 0.08, freq: 2400, q: 1.5 }),
    // the bell tower: the mallet lands, the puck runs up the rail, the bell rings
    thud: () => {
      noise({ dur: 0.1, vol: 0.3, freq: 420, q: 0.5 });
      tone(150, { to: 60, dur: 0.16, vol: 0.2 });
    },
    rise: () => tone(260, { to: 1250, type: 'triangle', dur: 0.42, vol: 0.07 }),
    bell: () => {
      tone(1568, { dur: 1.1, vol: 0.2, attack: 0.002 });
      tone(2349, { dur: 0.8, vol: 0.09, attack: 0.002 });
      tone(3951, { dur: 0.45, vol: 0.04, attack: 0.002 });
      tone(1568, { dur: 0.9, vol: 0.12, at: 0.16, attack: 0.002 });
    },
    swish: () => noise({ dur: 0.16, vol: 0.045, freq: 3400, q: 0.9 }),
    tour: () => arp([60, 64, 67, 72, 76, 79, 84], 0.09, { dur: 0.3, vol: 0.14 }),
    error: () => tone(170, { type: 'square', dur: 0.09, vol: 0.06 }),
    // the machine
    spin: () => {
      noise({ dur: 0.22, vol: 0.07, freq: 900, q: 0.6 });
      tone(220, { to: 440, type: 'triangle', dur: 0.2, vol: 0.07 });
    },
    tick: () => tone(1500, { type: 'square', dur: 0.018, vol: 0.022 }),
    clunk: () => {
      noise({ dur: 0.06, vol: 0.16, freq: 420, q: 0.7 });
      tone(160, { to: 90, dur: 0.08, vol: 0.14 });
    },
    tease: () => arp([67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84], 0.085, { type: 'square', dur: 0.09, vol: 0.045 }),
    win: () => arp([72, 76, 79, 84], 0.07, { vol: 0.14 }),
    bigwin: () => arp([72, 76, 79, 84, 88, 91, 96], 0.07, { dur: 0.22, vol: 0.15 }),
    jackpot: () => {
      arp([72, 79, 84, 88, 91, 96, 100, 103], 0.075, { dur: 0.3, vol: 0.15 });
      arp([60, 64, 67, 72], 0.15, { type: 'square', dur: 0.4, vol: 0.05 });
    },
    lock: () => {
      tone(900, { to: 1400, type: 'triangle', dur: 0.07, vol: 0.12 });
      noise({ dur: 0.05, vol: 0.14, freq: 2600, q: 2, at: 0.07 });
    },
    token: () => arp([81, 88, 93], 0.06, { vol: 0.12 }),
    fanfare: () => arp([67, 72, 76, 79, 76, 84], 0.085, { type: 'square', dur: 0.16, vol: 0.06 }),
    splat: () => {
      noise({ dur: 0.22, vol: 0.3, freq: 500, q: 0.5 });
      tone(240, { to: 70, dur: 0.2, vol: 0.16 });
    },
    dig: () => {
      noise({ dur: 0.12, vol: 0.16, freq: 1600, q: 0.8 });
      arp([84, 88, 91], 0.05, { vol: 0.1, at: 0.08 });
    },
    card: () => noise({ dur: 0.07, vol: 0.12, freq: 3000, q: 1.2 }),
    cardnew: () => {
      noise({ dur: 0.07, vol: 0.12, freq: 3000, q: 1.2 });
      arp([84, 91], 0.07, { vol: 0.12 });
    },
    pack: () => {
      noise({ dur: 0.3, vol: 0.1, freq: 2200, q: 0.9 });
      tone(300, { to: 900, type: 'triangle', dur: 0.3, vol: 0.08 });
    },
  };
  const MIN_GAP = { coin: 0.11, bang: 0.16, upgrade: 0.05, click: 0.03, tick: 0.045, clunk: 0.05 };

  function play(name) {
    if (!getSettings().sfx || !SFX[name]) return;
    if (!ac || ac.state !== 'running') return; // stay silent until unlocked
    const now = ac.currentTime;
    if (last[name] !== undefined && now - last[name] < (MIN_GAP[name] || 0)) return;
    last[name] = now;
    SFX[name]();
  }

  function scheduleBar(index, t0) {
    const [[bass, chord], melody] = WALTZ[index % WALTZ.length];
    const note = (n, at, dur, vol, type) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type;
      osc.frequency.value = midi(n);
      gain.gain.setValueAtTime(0.0001, t0 + at);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + at + 0.015);
      gain.gain.exponentialRampToValueAtTime(vol * 0.45, t0 + at + dur * 0.6);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      osc.connect(gain);
      gain.connect(musicBus);
      osc.start(t0 + at);
      osc.stop(t0 + at + dur + 0.03);
    };
    note(bass, 0, BEAT * 1.1, 0.5, 'triangle');
    for (const beat of [1, 2]) for (const n of chord) note(n, beat * BEAT, BEAT * 0.55, 0.16, 'triangle');
    let at = 0;
    for (const [n, beats] of melody) {
      note(n, at * BEAT, beats * BEAT * 0.92, 0.2, 'square');
      note(n + 12, at * BEAT, beats * BEAT * 0.5, 0.05, 'sine');
      at += beats;
    }
  }

  function pump() {
    if (!ac || ac.state !== 'running') return;
    if (nextBarAt < ac.currentTime) nextBarAt = ac.currentTime + 0.08;
    while (nextBarAt < ac.currentTime + 0.5) {
      scheduleBar(bar++, nextBarAt);
      nextBarAt += BEAT * 3;
    }
  }

  // Bring the music in line with the settings (and with tab visibility).
  function sync() {
    if (!ac) return;
    const on = getSettings().music && !document.hidden;
    musicBus.gain.cancelScheduledValues(ac.currentTime);
    musicBus.gain.setTargetAtTime(on ? 0.085 : 0, ac.currentTime, 0.25);
    if (on && !scheduler) {
      scheduler = setInterval(pump, 120);
    } else if (!on && scheduler) {
      clearInterval(scheduler);
      scheduler = null;
    }
  }

  function unlock() {
    if (!ensure()) return;
    sync();
  }

  return { play, unlock, sync };
}
