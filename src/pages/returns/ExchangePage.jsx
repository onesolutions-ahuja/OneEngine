import { useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, Search, X } from 'lucide-react'
import { apiRequest } from '../../services/api'

const money=(v,c='GBP')=>{try{return new Intl.NumberFormat(undefined,{style:'currency',currency:c}).format(Number(v||0))}catch{return `${c} ${Number(v||0).toFixed(2)}`}}

export default function ExchangePage(){
  const [currency,setCurrency]=useState('GBP')
  const [mode,setMode]=useState('receipt')
  const [receipt,setReceipt]=useState('')
  const [lookup,setLookup]=useState(null)
  const [returnQty,setReturnQty]=useState({})
  const [products,setProducts]=useState([])
  const [productSearch,setProductSearch]=useState('')
  const [normalReturns,setNormalReturns]=useState([])
  const [replacements,setReplacements]=useState([])
  const [paymentMethod,setPaymentMethod]=useState('cash')
  const [reason,setReason]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')

  useEffect(()=>{
    Promise.all([
      apiRequest('/api/settings').catch(()=>null),
      apiRequest('/api/products/catalogue').catch(()=>null),
    ]).then(([settings,catalogue])=>{
      setCurrency(settings?.data?.company?.currency||'GBP')
      const payload=catalogue?.data||{}
      const rows=Array.isArray(payload)?payload:(payload.products||[])
      setProducts(rows.filter(p=>p.active!==false))
    })
  },[])

  const findSale=async()=>{
    if(!receipt.trim()) return
    setBusy(true);setError('');setMessage('')
    try{
      const r=await apiRequest(`/api/returns/lookup?receipt=${encodeURIComponent(receipt.trim())}`)
      if(!r?.success) throw new Error(r?.message||'Sale not found')
      if(!r?.data?.sale?.returnable) throw new Error('This sale is not exchangeable.')
      setLookup(r.data);setReturnQty({})
    }catch(e){setLookup(null);setError(e?.message||'Sale not found')}
    finally{setBusy(false)}
  }

  const candidates=useMemo(()=>{
    const q=productSearch.trim().toLowerCase()
    if(!q) return products.slice(0,30)
    return products.filter(p=>[p.name,p.sku,p.barcode].filter(Boolean).join(' ').toLowerCase().includes(q)).slice(0,30)
  },[products,productSearch])

  const addLine=(setter,product)=>{
    setter(rows=>{
      const id=product.id||product.product_id
      const found=rows.find(r=>r.productId===id)
      if(found) return rows.map(r=>r.productId===id?{...r,quantity:r.quantity+1}:r)
      return [...rows,{productId:id,name:product.name||product.product_name,quantity:1,price:Number(product.price||0),vatRate:Number(product.vat_rate||0)}]
    })
  }
  const changeLine=(setter,id,delta)=>setter(rows=>rows.map(r=>r.productId===id?{...r,quantity:Math.max(0,r.quantity+delta)}:r).filter(r=>r.quantity>0))

  const receiptReturns=useMemo(()=>!lookup?[]:(lookup.items||[]).map(item=>({
    saleItemId:item.id,productId:item.productId,quantity:Number(returnQty[item.id]||0),name:item.productName||item.product_name,unit:Number(item.unitRefundValue||0)
  })).filter(x=>x.quantity>0),[lookup,returnQty])
  const returnLines=mode==='receipt'?receiptReturns:normalReturns
  const estimatedReturn=returnLines.reduce((s,x)=>s+Number(x.unit??x.price??0)*Number(x.quantity||0),0)
  const estimatedReplacement=replacements.reduce((s,x)=>s+(Number(x.price||0)*(1+Number(x.vatRate||0)/100))*Number(x.quantity||0),0)
  const difference=estimatedReplacement-estimatedReturn

  const submit=async()=>{
    if(!returnLines.length||!replacements.length) return setError('Choose at least one returned item and one replacement item.')
    setBusy(true);setError('');setMessage('')
    try{
      const body={
        mode,
        ...(mode==='receipt'?{saleId:lookup?.sale?.id,receipt:receipt.trim()}:{ }),
        returnItems:returnLines.map(x=>({saleItemId:x.saleItemId||undefined,productId:x.productId,quantity:x.quantity})),
        replacementItems:replacements.map(x=>({productId:x.productId,quantity:x.quantity})),
        ...(difference>0?{paymentMethod}:{}),
        reason:reason||null,
        requestKey:`exchange-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      }
      const r=await apiRequest('/api/returns/exchanges',{method:'POST',body:JSON.stringify(body)})
      if(!r?.success) throw new Error(r?.message||'Unable to process exchange')
      setMessage(r.message||`Exchange ${r.data?.returnNumber||''} completed.`)
      setReceipt('');setLookup(null);setReturnQty({});setNormalReturns([]);setReplacements([]);setReason('')
    }catch(e){setError(e?.message||'Unable to process exchange')}
    finally{setBusy(false)}
  }

  return <section className="module-page exchange-page">
    <header className="module-page-header"><div><span>Transactions</span><h1>Exchange</h1><p>Return products and issue replacements using the existing Returns and Sales engine.</p></div><ArrowLeftRight size={22}/></header>
    {error?<div className="module-inline-error">{error}</div>:null}{message?<div className="module-success"><strong>{message}</strong></div>:null}
    <div className="module-stack">
      <section className="module-panel">
        <div className="module-segmented">
          <button type="button" className={mode==='receipt'?'is-active':''} onClick={()=>{setMode('receipt');setNormalReturns([])}}>With receipt</button>
          <button type="button" className={mode==='normal'?'is-active':''} onClick={()=>{setMode('normal');setLookup(null)}}>No receipt</button>
        </div>
        {mode==='receipt'?<div className="return-search-row">
          <label className="module-search"><Search size={14}/><input value={receipt} onChange={e=>setReceipt(e.target.value)} onKeyDown={e=>e.key==='Enter'&&findSale()} placeholder="Receipt number"/></label>
          <button type="button" className="module-primary-button" onClick={findSale} disabled={busy||!receipt.trim()}>{busy?'Searching…':'Find sale'}</button>
        </div>:<ProductPicker title="Items being returned" search={productSearch} setSearch={setProductSearch} candidates={candidates} onAdd={p=>addLine(setNormalReturns,p)} />}
      </section>

      {mode==='receipt'&&lookup?<section className="module-panel">
        <h3>Returned items</h3>
        <div className="module-table-wrap"><table><thead><tr><th>Product</th><th>Remaining</th><th>Refund/unit</th><th>Return qty</th></tr></thead><tbody>
          {(lookup.items||[]).map(item=><tr key={item.id}><td>{item.productName||item.product_name}</td><td>{item.remainingQuantity}</td><td>{money(item.unitRefundValue,currency)}</td><td><input className="return-qty-input" type="number" min="0" max={item.remainingQuantity} value={returnQty[item.id]||''} onChange={e=>setReturnQty(v=>({...v,[item.id]:Math.min(Number(item.remainingQuantity||0),Math.max(0,Number(e.target.value||0)))}))}/></td></tr>)}
        </tbody></table></div>
      </section>:null}

      {mode==='normal'?<LineList title="Return basket" rows={normalReturns} currency={currency} onChange={(id,d)=>changeLine(setNormalReturns,id,d)}/>:null}

      <section className="module-panel">
        <ProductPicker title="Replacement products" search={productSearch} setSearch={setProductSearch} candidates={candidates} onAdd={p=>addLine(setReplacements,p)} />
        <LineList title="Replacement basket" rows={replacements} currency={currency} onChange={(id,d)=>changeLine(setReplacements,id,d)}/>
      </section>

      <section className="module-panel exchange-settlement">
        <div><span>Estimated return value</span><strong>{money(estimatedReturn,currency)}</strong></div>
        <div><span>Estimated replacement value</span><strong>{money(estimatedReplacement,currency)}</strong></div>
        <div className="is-total"><span>{difference>0?'Customer pays':difference<0?'Customer refund':'Even exchange'}</span><strong>{money(Math.abs(difference),currency)}</strong></div>
        {difference>0?<label>Payment method<select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)}><option value="cash">Cash</option><option value="card">Card</option><option value="customer_credit">Customer credit</option><option value="gift_card">Gift card</option><option value="bank_transfer">Bank transfer</option></select></label>:null}
        <label>Reason<textarea rows="2" value={reason} onChange={e=>setReason(e.target.value)}/></label>
        <button type="button" className="module-primary-button" onClick={submit} disabled={busy||!returnLines.length||!replacements.length}>{busy?'Processing…':'Complete exchange'}</button>
      </section>
    </div>
  </section>
}

function ProductPicker({title,search,setSearch,candidates,onAdd}){
  return <div className="exchange-picker"><strong>{title}</strong><label className="module-search"><Search size={14}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search product, SKU or barcode"/></label><div className="exchange-picker-results">{candidates.map(p=><button type="button" key={p.id||p.product_id} onClick={()=>onAdd(p)}><span>{p.name||p.product_name}</span><b>+</b></button>)}</div></div>
}
function LineList({title,rows,currency,onChange}){
  if(!rows.length) return <div className="module-state">{title}: no items selected.</div>
  return <div className="module-table-wrap"><table><thead><tr><th>{title}</th><th>Qty</th><th>Price</th><th></th></tr></thead><tbody>{rows.map(r=><tr key={r.productId}><td>{r.name}</td><td>{r.quantity}</td><td>{money(r.price,currency)}</td><td><div className="till-qty"><button type="button" onClick={()=>onChange(r.productId,-1)}>−</button><button type="button" onClick={()=>onChange(r.productId,1)}>+</button></div></td></tr>)}</tbody></table></div>
}
