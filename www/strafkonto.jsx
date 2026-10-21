/* global React, PTData, Sheet, PTPeople, Avatar, Icon, CountUp, tr, trn, trc, PTi18n */
const { useState } = React;

// Cent-Betrag in der App-Sprache: 500 → „5 €“ / „€5“
function formatEuro(cents) {
  return PTi18n.euro(cents);
}

function weekLabel(weekStart) {
  const d = new Date(weekStart + 'T00:00:00');
  const a = new Date(d); a.setHours(0,0,0,0);
  a.setDate(a.getDate() + 4 - (a.getDay() || 7));
  const yStart = new Date(a.getFullYear(), 0, 1);
  const kw = Math.ceil((((a - yStart) / 86400000) + 1) / 7);
  return tr('KW {n}', { n: kw });
}

function reasonText(p) {
  switch (p.rule_mode) {
    case 'per_challenge':      return tr('einzelne Challenge verfehlt');
    case 'per_week_any':       return tr('min. 1 Challenge verfehlt');
    case 'per_week_all':       return tr('alle Challenges verfehlt');
    case 'per_week_aggregate': return tr('Wochensumme verfehlt');
    default:                   return p.rule_mode;
  }
}

// Kontostand: Strafen minus Einzahlungen, gesamt und pro Person (Cent).
// openPeople = Personen mit offenem Saldo; 0, wenn insgesamt nichts offen ist.
// Gemeinsame Rechnung für den Strafkonto-Screen und den Badge am Tab (app.jsx).
function penaltySummary(penalties = [], payouts = []) {
  const totalPenalties = penalties.reduce((a, p) => a + (p.amount_cents || 0), 0);
  const totalPayouts = payouts.reduce((a, p) => a + (p.amount_cents || 0), 0);
  const potOpen = totalPenalties - totalPayouts;
  const saldo = {};
  for (const p of penalties) saldo[p.athlete] = (saldo[p.athlete] || 0) + (p.amount_cents || 0);
  for (const p of payouts) saldo[p.athlete] = (saldo[p.athlete] || 0) - (p.amount_cents || 0);
  const openPeople = potOpen > 0 ? Object.values(saldo).filter(v => v > 0).length : 0;
  return { totalPenalties, totalPayouts, potOpen, saldo, openPeople };
}

// Strafregel als ein Satz für Neue (Regelnamen wie in den Einstellungen).
function obRuleLine(cfg) {
  const amount = formatEuro(cfg.amount_cents ?? 500);
  switch (cfg.rule_mode) {
    case 'per_challenge': return tr('Für jede Übung unter deinem Teil zahlst du {amount}.', { amount });
    case 'per_week_any': return tr('Wer sonntags bei einer Übung unter seinem Teil liegt, zahlt {amount}.', { amount });
    case 'per_week_all': return tr('Wer sonntags bei allen Übungen unter seinem Teil liegt, zahlt {amount}.', { amount });
    default: return tr('Wer sonntags unter seinem Teil liegt, zahlt {amount} in die Kasse.', { amount });
  }
}

function StrafkontoScreen({ api, me, members = [], penalties, closures, openClosures, payouts = [], onChange, onOpenSettings }) {
  const [closing, setClosing] = useState(null);
  const [penaltyEdit, setPenaltyEdit] = useState(null);
  const [reopenWk, setReopenWk] = useState(null);
  const [addPayout, setAddPayout] = useState(false);
  const [payoutEdit, setPayoutEdit] = useState(null);
  // Regel für den leeren Zustand (neue Challenge): in einer Zeile, ohne Fachbegriffe.
  const [cfg, setCfg] = useState(null);
  const isEmpty = !penalties.length && !openClosures.length && !closures.length && !payouts.length;
  React.useEffect(() => {
    if (!isEmpty || !api?.getPenaltyConfig) return;
    let alive = true;
    api.getPenaltyConfig().then(c => { if (alive) setCfg(c); }).catch(() => {});
    return () => { alive = false; };
  }, [api, isEmpty]);

  const { totalPayouts, potOpen } = penaltySummary(penalties, payouts);

  // Pro Person (auch Ausgetretene, solange sie Strafen/Einzahlungen haben); ich zuerst.
  const people = [...new Set([me, ...members.map(m => m.user_id), ...penalties.map(p => p.athlete), ...payouts.map(p => p.athlete)])]
    .filter(Boolean)
    .map(id => ({
      id,
      pen: penalties.filter(p => p.athlete === id).reduce((a, p) => a + p.amount_cents, 0),
      pay: payouts.filter(p => p.athlete === id).reduce((a, p) => a + p.amount_cents, 0),
    }))
    .filter(x => x.id === me || x.pen > 0 || x.pay > 0 || members.some(m => m.user_id === x.id && !m.left_at));
  const anyPen = people.some(x => x.pen > 0);
  const anyPay = people.some(x => x.pay > 0);
  const who = (id) => id === me ? tr('Du') : PTPeople.firstNameOf(id);
  const cls = (id) => id === me ? 'b' : 'j';

  const closuresWithoutPenalty = closures.filter(c => !penalties.find(p => p.week_start === c.week_start));

  if (!penalties.length && !openClosures.length && !closures.length && !payouts.length) {
    return (
      <div className="strafkonto-screen">
        <div className="strafkonto-header">
          <div className="title">{tr('Strafkonto')}</div>
          <button className="icon-btn" aria-label={tr('Strafregeln einstellen')} onClick={onOpenSettings}>
            <Icon name="settings" size={20} />
          </button>
        </div>
        <div className="rd-empty">
          <div className="rd-empty-title">{tr('Noch sauber.')}</div>
          <div className="rd-empty-text">{tr('Lasst es so.')}{cfg ? ` ${obRuleLine(cfg)}` : ''}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="strafkonto-screen">
      <div className="strafkonto-header">
        <div className="title">{tr('Strafkonto')}</div>
        <button className="icon-btn" aria-label={tr('Strafregeln einstellen')} onClick={onOpenSettings}>
          <Icon name="settings" size={20} />
        </button>
      </div>

      <section className="rd-card rd-balance" aria-label={tr('Kontostand')}>
        <div className="rd-overline">{trc('Betrag', 'Offen')}</div>
        <div className="rd-balance-amount mono"><CountUp value={Math.max(0, potOpen)} format={formatEuro} /></div>
        <div className="rd-balance-sub">
          {trn(penalties.length, '{n} Strafe', '{n} Strafen')}
          {payouts.length > 0 && ` · ${tr('{amount} eingezahlt', { amount: formatEuro(totalPayouts) })}`}
        </div>
        {anyPen && (
          <div className="rd-balance-split">
            {people.map(x => {
              const saldo = x.pen - x.pay;
              return (
                <div key={x.id} className="rd-balance-person">
                  <Avatar userId={x.id} size={32} />
                  <div>
                    <div className="rd-balance-person-name">{who(x.id)}</div>
                    <div className="rd-balance-person-val mono">{saldo > 0 ? formatEuro(saldo) : tr('beglichen')}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <button className="btn" onClick={() => setAddPayout(true)}>{tr('Begleichen')}</button>
      </section>

      {openClosures.length > 0 && (
        <div className="strafkonto-section">
          <div className="strafkonto-section-label">{tr('Offene Abschlüsse')}</div>
          <div className="rd-card rd-list">
          {openClosures.map(w => (
            <div key={w} className="open-closure-row" onClick={() => setClosing(w)}>
              <span className="open-closure-label">{tr('{week} abschließen', { week: weekLabel(w) })}</span>
              <span className="open-closure-chev"><Icon name="chevron" size={18} /></span>
            </div>
          ))}
          </div>
        </div>
      )}

      {penalties.length > 0 && (
        <div className="strafkonto-section">
          <div className="strafkonto-section-label">{tr('Strafen')}</div>
          <div className="rd-card rd-list">
          {penalties.map(p => (
            <div key={p.id} className="penalty-row" onClick={() => setPenaltyEdit(p)}>
              <div className="penalty-row-main">
                <div className="penalty-row-head">{weekLabel(p.week_start)} · {PTPeople.nameOf(p.athlete)}</div>
                <div className="penalty-row-meta">{reasonText(p)}</div>
              </div>
              <div className={`penalty-row-amount mono ${cls(p.athlete)}`}>
                –{formatEuro(p.amount_cents)}
              </div>
            </div>
          ))}
          </div>
        </div>
      )}

      {payouts.length > 0 && (
        <div className="strafkonto-section">
          <div className="strafkonto-section-label">{tr('Einzahlungen')}</div>
          <div className="rd-card rd-list">
          {payouts.map(p => (
            <div key={p.id} className="penalty-row payout" onClick={() => setPayoutEdit(p)}>
              <div className="penalty-row-main">
                <div className="penalty-row-head">
                  {PTPeople.nameOf(p.athlete)} · {PTi18n.date(p.paid_at)}
                </div>
                {p.note && <div className="penalty-row-meta">{tr('„{note}“', { note: p.note })}</div>}
              </div>
              <div className={`penalty-row-amount mono ${cls(p.athlete)}`}>
                +{formatEuro(p.amount_cents)}
              </div>
            </div>
          ))}
          </div>
        </div>
      )}

      {closuresWithoutPenalty.length > 0 && (
        <div className="strafkonto-section">
          <div className="strafkonto-section-label">{tr('Straffreie Wochen')}</div>
          <div className="rd-card rd-list">
          {closuresWithoutPenalty.map(c => (
            <div key={c.week_start} className="penalty-row" onClick={() => setReopenWk(c.week_start)}>
              <div className="penalty-row-main">
                <div className="penalty-row-head">{weekLabel(c.week_start)} · {tr('straffrei')}</div>
              </div>
              <span className="penalty-row-reopen" aria-label={tr('Woche neu öffnen')}><Icon name="history" size={18} /></span>
            </div>
          ))}
          </div>
        </div>
      )}

      {closing && (
        <WeekCloseSheet weekStart={closing} api={api} me={me}
          onClose={() => setClosing(null)}
          onDone={() => { setClosing(null); onChange?.(); }}/>
      )}
      {penaltyEdit && (
        <PenaltyEditSheet penalty={penaltyEdit} api={api}
          onClose={() => setPenaltyEdit(null)}
          onReopen={() => { setReopenWk(penaltyEdit.week_start); setPenaltyEdit(null); }}
          onDone={() => { setPenaltyEdit(null); onChange?.(); }}/>
      )}
      {reopenWk && (
        <ReopenSheet weekStart={reopenWk} api={api} penalties={penalties}
          onClose={() => setReopenWk(null)}
          onDone={() => { setReopenWk(null); onChange?.(); }}/>
      )}
      {addPayout && (
        <PayoutSheet api={api} me={me} members={members} potOpen={potOpen}
          onClose={() => setAddPayout(false)}
          onDone={() => { setAddPayout(false); onChange?.(); }}/>
      )}
      {payoutEdit && (
        <PayoutEditSheet payout={payoutEdit} api={api}
          onClose={() => setPayoutEdit(null)}
          onDone={() => { setPayoutEdit(null); onChange?.(); }}/>
      )}
    </div>
  );
}

function PenaltyEditSheet({ penalty, api, onClose, onReopen, onDone }) {
  const [busy, setBusy] = useState(false);
  async function remove() {
    if (!confirm(tr('Diese Strafe löschen?'))) return;
    setBusy(true);
    try { await api.deletePenalty(penalty.id); onDone(); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  return (
    <Sheet open={true} onClose={onClose}>
      <h2 className="title" style={{marginBottom:8}}>{tr('Strafe')}</h2>
      <div className="subtitle" style={{marginBottom:18}}>
        {weekLabel(penalty.week_start)} · {PTPeople.nameOf(penalty.athlete)} · {formatEuro(penalty.amount_cents)}
      </div>
      <div style={{color:'var(--text-2)',marginBottom:18,fontSize:15}}>
        {reasonText(penalty)} · {tr('gebucht {date}', { date: PTi18n.date(penalty.created_at) })}
      </div>
      <div style={{display:'flex',gap:8,justifyContent:'flex-end',flexWrap:'wrap'}}>
        <button className="btn-ghost-sm" onClick={onClose} disabled={busy}>{tr('Abbrechen')}</button>
        <button className="btn-ghost-sm" onClick={remove} disabled={busy}>{tr('Strafe löschen')}</button>
        <button className="btn-ghost-sm primary" onClick={onReopen} disabled={busy}>{tr('Woche neu öffnen')}</button>
      </div>
    </Sheet>
  );
}

function ReopenSheet({ weekStart, api, penalties, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const weekPenalties = penalties.filter(p => p.week_start === weekStart);
  async function reopen() {
    setBusy(true);
    try { await api.reopenWeek(weekStart); onDone(); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  return (
    <Sheet open={true} onClose={onClose}>
      <h2 className="title" style={{marginBottom:8}}>{tr('{week} neu öffnen?', { week: weekLabel(weekStart) })}</h2>
      <div className="subtitle" style={{marginBottom:18}}>
        {tr('Der Wochenabschluss wird zurückgenommen. Danach kannst du nachloggen und neu abschließen.')}
      </div>
      {weekPenalties.length > 0 && (
        <div style={{marginBottom:16,padding:'10px 12px',background:'var(--surface-2)',borderRadius:8,fontSize:14}}>
          {trn(weekPenalties.length, '{n} Strafe dieser Woche wird ebenfalls gelöscht:', '{n} Strafen dieser Woche werden ebenfalls gelöscht:')}
          <ul style={{margin:'6px 0 0 18px',padding:0}}>
            {weekPenalties.map(p => (
              <li key={p.id}>{PTPeople.nameOf(p.athlete)} — {formatEuro(p.amount_cents)}</li>
            ))}
          </ul>
        </div>
      )}
      <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
        <button className="btn-ghost-sm" onClick={onClose} disabled={busy}>{tr('Abbrechen')}</button>
        <button className="btn-ghost-sm primary" onClick={reopen} disabled={busy}>{tr('Neu öffnen')}</button>
      </div>
    </Sheet>
  );
}

function PayoutSheet({ api, me, members = [], potOpen, onClose, onDone }) {
  const [athlete, setAthlete] = useState(me);
  const active = members.filter(m => !m.left_at);
  const defaultEur = potOpen > 0 ? Math.round(potOpen / 100) : 5;
  const [amount, setAmount] = useState(String(defaultEur));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    const eur = parseFloat(amount.replace(',', '.'));
    if (!Number.isFinite(eur) || eur <= 0) { alert(tr('Betrag muss > 0 sein')); return; }
    setBusy(true);
    try {
      await api.addPayout({ athlete, amount_cents: Math.round(eur * 100), note: note || null });
      onDone();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  return (
    <Sheet open={true} onClose={onClose}>
      <h2 className="title" style={{marginBottom:8}}>{tr('Einzahlung verbuchen')}</h2>
      <div className="subtitle" style={{marginBottom:18}}>{tr('Wer hat wieviel beglichen?')}</div>

      <div className="label" style={{marginBottom:8}}>{tr('Wer?')}</div>
      <div className="chip-row" style={{marginBottom:16, flexWrap:'wrap'}}>
        {active.map(m => (
          <button key={m.user_id} className={`chip ${athlete===m.user_id?'chip-active':''}`} onClick={() => setAthlete(m.user_id)}>
            {m.user_id === me ? tr('Ich') : m.profile?.display_name}
          </button>
        ))}
      </div>

      <div className="label" style={{marginBottom:6}}>{tr('Betrag (€)')}</div>
      <input className="quick-chip-input" style={{width:'100%',marginBottom:14}}
        type="number" min="0.01" step="0.01" inputMode="decimal"
        value={amount} onChange={e => setAmount(e.target.value)}
        onFocus={e => e.target.select()}/>

      <div className="label" style={{marginBottom:6}}>{tr('Notiz (optional)')}</div>
      <input className="quick-chip-input" style={{width:'100%'}}
        type="text" value={note} onChange={e => setNote(e.target.value)}
        placeholder={tr('z.B. Pizza bezahlt, Bier-Runde')}/>

      <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:18}}>
        <button className="btn-ghost-sm" onClick={onClose} disabled={busy}>{tr('Abbrechen')}</button>
        <button className="btn-ghost-sm primary" onClick={save} disabled={busy}>{tr('Verbuchen')}</button>
      </div>
    </Sheet>
  );
}

function PayoutEditSheet({ payout, api, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  async function remove() {
    if (!confirm(tr('Einzahlung löschen?'))) return;
    setBusy(true);
    try { await api.deletePayout(payout.id); onDone(); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  return (
    <Sheet open={true} onClose={onClose}>
      <h2 className="title" style={{marginBottom:8}}>{tr('Einzahlung')}</h2>
      <div className="subtitle" style={{marginBottom:18}}>
        {PTPeople.nameOf(payout.athlete)} · {formatEuro(payout.amount_cents)} · {PTi18n.date(payout.paid_at)}
      </div>
      {payout.note && (
        <div style={{marginBottom:18,color:'var(--text-2)',fontSize:15}}>{tr('„{note}“', { note: payout.note })}</div>
      )}
      <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
        <button className="btn-ghost-sm" onClick={onClose} disabled={busy}>{tr('Schließen')}</button>
        <button className="btn-ghost-sm primary" onClick={remove} disabled={busy}>{tr('Löschen')}</button>
      </div>
    </Sheet>
  );
}

function WeekCloseSheet({ weekStart, api, me, onClose, onDone }) {
  const [preview, setPreview] = React.useState(null);
  const [busy, setBusy] = useState(false);

  // Vorschau scheitert (z. B. offline): Meldung zeigen und schließen statt endlos „Lade Vorschau…“.
  React.useEffect(() => {
    let alive = true;
    api.previewWeekClose(weekStart)
      .then(r => { if (alive) setPreview(r); })
      .catch(e => {
        if (!alive) return;
        console.error('previewWeekClose failed', e);
        alert(e?.message || tr('Die Vorschau konnte nicht geladen werden. Versuch es gleich nochmal.'));
        onClose();
      });
    return () => { alive = false; };
  }, [api, weekStart]);

  async function closeWeek() {
    setBusy(true);
    try { await api.closeWeek(weekStart); onDone(); }
    catch (e) { alert(e.message); onClose(); } finally { setBusy(false); }
  }

  const pens = preview?.penalties || [];
  const total = pens.reduce((a, p) => a + p.amount_cents, 0);

  return (
    <Sheet open={true} onClose={onClose}>
      <h2 className="title" style={{marginBottom:8}}>{tr('{week} abschließen?', { week: weekLabel(weekStart) })}</h2>
      {!preview ? <div className="subtitle">{tr('Lade Vorschau…')}</div> : pens.length ? (
        <>
          <div className="subtitle" style={{marginBottom:12}}>{tr('Folgende Strafen werden gebucht:')}</div>
          {pens.map((p, i) => (
            <div key={i} style={{padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
              <div style={{fontWeight:600}}>{PTPeople.nameOf(p.athlete)} — {formatEuro(p.amount_cents)}</div>
              {/* Regel statt p.reason: der Grund aus PTData ist interner deutscher Text */}
              <div style={{fontSize:13,color:'var(--text-2)',marginTop:2}}>{reasonText(p)}</div>
            </div>
          ))}
          <div style={{marginTop:12,fontWeight:700,fontSize:17}}>{tr('Gesamt: {amount}', { amount: formatEuro(total) })}</div>
        </>
      ) : (
        <div className="subtitle">✓ {tr('Alle haben ihren Anteil geschafft. Keine Strafen.')}</div>
      )}
      <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:18}}>
        <button className="btn-ghost-sm" onClick={onClose} disabled={busy}>{tr('Abbrechen')}</button>
        <button className="btn-ghost-sm primary" onClick={closeWeek} disabled={busy || !preview}>
          {pens.length ? tr('Verbuchen') : trc('Woche', 'Abschließen')}
        </button>
      </div>
    </Sheet>
  );
}

window.StrafkontoScreen = StrafkontoScreen;
window.formatEuro = formatEuro;
window.penaltySummary = penaltySummary;
window.WeekCloseSheet = WeekCloseSheet;
