/* global React, PTData, PTOnboarding, PTHaptics, PTSound, PTPeople, Icon, Avatar, MiniRing, ObScreen, ObMessage, ObSlots, useObOnline, shareInvite, formatDuration, tr, trn, ObDuo, ObGuide, obFigTall */
// Onboarding in der Challenge: Ebenen über Home (Einladen, Wochenziel, erster
// Satz, Feier, Push-Vorab, Woche 1) und die Startkarte. Die Reihenfolge steuert
// CompetitionApp; was erledigt ist, kommt aus den Daten (onboarding-model.js).

const OB_CAPACITY = { '1v1': 2, '2v2': 4, ffa: 12 };

// Vollbild-Ebene über der App (eigener Scroll, Safe Areas über ObScreen).
function ObLayer({ children, label }) {
  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  return <div className="ob-layer" role="dialog" aria-modal="true" aria-label={label}>{children}</div>;
}

// ─── Einladen ───────────────────────────────────────────────────────────────
function obInviteLine(mode, free) {
  if (free <= 0) return tr('Alle Plätze sind besetzt. Los geht’s!');
  if (mode === '1v1') return tr('Fehlt nur noch dein Gegner.');
  if (mode === '2v2') return free === 1 ? tr('Fehlt noch eine Person.') : free === 2 ? tr('Fehlen noch zwei.') : tr('Fehlen noch drei.');
  return tr('Hol deine Leute rein.');
}

// `fresh`: direkt nach dem Erstellen („Challenge steht 🎉“).
function ObInviteLayer({ competition, members, me, fresh, onDone }) {
  const active = members.filter(m => !m.left_at);
  const capacity = OB_CAPACITY[competition.mode] || 12;
  const [shared, setShared] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [info, setInfo] = React.useState('');
  // Wer beitritt, solange die Ebene offen ist, bekommt einen Auftritt.
  const firstIds = React.useRef(new Set(active.map(m => m.user_id)));
  const newIds = active.map(m => m.user_id).filter(id => !firstIds.current.has(id));
  const newest = newIds.length ? active.find(m => m.user_id === newIds[newIds.length - 1]) : null;
  React.useEffect(() => { if (newIds.length) PTHaptics.success(); }, [newIds.length]);

  async function share() {
    const r = await shareInvite(competition);
    if (r === 'shared') setShared(true);
    if (r === 'copied') { setShared(true); setInfo(tr('Einladung kopiert. Füg sie in den Chat ein.')); }
    if (r === 'failed') setInfo(tr('Teilen ging nicht. Schick den Code einfach selbst.'));
  }
  async function copyCode() {
    try { await navigator.clipboard.writeText(competition.invite_code); } catch (e) {}
    window.PTDemo?.simulateJoin?.(competition.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const free = capacity - active.length;
  const done = shared || active.length >= 2;
  return (
    <ObLayer label={tr('Leute einladen')}>
      <ObScreen stepKey="invite" foot={<>
        {free > 0 && (
          <button type="button" className={done ? 'btn btn-secondary' : 'btn'} onClick={share}>
            <Icon name="share" size={18} /> {tr('Einladung senden')}
          </button>
        )}
        <button type="button" className={done ? 'btn' : 'btn-link'} onClick={onDone}>{done ? tr('Weiter') : tr('Später einladen')}</button>
      </>}>
        <h1 className="ob-title">{fresh ? tr('Challenge steht 🎉') : tr('Leute einladen')}</h1>
        <ObGuide who="benny" pose={fresh || free <= 0 ? 'cheer' : 'point'}>{obInviteLine(competition.mode, free)}</ObGuide>
        <div className="ob-preview">
          <div className="ob-preview-emoji" aria-hidden="true">{competition.emoji}</div>
          <div className="ob-preview-name">{competition.name}</div>
          <div className="ob-preview-meta">{tr('{count}/{capacity} dabei', { count: active.length, capacity })}</div>
          <ObSlots members={active} capacity={capacity} newIds={newIds} />
        </div>
        {newest && <ObMessage info={tr('{name} ist dabei 🎉', { name: (newest.profile?.display_name || tr('Jemand')).split(/\s+/)[0] })} />}
        <div className="ob-codebox">
          <span className="ob-codebox-code mono" aria-label={tr('Code {code}', { code: competition.invite_code })}>{competition.invite_code}</span>
          <button type="button" className="ob-codebox-copy" onClick={copyCode}>
            <Icon name={copied ? 'check' : 'copy'} size={16} strokeWidth={2.4} />{copied ? tr('Kopiert') : tr('Kopieren')}
          </button>
        </div>
        <ObMessage info={info} />
      </ObScreen>
    </ObLayer>
  );
}

// ─── Erstes Wochenziel ──────────────────────────────────────────────────────
const obStepOf = (n) => (n < 30 ? 1 : n < 100 ? 5 : 10);

function ObAmount({ value, onChange, choices, unit, note }) {
  // Beim Tippen darf das Feld kurz leer sein; der Wert bleibt der letzte gültige.
  const [draft, setDraft] = React.useState(null);
  const set = (v) => { setDraft(null); onChange(Math.max(1, Math.min(9999, Math.round(v) || 1))); };
  const type = (raw) => {
    const clean = String(raw).replace(/\D/g, '').slice(0, 4);
    setDraft(clean);
    const n = parseInt(clean, 10);
    if (n > 0) onChange(n);
  };
  return (
    <div className="ob-amount">
      <div className="ob-amount-row">
        <button type="button" className="ob-step-btn" aria-label={tr('weniger')} disabled={value <= 1}
          onClick={() => set(value - obStepOf(value - 1))}>−</button>
        <input className="ob-amount-num" type="text" inputMode="numeric" pattern="[0-9]*" value={draft ?? value} aria-label={unit}
          onFocus={e => e.target.select()} onChange={e => type(e.target.value)} onBlur={() => setDraft(null)} />
        <button type="button" className="ob-step-btn" aria-label={tr('mehr')} onClick={() => set(value + obStepOf(value))}>+</button>
      </div>
      <div className="ob-amount-unit">{unit}</div>
      {choices?.length > 0 && (
        <div className="ob-chips">
          {choices.map(c => (
            <button key={c} type="button" className={`ob-chip${c === value ? ' is-on' : ''}`} onClick={() => set(c)}>{c}</button>
          ))}
        </div>
      )}
      {note && <div className="ob-amount-note">{note}</div>}
    </div>
  );
}

// „Zusammen 60 für euch beide.“ — ganze Sätze, weil die Zahlwörter je Sprache anders laufen.
function obTogetherNote(total, n) {
  if (n === 2) return tr('Zusammen {total} für euch beide.', { total });
  if (n === 3) return tr('Zusammen {total} für euch drei.', { total });
  if (n === 4) return tr('Zusammen {total} für euch vier.', { total });
  return tr('Zusammen {total} für euch {n}.', { total, n });
}

// Nur Standard-Sportübungen: Pflicht-Workouts haben kein Mengenziel, und Home
// zeigt nur Sport.
function obGoalCategories(categories) {
  return categories.filter(c => (c.kind || 'sports') === 'sports' && (c.challenge_type || 'standard') === 'standard');
}

function ObGoalLayer({ api, competition, categories, me, activeCount, weekStart, title = tr('Euer erstes Wochenziel'), onDone, onSkip }) {
  const online = useObOnline();
  const cats = obGoalCategories(categories);
  const [showAll, setShowAll] = React.useState(false);
  const [catId, setCatId] = React.useState(cats[0]?.id || null);
  const cat = cats.find(c => c.id === catId);
  const [amount, setAmount] = React.useState(() => PTOnboarding.goalDefault(cats[0]));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const people = PTOnboarding.expectedPeople(competition.mode, activeCount);
  const def = PTOnboarding.goalDefault(cat);
  const visible = showAll ? cats : cats.slice(0, 6);
  const daysLeft = PTOnboarding.weekProgress().daysLeft;

  function pick(c) { setCatId(c.id); setAmount(PTOnboarding.goalDefault(c)); }

  async function save() {
    if (!cat) return;
    if (!online) { setError(tr('Keine Verbindung. Prüf dein Internet.')); return; }
    setError(''); setBusy(true);
    try {
      const ch = await api.upsertChallenge({ week_start: weekStart, category_id: cat.id, chosen_by: me,
        target_reps: PTOnboarding.goalTarget(amount, people) });
      PTHaptics.tap();
      onDone(ch);
    } catch (e) { setError(e.message || String(e)); setBusy(false); }
  }

  return (
    <ObLayer label={tr('Wochenziel festlegen')}>
      <ObScreen stepKey="goal" foot={<>
        <button type="button" className="btn" disabled={busy || !cat} onClick={save}>{busy ? '…' : tr('Ziel setzen')}</button>
        <button type="button" className="btn-link" onClick={onSkip}>{tr('Später')}</button>
      </>}>
        <h1 className="ob-title">{title}</h1>
        <ObGuide who="benny" pose="flex">{tr('Was macht ihr bis Sonntag?')}{daysLeft < 7 ? ' ' + trn(daysLeft, 'Noch {n} Tag.', 'Noch {n} Tage.') : ''}</ObGuide>
        <div className="ob-ex-grid" role="radiogroup" aria-label={tr('Übung')}>
          {visible.map(c => (
            <button key={c.id} type="button" role="radio" aria-checked={c.id === catId}
              className={`ob-ex${c.id === catId ? ' is-on' : ''}`} onClick={() => pick(c)}>
              <span className="ob-ex-emoji" aria-hidden="true">{c.emoji}</span>
              <span className="ob-ex-name">{c.name}</span>
            </button>
          ))}
        </div>
        {!showAll && cats.length > 6 && <button type="button" className="btn-link ob-more" onClick={() => setShowAll(true)}>{tr('Mehr Übungen')}</button>}
        {cat && (
          <ObAmount value={amount} onChange={setAmount} unit={tr('pro Person bis Sonntag')}
            choices={PTOnboarding.goalChoices(def)}
            note={obTogetherNote(PTOnboarding.goalTarget(amount, people), people)} />
        )}
        <ObMessage error={error} />
      </ObScreen>
    </ObLayer>
  );
}

// ─── Erster Satz ────────────────────────────────────────────────────────────
function ObFirstLogLayer({ api, challenges, categories, people = 2, onLogged, onSkip }) {
  const online = useObOnline();
  const catById = Object.fromEntries(categories.map(c => [c.id, c]));
  const options = challenges.filter(ch => {
    const c = catById[ch.category_id];
    return (c?.kind || 'sports') === 'sports' && (c?.challenge_type || 'standard') === 'standard';
  });
  const [chId, setChId] = React.useState(options[0]?.id || null);
  const [reps, setReps] = React.useState(10);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const ch = options.find(o => o.id === chId);
  const cat = ch && catById[ch.category_id];

  async function log() {
    if (!ch) return;
    if (!online) { setError(tr('Keine Verbindung. Prüf dein Internet.')); return; }
    setError(''); setBusy(true);
    try {
      await api.addSet({ challenge_id: ch.id, reps, note: null });
      onLogged(reps, ch, cat);
    } catch (e) { setError(e.message || String(e)); setBusy(false); }
  }

  return (
    <ObLayer label={tr('Erster Satz')}>
      <ObScreen stepKey="firstlog" foot={<>
        <button type="button" className="btn" disabled={busy || !ch} onClick={log}>{busy ? '…' : tr('+{n} loggen', { n: reps })}</button>
        <button type="button" className="btn-link" onClick={onSkip}>{tr('Später')}</button>
      </>}>
        <h1 className="ob-title">{tr('Dein erster Satz')}</h1>
        <ObGuide who="joni" pose="point">{cat?.name ? tr('Mach ein paar {name}. Wir warten.', { name: cat.name }) : tr('Mach ein paar Wiederholungen. Wir warten.')}</ObGuide>
        {options.length > 1 && (
          <div className="ob-chips" style={{ justifyContent: 'flex-start' }} role="radiogroup" aria-label={tr('Übung')}>
            {options.map(o => (
              <button key={o.id} type="button" role="radio" aria-checked={o.id === chId}
                className={`ob-chip${o.id === chId ? ' is-on' : ''}`} onClick={() => setChId(o.id)}>
                {catById[o.category_id]?.emoji} {catById[o.category_id]?.name}
              </button>
            ))}
          </div>
        )}
        <ObAmount value={reps} onChange={setReps} unit={cat?.name || tr('Wiederholungen')} choices={[5, 10, 15, 20]} />
        {ch && (
          <div className="ob-note"><span className="ob-note-emoji" aria-hidden="true">🎯</span>
            {tr('Dein Teil bis Sonntag: {n} {name}', { n: PTData.fairShareOf(ch.target_reps, people), name: cat?.name || '' })}</div>
        )}
        <ObMessage error={error} />
      </ObScreen>
    </ObLayer>
  );
}

// ─── Feier zum ersten Satz ──────────────────────────────────────────────────
const OB_CONFETTI_COLORS = ['#FFD60A', '#FF7AB6', '#7CE0FF', '#9CF28B', '#FFFFFF', '#FFB35C'];

function ObConfetti({ count = 60 }) {
  const pieces = React.useMemo(() => Array.from({ length: count }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.5,
    dur: 1.3 + Math.random() * 0.9,
    dx: (Math.random() - 0.5) * 160,
    rot: 360 + Math.random() * 540,
    color: OB_CONFETTI_COLORS[i % OB_CONFETTI_COLORS.length],
    round: Math.random() < 0.3,
  })), [count]);
  return (
    <div className="ob-confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <i key={i} style={{
          left: `${p.left}%`, background: p.color, borderRadius: p.round ? 999 : 2,
          animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s`, '--dx': `${p.dx}px`, '--rot': `${p.rot}deg`,
        }} />
      ))}
    </div>
  );
}

function ObCelebrate({ value, category, myDone, share, onDone }) {
  const [shown, setShown] = React.useState(0);
  React.useEffect(() => {
    PTHaptics.celebrate();
    PTSound.play('first-log');
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setShown(value); return; }
    let raf, t0;
    const tick = (t) => {
      if (t0 === undefined) t0 = t;
      const k = Math.min(1, Math.max(0, (t - t0 - 250) / 700));
      setShown(Math.round(value * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const done = setTimeout(() => setShown(value), 1050);
    return () => { cancelAnimationFrame(raf); clearTimeout(done); };
  }, [value]);
  const pct = share > 0 ? Math.min(1, myDone / share) : 0;
  return (
    <div className="ob-cele" role="dialog" aria-modal="true" aria-label={tr('Erster Satz geschafft')}>
      <ObConfetti />
      <div className="ob-cele-over">{category?.emoji} {category?.name}</div>
      <h1 className="ob-cele-title">{tr('Erster Satz! 💪')}</h1>
      <ObDuo benny="cheer" joni="cheer" tall={obFigTall(118)} enter />
      <div className="ob-cele-num">+{shown}</div>
      <div className="ob-cele-ring">
        <MiniRing pct={pct} size={96} stroke={9} color="#fff" track="rgba(255,255,255,0.25)">{Math.round(pct * 100)}%</MiniRing>
      </div>
      <div className="ob-cele-sub">{tr('{done} von {share} · dein Teil diese Woche', { done: myDone, share })}</div>
      <button type="button" className="rd-btn-white" onClick={onDone}>{tr('Weiter')}</button>
    </div>
  );
}

// ─── Push ───────────────────────────────────────────────────────────────────
// Erlaubnis lesen und anfragen — nativ über @capacitor/push-notifications,
// im Browser über die Notification-API. Ergebnis: 'prompt' | 'granted' |
// 'denied' | 'unsupported'. iOS fragt nur einmal; danach hilft nur der Weg in
// die iOS-Einstellungen. Der Stand des Vorab-Bildschirms liegt pro Gerät in
// pt:push-primer ({ asks, lastAt, result }, s. PTOnboarding.pushPrimerDue).
const PT_PRIMER_KEY = 'pt:push-primer';
const PTPush = {
  native() { return window.PTPushNotifications?.PushNotifications || null; },
  map(v) { return v === 'granted' ? 'granted' : v === 'denied' ? 'denied' : 'prompt'; },
  async permission() {
    const P = this.native();
    if (P) { try { return this.map((await P.checkPermissions()).receive); } catch (e) { return 'unsupported'; } }
    if (typeof Notification !== 'undefined') return this.map(Notification.permission);
    return 'unsupported';
  },
  async request() {
    const P = this.native();
    try {
      if (P) return this.map((await P.requestPermissions()).receive);
      if (typeof Notification !== 'undefined') return this.map(await Notification.requestPermission());
    } catch (e) { console.warn('Push-Erlaubnis', e); }
    return 'unsupported';
  },
  readPrimer() { try { return JSON.parse(localStorage.getItem(PT_PRIMER_KEY) || '{}'); } catch (e) { return {}; } },
  writePrimer(state) { try { localStorage.setItem(PT_PRIMER_KEY, JSON.stringify(state)); } catch (e) {} },
  // iOS-Einstellungen der App öffnen (Capacitor gibt app-settings: an iOS weiter).
  openSettings() { if (this.native()) location.href = 'app-settings:'; },
};

// Zeigt genau die Mitteilung, die notify-set verschickt (Rivalen-Push).
function ObPushPrimer({ competition, rival, busy, onAllow, onLater }) {
  return (
    <ObLayer label={tr('Mitteilungen')}>
      <ObScreen stepKey="push" foot={<>
        <button type="button" className="btn" disabled={busy} onClick={onAllow}>{busy ? '…' : tr('Mitteilungen erlauben')}</button>
        <button type="button" className="btn-link" disabled={busy} onClick={onLater}>{tr('Jetzt nicht')}</button>
      </>}>
        <h1 className="ob-title">{tr('Bleib im Rennen 🔔')}</h1>
        <ObGuide who="joni" pose="point">{tr('Wir melden uns nur, wenn es zählt.')}</ObGuide>
        <div className="ob-preview-push" aria-label={tr('Beispiel einer Mitteilung')}>
          <img src="icons/icon-192.png" alt="" />
          <span>
            <strong>🔥 {rival ? tr('{name} ist los', { name: rival }) : tr('Dein Rivale ist los')}</strong>
            {competition.emoji} {competition.name}<br />
            {tr('Schon 120 Reps heute — du noch bei 0.')}
          </span>
        </div>
        <ul className="ob-points">
          <li className="ob-point"><span className="ob-point-emoji" aria-hidden="true">🔥</span>
            <span>{tr('Dein Rivale legt los und du bist heute noch bei 0? Wir sagen Bescheid.')}</span></li>
          <li className="ob-point"><span className="ob-point-emoji" aria-hidden="true">🤫</span>
            <span>{tr('Höchstens eine Mitteilung pro Tag und Challenge.')}</span></li>
        </ul>
      </ObScreen>
    </ObLayer>
  );
}

// ─── Woche 1 geschafft ──────────────────────────────────────────────────────
// summary aus PTOnboarding.weekOneSummary; Benny und Joni feiern je nach Ergebnis mit.
function obWeekOneResult(s) {
  if (s.result === 'won') return { pose: 'cheer', line: s.diff > 0 ? tr('Du hast die Woche geholt, {n} vorne.', { n: s.diff }) : tr('Du hast die Woche geholt.') };
  if (s.result === 'lost') return { pose: 'flex', line: tr('{name} lag {n} vorne. Revanche?', { name: s.leader, n: s.diff }) };
  if (s.result === 'tie') return { pose: 'wave', line: tr('Gleichstand. Woche 2 entscheidet.') };
  return { pose: 'flex', line: tr('Solo durchgezogen.') };
}

function ObWeekOne({ summary, onDone }) {
  React.useEffect(() => { PTHaptics.celebrate(); PTSound.play('first-log', 0.6); }, []);
  const r = obWeekOneResult(summary);
  const main = summary.myMinutes && !summary.myReps
    ? { num: formatDuration(summary.myMinutes), cap: tr('Fokuszeit') }
    : { num: summary.myReps, cap: tr('Reps') };
  return (
    <ObLayer label={tr('Woche 1 geschafft')}>
      <ObConfetti count={40} />
      <ObScreen stepKey="week1" center foot={<button type="button" className="btn" onClick={onDone}>{tr('Auf in Woche 2')}</button>}>
        <ObDuo benny={r.pose} joni={r.pose} tall={obFigTall(120)} tap enter />
        <div className="ob-overline" style={{ textAlign: 'center' }}>{tr('Woche 1')}</div>
        <h1 className="ob-title" style={{ textAlign: 'center' }}>{tr('Geschafft 🏁')}</h1>
        <div className="ob-stats">
          <div className="ob-stat"><span className="ob-stat-num">{main.num}</span><span className="ob-stat-cap">{main.cap}</span></div>
          <div className="ob-stat"><span className="ob-stat-num">{summary.activeDays}</span><span className="ob-stat-cap">{tr('aktive Tage')}</span></div>
          <div className="ob-stat"><span className="ob-stat-num">{summary.sharesHit}/{summary.sharesTotal}</span><span className="ob-stat-cap">{tr('Teile erfüllt')}</span></div>
        </div>
        <div className="ob-result">{r.line}</div>
      </ObScreen>
    </ObLayer>
  );
}

// ─── Home: Startkarte ───────────────────────────────────────────────────────
// Punkte aus PTOnboarding.starterItems; erledigt ist, was die Daten hergeben.
const OB_STARTER_LABELS = {
  invite: tr('Leute einladen'), goal: tr('Wochenziel setzen'), log: tr('Ersten Satz loggen'), push: tr('Mitteilungen an'),
};

function ObStarterCard({ items, midWeek, daysLeft, onOpen, onDismiss }) {
  const done = items.filter(i => i.done).length;
  return (
    <section className="ob-starter" aria-label={tr('Startklar')}>
      <div className="ob-starter-head">
        <span className="ob-starter-title">{tr('Startklar')}</span>
        <span className="ob-starter-count">{tr('{done} von {total}', { done, total: items.length })}</span>
        <button type="button" className="ob-starter-close" aria-label={tr('Startkarte ausblenden')} onClick={onDismiss}>
          <Icon name="close" size={16} strokeWidth={2.4} />
        </button>
      </div>
      {midWeek && <div className="ob-starter-sub">{trn(daysLeft, 'Die Woche läuft seit Montag · noch {n} Tag', 'Die Woche läuft seit Montag · noch {n} Tage')}</div>}
      <div className="ob-progress" aria-hidden="true"><span style={{ width: `${(done / items.length) * 100}%` }} /></div>
      <ul className="ob-starter-list">
        {items.map(i => (
          <li key={i.id}>
            <button type="button" className={`ob-starter-item${i.done ? ' is-done' : ''}`} disabled={i.done}
              onClick={() => onOpen(i.id)}>
              <span className="ob-check" aria-hidden="true">{i.done && <Icon name="check" size={14} strokeWidth={3} />}</span>
              <span className="ob-starter-label">{OB_STARTER_LABELS[i.id]}</span>
              {i.done ? <span className="ob-sr">{tr('erledigt')}</span> : <span className="ob-chev"><Icon name="chevron" size={18} /></span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── Home: Einladen-Karte (für alle, die allein sind) ──────────────────────
function ObInviteCard({ competition, members, onInvite }) {
  const active = members.filter(m => !m.left_at);
  const capacity = OB_CAPACITY[competition.mode] || 12;
  return (
    <section className="ob-invite-card" aria-label={tr('Leute einladen')}>
      <div className="ob-invite-card-top">
        <ObSlots members={active} capacity={capacity} size={40} />
      </div>
      <div className="ob-invite-card-text">
        <strong>{active.length < 2 ? tr('Noch allein hier.') : tr('Noch kein Gegner-Team.')}</strong>{' '}
        {tr('Schick deinen Leuten den Code {code}.', { code: <span className="mono">{competition.invite_code}</span> })}
      </div>
      <button type="button" className="btn" onClick={onInvite}><Icon name="share" size={18} /> {tr('Einladen')}</button>
    </section>
  );
}

Object.assign(window, {
  ObLayer, ObInviteLayer, ObAmount, ObGoalLayer, ObFirstLogLayer, ObConfetti, ObCelebrate, obGoalCategories,
  PTPush, ObPushPrimer, ObStarterCard, ObInviteCard, ObWeekOne, obWeekOneResult,
});
