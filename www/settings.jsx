/* global React, PTData, Icon */
const { useState, useEffect, useMemo } = React;

function AppearanceCard() {
  const [theme, setThemeState] = useState(() => {
    try { return localStorage.getItem('pt:theme') || 'dark'; } catch (e) { return 'dark'; }
  });
  const applyTheme = (next) => {
    try { localStorage.setItem('pt:theme', next); } catch (e) {}
    window.dispatchEvent(new CustomEvent('pt:theme-change', { detail: { theme: next } }));
    setThemeState(next);
  };
  return (
    <div className="card">
      <div className="label" style={{margin:0, marginBottom:10}}>Erscheinungsbild</div>
      <div className="segmented">
        <button className={theme==='dark'?'active':''} onClick={() => applyTheme('dark')}>Dunkel</button>
        <button className={theme==='light'?'active':''} onClick={() => applyTheme('light')}>Hell</button>
      </div>
    </div>
  );
}

function NotificationsCard({ enabled, onChange }) {
  return (
    <div className="card">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
        <div>
          <div className="label" style={{margin:0}}>Benachrichtigungen</div>
          <div className="subtitle" style={{fontSize:13,marginTop:2}}>
            Push, wenn der/die andere heute schon &gt;100 Reps hat und du noch bei 0 bist. Max 1×/Tag.
          </div>
        </div>
        <label className="toggle-switch">
          <input type="checkbox" checked={!!enabled} onChange={e => onChange(e.target.checked)}/>
          <span className="toggle-slider"/>
        </label>
      </div>
    </div>
  );
}

function TagList({ tags, onAdd, onUpdate, onDelete }) {
  const [adding, setAdding] = React.useState(false);
  const [newName, setNewName] = React.useState('');
  const [newEmoji, setNewEmoji] = React.useState('📁');
  const [editingId, setEditingId] = React.useState(null);
  const [editName, setEditName] = React.useState('');
  const [editEmoji, setEditEmoji] = React.useState('');

  async function doAdd() {
    if (!newName.trim()) return;
    await onAdd(newName.trim(), newEmoji);
    setAdding(false); setNewName(''); setNewEmoji('📁');
  }
  async function doUpdate() {
    await onUpdate(editingId, { name: editName.trim(), emoji: editEmoji });
    setEditingId(null);
  }
  async function doDelete(id) {
    if (!confirm('Tag löschen?')) return;
    await onDelete(id);
  }

  return (
    <div className="tag-list">
      {tags.map(t => (
        <div key={t.id} className="tag-row">
          {editingId === t.id ? (
            <>
              <input className="input new-cat-emoji" value={editEmoji}
                onChange={e => setEditEmoji(e.target.value)} maxLength={2} />
              <input className="input" value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && doUpdate()} />
              <button className="new-cat-add new-cat-del" onClick={() => doDelete(t.id)}>🗑</button>
              <button className="new-cat-add" onClick={doUpdate}>✓</button>
            </>
          ) : (
            <>
              <span className="tag-emoji">{t.emoji}</span>
              <span className="tag-name">{t.name}</span>
              <button className="cat-edit" onClick={() => { setEditingId(t.id); setEditName(t.name); setEditEmoji(t.emoji); }}>✎</button>
            </>
          )}
        </div>
      ))}
      {adding ? (
        <div className="new-cat-row">
          <input className="input new-cat-emoji" value={newEmoji}
            onChange={e => setNewEmoji(e.target.value)} maxLength={2} />
          <input className="input" placeholder="Name" autoFocus value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doAdd()} />
          <button className="new-cat-add" onClick={doAdd}>✓</button>
        </div>
      ) : (
        <button className="btn btn-secondary" style={{ marginTop: 8, width: '100%' }}
          onClick={() => setAdding(true)}>+ Tag hinzufügen</button>
      )}
    </div>
  );
}

function WorkTagsCard({ api, projectTags, toolTags, reload }) {
  const wrap = (fn) => async (...args) => { try { await fn(...args); reload(); } catch (e) { alert(e.message); } };
  return (
    <div className="card">
      <div className="label" style={{margin:0, marginBottom:10}}>💻 Work Tags</div>

      <div className="settings-section-label">Projekte</div>
      <TagList
        tags={projectTags}
        onAdd={wrap((n,e) => api.addProjectTag(n, e))}
        onUpdate={wrap((id, p) => api.updateProjectTag(id, p))}
        onDelete={wrap((id) => api.deleteProjectTag(id))}
      />

      <div className="settings-section-label" style={{ marginTop: 20 }}>Tools</div>
      <TagList
        tags={toolTags}
        onAdd={wrap((n,e) => api.addToolTag(n, e))}
        onUpdate={wrap((id, p) => api.updateToolTag(id, p))}
        onDelete={wrap((id) => api.deleteToolTag(id))}
      />
    </div>
  );
}

function SettingsScreen({ api, categories, onAddCategory, notificationsEnabled, onSetNotifications, me, projectTags, toolTags, reload: reloadProp }) {
  const [slots, setSlots] = useState([]);
  const [config, setConfig] = useState(null);
  const [penaltyCfg, setPenaltyCfg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function reload() {
    try {
      const [s, c, pc] = await Promise.all([
        api.getPlanSlots(),
        api.getRotationConfig(),
        api.getPenaltyConfig ? api.getPenaltyConfig() : null,
      ]);
      setSlots(s);
      setConfig(c);
      setPenaltyCfg(pc);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function reloadPenalty() {
    if (!api.getPenaltyConfig) return;
    try { setPenaltyCfg(await api.getPenaltyConfig()); } catch (e) {}
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
        bonus_max: 0,
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
        bonus_max: 0,
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
      reload();
    } catch (e) { alert(e.message); }
  }

  async function applyPlanToCurrentWeek({ silent } = {}) {
    if (!cycleLength) return;
    const weekStart = PTData.isoDate(PTData.mondayOf(new Date()));
    const template = PTData.weekTemplateFor
      ? PTData.weekTemplateFor({ weekStart, slots, config: { ...config, enabled: true } })
      : [];
    if (!template.length) return;
    if (!silent && !confirm('Aktuelle Woche aus Plan überschreiben? Bestehende Challenges dieser Woche bleiben erhalten, Ziele werden auf Basis-Reps gesetzt.')) return;
    try {
      const existing = await api.listChallenges();
      const thisWeek = existing.filter(c => c.week_start === weekStart);
      for (const t of template) {
        const match = thisWeek.find(c => c.category_id === t.category_id);
        if (match) {
          await api.upsertChallenge({ id: match.id, week_start: weekStart, category_id: t.category_id, chosen_by: match.chosen_by, target_reps: t.base_reps });
        } else {
          await api.upsertChallenge({ week_start: weekStart, category_id: t.category_id, chosen_by: 'Benny', target_reps: t.base_reps });
        }
      }
    } catch (e) { if (!silent) alert(e.message); }
  }

  if (loading) return <div className="empty"><div>Lade Plan…</div></div>;

  return (
    <div>
      <AppearanceCard />
      <NotificationsCard enabled={notificationsEnabled} onChange={onSetNotifications}/>
      {penaltyCfg !== null && window.PenaltyConfigCard && (
        <PenaltyConfigCard api={api} cfg={penaltyCfg} me={me} onChange={reloadPenalty}/>
      )}
      {reloadProp && <WorkTagsCard api={api} projectTags={projectTags || []} toolTags={toolTags || []} reload={reloadProp} />}
      <div className="card">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div className="label" style={{margin:0}}>Wochen-Plan</div>
            <div className="subtitle" style={{fontSize:13,marginTop:2}}>
              {cycleLength > 0
                ? `${cycleLength}-Wochen-Zyklus – wer Montags zuerst da ist, fixiert die Reps`
                : 'Noch kein Plan – lege deine erste Wochen-Vorlage an'}
            </div>
          </div>
          <label className="toggle-switch">
            <input type="checkbox" checked={!!config?.enabled} onChange={toggleEnabled}/>
            <span className="toggle-slider"/>
          </label>
        </div>
      </div>

      {cycleLength === 0 && (
        <div className="empty" style={{padding:'28px 16px'}}>
          <div className="emoji">🗓️</div>
          <div className="title">Plan ist leer</div>
          <div style={{marginBottom:18}}>Definiere die Kategorien pro Woche. Für jede Übung legst du eine Basis-Reps-Zahl fest und wie weit man die nach oben drehen darf.</div>
          <button className="btn" onClick={addWeek}>Erste Woche anlegen</button>
        </div>
      )}

      {Array.from({length: cycleLength}, (_, w) => (
        <div className="card plan-week" key={w}>
          <div className="plan-week-head">
            <div>
              <div className="plan-week-num">Woche {w + 1}</div>
              <div className="subtitle" style={{fontSize:13, marginTop:2}}>{(byWeek[w]||[]).length} Übung{(byWeek[w]||[]).length === 1 ? '' : 'en'}</div>
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
      ))}

      {cycleLength > 0 && (
        <button className="btn btn-secondary" style={{marginTop:14}} onClick={addWeek}>
          + Woche {cycleLength + 1} hinzufügen
        </button>
      )}

      {cycleLength > 0 && config?.enabled && (
        <button className="btn btn-secondary plan-sync-btn" onClick={() => applyPlanToCurrentWeek({})}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          Aktuelle Woche auf Basis-Reps setzen
        </button>
      )}

      {error && <div style={{color:'var(--danger)', marginTop:12}}>{error}</div>}
    </div>
  );
}

function PlanSlotRow({ slot, catById, categories, usedInWeek, onChange, onDelete }) {
  const cat = catById[slot.category_id];
  const usedSet = new Set(usedInWeek);
  const [base, setBase] = useState(String(slot.start_target));
  const [max, setMax] = useState(String(slot.start_target + (slot.bonus_max||0)));
  useEffect(() => { setBase(String(slot.start_target)); }, [slot.start_target]);
  useEffect(() => { setMax(String(slot.start_target + (slot.bonus_max||0))); }, [slot.start_target, slot.bonus_max]);
  const commitBase = () => {
    const v = Math.max(1, parseInt(base) || 1);
    const m = Math.max(v, parseInt(max) || v);
    const patch = {};
    if (v !== slot.start_target) patch.start_target = v;
    const newBonus = m - v;
    if (newBonus !== (slot.bonus_max||0)) patch.bonus_max = newBonus;
    if (Object.keys(patch).length) onChange(patch);
    setBase(String(v));
    setMax(String(m));
  };
  const commitMax = () => {
    const v = parseInt(base) || 1;
    const m = Math.max(v, parseInt(max) || v);
    const newBonus = m - v;
    if (newBonus !== (slot.bonus_max||0)) onChange({ bonus_max: newBonus });
    setMax(String(m));
  };
  // visual track: scale 0..(max*1.15) so the handles never touch the edges
  const numericMax = parseInt(max) || 0;
  const numericBase = parseInt(base) || 0;
  const trackScale = Math.max(numericMax * 1.15, 100);
  const basePct = Math.min(100, (numericBase / trackScale) * 100);
  const maxPct = Math.min(100, (numericMax / trackScale) * 100);
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
        <button className="icon-btn icon-btn-danger" aria-label="Übung entfernen" onClick={onDelete}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div className="plan-range">
        <div className="plan-range-track">
          <div className="plan-range-fill" style={{ left: `${basePct}%`, width: `${Math.max(0, maxPct - basePct)}%` }}/>
          <div className="plan-range-handle" style={{ left: `${basePct}%` }}/>
          <div className="plan-range-handle" style={{ left: `${maxPct}%` }}/>
        </div>
        <div className="plan-range-inputs">
          <label className="plan-range-input">
            <span>Basis</span>
            <input className="input mono" type="number" inputMode="numeric" min={1}
              value={base}
              onFocus={e => e.target.select()}
              onChange={e => setBase(e.target.value)}
              onBlur={commitBase}
              onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}/>
          </label>
          <span className="plan-range-arrow">→</span>
          <label className="plan-range-input">
            <span>Max</span>
            <input className="input mono" type="number" inputMode="numeric" min={1}
              value={max}
              onFocus={e => e.target.select()}
              onChange={e => setMax(e.target.value)}
              onBlur={commitMax}
              onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}/>
          </label>
        </div>
      </div>
    </div>
  );
}

// Card on Home: the first person of the week picks the reps for every exercise.
// Default = base_reps, range = [base_reps, base_reps + bonus_max].
function WeekFixCard({ template, categories, me, onFix, onDismiss }) {
  const catById = Object.fromEntries(categories.map(c => [c.id, c]));
  const [values, setValues] = useState(() => {
    const initial = {};
    for (const t of template) initial[t.slot_id] = t.base_reps;
    return initial;
  });
  const [busy, setBusy] = useState(false);
  if (!template?.length) return null;

  const step = (n) => n < 30 ? 1 : n < 100 ? 5 : 10;
  const bump = (t, dir) => {
    const cur = values[t.slot_id] ?? t.base_reps;
    const next = Math.max(1, cur + dir * step(cur));
    setValues({ ...values, [t.slot_id]: next });
  };
  const setExact = (t, raw) => {
    const v = parseInt(raw);
    if (!Number.isFinite(v) || v < 1) return;
    setValues({ ...values, [t.slot_id]: v });
  };

  const fix = async () => {
    setBusy(true);
    try { await onFix(template.map(t => ({ category_id: t.category_id, target_reps: values[t.slot_id] ?? t.base_reps }))); }
    finally { setBusy(false); }
  };

  return (
    <div className="weekfix-card">
      <div className="weekfix-head">
        <div>
          <div className="weekfix-label">Neue Woche</div>
          <div className="weekfix-title">Reps für diese Woche fixieren</div>
          <div className="weekfix-sub">Wer zuerst da ist, setzt das Ziel für beide.</div>
        </div>
        {onDismiss && (
          <button className="weekfix-dismiss" aria-label="Später" onClick={onDismiss}>×</button>
        )}
      </div>
      <div className="weekfix-list">
        {template.map(t => {
          const cat = catById[t.category_id];
          const cur = values[t.slot_id] ?? t.base_reps;
          const isObligatory = cat?.challenge_type === 'tom_holland' || cat?.challenge_type === 'bring_sally_up';
          return (
            <div className="weekfix-item" key={t.slot_id}>
              <div className="weekfix-item-head">
                <span className="weekfix-item-emoji">{cat?.emoji || '?'}</span>
                <span className="weekfix-item-name">{cat?.name || 'Unbekannt'}</span>
                {isObligatory && <span className="weekfix-pflicht-badge">PFLICHT</span>}
              </div>
              {isObligatory ? (
                <div className="weekfix-range weekfix-range-fixed" style={{textAlign:'center',padding:'10px 0'}}>Wird jede Woche gemacht</div>
              ) : (
                <>
                  <div className="weekfix-stepper">
                    <button className="weekfix-step" disabled={cur <= 1}
                      onClick={() => bump(t, -1)} aria-label="weniger">−</button>
                    <input className="weekfix-val mono" type="number" inputMode="numeric"
                      value={cur}
                      onFocus={e => e.target.select()}
                      onChange={e => setExact(t, e.target.value)}/>
                    <button className="weekfix-step"
                      onClick={() => bump(t, 1)} aria-label="mehr">+</button>
                  </div>
                  <div className="weekfix-range weekfix-range-fixed">Vorschlag: {t.base_reps}</div>
                </>
              )}
            </div>
          );
        })}
      </div>
      <button className={`btn weekfix-cta ${busy?'is-loading':''}`} disabled={busy} onClick={fix}>
        {busy ? 'Wird gesetzt…' : 'Woche starten'}
      </button>
    </div>
  );
}

Object.assign(window, { SettingsScreen, PlanSlotRow, WeekFixCard, AppearanceCard, NotificationsCard, TagList, WorkTagsCard });
