import { useEffect, useState } from 'react'
import { Ban, Plus, RefreshCw, Search, X } from 'lucide-react'
import { apiRequest } from '../../services/api'

function money(value,currency='GBP'){
  const n=Number(value||0)
  try{return new Intl.NumberFormat(undefined,{style:'currency',currency,maximumFractionDigits:2}).format(n)}
  catch{return `${n.toFixed(2)} ${currency}`}
}
function makeCode(){
  const chars='0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  const bytes=new Uint32Array(13)
  crypto.getRandomValues(bytes)
  const raw=[...bytes].map(n=>chars[n%chars.length]).join('')
  return `${raw.slice(0,4)}-${raw.slice(4,8)}-${raw.slice(8)}`
}

export default function GiftCardsPage({onBack}){
  const [cards,setCards]=useState([])
  const [customers,setCustomers]=useState([])
  const [currency,setCurrency]=useState('GBP')
  const [search,setSearch]=useState('')
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const [issue,setIssue]=useState(false)
  const [detail,setDetail]=useState(null)

  const load=async()=>{
    try{
      setLoading(true);setError('')
      const [g,c,s]=await Promise.all([
        apiRequest('/api/gift-cards'),
        apiRequest('/api/customers?scope=company').catch(()=>null),
        apiRequest('/api/settings').catch(()=>null),
      ])
      if(!g?.success)throw new Error(g?.message||'Unable to load gift cards')
      setCards(Array.isArray(g.data)?g.data:[])
      setCustomers(Array.isArray(c?.data)?c.data:[])
      setCurrency(s?.data?.company?.currency||'GBP')
    }catch(err){setError(err?.message||'Unable to load gift cards')}
    finally{setLoading(false)}
  }
  useEffect(()=>{void load()},[])

  const open=async card=>{
    try{
      setError('')
      const r=await apiRequest(`/api/gift-cards/${encodeURIComponent(card.id)}`)
      if(!r?.success)throw new Error(r?.message||'Unable to load gift card')
      setDetail({...card,...r.data})
    }catch(err){setError(err?.message||'Unable to load gift card')}
  }

  const toggle=async card=>{
    try{
      setError('');setMessage('')
      const r=await apiRequest(`/api/gift-cards/${encodeURIComponent(card.id)}/block`,{
        method:'POST',body:JSON.stringify({blocked:card.status!=='blocked'})
      })
      if(!r?.success)throw new Error(r?.message||'Unable to update gift card')
      setMessage(card.status==='blocked'?'Gift card unblocked.':'Gift card blocked.')
      await load()
      if(detail?.id===card.id)await open({...card,status:r.data?.status})
    }catch(err){setError(err?.message||'Unable to update gift card')}
  }

  const filtered=cards.filter(card=>{
    const q=search.trim().toLowerCase()
    return !q||[card.code,card.reference_number,card.customer_name].some(v=>String(v||'').toLowerCase().includes(q))
  })

  const status=card=>{
    if(card.status==='blocked')return 'Blocked'
    if(card.status==='expired')return 'Expired'
    if(Number(card.balance)<=0)return 'Depleted'
    return 'Active'
  }

  return <section className="module-page gift-cards-page">
    <header className="module-page-header">
      <div><span>Customer Value</span><h1>Gift Cards</h1><p>Issue, top up, block and inspect gift-card ledger activity.</p></div>
      <div className="module-header-actions">
        {onBack?<button onClick={onBack}>Back to Customers</button>:null}
        <button onClick={load}><RefreshCw size={14}/> Refresh</button>
        <button className="module-primary-button" onClick={()=>setIssue(true)}><Plus size={14}/> Issue Gift Card</button>
      </div>
    </header>

    {message?<div className="module-success module-page-message"><strong>{message}</strong></div>:null}
    {error?<div className="module-inline-error module-page-message">{error}</div>:null}

    <section className="module-panel gift-card-search"><label className="module-search"><Search size={13}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search code, reference or customer…"/></label></section>

    <section className="module-page-card">
      {loading?<div className="module-state">Loading gift cards…</div>:!filtered.length?<div className="module-state">No gift cards found.</div>:<div className="module-table-wrap no-border"><table><thead><tr><th>Code</th><th>Reference</th><th>Customer</th><th>Balance</th><th>Status</th><th>Expiry</th><th></th></tr></thead><tbody>{filtered.map(card=><tr key={card.id}>
        <td><strong className="gift-card-code">{card.code}</strong></td>
        <td>{card.reference_number||'—'}</td>
        <td>{card.customer_name||'Bearer'}</td>
        <td><strong>{money(card.balance,currency)}</strong></td>
        <td>{status(card)}</td>
        <td>{card.expires_at?new Date(card.expires_at).toLocaleDateString():'—'}</td>
        <td><div className="gift-card-actions"><button onClick={()=>open(card)}>Ledger</button>{card.status!=='expired'?<button onClick={()=>toggle(card)}><Ban size={12}/> {card.status==='blocked'?'Unblock':'Block'}</button>:null}</div></td>
      </tr>)}</tbody></table></div>}
    </section>

    {issue?<IssueGiftCard customers={customers} currency={currency} onClose={()=>setIssue(false)} onIssued={async msg=>{setIssue(false);setMessage(msg);await load()}}/>:null}
    {detail?<GiftCardDetail card={detail} currency={currency} onClose={()=>setDetail(null)} onChanged={async msg=>{setMessage(msg);await open(detail);await load()}}/>:null}
  </section>
}

function IssueGiftCard({customers,currency,onClose,onIssued}){
  const [form,setForm]=useState({value:'',code:makeCode(),referenceNumber:'',customerId:'',expiresAt:''})
  const [error,setError]=useState(''),[saving,setSaving]=useState(false)
  const submit=async e=>{
    e.preventDefault()
    const value=Number(form.value)
    if(!Number.isFinite(value)||value<=0)return setError('Value must be greater than zero.')
    if(!form.code.trim())return setError('Gift card code is required.')
    try{
      setSaving(true);setError('')
      const r=await apiRequest('/api/gift-cards',{method:'POST',body:JSON.stringify({...form,value,customerId:form.customerId||undefined,referenceNumber:form.referenceNumber.trim()||undefined,expiresAt:form.expiresAt||undefined})})
      if(!r?.success)throw new Error(r?.message||'Unable to issue gift card')
      await onIssued?.(`Gift card ${r.data.code} issued with ${money(r.data.balance,currency)}.`)
    }catch(err){setError(err?.message||'Unable to issue gift card')}
    finally{setSaving(false)}
  }
  return <div className="module-modal-backdrop"><form className="module-modal gift-card-issue-modal" onSubmit={submit}>
    <header><div><strong>Issue Gift Card</strong><span>Balance is derived from the immutable gift-card ledger.</span></div><button type="button" onClick={onClose}><X size={16}/></button></header>
    <div className="module-modal-body gift-card-form">{error?<div className="module-inline-error">{error}</div>:null}
      <label className="module-input-label"><span>Initial value</span><input autoFocus type="number" min="0.01" step="0.01" value={form.value} onChange={e=>setForm(f=>({...f,value:e.target.value}))}/></label>
      <label className="module-input-label"><span>Card code</span><div className="gift-code-input"><input value={form.code} onChange={e=>setForm(f=>({...f,code:e.target.value}))}/><button type="button" onClick={()=>setForm(f=>({...f,code:makeCode()}))}>Generate</button></div></label>
      <label className="module-input-label"><span>Printed / batch reference</span><input value={form.referenceNumber} onChange={e=>setForm(f=>({...f,referenceNumber:e.target.value}))}/></label>
      <label className="module-input-label"><span>Customer (optional)</span><select value={form.customerId} onChange={e=>setForm(f=>({...f,customerId:e.target.value}))}><option value="">Bearer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label className="module-input-label"><span>Expiry (optional)</span><input type="date" value={form.expiresAt} onChange={e=>setForm(f=>({...f,expiresAt:e.target.value}))}/></label>
    </div>
    <footer className="module-modal-footer"><button type="button" onClick={onClose}>Cancel</button><button className="module-primary-button" disabled={saving}>{saving?'Issuing…':'Issue Card'}</button></footer>
  </form></div>
}

function GiftCardDetail({card,currency,onClose,onChanged}){
  const [amount,setAmount]=useState(''),[error,setError]=useState(''),[saving,setSaving]=useState(false)
  const topup=async e=>{
    e.preventDefault()
    const value=Number(amount)
    if(!Number.isFinite(value)||value<=0)return setError('Top-up must be greater than zero.')
    try{
      setSaving(true);setError('')
      const r=await apiRequest(`/api/gift-cards/${encodeURIComponent(card.id)}/topup`,{method:'POST',body:JSON.stringify({amount:value})})
      if(!r?.success)throw new Error(r?.message||'Unable to top up gift card')
      setAmount('')
      await onChanged?.(`Gift card topped up. New balance ${money(r.data?.balance,currency)}.`)
    }catch(err){setError(err?.message||'Unable to top up gift card')}
    finally{setSaving(false)}
  }
  const label=t=>({issue:'Issued',topup:'Top-up',redeem:'Redeemed',adjustment:'Adjustment',refund:'Refund'}[t]||t)
  return <div className="module-modal-backdrop"><section className="module-modal gift-card-detail-modal">
    <header><div><strong>{card.code}</strong><span>Balance {money(card.balance,currency)} · {card.status}</span></div><button onClick={onClose}><X size={16}/></button></header>
    <div className="module-modal-body">
      {error?<div className="module-inline-error">{error}</div>:null}
      {card.status!=='blocked'&&card.status!=='expired'?<form className="gift-card-topup" onSubmit={topup}><label className="module-input-label"><span>Top-up amount</span><input type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></label><button className="module-primary-button" disabled={saving}>{saving?'Saving…':'Top up'}</button></form>:null}
      <div className="module-table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Balance after</th><th>Description</th></tr></thead><tbody>{(card.transactions||[]).map(tx=><tr key={tx.id}><td>{new Date(tx.created_at).toLocaleString()}</td><td>{label(tx.transaction_type)}</td><td className={tx.transaction_type==='redeem'?'is-negative':'is-positive'}>{tx.transaction_type==='redeem'?'-':''}{money(Math.abs(tx.amount),currency)}</td><td>{money(tx.balance_after,currency)}</td><td>{tx.description||'—'}</td></tr>)}</tbody></table></div>
      {!(card.transactions||[]).length?<div className="module-state compact">No transactions.</div>:null}
    </div>
  </section></div>
}
