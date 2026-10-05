import { useMemo, useState } from 'react'
import { ChevronDown, Clock3, RotateCcw, Save, X } from 'lucide-react'

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


function versionItems(entry){
  const action=entry?.definition?.action||{}
  return [
    {id:'flow',kind:'Flow',label:entry?.definition?.name||action.label||'Flow',value:{flowType:action.flowType,start:action.start,runContext:action.runContext}},
    ...(Array.isArray(action.resources)?action.resources:[]).map((item)=>({id:`resource:${item.id||item.apiName}`,kind:'Resource',label:item.label||item.apiName,value:item})),
    ...(Array.isArray(action.gptBuilderElements)?action.gptBuilderElements:[]).map((item)=>({id:`element:${item.id||item.apiName}`,kind:item.key==='screen'?'Screen':item.key==='transform'?'Transform':'Element',label:item.label||item.apiName,value:item})),
  ]
}
function compareVersionItems(left,right){
 const a=new Map(versionItems(left).map(item=>[item.id,item])),b=new Map(versionItems(right).map(item=>[item.id,item]))
 return [...new Set([...a.keys(),...b.keys()])].map(id=>{const before=b.get(id),after=a.get(id);return {id,kind:after?.kind||before?.kind,label:after?.label||before?.label,status:!before?'Added':!after?'Deleted':JSON.stringify(before.value)===JSON.stringify(after.value)?'Unchanged':'Changed',before:before?.value,after:after?.value}})
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
  const [compareMode,setCompareMode]=useState('table')
  const [changedOnly,setChangedOnly]=useState(true)
  const selected = entries.find((entry) => Number(entry.version) === Number(selectedVersion)) || entries[0] || null
  const selectedIndex=entries.indexOf(selected)
  const compared=selected?compareVersionItems(selected,entries[selectedIndex+1]):[]
  const visibleCompared=changedOnly?compared.filter((item)=>item.status!=='Unchanged'):compared
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
      <details><summary>Details</summary><div>{(selected.definition?.action?.gptBuilderElements || []).map((element) => <span key={element.id || element.apiName}>{element.label || element.apiName}<small>{element.key || 'Element'}</small></span>)}</div></details>      <section className="gptb-version-compare"><div className="gptb-version-compare-toolbar"><b>Compare Versions</b><button className={compareMode==='table'?'is-active':''} onClick={()=>setCompareMode('table')}>Table</button><button className={compareMode==='visual'?'is-active':''} onClick={()=>setCompareMode('visual')}>Visual</button><label><input type="checkbox" checked={changedOnly} onChange={(event)=>setChangedOnly(event.target.checked)}/> Show Only Changed Items</label></div><p>{visibleCompared.filter(i=>i.status==='Added').length} added · {visibleCompared.filter(i=>i.status==='Changed').length} changed · {visibleCompared.filter(i=>i.status==='Deleted').length} deleted</p>{compareMode==='table'?<div className="gptb-version-table">{visibleCompared.map(item=><div key={item.id}><span>{item.kind}</span><b>{item.label}</b><em>{item.status}</em><details><summary>Property changes</summary><pre>{JSON.stringify({before:item.before,after:item.after},null,2)}</pre></details></div>)}</div>:<div className="gptb-version-visual">{visibleCompared.map(item=><div key={item.id} className={`is-${item.status.toLowerCase()}`}><b>{item.label}</b><small>{item.kind} · {item.status}</small></div>)}</div>}</section>
      <div className="gptb-edit-history-actions"><button className="gptb-button" onClick={() => onRestore(selected)}><RotateCcw size={13}/> Restore</button><button className="gptb-button" onClick={() => onSaveAsVersion(selected)}><Save size={13}/> Save as New Version</button><button className="gptb-button" onClick={() => onSaveAsFlow(selected)}>Save as New Flow</button></div>
    </div> : null}
  </aside>
}
