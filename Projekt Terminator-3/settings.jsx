/* global React, PTData, Icon */
const { useState, useEffect, useMemo } = React;

function SettingsScreen({ api, categories, onAddCategory }) {
  const [slots, setSlots] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function reload() {
    try {
      const [s, c] = await Promise.all([api.getPlanSlots(), api.getRotationConfig()]);
      setSlots(s);
      setConfig(c);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, []);

  const catById = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c])), [categories]);

  // Group slots by week_index
  const byWeek = useMemo(() => {
    const m = {};
    for (const s of slots) (m[s.week_index] ||= []).push(s);
    return m;
  }, [slots]);

  const cycleLength = slots.length ? Math.max(...slots.map(s => s.week_index)) + 1 : 0;

  async function addWeek() {
    const newIndex = cycleLength;
    if (!categories.length) return;
    try {
      await api.addPlanSlot({
        week_index: newIndex,
        category_id: categories[0].id,
        start_target: 100,
        growth_pct: 10,
        position: 0,
      });
      reload();
    } catch (e) { alert(e.message); }
  }

  async function addSlotToWeek(weekIndex) {
    const used = new Set((byWeek[weekIndex]||[]).map(s => s.category_id));
    const cat = categories.find(c => !used.has(c.id)) || categories[0];
    if (!cat) return;
    try {
      await api.addPlanSlot({
        week_index: weekIndex,
        category_id: cat.id,
        start_target: 100,
        growth_pct: 10,
        position: (byWeek[weekIndex]||[]).length,
      });
      reload();
    } catch (e) { alert(e.message); }
  }

  async function patchSlot(id, patch) {
    try { await api.updatePlanSlot(id, patch); reload(); }
    catch (e) { alert(e.message); }
  }

  async function deleteSlot(id) {
    if (!confirm('Diesen Eintrag aus dem Plan entfernen?')) return;
    try { await api.deletePlanSlot(id); reload(); }
    catch (e) { alert(e.message); }
  }

  async function deleteWeek(weekIndex) {
    if (!confirm(`Woche ${weekIndex + 1} komplett aus dem Plan entfernen?`)) return;
    const toDel = byWeek[weekIndex] || [];
    try {
      await Promise.all(toDel.map(s => api.deletePlanSlot(s.id)));
      // shift higher weeks down
      const toShift = slots.filter(s => s.week_index > weekIndex);
      await Promise.all(toShift.map(s => api.updatePlanSlot(s.id, { week_index: s.week_index - 1 })));
      reload();
    } catch (e) { alert(e.message); }
  }

  async function toggleEnabled() {
    const next = !config.enabled;
    try {
      await api.setRotationConfig({ enabled: next });
      if (next && cycleLength > 0) {
        // Plan-First: overwrite current week with this cycle's plan slots
        await applyPlanToCurrentWeek({ silent: true });
      }
      reload();
    } catch (e) { alert(e.message); }
  }

  async function applyPlanToCurrentWeek({ silent } = {}) {
    if (!cycleLength) return;
    const weekStart = PTData.isoDate(PTData.mondayOf(new Date()));
    const proposals = PTData.suggestForWeek({ weekStart, slots, config: { ...config, enabled: true } });
    if (!proposals.length) return;
    if (!silent && !confirm('Aktuelle Woche aus Plan überschreiben? Bestehende Challenges dieser Woche bleiben erhalten, Ziele werden angeglichen.')) return;
    try {
      const existing = await api.listChallenges();
      const thisWeek = existing.filter(c => c.week_start === weekStart);
      for (const p of proposals) {
        const match = thisWeek.find(c => c.category_id === p.category_id);
        if (match) {
          await api.upsertChallenge({ id: match.id, week_start: weekStart, category_id: p.category_id, chosen_by: match.chosen_by, target_reps: p.target_reps });
        } else {
          await api.upsertChallenge({ week_start: weekStart, category_id: p.category_id, chosen_by: p.chosen_by || 'Benny', target_reps: p.target_reps });
        }
      }
    } catch (e) { if (!silent) alert(e.message); }
  }

  if (loading) return <div className="empty"><div>Lade Plan…</div></div>;

  return (
    <div>
      <div className="card">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
          <div>
            <div className="label" style={{margin:0}}>Rotations-Plan</div>
            <div className="subtitle" style={{fontSize:13,marginTop:2}}>
              {cycleLength > 0
                ? `${cycleLength} Wochen-Zyklus, dann wiederholt sich der Plan`
                : 'Noch kein Plan – lege deine erste Wochen-Vorlage an'}
            </div>
          </div>
          <label className="toggle-switch">
            <input type="checkbox" checked={!!config?.enabled} onChange={toggleEnabled}/>
            <span className="toggle-slider"/>
          </label>
        </div>
        {!!config?.start_date && (
          <div className="subtitle mono" style={{fontSize:12, marginBottom:0}}>Startwoche: {config.start_date}</div>
        )}
        {cycleLength > 0 && (
          <div className="first-picker-row">
            <label className="plan-field" style={{flex:1}}>
              <span>Startdatum</span>
              <input className="input plan-input mono" type="date"
                value={config?.start_date || ''}
                onChange={e => api.setRotationConfig({ start_date: e.target.value }).then(reload)}/>
            </label>
          </div>
        )}
      </div>

      {cycleLength === 0 && (
        <div className="empty" style={{padding:'28px 16px'}}>
          <div className="emoji">🗓️</div>
          <div className="title">Plan ist leer</div>
          <div style={{marginBottom:18}}>Definiere die Kategorien einer Woche. Pro Woche kannst du mehrere Übungen festlegen, und nach Ablauf wiederholt sich der Zyklus mit gewachsenem Ziel.</div>
          <button className="btn" onClick={addWeek}>Erste Woche anlegen</button>
        </div>
      )}

      {Array.from({length: cycleLength}, (_, w) => {
        const tag = String.fromCharCode(65 + (w % 26));
        return (
        <div className="card plan-week" key={w}>
          <div className="plan-week-head">
            <div>
              <div className="plan-week-num">Woche {w + 1} · <span className={`plan-owner-tag tag-${w%2===0?'a':'b'}`}>{tag}-Woche</span></div>
              <div className="subtitle" style={{fontSize:12, marginTop:2}}>{(byWeek[w]||[]).length} Übung{(byWeek[w]||[]).length === 1 ? '' : 'en'}</div>
            </div>
            <button className="icon-btn icon-btn-danger" aria-label="Woche löschen" onClick={() => deleteWeek(w)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
            </button>
          </div>

          {(byWeek[w] || []).map(slot => (
            <PlanSlotRow key={slot.id} slot={slot} catById={catById} categories={categories}
              usedInWeek={(byWeek[w]||[]).filter(s => s.id !== slot.id).map(s => s.category_id)}
              onChange={patch => patchSlot(slot.id, patch)}
              onDelete={() => deleteSlot(slot.id)}/>
          ))}

          <button className="btn-ghost-sm" style={{marginTop:6}} onClick={() => addSlotToWeek(w)}>
            + Übung hinzufügen
          </button>
        </div>
        );
      })}

      {cycleLength > 0 && (
        <button className="btn btn-secondary" style={{marginTop:14}} onClick={addWeek}>
          + Woche {cycleLength + 1} hinzufügen
        </button>
      )}

      {cycleLength > 0 && config?.enabled && (
        <button className="btn btn-secondary plan-sync-btn" onClick={() => applyPlanToCurrentWeek({})}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          Aktuelle Woche aus Plan setzen
        </button>
      )}

      {error && <div style={{color:'var(--danger)', marginTop:12}}>{error}</div>}
    </div>
  );
}

function PlanSlotRow({ slot, catById, categories, usedInWeek, onChange, onDelete }) {
  const cat = catById[slot.category_id];
  const usedSet = new Set(usedInWeek);
  const [target, setTarget] = useState(String(slot.start_target));
  const [growth, setGrowth] = useState(String(slot.growth_pct));
  useEffect(() => { setTarget(String(slot.start_target)); }, [slot.start_target]);
  useEffect(() => { setGrowth(String(slot.growth_pct)); }, [slot.growth_pct]);
  const commitTarget = () => {
    const v = parseInt(target) || 0;
    if (v !== slot.start_target) onChange({ start_target: v });
  };
  const commitGrowth = () => {
    const v = parseFloat(growth) || 0;
    if (v !== Number(slot.growth_pct)) onChange({ growth_pct: v });
  };
  return (
    <div className="plan-slot">
      <div className="plan-slot-cat">
        <span className="plan-slot-emoji">{cat?.emoji || '?'}</span>
        <select className="plan-slot-select" value={slot.category_id || ''}
          onChange={e => onChange({ category_id: e.target.value })}>
          {categories.map(c => (
            <option key={c.id} value={c.id} disabled={usedSet.has(c.id)}>{c.emoji} {c.name}</option>
          ))}
        </select>
      </div>
      <div className="plan-slot-controls">
        <label className="plan-field">
          <span>Start-Reps</span>
          <input className="input plan-input mono" type="number" inputMode="numeric"
            value={target}
            onFocus={e => e.target.select()}
            onChange={e => setTarget(e.target.value)}
            onBlur={commitTarget}
            onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}/>
        </label>
        <label className="plan-field">
          <span>Wachstum / Zyklus</span>
          <div className="plan-growth">
            <div className="plan-input-suffix" style={{flex:1}}>
              <input className="input plan-input mono" type="number" inputMode="numeric" step={(slot.growth_mode||'pct')==='abs'?1:5}
                value={growth}
                onFocus={e => e.target.select()}
                onChange={e => setGrowth(e.target.value)}
                onBlur={commitGrowth}
                onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}/>
              <span className="suffix">{(slot.growth_mode||'pct')==='abs' ? 'Reps' : '%'}</span>
            </div>
            <div className="growth-mode-toggle" role="tablist">
              <button type="button" className={(slot.growth_mode||'pct')==='pct'?'active':''} onClick={() => onChange({ growth_mode: 'pct' })}>%</button>
              <button type="button" className={slot.growth_mode==='abs'?'active':''} onClick={() => onChange({ growth_mode: 'abs' })}>+</button>
            </div>
          </div>
        </label>
        <button className="icon-btn icon-btn-danger" aria-label="Übung entfernen" onClick={onDelete}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>
  );
}

// Banner shown on Home when current week is empty AND there's a plan suggestion
function ProposalBanner({ proposals, categories, onAccept, onDismiss }) {
  const catById = Object.fromEntries(categories.map(c => [c.id, c]));
  if (!proposals?.length) return null;
  return (
    <div className="proposal-card">
      <div className="proposal-head">
        <div>
          <div className="proposal-label">Vorschlag aus deinem Plan</div>
          <div className="proposal-title">Diese Woche</div>
        </div>
        <button className="proposal-dismiss" aria-label="Schließen" onClick={onDismiss}>×</button>
      </div>
      <div className="proposal-list">
        {proposals.map((p, i) => {
          const cat = catById[p.category_id];
          return (
            <div className="proposal-item" key={i}>
              <span className="proposal-emoji">{cat?.emoji}</span>
              <span className="proposal-name">{cat?.name || 'Unbekannt'}</span>
              <span className="proposal-target mono">{p.target_reps}</span>
            </div>
          );
        })}
      </div>
      <div className="proposal-actions">
        <button className="btn btn-secondary" onClick={onDismiss}>Anders machen</button>
        <button className="btn" onClick={onAccept}>Übernehmen</button>
      </div>
    </div>
  );
}

Object.assign(window, { SettingsScreen, PlanSlotRow, ProposalBanner });
