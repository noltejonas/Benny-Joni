// Prüft die Übersetzungen in www/ (genutzt von tests/i18n.test.cjs und von Hand).
//
//   node tools/i18n-check.cjs                 alle Dateien, Wörterbuch en
//   node tools/i18n-check.cjs www/feed.jsx    nur diese Dateien
//   node tools/i18n-check.cjs --dict x.json   zusätzliche Einträge (Entwurf) mitprüfen
//
// Meldet:
//   missing    tr/trn/trc-Schlüssel ohne englischen Eintrag
//   mismatch   Platzhalter im Eintrag passen nicht zum Schlüssel, Mehrzahl ohne one/other
//   dynamic    Schlüssel ist kein fester Text (muss ein Literal sein)
//   german     Text im Code, der nach Deutsch ohne tr() aussieht
//   unused     Einträge im Wörterbuch, die kein Code mehr nutzt (nur bei allen Dateien)
// Absichtlich unübersetzte Stellen: Kommentar mit `i18n-ignore` in derselben oder
// der Zeile davor.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parse } = require('@babel/parser');

const ROOT = path.join(__dirname, '..');
const WWW = path.join(ROOT, 'www');
const SKIP_FILES = new Set(['i18n.js', 'tweaks-panel.jsx']);
const TR_FUNCS = new Set(['tr', 'trn', 'trc']);

function sourceFiles() {
  return fs.readdirSync(WWW)
    .filter(f => /\.(js|jsx)$/.test(f) && !SKIP_FILES.has(f))
    .map(f => path.join(WWW, f));
}

// ─── Wörterbuch ─────────────────────────────────────────────────────────────
function loadDict(lang = 'en', extraJson = []) {
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  for (const f of ['i18n.js', `i18n/${lang}.js`]) {
    vm.runInContext(fs.readFileSync(path.join(WWW, f), 'utf8'), ctx, { filename: f });
  }
  const dict = Object.assign({}, ctx.PTi18n._dicts[lang] || {});
  for (const j of extraJson) Object.assign(dict, JSON.parse(fs.readFileSync(j, 'utf8')));
  return dict;
}

// ─── Heuristik „sieht nach deutschem Text aus“ ─────────────────────────────
const GERMAN_WORDS = new Set(('der die das den dem des ein eine einen einem einer und oder aber nicht noch nur mit für von zu zum zur ist sind war wird werden hat haben hast bist du dich dir dein deine deinen deiner ihr ihre euch euer eure wir uns unser sie es er man kein keine keinen hier jetzt heute gestern morgen alle alles schon wieder mehr weniger ab bis auf aus bei nach über unter vor wie was wer wo wenn dann damit dass also auch nichts etwas gibt gib bitte neu neue neuen neuer neues tag tage tagen woche wochen satz sätze ziel ziele fertig erledigt geschafft offen läuft starten beitreten einladen speichern abbrechen löschen zurück weiter fehler gerade sonst lade mal pro im am vom ins beim').split(/\s+/));
const KEY_NAMES = new Set(['Enter', 'Escape', 'Backspace', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Bearer', 'Content-Type', 'Authorization', 'POST', 'GET', 'INSERT', 'UPDATE', 'DELETE']);
const VISIBLE_ATTRS = new Set(['title', 'placeholder', 'aria-label', 'alt', 'label', 'aria-description', 'aria-valuetext']);
const TECH_ATTRS = new Set(['className', 'key', 'id', 'type', 'role', 'href', 'src', 'name', 'htmlFor', 'autoComplete', 'autoCapitalize', 'autoCorrect', 'inputMode', 'enterKeyHint', 'pattern', 'mode', 'style', 'viewBox', 'd', 'fill', 'stroke', 'icon', 'tone', 'variant', 'kind', 'size', 'color', 'accept', 'capture', 'rel', 'target', 'method', 'lang', 'dir', 'spellCheck', 'aria-hidden', 'aria-live', 'aria-labelledby', 'aria-controls', 'aria-checked', 'aria-pressed', 'aria-expanded', 'aria-current', 'transform', 'textAnchor', 'dominantBaseline', 'strokeLinecap', 'strokeLinejoin', 'fontWeight', 'fontFamily', 'xmlns', 'preserveAspectRatio', 'clipPath', 'mask', 'filter', 'gradientUnits', 'offset', 'stopColor', 'points', 'page', 'value', 'defaultValue', 'emoji']);

function looksGerman(text, { anyLetters = false } = {}) {
  const s = String(text).trim();
  if (!/[A-Za-zÄÖÜäöüß]/.test(s)) return false;
  if (KEY_NAMES.has(s)) return false;
  if (/[äöüÄÖÜß„“]/.test(s)) return true;
  if (/^(https?:|mailto:|projektterminator:|data:|#|\.|\/)/.test(s)) return false;
  if (anyLetters) return true;
  // CSS, Pfade, Bezeichner
  if (/(var\(|rgba?\(|px\b|\d%|--|=>|;|\{|\}|\[|\])/.test(s)) return false;
  if (/^[\w.:-]+$/.test(s) && !/^[A-ZÄÖÜ][a-zäöüß]{2,}$/.test(s)) return false;
  const words = s.toLowerCase().split(/[^a-zäöüß]+/).filter(Boolean);
  if (words.some(w => GERMAN_WORDS.has(w))) return true;
  if (/^[A-ZÄÖÜ][a-zäöüß]{2,}([ -][A-Za-zÄÖÜäöüß]+)*[.!?…]?$/.test(s)) return true;
  return false;
}

// ─── AST ────────────────────────────────────────────────────────────────────
function parseFile(file) {
  const src = fs.readFileSync(file, 'utf8');
  const ast = parse(src, {
    sourceType: 'script', allowReturnOutsideFunction: true, errorRecovery: false,
    plugins: ['jsx', 'optionalChaining', 'nullishCoalescingOperator', 'classProperties', 'topLevelAwait'],
  });
  const ignoreLines = new Set();
  for (const c of ast.comments || []) {
    if (c.value.includes('i18n-ignore')) {
      for (let l = c.loc.start.line; l <= c.loc.end.line + 1; l++) ignoreLines.add(l);
    }
  }
  return { ast, ignoreLines };
}

function placeholders(text) {
  return (String(text).match(/\{\w+\}/g) || []).map(s => s.slice(1, -1)).sort();
}

function literalValue(node) {
  if (!node) return null;
  if (node.type === 'StringLiteral') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0].value.cooked;
  return null;
}

function attrName(n) {
  return n.type === 'JSXNamespacedName' ? `${n.namespace.name}:${n.name.name}` : n.name;
}

function scanFile(file) {
  const rel = path.relative(ROOT, file);
  const { ast, ignoreLines } = parseFile(file);
  const calls = [];
  const problems = [];
  const german = [];
  const ignored = (node) => ignoreLines.has(node.loc.start.line);

  function flag(node, text) {
    if (!ignored(node)) german.push({ file: rel, line: node.loc.start.line, text: String(text).trim().replace(/\s+/g, ' ') });
  }

  function walk(node, parent, ctx) {
    if (!node || typeof node.type !== 'string') return;
    switch (node.type) {
      case 'CallExpression': {
        const c = node.callee;
        if (c.type === 'MemberExpression' && c.object.type === 'Identifier' && c.object.name === 'console') return;
        const name = c.type === 'Identifier' ? c.name
          : (c.type === 'MemberExpression' && c.object.name === 'PTi18n' && c.property.name) || null;
        if (TR_FUNCS.has(name)) {
          const line = node.loc.start.line;
          const a = node.arguments;
          if (name === 'tr' || name === 'trc') {
            const ctxArg = name === 'trc' ? literalValue(a[0]) : null;
            const textArg = name === 'trc' ? a[1] : a[0];
            const key = literalValue(textArg);
            if (key == null || (name === 'trc' && ctxArg == null)) {
              if (!ignored(node)) problems.push({ kind: 'dynamic', file: rel, line, msg: `${name}() braucht feste Texte` });
            } else {
              calls.push({ fn: name, file: rel, line, key: name === 'trc' ? `${ctxArg}|${key}` : key, text: key });
            }
            for (const arg of a.slice(name === 'trc' ? 2 : 1)) walk(arg, node, ctx);
          } else {
            const one = literalValue(a[1]);
            const other = literalValue(a[2]);
            if (one == null || other == null) {
              if (!ignored(node)) problems.push({ kind: 'dynamic', file: rel, line, msg: 'trn() braucht feste Texte für Einzahl und Mehrzahl' });
            } else {
              calls.push({ fn: 'trn', file: rel, line, key: other, one, other });
            }
            walk(a[0], node, ctx);
            for (const arg of a.slice(3)) walk(arg, node, ctx);
          }
          return;
        }
        break;
      }
      case 'ImportDeclaration':
      case 'TaggedTemplateExpression':
        return;
      case 'BinaryExpression':
        if (['===', '!==', '==', '!=', 'in', 'instanceof'].includes(node.operator)) return;
        break;
      case 'SwitchCase':
        for (const s of node.consequent) walk(s, node, ctx);
        return;
      case 'ObjectProperty':
        if (node.computed) walk(node.key, node, ctx);
        walk(node.value, node, ctx);
        return;
      case 'MemberExpression':
      case 'OptionalMemberExpression':
        walk(node.object, node, ctx);
        if (node.computed && node.property.type !== 'StringLiteral') walk(node.property, node, ctx);
        return;
      case 'JSXAttribute': {
        const n = attrName(node.name);
        if (TECH_ATTRS.has(n) || /^data-/.test(n)) {
          // Werte technischer Attribute ignorieren, Ausdrücke darin trotzdem prüfen (z. B. Funktionen)
          if (node.value?.type === 'JSXExpressionContainer' && n !== 'className' && n !== 'style') walk(node.value.expression, node, ctx);
          return;
        }
        if (node.value?.type === 'StringLiteral') {
          if (looksGerman(node.value.value, { anyLetters: VISIBLE_ATTRS.has(n) })) flag(node.value, node.value.value);
          return;
        }
        if (node.value) walk(node.value, node, Object.assign({}, ctx, { visibleAttr: VISIBLE_ATTRS.has(n) }));
        return;
      }
      case 'JSXText':
        if (/[A-Za-zÄÖÜäöüß]/.test(node.value)) flag(node, node.value);
        return;
      case 'StringLiteral':
        if (parent && (parent.type === 'ObjectProperty' && parent.key === node)) return;
        if (looksGerman(node.value, { anyLetters: !!ctx.visibleAttr })) flag(node, node.value);
        return;
      case 'TemplateLiteral': {
        const text = node.quasis.map(q => q.value.cooked).join('{…}');
        if (looksGerman(text.replace(/\{…\}/g, ' '), { anyLetters: !!ctx.visibleAttr })) flag(node, text);
        for (const e of node.expressions) walk(e, node, ctx);
        return;
      }
      default:
        break;
    }
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'start' || k === 'end' || k === 'leadingComments' || k === 'trailingComments' || k === 'innerComments' || k === 'extra') continue;
      const v = node[k];
      if (Array.isArray(v)) v.forEach(x => x && typeof x.type === 'string' && walk(x, node, ctx));
      else if (v && typeof v.type === 'string') walk(v, node, ctx);
    }
  }

  walk(ast.program, null, {});
  return { calls, problems, german };
}

function check({ files = sourceFiles(), lang = 'en', extraJson = [] } = {}) {
  const dict = loadDict(lang, extraJson);
  const all = { calls: [], problems: [], german: [] };
  for (const f of files) {
    const r = scanFile(path.resolve(f));
    all.calls.push(...r.calls);
    all.problems.push(...r.problems);
    all.german.push(...r.german);
  }
  for (const c of all.calls) {
    const has = Object.prototype.hasOwnProperty.call(dict, c.key);
    const v = has ? dict[c.key] : undefined;
    const where = { file: c.file, line: c.line };
    if (!has) { all.problems.push({ kind: 'missing', ...where, msg: JSON.stringify(c.key) }); continue; }
    if (c.fn === 'trn') {
      if (!v || typeof v !== 'object' || typeof v.one !== 'string' || typeof v.other !== 'string') {
        all.problems.push({ kind: 'mismatch', ...where, msg: `${JSON.stringify(c.key)}: Mehrzahl braucht { one, other }` });
        continue;
      }
      const want = [...new Set([...placeholders(c.other), 'n'])].sort().join(',');
      for (const form of Object.keys(v)) {
        const got = [...new Set(placeholders(v[form]))].sort().join(',');
        // Einzahl darf {n} weglassen („one day left“)
        const ok = got === want || (form === 'one' && got === want.split(',').filter(x => x !== 'n').join(','));
        if (!ok) all.problems.push({ kind: 'mismatch', ...where, msg: `${JSON.stringify(c.key)} (${form}): Platzhalter {${got}} statt {${want}}` });
      }
    } else {
      if (typeof v !== 'string') { all.problems.push({ kind: 'mismatch', ...where, msg: `${JSON.stringify(c.key)}: Eintrag muss Text sein` }); continue; }
      const want = [...new Set(placeholders(c.text))].sort().join(',');
      const got = [...new Set(placeholders(v))].sort().join(',');
      if (want !== got) all.problems.push({ kind: 'mismatch', ...where, msg: `${JSON.stringify(c.key)}: Platzhalter {${got}} statt {${want}}` });
    }
  }
  const used = new Set(all.calls.map(c => c.key));
  const unused = Object.keys(dict).filter(k => !used.has(k));
  return { ...all, dict, unused };
}

module.exports = { check, looksGerman, scanFile, sourceFiles, loadDict };

if (require.main === module) {
  const args = process.argv.slice(2);
  const extraJson = [];
  const files = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dict') extraJson.push(args[++i]);
    else files.push(args[i]);
  }
  const r = check({ files: files.length ? files : undefined, extraJson });
  const out = (label, list) => {
    if (!list.length) return;
    console.log(`\n${label} (${list.length})`);
    for (const p of list) console.log(`  ${p.file}:${p.line}  ${p.msg ?? p.text}`);
  };
  for (const kind of ['dynamic', 'missing', 'mismatch']) out(kind, r.problems.filter(p => p.kind === kind));
  out('german', r.german);
  if (!files.length && r.unused.length) {
    console.log(`\nunused (${r.unused.length})`);
    for (const k of r.unused) console.log(`  ${JSON.stringify(k)}`);
  }
  const bad = r.problems.length + r.german.length + (files.length ? 0 : r.unused.length);
  console.log(`\n${r.calls.length} Übersetzungsaufrufe, ${bad ? bad + ' Befunde' : 'alles übersetzt'}`);
  process.exitCode = bad ? 1 : 0;
}
