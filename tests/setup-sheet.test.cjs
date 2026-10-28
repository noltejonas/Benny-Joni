// Exercise the actual SetupSheet event handlers while category reloads are delayed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Babel = require('@babel/standalone');
const { parse } = require('@babel/parser');

const source = fs.readFileSync(path.join(__dirname, '..', 'www/screens.jsx'), 'utf8');
const declaration = parse(source, { sourceType: 'script', plugins: ['jsx'] }).program.body
  .find(node => node.type === 'FunctionDeclaration' && node.id.name === 'SetupSheet');
const compiled = Babel.transform(source.slice(declaration.start, declaration.end), {
  presets: ['react'], configFile: false, babelrc: false,
}).code;

const catalog = [
  { id: 'situps', name: 'Sit-ups', kind: 'sports', challenge_type: 'standard' },
  { id: 'sally', name: 'Bring Sally Up', kind: 'sports', challenge_type: 'bring_sally_up' },
];

function mount({ addCategory, existing = null, otherComps = [] } = {}) {
  const slots = [];
  let cursor = 0;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    Fragment: 'fragment',
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useEffect() { cursor++; },
  };
  const writes = [], alerts = [], creations = [];
  let saved = 0, refreshes = 0;
  function Stepper() {}
  function ObAmount() {}
  function Icon() {}
  const copied = [];
  const ctx = {
    React, useState: React.useState,
    Stepper, ObAmount, Icon, formatWeek: value => value, weekNumber: () => 44, formatDuration: value => String(value),
    GOAL_INPUT_KEY: 'pt:goal-input', UNIT_KIND: { reps: 'sports', minutes: 'time', work: 'work' },
    localStorage: { getItem: () => null, setItem() {} },
    PTi18n: { number: String },
    PTOnboarding: { goalDefault: () => 50, goalChoices: () => [25, 50, 100] },
    tr: text => text, trn: (n, one, other) => n === 1 ? one : other,
    PTData: {
      usesMinutes: cat => ['time', 'work'].includes(cat?.kind),
      exerciseKey: cat => !cat ? null : cat.competition_id == null ? `cat:${cat.id}` : `own:${cat.kind}:${cat.name.trim().toLowerCase()}`,
      fairShareOf: (total, people) => Math.ceil(total / people),
      addDays: iso => iso,
      isWorkoutType: type => ['bring_sally_up', 'tom_holland'].includes(type),
      workoutTargetRuns: challenge => challenge?.target_runs || 1,
    },
    alert: message => alerts.push(message),
  };
  vm.createContext(ctx);
  vm.runInContext(compiled, ctx);
  const props = {
    api: {
      competitionId: 'c1',
      addCategory: async (name, emoji, kind) => {
        creations.push({ name, emoji, kind });
        return addCategory ? addCategory(name, emoji, kind) : { id: 'custom', name, emoji, kind, competition_id: 'c1' };
      },
      upsertChallenge: async payload => { writes.push(JSON.parse(JSON.stringify(payload))); },
    },
    baseApi: { forCompetition: id => ({ upsertChallenge: async payload => copied.push({ id, ...payload }) }) },
    me: 'user-1', categories: catalog, weekStart: '2026-10-26', existing, otherComps,
    onClose() {}, onSaved: () => saved++, onAddCategory: () => refreshes++,
  };
  let tree;
  function render() { cursor = 0; tree = ctx.SetupSheet(props); return tree; }
  function nodes(node) {
    if (!arguments.length) node = tree;
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(nodes);
    return [node, ...nodes(node.props?.children)];
  }
  function text(node) {
    if (Array.isArray(node)) return node.map(text).join('');
    if (node == null || typeof node === 'boolean') return '';
    return typeof node === 'object' ? text(node.props?.children) : String(node);
  }
  const button = name => {
    const found = nodes().find(node => node.type === 'button' && text(node) === name);
    assert.ok(found, `Button ${name} exists`);
    return found;
  };
  const input = () => nodes().find(node => node.type === 'input' && node.props.placeholder === 'Name (z.B. Bibellesen, Planks)');
  function draft(name) {
    button('＋Eigene Übung').props.onClick(); render();
    input().props.onChange({ target: { value: name } }); render();
  }
  render();
  return { render, nodes, button, draft, input, Stepper, writes, copied, creations, alerts,
    get saved() { return saved; }, get refreshes() { return refreshes; } };
}

test('custom name + main Save creates that exercise instead of the preselected Sit-ups', async () => {
  const app = mount();
  app.draft('   Farmer carry   ');
  await app.button('Speichern').props.onClick();
  assert.deepEqual(app.creations, [{ name: 'Farmer carry', emoji: '💪', kind: 'sports' }]);
  assert.equal(app.writes[0]?.category_id, 'custom');
  assert.equal(app.writes[0]?.target_reps, 100);
  assert.equal(app.saved, 1);
});

test('empty custom form cannot save a catalog exercise accidentally', async () => {
  const app = mount();
  app.draft('   ');
  assert.equal(app.button('Speichern').props.disabled, true);
  await app.button('Speichern').props.onClick();
  assert.deepEqual(app.writes, []);
  assert.deepEqual(app.creations, []);
});

test('inline Add keeps the new category selected while parent categories are still stale', async () => {
  let resolve;
  const app = mount({ addCategory: (name, emoji) => new Promise(done => { resolve = () => done({ id: 'custom', name, emoji, kind: 'sports' }); }) });
  app.draft('Farmer carry');
  const oldSave = app.button('Speichern').props.onClick;
  const addButton = app.button('Übung anlegen');
  const creating = addButton.props.onClick();
  app.render();
  assert.equal(app.button('…').props.disabled, true);
  await oldSave();
  assert.equal(app.creations.length, 1);
  assert.deepEqual(app.writes, []);
  resolve(); await creating; app.render();
  const newCard = app.nodes().find(node => node.type === 'button' && node.props.className?.includes('cat-card')
    && node.props.children?.some(child => child?.props?.children?.includes('Farmer carry')));
  assert.ok(newCard?.props.className.includes('selected'), 'new exercise is visibly selected before reload');
  await app.button('Speichern').props.onClick();
  assert.equal(app.writes[0]?.category_id, 'custom');
  assert.equal(app.creations.length, 1);
});

test('failed custom creation retains the draft and never writes the old category', async () => {
  const app = mount({ addCategory: async () => { throw new Error('offline'); } });
  app.draft('Farmer carry');
  await app.button('Speichern').props.onClick(); app.render();
  assert.deepEqual(app.alerts, ['offline']);
  assert.equal(app.input().props.value, 'Farmer carry');
  assert.deepEqual(app.writes, []);
  assert.equal(app.saved, 0);
});

test('workout setup saves a per-person run target and keeps its time metric intact', async () => {
  const app = mount({ existing: { id: 'week-sally', category_id: 'sally', target_reps: 204, target_runs: 2 } });
  const stepper = app.nodes().find(node => node.type === app.Stepper);
  assert.equal(stepper.props.value, 2);
  assert.equal(stepper.props.min, 1);
  stepper.props.onChange(3); app.render();
  await app.button('Speichern').props.onClick();
  assert.equal(app.writes[0]?.target_runs, 3);
  assert.equal(app.writes[0]?.target_reps, 204);
});


test('custom minute exercise keeps the newer unit picker and per-person target', async () => {
  const app = mount();
  app.draft('Planks');
  app.button('Minuten').props.onClick(); app.render();
  await app.button('Speichern').props.onClick();
  assert.deepEqual(app.creations, [{ name: 'Planks', emoji: '💪', kind: 'time' }]);
  assert.equal(app.writes[0].category_id, 'custom');
  assert.equal(app.writes[0].target_reps, 120);
});

test('workout count is also copied into another selected challenge', async () => {
  const app = mount({ otherComps: [{ c: { id: 'c2', name: 'Other challenge', emoji: '💪' }, categories: catalog,
    challenges: [], participantCount: 2, categoryOf: id => catalog.find(c => c.id === id) }] });
  app.button('Bring Sally Up').props.onClick(); app.render();
  app.nodes().find(node => node.type === app.Stepper).props.onChange(3); app.render();
  app.nodes().find(node => node.type === 'button' && node.props.className === 'ob-extras-head').props.onClick(); app.render();
  app.nodes().find(node => node.type === 'button' && node.props.className?.includes('chip')
    && node.props.children?.includes('Other challenge')).props.onClick(); app.render();
  await app.button('Speichern').props.onClick();
  assert.equal(app.writes[0].target_runs, 3);
  assert.equal(app.copied.length, 1);
  assert.equal(app.copied[0].target_runs, 3);
  assert.equal(app.copied[0].category_id, 'sally');
});
