import { useMemo, useState } from 'react'
import { ChevronDown, Clock3, GitCompareArrows, RotateCcw, Save, X } from 'lucide-react'

function apiNameFromLabel(label, fallback = 'New_Flow') {
  let value = String(label || '').trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '')
  if (!value) value = fallback
  if (!/^[A-Za-z]/.test(value)) value = `Flow_${value}`
  return value.slice(0, 80).replace(/_+$/g, '')
}

export function GPTBuilderSaveAsMenu({ open, disabled, onToggle, onNewVersion, onNewFlow }) {
  return <div className="gptb-save-as" onBlur={(event) => { if (open && !event.currentTarget.contains(event.relatedTarget)) onToggle?.() }}>
    <button type="button" className="gptb-text-tool" disabled={disabled} aria-haspopup="menu" aria-expanded={open} onClick={onToggle}>Save As <ChevronDown size={12}/></button>
    {open ? <div className="gptb-save-as-menu" role="menu">
      <button type="button" role="menuitem" onClick={onNewVersion}><span><b>Save as New Version</b><small>Keep the same flow and API name.</small></span></button>
      <button type="button" role="menuitem" onClick={onNewFlow}><span><b>Save as New Flow</b><small>Create a separate flow from this design.</small></span></button>
    </div> : null}
  </div>
}

export function GPTBuilderSaveAsFlowDialog({ value, saving, onCancel, onSave }) {
  const [draft, setDraft] = useState(() => ({
    label: `${value?.label || 'Flow'} Copy`,
    apiName: apiNameFromLabel(`${value?.label || 'Flow'} Copy`),
    description: value?.description || '',
  }))
  const [manualApi, setManualApi] = useState(false)
  const valid = Boolean(draft.label.trim()) && /^[A-Za-z][A-Za-z0-9_]*$/.test(draft.apiName) && !draft.apiName.endsWith('_') && !draft.apiName.includes('__')
  return <div className="gptb-modal-backdrop">
    <section className="gptb-save-as-dialog" role="dialog" aria-modal="true" aria-labelledby="gptb-save-as-title">
      <header><div><h3 id="gptb-save-as-title">Save as New Flow</h3><p>Create a separate flow from the current design.</p></div><button className="gptb-icon-button" aria-label="Close Save as New Flow" onClick={onCancel}><X size={16}/></button></header>
      <div>
        <label><span>Flow Label <b>*</b></span><input autoFocus value={draft.label} onChange={(event) => { const label = event.target.value; setDraft((current) => ({ ...current, label, apiName: manualApi ? current.apiName : apiNameFromLabel(label) })) }}/></label>
        <label><span>Flow API Name <b>*</b></span><input value={draft.apiName} onChange={(event) => { setManualApi(true); setDraft((current) => ({ ...current, apiName: event.target.value })) }}/><small>Auto-populated from the Flow Label until you edit it.</small></label>
        <label><span>Description</span><textarea rows={4} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}/></label>
      </div>
      <footer><button className="gptb-button" onClick={onCancel}>Cancel</button><button className="gptb-button is-brand" disabled={!valid || saving} onClick={() => onSave(draft)}>{saving ? 'Saving…' : 'Save'}</button></footer>
    </section>
  </div>
}

export function GPTBuilderUnsavedHistoryDialog({ saving, onCancel, onSaveAndView }) {
  return <div className="gptb-modal-backdrop">
    <section className="gptb-unsaved-history-dialog" role="dialog" aria-modal="true" aria-labelledby="gptb-unsaved-history-title">
      <header><h3 id="gptb-unsaved-history-title">This Flow Has Unsaved Changes</h3></header>
      <div><p>Save your changes before viewing Edit History.</p></div>
      <footer><button className="gptb-button" onClick={onCancel}>Cancel</button><button className="gptb-button is-brand" disabled={saving} onClick={onSaveAndView}>{saving ? 'Saving…' : 'Save and View Edit History'}</button></footer>
    </section>
  </div>
}

function changeSummary(entry, previous) {
  const currentActions = Array.isArray(entry?.definition?.action?.gptBuilderElements) ? entry.definition.action.gptBuilderElements : []
  const previousActions = Array.isArray(previous?.definition?.action?.gptBuilderElements) ? previous.definition.action.gptBuilderElements : []
  const currentIds = new Set(currentActions.map((item) => String(item.id)))
  const previousIds = new Set(previousActions.map((item) => String(item.id)))
  const added = currentActions.filter((item) => !previousIds.has(String(item.id))).length
  const deleted = previousActions.filter((item) => !currentIds.has(String(item.id))).length
  const previousById = new Map(previousActions.map((item) => [String(item.id), item]))
  const edited = currentActions.filter((item) => previousById.has(String(item.id)) && JSON.stringify(previousById.get(String(item.id))) !== JSON.stringify(item)).length
  return { added, edited, deleted }
}

export function GPTBuilderEditHistoryPanel({ entries, loading, selectedVersion, onSelect, onRestore, onSaveAsVersion, onSaveAsFlow, onClose }) {
  const selected = entries.find((entry) => Number(entry.version) === Number(selectedVersion)) || entries[0] || null
  const summaries = useMemo(() => new Map(entries.map((entry, index) => [Number(entry.version), changeSummary(entry, entries[index + 1])])), [entries])
  return <aside className="gptb-edit-history" aria-label="Flow Version Edit History">
    <header><div><Clock3 size={16}/><span><strong>Flow Version Edit History</strong><small>Saved changes for this flow version.</small></span></div><button className="gptb-icon-button" aria-label="Exit Edit History" onClick={onClose}><X size={16}/></button></header>
    <div className="gptb-edit-history-body">
      {loading ? <div className="gptb-edit-history-empty">Loading edit history…</div> : entries.length ? entries.map((entry) => {
        const summary = summaries.get(Number(entry.version)) || { added: 0, edited: 0, deleted: 0 }
        const active = Number(selected?.version) === Number(entry.version)
        return <button type="button" key={entry.id || entry.version} className={active ? 'is-active' : ''} onClick={() => onSelect(Number(entry.version))}>
          <span><b>Save {entry.version}</b><small>{entry.created_at ? new Date(entry.created_at).toLocaleString() : 'Saved'}</small></span>
          <span className="gptb-history-summary"><i>+{summary.added}</i><i>~{summary.edited}</i><i>−{summary.deleted}</i></span>
        </button>
      }) : <div className="gptb-edit-history-empty">Save the flow to create an edit-history entry.</div>}
    </div>
    {selected ? <div className="gptb-edit-history-detail">
      <h4>Save {selected.version}</h4>
      <p>{selected.lifecycle_status || 'DRAFT'} · {selected.created_at ? new Date(selected.created_at).toLocaleString() : 'Saved'}</p>
      <details><summary>Details</summary><div>{(selected.definition?.action?.gptBuilderElements || []).map((element) => <span key={element.id || element.apiName}>{element.label || element.apiName}<small>{element.key || 'Element'}</small></span>)}</div></details>
      <div className="gptb-edit-history-actions"><button className="gptb-button" onClick={() => onRestore(selected)}><RotateCcw size={13}/> Restore</button><button className="gptb-button" onClick={() => onSaveAsVersion(selected)}><Save size={13}/> Save as New Version</button><button className="gptb-button" onClick={() => onSaveAsFlow(selected)}>Save as New Flow</button></div>
    </div> : null}
  </aside>
}

function versionElements(entry){return Array.isArray(entry?.definition?.action?.gptBuilderElements)?entry.definition.action.gptBuilderElements:[]}
function versionConnections(entry){return Array.isArray(entry?.definition?.action?.goToConnections)?entry.definition.action.goToConnections:[]}
export function GPTBuilderCompareVersionsPanel({ entries, onClose }) {
  const [left,setLeft]=useState(entries[1]?.version ?? entries[0]?.version ?? '')
  const [right,setRight]=useState(entries[0]?.version ?? '')
  const comparison=useMemo(()=>{
    const a=entries.find((entry)=>Number(entry.version)===Number(left)),b=entries.find((entry)=>Number(entry.version)===Number(right))
    if(!a||!b)return []
    const ae=versionElements(a),be=versionElements(b),am=new Map(ae.map((x)=>[String(x.id||x.apiName),x])),bm=new Map(be.map((x)=>[String(x.id||x.apiName),x]))
    const rows=[]
    for(const [id,item] of bm) if(!am.has(id)) rows.push({kind:'Added',label:item.label||item.apiName||id})
    for(const [id,item] of am) if(!bm.has(id)) rows.push({kind:'Removed',label:item.label||item.apiName||id})
    for(const [id,item] of bm) if(am.has(id)&&JSON.stringify(am.get(id))!==JSON.stringify(item)) rows.push({kind:'Updated',label:item.label||item.apiName||id})
    if(JSON.stringify(versionConnections(a))!==JSON.stringify(versionConnections(b))) rows.push({kind:'Connector Changed',label:'Flow connectors'})
    return rows
  },[entries,left,right])
  return <aside className="gptb-edit-history" aria-label="Compare Flow Versions"><header><div><GitCompareArrows size={16}/><span><strong>Compare Flow Versions</strong><small>Added, removed, updated, and connector changes.</small></span></div><button className="gptb-icon-button" aria-label="Close Compare Versions" onClick={onClose}><X size={16}/></button></header><div className="gptb-edit-history-detail"><div className="gptb-version-compare-selectors"><label><span>From</span><select value={left} onChange={(e)=>setLeft(e.target.value)}>{entries.map((entry)=><option key={entry.version} value={entry.version}>Version {entry.version}</option>)}</select></label><label><span>To</span><select value={right} onChange={(e)=>setRight(e.target.value)}>{entries.map((entry)=><option key={entry.version} value={entry.version}>Version {entry.version}</option>)}</select></label></div>{comparison.length?<div className="gptb-version-diff">{comparison.map((row,index)=><div key={index}><b>{row.kind}</b><span>{row.label}</span></div>)}</div>:<div className="gptb-edit-history-empty">No differences between these versions.</div>}</div></aside>
}
