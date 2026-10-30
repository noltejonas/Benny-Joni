// Run the actual native push effect: kicks must be visible in the foreground,
// respect the latest opt-out, and open Today when tapped.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parse } = require('@babel/parser');

const source = fs.readFileSync(path.join(__dirname, '..', 'www/app.jsx'), 'utf8');
const app = parse(source, { sourceType: 'script', plugins: ['jsx'] }).program.body
  .find(node => node.type === 'FunctionDeclaration' && node.id.name === 'CompetitionApp');
const effect = app.body.body.filter(node => node.type === 'ExpressionStatement')
  .map(node => node.expression).filter(node => node.type === 'CallExpression' && node.callee.name === 'useEffect')
  .map(node => node.arguments[0]).find(node => source.slice(node.start, node.end).includes('const Push = window.PTPushNotifications'));

async function mount({ notificationsOn = true } = {}) {
  const listeners = new Map(), removed = [], toasts = [], events = [], stored = new Map();
  let registered;
  const ready = new Promise(resolve => { registered = resolve; });
  const kicksAllowed = { current: true };
  const ctx = {
    me: 'u1', notificationsOn, kicksAllowed, setToast: text => toasts.push(text), console,
    api: { async upsertDeviceToken() {}, async deleteDeviceToken() {} },
    TAB_KEY: 'pt:tab', writeHomeView: view => stored.set('pt:home-view', view),
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { setItem: (key, value) => stored.set(key, value) },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    window: {
      dispatchEvent: event => events.push(event),
      PTPushNotifications: { PushNotifications: {
        async checkPermissions() { return { receive: 'granted' }; },
        async addListener(name, callback) { listeners.set(name, callback); return { remove() { removed.push(name); } }; },
        async register() { registered(); },
      } },
    },
  };
  vm.createContext(ctx);
  const start = vm.runInContext(`(${source.slice(effect.start, effect.end)})`, ctx);
  const cleanup = start();
  if (notificationsOn) await ready;
  return { listeners, removed, toasts, events, stored, kicksAllowed, cleanup };
}

test('Arschkick zeigt den Spruch auch in der offenen App und respektiert aktuellen Opt-out', async () => {
  const h = await mount();
  const receive = h.listeners.get('pushNotificationReceived');
  assert.equal(typeof receive, 'function');
  receive({ data: { kind: 'teammate_kick' }, body: 'Das Sofa kann kurz ohne dich.' });
  assert.deepEqual(h.toasts, ['Das Sofa kann kurz ohne dich.']);
  h.kicksAllowed.current = false;
  receive({ data: { kind: 'teammate_kick' }, body: 'Must not show' });
  h.kicksAllowed.current = true;
  receive({ data: { kind: 'reaction' }, body: 'Already covered by the feed' });
  assert.equal(h.toasts.length, 1);
  h.cleanup();
  assert.equal(h.removed.length, 4);
});

test('Arschkick-Tap öffnet Heute und die zugehörige Challenge', async () => {
  const h = await mount();
  h.listeners.get('pushNotificationActionPerformed')({ notification: { data: { kind: 'teammate_kick', competition_id: 'c2' } } });
  assert.equal(h.stored.get('pt:tab'), 'home');
  assert.equal(h.stored.get('pt:home-view'), 'challenge');
  assert.deepEqual(h.events.map(event => event.type), ['pt:open-competition', 'pt:nav-home']);
  assert.equal(h.events[0].detail.competitionId, 'c2');
  h.cleanup();
});

test('globale Push-Einstellung aus registriert keine Empfangslistener', async () => {
  const h = await mount({ notificationsOn: false });
  assert.equal(h.listeners.size, 0);
});
