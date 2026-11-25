// Prüft den Übungskatalog (www/exercises.js) und dass die Migration dazu passt.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WWW = path.join(__dirname, '..', 'www');
const MIGRATION = path.join(__dirname, '..', 'supabase', 'migrations', '20261117120000_exercise_catalog.sql');

function load(lang = null) {
  const ctx = { console };
  ctx.window = ctx;
  if (lang) ctx.localStorage = { getItem: k => (k === 'pt:lang' ? lang : null), setItem() {}, removeItem() {} };
  vm.createContext(ctx);
  const files = ['i18n.js', ...(lang ? [`i18n/${lang}.js`] : []), 'exercises.js', 'data.js'];
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(WWW, f), 'utf8'), ctx, { filename: f });
  return ctx;
}
const ctx = load();
const X = ctx.PTExercises;

test('jede Übung hat Gruppe, Erklärung, Regel und eine Figur', () => {
  const groups = new Set(X.GROUPS.map(g => g.id));
  for (const e of X.LIST) {
    assert.ok(groups.has(e.group), `${e.name}: Gruppe ${e.group}`);
    assert.ok(e.how && e.muscles && e.rule, `${e.name}: Texte`);
    assert.ok(X.figs.includes(e.fig), `${e.name}: Figur ${e.fig}`);
    assert.ok([1, 2, 3].includes(e.level), `${e.name}: Stufe`);
    if (e.group !== 'workout') assert.ok(e.goal > 0, `${e.name}: Wochenziel-Vorschlag`);
  }
  assert.equal(new Set(X.LIST.map(e => e.name)).size, X.LIST.length, 'Namen eindeutig');
});

test('Figuren: endliche Punkte, Gliedmaßen behalten ihre Länge', () => {
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  for (const fig of X.figs) {
    for (const k of [0, 0.3, 0.5, 1]) {
      const p = X.pose(fig, k);
      for (const [key, v] of Object.entries(p)) {
        if (Array.isArray(v)) assert.ok(v.every(Number.isFinite), `${fig}@${k}: ${key}`);
      }
      assert.ok(Math.abs(dist(p.hip, p.sh) - 24) < 0.01, `${fig}: Rumpf`);
      assert.ok(Math.abs(dist(p.sh, p.el) - 13) < 0.01, `${fig}: Oberarm`);
      assert.ok(Math.abs(dist(p.el, p.ha) - 12) < 0.01, `${fig}: Unterarm`);
      assert.ok(Math.abs(dist(p.hip, p.kn) - 17) < 0.01, `${fig}: Oberschenkel`);
      assert.ok(Math.abs(dist(p.kn, p.ft) - 17) < 0.01, `${fig}: Unterschenkel`);
    }
    const box = X.figure(fig).box;
    assert.equal(box.length, 4);
    assert.ok(Math.abs(box[2] / box[3] - X.ASPECT) < 0.01, `${fig}: Seitenverhältnis`);
  }
});

test('match: Synonyme führen zur Standard-Übung, Workouts nie', () => {
  const name = (t) => X.match(t)?.name ?? null;
  assert.equal(name('Squats'), 'Kniebeugen');
  assert.equal(name('  push UPS '), 'Liegestütze');
  assert.equal(name('Push-ups'), 'Liegestütze');
  assert.equal(name('pullups'), 'Klimmzüge');
  assert.equal(name('Calf Raises'), 'Wadenheben');
  assert.equal(name('pike pushups'), 'Pike Push-ups');
  assert.equal(name('Jumping Jacks'), 'Hampelmänner');
  assert.equal(name('Sally'), null);
  assert.equal(name('Tom Holland'), null);
  assert.equal(name('Waden 20kg'), null);
  assert.equal(name('ab'), null);
});

test('metaOf, groupOf und search arbeiten auch mit übersetzten Namen', () => {
  const en = load('en');
  const L = en.PTData.localizeCategory;
  const squat = L({ id: 's', name: 'Kniebeugen', competition_id: null, ranked: true, rule: 'Hüfte mindestens auf Kniehöhe, oben ganz aufrichten.' });
  assert.equal(squat.name, 'Squats');
  assert.equal(squat.base_name, 'Kniebeugen');
  assert.equal(squat.rule, 'Hips at least down to knee height, stand fully upright at the top.');
  assert.equal(en.PTExercises.metaOf(squat).fig, 'squat');
  assert.equal(en.PTExercises.groupOf(squat), 'legs');
  assert.equal(en.PTExercises.groupOf({ name: 'Squats', competition_id: 'c1' }), 'own');
  assert.equal(en.PTExercises.groupOf({ name: 'Bibel lesen', competition_id: null }), 'other');
  const lunge = L({ id: 'l', name: 'Ausfallschritte', competition_id: null });
  assert.equal(lunge.name, 'Lunges');
  const found = en.PTExercises.search([squat, lunge, { id: 'o', name: 'Farmer carry', competition_id: 'c1' }], 'squat');
  assert.deepEqual(found.map(c => c.id), ['s']);
  assert.deepEqual(en.PTExercises.search([squat, lunge], 'kniebeu').map(c => c.id), ['s'], 'deutscher Name findet auch auf Englisch');
});

test('Migration legt jede neue Übung mit Name und Regel aus dem Katalog an', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8');
  // Schon vor der Migration in der Datenbank (monthly_ranking, rank_crunches, challenge_type)
  const existing = new Set(['Liegestütze', 'Klimmzüge', 'Dips', 'Leg Raises', 'HSPU', 'Sit-ups', 'Crunches', 'Burpees',
    'Bring Sally Up', '20-Min-AMRAP']);
  const q = (s) => `'${s.replace(/'/g, "''")}'`;
  for (const e of X.LIST) {
    if (existing.has(e.name)) continue;
    assert.ok(sql.includes(`(${q(e.name)}, ${q(e.emoji)}, 'sports', 'standard', true, 'volume', `), `${e.name} fehlt in der Migration`);
    assert.ok(sql.includes(q(e.rule)), `${e.name}: Regel weicht ab`);
  }
});

test('Migration kennt dieselben Synonyme wie die App', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8');
  const block = sql.slice(sql.indexOf('insert into exercise_aliases'), sql.indexOf('on conflict (alias)'));
  const pairs = [...block.matchAll(/\('([^']+)', '([^']+)'\)/g)].map(m => [m[1], m[2]]);
  const fromSql = Object.fromEntries(pairs);
  for (const e of X.LIST) {
    for (const n of [e.name, ...(e.alias || [])]) {
      const k = X._loose(n);
      if (k.length < 3) continue;
      if (e.group === 'workout') assert.equal(fromSql[k], undefined, `${n}: Workouts ohne Synonym`);
      else assert.equal(fromSql[k], X.match(n)?.name, `${n}`);
    }
  }
});

// ─── Teilübungen (Migration workout_parts) ─────────────────────────────────
test('20-Min-AMRAP: Teilübungen in App und Migration gleich', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20261125120000_workout_parts.sql'), 'utf8');
  const block = sql.slice(sql.indexOf('insert into public.workout_parts'), sql.indexOf('on conflict (workout_id, part_id)'));
  const fromSql = [...block.matchAll(/\('([^']+)', (\d+)\)/g)].map(m => [m[1], Number(m[2])]);
  assert.ok(block.includes("w.name = '20-Min-AMRAP'"));
  const amrap = X.meta('20-Min-AMRAP');
  assert.deepEqual(JSON.parse(JSON.stringify(amrap.parts)), fromSql);
  for (const [name] of amrap.parts) assert.ok(X.meta(name), `${name} ist eine Standard-Übung`);
  // Regel und Erklärung nennen dieselben Zahlen
  assert.ok(amrap.rule.includes('5 Klimmzüge, 10 Liegestütze, 15 Kniebeugen'));
});

test('partsOf: Wiederholungen pro Teilübung für n Runden, sonst leer', () => {
  const cat = { name: '20-Min-AMRAP', competition_id: null };
  assert.deepEqual(JSON.parse(JSON.stringify(X.partsOf(cat, 8).map(p => [p.name, p.reps]))),
    [['Klimmzüge', 40], ['Liegestütze', 80], ['Kniebeugen', 120]]);
  assert.equal(X.partsOf({ name: 'Liegestütze', competition_id: null }, 8).length, 0);
  assert.equal(X.partsOf({ name: '20-Min-AMRAP', competition_id: 'c1' }, 8).length, 0, 'eigene Übung gleichen Namens nicht');
  assert.equal(X.partsOf(null, 8).length, 0);
  // Übersetzte Kategorie (localizeCategory legt base_name ab)
  const en = load('en');
  const loc = en.PTData.localizeCategory({ id: 'x', name: '20-Min-AMRAP', competition_id: null });
  assert.deepEqual(JSON.parse(JSON.stringify(en.PTExercises.partsOf(loc, 2).map(p => [p.label, p.reps]))),
    [['Pull-ups', 10], ['Push-ups', 20], ['Squats', 30]]);
});

test('noteText: Teilsatz-Notiz in der App-Sprache', () => {
  const en = load('en');
  assert.equal(en.PTData.noteText('Teil von: 20-Min-AMRAP'), en.tr('Teil von: {name}', { name: en.PTExercises.meta('20-Min-AMRAP').label }));
  assert.match(en.PTData.noteText('Teil von: 20-Min-AMRAP'), /^Part of: /);
  assert.equal(ctx.PTData.noteText('Teil von: 20-Min-AMRAP'), 'Teil von: 20-Min-AMRAP');
  assert.equal(ctx.PTData.noteText('frei'), 'frei');
});
