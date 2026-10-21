const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(client) {
  const context = { window: { supabase: { createClient: () => client } }, console, setTimeout, clearTimeout };
  vm.createContext(context);
  for (const file of ['i18n.js', 'data.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'www', file), 'utf8'), context, { filename: file });
  }
  return context.window.PTData;
}
const ids = rows => Array.from(rows, row => row.id);

test('alte Work-Daten erscheinen weder in Live- noch Cache-Bundles; Sport-Workouts bleiben erhalten', () => {
  const D = load();
  const categories = [
    { id: 'push', kind: 'sports' },
    { id: 'sally', kind: 'sports', challenge_type: 'bring_sally_up' },
    { id: 'amrap', kind: 'sports', challenge_type: 'tom_holland' },
    { id: 'work', kind: 'work' },
  ];
  const challenges = categories.map(c => ({ id: `ch-${c.id}`, category_id: c.id }));
  const sets = [
    { id: 'push-set', challenge_id: 'ch-push', reps: 20 },
    { id: 'sally-set', challenge_id: 'ch-sally', reps: 180 },
    { id: 'amrap-set', challenge_id: 'ch-amrap', reps: 5 },
    { id: 'work-set', challenge_id: 'ch-work', duration_minutes: 25 },
    { id: 'orphan-work', challenge_id: 'removed', duration_minutes: 30 },
    { id: 'nested-work', category: { kind: 'work' } },
  ];
  const bundle = { categories, challenges, sets, allChallenges: challenges, allSets: sets,
    feed: sets, planSlots: challenges, members: [{ id: 'u1' }] };
  const original = JSON.stringify(bundle);
  const result = D.sportsOnlyBundle(bundle);
  assert.deepEqual(ids(result.categories), ['push', 'sally', 'amrap']);
  for (const key of ['challenges', 'allChallenges', 'planSlots']) {
    assert.deepEqual(ids(result[key]), ['ch-push', 'ch-sally', 'ch-amrap']);
  }
  for (const key of ['sets', 'allSets', 'feed']) {
    assert.deepEqual(ids(result[key]), ['push-set', 'sally-set', 'amrap-set']);
  }
  assert.equal(result.members, bundle.members);
  assert.equal(JSON.stringify(bundle), original, 'gespeicherte Historie bleibt unverändert');
});

test('API kann Work weder beim Erstellen noch durch ein Modul-Update aktivieren', async () => {
  let createArgs;
  let updatePatch;
  let insertedCategory;
  const query = {
    update(patch) { updatePatch = patch; return this; },
    insert(row) { insertedCategory = row; return this; },
    eq() { return this; }, select() { return this; },
    async single() { return { data: { id: 'c1', ...updatePatch }, error: null }; },
  };
  const D = load({
    auth: { onAuthStateChange(callback) { callback('INITIAL_SESSION', { user: { id: 'u1' } }); } },
    async rpc(name, args) { createArgs = args; return { data: 'c1', error: null }; },
    from() { return query; },
  });
  const api = D.init({ url: 'https://example.invalid', key: 'public' });
  await api.createCompetition({ name: 'Sport', mode: '1v1', work: true, rotation: true });
  assert.equal(createArgs.p_work, false);
  assert.equal(createArgs.p_rotation, true);
  const patch = { name: 'Neuer Name', work_enabled: true, penalties_enabled: true };
  await api.updateCompetition('c1', patch);
  assert.equal(updatePatch.work_enabled, false);
  assert.equal(updatePatch.name, patch.name);
  assert.equal(updatePatch.penalties_enabled, true);
  assert.equal(patch.work_enabled, true, 'Aufrufer-Objekt wird nicht verändert');
  await api.forCompetition('c1').addCategory('Eigene Übung', '💪', 'work');
  assert.equal(insertedCategory.kind, 'sports', 'altes drittes Argument aktiviert kein Work mehr');
  assert.equal(insertedCategory.name, 'Eigene Übung');
});
