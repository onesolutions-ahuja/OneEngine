import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, Download, Gift, Plus, RefreshCw, Search, Upload, Users, X } from 'lucide-react'
import { apiFetch, apiRequest } from '../../services/api'
import RecordListView from '../../components/RecordListView'
import { SaleDetail } from '../sales/SalesPage'
import { serializeMaximumAgeDays, validateCreditPaymentAmount } from './customerCreditForm'

function money(value,currency='GBP'){
  const n=Number(value||0)
  try{return new Intl.NumberFormat(undefined,{style:'currency',currency,maximumFractionDigits:2}).format(n)}
  catch{return `${n.toFixed(2)} ${currency}`}
}
function dt(value){if(!value)return '—';const d=new Date(value);return Number.isNaN(d.getTime())?String(value):d.toLocaleString()}

export default function CustomersPage({onOpenGiftCards}){
  const [customers,setCustomers]=useState([])
  const [currency,setCurrency]=useState('GBP')
  const [permissions,setPermissions]=useState([])
  const [entitlements,setEntitlements]=useState({})
  const [isAdmin,setIsAdmin]=useState(false)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const [editor,setEditor]=useState(null)
  const [detail,setDetail]=useState(null)
  const [loyalty,setLoyalty]=useState(null)
  const [credit,setCredit]=useState(null)
  const [historySale,setHistorySale]=useState(null)
  const [segmentsOpen,setSegmentsOpen]=useState(false)
  const [importOpen,setImportOpen]=useState(false)
  const [exportBusy,setExportBusy]=useState(false)

  const load=async()=>{
    try{
      setLoading(true);setError('')
      const [c,s,p]=await Promise.all([
        apiRequest('/api/customers'),
        apiRequest('/api/settings').catch(()=>null),
        apiRequest('/api/auth/me/permissions').catch(()=>null),
      ])
      if(!c?.success)throw new Error(c?.message||'Unable to load customers')
      setCustomers(Array.isArray(c.data)?c.data:[])
      setCurrency(s?.data?.company?.currency||'GBP')
      setPermissions(p?.data?.permissions||[])
      setEntitlements(p?.data?.entitlements||{})
      setIsAdmin(p?.data?.isAdmin===true)
    }catch(err){setError(err?.message||'Unable to load customers')}
    finally{setLoading(false)}
  }
  useEffect(()=>{void load()},[])

  const openDetail=async(row)=>{
    try{
      setError('')
      const r=await apiRequest(`/api/customers/${encodeURIComponent(row.id)}`)
      if(!r?.success)throw new Error(r?.message||'Unable to load customer')
      setDetail(r.data)
    }catch(err){setError(err?.message||'Unable to load customer')}
  }

  const toggle=async(row)=>{
    try{
      setError('')
      const r=await apiRequest(`/api/customers/${encodeURIComponent(row.id)}/status`,{
        method:'PATCH',body:JSON.stringify({active:!row.active})
      })
      if(!r?.success)throw new Error(r?.message||'Unable to update customer')
      setMessage(row.active?'Customer deactivated.':'Customer activated.')
      await load()
    }catch(err){setError(err?.message||'Unable to update customer')}
  }

  const doExport=async()=>{
    try{
      setExportBusy(true);setError('')
      const res=await apiFetch('/api/customers/export',{headers:{Accept:'text/csv'}})
      if(!res.ok)throw new Error('Unable to export customers')
      const blob=await res.blob(),url=URL.createObjectURL(blob),a=document.createElement('a')
      a.href=url;a.download=`customers-export-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(url)
    }catch(err){setError(err?.message||'Unable to export customers')}
    finally{setExportBusy(false)}
  }

  const openSale=async(sale)=>{
    try{
      const r=await apiRequest(`/api/sales/${encodeURIComponent(sale.id)}`)
      if(!r?.success)throw new Error(r?.message||'Unable to load sale')
      setHistorySale(r.data||r.sale||sale)
    }catch(err){setError(err?.message||'Unable to load sale')}
  }

  const loyaltyLicensed=entitlements.loyalty===true
  const canManageCredit=isAdmin||permissions.includes('customer.edit')
  const canTakePayment=isAdmin||permissions.includes('payment.manage')||permissions.includes('customer.edit')
  const activeCount=customers.filter(c=>c.active!==false).length

  const columns=useMemo(()=>{
    const base=[
      {key:'name',label:'Customer',render:r=>r.name||'—'},
      {key:'phone',label:'Phone',render:r=>r.phone||'—'},
      {key:'email',label:'Email',render:r=>r.email||'—'},
      {key:'loyalty_number',label:'Reference',render:r=>r.loyalty_number?`#${r.loyalty_number}`:'—'},
    ]
    if(loyaltyLicensed)base.push({key:'loyalty_balance',label:'Loyalty',render:r=>money(r.loyalty_balance,currency)})
    base.push(
      {key:'store_names',label:'Stores',render:r=>r.store_names||'Current store'},
      {key:'last_purchase_at',label:'Last purchase',render:r=>r.last_purchase_at?new Date(r.last_purchase_at).toLocaleDateString():'—'},
      {key:'active',label:'Status',render:r=>r.active===false?'Inactive':'Active'},
    )
    return base
  },[loyaltyLicensed,currency])

  return <section className="module-page customers-page">
    <header className="module-page-header">
      <div><span>CRM</span><h1>Customers</h1><p>Customer records, loyalty, credit, segments and transaction history.</p></div>
      <div className="module-header-actions">
        <button onClick={()=>setSegmentsOpen(true)}><Users size={14}/> Segments</button>
        {onOpenGiftCards?<button onClick={onOpenGiftCards}><Gift size={14}/> Gift Cards</button>:null}
        <button onClick={doExport} disabled={exportBusy}><Download size={14}/> {exportBusy?'Exporting…':'Export'}</button>
        <button onClick={()=>setImportOpen(true)}><Upload size={14}/> Import</button>
        <button onClick={load}><RefreshCw size={14}/> Refresh</button>
        <button className="module-primary-button" onClick={()=>setEditor({})}><Plus size={14}/> New Customer</button>
      </div>
    </header>

    {message?<div className="module-success module-page-message"><strong>{message}</strong></div>:null}
    {error?<div className="module-inline-error module-page-message">{error}</div>:null}

    <div className="product-stats customer-stats">
      <div><span>Total Customers</span><strong>{customers.length}</strong></div>
      <div><span>Active</span><strong>{activeCount}</strong></div>
      <div><span>Inactive</span><strong>{customers.length-activeCount}</strong></div>
    </div>

    <section className="module-page-card">
      <RecordListView
        title="Customer list"
        subtitle={`${customers.length} customers`}
        rows={customers}
        columns={columns}
        searchKeys={['name','phone','email','loyalty_number','store_names']}
        loading={loading}
        error={error}
        onRowSelect={openDetail}
        renderRowActions={row=><div className="customer-row-actions">
          <button onClick={e=>{e.stopPropagation();void openDetail(row)}}>View</button>
          <button onClick={e=>{e.stopPropagation();setEditor(row)}}>Edit</button>
          {loyaltyLicensed?<button title="Loyalty" onClick={e=>{e.stopPropagation();setLoyalty(row)}}><Gift size={12}/></button>:null}
          <button title="Customer credit" onClick={e=>{e.stopPropagation();setCredit(row)}}><BookOpen size={12}/></button>
          <button onClick={e=>{e.stopPropagation();void toggle(row)}}>{row.active===false?'Activate':'Deactivate'}</button>
        </div>}
      />
    </section>

    {editor?<CustomerEditor customer={editor} onClose={()=>setEditor(null)} onSaved={async msg=>{setEditor(null);setMessage(msg);await load()}}/>:null}
    {detail?<CustomerDetail customer={detail} currency={currency} loyaltyLicensed={loyaltyLicensed} onClose={()=>setDetail(null)} onEdit={()=>{setEditor(detail);setDetail(null)}} onLoyalty={()=>setLoyalty(detail)} onCredit={()=>setCredit(detail)} onSale={openSale}/>:null}
    {loyalty?<LoyaltyModal customer={loyalty} currency={currency} canAdjust={isAdmin||permissions.includes('loyalty.adjust')||permissions.includes('customer.edit')} onClose={()=>setLoyalty(null)}/>:null}
    {credit?<CustomerCredit customer={credit} currency={currency} canManage={canManageCredit} canTakePayment={canTakePayment} onClose={()=>setCredit(null)}/>:null}
    {historySale?<SaleDetail sale={historySale} currency={currency} onClose={()=>setHistorySale(null)}/>:null}
    {segmentsOpen?<CustomerSegments customers={customers} onClose={()=>setSegmentsOpen(false)}/>:null}
    {importOpen?<CustomerImport onClose={()=>setImportOpen(false)} onImported={async()=>{setMessage('Customer import completed.');await load()}}/>:null}
  </section>
}

function CustomerEditor({customer,onClose,onSaved}){
  const [values,setValues]=useState({name:customer?.name||'',phone:customer?.phone||'',email:customer?.email||'',address:customer?.address||'',postcode:customer?.postcode||'',notes:customer?.notes||''})
  const [configuration,setConfiguration]=useState(null)
  const [platform,setPlatform]=useState({customFields:{},recordTypeId:null})
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  useEffect(()=>{
    let live=true
    apiRequest(`/api/platform/system/customer/configuration${customer?.id?`?recordId=${encodeURIComponent(customer.id)}`:''}`).then(r=>{
      if(!live)return
      const data=r?.data||{};setConfiguration(data)
      const selected=data.recordTypeId||(!customer?.id?(data.recordTypes||[]).find(t=>t.is_default)?.id:null)||null
      const defaults=!customer?.id?(data.recordTypes||[]).find(t=>t.id===selected)?.default_values||{}:{}
      setPlatform({customFields:{...(data.customFields||{}),...defaults},recordTypeId:selected})
    }).catch(err=>live&&setError(err?.message||'Unable to load Customer configuration'))
    return()=>{live=false}
  },[customer?.id])
  const extensionFields=(configuration?.fields||[]).filter(f=>f?.config?.storage==='extension'&&f.writable!==false&&f.active!==false)
  const submit=async e=>{
    e.preventDefault()
    if(!values.name.trim())return setError('Customer name is required.')
    try{
      setSaving(true);setError('')
      const r=await apiRequest(customer?.id?`/api/customers/${encodeURIComponent(customer.id)}`:'/api/customers',{
        method:customer?.id?'PUT':'POST',
        body:JSON.stringify({...values,name:values.name.trim(),platform})
      })
      if(!r?.success)throw new Error(r?.message||'Unable to save customer')
      await onSaved?.(customer?.id?'Customer updated.':r.message||'Customer saved.')
    }catch(err){setError(err?.message||'Unable to save customer')}
    finally{setSaving(false)}
  }
  return <div className="module-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&!saving&&onClose()}><form className="module-modal customer-editor-modal" onSubmit={submit}>
    <header><div><strong>{customer?.id?'Edit Customer':'New Customer'}</strong><span>Create also preserves duplicate matching and store association rules.</span></div><button type="button" onClick={onClose}><X size={16}/></button></header>
    <div className="module-modal-body customer-editor-grid">
      {error?<div className="module-inline-error customer-full">{error}</div>:null}
      {['name','phone','email','address','postcode'].map(key=><label key={key} className={`module-input-label ${key==='address'?'customer-full':''}`}><span>{key==='postcode'?'Postcode':key.charAt(0).toUpperCase()+key.slice(1)}</span><input type={key==='email'?'email':'text'} value={values[key]} onChange={e=>setValues(v=>({...v,[key]:e.target.value}))}/></label>)}
      <label className="module-textarea-label customer-full"><span>Notes</span><textarea rows={3} value={values.notes} onChange={e=>setValues(v=>({...v,notes:e.target.value}))}/></label>
      {configuration?.recordTypes?.length?<label className="module-input-label customer-full"><span>Record type</span><select value={platform.recordTypeId||''} onChange={e=>setPlatform(p=>({...p,recordTypeId:e.target.value||null}))}><option value="">Default</option>{configuration.recordTypes.map(t=><option key={t.id} value={t.id}>{t.label||t.name}</option>)}</select></label>:null}
      {extensionFields.length?<div className="customer-extension-fields customer-full"><h3>Configured fields</h3>{extensionFields.map(field=><CustomerExtensionField key={field.id||field.api_name} field={field} value={platform.customFields?.[field.api_name]} onChange={value=>setPlatform(p=>({...p,customFields:{...p.customFields,[field.api_name]:value}}))}/>)}</div>:null}
    </div>
    <footer className="module-modal-footer"><button type="button" onClick={onClose}>Cancel</button><button className="module-primary-button" disabled={saving||!configuration}>{saving?'Saving…':'Save Customer'}</button></footer>
  </form></div>
}

function CustomerExtensionField({field,value,onChange}){
  const type=String(field.field_type||'text').toLowerCase(),opts=Array.isArray(field.options)?field.options:[]
  if(type==='boolean')return <label className="customer-extension-toggle"><span>{field.label||field.api_name}</span><button type="button" className={`mac-switch ${value===true?'is-on':''}`} onClick={()=>onChange(value!==true)}><span/></button></label>
  if(type==='picklist')return <label className="module-input-label"><span>{field.label||field.api_name}</span><select value={value??''} onChange={e=>onChange(e.target.value)}><option value="">—</option>{opts.map(o=><option key={typeof o==='object'?o.value:o} value={typeof o==='object'?o.value:o}>{typeof o==='object'?(o.label||o.value):o}</option>)}</select></label>
  return <label className="module-input-label"><span>{field.label||field.api_name}</span><input type={['number','decimal','currency'].includes(type)?'number':type==='date'?'date':'text'} value={value??''} onChange={e=>onChange(['number','decimal','currency'].includes(type)?(e.target.value===''?null:Number(e.target.value)):e.target.value)}/></label>
}

function CustomerDetail({customer,currency,loyaltyLicensed,onClose,onEdit,onLoyalty,onCredit,onSale}){
  const totalSpent=(customer.sales||[]).reduce((sum,s)=>sum+Number(s.total||0),0),orders=(customer.sales||[]).length
  return <div className="module-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><section className="module-modal customer-detail-modal">
    <header><div><strong>{customer.name}</strong><span>{customer.email||'Customer'}{customer.loyalty_number?` · Loyalty #${customer.loyalty_number}`:''}</span></div><div className="customer-detail-actions"><button onClick={onEdit}>Edit</button>{loyaltyLicensed?<button onClick={onLoyalty}>Loyalty</button>:null}<button onClick={onCredit}>Credit</button><button onClick={onClose}><X size={16}/></button></div></header>
    <div className="module-modal-body customer-detail-body">
      <div className="customer-summary-grid"><div><span>Total orders</span><strong>{orders}</strong></div><div><span>Total spent</span><strong>{money(totalSpent,currency)}</strong></div><div><span>Avg order</span><strong>{money(orders?totalSpent/orders:0,currency)}</strong></div><div><span>Stores</span><strong>{(customer.stores||[]).length}</strong></div></div>
      <div className="customer-contact-grid"><div><span>Phone</span><strong>{customer.phone||'—'}</strong></div><div><span>Email</span><strong>{customer.email||'—'}</strong></div><div><span>Address</span><strong>{customer.address||'—'}</strong></div><div><span>Postcode</span><strong>{customer.postcode||'—'}</strong></div></div>
      {customer.notes?<div className="customer-notes"><span>Notes</span><p>{customer.notes}</p></div>:null}
      <div className="customer-section-head"><strong>Store associations</strong></div>
      <div className="customer-store-tags">{(customer.stores||[]).length?customer.stores.map(s=><span key={s.storeId} className={s.active?'is-active':''}>{s.storeName}</span>):<em>No store associations.</em>}</div>
      <div className="customer-section-head"><strong>Sales history</strong><span>{orders} transactions</span></div>
      {(customer.sales||[]).length?<div className="module-table-wrap"><table><thead><tr><th>Reference</th><th>Store</th><th>Date</th><th>Payment</th><th>Status</th><th>Total</th></tr></thead><tbody>{customer.sales.map(s=><tr key={s.id} className="customer-sale-row" onClick={()=>onSale(s)}><td>{s.receipt_number||String(s.id).slice(0,8)}</td><td>{s.store_name||'—'}</td><td>{dt(s.created_at)}</td><td>{s.payment_method||'—'}</td><td>{s.status}</td><td><strong>{money(s.total,currency)}</strong></td></tr>)}</tbody></table></div>:<div className="module-state compact">No sales recorded.</div>}
    </div>
  </section></div>
}

function LoyaltyModal({customer,currency,canAdjust,onClose}){
  const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[adjust,setAdjust]=useState(false)
  const load=async()=>{try{setLoading(true);setError('');const r=await apiRequest(`/api/customers/${customer.id}/loyalty`);if(!r?.success)throw new Error(r?.message||'Unable to load loyalty');setData(r.data)}catch(err){setError(err?.message||'Unable to load loyalty')}finally{setLoading(false)}}
  useEffect(()=>{void load()},[customer.id])
  return <div className="module-modal-backdrop"><section className="module-modal customer-loyalty-modal"><header><div><strong>Loyalty History</strong><span>{customer.name}</span></div><div className="customer-detail-actions">{canAdjust?<button onClick={()=>setAdjust(true)}>Adjust points</button>:null}<button onClick={onClose}><X size={16}/></button></div></header><div className="module-modal-body">
    {loading?<div className="module-state">Loading loyalty…</div>:error?<div className="module-inline-error">{error}</div>:<><div className="customer-loyalty-balance"><span>Current Balance</span><strong>{money(data?.balance,currency)}</strong></div><div className="customer-loyalty-list">{(data?.transactions||[]).map(tx=><div key={tx.id}><div><strong>{tx.transaction_type==='EARN'?'Earned':tx.transaction_type==='REVERSE'?'Reversed':tx.transaction_type}</strong><span>{dt(tx.created_at)}{tx.full_name?` · ${tx.full_name}`:''}</span>{tx.description?<small>{tx.description}</small>:null}</div><div><b className={Number(tx.amount)>=0?'is-positive':'is-negative'}>{Number(tx.amount)>=0?'+':''}{money(tx.amount,currency)}</b><span>Balance {money(tx.balance_after,currency)}</span></div></div>)}</div>{!data?.transactions?.length?<div className="module-state compact">No loyalty transactions.</div>:null}</>}
  </div>{adjust?<LoyaltyAdjust customer={customer} onClose={()=>setAdjust(false)} onDone={async()=>{setAdjust(false);await load()}}/>:null}</section></div>
}
function LoyaltyAdjust({customer,onClose,onDone}){
  const [points,setPoints]=useState(''),[reason,setReason]=useState(''),[error,setError]=useState(''),[saving,setSaving]=useState(false)
  const submit=async e=>{e.preventDefault();const value=Number(points);if(!Number.isFinite(value)||value===0)return setError('Enter a non-zero number of points.');if(!reason.trim())return setError('A reason is required.');try{setSaving(true);setError('');const r=await apiRequest(`/api/customers/${customer.id}/loyalty/adjust`,{method:'POST',body:JSON.stringify({points:value,reason:reason.trim()})});if(!r?.success)throw new Error(r?.message||'Unable to adjust points');await onDone?.()}catch(err){setError(err?.message||'Unable to adjust points')}finally{setSaving(false)}}
  return <div className="module-modal-backdrop nested"><form className="module-modal customer-adjust-modal" onSubmit={submit}><header><div><strong>Adjust points</strong><span>{customer.name}</span></div><button type="button" onClick={onClose}><X size={16}/></button></header><div className="module-modal-body customer-adjust-grid">{error?<div className="module-inline-error customer-full">{error}</div>:null}<label className="module-input-label"><span>Points (negative to remove)</span><input type="number" step="0.0001" value={points} onChange={e=>setPoints(e.target.value)}/></label><label className="module-input-label"><span>Reason</span><input value={reason} onChange={e=>setReason(e.target.value)}/></label></div><footer className="module-modal-footer"><button type="button" onClick={onClose}>Cancel</button><button className="module-primary-button" disabled={saving}>{saving?'Saving…':'Apply adjustment'}</button></footer></form></div>
}

function CustomerCredit({customer,currency,canManage,canTakePayment,onClose}){
  const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState('')
  const [enabled,setEnabled]=useState(false),[limit,setLimit]=useState(''),[maxAge,setMaxAge]=useState('')
  const [pay,setPay]=useState({amount:'',method:'cash',notes:''}),[adjust,setAdjust]=useState(null)
  const [ledger,setLedger]=useState([]),[meta,setMeta]=useState({page:1,pages:0,total:0}),[filters,setFilters]=useState({search:'',direction:'',entryType:'',from:'',to:''})
  const [statement,setStatement]=useState(null),[statementDates,setStatementDates]=useState({from:'',to:''}),[busy,setBusy]=useState(false)
  const load=async()=>{try{setLoading(true);setError('');const r=await apiRequest(`/api/customers/${customer.id}/credit`);if(!r?.success)throw new Error(r?.message||'Unable to load credit');setData(r.data);setLedger(r.data.ledger||[]);setEnabled(!!r.data.credit?.enabled);setLimit(String(r.data.credit?.limit??''));setMaxAge(r.data.credit?.maximumAgeDays==null?'':String(r.data.credit.maximumAgeDays))}catch(err){setError(err?.message||'Unable to load credit')}finally{setLoading(false)}}
  useEffect(()=>{void load()},[customer.id])
  const loadLedger=async(page=1)=>{try{const q=new URLSearchParams({page:String(page),pageSize:'10'});Object.entries(filters).forEach(([k,v])=>v&&q.set(k,v));const r=await apiRequest(`/api/customers/${customer.id}/credit/ledger?${q}`);if(!r?.success)throw new Error(r?.message||'Unable to load ledger');setLedger(r.data||[]);setMeta({page:r.page||page,pages:r.pages||0,total:r.total||0})}catch(err){setError(err?.message||'Unable to load ledger')}}
  const saveConfig=async()=>{const age=serializeMaximumAgeDays(maxAge);if(!age.valid)return setError(age.error);const n=limit.trim()===''?undefined:Number(limit);if(n!==undefined&&(!Number.isFinite(n)||n<0))return setError('Credit limit must be a non-negative amount');try{setBusy(true);setError('');const body={enabled,maximumAgeDays:age.value};if(n!==undefined)body.limit=n;const r=await apiRequest(`/api/customers/${customer.id}/credit`,{method:'PUT',body:JSON.stringify(body)});if(!r?.success)throw new Error(r?.message||'Unable to save credit');setMessage(r.message||'Credit settings saved');await load()}catch(err){setError(err?.message||'Unable to save credit')}finally{setBusy(false)}}
  const recordPayment=async e=>{e.preventDefault();const check=validateCreditPaymentAmount(pay.amount,data?.credit?.balance);if(!check.valid)return setError(check.error);try{setBusy(true);setError('');const r=await apiRequest(`/api/customers/${customer.id}/credit/payments`,{method:'POST',body:JSON.stringify({amount:check.value,method:pay.method,notes:pay.notes.trim()||undefined,idempotencyKey:`admin-${crypto.randomUUID()}`})});if(!r?.success)throw new Error(r?.message||'Unable to record payment');setPay({amount:'',method:'cash',notes:''});setMessage('Payment recorded.');await load()}catch(err){setError(err?.message||'Unable to record payment')}finally{setBusy(false)}}
  const saveAdjustment=async payload=>{try{setBusy(true);setError('');const r=await apiRequest(`/api/customers/${customer.id}/credit/adjustments`,{method:'POST',body:JSON.stringify({...payload,idempotencyKey:`admin-${crypto.randomUUID()}`})});if(!r?.success)throw new Error(r?.message||'Unable to record adjustment');setAdjust(null);setMessage(r.message||'Adjustment recorded');await Promise.all([load(),loadLedger(1)])}catch(err){setError(err?.message||'Unable to record adjustment')}finally{setBusy(false)}}
  const loadStatement=async()=>{try{const q=new URLSearchParams();if(statementDates.from)q.set('from',statementDates.from);if(statementDates.to)q.set('to',statementDates.to);const r=await apiRequest(`/api/customers/${customer.id}/credit/statement?${q}`);if(!r?.success)throw new Error(r?.message||'Unable to build statement');setStatement(r.data?.statement||null)}catch(err){setError(err?.message||'Unable to build statement')}}
  const c=data?.credit
  return <div className="module-modal-backdrop"><section className="module-modal customer-credit-modal"><header><div><strong>Customer Credit</strong><span>{customer.name}</span></div><button onClick={onClose}><X size={16}/></button></header><div className="module-modal-body customer-credit-body">
    {message?<div className="module-success"><strong>{message}</strong></div>:null}{error?<div className="module-inline-error">{error}</div>:null}
    {loading?<div className="module-state">Loading credit…</div>:data?<><div className="customer-credit-summary"><div><span>Outstanding</span><strong>{money(c.balance,currency)}</strong></div><div><span>Credit limit</span><strong>{money(c.limit,currency)}</strong></div><div><span>Available</span><strong>{money(c.available,currency)}</strong></div></div>
      <div className="customer-credit-config"><label><span>Credit enabled</span><button type="button" className={`mac-switch ${enabled?'is-on':''}`} onClick={()=>setEnabled(!enabled)} disabled={!canManage}><span/></button></label><label className="module-input-label"><span>Credit limit</span><input type="number" min="0" step="0.01" value={limit} disabled={!canManage} onChange={e=>setLimit(e.target.value)}/></label><label className="module-input-label"><span>Maximum age (days)</span><input type="number" min="0" step="1" value={maxAge} disabled={!canManage} onChange={e=>setMaxAge(e.target.value)}/></label>{canManage?<button className="module-primary-button" onClick={saveConfig} disabled={busy}>Save settings</button>:null}</div>
      {canTakePayment&&c.enabled?<form className="customer-credit-payment" onSubmit={recordPayment}><strong>Record payment</strong><input type="number" min="0.01" step="0.01" value={pay.amount} onChange={e=>setPay(p=>({...p,amount:e.target.value}))} placeholder="Amount"/><select value={pay.method} onChange={e=>setPay(p=>({...p,method:e.target.value}))}><option value="cash">Cash</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option></select><input value={pay.notes} onChange={e=>setPay(p=>({...p,notes:e.target.value}))} placeholder="Notes"/><button className="module-primary-button" disabled={busy}>Record</button></form>:null}
      {canManage&&c.enabled?<div className="customer-credit-adjust-actions"><button onClick={()=>setAdjust('credit')}>Credit note</button><button onClick={()=>setAdjust('debit')}>Debit note</button></div>:null}
      <div className="customer-ledger-filter"><label className="module-search"><Search size={13}/><input value={filters.search} onChange={e=>setFilters(f=>({...f,search:e.target.value}))} placeholder="Search ledger"/></label><select value={filters.direction} onChange={e=>setFilters(f=>({...f,direction:e.target.value}))}><option value="">Debit / credit</option><option value="debit">Debit</option><option value="credit">Credit</option></select><select value={filters.entryType} onChange={e=>setFilters(f=>({...f,entryType:e.target.value}))}><option value="">All types</option><option value="credit_sale">Credit sale</option><option value="payment">Payment</option><option value="credit_note">Credit note</option><option value="debit_note">Debit note</option><option value="opening">Opening</option></select><input type="date" value={filters.from} onChange={e=>setFilters(f=>({...f,from:e.target.value}))}/><input type="date" value={filters.to} onChange={e=>setFilters(f=>({...f,to:e.target.value}))}/><button onClick={()=>loadLedger(1)}>Apply</button></div>
      <div className="module-table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Amount</th><th>Balance</th></tr></thead><tbody>{ledger.map(tx=><tr key={tx.id}><td>{dt(tx.created_at)}</td><td>{tx.transaction_type}</td><td>{tx.description||'—'}</td><td>{money(tx.amount,currency)}</td><td>{tx.running_balance==null?money(tx.balance_after,currency):money(tx.running_balance,currency)}</td></tr>)}</tbody></table></div>
      <div className="customer-ledger-pages"><span>{meta.total||ledger.length} transactions</span><div><button disabled={meta.page<=1} onClick={()=>loadLedger(meta.page-1)}><ChevronLeft size={13}/></button><span>Page {meta.page||1}{meta.pages?` of ${meta.pages}`:''}</span><button disabled={!meta.pages||meta.page>=meta.pages} onClick={()=>loadLedger(meta.page+1)}><ChevronRight size={13}/></button></div></div>
      <div className="customer-statement-box"><strong>Statement</strong><input type="date" value={statementDates.from} onChange={e=>setStatementDates(v=>({...v,from:e.target.value}))}/><input type="date" value={statementDates.to} onChange={e=>setStatementDates(v=>({...v,to:e.target.value}))}/><button onClick={loadStatement}>Build</button>{statement?<pre>{JSON.stringify(statement,null,2)}</pre>:null}</div>
    </>:null}
  </div>{adjust?<CreditAdjustment kind={adjust} onClose={()=>setAdjust(null)} onSave={saveAdjustment}/>:null}</section></div>
}
function CreditAdjustment({kind,onClose,onSave}){
  const [amount,setAmount]=useState(''),[notes,setNotes]=useState(''),[error,setError]=useState('')
  const submit=e=>{e.preventDefault();const n=Number(amount);if(!Number.isFinite(n)||n<=0)return setError('Amount must be greater than zero');if(!notes.trim())return setError('Adjustment reason is required');onSave({type:kind,amount:n,notes:notes.trim()})}
  return <div className="module-modal-backdrop nested"><form className="module-modal customer-adjust-modal" onSubmit={submit}><header><div><strong>{kind==='credit'?'Credit note':'Debit note'}</strong></div><button type="button" onClick={onClose}><X size={16}/></button></header><div className="module-modal-body customer-adjust-grid">{error?<div className="module-inline-error customer-full">{error}</div>:null}<label className="module-input-label"><span>Amount</span><input type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label className="module-input-label"><span>Reason</span><input value={notes} onChange={e=>setNotes(e.target.value)}/></label></div><footer className="module-modal-footer"><button type="button" onClick={onClose}>Cancel</button><button className="module-primary-button">Save</button></footer></form></div>
}

function CustomerSegments({customers,onClose}){
  const [segments,setSegments]=useState([]),[error,setError]=useState(''),[draft,setDraft]=useState(null),[open,setOpen]=useState(null),[members,setMembers]=useState([]),[assignId,setAssignId]=useState('')
  const load=async()=>{try{const r=await apiRequest('/api/customer-segments');if(!r?.success)throw new Error(r?.message||'Unable to load segments');setSegments(r.data||[])}catch(err){setError(err?.message||'Unable to load segments')}}
  useEffect(()=>{void load()},[])
  const membersFor=async seg=>{try{const r=await apiRequest(`/api/customer-segments/${seg.id}/members`);if(!r?.success)throw new Error(r?.message);setOpen(seg);setMembers(r.data?.members||[])}catch(err){setError(err?.message||'Unable to load members')}}
  const save=async e=>{e.preventDefault();try{const r=await apiRequest(draft.id?`/api/customer-segments/${draft.id}`:'/api/customer-segments',{method:draft.id?'PUT':'POST',body:JSON.stringify({name:draft.name,description:draft.description||'',...(draft.id?{active:draft.active}: {})})});if(!r?.success)throw new Error(r?.message);setDraft(null);await load()}catch(err){setError(err?.message||'Unable to save segment')}}
  const toggle=async seg=>{await apiRequest(`/api/customer-segments/${seg.id}`,{method:'PUT',body:JSON.stringify({active:!seg.active})});await load()}
  const assign=async()=>{if(!open||!assignId)return;await apiRequest(`/api/customer-segments/${open.id}/members`,{method:'POST',body:JSON.stringify({customerId:assignId})});setAssignId('');await membersFor(open);await load()}
  const remove=async id=>{await apiRequest(`/api/customer-segments/${open.id}/members/${id}`,{method:'DELETE'});await membersFor(open);await load()}
  return <div className="module-modal-backdrop"><section className="module-modal customer-segments-modal"><header><div><strong>Customer Segments</strong><span>Segments group customers for reporting; they do not change pricing.</span></div><button onClick={onClose}><X size={16}/></button></header><div className="module-modal-body customer-segment-body">{error?<div className="module-inline-error">{error}</div>:null}{draft?<form className="customer-segment-draft" onSubmit={save}><input value={draft.name} onChange={e=>setDraft(d=>({...d,name:e.target.value}))} placeholder="Segment name"/><input value={draft.description||''} onChange={e=>setDraft(d=>({...d,description:e.target.value}))} placeholder="Description"/><button>Save</button><button type="button" onClick={()=>setDraft(null)}>Cancel</button></form>:null}<div className="module-table-wrap"><table><thead><tr><th>Segment</th><th>Customers</th><th>Status</th><th></th></tr></thead><tbody>{segments.map(seg=><tr key={seg.id}><td><strong>{seg.name}</strong><small>{seg.description||''}</small></td><td>{seg.member_count||0}</td><td>{seg.active?'Active':'Inactive'}</td><td><button onClick={()=>membersFor(seg)}>Members</button><button onClick={()=>setDraft({...seg})}>Edit</button><button onClick={()=>toggle(seg)}>{seg.active?'Deactivate':'Activate'}</button></td></tr>)}</tbody></table></div><button className="module-primary-button" onClick={()=>setDraft({name:'',description:'',active:true})}><Plus size={13}/> New segment</button>{open?<div className="customer-segment-members"><div><strong>{open.name}</strong><button onClick={()=>{setOpen(null);setMembers([])}}><X size={13}/></button></div><div className="customer-segment-assign"><select value={assignId} onChange={e=>setAssignId(e.target.value)}><option value="">Select customer…</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><button onClick={assign} disabled={!assignId}>Assign</button></div>{members.map(m=><div key={m.id}><span>{m.name}{m.active===false?' (inactive)':''}</span><button onClick={()=>remove(m.id)}>Remove</button></div>)}</div>:null}</div></section></div>
}

function CustomerImport({onClose,onImported}){
  const fileRef=useRef(null),[csv,setCsv]=useState(''),[preview,setPreview]=useState(null),[mode,setMode]=useState('upsert'),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const runPreview=async()=>{try{setBusy(true);setError('');const r=await apiRequest('/api/customers/import/preview',{method:'POST',body:JSON.stringify({csv})});if(!r?.success)throw new Error(r?.message||'Unable to preview import');setPreview(r.data)}catch(err){setError(err?.message||'Unable to preview import')}finally{setBusy(false)}}
  const runImport=async()=>{try{setBusy(true);setError('');const rows=(preview?.rows||[]).filter(r=>mode==='create'?r.valid&&r.action==='create':mode==='update'?r.valid&&r.action==='update':r.valid);if(!rows.length)throw new Error('Nothing to import for this mode.');const r=await apiRequest('/api/customers/import',{method:'POST',body:JSON.stringify({mode,rows})});if(!r?.success)throw new Error(r?.message||'Import failed');await onImported?.();onClose()}catch(err){setError(err?.message||'Import failed')}finally{setBusy(false)}}
  return <div className="module-modal-backdrop"><section className="module-modal customer-import-modal"><header><div><strong>Import Customers</strong><span>CSV columns: name, companyName, phone, email, address, postcode, notes, creditEnabled, creditLimit</span></div><button onClick={onClose}><X size={16}/></button></header><div className="module-modal-body customer-import-body">{error?<div className="module-inline-error">{error}</div>:null}{!preview?<><textarea rows={10} value={csv} onChange={e=>setCsv(e.target.value)} placeholder="name,phone,email,creditEnabled,creditLimit"/><div className="customer-import-actions"><input ref={fileRef} type="file" accept=".csv,text/csv" onChange={e=>{const f=e.target.files?.[0];if(f)f.text().then(setCsv)}}/><button className="module-primary-button" disabled={!csv.trim()||busy} onClick={runPreview}>{busy?'Validating…':'Validate & preview'}</button></div></>:<><div className="customer-import-summary"><span>{preview.total} rows</span><span>{preview.creates} new</span><span>{preview.updates} updates</span><span>{preview.invalid} invalid</span></div><div className="customer-import-mode"><select value={mode} onChange={e=>setMode(e.target.value)}><option value="upsert">Create new + update matched</option><option value="create">Create new only</option><option value="update">Update matched only</option></select><button onClick={()=>setPreview(null)}>Back</button><button className="module-primary-button" disabled={busy||preview.invalid>0} onClick={runImport}>{busy?'Importing…':'Import'}</button></div><div className="module-table-wrap"><table><thead><tr><th>Row</th><th>Name</th><th>Action</th><th>Match</th><th>Problems</th></tr></thead><tbody>{preview.rows.map(r=><tr key={r.row} className={r.valid?'':'is-invalid'}><td>{r.row}</td><td>{r.name||'missing'}</td><td>{r.action}</td><td>{r.matchCustomer?.name||'—'}</td><td>{(r.errors||[]).join('; ')}</td></tr>)}</tbody></table></div></>}</div></section></div>
}
