import { useEffect, useMemo, useState } from 'react'
import { Copy, Monitor, ScanLine, Store } from 'lucide-react'
import { apiRequest } from '../../services/api'

/*
 * Store/Till operational device surface only.
 *
 * Company configuration fields are rendered by MetadataSettingsSection from
 * Platform field metadata. This component keeps only trusted device-pairing
 * operations whose raw secret must be shown once and never stored in client
 * metadata.
 */
export default function StoreTillSettingsPage(){
  const [stores,setStores]=useState([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const [selfKeys,setSelfKeys]=useState({})
  const [busy,setBusy]=useState('')

  const load=async()=>{
    try{
      setLoading(true);setError('')
      const response=await apiRequest('/api/admin/stores',{timeoutMs:7000,retryGet:true})
      if(!response?.success)throw new Error(response?.message||'Unable to load stores')
      setStores(Array.isArray(response.data)?response.data:[])
    }catch(err){setError(err?.message||'Unable to load stores')}
    finally{setLoading(false)}
  }

  useEffect(()=>{void load()},[])

  const generateKey=async store=>{
    try{
      setBusy(`self-${store.id}`);setError('')
      const response=await apiRequest(`/api/admin/stores/${encodeURIComponent(store.id)}/self-checkout-key`,{method:'POST',body:'{}'})
      if(!response?.success)throw new Error(response?.message||'Unable to generate key')
      setSelfKeys(current=>({...current,[store.id]:response.data?.deviceKey||''}))
      setMessage('Self-Checkout device key generated. Copy it now; it is shown only once.')
    }catch(err){setError(err?.message||'Unable to generate Self-Checkout key')}
    finally{setBusy('')}
  }

  const clearKey=async store=>{
    try{
      setBusy(`self-${store.id}`);setError('')
      const response=await apiRequest(`/api/admin/stores/${encodeURIComponent(store.id)}/self-checkout-key`,{method:'POST',body:JSON.stringify({clear:true})})
      if(!response?.success)throw new Error(response?.message||'Unable to clear pairing')
      setSelfKeys(current=>({...current,[store.id]:null}))
      setMessage('Self-Checkout pairing cleared.')
    }catch(err){setError(err?.message||'Unable to clear Self-Checkout pairing')}
    finally{setBusy('')}
  }

  const tillCount=useMemo(()=>stores.reduce((sum,store)=>sum+(store.tills||[]).length,0),[stores])

  if(loading)return <div className="module-state">Loading stores and tills…</div>

  return <div className="store-till-settings store-till-settings--devices">
    {message?<div className="module-success"><strong>{message}</strong></div>:null}
    {error?<div className="module-inline-error">{error} <button type="button" disabled={loading} onClick={()=>void load()}>Retry</button></div>:null}

    <section className="settings-feature-card">
      <header><div><Store size={16}/><span><strong>Stores & till terminals</strong><small>{stores.length} stores · {tillCount} tills</small></span></div></header>
      <div className="store-till-list">
        {stores.map(store=><article key={store.id}>
          <div className="store-till-store-head">
            <div><strong>{store.name}</strong><span>{store.code||'No code'} · {store.active===false?'Inactive':'Active'}</span></div>
          </div>
          {(store.tills||[]).length?<div className="store-till-terminals">{store.tills.map(till=><div className="store-till-terminal" key={till.id}>
            <Monitor size={14}/><span><strong>{till.name||'Till'}</strong><small>{till.terminalNumber||'No terminal number'} · {till.active===false?'Inactive':'Active'}</small></span>
          </div>)}</div>:<div className="module-state compact">No tills configured for this store.</div>}
        </article>)}
      </div>
    </section>

    <section className="settings-feature-card">
      <header><div><ScanLine size={16}/><span><strong>Self-Checkout device pairing</strong><small>Per-store pairing key; raw key is shown once.</small></span></div></header>
      <div className="self-checkout-store-list">{stores.map(store=><div key={store.id}>
        <div><strong>{store.name}</strong><span>{selfKeys[store.id]?'Key generated — copy now.':'Generate or replace this store’s pairing key.'}</span></div>
        {selfKeys[store.id]?<code>{selfKeys[store.id]}</code>:null}
        <span className="self-checkout-actions">
          {selfKeys[store.id]?<button type="button" title="Copy key" onClick={()=>navigator.clipboard?.writeText(selfKeys[store.id])}><Copy size={12}/></button>:null}
          <button type="button" disabled={busy===`self-${store.id}`} onClick={()=>generateKey(store)}>{selfKeys[store.id]?'Regenerate':'Generate key'}</button>
          {selfKeys[store.id]?<button type="button" disabled={busy===`self-${store.id}`} onClick={()=>clearKey(store)}>Clear</button>:null}
        </span>
      </div>)}</div>
    </section>
  </div>
}
