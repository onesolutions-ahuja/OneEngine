import { useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw, Search, X } from 'lucide-react'
import { apiRequest } from '../../services/api'

export default function ReplenishmentPage({onBack}){
  const [rows,setRows]=useState([])
  const [categories,setCategories]=useState([])
  const [filters,setFilters]=useState({search:'',status:'all',category:''})
  const [selected,setSelected]=useState([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const [showPO,setShowPO]=useState(false)

  const load=async()=>{
    try{
      setLoading(true);setError('')
      const [r,c]=await Promise.all([
        apiRequest('/api/inventory/replenishment'),
        apiRequest('/api/categories').catch(()=>({success:false,data:[]})),
      ])
      if(!r?.success)throw new Error(r?.message||'Unable to load suggestions')
      setRows(Array.isArray(r.data)?r.data:[])
      setCategories(Array.isArray(c?.data)?c.data:[])
      setSelected([])
    }catch(err){setError(err?.message||'Unable to load suggestions')}
    finally{setLoading(false)}
  }
  useEffect(()=>{void load()},[])

  const filtered=useMemo(()=>{
    const q=filters.search.trim().toLowerCase()
    return rows.filter(row=>{
      if(filters.status==='low'&&row.status!=='Low stock')return false
      if(filters.status==='out'&&row.status!=='Out of stock')return false
      if(filters.category&&String(row.categoryId||'')!==String(filters.category))return false
      if(q&&![row.name,row.sku,row.barcode].some(v=>String(v||'').toLowerCase().includes(q)))return false
      return true
    })
  },[rows,filters])

  const selectedLines=useMemo(()=>filtered.filter(r=>selected.includes(r.id)&&(r.suggestedReorder??0)>0),[filtered,selected])
  const allChecked=filtered.length>0&&filtered.every(r=>selected.includes(r.id))
  const toggle=id=>setSelected(cur=>cur.includes(id)?cur.filter(x=>x!==id):[...cur,id])

  return <section className="module-page replenishment-page">
    <header className="module-page-header">
      <div><span>Stock Planning</span><h1>Replenishment</h1><p>Low-stock reorder suggestions from live inventory.</p></div>
      <div className="module-header-actions">
        {onBack?<button onClick={onBack}>Back to Inventory</button>:null}
        <button onClick={load} disabled={loading}><RefreshCw size={14}/> Refresh</button>
        <button className="module-primary-button" disabled={!selectedLines.length} onClick={()=>setShowPO(true)}><Plus size={14}/> Create Purchase Order ({selectedLines.length})</button>
      </div>
    </header>

    {message?<div className="module-success module-page-message"><strong>{message}</strong></div>:null}
    {error?<div className="module-inline-error module-page-message">{error}</div>:null}

    <section className="module-panel replenishment-filters">
      <label className="module-search"><Search size={13}/><input value={filters.search} onChange={e=>setFilters(f=>({...f,search:e.target.value}))} placeholder="Name, SKU or barcode"/></label>
      <select value={filters.status} onChange={e=>setFilters(f=>({...f,status:e.target.value}))}><option value="all">All low stock</option><option value="low">Low stock</option><option value="out">Out of stock</option></select>
      <select value={filters.category} onChange={e=>setFilters(f=>({...f,category:e.target.value}))}><option value="">All categories</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
    </section>

    <section className="module-page-card">
      {loading?<div className="module-state">Loading suggestions…</div>:!filtered.length?<div className="module-state">No replenishment needed.</div>:<div className="module-table-wrap no-border"><table><thead><tr><th><input type="checkbox" checked={allChecked} onChange={()=>setSelected(allChecked?[]:filtered.map(r=>r.id))}/></th><th>Product</th><th>Barcode / EAN</th><th>Current stock</th><th>Low-stock threshold</th><th>Suggested reorder</th><th>Status</th></tr></thead><tbody>{filtered.map(row=><tr key={row.id}>
        <td><input type="checkbox" checked={selected.includes(row.id)} onChange={()=>toggle(row.id)}/></td>
        <td><strong>{row.name}</strong><small className="replenishment-category">{row.category||'—'}</small></td>
        <td>{row.barcode||'—'}</td><td>{row.stock}</td><td>{row.lowStockLevel}</td><td><strong>{row.hasSuggestion?row.suggestedReorder:'No reorder quantity configured'}</strong></td>
        <td><span className={`module-status-pill ${row.status==='Out of stock'?'is-inactive':'is-warning'}`}>{row.status}</span></td>
      </tr>)}</tbody></table></div>}
    </section>

    {showPO&&selectedLines.length?<PurchaseSuggestionModal lines={selectedLines} onClose={()=>setShowPO(false)} onCreated={msg=>{setShowPO(false);setSelected([]);setMessage(msg)}}/>:null}
  </section>
}

function PurchaseSuggestionModal({lines,onClose,onCreated}){
  const [supplierId,setSupplierId]=useState('')
  const [suppliers,setSuppliers]=useState([])
  const [quantities,setQuantities]=useState(()=>Object.fromEntries(lines.map(line=>[line.id,String(line.suggestedReorder??'')])))
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')

  useEffect(()=>{let live=true;apiRequest('/api/suppliers').then(r=>{if(live&&r?.success)setSuppliers((r.data||[]).filter(s=>s.active!==false))}).catch(()=>{});return()=>{live=false}},[])

  const total=useMemo(()=>lines.reduce((sum,line)=>sum+(Number(quantities[line.id])||0),0),[lines,quantities])

  const submit=async e=>{
    e.preventDefault()
    try{
      setSaving(true);setError('')
      const items=lines.map(line=>({productId:line.id,quantity:Number(quantities[line.id]),unitCost:0})).filter(item=>Number.isFinite(item.quantity)&&item.quantity>0)
      if(!items.length)throw new Error('Enter a quantity greater than zero for at least one product.')
      const r=await apiRequest('/api/purchases',{method:'POST',body:JSON.stringify({supplierId:supplierId||null,items,receiveNow:false})})
      if(!r?.success)throw new Error(r?.message||'Unable to create purchase order')
      onCreated?.(`Draft purchase order created with ${items.length} line(s). Stock is unchanged until it is received in Purchases.`)
    }catch(err){setError(err?.message||'Unable to create purchase order')}
    finally{setSaving(false)}
  }

  return <div className="module-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&!saving&&onClose()}>
    <form className="module-modal replenishment-po-modal" onSubmit={submit}>
      <header><div><strong>Create Purchase Order</strong><span>Draft order from replenishment suggestions. Stock changes only when received.</span></div><button type="button" onClick={onClose}><X size={16}/></button></header>
      <div className="module-modal-body">
        {error?<div className="module-inline-error">{error}</div>:null}
        <label className="module-input-label"><span>Supplier (optional)</span><select value={supplierId} onChange={e=>setSupplierId(e.target.value)}><option value="">No supplier</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <div className="module-table-wrap replenishment-po-table"><table><thead><tr><th>Product</th><th>Suggested</th><th>Order qty</th></tr></thead><tbody>{lines.map(line=><tr key={line.id}><td>{line.name}</td><td>{line.suggestedReorder}</td><td><input type="number" min="0" step="1" value={quantities[line.id]} onChange={e=>setQuantities(q=>({...q,[line.id]:e.target.value}))}/></td></tr>)}</tbody></table></div>
      </div>
      <footer className="module-modal-footer"><span className="replenishment-total">Total units: <strong>{total}</strong></span><button type="button" onClick={onClose}>Cancel</button><button className="module-primary-button" disabled={saving||total<=0}>{saving?'Creating…':'Create draft order'}</button></footer>
    </form>
  </div>
}
