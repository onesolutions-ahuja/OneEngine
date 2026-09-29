import { useEffect, useMemo, useState } from 'react'
import { Store, X } from 'lucide-react'
import { apiRequest } from '../services/api'

export default function UserStoreAccessModal({user,currentUserId,canEdit,onClose,onSaved}){
  const [rows,setRows]=useState([])
  const [selected,setSelected]=useState([])
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
        setSelected(list.filter(x=>x.assigned===true).map(x=>x.id))
      })
      .catch(err=>live&&setError(err?.message||'Unable to load store access'))
      .finally(()=>live&&setLoading(false))
    return()=>{live=false}
  },[user.id])

  const activeRows=useMemo(()=>rows.filter(r=>r.active!==false),[rows])
  const toggle=id=>setSelected(cur=>cur.includes(id)?cur.filter(x=>x!==id):[...cur,id])

  const save=async()=>{
    if(isSelf||!canEdit)return
    try{
      setSaving(true);setError('')
      const r=await apiRequest(`/api/admin/users/${encodeURIComponent(user.id)}/stores`,{
        method:'PUT',
        body:JSON.stringify({storeIds:selected}),
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
          <input type="checkbox" checked={selected.includes(store.id)} disabled={!canEdit||isSelf||saving} onChange={()=>toggle(store.id)}/>
        </label>)}</div>}
      </div>
      <footer className="module-modal-footer"><button type="button" onClick={onClose}>Cancel</button><button className="module-primary-button" disabled={saving||loading||!canEdit||isSelf} onClick={save}>{saving?'Saving…':'Save Store Access'}</button></footer>
    </section>
  </div>
}
