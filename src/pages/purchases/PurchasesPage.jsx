import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Eye, Plus, RefreshCw, Upload, X } from 'lucide-react'
import { apiRequest } from '../../services/api'
import RecordListView from '../../components/RecordListView'
import { parsePurchaseImport } from '../../services/purchaseImport'
import { buildPurchaseImportPreview } from '../../services/purchaseImportPreview'
import { mapPurchaseImport } from '../../services/purchaseImportMapper'

function money(value,currency='GBP'){
  const n=Number(value||0)
  try{return new Intl.NumberFormat(undefined,{style:'currency',currency,maximumFractionDigits:2}).format(n)}
  catch{return `${n.toFixed(2)} ${currency}`}
}
function date(value){ if(!value)return '—'; const d=new Date(value); return Number.isNaN(d.getTime())?String(value):d.toLocaleDateString() }
function datetime(value){ if(!value)return '—'; const d=new Date(value); return Number.isNaN(d.getTime())?String(value):d.toLocaleString() }
const EMPTY_LINE=()=>({productId:'',quantity:1,unitCost:0,batchNumber:'',manufacturingDate:'',expiryDate:''})

export default function PurchasesPage(){
  const [purchases,setPurchases]=useState([])
  const [products,setProducts]=useState([])
  const [suppliers,setSuppliers]=useState([])
  const [currency,setCurrency]=useState('GBP')
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const [showForm,setShowForm]=useState(false)
  const [showImport,setShowImport]=useState(false)
  const [detail,setDetail]=useState(null)
  const [detailLoading,setDetailLoading]=useState(false)

  const load=async()=>{
    try{
      setLoading(true);setError('')
      const [p,prods,sups,settings]=await Promise.all([
        apiRequest('/api/purchases'),
        apiRequest('/api/products'),
        apiRequest('/api/suppliers'),
        apiRequest('/api/settings').catch(()=>null),
      ])
      if(!p?.success)throw new Error(p?.message||'Unable to load purchases')
      setPurchases(Array.isArray(p.data)?p.data:[])
      setProducts(Array.isArray(prods?.data)?prods.data:[])
      setSuppliers((Array.isArray(sups?.data)?sups.data:[]).filter(s=>s.active!==false))
      setCurrency(settings?.data?.company?.currency||'GBP')
    }catch(err){setError(err?.message||'Unable to load purchases')}
    finally{setLoading(false)}
  }
  useEffect(()=>{void load()},[])

  const openDetail=async(row)=>{
    try{
      setDetailLoading(true);setError('')
      const r=await apiRequest(`/api/purchases/${encodeURIComponent(row.id)}`)
      if(!r?.success)throw new Error(r?.message||'Unable to load purchase')
      setDetail(r.data)
    }catch(err){setError(err?.message||'Unable to load purchase')}
    finally{setDetailLoading(false)}
  }

  const receiveRemaining=async(purchase,meta={})=>{
    try{
      setError('');setMessage('')
      const r=await apiRequest(`/api/purchases/${encodeURIComponent(purchase.id)}/receive`,{
        method:'POST',
        body:JSON.stringify({
          receiveItems:meta.receiveItems||null,
          receivingReference:meta.receivingReference||null,
          receivingNotes:meta.receivingNotes||null,
        })
      })
      if(!r?.success)throw new Error(r?.message||'Unable to receive purchase')
      setMessage('Remaining purchase stock received.')
      await load()
      await openDetail(purchase)
    }catch(err){setError(err?.message||'Unable to receive purchase')}
  }

  const columns=useMemo(()=>[
    {key:'reference_number',label:'Reference',render:r=>r.reference_number||String(r.id||'').slice(0,8)},
    {key:'supplier_name',label:'Supplier',render:r=>r.supplier_name||'—'},
    {key:'store_name',label:'Store',render:r=>r.store_name||'—'},
    {key:'purchase_date',label:'Purchase date',render:r=>date(r.purchase_date)},
    {key:'status',label:'Status',render:r=>r.status||'—'},
    {key:'total',label:'Total',render:r=>money(r.total,currency)},
    {key:'created_by_username',label:'Created by',render:r=>r.created_by_username||'—'},
    {key:'created_at',label:'Created date',render:r=>datetime(r.created_at)},
  ],[currency])

  return <section className="module-page purchases-page">
    <header className="module-page-header">
      <div><span>Supply</span><h1>Purchases</h1><p>Create supplier purchases and receive stock into the inventory ledger.</p></div>
      <div className="module-header-actions">
        <button onClick={load}><RefreshCw size={14}/> Refresh</button>
        <button onClick={()=>setShowImport(true)}><Upload size={14}/> Import</button>
        <button className="module-primary-button" onClick={()=>setShowForm(true)}><Plus size={14}/> New Purchase</button>
      </div>
    </header>

    {message?<div className="module-success module-page-message"><strong>{message}</strong></div>:null}
    {error?<div className="module-inline-error module-page-message">{error}</div>:null}

    <section className="module-page-card">
      <RecordListView
        title="Purchases"
        subtitle={`${purchases.length} purchase orders`}
        rows={purchases}
        columns={columns}
        searchKeys={['reference_number','supplier_name','store_name','status','created_by_username']}
        loading={loading}
        error={error}
        onRowSelect={openDetail}
        renderRowActions={row=><button className="purchase-row-action" title="View purchase" onClick={e=>{e.stopPropagation();void openDetail(row)}}><Eye size={13}/></button>}
      />
    </section>

    {showForm?<PurchaseForm
      products={products}
      suppliers={suppliers}
      currency={currency}
      onClose={()=>setShowForm(false)}
      onSaved={async msg=>{setShowForm(false);setMessage(msg);await load()}}
    />:null}

    {showImport?<PurchaseImport
      products={products}
      suppliers={suppliers}
      currency={currency}
      onClose={()=>setShowImport(false)}
      onImported={async count=>{setShowImport(false);setMessage(`${count} purchase${count===1?'':'s'} imported and received.`);await load()}}
    />:null}

    {detail?<PurchaseDetail
      purchase={detail}
      currency={currency}
      loading={detailLoading}
      onClose={()=>setDetail(null)}
      onReceive={meta=>receiveRemaining(detail,meta)}
    />:null}
  </section>
}

function PurchaseForm({products,suppliers,currency,onClose,onSaved}){
  const [supplierId,setSupplierId]=useState('')
  const [referenceNumber,setReferenceNumber]=useState('')
  const [purchaseDate,setPurchaseDate]=useState(new Date().toISOString().slice(0,10))
  const [notes,setNotes]=useState('')
  const [lines,setLines]=useState([EMPTY_LINE()])
  const [configuration,setConfiguration]=useState(null)
  const [platform,setPlatform]=useState({customFields:{},recordTypeId:null})
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')

  useEffect(()=>{
    let live=true
    apiRequest('/api/platform/system/purchase/configuration')
      .then(r=>{
        if(!live)return
        const data=r?.data||{}
        setConfiguration(data)
        const selected=(data.recordTypes||[]).find(t=>t.is_default)?.id||null
        const defaults=(data.recordTypes||[]).find(t=>t.id===selected)?.default_values||{}
        setPlatform({customFields:{...(data.customFields||{}),...defaults},recordTypeId:selected})
      })
      .catch(err=>live&&setError(err?.message||'Unable to load Purchase configuration'))
    return()=>{live=false}
  },[])

  const updateLine=(i,key,value)=>setLines(list=>list.map((line,index)=>index===i?{...line,[key]:value}:line))
  const addLine=()=>setLines(list=>[...list,EMPTY_LINE()])
  const removeLine=i=>setLines(list=>list.length===1?list:list.filter((_,index)=>index!==i))
  const total=lines.reduce((sum,line)=>sum+(Number(line.quantity)||0)*(Number(line.unitCost)||0),0)
  const extensionFields=(configuration?.fields||[]).filter(f=>f?.config?.storage==='extension'&&f.writable!==false&&f.active!==false)

  const submit=async e=>{
    e.preventDefault()
    if(!supplierId)return setError('Select a supplier.')
    if(lines.some(line=>!line.productId||Number(line.quantity)<=0||Number(line.unitCost)<0))return setError('Select a product and enter valid quantities and costs for every line.')
    try{
      setSaving(true);setError('')
      const r=await apiRequest('/api/purchases',{
        method:'POST',
        body:JSON.stringify({
          supplierId,
          referenceNumber:referenceNumber.trim()||null,
          purchaseDate,
          notes:notes.trim()||null,
          receiveNow:true,
          platform,
          items:lines.map(line=>({
            productId:line.productId,
            quantity:Number(line.quantity),
            unitCost:Number(line.unitCost),
            batchNumber:line.batchNumber.trim()||null,
            manufacturingDate:line.manufacturingDate||null,
            expiryDate:line.expiryDate||null,
          })),
        })
      })
      if(!r?.success)throw new Error(r?.message||'Unable to receive stock')
      await onSaved?.('Purchase received and stock updated.')
    }catch(err){setError(err?.message||'Unable to receive stock')}
    finally{setSaving(false)}
  }

  return <div className="module-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&!saving&&onClose()}>
    <form className="module-modal purchase-form-modal" onSubmit={submit}>
      <header><div><strong>New Purchase / Receive Stock</strong><span>Receiving creates PURCHASE inventory movements.</span></div><button type="button" onClick={onClose}><X size={16}/></button></header>
      <div className="module-modal-body purchase-form-body">
        {error?<div className="module-inline-error">{error}</div>:null}
        <div className="purchase-form-grid">
          <label className="module-input-label"><span>Supplier</span><select required value={supplierId} onChange={e=>setSupplierId(e.target.value)}><option value="">Select supplier</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label className="module-input-label"><span>Reference / invoice number</span><input value={referenceNumber} onChange={e=>setReferenceNumber(e.target.value)}/></label>
          <label className="module-input-label"><span>Purchase date</span><input required type="date" value={purchaseDate} onChange={e=>setPurchaseDate(e.target.value)}/></label>
          <label className="module-input-label"><span>Notes</span><input value={notes} onChange={e=>setNotes(e.target.value)}/></label>
        </div>

        <div className="module-table-wrap purchase-lines"><table><thead><tr><th>Product</th><th>SKU</th><th>Quantity</th><th>Unit cost</th><th>Batch</th><th>MFG</th><th>Expiry</th><th>Line total</th><th></th></tr></thead><tbody>{lines.map((line,index)=>{
          const selected=products.find(p=>p.id===line.productId)
          const batchTracked=selected?.batch_tracking===true||selected?.batchTracking===true
          return <tr key={index}>
            <td><select value={line.productId} onChange={e=>updateLine(index,'productId',e.target.value)}><option value="">Select product</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></td>
            <td>{selected?.sku||'—'}</td>
            <td><input type="number" min="0.001" step="0.001" value={line.quantity} onChange={e=>updateLine(index,'quantity',e.target.value)}/></td>
            <td><input type="number" min="0" step="0.01" value={line.unitCost} onChange={e=>updateLine(index,'unitCost',e.target.value)}/></td>
            <td><input value={line.batchNumber} disabled={!batchTracked} placeholder={batchTracked?'Batch no.':'—'} onChange={e=>updateLine(index,'batchNumber',e.target.value)}/></td>
            <td><input type="date" value={line.manufacturingDate} disabled={!batchTracked} onChange={e=>updateLine(index,'manufacturingDate',e.target.value)}/></td>
            <td><input type="date" value={line.expiryDate} disabled={!batchTracked} onChange={e=>updateLine(index,'expiryDate',e.target.value)}/></td>
            <td><strong>{money((Number(line.quantity)||0)*(Number(line.unitCost)||0),currency)}</strong></td>
            <td><button type="button" className="purchase-remove-line" disabled={lines.length===1} onClick={()=>removeLine(index)}><X size={12}/></button></td>
          </tr>
        })}</tbody></table></div>
        <button type="button" className="purchase-add-line" onClick={addLine}><Plus size={13}/> Add product line</button>

        {configuration?.recordTypes?.length?<label className="module-input-label purchase-platform-full"><span>Record type</span><select value={platform.recordTypeId||''} onChange={e=>setPlatform(p=>({...p,recordTypeId:e.target.value||null}))}><option value="">Default</option>{configuration.recordTypes.map(t=><option key={t.id} value={t.id}>{t.label||t.name}</option>)}</select></label>:null}
        {extensionFields.length?<div className="purchase-extension-fields"><h3>Configured fields</h3>{extensionFields.map(field=><PurchaseExtensionField key={field.id||field.api_name} field={field} value={platform.customFields?.[field.api_name]} onChange={value=>setPlatform(p=>({...p,customFields:{...p.customFields,[field.api_name]:value}}))}/>)}</div>:null}
        <div className="purchase-total">Total: <strong>{money(total,currency)}</strong></div>
      </div>
      <footer className="module-modal-footer"><button type="button" onClick={onClose}>Cancel</button><button className="module-primary-button" disabled={saving||!configuration}>{saving?'Receiving…':'Receive Stock'}</button></footer>
    </form>
  </div>
}

function PurchaseExtensionField({field,value,onChange}){
  const type=String(field.field_type||'text').toLowerCase(), options=Array.isArray(field.options)?field.options:[]
  if(type==='boolean')return <label className="purchase-extension-toggle"><span>{field.label||field.api_name}</span><button type="button" className={`mac-switch ${value===true?'is-on':''}`} onClick={()=>onChange(value!==true)}><span/></button></label>
  if(type==='picklist')return <label className="module-input-label"><span>{field.label||field.api_name}</span><select value={value??''} onChange={e=>onChange(e.target.value)}><option value="">—</option>{options.map(o=><option key={typeof o==='object'?o.value:o} value={typeof o==='object'?o.value:o}>{typeof o==='object'?(o.label||o.value):o}</option>)}</select></label>
  return <label className="module-input-label"><span>{field.label||field.api_name}</span><input type={['number','decimal','currency'].includes(type)?'number':type==='date'?'date':'text'} value={value??''} onChange={e=>onChange(['number','decimal','currency'].includes(type)?(e.target.value===''?null:Number(e.target.value)):e.target.value)}/></label>
}

function PurchaseDetail({purchase,currency,onClose,onReceive}){
  const [receiving,setReceiving]=useState(false)
  const [receivingReference,setReceivingReference]=useState('')
  const [receivingNotes,setReceivingNotes]=useState('')
  const canReceive=!['RECEIVED','CANCELLED'].includes(String(purchase.status||'').toUpperCase())
  const doReceive=async()=>{
    try{setReceiving(true);await onReceive?.({receivingReference,receivingNotes})}
    finally{setReceiving(false)}
  }
  return <div className="module-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&!receiving&&onClose()}>
    <section className="module-modal purchase-detail-modal">
      <header><div><strong>Purchase {purchase.reference_number||String(purchase.id||'').slice(0,8)}</strong><span>{purchase.supplier_name||'No supplier'} · {date(purchase.purchase_date)} · {purchase.status}</span></div><button onClick={onClose}><X size={16}/></button></header>
      <div className="module-modal-body">
        <div className="purchase-detail-summary">
          <div><span>Store</span><strong>{purchase.store_name||'—'}</strong></div>
          <div><span>Total</span><strong>{money(purchase.total,currency)}</strong></div>
          <div><span>Created by</span><strong>{purchase.created_by_username||'—'}</strong></div>
          <div><span>Received by</span><strong>{purchase.received_by_username||'—'}</strong></div>
        </div>

        <div className="module-table-wrap"><table><thead><tr><th>Product</th><th>SKU</th><th>Ordered</th><th>Received</th><th>Remaining</th><th>Batch</th><th>MFG</th><th>Expiry</th><th>Unit cost</th><th>Line total</th></tr></thead><tbody>{(purchase.items||[]).map(item=><tr key={item.id}><td>{item.product_name}</td><td>{item.sku||'—'}</td><td>{item.quantity}</td><td>{item.received_quantity||0}</td><td><strong>{item.remaining_quantity||0}</strong></td><td>{item.batch_number||'—'}</td><td>{date(item.manufacturing_date)}</td><td>{date(item.expiry_date)}</td><td>{money(item.unit_cost,currency)}</td><td>{money(item.line_total,currency)}</td></tr>)}</tbody></table></div>

        {canReceive?<div className="purchase-receive-box">
          <div><strong>Receive remaining stock</strong><span>The backend plans the remaining quantities and prevents double receipt.</span></div>
          <label className="module-input-label"><span>Receipt reference (optional)</span><input value={receivingReference} onChange={e=>setReceivingReference(e.target.value)}/></label>
          <label className="module-input-label"><span>Receipt notes (optional)</span><input value={receivingNotes} onChange={e=>setReceivingNotes(e.target.value)}/></label>
          <button className="module-primary-button" disabled={receiving} onClick={doReceive}>{receiving?'Receiving…':'Receive remaining'}</button>
        </div>:null}

        <h3 className="purchase-detail-heading">Receipt history</h3>
        {(purchase.receipts||[]).length?<div className="module-table-wrap"><table><thead><tr><th>Received at</th><th>Reference</th><th>Notes</th><th>Received by</th></tr></thead><tbody>{purchase.receipts.map(r=><tr key={r.id}><td>{datetime(r.received_at)}</td><td>{r.reference_number||'—'}</td><td>{r.notes||'—'}</td><td>{r.received_by_username||'—'}</td></tr>)}</tbody></table></div>:<div className="module-state compact">No receipts yet.</div>}

        <h3 className="purchase-detail-heading">Generated inventory movements</h3>
        {(purchase.movements||[]).length?<div className="module-table-wrap"><table><thead><tr><th>Product</th><th>Movement</th><th>Quantity</th><th>Balance</th><th>Date</th></tr></thead><tbody>{purchase.movements.map(m=><tr key={m.id}><td>{(purchase.items||[]).find(i=>i.product_id===m.product_id)?.product_name||m.product_id}</td><td>{m.movement_type}</td><td className="is-positive">+{m.quantity_change}</td><td>{m.balance_after}</td><td>{datetime(m.created_at)}</td></tr>)}</tbody></table></div>:<div className="module-state compact">No movements generated.</div>}
      </div>
    </section>
  </div>
}

function parseDelimited(raw){
  const rows=[]
  let row=[],cell='',quoted=false
  for(let i=0;i<raw.length;i++){
    const ch=raw[i]
    if(quoted){
      if(ch==='"'&&raw[i+1]==='"'){cell+='"';i++}
      else if(ch==='"')quoted=false
      else cell+=ch
    }else if(ch==='"')quoted=true
    else if(ch===','||ch==='\t'){row.push(cell.trim());cell=''}
    else if(ch==='\n'){row.push(cell.trim());if(row.some(v=>v!==''))rows.push(row);row=[];cell=''}
    else if(ch!=='\r')cell+=ch
  }
  row.push(cell.trim());if(row.some(v=>v!==''))rows.push(row)
  return rows
}

function PurchaseImport({products,suppliers,currency,onClose,onImported}){
  const inputRef=useRef(null)
  const [file,setFile]=useState(null)
  const [parsed,setParsed]=useState(null)
  const [preview,setPreview]=useState(null)
  const [mapped,setMapped]=useState(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')

  const choose=async f=>{
    if(!f)return
    try{
      setFile(f);setBusy(true);setError('')
      const raw=await f.text()
      const result=parsePurchaseImport(parseDelimited(raw))
      const pv=buildPurchaseImportPreview(result)
      setParsed(result);setPreview(pv)
      if(!pv.errorsByRow||!Object.keys(pv.errorsByRow).length){
        setMapped(mapPurchaseImport(result.validRows,{
          products,suppliers,
          companyId:suppliers[0]?.company_id||null,
          storeId:null,
        }))
      }else setMapped(null)
    }catch(err){setError(err?.message||'Unable to parse import file')}
    finally{setBusy(false)}
  }

  const execute=async()=>{
    if(!mapped?.purchases?.length||mapped.errors?.length)return
    try{
      setBusy(true);setError('')
      for(const purchase of mapped.purchases){
        const r=await apiRequest('/api/purchases',{method:'POST',body:JSON.stringify({...purchase,items:purchase.items||purchase.lines,receiveNow:true})})
        if(!r?.success)throw new Error(r?.message||'Import failed')
      }
      await onImported?.(mapped.purchases.length)
    }catch(err){setError(err?.message||'Import failed')}
    finally{setBusy(false)}
  }

  const reset=()=>{setFile(null);setParsed(null);setPreview(null);setMapped(null);setError('');if(inputRef.current)inputRef.current.value=''}

  return <div className="module-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&!busy&&onClose()}>
    <section className="module-modal purchase-import-modal">
      <header><div><strong>Import Purchases</strong><span>CSV or TSV: EAN/SKU, Quantity, Unit Cost, Supplier, Reference, Date.</span></div><button onClick={onClose}><X size={16}/></button></header>
      <div className="module-modal-body purchase-import-body">
        {error?<div className="module-inline-error">{error}</div>:null}
        {!file?<div className="purchase-import-drop">
          <Upload size={22}/><strong>Choose purchase import file</strong><span>Supplier and Product identities are resolved before any write occurs.</span>
          <input ref={inputRef} hidden type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" onChange={e=>void choose(e.target.files?.[0])}/>
          <button onClick={()=>inputRef.current?.click()}>Choose file</button>
        </div>:<>
          <div className="purchase-import-file"><div><strong>{file.name}</strong><span>{(parsed?.validRows?.length||0)+(preview?.invalidRows||0)} rows parsed</span></div><button onClick={reset}>Change file</button></div>
          {preview?<div className="purchase-import-stats">
            <div><span>Input rows</span><strong>{preview.totalInputRows}</strong></div>
            <div><span>Valid rows</span><strong>{preview.validRows}</strong></div>
            <div><span>Invalid rows</span><strong>{preview.invalidRows}</strong></div>
            <div><span>Purchases</span><strong>{preview.totalPurchases}</strong></div>
            <div><span>Item lines</span><strong>{preview.totalItemLines}</strong></div>
            <div><span>Total qty</span><strong>{preview.totalQuantity}</strong></div>
            <div><span>Total value</span><strong>{money(preview.totalValue,currency)}</strong></div>
          </div>:null}
          {(parsed?.errors||[]).filter(e=>e?.row==null).map((e,i)=><div className="module-inline-error" key={i}>{(e.errors||[]).join('; ')}</div>)}
          {preview&&Object.keys(preview.errorsByRow||{}).length?<div className="purchase-import-errors">{Object.entries(preview.errorsByRow).map(([row,msgs])=><div key={row}>Row {row}: {msgs.join('; ')}</div>)}</div>:null}
          {mapped?.errors?.length?<div className="purchase-import-errors">{mapped.errors.map((e,i)=><div key={i}>{e.row!=null?`Row ${e.row}: `:''}{(e.errors||[]).join('; ')}</div>)}</div>:null}
          {mapped?.purchases?.length&&!mapped.errors?.length?<div className="purchase-import-resolved"><h3><Check size={13}/> Supplier & Product resolution</h3>{mapped.purchases.map((p,i)=><article key={i}><strong>{p.referenceNumber||'No reference'} · {p.supplierName||'Supplier'}</strong>{(p.lines||[]).map(line=><span key={line.productId}>{line.productName||line.ean} · {line.quantity} × {money(line.unitCost,currency)} · via {line.resolvedVia}</span>)}</article>)}</div>:null}
        </>}
      </div>
      <footer className="module-modal-footer"><button onClick={onClose} disabled={busy}>Cancel</button>{mapped?.purchases?.length&&!mapped.errors?.length?<button className="module-primary-button" onClick={execute} disabled={busy}>{busy?'Importing…':`Import ${mapped.purchases.length} purchase${mapped.purchases.length===1?'':'s'}`}</button>:null}</footer>
    </section>
  </div>
}
