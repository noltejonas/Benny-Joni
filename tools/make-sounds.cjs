// Erzeugt die Töne in www/sounds/ (WAV, 44,1 kHz, stereo, 16 Bit).
//   node tools/make-sounds.cjs
// Alles synthetisch (808-Bass, Riser, Clap, Synth-Akkord, Glitzer, Hall), kein
// Asset aus fremden Quellen, deshalb reproduzierbar und lizenzfrei. Zufall läuft
// über einen festen Seed, jeder Lauf ergibt dieselben Dateien.
const fs = require('node:fs');
const path = require('node:path');

const RATE = 44100;
const TAU = 2 * Math.PI;

let seed = 0x5eed;
function rnd() { // xorshift, -1..1
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
  return ((seed >>> 0) / 4294967295) * 2 - 1;
}

function track(seconds) {
  const n = Math.ceil(seconds * RATE);
  return { L: new Float32Array(n), R: new Float32Array(n), n };
}
const idx = (t) => Math.floor(t * RATE);
const note = (semis) => 440 * Math.pow(2, (semis - 9) / 12); // 0 = C4

// 808: Sinus mit fallender Tonhöhe, Klick vorn, langer Ausklang
function boom(tr, at, { from = 140, to = 42, decay = 0.9, gain = 1 } = {}) {
  const s0 = idx(at), n = idx(decay * 1.6);
  let phase = 0;
  for (let i = 0; i < n && s0 + i < tr.n; i++) {
    const t = i / RATE;
    const f = to + (from - to) * Math.exp(-t * 28);
    phase += TAU * f / RATE;
    const env = Math.min(1, t / 0.002) * Math.exp(-t / decay * 2.2);
    const click = t < 0.004 ? rnd() * (1 - t / 0.004) * 0.5 : 0;
    const v = (Math.tanh(Math.sin(phase) * 2.2) * env + click) * gain;
    tr.L[s0 + i] += v; tr.R[s0 + i] += v;
  }
}

// Clap: drei kurze Rauschstöße, dann ein Schwanz
function clap(tr, at, gain = 0.6) {
  const s0 = idx(at), n = idx(0.35);
  let lp = 0, hpPrev = 0, hpOut = 0;
  for (let i = 0; i < n && s0 + i < tr.n; i++) {
    const t = i / RATE;
    const bursts = [0, 0.011, 0.022].reduce((a, b) => a + (t >= b ? Math.exp(-(t - b) * 180) : 0), 0);
    const env = Math.min(1, bursts) * 0.8 + Math.exp(-t * 14) * 0.35;
    const x = rnd();
    lp += (x - lp) * 0.55;                 // grob Bandpass um ~1,5 kHz
    hpOut = 0.92 * (hpOut + lp - hpPrev); hpPrev = lp;
    const v = hpOut * env * gain;
    tr.L[s0 + i] += v * 0.9; tr.R[s0 + i] += v;
  }
}

// Riser: Rauschen mit aufgehendem Filter plus steigender Ton bis zum Drop
function riser(tr, from, to, gain = 0.35) {
  const s0 = idx(from), n = idx(to - from);
  let lpL = 0, lpR = 0, phase = 0;
  for (let i = 0; i < n && s0 + i < tr.n; i++) {
    const p = i / n;
    const cut = 0.02 + 0.6 * p * p;
    lpL += (rnd() - lpL) * cut; lpR += (rnd() - lpR) * cut;
    const f = 180 * Math.pow(8, p);
    phase += TAU * f / RATE;
    const amp = Math.pow(p, 1.8) * gain;
    const tone = Math.sin(phase) * 0.25 * p;
    tr.L[s0 + i] += (lpL * 1.4 + tone) * amp;
    tr.R[s0 + i] += (lpR * 1.4 + tone) * amp;
  }
}

// Breiter Synth-Akkord: verstimmte Sägezähne (bandbegrenzt), Filter öffnet
// beim Anschlag, Pumpen im Takt des Basses (sidechain), links/rechts verteilt.
function stab(tr, at, semis, { dur = 1.2, gain = 0.22, pumpAt = [], open = 1 } = {}) {
  const s0 = idx(at), n = idx(dur);
  const voices = [-0.12, -0.05, 0, 0.05, 0.12];
  const buf = new Float32Array(n * 2);
  for (const st of semis) {
    for (let v = 0; v < voices.length; v++) {
      const f = note(st + voices[v]);
      const pan = (v / (voices.length - 1)) * 2 - 1;
      const gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
      const H = Math.min(28, Math.floor(15000 / f));
      const ph0 = Math.abs(rnd()) * TAU;
      for (let i = 0; i < n; i++) {
        const t = i / RATE;
        let s = 0;
        for (let k = 1; k <= H; k++) s += Math.sin(ph0 + TAU * f * k * t) / k;
        buf[i * 2] += s * gl; buf[i * 2 + 1] += s * gr;
      }
    }
  }
  let lpL = 0, lpR = 0;
  for (let i = 0; i < n && s0 + i < tr.n; i++) {
    const t = i / RATE;
    const cut = 0.04 + 0.5 * open * Math.exp(-t * 5);
    lpL += (buf[i * 2] - lpL) * cut; lpR += (buf[i * 2 + 1] - lpR) * cut;
    let pump = 1;
    for (const p of pumpAt) { const d = at + t - p; if (d >= 0) pump = Math.min(pump, 1 - 0.75 * Math.exp(-d * 9)); }
    const env = Math.min(1, t / 0.008) * Math.exp(-t / dur * 2.4) * pump * gain / semis.length;
    tr.L[s0 + i] += lpL * env; tr.R[s0 + i] += lpR * env;
  }
}

// Glitzer: kurze Glocken, abwechselnd links und rechts
function sparkle(tr, at, semis, { step = 0.06, gain = 0.28, dur = 0.6 } = {}) {
  semis.forEach((st, j) => {
    const f = note(st), s0 = idx(at + j * step), n = idx(dur);
    const pan = j % 2 ? 0.75 : 0.25;
    for (let i = 0; i < n && s0 + i < tr.n; i++) {
      const t = i / RATE;
      const v = (Math.sin(TAU * f * t) + 0.5 * Math.sin(TAU * f * 2.01 * t) + 0.25 * Math.sin(TAU * f * 3.99 * t))
        * Math.min(1, t / 0.003) * Math.exp(-t * 7) * gain;
      tr.L[s0 + i] += v * (1 - pan) * 1.4; tr.R[s0 + i] += v * pan * 1.4;
    }
  });
}

// Funkeln: hochgefiltertes Rauschen, das ausklingt (Konfetti-Gefühl)
function shimmer(tr, at, dur, gain = 0.08) {
  const s0 = idx(at), n = idx(dur);
  let pL = 0, pR = 0, oL = 0, oR = 0;
  for (let i = 0; i < n && s0 + i < tr.n; i++) {
    const t = i / RATE;
    const xL = rnd(), xR = rnd();
    oL = 0.97 * (oL + xL - pL); pL = xL; oR = 0.97 * (oR + xR - pR); pR = xR;
    const env = Math.min(1, t / 0.05) * Math.exp(-t / dur * 3) * gain;
    tr.L[s0 + i] += oL * env; tr.R[s0 + i] += oR * env;
  }
}

// Hall: Kammfilter plus Allpass je Kanal (Schroeder), nur auf den Rest gemischt
function reverb(tr, mix = 0.22) {
  const run = (x, combs, aps) => {
    const out = new Float32Array(x.length);
    for (const [d, g] of combs) {
      const b = new Float32Array(d); let p = 0, lp = 0;
      for (let i = 0; i < x.length; i++) {
        const y = b[p]; lp = lp + (y - lp) * 0.35; b[p] = x[i] + lp * g; p = (p + 1) % d; out[i] += y;
      }
    }
    for (const d of aps) {
      const b = new Float32Array(d); let p = 0;
      for (let i = 0; i < out.length; i++) { const y = b[p]; const v = out[i] + y * 0.5; b[p] = v; out[i] = y - v * 0.5; p = (p + 1) % d; }
    }
    return out;
  };
  const wl = run(tr.L, [[1557, 0.82], [1617, 0.81], [1491, 0.83], [1422, 0.84]], [225, 556]);
  const wr = run(tr.R, [[1580, 0.82], [1640, 0.81], [1514, 0.83], [1445, 0.84]], [248, 579]);
  for (let i = 0; i < tr.n; i++) { tr.L[i] += wl[i] * mix * 0.25; tr.R[i] += wr[i] * mix * 0.25; }
}

function master(tr, { drive = 1.6 } = {}) {
  let peak = 0;
  for (let i = 0; i < tr.n; i++) {
    const fade = Math.min(1, (tr.n - i) / (0.08 * RATE));
    tr.L[i] = Math.tanh(tr.L[i] * drive) * fade; tr.R[i] = Math.tanh(tr.R[i] * drive) * fade;
    peak = Math.max(peak, Math.abs(tr.L[i]), Math.abs(tr.R[i]));
  }
  const g = 0.93 / (peak || 1);
  const pcm = Buffer.alloc(tr.n * 4);
  for (let i = 0; i < tr.n; i++) {
    pcm.writeInt16LE(Math.round(tr.L[i] * g * 32767), i * 4);
    pcm.writeInt16LE(Math.round(tr.R[i] * g * 32767), i * 4 + 2);
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + pcm.length, 4); head.write('WAVE', 8);
  head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(2, 22);
  head.writeUInt32LE(RATE, 24); head.writeUInt32LE(RATE * 4, 28); head.writeUInt16LE(4, 32); head.writeUInt16LE(16, 34);
  head.write('data', 36); head.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([head, pcm]);
}

// C-Dur-Bausteine (Halbtöne ab C4)
const CHORD = [0, 4, 7, 12];      // C E G C
const CHORD_HI = [12, 16, 19, 24];
const ARP = [12, 16, 19, 24, 28, 31, 36];

const sounds = {
  // Erster Satz: Bass-Punch, heller Akkord, schneller Glitzer-Lauf nach oben
  'first-log': () => {
    const tr = track(1.6);
    boom(tr, 0, { from: 160, to: 48, decay: 0.55, gain: 1 });
    clap(tr, 0.005, 0.45);
    stab(tr, 0, CHORD_HI, { dur: 0.9, gain: 0.5, pumpAt: [0] });
    sparkle(tr, 0.05, [24, 28, 31, 36], { step: 0.055, gain: 0.3, dur: 0.7 });
    shimmer(tr, 0.05, 1.2, 0.07);
    reverb(tr, 0.25);
    return master(tr, { drive: 1.5 });
  },
  // Wochenziel geknackt: Riser, Drop mit 808 und Clap, Akkord pumpt, Fanfare oben
  'goal-reached': () => {
    const tr = track(3.4);
    const drop = 0.55;
    riser(tr, 0, drop, 0.4);
    sparkle(tr, 0.12, [7, 12, 16, 19], { step: 0.1, gain: 0.18, dur: 0.4 });
    boom(tr, drop, { from: 150, to: 41, decay: 1.2, gain: 1.1 });
    clap(tr, drop, 0.6);
    boom(tr, drop + 0.46, { from: 120, to: 44, decay: 0.5, gain: 0.7 });
    clap(tr, drop + 0.46, 0.4);
    stab(tr, drop, CHORD, { dur: 2.2, gain: 0.55, pumpAt: [drop, drop + 0.46] });
    stab(tr, drop, CHORD_HI, { dur: 2.0, gain: 0.32, pumpAt: [drop, drop + 0.46] });
    sparkle(tr, drop + 0.02, ARP, { step: 0.07, gain: 0.26, dur: 0.8 });
    shimmer(tr, drop, 2.4, 0.09);
    reverb(tr, 0.3);
    return master(tr, { drive: 1.7 });
  },
  // Wochensieg (Saltos): zwei Drops, zweiter einen Ganzton höher, langer Glitzer
  'victory': () => {
    const tr = track(4.6);
    const d1 = 0.6, d2 = 1.55;
    riser(tr, 0, d1, 0.45);
    boom(tr, d1, { from: 150, to: 41, decay: 0.8, gain: 1.1 });
    clap(tr, d1, 0.6);
    stab(tr, d1, CHORD, { dur: 1.0, gain: 0.5, pumpAt: [d1] });
    sparkle(tr, d1 + 0.02, [12, 16, 19, 24], { step: 0.07, gain: 0.24, dur: 0.6 });
    riser(tr, d1 + 0.45, d2, 0.32);
    boom(tr, d2, { from: 170, to: 46, decay: 1.5, gain: 1.2 });
    clap(tr, d2, 0.7);
    boom(tr, d2 + 0.42, { from: 130, to: 46, decay: 0.45, gain: 0.7 });
    boom(tr, d2 + 0.84, { from: 130, to: 46, decay: 0.45, gain: 0.6 });
    clap(tr, d2 + 0.42, 0.4); clap(tr, d2 + 0.84, 0.4);
    const up = (c) => c.map((s) => s + 2);
    stab(tr, d2, up(CHORD), { dur: 2.8, gain: 0.6, pumpAt: [d2, d2 + 0.42, d2 + 0.84] });
    stab(tr, d2, up(CHORD_HI), { dur: 2.6, gain: 0.34, pumpAt: [d2, d2 + 0.42, d2 + 0.84] });
    sparkle(tr, d2 + 0.02, up(ARP).concat(up([40, 43])), { step: 0.06, gain: 0.26, dur: 0.9 });
    shimmer(tr, d2, 3.0, 0.1);
    reverb(tr, 0.32);
    return master(tr, { drive: 1.8 });
  },
};

const out = path.join(__dirname, '..', 'www', 'sounds');
for (const [name, make] of Object.entries(sounds)) {
  const wav = make();
  fs.writeFileSync(path.join(out, `${name}.wav`), wav);
  console.log(`${name}.wav  ${(wav.length / 1024).toFixed(1)} KB`);
}
