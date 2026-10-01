import { useEffect, useMemo, useState } from 'react'
import { Store, X } from 'lucide-react'
import { apiRequest } from '../services/api'

export default function UserStoreAccessModal({user,currentUserId,canEdit,onClose,onSaved}){
  const [rows,setRows]=useState([])
  const [selected,setSelected]=useState([])
  const [defaultStoreId,setDefaultStoreId]=useState('')
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const isSelf=String(user?.id||'')===String(currentUserId||'')

  useEffect(()=>{
    let live=true
    setLoading(true);setError('')
    apiRequest(`/api/admin/users/${encodeURIComponent(user.id)}/stores`)
      .then(r=>{
        if(!live)return
        if(!r?.success)throw new Error(r?.message||'Unable to load store access')
        const list=Array.isArray(r.data)?r.data:[]
        setRows(list)
        const assigned=list.filter(x=>x.assigned===true)
        setSelected(assigned.map(x=>x.id))
        setDefaultStoreId(assigned.find(x=>x.is_default===true)?.id||assigned[0]?.id||'')
      })
      .catch(err=>live&&setError(err?.message||'Unable to load store access'))
      .finally(()=>live&&setLoading(false))
    return()=>{live=false}
  },[user.id])

  const activeRows=useMemo(()=>rows.filter(r=>r.active!==false),[rows])
  const toggle=id=>setSelected(cur=>{
    const next=cur.includes(id)?cur.filter(x=>x!==id):[...cur,id]
    if(!next.includes(defaultStoreId)) setDefaultStoreId(next[0]||'')
    return next
  })

  const save=async()=>{
    if(isSelf||!canEdit)return
    try{
      setSaving(true);setError('')
      const r=await apiRequest(`/api/admin/users/${encodeURIComponent(user.id)}/stores`,{
        method:'PUT',
        body:JSON.stringify({storeIds:selected,defaultStoreId:defaultStoreId||null}),
      })
      if(!r?.success)throw new Error(r?.message||'Unable to update store access')
      await onSaved?.()
      onClose()
    }catch(err){setError(err?.message||'Unable to update store access')}
    finally{setSaving(false)}
  }

  return <div className="module-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&!saving&&onClose()}>
    <section className="module-modal user-store-access-modal">
      <header><div><strong>Store Access</strong><span>{user.full_name||user.username}</span></div><button type="button" onClick={onClose}><X size={16}/></button></header>
      <div className="module-modal-body">
        {error?<div className="module-inline-error">{error}</div>:null}
        {isSelf?<div className="module-inline-error">You cannot modify your own store access.</div>:null}
        {loading?<div className="module-state">Loading stores…</div>:!activeRows.length?<div className="module-state">No active stores available.</div>:<div className="user-store-access-list">{activeRows.map(store=><label key={store.id}>
          <span><Store size={13}/><b>{store.name}</b><small>{store.code||'No code'}</small></span>
          <span style={{display:'flex',alignItems:'center',gap:10}}>
            {selected.length>1&&selected.includes(store.id)?<label style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:12}} onClick={e=>e.stopPropagation()}>
              <input type="radio" name="default-store" checked={defaultStoreId===store.id} disabled={!canEdit||isSelf||saving} onChange={()=>setDefaultStoreId(store.id)}/>
              Default
            </label>:null}
            <input type="checkbox" checked={selected.includes(store.id)} disabled={!canEdit||isSelf||saving} onChange={()=>toggle(store.id)}/>
          </span>
        </label>)}</div>}
      </div>
      <footer className="module-modal-footer"><button type="button" onClick={onClose}>Cancel</button><button className="module-primary-button" disabled={saving||loading||!canEdit||isSelf} onClick={save}>{saving?'Saving…':'Save Store Access'}</button></footer>
    </section>
  </div>
}
