/* global React, modeLabel, PTData, PTDashboard, PTPeople, Icon, MiniRing, CountUp, Sheet, SideAvatar, sideStyle, formatDuration, weekNumber, DuelCard, QuickLogRow, tr, trn, PTi18n */
// „Heute“: wischbare Fokus-Karten mit Tauziehen-Balken und das Dashboard über
// alle Challenges. Rechenlogik: www/dashboard-model.js (PTDashboard).

const fmtAmount = (minutes, v) => (minutes ? formatDuration(v) : PTi18n.number(v ?? 0));
const sideLabel = (side) => (side.isMine && side.userIds.length === 1 ? tr('Du') : side.label);

// ─── Tauziehen ──────────────────────────────────────────────────────────────
// Zwei Seiten laufen von außen zur Mitte gegeneinander: jede Seite füllt ihre
// Hälfte bis zu ihrem Anteil am Wochenziel; wer vorne liegt, leuchtet.
// Mehr Seiten: kurze Rangliste mit eigenem Balken pro Seite.
function TugBar({ sides, values, goals, minutes = false, onDark = false, compact = false }) {
  const fmt = (v) => fmtAmount(minutes, v);
  if (sides.length === 2) {
    const half = (i) => (goals[i] > 0 ? Math.min(1, values[i] / goals[i]) * 50 : 0);
    let a = half(0), b = half(1);
    const lead = values[0] > values[1] ? 0 : values[1] > values[0] ? 1 : null;
    return (
      <div className={`tw${onDark ? ' on-dark' : ''}${compact ? ' is-compact' : ''}${lead != null ? ` lead-${lead}` : ''}`}
        role="img" aria-label={`${sideLabel(sides[0])} ${fmt(values[0])}, ${sideLabel(sides[1])} ${fmt(values[1])}`}>
        {!compact && (
          <div className="tw-head">
            {[0, 1].map(i => (
              <span key={sides[i].key} className={`tw-who is-${i}`} style={sideStyle(sides[i])}>
                <SideAvatar side={sides[i]} size={24} />
                <span className="tw-name">{sideLabel(sides[i])}</span>
                <b className="mono"><CountUp value={values[i]} format={fmt} /></b>
              </span>
            ))}
          </div>
        )}
        <div className="tw-track">
          <span className="tw-fill is-0" style={{ width: `${a}%`, ...sideStyle(sides[0]) }} />
          <span className="tw-fill is-1" style={{ width: `${b}%`, ...sideStyle(sides[1]) }} />
          <span className="tw-mid" aria-hidden="true" />
        </div>
        {compact && (
          <div className="tw-nums mono">
            <span style={sideStyle(sides[0])}>{fmt(values[0])}</span>
            <span style={sideStyle(sides[1])}>{fmt(values[1])}</span>
          </div>
        )}
      </div>
    );
  }
  if (sides.length < 2) {
    const pct = goals[0] > 0 ? Math.min(100, (values[0] / goals[0]) * 100) : 0;
    return (
      <div className={`tw tw-solo${onDark ? ' on-dark' : ''}`}>
        <div className="tw-track"><span className="tw-fill is-0" style={{ width: `${pct}%`, ...sideStyle(sides[0]) }} /></div>
      </div>
    );
  }
  // Jeder gegen jeden: die ersten vier, ich immer dabei
  const order = sides.map((_, i) => i).sort((x, y) => values[y] - values[x]);
  const shown = order.slice(0, compact ? 3 : 4);
  if (!shown.includes(0)) shown[shown.length - 1] = 0;
  return (
    <ol className={`tw-rank${onDark ? ' on-dark' : ''}${compact ? ' is-compact' : ''}`}>
      {shown.map(i => (
        <li key={sides[i].key} className={sides[i].isMine ? 'is-me' : ''} style={sideStyle(sides[i])}>
          <span className="tw-rank-pos mono">{order.indexOf(i) + 1}</span>
          <SideAvatar side={sides[i]} size={compact ? 20 : 24} />
          <span className="tw-rank-track">
            <span className="tw-rank-fill" style={{ width: `${goals[i] > 0 ? Math.min(100, (values[i] / goals[i]) * 100) : 0}%` }} />
          </span>
          <b className="mono">{fmt(values[i])}</b>
        </li>
      ))}
    </ol>
  );
}

// ─── Wischbare Fokus-Karten ─────────────────────────────────────────────────
// items: [{ key }], render(item) liefert den Inhalt einer Karte. Wischen meldet
// die sichtbare Karte (onActive), eine Auswahl von außen (activeKey) scrollt hin.
function FocusCarousel({ items, activeKey, onActive, render, label }) {
  const trackRef = React.useRef(null);
  const shownRef = React.useRef(activeKey);   // Karte, die gerade im Bild ist bzw. angesteuert wird
  const targetRef = React.useRef(null);       // Ziel eines programmatischen Scrollens
  const index = Math.max(0, items.findIndex(it => it.key === activeKey));
  const keysSig = items.map(it => it.key).join('|');
  const itemsRef = React.useRef(items);
  itemsRef.current = items;
  const onActiveRef = React.useRef(onActive);
  onActiveRef.current = onActive;

  const leftOf = (el, slide) => slide.offsetLeft - (el.clientWidth - slide.offsetWidth) / 2;

  // Karten folgen dem Finger: pro Frame der Abstand jeder Karte zur Mitte als
  // --fc-p (0 = Mitte, 1 = eine Karte daneben), daraus Größe und Deckkraft im
  // CSS. Ohne Re-Render; nur die Punkte wechseln sofort mit (liveIdx).
  const [liveIdx, setLiveIdx] = React.useState(index);
  const liveRef = React.useRef(index);
  React.useEffect(() => { liveRef.current = index; setLiveIdx(index); }, [index]);
  const paint = React.useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const mid = el.scrollLeft + el.clientWidth / 2;
    let best = 0, dist = Infinity;
    [...el.children].forEach((sl, i) => {
      const d = Math.abs(sl.offsetLeft + sl.offsetWidth / 2 - mid);
      if (d < dist) { dist = d; best = i; }
      sl.style.setProperty('--fc-p', Math.min(1, d / (sl.offsetWidth || 1)).toFixed(3));
    });
    if (best !== liveRef.current) { liveRef.current = best; setLiveIdx(best); }
  }, []);

  // Gemeldet wird erst, wenn das Scrollen zur Ruhe gekommen ist. So springt
  // ein Wischen nicht mittendrin und eine Auswahl von außen wird nicht vom
  // ersten Scroll-Frame wieder zurückgesetzt.
  React.useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    let timer = 0;
    let raf = 0;
    const settle = () => {
      const slides = [...el.children];
      if (!slides.length) return;
      const mid = el.scrollLeft + el.clientWidth / 2;
      let best = 0, dist = Infinity;
      slides.forEach((sl, i) => {
        const d = Math.abs(sl.offsetLeft + sl.offsetWidth / 2 - mid);
        if (d < dist) { dist = d; best = i; }
      });
      targetRef.current = null;
      const key = itemsRef.current[best]?.key;
      if (key != null && key !== shownRef.current) {
        shownRef.current = key;
        onActiveRef.current?.(key);
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(); });
      clearTimeout(timer); timer = setTimeout(settle, 120);
    };
    // scrollend (wo vorhanden) meldet ohne die 120 ms Wartezeit
    const onEnd = () => { clearTimeout(timer); settle(); };
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('scrollend', onEnd);
    return () => {
      el.removeEventListener('scroll', onScroll); el.removeEventListener('scrollend', onEnd);
      clearTimeout(timer); cancelAnimationFrame(raf);
    };
  }, [paint]);

  // Auswahl von außen (Liste angetippt): zur Karte scrollen
  React.useEffect(() => {
    const el = trackRef.current;
    const slide = el?.children[index];
    if (!slide || activeKey === shownRef.current) return;
    shownRef.current = activeKey;
    targetRef.current = activeKey;
    el.scrollTo({ left: leftOf(el, slide), behavior: 'smooth' });
    // Stand die Karte schon richtig, kommt kein Scroll-Ereignis: Ziel trotzdem freigeben
    const key = activeKey;
    setTimeout(() => { if (targetRef.current === key) targetRef.current = null; }, 900);
    // Aus der Liste weiter unten gewählt: Karte ins Bild holen
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight - 90) el.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeKey, index]);

  // Erste Anzeige und geänderte Karten (dazu, weg, andere Reihenfolge): ohne
  // Animation auf die aktive Karte, außer es läuft gerade ein Scrollen dorthin
  React.useLayoutEffect(() => {
    const el = trackRef.current;
    const slide = el?.children[index];
    if (slide && !targetRef.current) el.scrollLeft = leftOf(el, slide);
    paint();
  }, [keysSig]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (i) => {
    const el = trackRef.current;
    const slide = el?.children[i];
    if (!slide) return;
    targetRef.current = items[i]?.key ?? null;
    el.scrollTo({ left: leftOf(el, slide), behavior: 'smooth' });
  };

  return (
    <section className="fc" aria-label={label} aria-roledescription={tr('Karussell')}>
      <div className={`fc-track${items.length === 1 ? ' is-single' : ''}`} ref={trackRef}>
        {items.map((it, i) => (
          <div key={it.key} className={`fc-slide${i === liveIdx ? '' : ' is-off'}`}>{render(it, i === index)}</div>
        ))}
      </div>
      {items.length > 1 && (
        <div className="fc-dots" role="tablist" aria-label={tr('Übung wählen')}>
          {items.map((it, i) => (
            <button key={it.key} type="button" role="tab" aria-selected={i === liveIdx}
              aria-label={tr('Karte {n} von {total}', { n: i + 1, total: items.length })}
              className={`fc-dot${i === liveIdx ? ' is-on' : ''}${it.done ? ' is-done' : ''}`} onClick={() => go(i)} />
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Dashboard über alle Challenges ─────────────────────────────────────────
function compStatusLine(card) {
  const { standing, sides, rows } = card;
  if (!rows.length) return tr('Noch kein Wochenziel');
  if (sides.length < 2) return tr('Wartet auf Mitspieler');
  if (sides.length === 2) {
    if (standing.lead > 0) return sides[0].userIds.length > 1
      ? trn(standing.lead, 'Ihr liegt bei einer Übung vorne', 'Ihr liegt bei {n} Übungen vorne')
      : trn(standing.lead, 'Du liegst bei einer Übung vorne', 'Du liegst bei {n} Übungen vorne');
    if (standing.lead < 0) return (sides[1].userIds.length > 1
      ? trn(-standing.lead, '{name} liegen bei einer Übung vorne', '{name} liegen bei {n} Übungen vorne', { name: sides[1].label })
      : trn(-standing.lead, '{name} liegt bei einer Übung vorne', '{name} liegt bei {n} Übungen vorne', { name: sides[1].label }));
    return tr('Gleichstand');
  }
  return tr('Platz {rank} von {total}', { rank: standing.rank, total: standing.of });
}

// Tipp auf die Karte öffnet die Challenge, das Auge oben rechts die Schnellansicht.
function CompCard({ card, onOpen, onPeek }) {
  const { c, sides, duel, done, total } = card;
  const two = sides.length === 2;
  const reps = duel.map(d => d.reps);
  const sum = reps.reduce((a, v) => a + v, 0);
  return (
    <div className="db-comp">
      <button type="button" className="db-comp-main" onClick={onOpen} aria-label={tr('{name} öffnen', { name: c.name })}>
        <span className="db-comp-top">
          <span className="db-comp-emoji" aria-hidden="true">{c.emoji}</span>
          <span className="db-comp-name">{c.name}</span>
        </span>
        {two ? (
          <span className="db-comp-duel">
            <SideAvatar side={sides[0]} size={30} />
            <span className="db-comp-score mono"><b style={{ color: 'var(--side0-ink)' }}>{duel[0].wins}</b> : <b style={{ color: 'var(--side1-ink)' }}>{duel[1].wins}</b></span>
            <SideAvatar side={sides[1]} size={30} />
          </span>
        ) : (
          <span className="db-comp-stack">
            {sides.slice(0, 5).map(s => <SideAvatar key={s.key} side={s} size={26} />)}
            {sides.length > 5 && <span className="db-comp-more">+{sides.length - 5}</span>}
          </span>
        )}
        <span className="db-comp-line">{compStatusLine(card)}</span>
        {two && (
          <span className="db-comp-split" aria-hidden="true">
            <i style={{ flex: sum ? reps[0] : 1, ...sideStyle(sides[0]) }} />
            <i style={{ flex: sum ? reps[1] : 1, ...sideStyle(sides[1]) }} />
          </span>
        )}
        <span className="db-comp-meta">
          <span>{total ? tr('{done}/{total} erledigt', { done, total }) : tr('Ziel festlegen')}</span>
        </span>
      </button>
      <button type="button" className="db-comp-peek" onClick={onPeek} aria-label={tr('Schnellansicht: {name}', { name: c.name })}>
        <Icon name="eye" size={16} />
      </button>
    </div>
  );
}

// Fokus-Karte einer zusammengeführten Übung (zählt für alle ihre Challenges).
// Kompakt: Übung, Anteil und eine Reihe Schnellsatz; den Stand pro Challenge
// zeigt die Challenge selbst.
function ExerciseSlide({ ex, me, onQuick, onLog, onStart }) {
  const fmt = (v) => fmtAmount(ex.minutes, v);
  return (
    <div className={`rd-focus fc-card fc-compact${ex.finished ? ' is-done' : ''}`}>
      <div className="rd-focus-top">
        <div className="rd-focus-text">
          <div className="rd-focus-sub">
            {ex.isObligatory
              ? (ex.finished ? tr('erledigt') : ex.shareMax === 1 ? tr('einmal diese Woche') : tr('{done} / {total} Durchgänge', { done: ex.myWeek, total: ex.shareMax }))
              : ex.finished ? tr('überall erledigt')
              : ex.todayLeft > 0 ? tr('heute noch {amount}', { amount: fmt(ex.todayLeft) }) : tr('du bist auf Kurs')}
          </div>
          <h2 className="rd-focus-title">{ex.cat?.name}</h2>
        </div>
        {ex.finished
          ? <span className="fc-pct is-check" role="img" aria-label={tr('Erledigt')}><Icon name="check" size={30} strokeWidth={3} /></span>
          : <span className="fc-pct mono">{Math.round(ex.pct * 100)}%</span>}
      </div>

      {ex.isObligatory ? (
        <button className="rd-btn-white" onClick={onStart}>
          <Icon name="play" size={18} />
          {ex.catType === 'tom_holland' ? tr('Workout starten') : tr('Bring Sally Up starten')}
        </button>
      ) : (
        <QuickLogRow me={me} catId={ex.key} legacyId={ex.cat?.id} minutes={ex.minutes} onQuick={onQuick} onLog={onLog} compact />
      )}
    </div>
  );
}

function DashboardScreen({ me, model, weekStart, daysLeft, focusKey, onFocus, onOpenCard, onOpenChallenge, onQuickLog, onOpenLog, onStartWorkout, onAddGoal }) {
  const { cards, exercises, ordered } = model;
  // Erledigte Kacheln ans Ende, damit Blau und Grün nicht durcheinander wechseln
  const items = React.useMemo(() => [...exercises.filter(ex => !ex.finished), ...exercises.filter(ex => ex.finished)]
    .map(ex => ({ ...ex, done: ex.finished })), [exercises]);
  const active = items.find(e => e.key === focusKey) || items.find(e => !e.finished) || items[0];
  const finished = exercises.filter(e => e.finished).length;

  return (
    <>
      <section className="rd-section" aria-label={tr('Deine Challenges')}>
        <div className="rd-section-head">
          <h2>{tr('Deine Challenges')}</h2>
          <span>{tr('KW {week}', { week: weekNumber(weekStart) })} · {daysLeft === 0 ? tr('letzter Tag') : trn(daysLeft, 'noch {n} Tag', 'noch {n} Tage')}</span>
        </div>
        <div className="db-comps">
          {cards.map(card => (
            <CompCard key={card.c.id} card={card} onOpen={() => onOpenChallenge(card)} onPeek={() => onOpenCard(card)} />
          ))}
        </div>
      </section>

      {items.length > 0 ? (
        <FocusCarousel items={items} activeKey={active?.key} onActive={onFocus} label={tr('Übungen im Fokus')}
          render={(ex) => (
            <ExerciseSlide ex={ex} me={me}
              onQuick={(v) => onQuickLog(ex, v)}
              onLog={() => onOpenLog(ex)}
              onStart={() => onStartWorkout(ex)} />
          )} />
      ) : (
        <div className="rd-card rd-empty db-empty">
          <div className="rd-empty-title">{tr('Diese Woche ist noch offen')}</div>
          <div className="rd-empty-text">{tr('Öffne eine Challenge und leg das erste Wochenziel fest.')}</div>
        </div>
      )}

      {items.length > 0 && (
        <section className="rd-section" aria-label={tr('Alle Übungen')}>
          <div className="rd-section-head">
            <h2>{tr('Alle Übungen')}</h2>
            <span>{tr('{done} von {total} erledigt', { done: finished, total: exercises.length })}</span>
            {onAddGoal && (
              <button type="button" className="rd-head-btn" onClick={onAddGoal} aria-label={tr('Wochenziel hinzufügen')}>
                <Icon name="plus" size={16} strokeWidth={2.5} /> {tr('Ziel')}
              </button>
            )}
          </div>
          <ul className="rd-card rd-list">
            {ordered.map(ex => {
              const isFocus = active && ex.key === active.key;
              const fmt = (v) => fmtAmount(ex.minutes, v);
              const sub = ex.isObligatory
                ? (ex.finished ? tr('erledigt') : ex.shareMax === 1 ? tr('einmal diese Woche') : tr('{done} / {total} Durchgänge', { done: ex.myWeek, total: ex.shareMax }))
                : ex.finished ? tr('{done} diese Woche', { done: fmt(ex.myWeek) })
                : ex.todayLeft > 0
                  ? tr('{done} diese Woche · heute noch {left}', { done: fmt(ex.myWeek), left: fmt(ex.todayLeft) })
                  : tr('{done} diese Woche · auf Kurs', { done: fmt(ex.myWeek) });
              return (
                <li key={ex.key}>
                  <button type="button" className={`rd-row${ex.finished ? ' is-done' : ''}${isFocus ? ' is-focus' : ''}`}
                    aria-pressed={isFocus} onClick={() => onFocus(ex.key)}>
                    <span className="rd-row-text">
                      <span className="rd-row-name">{ex.cat?.name}</span>
                      <span className="rd-row-sub">{sub}</span>
                    </span>
                    <span className="db-row-comps" aria-label={ex.entries.map(e => e.card.c.name).join(', ')}>
                      {ex.entries.slice(0, 3).map(e => <span key={e.card.c.id}>{e.card.c.emoji}</span>)}
                    </span>
                    {ex.finished ? (
                      <span className="rd-check" aria-label={tr('Erledigt')}><Icon name="check" size={16} strokeWidth={3} /></span>
                    ) : (
                      <MiniRing pct={ex.pct} />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}

// ─── Insights einer Challenge ───────────────────────────────────────────────
// Stand pro Wochenziel: eigener Anteil und Tauziehen-Balken aller Seiten.
// Dieselbe Darstellung in der Schnellansicht (Auge auf „Heute“) und im
// aufklappbaren Duell-Balken in der Challenge (HomeScreen). rows: PTDashboard.challengeRows.
function ChallengeInsights({ sides, rows }) {
  if (!rows.length) return <div className="subtitle" style={{ margin: '16px 0' }}>{tr('Für diese Woche gibt es noch kein Ziel.')}</div>;
  return (
    <ul className="db-quick-list">
      {rows.map(r => (
        <li key={r.ch.id}>
          <div className="db-quick-row-head">
            <span className="db-quick-name">{r.cat?.name}</span>
            <span className="db-quick-mine mono">
              {r.isObligatory ? (r.meFinished ? tr('erledigt') : tr('offen'))
                : tr('du {done}/{total}', { done: fmtAmount(r.minutes, r.myDone), total: fmtAmount(r.minutes, r.share) })}
            </span>
          </div>
          {r.isObligatory
            ? <div className="db-quick-sub">{tr('{done} von {total} erledigt', { done: r.total, total: r.goal })}</div>
            : <TugBar sides={sides} values={r.doneBySide} goals={r.sideGoals} minutes={r.minutes} compact />}
        </li>
      ))}
    </ul>
  );
}

// ─── Schnellansicht einer Challenge ─────────────────────────────────────────
function ChallengeQuickSheet({ card, weekStart, daysLeft, onOpen, onClose }) {
  if (!card) return null;
  const { c, sides, rows, duel } = card;
  return (
    <div className="db-quick">
      <div className="db-quick-head">
        <span className="db-quick-emoji" aria-hidden="true">{c.emoji}</span>
        <div>
          <h2 className="title" style={{ margin: 0 }}>{c.name}</h2>
          <div className="subtitle">{tr('KW {week}', { week: weekNumber(weekStart) })} · {daysLeft === 0 ? tr('letzter Tag') : trn(daysLeft, 'noch {n} Tag', 'noch {n} Tage')}</div>
        </div>
      </div>
      {sides.length >= 2 && rows.length > 0 && (
        <DuelCard entries={duel}
          title={sides.length === 2 ? tr('Duell') : tr('Rangliste')}
          meta={modeLabel(c.mode)} />
      )}
      <ChallengeInsights sides={sides} rows={rows} />
      <div className="btn-row" style={{ marginTop: 20 }}>
        <button className="btn btn-secondary" onClick={onClose}>{tr('Schließen')}</button>
        <button className="btn" onClick={onOpen}>{tr('Challenge öffnen')}</button>
      </div>
    </div>
  );
}

Object.assign(window, { TugBar, FocusCarousel, DashboardScreen, ChallengeQuickSheet, ChallengeInsights, ExerciseSlide, fmtAmount, compStatusLine });
