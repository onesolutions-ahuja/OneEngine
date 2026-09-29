import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Calculator, History, PackagePlus, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react'
import { apiRequest } from '../../services/api'
import RecordListView from '../../components/RecordListView'

function qty(value){
  const n=Number(value||0)
  return Number.isInteger(n)?String(n):n.toFixed(3)
}
function money(value,currency='GBP'){
  const n=Number(value||0)
  try{return new Intl.NumberFormat(undefined,{style:'currency',currency,maximumFractionDigits:2}).format(n)}
  catch{return `${n.toFixed(2)} ${currency}`}
}
function stockStatus(product){
  const stock=Number(product.stock_quantity ?? product.stock ?? 0)
  const threshold=Number(product.low_stock_level ?? product.lowStockLevel ?? 0)
  if(stock<=0)return 'Out of Stock'
  if(threshold>0&&stock<=threshold)return 'Low Stock'
  return 'In Stock'
}

export default function InventoryPage({onOpenReplenishment,onOpenBatches}){
  const [tab,setTab]=useState('products')
  const [products,setProducts]=useState([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const [currency,setCurrency]=useState('GBP')
  const [adjusting,setAdjusting]=useState(null)
  const [history,setHistory]=useState(null)
  const [reconciliation,setReconciliation]=useState(null)

  const loadProducts=async()=>{
    try{
      setLoading(true);setError('')
      const [p,s]=await Promise.all([apiRequest('/api/products'),apiRequest('/api/settings').catch(()=>null)])
      if(!p?.success)throw new Error(p?.message||'Unable to load inventory')
      setProducts(Array.isArray(p.data)?p.data:[])
      setCurrency(s?.data?.company?.currency||'GBP')
    }catch(err){setError(err?.message||'Unable to load inventory')}
    finally{setLoading(false)}
  }
  useEffect(()=>{void loadProducts()},[])

  const columns=useMemo(()=>[
    {key:'name',label:'Product',render:r=>r.name||'—'},
    {key:'sku',label:'SKU',render:r=>r.sku||'—'},
    {key:'barcode',label:'Barcode',render:r=>r.barcode||'—'},
    {key:'category_name',label:'Category',render:r=>r.category_name||r.category||'—'},
    {key:'stock_quantity',label:'Current Stock',render:r=>qty(r.stock_quantity ?? r.stock)},
    {key:'price',label:'Price',render:r=>money(r.price,currency)},
    {key:'stock_status',label:'Stock Status',render:r=>stockStatus(r)},
  ],[currency])

  const loadMovements=async(product,type='ALL')=>{
    try{
      setError('')
      const qs=new URLSearchParams({productId:product.id})
      if(type!=='ALL')qs.set('movementType',type)
      const r=await apiRequest(`/api/inventory/movements?${qs}`)
      if(!r?.success)throw new Error(r?.message||'Unable to load movement history')
      setHistory({product,type,rows:Array.isArray(r.data)?r.data:[]})
    }catch(err){setError(err?.message||'Unable to load movement history')}
  }
  const loadReconciliation=async(product)=>{
    try{
      setError('')
      const r=await apiRequest(`/api/inventory/reconciliation?productId=${encodeURIComponent(product.id)}`)
      if(!r?.success)throw new Error(r?.message||'Unable to load reconciliation')
      setReconciliation(r.data)
    }catch(err){setError(err?.message||'Unable to load reconciliation')}
  }

  return <section className="module-page inventory-page">
    <header className="module-page-header">
      <div><span>Stock</span><h1>Inventory</h1><p>Monitor stock, movements, locations and transfers.</p></div>
      <div className="module-header-actions">
        {onOpenReplenishment?<button onClick={onOpenReplenishment}>Replenishment</button>:null}
        {onOpenBatches?<button onClick={onOpenBatches}>Batch & Expiry</button>:null}
        <button onClick={loadProducts}><RefreshCw size={14}/> Refresh</button>
      </div>
    </header>

    {message?<div className="module-success module-page-message"><strong>{message}</strong></div>:null}
    {error?<div className="module-inline-error module-page-message">{error}</div>:null}

    <div className="module-segmented inventory-tabs">
      <button className={tab==='products'?'is-active':''} onClick={()=>setTab('products')}>Products</button>
      <button className={tab==='stores'?'is-active':''} onClick={()=>setTab('stores')}>Stock by Store</button>
      <button className={tab==='transfers'?'is-active':''} onClick={()=>setTab('transfers')}>Stock Transfers</button>
    </div>

    {tab==='products'?<section className="module-page-card">
      <RecordListView
        title="Inventory"
        subtitle={`${products.length} active products`}
        rows={products}
        columns={columns}
        searchKeys={['name','sku','barcode','category_name']}
        loading={loading}
        error={error}
        onRowSelect={row=>loadMovements(row)}
        renderRowActions={row=><div className="inventory-row-actions">
          <button title="Movement history" onClick={e=>{e.stopPropagation();void loadMovements(row)}}><History size={12}/></button>
          <button title="Reconcile stock" onClick={e=>{e.stopPropagation();void loadReconciliation(row)}}><Calculator size={12}/></button>
          <button title="Adjust stock" onClick={e=>{e.stopPropagation();setAdjusting(row)}}><PackagePlus size={12}/></button>
        </div>}
      />
    </section>:null}

    {tab==='stores'?<StockByStore/>:null}
    {tab==='transfers'?<StockTransfers onMessage={setMessage} onError={setError}/>:null}

    {adjusting?<StockAdjustmentModal product={adjusting} onClose={()=>setAdjusting(null)} onSaved={async msg=>{setAdjusting(null);setMessage(msg);await loadProducts()}}/>:null}
    {history?<MovementHistoryModal state={history} onClose={()=>setHistory(null)} onChangeType={type=>loadMovements(history.product,type)}/>:null}
    {reconciliation?<ReconciliationModal data={reconciliation} onClose={()=>setReconciliation(null)}/>:null}
  </section>
}

function StockAdjustmentModal({product,onClose,onSaved}){
  const [direction,setDirection]=useState('increase')
  const [quantity,setQuantity]=useState('')
  const [reason,setReason]=useState('')
  const [notes,setNotes]=useState('')
  const [batchNumber,setBatchNumber]=useState('')
  const [manufacturingDate,setManufacturingDate]=useState('')
  const [expiryDate,setExpiryDate]=useState('')
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')

  const submit=async e=>{
    e.preventDefault()
    const amount=Number(quantity)
    if(!Number.isFinite(amount)||amount<=0)return setError('Enter a quantity greater than zero.')
    if(direction==='decrease'&&!reason.trim())return setError('A reason is required when reducing stock.')
    try{
      setSaving(true);setError('')
      const adjustmentQuantity=direction==='decrease'?-amount:amount
      const r=await apiRequest('/api/inventory/adjustments',{
        method:'POST',
        body:JSON.stringify({
          productId:product.id,
          adjustmentQuantity,
          reason:reason.trim()||null,
          notes:notes.trim()||null,
          ...(batchNumber.trim()?{batchNumber:batchNumber.trim()}:{}),
          ...(manufacturingDate?{manufacturingDate}:{}),
          ...(expiryDate?{expiryDate}:{}),
        })
      })
      if(!r?.success)throw new Error(r?.message||'Unable to adjust stock')
      await onSaved?.(`${product.name} stock was updated successfully.`)
    }catch(err){setError(err?.message||'Unable to adjust stock')}
    finally{setSaving(false)}
  }

  return <div className="module-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&!saving&&onClose()}>
    <form className="module-modal inventory-adjust-modal" onSubmit={submit}>
      <header><div><strong>Adjust Stock</strong><span>{product.name} · current {qty(product.stock_quantity ?? product.stock)}</span></div><button type="button" onClick={onClose}><X size={16}/></button></header>
      <div className="module-modal-body inventory-adjust-grid">
        {error?<div className="module-inline-error inventory-adjust-full">{error}</div>:null}
        <label className="module-input-label"><span>Direction</span><select value={direction} onChange={e=>setDirection(e.target.value)}><option value="increase">Increase</option><option value="decrease">Decrease</option></select></label>
        <label className="module-input-label"><span>Quantity</span><input type="number" min="0.001" step="0.001" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>
        {direction==='decrease'?<label className="module-input-label"><span>Reason</span><select value={reason} onChange={e=>setReason(e.target.value)}><option value="">Choose reason</option><option>Wastage</option><option>Breakage</option><option>Other</option></select></label>:<label className="module-input-label"><span>Reason (optional)</span><input value={reason} onChange={e=>setReason(e.target.value)}/></label>}
        <label className="module-input-label"><span>Batch number (if applicable)</span><input value={batchNumber} onChange={e=>setBatchNumber(e.target.value)}/></label>
        <label className="module-input-label"><span>Manufacturing date</span><input type="date" value={manufacturingDate} onChange={e=>setManufacturingDate(e.target.value)}/></label>
        <label className="module-input-label"><span>Expiry date</span><input type="date" value={expiryDate} onChange={e=>setExpiryDate(e.target.value)}/></label>
        <label className="module-textarea-label inventory-adjust-full"><span>Notes</span><textarea rows={3} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
      </div>
      <footer className="module-modal-footer"><button type="button" onClick={onClose}>Cancel</button><button className="module-primary-button" disabled={saving}>{saving?'Saving…':'Save adjustment'}</button></footer>
    </form>
  </div>
}

const MOVEMENT_TYPES=['ALL','OPENING','PURCHASE','SALE','CUSTOMER_RETURN','SUPPLIER_RETURN','ADJUSTMENT_IN','ADJUSTMENT_OUT','TRANSFER_IN','TRANSFER_OUT']

function MovementHistoryModal({state,onClose,onChangeType}){
  return <div className="module-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
    <section className="module-modal inventory-history-modal">
      <header><div><strong>Movement History</strong><span>{state.product.name}</span></div><div className="inventory-modal-head-actions"><select value={state.type} onChange={e=>onChangeType(e.target.value)}>{MOVEMENT_TYPES.map(type=><option key={type} value={type}>{type==='ALL'?'All movement types':type}</option>)}</select><button onClick={onClose}><X size={16}/></button></div></header>
      <div className="module-modal-body"><div className="module-table-wrap"><table><thead><tr><th>Date/time</th><th>Movement</th><th>Quantity</th><th>Balance</th><th>Store</th><th>Reason</th><th>Reference</th><th>User</th></tr></thead><tbody>{state.rows.map(m=><tr key={m.id}><td>{m.created_at?new Date(m.created_at).toLocaleString():'—'}</td><td><strong>{m.movement_type}</strong></td><td className={Number(m.quantity_change)<0?'is-negative':'is-positive'}>{Number(m.quantity_change)>0?'+':''}{qty(m.quantity_change)}</td><td>{qty(m.balance_after)}</td><td>{m.store_name||'—'}</td><td>{m.reason||'—'}</td><td>{m.reference_type||'—'}{m.reference_id?` ${m.reference_id}`:''}</td><td>{m.created_by_username||'—'}</td></tr>)}</tbody></table></div>{!state.rows.length?<div className="module-state">No movements found.</div>:null}</div>
    </section>
  </div>
}

function ReconciliationModal({data,onClose}){
  return <div className="module-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
    <section className="module-modal inventory-reconcile-modal">
      <header><div><strong>Stock Reconciliation</strong><span>{data.product}</span></div><button onClick={onClose}><X size={16}/></button></header>
      <div className="module-modal-body">
        <div className={`inventory-reconcile-status ${data.mismatch?'is-mismatch':'is-match'}`}><strong>{data.mismatch?'Stock balance mismatch':'Stock balance matches ledger'}</strong><span>Current {qty(data.currentStock)} · Ledger {qty(data.ledgerBalance)}</span></div>
        <div className="module-table-wrap"><table><thead><tr><th>Date/time</th><th>Type</th><th>Quantity</th><th>Balance</th><th>Reference</th><th>User</th><th>Reason</th></tr></thead><tbody>{(data.movements||[]).map((m,i)=><tr key={i}><td>{new Date(m.created_at).toLocaleString()}</td><td>{m.movement_type}</td><td>{qty(m.quantity_change)}</td><td>{qty(m.balance_after)}</td><td>{m.reference_type||'—'}</td><td>{m.username||'—'}</td><td>{m.reason||'—'}</td></tr>)}</tbody></table></div>
      </div>
    </section>
  </div>
}

function StockByStore(){
  const [state,setState]=useState({loading:true,error:'',matrix:null})
  const load=async()=>{
    try{
      setState(s=>({...s,loading:true,error:''}))
      let rows=[],singleStore=false
      try{
        const all=await apiRequest('/api/inventory/stock?allStores=true')
        rows=Array.isArray(all?.data)?all.data:[]
      }catch(err){
        if(err?.status!==403)throw err
        singleStore=true
        const own=await apiRequest('/api/inventory/stock')
        rows=(own?.data||[]).map(r=>({...r,store_name:null}))
      }
      const storeNames=[...new Set(rows.map(r=>r.store_name).filter(Boolean))].sort()
      const byProduct=new Map()
      for(const r of rows){
        const key=r.productId||r.product_id
        if(!byProduct.has(key))byProduct.set(key,{name:r.name||key,sku:r.sku||'',cells:new Map(),total:0})
        const entry=byProduct.get(key), amount=Number(r.quantity)||0, store=r.store_name||r.storeName||''
        entry.cells.set(store,(entry.cells.get(store)||0)+amount);entry.total+=amount
      }
      setState({loading:false,error:'',matrix:{stores:singleStore?[]:storeNames,rows:[...byProduct.values()].sort((a,b)=>String(a.name).localeCompare(String(b.name))),singleStore}})
    }catch(err){setState({loading:false,error:err?.message||'Unable to load stock by store',matrix:null})}
  }
  useEffect(()=>{void load()},[])
  if(state.loading)return <section className="module-page-card"><div className="module-state">Loading stock by store…</div></section>
  if(state.error)return <section className="module-page-card"><div className="module-state is-error">{state.error}</div></section>
  const m=state.matrix
  return <section className="module-page-card">
    {!m?.rows?.length?<div className="module-state">No stock records.</div>:<div className="module-table-wrap no-border"><table><thead><tr><th>Product</th><th>SKU</th>{m.singleStore?<th>Stock</th>:<>{m.stores.map(s=><th key={s}>{s}</th>)}<th>Total</th></>}</tr></thead><tbody>{m.rows.map((row,i)=><tr key={i}><td><strong>{row.name}</strong></td><td>{row.sku||'—'}</td>{m.singleStore?<td>{qty(row.total)}</td>:<>{m.stores.map(s=><td key={s}>{qty(row.cells.get(s)||0)}</td>)}<td><strong>{qty(row.total)}</strong></td></>}</tr>)}</tbody></table></div>}
    {m?.singleStore?<div className="inventory-store-note">Showing your store only. Multi-store access is required to see stock at other locations.</div>:null}
  </section>
}

function StockTransfers({onMessage,onError}){
  const [stores,setStores]=useState([])
  const [rows,setRows]=useState([])
  const [mode,setMode]=useState('history')
  const [loading,setLoading]=useState(true)
  const [openTransfer,setOpenTransfer]=useState(null)
  const load=async()=>{
    try{
      setLoading(true);onError?.('')
      const [s,t]=await Promise.all([apiRequest('/api/inventory/transfer-stores'),apiRequest('/api/inventory/transfers')])
      setStores(Array.isArray(s?.data)?s.data:[]);setRows(Array.isArray(t?.data)?t.data:[])
    }catch(err){onError?.(err?.message||'Unable to load stock transfers')}
    finally{setLoading(false)}
  }
  useEffect(()=>{void load()},[])
  return <div className="inventory-transfer-stack">
    <div className="inventory-transfer-toolbar"><div className="module-segmented"><button className={mode==='history'?'is-active':''} onClick={()=>setMode('history')}>History</button><button className={mode==='create'?'is-active':''} onClick={()=>setMode('create')}>New Transfer</button></div><button onClick={load}><RefreshCw size={13}/> Refresh</button></div>
    {mode==='create'?<CreateTransfer stores={stores} onDone={async msg=>{onMessage?.(msg);setMode('history');await load()}} onError={onError}/>:<section className="module-page-card">{loading?<div className="module-state">Loading transfers…</div>:!rows.length?<div className="module-state">No transfers yet.</div>:<div className="module-table-wrap no-border"><table><thead><tr><th>Transfer</th><th>From</th><th>To</th><th>Products</th><th>Qty</th><th>Status</th><th>By</th><th>When</th><th></th></tr></thead><tbody>{rows.map(t=><tr key={t.id}><td><strong>{t.transfer_number}</strong></td><td>{t.from_store_name}</td><td>{t.to_store_name}</td><td>{t.item_count}</td><td>{qty(t.total_quantity)}</td><td>{t.status}</td><td>{t.created_by_name||'—'}</td><td>{new Date(t.created_at).toLocaleString()}</td><td><button className="module-table-action" onClick={()=>setOpenTransfer(t.id)}>View</button></td></tr>)}</tbody></table></div>}</section>}
    {openTransfer?<TransferDetail id={openTransfer} onClose={()=>setOpenTransfer(null)}/>:null}
  </div>
}

function CreateTransfer({stores,onDone,onError}){
  const [fromStoreId,setFromStoreId]=useState('')
  const [toStoreId,setToStoreId]=useState('')
  const [notes,setNotes]=useState('')
  const [lines,setLines]=useState([{productId:'',productName:'',quantity:''}])
  const [search,setSearch]=useState('')
  const [results,setResults]=useState([])
  const [submitting,setSubmitting]=useState(false)
  const searchProducts=async()=>{
    if(!search.trim())return
    try{const r=await apiRequest(`/api/products?search=${encodeURIComponent(search.trim())}`);setResults(Array.isArray(r?.data)?r.data:[])}
    catch{setResults([])}
  }
  const activePicker=lines.findIndex(l=>!l.productId)
  const pick=p=>{
    if(activePicker<0)return
    setLines(prev=>{
      const next=prev.map((l,i)=>i===activePicker?{...l,productId:p.id,productName:p.name}:l)
      return next.every(l=>l.productId)?[...next,{productId:'',productName:'',quantity:''}]:next
    })
    setSearch('');setResults([])
  }
  const submit=async()=>{
    onError?.('')
    if(!fromStoreId||!toStoreId)return onError?.('Choose both locations.')
    if(fromStoreId===toStoreId)return onError?.('Source and destination must be different.')
    const items=lines.filter(l=>l.productId).map(l=>({productId:l.productId,quantity:Number(l.quantity)}))
    if(!items.length)return onError?.('Add at least one product.')
    if(items.some(i=>!Number.isFinite(i.quantity)||i.quantity<=0))return onError?.('Quantities must be greater than zero.')
    try{
      setSubmitting(true)
      const r=await apiRequest('/api/inventory/transfers',{method:'POST',body:JSON.stringify({fromStoreId,toStoreId,notes:notes.trim()||null,items})})
      if(!r?.success)throw new Error(r?.message||'Unable to complete transfer')
      await onDone?.(`Transfer ${r.data?.transferNumber||''} completed.`)
    }catch(err){onError?.(err?.message||'Unable to complete transfer')}
    finally{setSubmitting(false)}
  }
  return <section className="module-panel inventory-transfer-create">
    <div className="inventory-transfer-grid">
      <label className="module-input-label"><span>From location</span><select value={fromStoreId} onChange={e=>setFromStoreId(e.target.value)}><option value="">Select source…</option>{stores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label className="module-input-label"><span>To location</span><select value={toStoreId} onChange={e=>setToStoreId(e.target.value)}><option value="">Select destination…</option>{stores.filter(s=>s.id!==fromStoreId).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    </div>
    <div className="inventory-transfer-lines">{lines.map((line,index)=><div key={index}><div className="inventory-picked-product">{line.productName||'Pick a product…'}{line.productId?<button onClick={()=>setLines(prev=>prev.map((l,i)=>i===index?{...l,productId:'',productName:''}:l))}><X size={12}/></button>:null}</div><input type="number" min="0.001" step="0.001" placeholder="Qty" value={line.quantity} onChange={e=>setLines(prev=>prev.map((l,i)=>i===index?{...l,quantity:e.target.value}:l))}/>{lines.length>1?<button onClick={()=>setLines(prev=>prev.filter((_,i)=>i!==index))}><Trash2 size={13}/></button>:null}</div>)}</div>
    <div className="inventory-product-search"><label className="module-search"><Search size={13}/><input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>e.key==='Enter'&&(e.preventDefault(),searchProducts())} placeholder="Search products to add…"/></label><button onClick={searchProducts}><Plus size={13}/> Add</button>{results.length?<div className="inventory-search-results">{results.map(p=><button key={p.id} onClick={()=>pick(p)}>{p.name}<span>{p.sku||''}</span></button>)}</div>:null}</div>
    <label className="module-textarea-label"><span>Reason / notes</span><textarea rows={2} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
    <div className="inventory-transfer-review"><span>{lines.filter(l=>l.productId).length} product(s){fromStoreId&&toStoreId&&fromStoreId!==toStoreId?<> · {stores.find(s=>s.id===fromStoreId)?.name} <ArrowRight size={12}/> {stores.find(s=>s.id===toStoreId)?.name}</>:null}</span><button className="module-primary-button" disabled={submitting} onClick={submit}>{submitting?'Transferring…':'Submit transfer'}</button></div>
  </section>
}

function TransferDetail({id,onClose}){
  const [state,setState]=useState({loading:true,error:'',data:null})
  useEffect(()=>{let live=true;apiRequest(`/api/inventory/transfers/${encodeURIComponent(id)}`).then(r=>live&&setState({loading:false,error:'',data:r.data})).catch(err=>live&&setState({loading:false,error:err?.message||'Unable to load transfer',data:null}));return()=>{live=false}},[id])
  return <div className="module-modal-backdrop"><section className="module-modal inventory-transfer-detail"><header><div><strong>Transfer Detail</strong><span>{state.data?.transfer?.transfer_number||''}</span></div><button onClick={onClose}><X size={16}/></button></header><div className="module-modal-body">{state.loading?<div className="module-state">Loading transfer…</div>:state.error?<div className="module-state is-error">{state.error}</div>:state.data?<><div className="inventory-transfer-summary"><strong>{state.data.transfer.from_store_name}</strong><ArrowRight size={14}/><strong>{state.data.transfer.to_store_name}</strong><span>{state.data.transfer.status} · {state.data.transfer.created_by_name||'—'} · {new Date(state.data.transfer.created_at).toLocaleString()}</span></div><div className="module-table-wrap"><table><thead><tr><th>Product</th><th>SKU</th><th>Quantity</th></tr></thead><tbody>{state.data.items.map(i=><tr key={i.product_id}><td>{i.product_name}</td><td>{i.sku||'—'}</td><td>{qty(i.quantity)}</td></tr>)}</tbody></table></div><h3 className="inventory-detail-heading">Movement audit trail</h3><div className="module-table-wrap"><table><thead><tr><th>Type</th><th>Store</th><th>Change</th><th>Balance</th><th>User</th></tr></thead><tbody>{state.data.movements.map((m,i)=><tr key={i}><td>{m.movement_type}</td><td>{m.store_name||'—'}</td><td>{Number(m.quantity_change)>0?'+':''}{qty(m.quantity_change)}</td><td>{qty(m.balance_after)}</td><td>{m.username||'—'}</td></tr>)}</tbody></table></div></>:null}</div></section></div>
}
