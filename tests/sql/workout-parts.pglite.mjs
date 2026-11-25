// Prüft die Migrationen 20261125120000_workout_parts.sql,
// 20261125200000_workout_parts_rounds.sql und 20261125210000_workout_parts_blocks.sql
// (20-Min-AMRAP zählt in seine Teilübungen, ein Satz pro Runde, je Übung als
// Block) gegen eine eingebettete Postgres (PGlite) mit den dafür
// nötigen Tabellen, sync_log_siblings und log_set wie in Produktion. Läuft nicht
// mit `npm test` (braucht PGlite); von Hand:
//   npm i --no-save @electric-sql/pglite@0.2.17
//   node tests/sql/workout-parts.pglite.mjs
// Prüft: Nachtrag KW 48 ohne Pushes und nur in laufenden Challenges mit aktiver
// Mitgliedschaft, Umbau auf Rundensätze, Zeiten der Runden, neue Einträge,
// Bearbeiten, Löschen, Cascade, Rechte.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ROOT = new URL('../../supabase/migrations/', import.meta.url);
const MIGS = ['20261125120000_workout_parts.sql', '20261125200000_workout_parts_rounds.sql', '20261125210000_workout_parts_blocks.sql']
  .map(f => new URL(f, ROOT));
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
const as = async (uid) => db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false)`);

await db.exec(`
create role anon; create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table profiles (id uuid primary key);
create table competitions (id uuid primary key default gen_random_uuid(), name text, mode text, archived_at timestamptz, created_at timestamptz default now());
create table competition_members (competition_id uuid references competitions(id) on delete cascade, user_id uuid references profiles(id), left_at timestamptz, joined_at timestamptz default now());
create table categories (id uuid primary key default gen_random_uuid(), name text, kind text default 'sports', challenge_type text default 'standard', ranked boolean default false, competition_id uuid);
create table weekly_challenges (id uuid primary key default gen_random_uuid(), competition_id uuid references competitions(id) on delete cascade, week_start date, category_id uuid references categories(id), target_reps int);
create table sets (id uuid primary key default gen_random_uuid(), challenge_id uuid references weekly_challenges(id) on delete cascade, athlete text, reps int, note text,
  created_at timestamptz default now(), duration_minutes int, user_id uuid references profiles(id) on delete cascade, competition_id uuid references competitions(id) on delete cascade,
  log_id uuid not null default gen_random_uuid());
create function is_member(p uuid) returns boolean language sql stable as $$ select exists (select 1 from competition_members where competition_id = p and user_id = auth.uid() and left_at is null) $$;
create table push_calls (set_id uuid, at timestamptz default now());
create function notify_set_inserted() returns trigger language plpgsql as $$ begin insert into push_calls (set_id) values (new.id); return new; end $$;
create trigger notify_set_after_insert after insert on sets for each row execute function notify_set_inserted();
`);
// sync_log_siblings und log_set wie in Produktion (aus den Migrationen)
const heute = fs.readFileSync(new URL('20261024120000_heute_dashboard.sql', ROOT), 'utf8');
await db.exec(heute.match(/create or replace function public\.sync_log_siblings[\s\S]*?end \$\$;/)[0]);
await db.exec(`create trigger sync_log_siblings after update or delete on sets for each row execute function public.sync_log_siblings();`);
const monthly = fs.readFileSync(new URL('20261020120000_monthly_ranking.sql', ROOT), 'utf8');
await db.exec(monthly.match(/create or replace function public\.log_set\([\s\S]*?end \$\$;/)[0]);

const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b';
await db.exec(`insert into profiles values ('${A}'), ('${B}')`);
const cat = async (name, type = 'standard', comp = null) => (await q(`insert into categories (name, challenge_type, ranked, competition_id) values ($1, $2, $3, $4) returning id`, [name, type, comp == null, comp]))[0].id;
const AMRAP = await cat('20-Min-AMRAP', 'tom_holland'), KZ = await cat('Klimmzüge'), LS = await cat('Liegestütze'), KB = await cat('Kniebeugen'), DIPS = await cat('Dips');
const comp = async (name, mode, members, archived = false) => {
  const id = (await q(`insert into competitions (name, mode, archived_at) values ($1, $2, $3) returning id`, [name, mode, archived ? new Date().toISOString() : null]))[0].id;
  for (const [u, left] of members) await q(`insert into competition_members (competition_id, user_id, left_at) values ($1, $2, $3)`, [id, u, left ? new Date().toISOString() : null]);
  return id;
};
const C1 = await comp('C1', '1v1', [[A], [B]]), C2 = await comp('C2', 'ffa', [[A]]), C3 = await comp('Solo', 'solo', [[A]]),
  C4 = await comp('Archiv', 'ffa', [[A]], true), C5 = await comp('Ausgetreten', 'ffa', [[A, true], [B]]);
const goal = async (c, catId, week = '2026-11-23') => (await q(`insert into weekly_challenges (competition_id, week_start, category_id, target_reps) values ($1, $2, $3, 100) returning id`, [c, week, catId]))[0].id;
const g = {
  c1a: await goal(C1, AMRAP), c1kz: await goal(C1, KZ), c1ls: await goal(C1, LS), c1dips: await goal(C1, DIPS),
  c2kb: await goal(C2, KB), c2kz: await goal(C2, KZ), c2a: await goal(C2, AMRAP),
  c3kz: await goal(C3, KZ), c4ls: await goal(C4, LS), c5kz: await goal(C5, KZ),
  oldA: await goal(C1, AMRAP, '2026-11-16'), oldKz: await goal(C1, KZ, '2026-11-16'),
};

// Vor der Migration: A loggt 20 Runden (KW 48, zählt per log_set auch in C2), eine alte Woche, B 14 Runden
await as(A);
const a1 = (await q(`select * from log_set($1, 20, 'Zeit: 20:00', '2026-11-23T17:51:43Z')`, [g.c1a]))[0];
await q(`select log_set($1, 12, null, '2026-11-17T10:00:00Z')`, [g.oldA]);
await as(B);
await q(`select log_set($1, 14, 'Zeit: 20:00', '2026-11-23T17:55:37Z')`, [g.c1a]);
// ein normaler Satz, der nicht angefasst werden darf
await q(`select log_set($1, 30)`, [g.c1kz]);
assert.equal((await q(`select count(*)::int n from sets where log_id = $1`, [a1.log_id]))[0].n, 2, 'AMRAP in C1 und C2');
const pushesBefore = (await q(`select count(*)::int n from push_calls`))[0].n;

// ─── Migrationen ────────────────────────────────────────────────────────────
// Erst die Sammelsätze (wie in Produktion am 25.11. eingespielt), dann der Umbau.
await db.exec(fs.readFileSync(MIGS[0], 'utf8'));
const lumped = await q(`select count(*)::int n, max(reps)::int m from sets where source_log_id is not null`);
assert.deepEqual([lumped[0].n, lumped[0].m], [7, 300], 'erste Migration: Sammelsätze');
await db.exec(fs.readFileSync(MIGS[1], 'utf8'));
await db.exec(fs.readFileSync(MIGS[2], 'utf8'));

// Teilsätze pro Person: [Challenge, Übung, Zahl der Sätze, Wiederholungen pro Satz, Summe]
const summary = async (uid, src = null) => q(`select c.name comp, k.name cat, count(*)::int n, min(s.reps)::int lo, max(s.reps)::int hi, sum(s.reps)::int total
  from sets s join weekly_challenges wc on wc.id = s.challenge_id join categories k on k.id = wc.category_id join competitions c on c.id = s.competition_id
  where s.user_id = $1 and s.source_log_id is not null and ($2::uuid is null or s.source_log_id = $2::uuid)
  group by c.name, k.name order by c.name collate "C", k.name collate "C"`, [uid, src]);
const rows = (list) => list.map(r => [r.comp, r.cat, r.n, r.lo === r.hi ? r.lo : `${r.lo}-${r.hi}`, r.total]);

assert.deepEqual(rows(await summary(A)), [
  ['C1', 'Klimmzüge', 20, 5, 100], ['C1', 'Liegestütze', 20, 10, 200],
  ['C2', 'Klimmzüge', 20, 5, 100], ['C2', 'Kniebeugen', 20, 15, 300],
], 'A: 20 Sätze pro Teilübung statt eines Sammelsatzes, nur laufende Challenges mit aktiver Mitgliedschaft');
assert.deepEqual(rows(await summary(B)), [
  ['Ausgetreten', 'Klimmzüge', 14, 5, 70], ['C1', 'Klimmzüge', 14, 5, 70], ['C1', 'Liegestütze', 14, 10, 140],
]);
assert.equal((await q(`select count(*)::int n from sets where source_log_id is not null and note is not null`))[0].n, 0, 'keine Notiz');
assert.equal((await q(`select count(*)::int n from push_calls`))[0].n, pushesBefore, 'beide Nachträge ohne Pushes');
assert.equal((await q(`select tgenabled from pg_trigger where tgname = 'notify_set_after_insert'`))[0].tgenabled, 'O', 'Push-Trigger wieder an');
assert.equal((await q(`select count(*)::int n from sets s where s.challenge_id = $1`, [g.oldKz]))[0].n, 0, 'alte Woche bleibt');

// Runden: eigene log_id pro Runde, Kopien in C1/C2 teilen sie; Zeiten im Minutentakt bis zum Eintrag
const kz = await q(`select s.log_id, s.created_at from sets s where s.source_log_id = $1 and s.challenge_id = $2 order by s.created_at`, [a1.log_id, g.c1kz]);
assert.equal(new Set(kz.map(r => r.log_id)).size, 20);
const kzC2 = await q(`select log_id from sets where source_log_id = $1 and challenge_id = $2`, [a1.log_id, g.c2kz]);
assert.deepEqual(new Set(kzC2.map(r => r.log_id)), new Set(kz.map(r => r.log_id)), 'Kopien einer Runde teilen die log_id');
// 20 Runden × 3 Übungen = 60 Plätze à 20 s: Klimmzüge zuerst, Kniebeugen zuletzt
assert.equal(new Date(kz[0].created_at).toISOString(), '2026-11-23T17:32:03.000Z', 'erste Klimmzug-Runde 19:40 vorher');
assert.equal(new Date(kz[19].created_at).toISOString(), '2026-11-23T17:38:23.000Z', 'letzte Klimmzug-Runde');
const lastKb = await q(`select max(created_at) t from sets where source_log_id = $1 and challenge_id = $2`, [a1.log_id, g.c2kb]);
assert.equal(new Date(lastKb[0].t).toISOString(), '2026-11-23T17:51:43.000Z', 'letzte Kniebeugen-Runde = Eintrag');
// Im Feed hintereinander: alle Klimmzüge, dann alle Liegestütze (C1)
const seq = await q(`select k.name from sets s join weekly_challenges wc on wc.id = s.challenge_id join categories k on k.id = wc.category_id
  where s.source_log_id = $1 and s.competition_id = $2 order by s.created_at, s.id`, [a1.log_id, C1]);
assert.deepEqual(seq.map(r => r.name), [...Array(20).fill('Klimmzüge'), ...Array(20).fill('Liegestütze')], 'je Übung ein Block');
const perLog = await q(`select count(distinct log_id)::int n from sets where user_id = $1 and source_log_id is not null`, [A]);
assert.equal(perLog[0].n, 60, '20 Runden × 3 Übungen');

// ─── Live: B loggt 10 Runden ────────────────────────────────────────────────
await as(B);
const p0 = (await q(`select count(*)::int n from push_calls`))[0].n;
const b2 = (await q(`select * from log_set($1, 10, 'Zeit: 20:00', '2026-11-25T09:00:00Z')`, [g.c1a]))[0];
assert.deepEqual(rows(await summary(B, b2.log_id)), [
  ['Ausgetreten', 'Klimmzüge', 10, 5, 50], ['C1', 'Klimmzüge', 10, 5, 50], ['C1', 'Liegestütze', 10, 10, 100],
]);
assert.equal((await q(`select count(*)::int n from push_calls`))[0].n - p0, 1 + 30, 'Push-Trigger für AMRAP und jeden Rundensatz');
// Kurz nach Mitternacht (Berlin): keine Runde rutscht in den Vortag
const b3 = (await q(`select * from log_set($1, 10, null, '2026-11-24T23:10:00Z')`, [g.c1a]))[0];
const early = await q(`select min(created_at) t from sets where source_log_id = $1`, [b3.log_id]);
assert.equal(new Date(early[0].t).toISOString(), '2026-11-24T23:00:00.000Z', 'frühestens 0:00 Uhr Berlin');
await q(`delete from sets where log_id = $1`, [b3.log_id]);

// ─── Bearbeiten: A ändert 20 → 22 Runden an einer Kopie ────────────────────
await as(A);
await q(`update sets set reps = 22 where id = $1`, [a1.id]);
assert.deepEqual(rows(await summary(A)), [
  ['C1', 'Klimmzüge', 22, 5, 110], ['C1', 'Liegestütze', 22, 10, 220],
  ['C2', 'Klimmzüge', 22, 5, 110], ['C2', 'Kniebeugen', 22, 15, 330],
]);
assert.deepEqual((await q(`select reps from sets where log_id = $1`, [a1.log_id])).map(r => r.reps), [22, 22], 'AMRAP-Kopien synchron');
// Wie die App: danach die Geschwister per log_id (keine Änderung mehr)
await q(`update sets set reps = 22 where log_id = $1 and id <> $2`, [a1.log_id, a1.id]);
assert.equal((await q(`select count(*)::int n from sets where source_log_id = $1`, [a1.log_id]))[0].n, 88);
// Datum ändern verschiebt die Runden mit
await q(`update sets set created_at = '2026-11-24T08:00:00Z' where id = $1`, [a1.id]);
const last = await q(`select max(created_at) t, min(created_at) f from sets where source_log_id = $1`, [a1.log_id]);
assert.equal(new Date(last[0].t).toISOString(), '2026-11-24T08:00:00.000Z');
assert.ok(new Date(last[0].f) > new Date('2026-11-24T07:39:00Z'));
// Notiz ändern lässt Teilsätze in Ruhe
const before = (await q(`select count(*)::int n from sets where source_log_id = $1`, [a1.log_id]))[0].n;
await q(`update sets set note = 'x' where id = $1`, [a1.id]);
assert.equal((await q(`select count(*)::int n from sets where source_log_id = $1 and note is null`, [a1.log_id]))[0].n, before);

// Rundensatz direkt ändern: nur die Kopien dieser Runde
const one = (await q(`select id, log_id from sets where source_log_id = $1 and challenge_id = $2 limit 1`, [a1.log_id, g.c1kz]))[0];
await q(`update sets set reps = 4 where id = $1`, [one.id]);
assert.deepEqual((await q(`select reps from sets where log_id = $1`, [one.log_id])).map(r => r.reps), [4, 4]);
assert.deepEqual((await q(`select reps from sets where log_id = $1`, [a1.log_id])).map(r => r.reps), [22, 22], 'AMRAP unberührt');

// Idempotent: nochmal anwenden legt nichts doppelt an
assert.deepEqual((await q(`select apply_workout_parts(s) n from sets s where s.log_id = $1`, [a1.log_id])).map(r => r.n), [0, 0]);

// Neuer normaler Satz bleibt ohne Teilsätze
const plain = (await q(`select * from log_set($1, 15)`, [g.c1kz]))[0];
assert.equal((await q(`select count(*)::int n from sets where source_log_id = $1`, [plain.log_id]))[0].n, 0);

// ─── Löschen ────────────────────────────────────────────────────────────────
await q(`delete from sets where id = $1`, [a1.id]);
assert.equal((await q(`select count(*)::int n from sets where log_id = $1`, [a1.log_id]))[0].n, 0, 'AMRAP-Kopien weg');
assert.equal((await summary(A)).length, 0, 'Teilsätze weg');
assert.ok((await summary(B)).length > 0, 'B unberührt');

// Rundensatz löschen löscht nur seine Kopien, nicht das Workout
await as(B);
const bOne = (await q(`select id, log_id from sets where source_log_id = $1 and challenge_id = $2 limit 1`, [b2.log_id, g.c1kz]))[0];
await q(`delete from sets where id = $1`, [bOne.id]);
assert.equal((await q(`select count(*)::int n from sets where log_id = $1`, [bOne.log_id]))[0].n, 0, 'beide Kopien der Runde weg');
assert.equal((await q(`select count(*)::int n from sets where source_log_id = $1`, [b2.log_id]))[0].n, 30 - 2);
assert.equal((await q(`select count(*)::int n from sets where log_id = $1`, [b2.log_id]))[0].n, 1, 'B-AMRAP bleibt');

// Cascade (Wochenziel des Workouts gelöscht): Teilsätze bleiben
await q(`delete from weekly_challenges where id = $1`, [g.c1a]);
assert.ok((await summary(B)).length > 0, 'Cascade nimmt Teilsätze nicht mit');

// Rechte: App darf die Hilfsfunktion nicht aufrufen
const priv = await q(`select has_function_privilege('authenticated', 'public.apply_workout_parts(public.sets)', 'execute') a,
  has_function_privilege('anon', 'public.apply_workout_parts(public.sets)', 'execute') b`);
assert.deepEqual([priv[0].a, priv[0].b], [false, false]);

console.log('OK: alle Prüfungen bestanden');
