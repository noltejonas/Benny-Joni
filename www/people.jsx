/* global React */
// Personen & Seiten.
//
// `me` ist die User-ID. Namen, Avatare und Farben kommen aus einer globalen
// Registry, die CompetitionApp beim Laden der Mitglieder befüllt — so müssen
// die Screens nicht jede Profil-Map als Prop durchreichen.
//
// Eine „Seite“ ist, was im Vergleich gegeneinander antritt:
//   1v1 / Jeder gegen jeden → eine Person pro Seite
//   2v2                     → ein Team pro Seite
// Seite 0 ist immer ich bzw. mein Team (Petrol), Seite 1 der Gegner (Apricot),
// weitere Seiten bekommen Farben aus SIDE_COLORS über die CSS-Variable --sc.

const SIDE_COLORS = ['#2B8A9A', '#E8914A', '#D9667A', '#4A86D9', '#7FA34A', '#9A5BB0',
                     '#C9A23F', '#5D6F87', '#3FA38C', '#C77A5A', '#6C6FD1', '#A08A6A'];

const PTPeople = (() => {
  let byId = {};
  return {
    set(profiles) {
      byId = { ...byId };
      for (const p of profiles) if (p?.id) byId[p.id] = p;
    },
    get(id) { return byId[id] || null; },
    nameOf(id) { return byId[id]?.display_name || 'Unbekannt'; },
    firstNameOf(id) { return (byId[id]?.display_name || 'Unbekannt').split(/\s+/)[0]; },
  };
})();

function initialOf(name) {
  return (String(name || '?').trim()[0] || '?').toUpperCase();
}

// Avatar mit Foto, sonst Initiale auf Profilfarbe.
function Avatar({ userId, profile, size = 32, className = '' }) {
  const p = profile || PTPeople.get(userId);
  const name = p?.display_name || '?';
  const [broken, setBroken] = React.useState(false);
  React.useEffect(() => { setBroken(false); }, [p?.avatar_url]);
  if (p?.avatar_url && !broken) {
    return <img src={p.avatar_url} alt={name} className={`pt-avatar ${className}`}
      style={{ width: size, height: size }} onError={() => setBroken(true)} />;
  }
  return (
    <span className={`pt-avatar pt-avatar-initial ${className}`}
      style={{ width: size, height: size, background: p?.color || 'var(--surface-3)', fontSize: Math.round(size * 0.45) }}
      aria-label={name}>
      {initialOf(name)}
    </span>
  );
}

// Avatar einer Seite: Person → deren Avatar, Team → überlappende Avatare.
function SideAvatar({ side, size = 32, className = '' }) {
  if (!side) return null;
  if (side.userIds.length === 1) return <Avatar userId={side.userIds[0]} size={size} className={className} />;
  return (
    <span className="pt-avatar-stack" style={{ height: size }}>
      {side.userIds.slice(0, 2).map(id => <Avatar key={id} userId={id} size={size} />)}
      {side.userIds.length === 0 && <span className="pt-avatar pt-avatar-initial" style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }}>{side.short}</span>}
    </span>
  );
}

function sideClass(index) {
  return index < 2 ? `side-${index}` : 'side-n';
}

function buildSides(competition, members, me) {
  const all = (members || []).filter(m => m.profile);
  if (competition?.mode === '2v2') {
    const myTeam = all.find(m => m.user_id === me)?.team || 'A';
    const otherTeam = myTeam === 'A' ? 'B' : 'A';
    return [myTeam, otherTeam].map((team, i) => {
      const ms = all.filter(m => m.team === team && !m.left_at);
      const formerIds = all.filter(m => m.team === team && m.left_at).map(m => m.user_id);
      const label = ms.length ? ms.map(m => PTPeople.firstNameOf(m.user_id)).join(' & ') : `Team ${team}`;
      return {
        key: `team-${team}`, team, index: i, label, short: team,
        userIds: ms.map(m => m.user_id),
        // Ausgetretene zählen in der Historie weiter für ihr Team
        statUserIds: [...ms.map(m => m.user_id), ...formerIds],
        cls: sideClass(i), color: SIDE_COLORS[i], isMine: i === 0,
      };
    });
  }
  const sorted = [...all].sort((a, b) => {
    if (a.user_id === me) return -1;
    if (b.user_id === me) return 1;
    if (!!a.left_at !== !!b.left_at) return a.left_at ? 1 : -1;
    return String(a.joined_at).localeCompare(String(b.joined_at));
  });
  return sorted.map((m, i) => ({
    key: m.user_id, index: i,
    label: m.profile.display_name + (m.left_at ? ' (raus)' : ''),
    short: initialOf(m.profile.display_name),
    userIds: [m.user_id], statUserIds: [m.user_id],
    left: !!m.left_at,
    cls: sideClass(i), color: SIDE_COLORS[i % SIDE_COLORS.length], isMine: m.user_id === me,
  }));
}

function sideStyle(side) {
  return side ? { '--sc': side.color } : undefined;
}

function sideIndexByUser(sides) {
  const out = {};
  for (const s of sides) for (const id of (s.statUserIds || s.userIds)) out[id] = s.index;
  return out;
}

const valOfSet = (s) => s.reps ?? s.duration_minutes ?? 0;

// Summe pro Seite, optional mit eigener Wertfunktion (Work = Minuten).
function totalsBySide(sets, sides, val = valOfSet) {
  const idx = sideIndexByUser(sides);
  const out = sides.map(() => 0);
  for (const s of sets) {
    const i = idx[s.athlete];
    if (i != null) out[i] += val(s);
  }
  return out;
}

// Index der einzigen besten Seite, null bei Gleichstand oder 0.
function uniqueMaxIndex(values, lowerWins = false) {
  let best = null, bestVal = null, tie = false;
  values.forEach((v, i) => {
    if (v == null) return;
    if (bestVal == null || (lowerWins ? v < bestVal : v > bestVal)) { best = i; bestVal = v; tie = false; }
    else if (v === bestVal) tie = true;
  });
  if (tie || bestVal == null || (!lowerWins && bestVal === 0)) return null;
  return best;
}

function modeLabel(mode) {
  return mode === '1v1' ? '1 vs 1' : mode === '2v2' ? '2 vs 2' : 'Jeder gegen jeden';
}

Object.assign(window, {
  SIDE_COLORS, PTPeople, Avatar, SideAvatar, buildSides, sideStyle, sideIndexByUser,
  totalsBySide, uniqueMaxIndex, valOfSet, initialOf, modeLabel, sideClass,
});
