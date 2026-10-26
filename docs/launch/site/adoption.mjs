import { createReportClient } from './adoption-client.mjs';

const client = createReportClient();
const byId = (id) => document.getElementById(id);
const number = (value) => new Intl.NumberFormat('de-DE').format(Number(value) || 0);
const dateFormat = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' });
const stampFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Berlin' });
const MODE = { '1v1': '1:1', '2v2': '2:2', ffa: 'Jeder gegen jeden', solo: 'Freies Training' };
const list = (value) => Array.isArray(value) ? value : [];
const normalize = (value) => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('de-DE');
let report = null;
let view = 'users';
let generation = 0;
let pending = null;

function date(value) {
  if (!value) return '—';
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T12:00:00Z` : value);
  return Number.isNaN(parsed.getTime()) ? '—' : dateFormat.format(parsed);
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = String(text);
  if (className) node.className = className;
  return node;
}

function cell(row, text, className) {
  const node = element('td', text, className);
  row.append(node);
  return node;
}

function chips(values) {
  const node = element('div', null, 'chip-list');
  for (const value of list(values)) node.append(element('span', value, 'chip'));
  if (!node.childNodes.length) node.textContent = '—';
  return node;
}

function friendlyError(error) {
  if (error?.code === 'INVALID_CREDENTIALS') return 'E-Mail-Adresse oder Passwort stimmen nicht. Bitte versuche es erneut.';
  if (error?.code === 'FORBIDDEN') return 'Für diese Übersicht sind Adminrechte erforderlich. Bitte melde dich mit einem freigegebenen App-Konto an.';
  if (error?.code === 'NOT_AUTHENTICATED') return 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.';
  return 'Die Daten konnten gerade nicht geladen werden. Bitte versuche es erneut.';
}

function clearReport() {
  report = null;
  for (const id of ['usersBody', 'challengesBody', 'weeksBody']) byId(id).replaceChildren();
  for (const id of ['metricUsers', 'metricSignups', 'metricActive', 'metricLogs', 'metricLogsTotal', 'metricChallenges', 'metricChallengers']) byId(id).textContent = '—';
  byId('reportStatus').textContent = '';
  byId('resultCount').textContent = '';
  byId('reportError').textContent = '';
  byId('reportError').hidden = true;
  byId('search').value = '';
  byId('challengeFilter').value = 'all';
  byId('emptyResults').hidden = true;
  byId('history').open = false;
  byId('dashboard').hidden = true;
  byId('sessionActions').hidden = true;
  byId('liveIndicator').hidden = true;
}

function showLogin(message = '') {
  clearReport();
  byId('loginPanel').hidden = false;
  byId('loginStatus').textContent = message;
  byId('password').value = '';
}

function setView(nextView, focus = false) {
  view = nextView;
  for (const name of ['users', 'challenges']) {
    const selected = name === view;
    byId(`${name}Tab`).setAttribute('aria-selected', String(selected));
    byId(`${name}Tab`).tabIndex = selected ? 0 : -1;
    byId(`${name}Panel`).hidden = !selected;
  }
  byId('challengeFilterControl').hidden = view !== 'challenges';
  if (focus) byId(`${view}Tab`).focus();
  renderDirectory();
}

function renderDirectory() {
  if (!report) return;
  const query = normalize(byId('search').value).trim();
  const matches = (...values) => !query || normalize(values.flat().join(' ')).includes(query);
  const users = list(report.users).filter((user) => matches(user.name, list(user.challenges)))
    .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'de'));
  const filter = byId('challengeFilter').value;
  const challenges = list(report.challenges).filter((challenge) =>
    (filter === 'all' || (filter === 'archived') === !!challenge.archived)
    && matches(challenge.name, list(challenge.people)))
    .sort((a, b) => Number(!!a.archived) - Number(!!b.archived) || String(a.name ?? '').localeCompare(String(b.name ?? ''), 'de'));

  const userRows = document.createDocumentFragment();
  for (const user of users) {
    const row = element('tr');
    const name = cell(row);
    name.append(element('strong', user.name || 'Ohne Anzeigenamen'));
    const metadata = [user.language ? String(user.language).toUpperCase() : '', ...list(user.platforms), user.ranking_opt_in ? 'Rangliste sichtbar' : 'Rangliste verborgen'].filter(Boolean);
    name.append(element('span', metadata.join(' · '), 'cell-detail'));
    cell(row, date(user.joined));
    const logs = cell(row, null, 'numeric');
    logs.append(element('strong', number(user.logs_7d)), element('span', `${number(user.logs)} insgesamt`, 'cell-detail'));
    cell(row).append(chips(user.challenges));
    cell(row, date(user.last_activity));
    userRows.append(row);
  }
  byId('usersBody').replaceChildren(userRows);

  const challengeRows = document.createDocumentFragment();
  for (const challenge of challenges) {
    const row = element('tr');
    const name = cell(row);
    name.append(element('strong', [challenge.emoji, challenge.name || 'Ohne Namen'].filter(Boolean).join(' ')));
    name.append(element('span', `${MODE[challenge.mode] || challenge.mode || 'Challenge'} · seit ${date(challenge.created)}`, 'cell-detail'));
    cell(row).append(element('span', challenge.archived ? 'Archiviert' : 'Läuft', `status${challenge.archived ? ' archived' : ''}`));
    const people = cell(row);
    people.append(element('strong', `${number(challenge.members)} Mitspieler`), chips(challenge.people));
    const logs = cell(row, null, 'numeric');
    logs.append(element('strong', number(challenge.sets_7d)), element('span', `${number(challenge.sets)} insgesamt`, 'cell-detail'));
    cell(row, date(challenge.last_activity));
    challengeRows.append(row);
  }
  byId('challengesBody').replaceChildren(challengeRows);
  const count = view === 'users' ? users.length : challenges.length;
  const total = list(report[view]).length;
  byId('resultCount').textContent = `${number(count)} von ${number(total)} ${view === 'users' ? 'Nutzern' : 'Challenges'}`;
  byId('emptyResults').hidden = count !== 0;
}

function renderReport(data) {
  report = data;
  const totals = data.totals ?? {};
  byId('metricUsers').textContent = number(totals.users);
  byId('metricSignups').textContent = `+${number(totals.signups_7d)} neu in 7 Tagen`;
  byId('metricActive').textContent = number(totals.active_7d);
  byId('metricLogs').textContent = number(totals.logs_7d);
  byId('metricLogsTotal').textContent = `${number(totals.logs)} Einträge insgesamt`;
  byId('metricChallenges').textContent = number(totals.challenges_active);
  byId('metricChallengers').textContent = `${number(totals.with_challenge)} Nutzer in einer Challenge`;
  const stamp = new Date(data.generated_at);
  byId('reportStatus').textContent = Number.isNaN(stamp.getTime()) ? 'Aktuelle Daten geladen' : `Stand: ${stampFormat.format(stamp)} Uhr`;
  byId('reportError').hidden = true;
  byId('reportError').textContent = '';
  byId('liveIndicator').hidden = false;

  const weeks = document.createDocumentFragment();
  for (const week of [...list(data.weeks)].reverse()) {
    const row = element('tr');
    cell(row, date(week.week));
    for (const field of ['signups', 'active', 'logs', 'challenges']) cell(row, number(week[field]), 'numeric');
    weeks.append(row);
  }
  byId('weeksBody').replaceChildren(weeks);
  byId('history').hidden = list(data.weeks).length === 0;
  byId('loginPanel').hidden = true;
  byId('dashboard').hidden = false;
  byId('sessionActions').hidden = false;
  renderDirectory();
}

async function refresh() {
  if (!client.hasSession()) {
    if (report) {
      generation++;
      showLogin('Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.');
      byId('email').value = '';
    }
    return;
  }
  if (pending) return;
  const current = generation;
  byId('refreshButton').disabled = true;
  byId('refreshButton').textContent = 'Wird geladen …';
  const task = client.loadReport();
  pending = task;
  try {
    const data = await task;
    if (current !== generation) return;
    renderReport(data);
  } catch (error) {
    if (current !== generation) return;
    if (error?.code === 'NOT_AUTHENTICATED' || error?.code === 'FORBIDDEN') {
      generation++;
      showLogin(friendlyError(error));
      byId('email').value = '';
      await client.signOut();
    } else if (report) {
      byId('reportError').textContent = `${friendlyError(error)} Angezeigt wird weiterhin der oben genannte Datenstand.`;
      byId('reportError').hidden = false;
      byId('liveIndicator').hidden = true;
    } else {
      showLogin(friendlyError(error));
    }
  } finally {
    if (pending === task) pending = null;
    byId('refreshButton').disabled = false;
    byId('refreshButton').textContent = 'Aktualisieren';
  }
}

byId('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (byId('loginButton').disabled) return;
  const current = ++generation;
  byId('loginButton').disabled = true;
  byId('loginButton').textContent = 'Anmeldung läuft …';
  byId('loginStatus').textContent = '';
  const email = byId('email').value.trim();
  const password = byId('password').value;
  byId('password').value = '';
  try {
    await client.signIn(email, password);
    if (current !== generation) return;
    await refresh();
  } catch (error) {
    if (current === generation) showLogin(friendlyError(error));
  } finally {
    byId('password').value = '';
    byId('loginButton').disabled = false;
    byId('loginButton').textContent = 'Anmelden';
  }
});

byId('logoutButton').addEventListener('click', async () => {
  generation++;
  pending = null;
  showLogin('Du bist abgemeldet.');
  byId('email').value = '';
  await client.signOut();
  byId('email').focus();
});
byId('refreshButton').addEventListener('click', refresh);
byId('search').addEventListener('input', renderDirectory);
byId('challengeFilter').addEventListener('change', renderDirectory);
for (const name of ['users', 'challenges']) {
  byId(`${name}Tab`).addEventListener('click', () => setView(name));
  byId(`${name}Tab`).addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    setView(event.key === 'Home' ? 'users' : event.key === 'End' ? 'challenges' : name === 'users' ? 'challenges' : 'users', true);
  });
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refresh();
});
window.setInterval(() => {
  if (document.visibilityState === 'visible') refresh();
}, 60_000);
// A page restored from browser history must not display an old authenticated view.
window.addEventListener('pagehide', () => {
  generation++;
  pending = null;
  showLogin();
  byId('email').value = '';
  void client.signOut();
});
byId('loginButton').disabled = false;
