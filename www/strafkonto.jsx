/* global React, PTData, Sheet */
const { useState } = React;

function formatEuro(cents) {
  const v = cents / 100;
  return v.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €';
}

function weekLabel(weekStart) {
  const d = new Date(weekStart + 'T00:00:00');
  const a = new Date(d); a.setHours(0,0,0,0);
  a.setDate(a.getDate() + 4 - (a.getDay() || 7));
  const yStart = new Date(a.getFullYear(), 0, 1);
  const kw = Math.ceil((((a - yStart) / 86400000) + 1) / 7);
  return `KW ${kw}`;
}

function reasonText(p) {
  switch (p.rule_mode) {
    case 'per_challenge':      return 'einzelne Challenge verfehlt';
    case 'per_week_any':       return 'min. 1 Challenge verfehlt';
    case 'per_week_all':       return 'alle Challenges verfehlt';
    case 'per_week_aggregate': return 'aggregiert verfehlt';
    default:                   return p.rule_mode;
  }
}

function StrafkontoScreen({ api, me, penalties, closures, openClosures, payouts = [], onChange, onOpenSettings }) {
  const [closing, setClosing] = useState(null);
  const [penaltyEdit, setPenaltyEdit] = useState(null);
  const [reopenWk, setReopenWk] = useState(null);
  const [addPayout, setAddPayout] = useState(false);
  const [payoutEdit, setPayoutEdit] = useState(null);

  const totalPenalties = penalties.reduce((a, p) => a + p.amount_cents, 0);
  const totalPayouts   = payouts.reduce((a, p) => a + p.amount_cents, 0);
  const potOpen        = totalPenalties - totalPayouts;

  const penBenny = penalties.filter(p => p.athlete === 'Benny').reduce((a, p) => a + p.amount_cents, 0);
  const penJonas = penalties.filter(p => p.athlete === 'Jonas').reduce((a, p) => a + p.amount_cents, 0);
  const payBenny = payouts.filter(p => p.athlete === 'Benny').reduce((a, p) => a + p.amount_cents, 0);
  const payJonas = payouts.filter(p => p.athlete === 'Jonas').reduce((a, p) => a + p.amount_cents, 0);

  const closuresWithoutPenalty = closures.filter(c => !penalties.find(p => p.week_start === c.week_start));

  if (!penalties.length && !openClosures.length && !closures.length && !payouts.length) {
    return (
      <div className="strafkonto-screen">
        <div className="strafkonto-header">
          <div className="title">Strafkonto</div>
          <button className="icon-btn" aria-label="Einstellungen" onClick={onOpenSettings}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="9"/></svg>
          </button>
        </div>
        <div className="strafkonto-empty">
          <div className="emoji">🧼</div>
          <div>Noch sauber. Lasst es so.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="strafkonto-screen">
      <div className="strafkonto-header">
        <div className="title">Strafkonto</div>
        <button className="icon-btn" aria-label="Einstellungen" onClick={onOpenSettings}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="9"/></svg>
        </button>
      </div>

      <div className="strafkonto-pot">
        <div className="strafkonto-pot-amount mono">{formatEuro(Math.max(0, potOpen))}</div>
        <div className="strafkonto-pot-label">offen</div>
        {(penBenny > 0 || penJonas > 0) && (
          <div className="strafkonto-stats">
            <div className="strafkonto-stat">
              <div className="strafkonto-stat-label">Schulden (Beitrag)</div>
              <div className="strafkonto-stat-row">
                <span className="b">Benny {formatEuro(penBenny)}</span>
                <span className="j">Jonas {formatEuro(penJonas)}</span>
              </div>
            </div>
            {(payBenny > 0 || payJonas > 0) && (
              <div className="strafkonto-stat">
                <div className="strafkonto-stat-label">Eingezahlt</div>
                <div className="strafkonto-stat-row">
                  <span className="b">Benny {formatEuro(payBenny)}</span>
                  <span className="j">Jonas {formatEuro(payJonas)}</span>
                </div>
              </div>
            )}
            <div className="strafkonto-stat">
              <div className="strafkonto-stat-label">Saldo</div>
              <div className="strafkonto-stat-row">
                <span className={`b ${penBenny - payBenny <= 0 ? 'positive' : ''}`}>
                  Benny {penBenny - payBenny > 0 ? '–' : ''}{formatEuro(Math.abs(penBenny - payBenny))}
                </span>
                <span className={`j ${penJonas - payJonas <= 0 ? 'positive' : ''}`}>
                  Jonas {penJonas - payJonas > 0 ? '–' : ''}{formatEuro(Math.abs(penJonas - payJonas))}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <button className="btn" style={{width:'100%',marginTop:8,marginBottom:14}} onClick={() => setAddPayout(true)}>
        + Einzahlung verbuchen
      </button>

      {openClosures.length > 0 && (
        <div className="strafkonto-section">
          <div className="strafkonto-section-label">Offene Abschlüsse</div>
          {openClosures.map(w => (
            <div key={w} className="open-closure-row" onClick={() => setClosing(w)}>
              <span className="open-closure-label">{weekLabel(w)} abschließen</span>
              <span className="open-closure-chev">▸</span>
            </div>
          ))}
        </div>
      )}

      {penalties.length > 0 && (
        <div className="strafkonto-section">
          <div className="strafkonto-section-label">Strafen</div>
          {penalties.map(p => (
            <div key={p.id} className="penalty-row" onClick={() => setPenaltyEdit(p)}>
              <div className="penalty-row-main">
                <div className="penalty-row-head">{weekLabel(p.week_start)} · {p.athlete}</div>
                <div className="penalty-row-meta">{reasonText(p)}</div>
              </div>
              <div className={`penalty-row-amount mono ${p.athlete === 'Benny' ? 'b' : 'j'}`}>
                –{formatEuro(p.amount_cents)}
              </div>
            </div>
          ))}
        </div>
      )}

      {payouts.length > 0 && (
        <div className="strafkonto-section">
          <div className="strafkonto-section-label">Einzahlungen</div>
          {payouts.map(p => (
            <div key={p.id} className="penalty-row payout" onClick={() => setPayoutEdit(p)}>
              <div className="penalty-row-main">
                <div className="penalty-row-head">
                  {p.athlete} · {new Date(p.paid_at).toLocaleDateString('de-DE')}
                </div>
                {p.note && <div className="penalty-row-meta">„{p.note}"</div>}
              </div>
              <div className={`penalty-row-amount mono ${p.athlete === 'Benny' ? 'b' : 'j'}`}>
                +{formatEuro(p.amount_cents)}
              </div>
            </div>
          ))}
        </div>
      )}

      {closuresWithoutPenalty.length > 0 && (
        <div className="strafkonto-section">
          <div className="strafkonto-section-label">Abgeschlossene Wochen — straffrei</div>
          {closuresWithoutPenalty.map(c => (
            <div key={c.week_start} className="penalty-row" onClick={() => setReopenWk(c.week_start)}>
              <div className="penalty-row-main">
                <div className="penalty-row-head">✓ {weekLabel(c.week_start)} · alles geschafft</div>
              </div>
              <span className="penalty-row-reopen" aria-label="Woche neu öffnen">↻</span>
            </div>
          ))}
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
        <PayoutSheet api={api} me={me} potOpen={potOpen}
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
    if (!confirm('Diese Strafe löschen?')) return;
    setBusy(true);
    try { await api.deletePenalty(penalty.id); onDone(); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  return (
    <Sheet open={true} onClose={onClose}>
      <h2 className="title" style={{marginBottom:8}}>Strafe</h2>
      <div className="subtitle" style={{marginBottom:18}}>
        {weekLabel(penalty.week_start)} · {penalty.athlete} · {formatEuro(penalty.amount_cents)}
      </div>
      <div style={{color:'var(--text-2)',marginBottom:18,fontSize:15}}>
        {reasonText(penalty)} · gebucht {new Date(penalty.created_at).toLocaleDateString('de-DE')}
      </div>
      <div style={{display:'flex',gap:8,justifyContent:'flex-end',flexWrap:'wrap'}}>
        <button className="btn-ghost-sm" onClick={onClose} disabled={busy}>Abbrechen</button>
        <button className="btn-ghost-sm" onClick={remove} disabled={busy}>Strafe löschen</button>
        <button className="btn-ghost-sm primary" onClick={onReopen} disabled={busy}>Woche neu öffnen</button>
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
      <h2 className="title" style={{marginBottom:8}}>{weekLabel(weekStart)} neu öffnen?</h2>
      <div className="subtitle" style={{marginBottom:18}}>
        Closure wird gelöscht — danach kannst du nachloggen und neu abschließen.
      </div>
      {weekPenalties.length > 0 && (
        <div style={{marginBottom:16,padding:'10px 12px',background:'var(--surface-2)',borderRadius:8,fontSize:14}}>
          {weekPenalties.length} Strafe(n) dieser Woche werden ebenfalls gelöscht:
          <ul style={{margin:'6px 0 0 18px',padding:0}}>
            {weekPenalties.map(p => (
              <li key={p.id}>{p.athlete} — {formatEuro(p.amount_cents)}</li>
            ))}
          </ul>
        </div>
      )}
      <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
        <button className="btn-ghost-sm" onClick={onClose} disabled={busy}>Abbrechen</button>
        <button className="btn-ghost-sm primary" onClick={reopen} disabled={busy}>Neu öffnen</button>
      </div>
    </Sheet>
  );
}

function PayoutSheet({ api, me, potOpen, onClose, onDone }) {
  const [athlete, setAthlete] = useState(me === 'Jonas' ? 'Jonas' : 'Benny');
  const defaultEur = potOpen > 0 ? Math.round(potOpen / 100) : 5;
  const [amount, setAmount] = useState(String(defaultEur));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    const eur = parseFloat(amount.replace(',', '.'));
    if (!Number.isFinite(eur) || eur <= 0) { alert('Betrag muss > 0 sein'); return; }
    setBusy(true);
    try {
      await api.addPayout({ athlete, amount_cents: Math.round(eur * 100), note: note || null });
      onDone();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  return (
    <Sheet open={true} onClose={onClose}>
      <h2 className="title" style={{marginBottom:8}}>Einzahlung verbuchen</h2>
      <div className="subtitle" style={{marginBottom:18}}>Wer hat wieviel beglichen?</div>

      <div className="label" style={{marginBottom:8}}>Athlet</div>
      <div className="segmented" style={{marginBottom:16}}>
        {['Benny','Jonas'].map(n => (
          <button key={n} className={athlete===n?'active':''} onClick={() => setAthlete(n)}>{n}</button>
        ))}
      </div>

      <div className="label" style={{marginBottom:6}}>Betrag (€)</div>
      <input className="quick-chip-input" style={{width:'100%',marginBottom:14}}
        type="number" min="0.01" step="0.01" inputMode="decimal"
        value={amount} onChange={e => setAmount(e.target.value)}
        onFocus={e => e.target.select()}/>

      <div className="label" style={{marginBottom:6}}>Notiz (optional)</div>
      <input className="quick-chip-input" style={{width:'100%'}}
        type="text" value={note} onChange={e => setNote(e.target.value)}
        placeholder="z.B. Pizza bezahlt, Bier-Runde"/>

      <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:18}}>
        <button className="btn-ghost-sm" onClick={onClose} disabled={busy}>Abbrechen</button>
        <button className="btn-ghost-sm primary" onClick={save} disabled={busy}>Verbuchen</button>
      </div>
    </Sheet>
  );
}

function PayoutEditSheet({ payout, api, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  async function remove() {
    if (!confirm('Einzahlung löschen?')) return;
    setBusy(true);
    try { await api.deletePayout(payout.id); onDone(); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  return (
    <Sheet open={true} onClose={onClose}>
      <h2 className="title" style={{marginBottom:8}}>Einzahlung</h2>
      <div className="subtitle" style={{marginBottom:18}}>
        {payout.athlete} · {formatEuro(payout.amount_cents)} · {new Date(payout.paid_at).toLocaleDateString('de-DE')}
      </div>
      {payout.note && (
        <div style={{marginBottom:18,color:'var(--text-2)',fontSize:15}}>„{payout.note}"</div>
      )}
      <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
        <button className="btn-ghost-sm" onClick={onClose} disabled={busy}>Schließen</button>
        <button className="btn-ghost-sm primary" onClick={remove} disabled={busy}>Löschen</button>
      </div>
    </Sheet>
  );
}

function WeekCloseSheet({ weekStart, api, me, onClose, onDone }) {
  const [preview, setPreview] = React.useState(null);
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    let alive = true;
    api.previewWeekClose(weekStart).then(r => { if (alive) setPreview(r); });
    return () => { alive = false; };
  }, [api, weekStart]);

  async function confirm() {
    setBusy(true);
    try { await api.closeWeek(weekStart, me); onDone(); }
    catch (e) { alert(e.message); onClose(); } finally { setBusy(false); }
  }

  const pens = preview?.penalties || [];
  const total = pens.reduce((a, p) => a + p.amount_cents, 0);

  return (
    <Sheet open={true} onClose={onClose}>
      <h2 className="title" style={{marginBottom:8}}>{weekLabel(weekStart)} abschließen?</h2>
      {!preview ? <div className="subtitle">Lade Vorschau…</div> : pens.length ? (
        <>
          <div className="subtitle" style={{marginBottom:12}}>Folgende Strafen werden gebucht:</div>
          {pens.map((p, i) => (
            <div key={i} style={{padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
              <div style={{fontWeight:600}}>{p.athlete} — {formatEuro(p.amount_cents)}</div>
              <div style={{fontSize:13,color:'var(--text-2)',marginTop:2}}>{p.reason}</div>
            </div>
          ))}
          <div style={{marginTop:12,fontWeight:700,fontSize:17}}>Gesamt: {formatEuro(total)}</div>
        </>
      ) : (
        <div className="subtitle">✓ Beide haben geschafft. Keine Strafen.</div>
      )}
      <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:18}}>
        <button className="btn-ghost-sm" onClick={onClose} disabled={busy}>Abbrechen</button>
        <button className="btn-ghost-sm primary" onClick={confirm} disabled={busy || !preview}>
          {pens.length ? 'Verbuchen' : 'Abschließen'}
        </button>
      </div>
    </Sheet>
  );
}

function PenaltyConfigCard({ api, cfg, me, onChange }) {
  const [busy, setBusy] = useState(false);
  const modes = [
    { id: 'per_week_aggregate', name: 'Aggregiert pro Woche', desc: 'Summe Reps < Summe fairShare → Strafe' },
    { id: 'per_challenge',      name: 'Pro Challenge',         desc: 'Eine Strafe pro verfehlter Challenge' },
    { id: 'per_week_any',       name: 'Min. 1 Challenge verfehlt', desc: 'Eine Strafe pro Woche, falls min. 1 nicht geschafft' },
    { id: 'per_week_all',       name: 'Alle Challenges verfehlt',  desc: 'Strafe nur, wenn gar nichts geschafft' },
  ];

  async function patch(p) {
    setBusy(true);
    try { await api.setPenaltyConfig({ ...p, _by: me }); onChange?.(); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="card">
      <div className="label" style={{marginBottom:10}}>Strafkonto</div>
      <div className="penalty-config">
        <div className="penalty-config-row">
          <label>Aktiv</label>
          <label className="toggle-switch">
            <input type="checkbox" checked={!!cfg?.enabled}
              onChange={e => patch({ enabled: e.target.checked })} disabled={busy}/>
            <span className="toggle-slider"/>
          </label>
        </div>
        <div className="penalty-config-row">
          <label>Betrag pro Strafe (€)</label>
          <input type="number" min="1" step="1" disabled={busy}
            defaultValue={cfg ? Math.round(cfg.amount_cents / 100) : 5}
            onBlur={e => {
              const eur = parseInt(e.target.value);
              if (Number.isFinite(eur) && eur > 0) patch({ amount_cents: eur * 100 });
            }}/>
        </div>
        <div className="penalty-mode-list">
          {modes.map(m => (
            <div key={m.id}
              className={`penalty-mode-row ${cfg?.rule_mode === m.id ? 'active' : ''}`}
              onClick={() => !busy && patch({ rule_mode: m.id })}>
              <span className="penalty-mode-radio"/>
              <div className="penalty-mode-text">
                <div className="penalty-mode-name">{m.name}</div>
                <div className="penalty-mode-desc">{m.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

window.StrafkontoScreen = StrafkontoScreen;
window.PenaltyConfigCard = PenaltyConfigCard;
window.WeekCloseSheet = WeekCloseSheet;
