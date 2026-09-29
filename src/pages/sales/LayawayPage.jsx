import { useEffect, useMemo, useState } from 'react'
import { CreditCard, Plus, RefreshCw, Search, X } from 'lucide-react'
import { apiRequest } from '../../services/api'

const money=(v,c='GBP')=>{try{return new Intl.NumberFormat(undefined,{style:'currency',currency:c}).format(Number(v||0))}catch{return `${c} ${Number(v||0).toFixed(2)}`}}

export default function LayawayPage(){
  const [currency,setCurrency]=useState('GBP')
  const [rows,setRows]=useState([])
  const [selected,setSelected]=useState(null)
  const [detail,setDetail]=useState(null)
  const [products,setProducts]=useState([])
  const [search,setSearch]=useState('')
  const [customers,setCustomers]=useState([])
  const [customerSearch,setCustomerSearch]=useState('')
  const [customer,setCustomer]=useState(null)
  const [basket,setBasket]=useState([])
  const [deposit,setDeposit]=useState('')
  const [paymentMethod,setPaymentMethod]=useState('cash')
  const [dueDate,setDueDate]=useState('')
  const [notes,setNotes]=useState('')
  const [paymentAmount,setPaymentAmount]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')

  const load=async()=>{
    setBusy(true);setError('')
    try{
      const [list,settings,catalogue]=await Promise.all([
        apiRequest('/api/layaways'),
        apiRequest('/api/settings').catch(()=>null),
        apiRequest('/api/products/catalogue').catch(()=>null),
      ])
      if(!list?.success) throw new Error(list?.message||'Unable to load layaways')
      setRows(Array.isArray(list.data)?list.data:[])
      setCurrency(settings?.data?.company?.currency||'GBP')
      const payload=catalogue?.data||{}
      const items=Array.isArray(payload)?payload:(payload.products||[])
      setProducts(items.filter(p=>p.active!==false))
    }catch(e){setError(e?.message||'Unable to load layaways')}
    finally{setBusy(false)}
  }
  useEffect(()=>{void load()},[])

  const candidates=useMemo(()=>{
    const q=search.trim().toLowerCase()
    if(!q) return products.slice(0,25)
    return products.filter(p=>[p.name,p.sku,p.barcode].filter(Boolean).join(' ').toLowerCase().includes(q)).slice(0,25)
  },[products,search])

  const searchCustomers=async(value)=>{
    setCustomerSearch(value)
    if(value.trim().length<2){setCustomers([]);return}
    try{
      const r=await apiRequest(`/api/customers?search=${encodeURIComponent(value.trim())}&limit=20`)
      setCustomers(Array.isArray(r?.data)?r.data:(r?.data?.customers||[]))
    }catch{setCustomers([])}
  }

  const addProduct=(p)=>setBasket(rows=>{
    const id=p.id||p.product_id
    const found=rows.find(r=>r.productId===id)
    if(found) return rows.map(r=>r.productId===id?{...r,quantity:r.quantity+1}:r)
    return [...rows,{productId:id,name:p.name||p.product_name,quantity:1,price:Number(p.price||0),vatRate:Number(p.vat_rate||0)}]
  })
  const changeQty=(id,d)=>setBasket(rows=>rows.map(r=>r.productId===id?{...r,quantity:Math.max(0,r.quantity+d)}:r).filter(r=>r.quantity>0))
  const estimatedTotal=basket.reduce((s,r)=>s+(r.price*(1+r.vatRate/100))*r.quantity,0)

  const create=async()=>{
    if(!basket.length) return setError('Add at least one item.')
    setBusy(true);setError('');setMessage('')
    try{
      const amount=Number(deposit||0)
      const r=await apiRequest('/api/layaways',{method:'POST',body:JSON.stringify({
        items:basket.map(x=>({productId:x.productId,quantity:x.quantity})),
        customerId:customer?.id||null,
        deposit:amount,
        ...(amount>0?{paymentMethod}:{}),
        dueDate:dueDate||null,
        notes:notes||null,
      })})
      if(!r?.success) throw new Error(r?.message||'Unable to create layaway')
      setMessage('Layaway created.')
      setBasket([]);setCustomer(null);setCustomerSearch('');setCustomers([]);setDeposit('');setDueDate('');setNotes('')
      await load()
    }catch(e){setError(e?.message||'Unable to create layaway')}
    finally{setBusy(false)}
  }

  const openDetail=async(row)=>{
    setSelected(row);setDetail(null);setPaymentAmount('');setError('')
    try{
      const r=await apiRequest(`/api/layaways/${encodeURIComponent(row.id)}`)
      if(!r?.success) throw new Error(r?.message||'Unable to load layaway')
      setDetail(r.data)
    }catch(e){setError(e?.message||'Unable to load layaway')}
  }

  const postAction=async(kind)=>{
    if(!detail?.id) return
    setBusy(true);setError('');setMessage('')
    try{
      let path=`/api/layaways/${encodeURIComponent(detail.id)}/${kind}`
      let body={}
      if(kind==='payments'){
        const amount=Number(paymentAmount)
        if(!(amount>0)) throw new Error('Enter a positive payment amount.')
        body={amount,paymentMethod}
      }
      const r=await apiRequest(path,{method:'POST',body:JSON.stringify(body)})
      if(!r?.success) throw new Error(r?.message||`Unable to ${kind}`)
      setMessage(kind==='payments'?'Payment recorded.':kind==='complete'?'Layaway completed.':'Layaway cancelled.')
      await load()
      if(kind==='payments') await openDetail({...detail})
      else {setSelected(null);setDetail(null)}
    }catch(e){setError(e?.message||'Unable to update layaway')}
    finally{setBusy(false)}
  }

  return <section className="module-page layaway-page">
    <header className="module-page-header"><div><span>Transactions</span><h1>Layaway</h1><p>Create layaways, collect instalments and complete fully paid orders.</p></div><button type="button" onClick={load}><RefreshCw size={13}/> Refresh</button></header>
    {error?<div className="module-inline-error">{error}</div>:null}{message?<div className="module-success"><strong>{message}</strong></div>:null}

    <div className="layaway-grid">
      <section className="module-panel">
        <h3>New layaway</h3>
        <label className="module-search"><Search size={14}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search products"/></label>
        <div className="exchange-picker-results">{candidates.map(p=><button type="button" key={p.id||p.product_id} onClick={()=>addProduct(p)}><span>{p.name||p.product_name}</span><Plus size={12}/></button>)}</div>
        {basket.length?<div className="module-table-wrap"><table><thead><tr><th>Product</th><th>Qty</th><th>Est. value</th><th></th></tr></thead><tbody>{basket.map(r=><tr key={r.productId}><td>{r.name}</td><td>{r.quantity}</td><td>{money((r.price*(1+r.vatRate/100))*r.quantity,currency)}</td><td><div className="till-qty"><button type="button" onClick={()=>changeQty(r.productId,-1)}>−</button><button type="button" onClick={()=>changeQty(r.productId,1)}>+</button></div></td></tr>)}</tbody></table></div>:<div className="module-state">No items selected.</div>}

        <label className="module-field-label">Customer (optional)</label>
        <label className="module-search"><Search size={14}/><input value={customerSearch} onChange={e=>searchCustomers(e.target.value)} placeholder="Search customer"/></label>
        {customer?<div className="layaway-selected-customer"><span>{customer.name}</span><button type="button" onClick={()=>setCustomer(null)}><X size={12}/></button></div>:null}
        {!customer&&customers.length?<div className="layaway-customer-results">{customers.map(c=><button type="button" key={c.id} onClick={()=>{setCustomer(c);setCustomerSearch(c.name||'');setCustomers([])}}>{c.name}<small>{c.phone||c.email||''}</small></button>)}</div>:null}

        <div className="objects-rule-grid">
          <label>Deposit<input type="number" min="0" step="0.01" value={deposit} onChange={e=>setDeposit(e.target.value)}/></label>
          <label>Payment method<select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)} disabled={!(Number(deposit)>0)}><option value="cash">Cash</option><option value="card">Card</option><option value="customer_credit">Customer credit</option><option value="gift_card">Gift card</option><option value="bank_transfer">Bank transfer</option></select></label>
          <label>Due date<input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></label>
        </div>
        <label className="module-textarea-label"><span>Notes</span><textarea rows="2" value={notes} onChange={e=>setNotes(e.target.value)}/></label>
        <div className="return-footer"><span>Estimated total: <strong>{money(estimatedTotal,currency)}</strong></span><button type="button" className="module-primary-button" onClick={create} disabled={busy||!basket.length}>{busy?'Saving…':'Create layaway'}</button></div>
      </section>

      <section className="module-panel module-table-panel">
        <h3>Layaways</h3>
        {busy&&!rows.length?<div className="module-state">Loading…</div>:!rows.length?<div className="module-state">No layaways found.</div>:<div className="module-table-wrap no-border"><table><thead><tr><th>Customer</th><th>Total</th><th>Paid</th><th>Balance</th><th>Due</th><th>Status</th></tr></thead><tbody>{rows.map(r=><tr key={r.id} className="return-history-row" onClick={()=>openDetail(r)}><td>{r.customer_name||'Walk-in'}</td><td>{money(r.total,currency)}</td><td>{money(r.paid_amount,currency)}</td><td>{money(r.balance,currency)}</td><td>{r.due_date?new Date(r.due_date).toLocaleDateString():'—'}</td><td>{r.status}</td></tr>)}</tbody></table></div>}
      </section>
    </div>

    {selected?<div className="till-modal-backdrop"><section className="till-modal is-wide"><header><strong>Layaway</strong><button type="button" onClick={()=>{setSelected(null);setDetail(null)}}><X size={15}/></button></header><div className="till-modal-body">
      {!detail?<div className="module-state">Loading…</div>:<>
        <div className="return-sale-meta"><div><span>Customer</span><strong>{detail.customer_name||'Walk-in'}</strong></div><div><span>Total</span><strong>{money(detail.total,currency)}</strong></div><div><span>Balance</span><strong>{money(detail.balance,currency)}</strong></div><div><span>Status</span><strong>{detail.status}</strong></div></div>
        <div className="module-table-wrap"><table><thead><tr><th>Item</th><th>Qty</th><th>Total</th></tr></thead><tbody>{(detail.items||[]).map(i=><tr key={i.id}><td>{i.product_name}</td><td>{i.quantity}</td><td>{money(i.total,currency)}</td></tr>)}</tbody></table></div>
        {detail.status==='OPEN'?<div className="layaway-actions">
          <label>Payment<input type="number" min="0.01" max={detail.balance} step="0.01" value={paymentAmount} onChange={e=>setPaymentAmount(e.target.value)}/></label>
          <select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)}><option value="cash">Cash</option><option value="card">Card</option><option value="customer_credit">Customer credit</option><option value="gift_card">Gift card</option><option value="bank_transfer">Bank transfer</option></select>
          <button type="button" onClick={()=>postAction('payments')} disabled={busy}><CreditCard size={13}/> Record payment</button>
          <button type="button" onClick={()=>postAction('complete')} disabled={busy||Number(detail.balance)>0}>Complete</button>
          <button type="button" className="objects-rule-danger" onClick={()=>postAction('cancel')} disabled={busy}>Cancel layaway</button>
        </div>:null}
      </>}
    </div></section></div>:null}
  </section>
}
