/* global React, Ring, Icon, Sheet, Stepper, Toast, formatRelative, formatWeek, weekNumber, todayGreeting */
const { useState, useEffect, useMemo } = React;

// Per-athlete-per-category quick-log values, stored locally.
function getQuickSets(athlete, catId) {
  try {
    const all = JSON.parse(localStorage.getItem('quickSets') || '{}');
    return all[`${athlete}:${catId}`] || [5, 10, 15];
  } catch { return [5, 10, 15]; }
}
function setQuickSets(athlete, catId, arr) {
  const all = JSON.parse(localStorage.getItem('quickSets') || '{}');
  all[`${athlete}:${catId}`] = arr;
  localStorage.setItem('quickSets', JSON.stringify(all));
}

function QuickLogRow({ me, catId, onQuick }) {
  const [values, setValues] = useState(() => getQuickSets(me, catId));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(values);

  useEffect(() => { setValues(getQuickSets(me, catId)); setEditing(false); }, [me, catId]);

  function commit(next) {
    const clean = next.filter(n => Number.isFinite(n) && n > 0).slice(0, 6);
    setQuickSets(me, catId, clean);
    setValues(clean);
    setDraft(clean);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="quick-row quick-row-edit">
        <div className="quick-row-label">Schnellsatz für {me}</div>
        <div className="quick-chips">
          {draft.map((v, i) => (
            <div key={i} className="quick-chip-edit">
              <input className="quick-chip-input mono" type="number" inputMode="numeric"
                value={v}
                onChange={e => {
                  const n = parseInt(e.target.value);
                  const next = [...draft]; next[i] = Number.isFinite(n) ? n : 0; setDraft(next);
                }}
                onFocus={e => e.target.select()} />
              <button className="quick-chip-del" aria-label="Entfernen"
                onClick={() => setDraft(draft.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          {draft.length < 6 && (
            <button className="quick-chip-add" onClick={() => setDraft([...draft, 10])}>＋</button>
          )}
        </div>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:10}}>
          <button className="btn-ghost-sm" onClick={() => { setDraft(values); setEditing(false); }}>Abbrechen</button>
          <button className="btn-ghost-sm primary" onClick={() => commit(draft)}>Speichern</button>
        </div>
      </div>
    );
  }

  return (
    <div className="quick-row">
      <div className="quick-row-head">
        <span className="quick-row-label">Schnellsatz · {me}</span>
        <button className="quick-edit-btn" aria-label="Schnellsatz bearbeiten" onClick={() => { setDraft(values); setEditing(true); }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </button>
      </div>
      <div className="quick-chips">
        {values.length === 0 && <span className="quick-empty">Tippe ✎ um Schnellsätze festzulegen</span>}
        {values.map((v, i) => (
          <button key={i} className="quick-chip mono" onClick={() => onQuick(v)}>+{v}</button>
        ))}
      </div>
    </div>
  );
}

// ─── HEUTE (Home) ────────────────────────────────────────────────────────────
function HomeScreen({ api, me, challenges = [], categories = [], allSets = [], layout, onAddGoal, onEditChallenge, onLogChallenge, onQuickLog,
  // back-compat with old prop names if file got reverted
  challenge, category, sets, onSetup, onLog }) {
  // If invoked with old single-challenge API, normalize to new shape
  if (!challenges?.length && challenge) {
    challenges = [challenge];
    allSets = sets || [];
    categories = category ? [category] : categories;
    onAddGoal = onSetup; onEditChallenge = () => onSetup?.(); onLogChallenge = () => onLog?.();
  }
  const catById = Object.fromEntries(categories.map(c => [c.id, c]));

  if (!challenges.length) {
    return (
      <div className="empty">
        <div className="emoji">🏁</div>
        <div className="title">Diese Woche ist offen</div>
        <div style={{marginBottom: 24}}>Legt euer erstes Wochenziel fest.</div>
        <button className="btn" onClick={onAddGoal}>Ziel anlegen</button>
      </div>
    );
  }
  return (
    <div className={`layout-${layout}`}>
      {challenges.map(ch => {
        const cat = catById[ch.category_id];
        const csets = allSets.filter(s => s.challenge_id === ch.id);
        const total = csets.reduce((s, x) => s + x.reps, 0);
        const bennyDone = csets.filter(s => s.athlete === 'Benny').reduce((s,x)=>s+x.reps, 0);
        const jonasDone = csets.filter(s => s.athlete === 'Jonas').reduce((s,x)=>s+x.reps, 0);
        const pct = Math.min(1, total / ch.target_reps);
        const pctInt = Math.round(pct * 100);
        const remaining = Math.max(0, ch.target_reps - total);
        const fairShare = Math.ceil(ch.target_reps / 2);
        const bennyOwed = Math.max(0, fairShare - bennyDone);
        const jonasOwed = Math.max(0, fairShare - jonasDone);
        return (
          <div key={ch.id} className="hero-card" style={{marginBottom: 14}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:22,fontWeight:800,letterSpacing:'-0.03em'}}>
                  <span style={{marginRight:8}}>{cat?.emoji}</span>{cat?.name}
                </div>
                <div className="subtitle" style={{marginTop:2,fontSize:13,fontWeight:500}}>Gewählt von {ch.chosen_by}</div>
              </div>
              <button className="icon-btn" aria-label="Bearbeiten" onClick={() => onEditChallenge(ch)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              </button>
            </div>
            {layout==='rings' && <div style={{display:'flex',justifyContent:'center',marginTop:12}}>
              <Ring pct={pct} size={180} stroke={18}>
                <div className="display mono" style={{fontSize:44,lineHeight:1}}>{pctInt}%</div>
                <div className="subtitle mono" style={{marginTop:4,fontSize:13}}>{total} / {ch.target_reps}</div>
              </Ring></div>}
            {layout==='bar' && <>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginTop:12}}>
                <div className="display mono" style={{fontSize:44,lineHeight:1}}>{pctInt}%</div>
                <div className="subtitle mono">{total} / {ch.target_reps}</div></div>
              <div className="progress-bar-wrap"><div className="progress-bar-fill" style={{width:`${pct*100}%`}}/></div>
              <div className="subtitle" style={{fontSize:13,fontWeight:500}}>{remaining>0?`Noch ${remaining} Reps`:'🎉 Ziel erreicht!'}</div></>}
            {layout==='numeric' && <div style={{textAlign:'center',marginTop:12}}>
              <div className="big-number mono" style={{fontSize:72}}>{pctInt}%</div>
              <div className="of mono">{total} / {ch.target_reps} Reps</div>
              <div style={{marginTop:8,fontSize:13,color:'var(--text-2)'}}>{remaining>0?`Noch ${remaining}`:'🎉 Ziel erreicht'}</div></div>}
            <div className="split-row">
              <div className="split-cell benny">
                <div className="who"><img src="uploads/benny.jpg" alt="Benny" className="cell-avatar"/>Benny</div>
                <div className="v mono">{bennyDone}<span className="owe-of"> / {fairShare}</span></div>
                <div className={`owe mono ${bennyOwed===0?'done':''}`}>{bennyOwed===0?'✓ erledigt':`noch ${bennyOwed}`}</div></div>
              <div className="split-cell jonas">
                <div className="who"><img src="uploads/jonas.jpg" alt="Jonas" className="cell-avatar"/>Jonas</div>
                <div className="v mono">{jonasDone}<span className="owe-of"> / {fairShare}</span></div>
                <div className={`owe mono ${jonasOwed===0?'done':''}`}>{jonasOwed===0?'✓ erledigt':`noch ${jonasOwed}`}</div></div>
            </div>
            <button className="btn" style={{marginTop:16}} onClick={() => onLogChallenge(ch)}>+ Satz für {cat?.name} loggen</button>
            <QuickLogRow me={me} catId={ch.category_id} onQuick={(v) => onQuickLog?.(ch, v)} />
          </div>
        );
      })}
    </div>
  );
}
function _HomeScreenOld_unused({ api, me, challenge, category, sets, layout, onSetup, onLog, onSwitchUser }) {
  const total = (sets||[]).reduce((s, x) => s + x.reps, 0);
  const bennyDone = sets.filter((s) => s.athlete === 'Benny').reduce((s, x) => s + x.reps, 0);
  const jonasDone = sets.filter((s) => s.athlete === 'Jonas').reduce((s, x) => s + x.reps, 0);
  const pct = challenge ? Math.min(1, total / challenge.target_reps) : 0;
  const pctInt = Math.round(pct * 100);
  const remaining = challenge ? Math.max(0, challenge.target_reps - total) : 0;
  const fairShare = challenge ? Math.ceil(challenge.target_reps / 2) : 0;
  const bennyOwed = Math.max(0, fairShare - bennyDone);
  const jonasOwed = Math.max(0, fairShare - jonasDone);

  if (!challenge) {
    return (
      <div className="empty">
        <div className="emoji">🏁</div>
        <div className="title">Diese Woche ist offen</div>
        <div style={{ marginBottom: 24 }}>Wer legt Kategorie & Ziel fest?</div>
        <button className="btn" onClick={onSetup}>Woche starten</button>
      </div>);

  }

  return (
    <div className={`layout-${layout}`}>
      <div className="hero-card" style={{ borderRadius: "14px" }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div>
            <div className="label">Diese Woche</div>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', marginTop: 2 }}>
              <span style={{ marginRight: 8 }}>{category?.emoji}</span>{category?.name}
            </div>
            <div className="subtitle" style={{ marginTop: 2, fontSize: 14, fontWeight: 500 }}>
              Gewählt von {challenge.chosen_by}
            </div>
          </div>
          <button className="btn-ghost" style={{ padding: '6px 0' }} onClick={onSetup}>Ändern</button>
        </div>

        {layout === 'rings' &&
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
            <Ring pct={pct} size={220} stroke={22}>
              <div className="display mono" style={{ fontSize: 56, lineHeight: 1 }}>{pctInt}%</div>
              <div className="subtitle mono" style={{ marginTop: 4, fontSize: 14 }}>{total} / {challenge.target_reps}</div>
            </Ring>
          </div>
        }

        {layout === 'bar' &&
        <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 16 }}>
              <div className="display mono" style={{ fontSize: 56, lineHeight: 1 }}>{pctInt}%</div>
              <div className="subtitle mono">{total} / {challenge.target_reps}</div>
            </div>
            <div className="progress-bar-wrap">
              <div className="progress-bar-fill" style={{ width: `${pct * 100}%` }} />
            </div>
            <div className="subtitle" style={{ fontSize: 14, fontWeight: 500 }}>
              {remaining > 0 ? `Noch ${remaining} Reps` : '🎉 Ziel erreicht!'}
            </div>
          </>
        }

        {layout === 'numeric' &&
        <div style={{ textAlign: 'center', marginTop: 16 }}>
            <div className="big-number mono">{pctInt}%</div>
            <div className="of mono">{total} / {challenge.target_reps} Reps</div>
            <div style={{ marginTop: 10, fontSize: 14, color: 'var(--text-2)' }}>
              {remaining > 0 ? `Noch ${remaining} bis zum Wochenziel` : '🎉 Ziel erreicht'}
            </div>
          </div>
        }

        <div className="split-row">
          <div className="split-cell benny">
            <div className="who">Benny</div>
            <div className="v mono">{bennyDone}<span className="owe-of"> / {fairShare}</span></div>
            <div className={`owe mono ${bennyOwed === 0 ? 'done' : ''}`}>
              {bennyOwed === 0 ? '✓ erledigt' : `noch ${bennyOwed}`}
            </div>
          </div>
          <div className="split-cell jonas">
            <div className="who">Jonas</div>
            <div className="v mono">{jonasDone}<span className="owe-of"> / {fairShare}</span></div>
            <div className={`owe mono ${jonasOwed === 0 ? 'done' : ''}`}>
              {jonasOwed === 0 ? '✓ erledigt' : `noch ${jonasOwed}`}
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ margin: "14px 0px", borderRadius: "1px" }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="label">Deine Sätze diese Woche</div>
          <div className="conn-pill">{sets.filter((s) => s.athlete === me).length} Sätze</div>
        </div>
        {sets.filter((s) => s.athlete === me).length === 0 ?
        <div style={{ color: 'var(--text-2)', fontSize: 14, padding: '10px 0' }}>
            Noch nichts geloggt. Tipp unten auf „Satz loggen".
          </div> :

        sets.filter((s) => s.athlete === me).slice(0, 5).map((s) =>
        <div className="list-item" key={s.id}>
              <div className="left">
                <div className="display mono" style={{ fontSize: 22, color: 'var(--accent)', minWidth: 50 }}>+{s.reps}</div>
                <div>
                  <div className="what">{s.note || 'Satz'}</div>
                  <div className="when">{formatRelative(s.created_at)}</div>
                </div>
              </div>
              <button className="del-btn" onClick={() => api.deleteSet(s.id)}>✕</button>
            </div>
        )
        }
      </div>
    </div>);

}

// ─── SETUP WEEK ─────────────────────────────────────────────────────────────
function SetupSheet({ api, me, categories, weekStart, existing, onClose, onSaved, onAddCategory }) {
  const [catId, setCatId] = useState(existing?.category_id || categories[0]?.id || '');
  const [target, setTarget] = useState(existing?.target_reps || 100);
  const [chosenBy, setChosenBy] = useState(existing?.chosen_by || me);
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatEmoji, setNewCatEmoji] = useState('💪');
  const [editingCat, setEditingCat] = useState(null); // {id, name, emoji}
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!catId) return;
    setSaving(true);
    try {
      await api.upsertChallenge({
        week_start: weekStart,
        category_id: catId,
        chosen_by: chosenBy,
        target_reps: target
      });
      onSaved();
    } catch (e) {
      alert(e.message || 'Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  }

  async function addNewCat() {
    if (!newCatName.trim()) return;
    try {
      const cat = await api.addCategory(newCatName.trim(), newCatEmoji);
      onAddCategory();
      setCatId(cat.id);
      setShowNewCat(false);
      setNewCatName('');
    } catch (e) {
      alert(e.message);
    }
  }

  async function saveEdit() {
    if (!editingCat?.name.trim()) return;
    try {
      await api.updateCategory(editingCat.id, { name: editingCat.name.trim(), emoji: editingCat.emoji });
      setEditingCat(null);
      onAddCategory();
    } catch (e) {alert(e.message);}
  }
  async function deleteEdit() {
    if (!editingCat) return;
    if (!confirm(`Kategorie „${editingCat.name}" wirklich löschen?`)) return;
    try {
      await api.deleteCategory(editingCat.id);
      if (catId === editingCat.id) setCatId(categories.find((c) => c.id !== editingCat.id)?.id || '');
      setEditingCat(null);
      onAddCategory();
    } catch (e) {alert(e.message);}
  }

  return (
    <>
      <h2 className="title" style={{ marginBottom: 4 }}>Wochen-Ziel festlegen</h2>
      <div className="subtitle" style={{ marginBottom: 18, fontSize: 14 }}>{formatWeek(weekStart)}</div>

      <div className="label" style={{ marginBottom: 8 }}>Wer hat gewählt?</div>
      <div className="segmented" style={{ marginBottom: 16 }}>
        {['Benny', 'Jonas'].map((n) =>
        <button key={n} className={chosenBy === n ? 'active' : ''} onClick={() => setChosenBy(n)}>
            {n}
          </button>
        )}
      </div>

      <div className="label" style={{ marginBottom: 8 }}>Kategorie</div>

      <div className="cat-grid">
        {categories.map((c) =>
        <div key={c.id} className={`cat-card-wrap ${catId === c.id ? 'selected' : ''}`}>
            <button className={`cat-card ${catId === c.id ? 'selected' : ''}`} onClick={() => setCatId(c.id)}>
              <div className="emoji">{c.emoji}</div>
              <div className="name">{c.name}</div>
            </button>
            <button className="cat-edit" aria-label="Bearbeiten"
          onClick={(e) => {e.stopPropagation();setEditingCat({ ...c });setShowNewCat(false);}}>
              ✎
            </button>
          </div>
        )}
        <button className={`cat-card cat-card-add ${showNewCat ? 'open' : ''}`}
        onClick={() => {setShowNewCat((s) => !s);setEditingCat(null);}}>
          <div className="emoji">＋</div>
          <div className="name">Neue Kategorie</div>
        </button>
      </div>

      {editingCat &&
      <div className="new-cat-row">
          <input className="input new-cat-emoji"
        value={editingCat.emoji}
        onChange={(e) => setEditingCat({ ...editingCat, emoji: e.target.value })}
        maxLength={2} />
          <input className="input"
        value={editingCat.name} autoFocus
        onChange={(e) => setEditingCat({ ...editingCat, name: e.target.value })}
        onKeyDown={(e) => e.key === 'Enter' && saveEdit()} />
          <button className="new-cat-add new-cat-del" onClick={deleteEdit} aria-label="Löschen">🗑</button>
          <button className="new-cat-add" onClick={saveEdit} aria-label="Speichern">✓</button>
        </div>
      }

      {showNewCat &&
      <div className="new-cat-row">
          <input className="input new-cat-emoji"
        value={newCatEmoji} onChange={(e) => setNewCatEmoji(e.target.value)} maxLength={2} />
          <input className="input" placeholder="Name (z.B. Dips)" autoFocus
        value={newCatName} onChange={(e) => setNewCatName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && addNewCat()} />
          <button className="new-cat-add" onClick={addNewCat} aria-label="Hinzufügen">✓</button>
        </div>
      }

      <div className="label" style={{ marginBottom: 0 }}>Ziel-Wiederholungen / Woche</div>
      <Stepper value={target} onChange={setTarget} step={target < 50 ? 5 : target < 200 ? 10 : 25} />
      <div className="chip-row" style={{ justifyContent: 'center' }}>
        {[50, 100, 200, 500].map((v) =>
        <button key={v} className="chip" onClick={() => setTarget(v)}>{v}</button>
        )}
      </div>

      <div className="btn-row" style={{ marginTop: 24 }}>
        <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
        <button className="btn" onClick={save} disabled={saving || !catId}>
          {saving ? '…' : 'Speichern'}
        </button>
      </div>
    </>);

}

// ─── LOG SHEET ──────────────────────────────────────────────────────────────
function LogSheet({ api, me, challenge, category, onClose, onLogged }) {
  const [reps, setReps] = useState(10);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (reps <= 0) return;
    setSaving(true);
    try {
      await api.addSet({
        challenge_id: challenge.id,
        athlete: me,
        reps: parseInt(reps),
        note: note.trim() || null
      });
      onLogged(reps);
    } catch (e) {
      alert(e.message || 'Fehler');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <h2 className="title" style={{ marginBottom: 4 }}>Satz loggen</h2>
      <div className="subtitle" style={{ marginBottom: 20, fontSize: 14 }}>
        {category?.emoji} {category?.name} · {me}
      </div>

      <input
        className="input input-lg mono"
        type="number"
        inputMode="numeric"
        value={reps}
        onChange={(e) => setReps(parseInt(e.target.value) || 0)}
        onFocus={(e) => e.target.select()} />
      

      <div className="chip-row" style={{ justifyContent: 'center', marginTop: 12 }}>
        {[5, 10, 15, 20, 25, 30].map((v) =>
        <button key={v} className="chip" onClick={() => setReps(v)}>{v}</button>
        )}
      </div>

      <input
        className="input"
        placeholder="Notiz (optional, z.B. ‚saubere Form')"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        style={{ marginTop: 16 }} />
      

      <div className="btn-row" style={{ marginTop: 24 }}>
        <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
        <button className="btn" onClick={save} disabled={saving || reps <= 0}>
          {saving ? '…' : `+${reps} loggen`}
        </button>
      </div>
    </>);

}

// ─── FEED ────────────────────────────────────────────────────────────────────
function FeedScreen({ feed }) {
  if (feed.length === 0) {
    return <div className="empty">
      <div className="emoji">📭</div>
      <div className="title">Noch keine Aktivität</div>
      <div>Logge den ersten Satz, um den Feed zu starten.</div>
    </div>;
  }
  return (
    <div className="card">
      <div className="label" style={{ marginBottom: 6 }}>Live-Feed</div>
      {feed.map((s) =>
      <div className="feed-item" key={s.id}>
          <div className={`feed-avatar ${s.athlete.toLowerCase()}`}><img src={`uploads/${s.athlete.toLowerCase()}.jpg`} alt={s.athlete} className="avatar-img"/></div>
          <div className="feed-content">
            <div className="feed-title">
              <strong>{s.athlete}</strong> · {s.category?.emoji} {s.category?.name || '—'}
            </div>
            <div className="feed-meta">
              {formatRelative(s.created_at)}{s.note ? ` · „${s.note}"` : ''}
            </div>
          </div>
          <div className={`feed-reps ${s.athlete.toLowerCase()} mono`}>+{s.reps}</div>
        </div>
      )}
    </div>);

}

// ─── HISTORY ────────────────────────────────────────────────────────────────
function StatsChart({ benny, jonas, days, accent, accent3 }) {
  // benny/jonas: array of {date: 'YYYY-MM-DD', reps: number} length == days
  const W = 320, H = 140, PAD_X = 28, PAD_Y = 18;
  const maxV = Math.max(1, ...benny.map(d => d.reps), ...jonas.map(d => d.reps));
  const xStep = (W - PAD_X * 2) / Math.max(1, days - 1);
  const yScale = (v) => H - PAD_Y - (v / maxV) * (H - PAD_Y * 2);
  const xPos = (i) => PAD_X + i * xStep;

  const pathFor = (arr) => arr.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xPos(i).toFixed(1)} ${yScale(d.reps).toFixed(1)}`).join(' ');
  const areaFor = (arr) => pathFor(arr) + ` L ${xPos(arr.length - 1).toFixed(1)} ${H - PAD_Y} L ${xPos(0).toFixed(1)} ${H - PAD_Y} Z`;

  const gridLines = [0.25, 0.5, 0.75, 1].map(f => H - PAD_Y - f * (H - PAD_Y * 2));

  // x labels — 4-5 evenly spaced
  const labelIdx = days <= 7 ? benny.map((_, i) => i) : [0, Math.floor(days/4), Math.floor(days/2), Math.floor(3*days/4), days - 1];
  const fmt = (s) => { const d = new Date(s); return `${d.getDate()}.${d.getMonth()+1}`; };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="stats-chart" preserveAspectRatio="none">
      <defs>
        <linearGradient id="grad-benny" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.35"/>
          <stop offset="100%" stopColor={accent} stopOpacity="0"/>
        </linearGradient>
        <linearGradient id="grad-jonas" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={accent3} stopOpacity="0.35"/>
          <stop offset="100%" stopColor={accent3} stopOpacity="0"/>
        </linearGradient>
      </defs>
      {gridLines.map((y, i) => <line key={i} x1={PAD_X} x2={W - PAD_X} y1={y} y2={y} stroke="var(--border)" strokeWidth="0.5"/>)}
      <path d={areaFor(benny)} fill="url(#grad-benny)"/>
      <path d={areaFor(jonas)} fill="url(#grad-jonas)"/>
      <path d={pathFor(benny)} fill="none" stroke={accent} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
      <path d={pathFor(jonas)} fill="none" stroke={accent3} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
      {labelIdx.map(i => benny[i] && (
        <text key={i} x={xPos(i)} y={H - 4} fill="var(--text-2)" fontSize="9" textAnchor="middle">{fmt(benny[i].date)}</text>
      ))}
      <text x={PAD_X - 4} y={yScale(maxV) + 3} fill="var(--text-2)" fontSize="9" textAnchor="end">{maxV}</text>
      <text x={PAD_X - 4} y={H - PAD_Y + 3} fill="var(--text-2)" fontSize="9" textAnchor="end">0</text>
    </svg>
  );
}

function HistoryScreen({ challenges, categories, allSets }) {
  const catById = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories]);
  const setsByCh = useMemo(() => {
    const m = {};
    for (const s of allSets) {
      (m[s.challenge_id] ||= []).push(s);
    }
    return m;
  }, [allSets]);

  // Compute streak (consecutive weeks where target was hit, from most recent past)
  const streak = useMemo(() => {
    let s = 0;
    const sorted = [...challenges].sort((a, b) => b.week_start.localeCompare(a.week_start));
    for (const ch of sorted) {
      const total = (setsByCh[ch.id] || []).reduce((a, x) => a + x.reps, 0);
      if (total >= ch.target_reps) s++;else
      break;
    }
    return s;
  }, [challenges, setsByCh]);

  const totalReps = allSets.reduce((s, x) => s + x.reps, 0);
  const weeksDone = challenges.filter((ch) =>
  (setsByCh[ch.id] || []).reduce((a, x) => a + x.reps, 0) >= ch.target_reps
  ).length;

  if (challenges.length === 0) {
    return <div className="empty">
      <div className="emoji">📅</div>
      <div className="title">Noch keine Historie</div>
      <div>Starte deine erste Wochen-Challenge.</div>
    </div>;
  }

  return <HistoryView {...{challenges, categories, allSets, catById, setsByCh, streak, totalReps, weeksDone}} />;
}

function HistoryView({ challenges, categories, allSets, catById, setsByCh, streak, totalReps, weeksDone }) {
  const [range, setRange] = useState('30'); // '7', '30', 'all'
  const [selectedCats, setSelectedCats] = useState([]); // [] = alle

  // Resolve accent colors from CSS vars (read at render time)
  const [accentColors, setAccentColors] = useState({ accent: '#30D158', accent3: '#FFD60A' });
  useEffect(() => {
    const s = getComputedStyle(document.documentElement);
    setAccentColors({
      accent: s.getPropertyValue('--accent').trim() || '#30D158',
      accent3: s.getPropertyValue('--accent-3').trim() || '#FFD60A',
    });
  }, []);

  const days = range === '7' ? 7 : range === '30' ? 30 : null;

  // Which categories were actually used at some point — filter chip source
  const usedCats = useMemo(() => {
    const ids = new Set(challenges.map(c => c.category_id));
    return categories.filter(c => ids.has(c.id));
  }, [categories, challenges]);

  // Map challenge_id -> category_id for fast filtering
  const chCatMap = useMemo(() => Object.fromEntries(challenges.map(c => [c.id, c.category_id])), [challenges]);

  // Apply category filter to sets
  const filteredSets = useMemo(() => {
    if (!selectedCats.length) return allSets;
    const set = new Set(selectedCats);
    return allSets.filter(s => set.has(chCatMap[s.challenge_id]));
  }, [allSets, selectedCats, chCatMap]);

  // Compute date-range buckets (per day, per athlete)
  const { bennySeries, jonasSeries, rangeStart, totalDays } = useMemo(() => {
    let start, total;
    if (days) {
      const d = new Date(); d.setHours(0,0,0,0);
      d.setDate(d.getDate() - (days - 1));
      start = d;
      total = days;
    } else {
      // all time — from earliest set
      const earliest = filteredSets.length
        ? new Date(filteredSets.reduce((m, s) => s.created_at < m ? s.created_at : m, filteredSets[0].created_at))
        : new Date();
      earliest.setHours(0,0,0,0);
      start = earliest;
      const now = new Date(); now.setHours(0,0,0,0);
      total = Math.max(1, Math.round((now - start) / 86400000) + 1);
      total = Math.min(total, 90); // cap for chart
      if (total >= 90) {
        const d2 = new Date(); d2.setHours(0,0,0,0);
        d2.setDate(d2.getDate() - 89);
        start = d2;
      }
    }
    const bennyArr = [], jonasArr = [];
    for (let i = 0; i < total; i++) {
      const d = new Date(start); d.setDate(d.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      bennyArr.push({ date: iso, reps: 0 });
      jonasArr.push({ date: iso, reps: 0 });
    }
    for (const s of filteredSets) {
      const day = String(s.created_at).slice(0, 10);
      const i = Math.round((new Date(day) - start) / 86400000);
      if (i < 0 || i >= total) continue;
      const arr = s.athlete === 'Benny' ? bennyArr : jonasArr;
      arr[i].reps += s.reps;
    }
    return { bennySeries: bennyArr, jonasSeries: jonasArr, rangeStart: start, totalDays: total };
  }, [filteredSets, days, range]);

  // Range-scoped sets (apply both range + category filter)
  const setsInRange = useMemo(() => {
    return filteredSets.filter(s => new Date(String(s.created_at).slice(0,10)) >= rangeStart);
  }, [filteredSets, rangeStart]);

  const bennyStats = useMemo(() => computeAthleteStats(setsInRange, 'Benny', bennySeries), [setsInRange, bennySeries]);
  const jonasStats = useMemo(() => computeAthleteStats(setsInRange, 'Jonas', jonasSeries), [setsInRange, jonasSeries]);
  const maxReps = Math.max(bennyStats.total, jonasStats.total, 1);
  const leader = bennyStats.total > jonasStats.total ? 'Benny' : jonasStats.total > bennyStats.total ? 'Jonas' : null;
  const diff = Math.abs(bennyStats.total - jonasStats.total);

  // Per-category breakdown in range
  const perCat = useMemo(() => {
    const m = {};
    for (const s of setsInRange) {
      const ch = challenges.find(c => c.id === s.challenge_id);
      if (!ch) continue;
      m[ch.category_id] ||= { Benny: 0, Jonas: 0 };
      m[ch.category_id][s.athlete] = (m[ch.category_id][s.athlete] || 0) + s.reps;
    }
    return Object.entries(m)
      .map(([cid, v]) => ({ cat: catById[cid], ...v, total: v.Benny + v.Jonas }))
      .sort((a,b) => b.total - a.total);
  }, [setsInRange, challenges, catById]);

  return (
    <>
      <div className="stat-row" style={{ marginBottom: 14, marginTop: 0 }}>
        <div className="stat"><div className="v mono">{streak}🔥</div><div className="k">Streak</div></div>
        <div className="stat"><div className="v mono">{weeksDone}</div><div className="k">Wochen</div></div>
        <div className="stat"><div className="v mono">{totalReps}</div><div className="k">Reps gesamt</div></div>
      </div>

      <div className="card">
        <div className="vs-head">
          <div className="label" style={{margin: 0}}>Benny vs. Jonas</div>
          <div className="segmented segmented-sm">
            <button className={range==='7'?'active':''} onClick={()=>setRange('7')}>7T</button>
            <button className={range==='30'?'active':''} onClick={()=>setRange('30')}>30T</button>
            <button className={range==='all'?'active':''} onClick={()=>setRange('all')}>All</button>
          </div>
        </div>

        {usedCats.length > 0 && (
          <div className="cat-filter-row">
            <button
              className={`cat-filter-chip ${selectedCats.length === 0 ? 'active' : ''}`}
              onClick={() => setSelectedCats([])}
            >Alle</button>
            {usedCats.map(c => {
              const on = selectedCats.includes(c.id);
              return (
                <button key={c.id}
                  className={`cat-filter-chip ${on ? 'active' : ''}`}
                  onClick={() => setSelectedCats(on ? selectedCats.filter(x => x !== c.id) : [...selectedCats, c.id])}
                >{c.emoji} {c.name}</button>
              );
            })}
          </div>
        )}

        {leader && diff > 0 && (
          <div className="winner-banner">
            <div className="winner-avatar-wrap">
              <img src={`uploads/${leader.toLowerCase()}.jpg`} alt={leader} className="winner-avatar"/>
              <span className="winner-crown">👑</span>
            </div>
            <div className="winner-text">
              <div className="winner-name">{leader}</div>
              <div className="winner-lead">führt mit <span className="mono">+{diff}</span> Reps</div>
            </div>
          </div>
        )}

        <div className="vs-row">
          <div className="vs-side benny">
            <div className="vs-name">Benny</div>
            <div className="vs-reps mono">{bennyStats.total}</div>
            <div className="vs-meta mono">{bennyStats.sets} Sätze · ⌀ {bennyStats.avgSet}/Satz</div>
          </div>
          <div className="vs-side jonas">
            <div className="vs-name">Jonas</div>
            <div className="vs-reps mono">{jonasStats.total}</div>
            <div className="vs-meta mono">{jonasStats.sets} Sätze · ⌀ {jonasStats.avgSet}/Satz</div>
          </div>
        </div>

        <div className="vs-bar">
          <div className="vs-bar-benny" style={{flex: bennyStats.total / maxReps}} />
          <div className="vs-bar-jonas" style={{flex: jonasStats.total / maxReps}} />
        </div>

        <div className="chart-wrap">
          <div className="chart-legend">
            <span><span className="dot" style={{background: accentColors.accent}}/>Benny</span>
            <span><span className="dot" style={{background: accentColors.accent3}}/>Jonas</span>
            <span className="chart-title">Reps pro Tag</span>
          </div>
          <StatsChart benny={bennySeries} jonas={jonasSeries} days={totalDays} accent={accentColors.accent} accent3={accentColors.accent3}/>
        </div>

        <div className="mini-stat-grid">
          <MiniStat label="Aktive Tage" benny={bennyStats.activeDays} jonas={jonasStats.activeDays} />
          <MiniStat label="Bester Tag" benny={bennyStats.bestDay} jonas={jonasStats.bestDay} />
          <MiniStat label="Größter Satz" benny={bennyStats.maxSet} jonas={jonasStats.maxSet} />
          <MiniStat label="⌀ Reps/Tag" benny={bennyStats.avgDay} jonas={jonasStats.avgDay} />
        </div>

        {perCat.length > 0 && (
          <div style={{marginTop: 18}}>
            <div className="label" style={{marginBottom: 8}}>Nach Kategorie</div>
            {perCat.map(({cat, Benny, Jonas, total}) => {
              const m = Math.max(Benny, Jonas, 1);
              return (
                <div className="vs-cat" key={cat?.id || total}>
                  <div className="vs-cat-name">{cat?.emoji} {cat?.name}</div>
                  <div className="vs-cat-bars">
                    <div className="vs-cat-row">
                      <span className="vs-cat-label benny">B</span>
                      <div className="vs-cat-track"><div className="vs-cat-fill benny" style={{width: `${(Benny/m)*100}%`}}/></div>
                      <span className="vs-cat-val mono">{Benny}</span>
                    </div>
                    <div className="vs-cat-row">
                      <span className="vs-cat-label jonas">J</span>
                      <div className="vs-cat-track"><div className="vs-cat-fill jonas" style={{width: `${(Jonas/m)*100}%`}}/></div>
                      <span className="vs-cat-val mono">{Jonas}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="label" style={{ marginBottom: 8, padding: '0 4px', marginTop: 18 }}>Verlauf</div>
      {challenges.map((ch) => {
        const cat = catById[ch.category_id];
        const total = (setsByCh[ch.id] || []).reduce((a, x) => a + x.reps, 0);
        const pct = Math.round(100 * total / ch.target_reps);
        const done = total >= ch.target_reps;
        return (
          <div className="week-row" key={ch.id}>
            <div>
              <div className="wk">KW {weekNumber(ch.week_start)} · {formatWeek(ch.week_start)}</div>
              <div className="cat">{cat?.emoji} {cat?.name}</div>
              <div className="wk" style={{ marginTop: 4 }}>{ch.chosen_by} · Ziel {ch.target_reps}</div>
            </div>
            <div className="right">
              <div className={`pct mono ${done ? 'done' : pct < 50 ? 'miss' : ''}`}>{pct}%</div>
              <div className="wk mono">{total}/{ch.target_reps}</div>
            </div>
          </div>);

      })}
    </>);

}

function computeAthleteStats(sets, athlete, series) {
  const own = sets.filter(s => s.athlete === athlete);
  const total = own.reduce((a, x) => a + x.reps, 0);
  const setCount = own.length;
  const avgSet = setCount ? Math.round(total / setCount) : 0;
  const maxSet = own.reduce((m, x) => Math.max(m, x.reps), 0);
  const byDay = {};
  for (const s of own) {
    const d = String(s.created_at).slice(0, 10);
    byDay[d] = (byDay[d] || 0) + s.reps;
  }
  const activeDays = Object.keys(byDay).length;
  const bestDay = Object.values(byDay).reduce((m, v) => Math.max(m, v), 0);
  const avgDay = series.length ? Math.round(total / series.length) : 0;
  return { total, sets: setCount, avgSet, maxSet, activeDays, bestDay, avgDay };
}

function MiniStat({ label, benny, jonas }) {
  return (
    <div className="mini-stat">
      <div className="mini-stat-label">{label}</div>
      <div className="mini-stat-vals">
        <span className="mono benny">{benny}</span>
        <span className="mini-stat-sep">/</span>
        <span className="mono jonas">{jonas}</span>
      </div>
    </div>
  );
}

Object.assign(window, { HomeScreen, SetupSheet, LogSheet, FeedScreen, HistoryScreen, StatsChart, HistoryView, computeAthleteStats, MiniStat });