// Prüft den Übungskatalog (www/exercises.js) und dass die Migration dazu passt.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WWW = path.join(__dirname, '..', 'www');
// Migrationen mit Katalog-Übungen (erste: exercise_catalog, danach Nachträge)
const MIGRATIONS = ['20261117120000_exercise_catalog.sql', '20261118090000_leg_curls.sql']
  .map(f => path.join(__dirname, '..', 'supabase', 'migrations', f));
const catalogSql = () => MIGRATIONS.map(f => fs.readFileSync(f, 'utf8')).join('\n');

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

test('Migrationen legen jede neue Übung mit Name und Regel aus dem Katalog an', () => {
  const sql = catalogSql();
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

test('Migrationen kennen dieselben Synonyme wie die App', () => {
  const pairs = [];
  for (const sql of MIGRATIONS.map(f => fs.readFileSync(f, 'utf8'))) {
    const block = sql.slice(sql.indexOf('insert into exercise_aliases'), sql.indexOf('on conflict (alias)'));
    pairs.push(...[...block.matchAll(/\('([^']+)', '([^']+)'\)/g)].map(m => [m[1], m[2]]));
  }
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
