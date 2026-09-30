import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Eye, Plus, RefreshCw, Search, X } from 'lucide-react'
import { apiRequest, loadSessionPermissions } from '../../services/api'
import { cachedGet } from '../../services/cachedApi'
import RecordListView from '../../components/RecordListView'

function money(value,currency='GBP'){
  const n=Number(value||0)
  try{return new Intl.NumberFormat(undefined,{style:'currency',currency,maximumFractionDigits:2}).format(n)}
  catch{return `${n.toFixed(2)} ${currency}`}
}
function dt(value){if(!value)return '—';const d=new Date(value);return Number.isNaN(d.getTime())?String(value):d.toLocaleString()}

export default function SuppliersPage(){
  const [suppliers,setSuppliers]=useState([])
  const [products,setProducts]=useState([])
  const [currency,setCurrency]=useState('GBP')
  const [permissions,setPermissions]=useState([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const [editor,setEditor]=useState(null)
  const [detail,setDetail]=useState(null)
  const [accounts,setAccounts]=useState(null)

  const load=async(forceRefresh=false)=>{
    try{
      setLoading(true);setError('')
      const [s,p,settings,perms]=await Promise.all([
        cachedGet('/api/suppliers',{forceRefresh,onFresh:fresh=>fresh?.success&&setSuppliers(Array.isArray(fresh.data)?fresh.data:[])}),
        cachedGet('/api/products',{forceRefresh,onFresh:fresh=>fresh?.success&&setProducts(Array.isArray(fresh.data)?fresh.data:[])}).catch(()=>null),
        cachedGet('/api/settings',{cacheKey:'settings:company',forceRefresh,onFresh:fresh=>fresh?.data?.company?.currency&&setCurrency(fresh.data.company.currency)}).catch(()=>null),
        loadSessionPermissions().catch(()=>null),
      ])
      if(!s?.success)throw new Error(s?.message||'Unable to load suppliers')
      setSuppliers(Array.isArray(s.data)?s.data:[])
      setProducts(Array.isArray(p?.data)?p.data:[])
      setCurrency(settings?.data?.company?.currency||'GBP')
      setPermissions(perms?.permissions||[])
    }catch(err){setError(err?.message||'Unable to load suppliers')}
    finally{setLoading(false)}
  }
  useEffect(()=>{void load()},[])

  const openDetail=async(row)=>{
    try{
      setError('')
      const r=await apiRequest(`/api/suppliers/${encodeURIComponent(row.id)}`)
      if(!r?.success)throw new Error(r?.message||'Unable to load supplier')
      setDetail(r.data)
    }catch(err){setError(err?.message||'Unable to load supplier')}
  }

  const toggleActive=async(row)=>{
    try{
      setError('')
      const r=await apiRequest(`/api/suppliers/${encodeURIComponent(row.id)}/status`,{
        method:'PATCH',
        body:JSON.stringify({active:!row.active,platform:{}})
      })
      if(!r?.success)throw new Error(r?.message||'Unable to update supplier status')
      setMessage(row.active?'Supplier deactivated.':'Supplier activated.')
      await load(true)
    }catch(err){setError(err?.message||'Unable to update supplier status')}
  }

  const columns=useMemo(()=>[
    {key:'name',label:'Supplier',render:r=>r.name||'—'},
    {key:'phone',label:'Phone',render:r=>r.phone||'—'},
    {key:'email',label:'Email',render:r=>r.email||'—'},
    {key:'address',label:'Address',render:r=>r.address||'—'},
    {key:'purchase_count',label:'Purchases',render:r=>String(r.purchase_count??0)},
    {key:'total_purchase_value',label:'Total value',render:r=>money(r.total_purchase_value,currency)},
    {key:'active',label:'Status',render:r=>r.active===false?'Inactive':'Active'},
  ],[currency])

  const canManageAccounts=permissions.includes('purchase.edit')||permissions.includes('inventory.adjust')
  const canManagePayments=permissions.includes('payment.manage')||permissions.includes('purchase.edit')||permissions.includes('inventory.adjust')

  return <section className="module-page suppliers-page">
    <header className="module-page-header">
      <div><span>Supply</span><h1>Suppliers</h1><p>Supplier master data, sourcing relationships and supplier accounts.</p></div>
      <div className="module-header-actions">
        <button onClick={()=>load(true)}><RefreshCw size={14}/> Refresh</button>
        <button className="module-primary-button" onClick={()=>setEditor({})}><Plus size={14}/> New Supplier</button>
      </div>
    </header>

    {message?<div className="module-success module-page-message"><strong>{message}</strong></div>:null}
    {error?<div className="module-inline-error module-page-message">{error}</div>:null}

    <section className="module-page-card">
      <RecordListView
        title="Suppliers"
        subtitle={`${suppliers.length} suppliers`}
        rows={suppliers}
        columns={columns}
        searchKeys={['name','phone','email','address']}
        loading={loading}
        error={error}
        onRowSelect={openDetail}
        renderRowActions={row=><div className="supplier-row-actions">
          <button title="View" onClick={e=>{e.stopPropagation();void openDetail(row)}}><Eye size={12}/></button>
          <button title="Edit" onClick={e=>{e.stopPropagation();setEditor(row)}}>Edit</button>
          <button title={row.active?'Deactivate':'Activate'} onClick={e=>{e.stopPropagation();void toggleActive(row)}}>{row.active?'Deactivate':'Activate'}</button>
        </div>}
      />
    </section>

    {editor?<SupplierEditor supplier={editor} onClose={()=>setEditor(null)} onSaved={async msg=>{setEditor(null);setMessage(msg);await load(true)}}/>:null}
    {detail?<SupplierDetail supplier={detail} products={products} currency={currency} canAccounts={canManageAccounts||canManagePayments} onClose={()=>setDetail(null)} onEdit={()=>{setEditor(detail);setDetail(null)}} onOpenAccounts={()=>{setAccounts(detail);setDetail(null)}} onReload={()=>openDetail(detail)}/>:null}
    {accounts?<SupplierAccounts supplier={accounts} currency={currency} canManage={canManageAccounts} canManagePayments={canManagePayments} onClose={()=>setAccounts(null)}/>:null}
  </section>
}

function SupplierEditor({supplier,onClose,onSaved}){
  const [values,setValues]=useState({
    name:supplier?.name||'',
    contactName:supplier?.contact_name||supplier?.contactName||'',
    phone:supplier?.phone||'',
    email:supplier?.email||'',
    address:supplier?.address||'',
    notes:supplier?.notes||'',
  })
  const [configuration,setConfiguration]=useState(null)
  const [platform,setPlatform]=useState({customFields:{},recordTypeId:null})
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')

  useEffect(()=>{
    let live=true
    apiRequest(`/api/platform/system/supplier/configuration${supplier?.id?`?recordId=${encodeURIComponent(supplier.id)}`:''}`)
      .then(r=>{
        if(!live)return
        const data=r?.data||{}
        setConfiguration(data)
        const selected=data.recordTypeId||(!supplier?.id?(data.recordTypes||[]).find(t=>t.is_default)?.id:null)||null
        const defaults=!supplier?.id?(data.recordTypes||[]).find(t=>t.id===selected)?.default_values||{}:{}
        setPlatform({customFields:{...(data.customFields||{}),...defaults},recordTypeId:selected})
      }).catch(err=>live&&setError(err?.message||'Unable to load Supplier configuration'))
    return()=>{live=false}
  },[supplier?.id])

  const extensionFields=(configuration?.fields||[]).filter(f=>f?.config?.storage==='extension'&&f.writable!==false&&f.active!==false)
  const change=(key,value)=>setValues(v=>({...v,[key]:value}))

  const submit=async e=>{
    e.preventDefault()
    if(!values.name.trim())return setError('Supplier name is required.')
    try{
      setSaving(true);setError('')
      const r=await apiRequest(supplier?.id?`/api/suppliers/${encodeURIComponent(supplier.id)}`:'/api/suppliers',{
        method:supplier?.id?'PUT':'POST',
        body:JSON.stringify({
          name:values.name.trim(),
          contactName:values.contactName.trim()||null,
          phone:values.phone.trim()||null,
          email:values.email.trim()||null,
          address:values.address.trim()||null,
          notes:values.notes.trim()||null,
          platform,
        })
      })
      if(!r?.success)throw new Error(r?.message||'Unable to save supplier')
      await onSaved?.(supplier?.id?'Supplier updated.':'Supplier created.')
    }catch(err){setError(err?.message||'Unable to save supplier')}
    finally{setSaving(false)}
  }

  return <div className="module-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&!saving&&onClose()}>
    <form className="module-modal supplier-editor-modal" onSubmit={submit}>
      <header><div><strong>{supplier?.id?'Edit Supplier':'New Supplier'}</strong><span>Core fields + configured metadata.</span></div><button type="button" onClick={onClose}><X size={16}/></button></header>
      <div className="module-modal-body supplier-editor-grid">
        {error?<div className="module-inline-error supplier-full">{error}</div>:null}
        <label className="module-input-label"><span>Name</span><input value={values.name} onChange={e=>change('name',e.target.value)}/></label>
        <label className="module-input-label"><span>Contact name</span><input value={values.contactName} onChange={e=>change('contactName',e.target.value)}/></label>
        <label className="module-input-label"><span>Phone</span><input value={values.phone} onChange={e=>change('phone',e.target.value)}/></label>
        <label className="module-input-label"><span>Email</span><input type="email" value={values.email} onChange={e=>change('email',e.target.value)}/></label>
        <label className="module-input-label supplier-full"><span>Address</span><input value={values.address} onChange={e=>change('address',e.target.value)}/></label>
        <label className="module-textarea-label supplier-full"><span>Notes</span><textarea rows={3} value={values.notes} onChange={e=>change('notes',e.target.value)}/></label>
        {configuration?.recordTypes?.length?<label className="module-input-label supplier-full"><span>Record type</span><select value={platform.recordTypeId||''} onChange={e=>setPlatform(p=>({...p,recordTypeId:e.target.value||null}))}><option value="">Default</option>{configuration.recordTypes.map(t=><option key={t.id} value={t.id}>{t.label||t.name}</option>)}</select></label>:null}
        {extensionFields.length?<div className="supplier-extension-fields supplier-full"><h3>Configured fields</h3>{extensionFields.map(field=><SupplierExtensionField key={field.id||field.api_name} field={field} value={platform.customFields?.[field.api_name]} onChange={value=>setPlatform(p=>({...p,customFields:{...p.customFields,[field.api_name]:value}}))}/>)}</div>:null}
      </div>
      <footer className="module-modal-footer"><button type="button" onClick={onClose}>Cancel</button><button className="module-primary-button" disabled={saving||!configuration}>{saving?'Saving…':'Save Supplier'}</button></footer>
    </form>
  </div>
}

function SupplierExtensionField({field,value,onChange}){
  const type=String(field.field_type||'text').toLowerCase(),options=Array.isArray(field.options)?field.options:[]
  if(type==='boolean')return <label className="supplier-extension-toggle"><span>{field.label||field.api_name}</span><button type="button" className={`mac-switch ${value===true?'is-on':''}`} onClick={()=>onChange(value!==true)}><span/></button></label>
  if(type==='picklist')return <label className="module-input-label"><span>{field.label||field.api_name}</span><select value={value??''} onChange={e=>onChange(e.target.value)}><option value="">—</option>{options.map(o=><option key={typeof o==='object'?o.value:o} value={typeof o==='object'?o.value:o}>{typeof o==='object'?(o.label||o.value):o}</option>)}</select></label>
  return <label className="module-input-label"><span>{field.label||field.api_name}</span><input type={['number','decimal','currency'].includes(type)?'number':type==='date'?'date':'text'} value={value??''} onChange={e=>onChange(['number','decimal','currency'].includes(type)?(e.target.value===''?null:Number(e.target.value)):e.target.value)}/></label>
}

function SupplierDetail({supplier,products,currency,canAccounts,onClose,onEdit,onOpenAccounts,onReload}){
  const [showProduct,setShowProduct]=useState(false)
  return <div className="module-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
    <section className="module-modal supplier-detail-modal">
      <header><div><strong>{supplier.name}</strong><span>{supplier.active===false?'Inactive supplier':'Active supplier'}</span></div><div className="supplier-detail-actions"><button onClick={onEdit}>Edit</button>{canAccounts?<button onClick={onOpenAccounts}>Accounts</button>:null}<button onClick={onClose}><X size={16}/></button></div></header>
      <div className="module-modal-body supplier-detail-body">
        <div className="supplier-summary-grid">
          <div><span>Contact</span><strong>{supplier.contact_name||'—'}</strong></div>
          <div><span>Phone</span><strong>{supplier.phone||'—'}</strong></div>
          <div><span>Email</span><strong>{supplier.email||'—'}</strong></div>
          <div><span>Purchase history</span><strong>{supplier.purchase_count||0} · {money(supplier.total_purchase_value,currency)}</strong></div>
        </div>
        <div className="supplier-address"><span>Address</span><strong>{supplier.address||'—'}</strong>{supplier.notes?<p>{supplier.notes}</p>:null}</div>

        <div className="supplier-section-head"><div><strong>Supplier Products</strong><span>Supplier-specific SKU, cost, effective dates and preferred status.</span></div><button onClick={()=>setShowProduct(true)}><Plus size={13}/> Add / update</button></div>
        {(supplier.products||[]).length?<div className="module-table-wrap"><table><thead><tr><th>Product</th><th>SKU</th><th>Supplier SKU</th><th>Cost</th><th>Effective</th><th>Preferred</th><th>Status</th></tr></thead><tbody>{supplier.products.map(row=><tr key={row.id}><td>{row.product_name}</td><td>{row.sku||'—'}</td><td>{row.supplier_sku||'—'}</td><td>{money(row.cost_price,currency)}</td><td>{row.effective_from||'—'} → {row.effective_to||'Open'}</td><td>{row.preferred?'Yes':'No'}</td><td>{row.active===false?'Inactive':'Active'}</td></tr>)}</tbody></table></div>:<div className="module-state compact">No supplier-product mappings.</div>}

        <div className="supplier-section-head"><div><strong>Purchase History</strong><span>Purchases linked to this supplier.</span></div></div>
        {(supplier.purchases||[]).length?<div className="module-table-wrap"><table><thead><tr><th>Reference</th><th>Date</th><th>Store</th><th>Status</th><th>Total</th></tr></thead><tbody>{supplier.purchases.map(row=><tr key={row.id}><td>{row.reference_number||String(row.id).slice(0,8)}</td><td>{row.purchase_date||'—'}</td><td>{row.store_name||'—'}</td><td>{row.status}</td><td>{money(row.total,currency)}</td></tr>)}</tbody></table></div>:<div className="module-state compact">No purchases recorded.</div>}
      </div>
      {showProduct?<SupplierProductForm supplier={supplier} products={products} onClose={()=>setShowProduct(false)} onSaved={async()=>{setShowProduct(false);await onReload?.()}}/>:null}
    </section>
  </div>
}

function SupplierProductForm({supplier,products,onClose,onSaved}){
  const [form,setForm]=useState({productId:'',supplierSku:'',supplierDescription:'',costPrice:'',effectiveFrom:new Date().toISOString().slice(0,10),effectiveTo:'',preferred:false,active:true})
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const update=(key,value)=>setForm(f=>({...f,[key]:value}))
  const submit=async e=>{
    e.preventDefault()
    const cost=Number(form.costPrice)
    if(!form.productId||!Number.isFinite(cost)||cost<0)return setError('Product and a valid non-negative cost are required.')
    try{
      setSaving(true);setError('')
      const r=await apiRequest(`/api/suppliers/${encodeURIComponent(supplier.id)}/products`,{
        method:'POST',
        body:JSON.stringify({...form,costPrice:cost,effectiveFrom:form.effectiveFrom||null,effectiveTo:form.effectiveTo||null})
      })
      if(!r?.success)throw new Error(r?.message||'Unable to save supplier product')
      await onSaved?.()
    }catch(err){setError(err?.message||'Unable to save supplier product')}
    finally{setSaving(false)}
  }
  return <div className="module-modal-backdrop nested" onMouseDown={e=>e.target===e.currentTarget&&!saving&&onClose()}>
    <form className="module-modal supplier-product-modal" onSubmit={submit}>
      <header><div><strong>Supplier Product</strong><span>{supplier.name}</span></div><button type="button" onClick={onClose}><X size={16}/></button></header>
      <div className="module-modal-body supplier-product-grid">
        {error?<div className="module-inline-error supplier-full">{error}</div>:null}
        <label className="module-input-label supplier-full"><span>Product</span><select value={form.productId} onChange={e=>update('productId',e.target.value)}><option value="">Select product</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}{p.sku?` · ${p.sku}`:''}</option>)}</select></label>
        <label className="module-input-label"><span>Supplier SKU</span><input value={form.supplierSku} onChange={e=>update('supplierSku',e.target.value)}/></label>
        <label className="module-input-label"><span>Cost price</span><input type="number" min="0" step="0.01" value={form.costPrice} onChange={e=>update('costPrice',e.target.value)}/></label>
        <label className="module-input-label"><span>Effective from</span><input type="date" value={form.effectiveFrom} onChange={e=>update('effectiveFrom',e.target.value)}/></label>
        <label className="module-input-label"><span>Effective to</span><input type="date" value={form.effectiveTo} onChange={e=>update('effectiveTo',e.target.value)}/></label>
        <label className="module-textarea-label supplier-full"><span>Supplier description</span><textarea rows={2} value={form.supplierDescription} onChange={e=>update('supplierDescription',e.target.value)}/></label>
        <label className="supplier-extension-toggle"><span>Preferred supplier</span><button type="button" className={`mac-switch ${form.preferred?'is-on':''}`} onClick={()=>update('preferred',!form.preferred)}><span/></button></label>
        <label className="supplier-extension-toggle"><span>Active mapping</span><button type="button" className={`mac-switch ${form.active?'is-on':''}`} onClick={()=>update('active',!form.active)}><span/></button></label>
      </div>
      <footer className="module-modal-footer"><button type="button" onClick={onClose}>Cancel</button><button className="module-primary-button" disabled={saving}>{saving?'Saving…':'Save mapping'}</button></footer>
    </form>
  </div>
}

function SupplierAccounts({supplier,currency,canManage,canManagePayments,onClose}){
  const [tab,setTab]=useState('invoices')
  const [invoices,setInvoices]=useState([])
  const [statement,setStatement]=useState([])
  const [summary,setSummary]=useState(null)
  const [ledger,setLedger]=useState([])
  const [meta,setMeta]=useState({page:1,pageSize:10,total:0,pages:0})
  const [filters,setFilters]=useState({search:'',entryType:'',debit:''})
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const [form,setForm]=useState(null)

  const load=async(page=1,nextFilters=filters)=>{
    try{
      setLoading(true);setError('')
      const q=new URLSearchParams({page:String(page),pageSize:'10'})
      if(nextFilters.search.trim())q.set('search',nextFilters.search.trim())
      if(nextFilters.entryType)q.set('entryType',nextFilters.entryType)
      if(nextFilters.debit!=='')q.set('debit',nextFilters.debit)
      const [i,s,sm,l]=await Promise.all([
        apiRequest(`/api/supplier-invoices?supplierId=${encodeURIComponent(supplier.id)}`),
        apiRequest(`/api/suppliers/${encodeURIComponent(supplier.id)}/statement`),
        apiRequest(`/api/suppliers/${encodeURIComponent(supplier.id)}/summary`),
        apiRequest(`/api/suppliers/${encodeURIComponent(supplier.id)}/ledger?${q}`),
      ])
      if(!i?.success||!s?.success||!sm?.success||!l?.success)throw new Error('Unable to load supplier accounting')
      setInvoices(Array.isArray(i.data)?i.data:[]);setStatement(Array.isArray(s.data)?s.data:[]);setSummary(sm.data||null);setLedger(Array.isArray(l.data)?l.data:[])
      setMeta({page:Number(l.page)||page,pageSize:Number(l.pageSize)||10,total:Number(l.total)||0,pages:Number(l.pages)||0})
    }catch(err){setError(err?.message||'Unable to load supplier accounting')}
    finally{setLoading(false)}
  }
  useEffect(()=>{void load(1,filters)},[supplier.id])

  const saveForm=async payload=>{
    try{
      setError('');setMessage('')
      let endpoint,body
      if(payload.type==='invoice'){
        endpoint='/api/supplier-invoices';body={...payload.data,supplierId:supplier.id}
      }else if(payload.type==='payment'){
        endpoint='/api/supplier-payments';body={...payload.data,supplierId:supplier.id,idempotencyKey:`web-${crypto.randomUUID()}`}
      }else{
        endpoint=payload.data.creditNote?'/api/supplier-credit-notes':payload.data.kind==='CREDIT'?'/api/supplier-credits':'/api/supplier-debits'
        body={supplierId:supplier.id,amount:Number(payload.data.amount),storeId:payload.data.storeId||undefined,reference:payload.data.reference||undefined,description:payload.data.description||undefined,idempotencyKey:`web-${crypto.randomUUID()}`}
      }
      const r=await apiRequest(endpoint,{method:'POST',body:JSON.stringify(body)})
      if(!r?.success)throw new Error(r?.message||'Unable to save supplier account entry')
      setForm(null);setMessage('Supplier account updated.');await load(1,filters)
    }catch(err){setError(err?.message||'Unable to save supplier account entry')}
  }

  const outstanding=summary?.outstanding_balance??invoices.reduce((sum,i)=>sum+Number(i.outstanding_amount||0),0)

  return <div className="module-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&!form&&onClose()}>
    <section className="module-modal supplier-accounts-modal">
      <header><div><strong>{supplier.name} accounts</strong><span>Invoices, payments, statement and ledger.</span></div><button onClick={onClose}><X size={16}/></button></header>
      <div className="supplier-account-tabs">{[['invoices','Invoices'],['payments','Payments'],['statement','Statement'],['ledger','Ledger']].map(([k,l])=><button className={tab===k?'is-active':''} key={k} onClick={()=>setTab(k)}>{l}</button>)}</div>
      <div className="module-modal-body supplier-accounts-body">
        {message?<div className="module-success"><strong>{message}</strong></div>:null}
        {error?<div className="module-inline-error">{error}</div>:null}
        {summary?<div className="supplier-account-summary">{[
          ['Current balance',summary.ledger_balance],['Total outstanding',summary.outstanding_balance],['Total invoiced',summary.total_invoice_amount],['Total paid',summary.total_paid],['Credits',summary.total_credits],['Debits',summary.total_debits]
        ].map(([label,value])=><div key={label}><span>{label}</span><strong>{money(value,currency)}</strong></div>)}</div>:null}

        {canManage?<div className="supplier-account-actions"><button onClick={()=>setForm({type:'adjustment',kind:'CREDIT',creditNote:false})}>Add Credit</button><button onClick={()=>setForm({type:'adjustment',kind:'DEBIT',creditNote:false})}>Add Debit</button><button onClick={()=>setForm({type:'adjustment',kind:'CREDIT',creditNote:true})}>Credit Note</button></div>:null}

        {loading?<div className="module-state">Loading supplier accounts…</div>:tab==='invoices'?<AccountsInvoices invoices={invoices} currency={currency} canManage={canManage} onCreate={()=>setForm({type:'invoice'})}/>:tab==='payments'?<AccountsPayments invoices={invoices} outstanding={outstanding} currency={currency} canManage={canManagePayments} onCreate={()=>setForm({type:'payment'})}/>:tab==='statement'?<AccountsStatement rows={statement} outstanding={outstanding} currency={currency}/>:<AccountsLedger rows={ledger} meta={meta} filters={filters} setFilters={setFilters} currency={currency} onApply={()=>load(1,filters)} onPage={page=>load(page,filters)}/>}
      </div>
      {form?<AccountEntryForm config={form} invoices={invoices} onClose={()=>setForm(null)} onSave={saveForm}/>:null}
    </section>
  </div>
}

function AccountsInvoices({invoices,currency,canManage,onCreate}){
  return <section><div className="supplier-panel-head"><div><strong>Supplier invoices</strong><span>Outstanding balances are server-calculated.</span></div>{canManage?<button onClick={onCreate}>Add invoice</button>:null}</div>{!invoices.length?<div className="module-state compact">No supplier invoices.</div>:<div className="module-table-wrap"><table><thead><tr><th>Invoice</th><th>Date</th><th>Due</th><th>Total</th><th>Outstanding</th><th>Status</th></tr></thead><tbody>{invoices.map(i=><tr key={i.id}><td>{i.invoice_number}</td><td>{i.invoice_date||'—'}</td><td>{i.due_date||'—'}</td><td>{money(i.total,currency)}</td><td><strong>{money(i.outstanding_amount,currency)}</strong></td><td>{i.status}</td></tr>)}</tbody></table></div>}</section>
}
function AccountsPayments({invoices,outstanding,currency,canManage,onCreate}){
  return <section><div className="supplier-panel-head"><div><strong>Supplier payments</strong><span>Outstanding supplier balance: {money(outstanding,currency)}</span></div>{canManage?<button onClick={onCreate}>Record payment</button>:null}</div>{!invoices.length?<div className="module-state compact">Create an invoice before allocating payment.</div>:<div className="module-table-wrap"><table><thead><tr><th>Invoice</th><th>Total</th><th>Paid</th><th>Outstanding</th><th>Status</th></tr></thead><tbody>{invoices.map(i=><tr key={i.id}><td>{i.invoice_number}</td><td>{money(i.total,currency)}</td><td>{money(i.paid_amount,currency)}</td><td><strong>{money(i.outstanding_amount,currency)}</strong></td><td>{i.status}</td></tr>)}</tbody></table></div>}</section>
}
function AccountsStatement({rows,outstanding,currency}){
  return <section><div className="supplier-panel-head"><div><strong>Supplier statement</strong><span>Outstanding balance: {money(outstanding,currency)}</span></div></div>{!rows.length?<div className="module-state compact">No supplier ledger entries.</div>:<div className="module-table-wrap"><table><thead><tr><th>Date</th><th>Reference</th><th>Type</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{dt(r.created_at)}</td><td>{r.description||r.reference_id||'—'}</td><td>{r.entry_type}</td><td>{r.debit?money(r.amount,currency):'—'}</td><td>{r.debit?'—':money(r.amount,currency)}</td><td><strong>{money(r.running_balance,currency)}</strong></td></tr>)}</tbody></table></div>}</section>
}
function AccountsLedger({rows,meta,filters,setFilters,currency,onApply,onPage}){
  return <section><div className="supplier-ledger-filters"><label className="module-search"><Search size={13}/><input value={filters.search} onChange={e=>setFilters(f=>({...f,search:e.target.value}))} placeholder="Reference or description"/></label><select value={filters.entryType} onChange={e=>setFilters(f=>({...f,entryType:e.target.value}))}><option value="">All types</option><option value="INVOICE">Invoice</option><option value="PAYMENT">Payment</option><option value="RETURN_CREDIT">Credit</option><option value="OPENING">Debit / Opening</option></select><select value={filters.debit} onChange={e=>setFilters(f=>({...f,debit:e.target.value}))}><option value="">All</option><option value="true">Debit</option><option value="false">Credit</option></select><button onClick={onApply}>Apply</button></div>{!rows.length?<div className="module-state compact">No ledger activity.</div>:<div className="module-table-wrap"><table><thead><tr><th>Date</th><th>Reference</th><th>Type</th><th>Description</th><th>Store</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{dt(r.created_at)}</td><td>{r.reference||r.reference_id||'—'}</td><td>{r.entry_type}</td><td>{r.description||'—'}</td><td>{r.store_id||'—'}</td><td>{r.debit?money(r.amount,currency):'—'}</td><td>{r.debit?'—':money(r.amount,currency)}</td><td>{r.running_balance==null?'—':money(r.running_balance,currency)}</td></tr>)}</tbody></table></div>}<div className="supplier-ledger-pages"><span>{meta.total} entries</span><div><button disabled={meta.page<=1} onClick={()=>onPage(meta.page-1)}><ChevronLeft size={13}/></button><span>Page {meta.page}{meta.pages?` of ${meta.pages}`:''}</span><button disabled={!meta.pages||meta.page>=meta.pages} onClick={()=>onPage(meta.page+1)}><ChevronRight size={13}/></button></div></div></section>
}

function AccountEntryForm({config,invoices,onClose,onSave}){
  const [form,setForm]=useState({invoiceNumber:'',invoiceDate:new Date().toISOString().slice(0,10),dueDate:'',subtotal:'',tax:'0',total:'',notes:'',amount:'',method:'BANK',reference:'',invoiceId:'',storeId:'',description:''})
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const update=(key,value)=>setForm(f=>({...f,[key]:value}))
  const submit=async e=>{
    e.preventDefault()
    try{
      setSaving(true);setError('')
      if(config.type==='invoice'){
        const total=Number(form.total),subtotal=Number(form.subtotal||form.total),tax=Number(form.tax||0)
        if(!form.invoiceNumber.trim()||!Number.isFinite(total)||total<0)throw new Error('Invoice number and valid total are required.')
        await onSave({type:'invoice',data:{invoiceNumber:form.invoiceNumber.trim(),invoiceDate:form.invoiceDate||null,dueDate:form.dueDate||null,subtotal,tax,total,notes:form.notes||null}})
      }else if(config.type==='payment'){
        const amount=Number(form.amount)
        if(!Number.isFinite(amount)||amount<=0)throw new Error('Enter a positive payment amount.')
        await onSave({type:'payment',data:{amount,method:form.method,reference:form.reference||null,allocations:form.invoiceId?[{invoiceId:form.invoiceId,amount}]:[]}})
      }else{
        const amount=Number(form.amount)
        if(!Number.isFinite(amount)||amount<=0)throw new Error('Enter a positive amount.')
        if(config.creditNote&&!form.reference.trim())throw new Error('A credit note reference is required.')
        await onSave({type:'adjustment',data:{...config,amount,reference:form.reference.trim()||'',storeId:form.storeId.trim()||'',description:form.description.trim()||''}})
      }
    }catch(err){setError(err?.message||'Unable to save')}
    finally{setSaving(false)}
  }
  const title=config.type==='invoice'?'Add Supplier Invoice':config.type==='payment'?'Record Supplier Payment':config.creditNote?'Add Supplier Credit Note':`Add Supplier ${config.kind==='CREDIT'?'Credit':'Debit'}`
  return <div className="module-modal-backdrop nested" onMouseDown={e=>e.target===e.currentTarget&&!saving&&onClose()}><form className="module-modal supplier-entry-modal" onSubmit={submit}><header><div><strong>{title}</strong></div><button type="button" onClick={onClose}><X size={16}/></button></header><div className="module-modal-body supplier-entry-grid">{error?<div className="module-inline-error supplier-full">{error}</div>:null}
    {config.type==='invoice'?<><label className="module-input-label"><span>Invoice number</span><input value={form.invoiceNumber} onChange={e=>update('invoiceNumber',e.target.value)}/></label><label className="module-input-label"><span>Invoice date</span><input type="date" value={form.invoiceDate} onChange={e=>update('invoiceDate',e.target.value)}/></label><label className="module-input-label"><span>Due date</span><input type="date" value={form.dueDate} onChange={e=>update('dueDate',e.target.value)}/></label><label className="module-input-label"><span>Subtotal</span><input type="number" min="0" step="0.01" value={form.subtotal} onChange={e=>update('subtotal',e.target.value)}/></label><label className="module-input-label"><span>Tax</span><input type="number" min="0" step="0.01" value={form.tax} onChange={e=>update('tax',e.target.value)}/></label><label className="module-input-label"><span>Total</span><input type="number" min="0" step="0.01" value={form.total} onChange={e=>update('total',e.target.value)}/></label><label className="module-textarea-label supplier-full"><span>Notes</span><textarea rows={2} value={form.notes} onChange={e=>update('notes',e.target.value)}/></label></>
    :config.type==='payment'?<><label className="module-input-label"><span>Amount</span><input type="number" min="0.01" step="0.01" value={form.amount} onChange={e=>update('amount',e.target.value)}/></label><label className="module-input-label"><span>Method</span><select value={form.method} onChange={e=>update('method',e.target.value)}><option value="BANK">Bank</option><option value="CASH">Cash</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></label><label className="module-input-label"><span>Allocate to invoice</span><select value={form.invoiceId} onChange={e=>update('invoiceId',e.target.value)}><option value="">Unallocated</option>{invoices.filter(i=>Number(i.outstanding_amount)>0).map(i=><option key={i.id} value={i.id}>{i.invoice_number} · {i.outstanding_amount}</option>)}</select></label><label className="module-input-label"><span>Reference</span><input value={form.reference} onChange={e=>update('reference',e.target.value)}/></label></>
    :<><label className="module-input-label"><span>Amount</span><input type="number" min="0.01" step="0.01" value={form.amount} onChange={e=>update('amount',e.target.value)}/></label><label className="module-input-label"><span>{config.creditNote?'Credit note number':'Reference'}</span><input value={form.reference} onChange={e=>update('reference',e.target.value)}/></label><label className="module-input-label"><span>Store ID (optional)</span><input value={form.storeId} onChange={e=>update('storeId',e.target.value)}/></label><label className="module-textarea-label"><span>Reason / notes</span><textarea rows={2} value={form.description} onChange={e=>update('description',e.target.value)}/></label></>}
  </div><footer className="module-modal-footer"><button type="button" onClick={onClose}>Cancel</button><button className="module-primary-button" disabled={saving}>{saving?'Saving…':'Save'}</button></footer></form></div>
}
