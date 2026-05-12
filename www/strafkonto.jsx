/* global React, PTData, Sheet */
const { useState } = React;

function formatEuro(cents) {
  return (cents / 100).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €';
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

function StrafkontoScreen({ api, me, penalties, closures, openClosures, onChange, onOpenSettings }) {
  const [settlement, setSettlement] = useState(null);
  const [closing, setClosing] = useState(null);

  const open = penalties.filter(p => !p.paid);
  const paid = penalties.filter(p => p.paid);
  const potTotal = open.reduce((a, p) => a + p.amount_cents, 0);
  const potBenny = open.filter(p => p.athlete === 'Benny').reduce((a, p) => a + p.amount_cents, 0);
  const potJonas = open.filter(p => p.athlete === 'Jonas').reduce((a, p) => a + p.amount_cents, 0);
  const closuresWithoutPenalty = closures.filter(c => !penalties.find(p => p.week_start === c.week_start));

  if (!penalties.length && !openClosures.length && !closures.length) {
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
        <div className="strafkonto-pot-amount mono">{formatEuro(potTotal)}</div>
        <div className="strafkonto-pot-label">im Topf</div>
        {(potBenny > 0 || potJonas > 0) && (
          <div className="strafkonto-pot-split">
            <span className="b">Benny: {formatEuro(potBenny)}</span>
            {' · '}
            <span className="j">Jonas: {formatEuro(potJonas)}</span>
          </div>
        )}
      </div>

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

      {open.length > 0 && (
        <div className="strafkonto-section">
          <div className="strafkonto-section-label">Offen</div>
          {open.map(p => (
            <div key={p.id} className="penalty-row" onClick={() => setSettlement(p)}>
              <div className="penalty-row-main">
                <div className="penalty-row-head">{weekLabel(p.week_start)} · {p.athlete}</div>
                <div className="penalty-row-meta">{reasonText(p)}</div>
              </div>
              <div className="penalty-row-amount mono">{formatEuro(p.amount_cents)}</div>
              <div className="penalty-check"/>
            </div>
          ))}
        </div>
      )}

      {paid.length > 0 && (
        <div className="strafkonto-section">
          <div className="strafkonto-section-label">Bezahlt</div>
          {paid.map(p => (
            <div key={p.id} className="penalty-row paid" onClick={() => setSettlement(p)}>
              <div className="penalty-row-main">
                <div className="penalty-row-head">{weekLabel(p.week_start)} · {p.athlete}</div>
                <div className="penalty-row-meta">
                  {p.note || 'bezahlt'}{p.paid_at ? ` · ${new Date(p.paid_at).toLocaleDateString('de-DE')}` : ''}
                </div>
              </div>
              <div className="penalty-row-amount mono">{formatEuro(p.amount_cents)}</div>
              <div className="penalty-check">✓</div>
            </div>
          ))}
        </div>
      )}

      {closuresWithoutPenalty.length > 0 && (
        <div className="strafkonto-section">
          <div className="strafkonto-section-label">Abgeschlossene Wochen — straffrei</div>
          {closuresWithoutPenalty.map(c => (
            <div key={c.week_start} className="penalty-row">
              <div className="penalty-row-main">
                <div className="penalty-row-head">✓ {weekLabel(c.week_start)} · alles geschafft</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {settlement && (
        <SettlementSheet penalty={settlement} api={api} me={me}
          onClose={() => setSettlement(null)}
          onDone={() => { setSettlement(null); onChange?.(); }}/>
      )}
      {closing && (
        <WeekCloseSheet weekStart={closing} api={api} me={me}
          onClose={() => setClosing(null)}
          onDone={() => { setClosing(null); onChange?.(); }}/>
      )}
    </div>
  );
}

function SettlementSheet({ penalty, api, me, onClose, onDone }) {
  const [note, setNote] = useState(penalty.note || '');
  const [busy, setBusy] = useState(false);

  async function settle() {
    setBusy(true);
    try { await api.markPenaltyPaid(penalty.id, { note: note || null, by: me }); onDone(); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  async function unsettle() {
    setBusy(true);
    try { await api.unmarkPenaltyPaid(penalty.id); onDone(); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  async function remove() {
    if (!confirm('Strafe wirklich löschen?')) return;
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
      {!penalty.paid ? (
        <>
          <div className="label" style={{marginBottom:6}}>Notiz (optional)</div>
          <input className="quick-chip-input" style={{width:'100%'}}
            type="text" value={note} onChange={e => setNote(e.target.value)}
            placeholder="z.B. Pizza ausgegeben"/>
          <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:16}}>
            <button className="btn-ghost-sm" onClick={onClose}>Abbrechen</button>
            <button className="btn-ghost-sm" onClick={remove} disabled={busy}>Löschen</button>
            <button className="btn-ghost-sm primary" onClick={settle} disabled={busy}>Einlösen</button>
          </div>
        </>
      ) : (
        <>
          <div style={{marginBottom:16,color:'var(--text-2)'}}>
            Bezahlt von {penalty.paid_by || '–'} am {penalty.paid_at ? new Date(penalty.paid_at).toLocaleDateString('de-DE') : '–'}
            {penalty.note ? ` · „${penalty.note}"` : ''}
          </div>
          <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
            <button className="btn-ghost-sm" onClick={onClose}>Schließen</button>
            <button className="btn-ghost-sm" onClick={remove} disabled={busy}>Löschen</button>
            <button className="btn-ghost-sm primary" onClick={unsettle} disabled={busy}>Zurücksetzen</button>
          </div>
        </>
      )}
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
