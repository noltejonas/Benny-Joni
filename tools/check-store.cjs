#!/usr/bin/env node
// Offline-Prüfung der Store-Unterlagen; greift auf keine Konten oder Schlüssel zu.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const ready = process.argv.includes('--ready');
const screenshots = process.argv.includes('--screenshots');
const platformArg = process.argv.find(a => a.startsWith('--platform='));
const platform = platformArg ? platformArg.split('=')[1] : 'all';
if (!['all', 'ios', 'android'].includes(platform)) throw new Error('Plattform: ios, android oder all');
const issues = [];
const pending = [];
const read = p => fs.readFileSync(p, 'utf8').trim();
const exists = p => fs.existsSync(p);
const rel = p => path.relative(root, p);
const placeholder = /\[BITTE AUSFÜLLEN|\[TODO|<APP_STORE_ID>|XXXXXXXXXXXXXXXX|TODO[: ]/i;

function walk(dir) {
  if (!exists(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

function textFile(dir, name, limit) {
  const p = path.join(dir, `${name}.txt`);
  if (!exists(p)) { issues.push(`${rel(p)} fehlt`); return ''; }
  const text = read(p);
  if (!text) issues.push(`${rel(p)} ist leer`);
  if (placeholder.test(text)) pending.push(`${rel(p)} enthält einen Platzhalter`);
  const chars = Array.from(text).length;
  if (limit && chars > limit) issues.push(`${rel(p)}: ${chars}/${limit} Zeichen`);
  if (name === 'keywords' && Buffer.byteLength(text) > 100) issues.push(`${rel(p)}: über 100 Byte`);
  return text;
}

function imageSize(p) {
  const b = fs.readFileSync(p);
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), alpha: [4, 6].includes(b[25]) };
  }
  if (b[0] !== 255 || b[1] !== 216) throw new Error('kein PNG/JPEG');
  let i = 2;
  while (i + 8 < b.length) {
    if (b[i] !== 255) { i++; continue; }
    const marker = b[i + 1];
    if (marker === 255) { i++; continue; }
    if ([0xd8, 0xd9, 0x01].includes(marker) || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    if (marker === 0xda) break;
    const len = b.readUInt16BE(i + 2);
    if (len < 2) break;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5), alpha: false };
    }
    i += len + 2;
  }
  throw new Error('Bildgröße nicht lesbar');
}

function imageFiles(dir) {
  return walk(dir).filter(p => /\.(png|jpe?g)$/i.test(p)).sort();
}

function checkImage(p, allowed, noAlpha = false) {
  try {
    const size = imageSize(p);
    if (!allowed(size)) issues.push(`${rel(p)}: unzulässige Größe ${size.width}×${size.height}`);
    if (noAlpha && size.alpha) issues.push(`${rel(p)}: Alphakanal entfernen`);
  } catch (e) { issues.push(`${rel(p)}: ${e.message}`); }
}

const iosBase = path.join(root, 'ios/App/fastlane/metadata');
const playBase = path.join(root, 'ios/App/fastlane/play-metadata');
if (platform !== 'android') {
  for (const locale of ['de-DE', 'en-GB']) {
    const dir = path.join(iosBase, locale);
    for (const [name, limit] of Object.entries({ name: 30, subtitle: 30, promotional_text: 170, keywords: 100, description: 4000, release_notes: 4000 })) {
      textFile(dir, name, limit);
    }
    for (const name of ['privacy_url', 'support_url', 'marketing_url']) {
      const url = textFile(dir, name);
      try { if (new URL(url).protocol !== 'https:') throw new Error(); }
      catch { issues.push(`${locale}/${name}: gültige HTTPS-URL erforderlich`); }
    }
    if (screenshots) {
      const lang = locale === 'de-DE' ? 'de' : 'en';
      const files = imageFiles(path.join(root, 'docs/launch/screenshots', `iphone-6.9-${lang}`));
      if (!files.length) issues.push(`iOS ${locale}: iPhone-Screenshots fehlen`);
      const sizes = new Set(['1206x2622', '1179x2556', '1290x2796', '1284x2778', '1242x2688', '1320x2868', '1260x2736']);
      files.forEach(p => checkImage(p, s => sizes.has(`${s.width}x${s.height}`), true));
      const counts = {};
      for (const p of files) {
        try {
          const s = imageSize(p), key = `${s.width}x${s.height}`;
          counts[key] = (counts[key] || 0) + 1;
        } catch { /* checkImage meldet beschädigte Dateien */ }
      }
      if (Object.values(counts).some(n => n > 10)) issues.push(`iOS ${locale}: höchstens zehn Screenshots je Auflösung`);
      const required = ['1290x2796', '1284x2778', '1242x2688', '1320x2868', '1260x2736'];
      if (!required.some(size => counts[size])) issues.push(`iOS ${locale}: erforderlicher 6,9-Zoll- oder 6,5-Zoll-Screenshot-Satz fehlt (6,3 Zoll allein reicht nicht)`);
    }
  }
  textFile(iosBase, 'copyright');
  textFile(iosBase, 'primary_category');
}
if (platform !== 'ios') {
  for (const locale of ['de-DE', 'en-GB']) {
    const dir = path.join(playBase, locale);
    for (const [name, limit] of Object.entries({ title: 30, short_description: 80, full_description: 4000 })) textFile(dir, name, limit);
    const changelog = path.join(dir, 'changelogs/default.txt');
    if (!exists(changelog)) issues.push(`${rel(changelog)} fehlt`);
    else if (Array.from(read(changelog)).length > 500) issues.push(`${rel(changelog)}: über 500 Zeichen`);
    if (screenshots) {
      const images = path.join(dir, 'images');
      for (const [name, width, height] of [['icon.png', 512, 512], ['featureGraphic.png', 1024, 500]]) {
        const p = path.join(images, name);
        if (!exists(p)) issues.push(`${rel(p)} fehlt`);
        else checkImage(p, s => s.width === width && s.height === height, name === 'featureGraphic.png');
      }
      const files = imageFiles(path.join(images, 'phoneScreenshots'));
      if (files.length < 2 || files.length > 8) issues.push(`Play ${locale}: 2–8 Telefon-Screenshots erforderlich, gefunden ${files.length}`);
      files.forEach(p => checkImage(p, s => Math.min(s.width, s.height) >= 320 && Math.max(s.width, s.height) <= 3840 && Math.max(s.width, s.height) <= 2 * Math.min(s.width, s.height), true));
    }
  }
}
if (ready) {
  for (const p of walk(path.join(root, 'docs/launch/site')).filter(p => /\.html$/.test(p))) {
    const html = read(p);
    if (placeholder.test(html) || /class=["'][^"']*\bdraft\b/i.test(html)) pending.push(`${rel(p)} ist noch ein Rechts-/Support-Entwurf`);
  }
}
for (const problem of issues) console.error(`FEHLER: ${problem}`);
for (const problem of [...new Set(pending)]) console.error(`${ready ? 'FEHLER' : 'OFFEN'}: ${problem}`);
if (!issues.length && (!ready || !pending.length)) console.log(`Store-Unterlagen geprüft (${platform}${screenshots ? ', Bilder' : ', Texte'}).${pending.length ? ' Offene Platzhalter müssen vor dem Upload ersetzt werden.' : ''}`);
process.exitCode = issues.length || (ready && pending.length) ? 1 : 0;
