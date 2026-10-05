import { useMemo, useState } from 'react'
import { ChevronDown, Clock3, GitCompareArrows, RotateCcw, Save, X } from 'lucide-react'

function apiNameFromLabel(label, fallback = 'New_Flow') {
  let value = String(label || '').trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '')
  if (!value) value = fallback
  if (!/^[A-Za-z]/.test(value)) value = `Flow_${value}`
  return value.slice(0, 80).replace(/_+$/g, '')
}

export function GPTBuilderSaveAsMenu({ open, disabled, onToggle, onNewVersion, onNewFlow }) {
  return <div className="gptb-save-as">
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


function versionElements(entry){
  return Array.isArray(entry?.definition?.action?.gptBuilderElements) ? entry.definition.action.gptBuilderElements : []
}
function compareEntries(base,target){
  const before=new Map(versionElements(base).map((item)=>[String(item.id||item.apiName),item]))
  const after=new Map(versionElements(target).map((item)=>[String(item.id||item.apiName),item]))
  const changes=[]
  for(const [id,item] of after){
    if(!before.has(id))changes.push({id,status:'Added',before:null,after:item})
    else if(JSON.stringify(before.get(id))!==JSON.stringify(item))changes.push({id,status:'Changed',before:before.get(id),after:item})
  }
  for(const [id,item] of before)if(!after.has(id))changes.push({id,status:'Deleted',before:item,after:null})
  return changes
}
export function GPTBuilderCompareVersionsPanel({entries,onClose,onNavigateElement}){
  const sorted=[...entries].sort((a,b)=>Number(b.version)-Number(a.version))
  const [baseVersion,setBaseVersion]=useState(sorted[1]?.version||sorted[0]?.version||'')
  const [targetVersion,setTargetVersion]=useState(sorted[0]?.version||'')
  const [selectedId,setSelectedId]=useState('')
  const base=sorted.find((entry)=>Number(entry.version)===Number(baseVersion))
  const target=sorted.find((entry)=>Number(entry.version)===Number(targetVersion))
  const changes=useMemo(()=>compareEntries(base,target),[base,target])
  const selected=changes.find((change)=>change.id===selectedId)||changes[0]||null
  return <aside className="gptb-edit-history gptb-compare-versions" aria-label="Compare Versions">
    <header><div><GitCompareArrows size={16}/><span><strong>Compare Versions</strong><small>Compare saved flow versions element by element.</small></span></div><button className="gptb-icon-button" aria-label="Exit Compare Versions" onClick={onClose}><X size={16}/></button></header>
    <div className="gptb-compare-selectors"><label><span>Base Version</span><select value={baseVersion} onChange={(event)=>setBaseVersion(event.target.value)}>{sorted.map((entry)=><option key={entry.version} value={entry.version}>Version {entry.version} · {entry.lifecycle_status||'DRAFT'}</option>)}</select></label><label><span>Target Version</span><select value={targetVersion} onChange={(event)=>setTargetVersion(event.target.value)}>{sorted.map((entry)=><option key={entry.version} value={entry.version}>Version {entry.version} · {entry.lifecycle_status||'DRAFT'}</option>)}</select></label></div>
    <div className="gptb-edit-history-body">{changes.length?changes.map((change)=><button type="button" key={change.id} className={selected?.id===change.id?'is-active':''} onClick={()=>setSelectedId(change.id)}><span><b>{change.after?.label||change.before?.label||change.id}</b><small>{change.after?.key||change.before?.key||'Element'}</small></span><span className={`gptb-version-change is-${change.status.toLowerCase()}`}>{change.status}</span></button>):<div className="gptb-edit-history-empty">No element changes between these versions.</div>}</div>
    {selected?<div className="gptb-edit-history-detail"><h4>{selected.status}: {selected.after?.label||selected.before?.label}</h4><button type="button" className="gptb-button" onClick={()=>onNavigateElement?.(selected.after?.id||selected.before?.id,target)}>View on Canvas</button><div className="gptb-version-diff"><section><b>Base</b><pre>{JSON.stringify(selected.before,null,2)}</pre></section><section><b>Target</b><pre>{JSON.stringify(selected.after,null,2)}</pre></section></div></div>:null}
  </aside>
}
