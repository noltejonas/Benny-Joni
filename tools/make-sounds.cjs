// Erzeugt die Töne in www/sounds/ (WAV, 22,05 kHz, mono, 16 Bit).
//   node tools/make-sounds.cjs
// Glockenklang aus wenigen Teiltönen mit abklingender Hüllkurve; kein Asset
// aus fremden Quellen, deshalb reproduzierbar und lizenzfrei.
const fs = require('node:fs');
const path = require('node:path');

const RATE = 22050;

function bell(buf, start, freq, dur, gain) {
  const partials = [[1, 1], [2, 0.42], [3, 0.2], [4.2, 0.11], [5.4, 0.05]];
  const s0 = Math.floor(start * RATE);
  const n = Math.floor(dur * RATE);
  for (let i = 0; i < n && s0 + i < buf.length; i++) {
    const t = i / RATE;
    const attack = Math.min(1, t / 0.006);
    let v = 0;
    for (const [mul, amp] of partials) v += amp * Math.sin(2 * Math.PI * freq * mul * t) * Math.exp(-t * (3.2 + mul * 1.6));
    buf[s0 + i] += v * attack * gain;
  }
}

function render(notes, total) {
  const buf = new Float32Array(Math.ceil(total * RATE));
  for (const [start, freq, dur, gain] of notes) bell(buf, start, freq, dur, gain);
  const peak = buf.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
  const pcm = Buffer.alloc(buf.length * 2);
  for (let i = 0; i < buf.length; i++) {
    const fade = Math.min(1, (buf.length - i) / (0.05 * RATE)); // weiches Ende
    pcm.writeInt16LE(Math.round((buf[i] / peak) * 0.8 * fade * 32767), i * 2);
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + pcm.length, 4); head.write('WAVE', 8);
  head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(RATE, 24); head.writeUInt32LE(RATE * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write('data', 36); head.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([head, pcm]);
}

const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5, E6 = 1318.5, G4 = 392;
const sounds = {
  // Erster Satz: kurzer, heller Dur-Lauf
  'first-log': render([[0, C5, 0.7, 0.8], [0.09, E5, 0.7, 0.75], [0.18, G5, 0.8, 0.75], [0.27, C6, 1.0, 0.9]], 1.25),
  // Wochenziel geknackt (celebration.jsx): Fanfare mit Schlussakkord
  'goal-reached': render([
    [0, G4, 0.5, 0.7], [0.12, C5, 0.5, 0.7], [0.24, E5, 0.5, 0.7], [0.36, G5, 0.6, 0.75],
    [0.6, C6, 1.4, 0.9], [0.6, E5, 1.4, 0.5], [0.6, G5, 1.4, 0.5], [0.62, E6, 1.2, 0.35],
  ], 2.0),
};

const out = path.join(__dirname, '..', 'www', 'sounds');
for (const [name, wav] of Object.entries(sounds)) {
  fs.writeFileSync(path.join(out, `${name}.wav`), wav);
  console.log(`${name}.wav  ${(wav.length / 1024).toFixed(1)} KB`);
}
