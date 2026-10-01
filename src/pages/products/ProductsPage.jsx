import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, History, Plus, RefreshCw, Upload, X } from 'lucide-react'
import { apiFetch, apiRequest } from '../../services/api'
import { cachedGet } from '../../services/cachedApi'
import RecordListView from '../../components/RecordListView'

const CORE_FIELD_NAMES = new Set([
  'name','sku','barcode','description','price','cost_price','vat_rate','vat_applicable',
  'age_restricted','stock_quantity','low_stock_level','track_stock','batch_tracking',
  'category_id','available_on_uber','available_on_deliveroo','uber_item_id','deliveroo_item_id',
  'image_url','active','product_kind','parent_product_id','variant_attributes','created_at','updated_at',
])

function money(value, currency='GBP') {
  const n = Number(value || 0)
  try { return new Intl.NumberFormat(undefined,{style:'currency',currency,maximumFractionDigits:2}).format(n) }
  catch { return `${n.toFixed(2)} ${currency}` }
}

function fieldValue(product,key){
  return product?.[key] ?? product?.[key.replace(/_([a-z])/g,(_,c)=>c.toUpperCase())] ?? ''
}

function pairsToText(value={}){
  return Object.entries(value||{}).map(([key,val])=>`${key}: ${val}`).join('\n')
}
function textToPairs(value=''){
  return Object.fromEntries(String(value||'').split(/\r?\n/).map(line=>{
    const index=line.indexOf(':')
    if(index<1)return null
    return [line.slice(0,index).trim(),line.slice(index+1).trim()]
  }).filter(Boolean).filter(([key,val])=>key&&val))
}

export default function ProductsPage({ onOpenCategories, onOpenGlobalProducts }) {
  const [products,setProducts]=useState([])
  const [categories,setCategories]=useState([])
  const [currency,setCurrency]=useState('GBP')
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [editor,setEditor]=useState(null)
  const [history,setHistory]=useState(null)
  const [importOpen,setImportOpen]=useState(false)
  const [importFile,setImportFile]=useState(null)
  const [importPreview,setImportPreview]=useState(null)
  const [importErrors,setImportErrors]=useState([])
  const [importResult,setImportResult]=useState(null)
  const [importBusy,setImportBusy]=useState(false)
  const [exportBusy,setExportBusy]=useState(false)
  const fileRef=useRef(null)

  const load=async(forceRefresh=false)=>{
    try{
      setLoading(true); setError('')
      const [p,c,s]=await Promise.all([
        cachedGet('/api/products',{forceRefresh,onFresh:fresh=>fresh?.success&&setProducts(Array.isArray(fresh.data)?fresh.data:[])}),
        cachedGet('/api/categories?all=true',{forceRefresh,onFresh:fresh=>fresh?.success&&setCategories(Array.isArray(fresh.data)?fresh.data:[])}).catch(()=>null),
        cachedGet('/api/settings',{cacheKey:'settings:company',forceRefresh,onFresh:fresh=>fresh?.data?.company?.currency&&setCurrency(fresh.data.company.currency)}).catch(()=>null),
      ])
      if(!p?.success) throw new Error(p?.message||'Unable to load products')
      setProducts(Array.isArray(p.data)?p.data:[])
      setCategories(Array.isArray(c?.data)?c.data:[])
      setCurrency(s?.data?.company?.currency||'GBP')
    }catch(err){ setError(err?.message||'Unable to load products') }
    finally{ setLoading(false) }
  }
  useEffect(()=>{ void load() },[])

  const columns=useMemo(()=>[
    {key:'name',label:'Product',render:r=>r.name||'—'},
    {key:'sku',label:'SKU',render:r=>r.sku||'—'},
    {key:'barcode',label:'Barcode',render:r=>r.barcode||'—'},
    {key:'category_name',label:'Category',render:r=>r.category_name||'—'},
    {key:'price',label:'Price',render:r=>money(r.price,currency)},
    {key:'stock_quantity',label:'Stock',render:r=>{
      const raw=r.stock_quantity ?? r.stock
      if(raw==null||raw==='')return '—'
      const value=Number(raw)
      const label=Number.isFinite(value)
        ? new Intl.NumberFormat(undefined,{maximumFractionDigits:3}).format(value)
        : String(raw)
      return <span className={Number.isFinite(value)&&value<0?'product-stock-negative':''}>{label}</span>
    }},
    {key:'product_kind',label:'Type',render:r=>r.product_kind||'standard'},
    {key:'active',label:'Status',render:r=>r.active===false?'Inactive':'Active'},
  ],[currency])

  const activeCount=products.filter(p=>p.active!==false).length
  const lowStockCount=products.filter(p=>p.track_stock!==false && Number(p.stock_quantity ?? p.stock ?? 0)<=Number(p.low_stock_level ?? 5)).length

  const openEdit=async(row)=>{
    try{
      setError('')
      const response=await apiRequest(`/api/products/${encodeURIComponent(row.id)}`)
      if(!response?.success) throw new Error(response?.message||'Unable to load product')
      setEditor({mode:'edit',product:response.data,preset:null})
    }catch(err){ setError(err?.message||'Unable to load product') }
  }

  const toggleActive=async(product)=>{
    try{
      setError('')
      if(product.active===false){
        await apiRequest(`/api/platform/objects/product/records/${encodeURIComponent(product.id)}`,{
          method:'PUT',body:JSON.stringify({data:{active:true}})
        })
      }else{
        await apiRequest(`/api/products/${encodeURIComponent(product.id)}`,{method:'DELETE'})
      }
      await load(true)
    }catch(err){ setError(err?.message||'Unable to update product status') }
  }

  const loadHistory=async(product)=>{
    try{
      const response=await apiRequest(`/api/products/${encodeURIComponent(product.id)}/history`)
      if(!response?.success) throw new Error(response?.message||'Unable to load history')
      setHistory({product,rows:Array.isArray(response.data)?response.data:[]})
    }catch(err){ setError(err?.message||'Unable to load product history') }
  }

  const doExport=async()=>{
    try{
      setExportBusy(true);setError('')
      const response=await apiFetch('/api/products/export',{headers:{Accept:'text/csv'}})
      if(!response.ok){ const data=await response.json().catch(()=>({})); throw new Error(data.message||'Export failed') }
      const blob=await response.blob()
      const url=URL.createObjectURL(blob)
      const a=document.createElement('a')
      a.href=url;a.download=`products-export-${new Date().toISOString().slice(0,10)}.csv`;a.click()
      URL.revokeObjectURL(url)
    }catch(err){setError(err?.message||'Export failed')}
    finally{setExportBusy(false)}
  }

  const validateImport=async()=>{
    if(!importFile)return
    try{
      setImportBusy(true);setError('');setImportResult(null)
      const csv=await importFile.text()
      const r=await apiRequest('/api/products/import/validate',{method:'POST',body:JSON.stringify({csv})})
      if(!r?.success)throw new Error(r?.message||'Validation failed')
      setImportPreview(r.data?.preview||null);setImportErrors(r.data?.validationErrors||[])
    }catch(err){setError(err?.message||'Validation failed')}
    finally{setImportBusy(false)}
  }
  const executeImport=async()=>{
    if(!importFile)return
    try{
      setImportBusy(true);setError('')
      const csv=await importFile.text()
      const r=await apiRequest('/api/products/import',{method:'POST',body:JSON.stringify({csv})})
      if(!r?.success)throw new Error(r?.message||'Import failed')
      setImportResult(r.data||{});setImportPreview(null);await load(true)
    }catch(err){setError(err?.message||'Import failed')}
    finally{setImportBusy(false)}
  }
  const closeImport=()=>{setImportOpen(false);setImportFile(null);setImportPreview(null);setImportErrors([]);setImportResult(null);if(fileRef.current)fileRef.current.value=''}

  return <section className="module-page products-page">
    <header className="module-page-header">
      <div><span>Catalogue</span><h1>Products</h1><p>Manage the canonical Product Master.</p></div>
      <div className="module-header-actions">
        {onOpenCategories?<button onClick={onOpenCategories}>Categories</button>:null}
        {onOpenGlobalProducts?<button onClick={onOpenGlobalProducts}>Global Products</button>:null}
        <button onClick={()=>load(true)}><RefreshCw size={14}/> Refresh</button>
        <button onClick={doExport} disabled={exportBusy}><Download size={14}/> {exportBusy?'Exporting…':'Export'}</button>
        <button onClick={()=>setImportOpen(true)}><Upload size={14}/> Import</button>
        <button className="module-primary-button" onClick={()=>setEditor({mode:'create',product:null,preset:null})}><Plus size={14}/> Add Product</button>
      </div>
    </header>

    {error?<div className="module-inline-error module-page-message">{error}</div>:null}

    <div className="product-stats">
      <div><span>Total Products</span><strong>{products.length}</strong></div>
      <div><span>Active Products</span><strong>{activeCount}</strong></div>
      <div><span>Low Stock</span><strong>{lowStockCount}</strong></div>
    </div>

    <div className="module-page-card">
      <RecordListView
        title="Product Master"
        subtitle={({filteredCount,totalCount})=>filteredCount===totalCount?`${totalCount} products`:`${filteredCount} of ${totalCount} products`}
        rows={products}
        columns={columns}
        searchKeys={['name','sku','barcode','category_name','product_kind']}
        loading={loading}
        error={error}
        onRowSelect={openEdit}
        renderRowActions={(row)=><div className="product-row-actions">
          <button type="button" onClick={(e)=>{e.stopPropagation();void loadHistory(row)}}><History size={12}/> History</button>
          <button type="button" onClick={(e)=>{e.stopPropagation();void toggleActive(row)}}>{row.active===false?'Activate':'Deactivate'}</button>
        </div>}
      />
    </div>

    {editor?<ProductEditor
      mode={editor.mode}
      product={editor.product}
      preset={editor.preset}
      categories={categories}
      products={products}
      onClose={()=>setEditor(null)}
      onSaved={async()=>{setEditor(null);await load(true)}}
    />:null}

    {history?<ProductHistoryModal state={history} onClose={()=>setHistory(null)}/>:null}

    {importOpen?<div className="module-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&closeImport()}>
      <section className="module-modal product-import-modal">
        <header><div><strong>Import Products</strong><span>Validate the CSV before writing anything.</span></div><button onClick={closeImport}><X size={16}/></button></header>
        <div className="module-modal-body">
          {importResult?<div className="product-import-result">
            <div className="module-success"><strong>Import completed successfully</strong></div>
            <div className="product-import-stats">
              <div><span>Created</span><strong>{importResult.created?.length||0}</strong></div>
              <div><span>Updated</span><strong>{importResult.updated?.length||0}</strong></div>
              <div><span>Store mappings</span><strong>{importResult.storeMappings?.length||0}</strong></div>
              <div><span>Errors</span><strong>{importResult.errors?.length||0}</strong></div>
            </div>
            {(importResult.errors||[]).slice(0,20).map((err,i)=><div className="module-inline-error" key={i}>Row {err.lineNumber}: {err.message}</div>)}
          </div>:<>
            <div className="product-file-drop">
              <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={e=>{setImportFile(e.target.files?.[0]||null);setImportPreview(null);setImportErrors([])}}/>
              <strong>{importFile?.name||'Choose a CSV file'}</strong>
              <span>product_id, sku, ean, name, description, category, vat_rate, cost_price, price, active, store_code, store_enabled, store_price, reorder_level, minimum_stock</span>
              <button onClick={()=>fileRef.current?.click()}>Choose File</button>
            </div>
            {importPreview?<div className="product-import-preview">
              <div className="product-import-stats">
                <div><span>New</span><strong>{importPreview.summary?.new||0}</strong></div>
                <div><span>Update</span><strong>{importPreview.summary?.update||0}</strong></div>
                <div><span>Mappings</span><strong>{importPreview.summary?.storeMappings||0}</strong></div>
              </div>
              {importErrors.slice(0,10).map((err,i)=><div className="module-inline-error" key={i}>Row {err.lineNumber} ({err.sku||'—'}): {(err.errors||[]).map(x=>x.message).join('; ')}</div>)}
            </div>:null}
          </>}
        </div>
        <footer className="module-modal-footer">
          <button onClick={closeImport}>Close</button>
          {!importResult&&!importPreview?<button className="module-primary-button" disabled={!importFile||importBusy} onClick={validateImport}>{importBusy?'Validating…':'Validate'}</button>:null}
          {!importResult&&importPreview?<button className="module-primary-button" disabled={importBusy} onClick={executeImport}>{importBusy?'Importing…':'Confirm Import'}</button>:null}
        </footer>
      </section>
    </div>:null}
  </section>
}

export function ProductEditor({mode,product,preset,categories,products=[],onClose,onSaved}){
  const [values,setValues]=useState(()=>({
    name:product?.name||preset?.name||'',
    sku:product?.sku||'',
    barcode:product?.barcode||preset?.ean||preset?.barcode||'',
    description:product?.description||preset?.description||'',
    price:fieldValue(product,'price')||0,
    cost_price:fieldValue(product,'cost_price')||0,
    vat_rate:fieldValue(product,'vat_rate')||20,
    vat_applicable:product?.vat_applicable!==false,
    age_restricted:product?.age_restricted===true,
    low_stock_level:fieldValue(product,'low_stock_level')||0,
    track_stock:product?.track_stock!==false,
    batch_tracking:product?.batch_tracking===true,
    category_id:fieldValue(product,'category_id')||preset?.categoryId||'',
    image_url:fieldValue(product,'image_url')||preset?.imageUrl||'',
    stock_quantity:0,
  }))
  const [configuration,setConfiguration]=useState(null)
  const [platform,setPlatform]=useState({customFields:{},recordTypeId:null})
  const [kioskBase,setKioskBase]=useState({})
  const [kiosk,setKiosk]=useState({
    specifications:'',
    nutrition:'',
    allergens:'',
    warranty:'',
    crossSell:[],
    upsell:[],
    accessory:[],
  })
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')

  useEffect(()=>{
    let live=true
    apiRequest(`/api/platform/system/product/configuration${product?.id?`?recordId=${encodeURIComponent(product.id)}`:''}`)
      .then(r=>{
        if(!live)return
        const data=r?.data||{}
        setConfiguration(data)
        const selected=data.recordTypeId||(!product?.id?(data.recordTypes||[]).find(t=>t.is_default)?.id:null)||null
        const defaults=!product?.id?(data.recordTypes||[]).find(t=>t.id===selected)?.default_values||{}:{}
        setPlatform({customFields:{...(data.customFields||{}),...defaults},recordTypeId:selected})
      }).catch(err=>live&&setError(err?.message||'Unable to load configured Product fields'))
    return()=>{live=false}
  },[product?.id])

  useEffect(()=>{
    if(!product?.id)return
    let live=true
    apiRequest(`/api/products/${encodeURIComponent(product.id)}/kiosk-metadata`)
      .then(response=>{
        if(!live)return
        const data=response?.data||{}
        const recommendations=data.recommendations||{}
        setKioskBase(data)
        setKiosk({
          specifications:pairsToText(data.specifications||{}),
          nutrition:pairsToText(data.nutrition||{}),
          allergens:Array.isArray(data.allergens)?data.allergens.join(', '):'',
          warranty:typeof data.warranty==='string'?data.warranty:'',
          crossSell:Array.isArray(recommendations.CROSS_SELL)?recommendations.CROSS_SELL:[],
          upsell:Array.isArray(recommendations.UPSELL)?recommendations.UPSELL:[],
          accessory:Array.isArray(recommendations.ACCESSORY)?recommendations.ACCESSORY:[],
        })
      })
      .catch(()=>{})
    return()=>{live=false}
  },[product?.id])

  const extensionFields=(configuration?.fields||[]).filter(f=>f?.config?.storage==='extension'&&f.writable!==false&&f.active!==false)

  const change=(key,value)=>setValues(v=>({...v,[key]:value}))
  const submit=async(e)=>{
    e.preventDefault()
    if(!values.name.trim())return setError('Product name is required')
    try{
      setSaving(true);setError('')
      const payload={
        name:values.name.trim(),
        sku:values.sku.trim()||null,
        barcode:values.barcode.trim()||null,
        description:values.description||null,
        price:Number(values.price)||0,
        costPrice:Number(values.cost_price)||0,
        vatRate:Number(values.vat_rate)||0,
        vatApplicable:values.vat_applicable===true,
        ageRestricted:values.age_restricted===true,
        lowStockLevel:Number(values.low_stock_level)||0,
        trackStock:values.track_stock===true,
        batchTracking:values.batch_tracking===true,
        categoryId:values.category_id||null,
        imageUrl:values.image_url||null,
        ...(mode==='create'?{stockQuantity:Number(values.stock_quantity)||0}:{}),
        platform,
      }
      const response=await apiRequest(product?.id?`/api/products/${encodeURIComponent(product.id)}`:'/api/products',{
        method:product?.id?'PUT':'POST',body:JSON.stringify(payload)
      })
      if(!response?.success)throw new Error(response?.message||'Unable to save product')
      const savedId=response?.data?.id||product?.id
      if(savedId){
        const metadata={
          ...kioskBase,
          specifications:textToPairs(kiosk.specifications),
          nutrition:textToPairs(kiosk.nutrition),
          allergens:String(kiosk.allergens||'').split(',').map(value=>value.trim()).filter(Boolean),
          warranty:String(kiosk.warranty||'').trim(),
          recommendations:{
            ...(kioskBase.recommendations||{}),
            CROSS_SELL:kiosk.crossSell||[],
            UPSELL:kiosk.upsell||[],
            ACCESSORY:kiosk.accessory||[],
          },
        }
        const kioskResponse=await apiRequest(`/api/products/${encodeURIComponent(savedId)}/kiosk-metadata`,{
          method:'PUT',
          body:JSON.stringify({metadata}),
        })
        if(!kioskResponse?.success)throw new Error(kioskResponse?.message||'Product saved but OneKiosk data could not be saved')
      }
      await onSaved?.(response.data)
    }catch(err){setError(err?.message||'Unable to save product')}
    finally{setSaving(false)}
  }

  const input=(key,label,type='text',extra={})=><label className="module-input-label"><span>{label}</span><input type={type} value={values[key]??''} onChange={e=>change(key,type==='number'?e.target.value:e.target.value)} {...extra}/></label>

  return <div className="module-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&!saving&&onClose()}>
    <form className="module-modal product-editor-modal" onSubmit={submit}>
      <header><div><strong>{product?.id?'Edit Product':'New Product'}</strong><span>Core Product rules remain server-authoritative.</span></div><button type="button" onClick={onClose} disabled={saving}><X size={16}/></button></header>
      <div className="module-modal-body product-editor-grid">
        {error?<div className="module-inline-error product-editor-full">{error}</div>:null}
        {input('name','Name')}
        {input('sku','SKU')}
        {input('barcode','Barcode / EAN')}
        <label className="module-input-label"><span>Category</span><select value={values.category_id} onChange={e=>change('category_id',e.target.value)}><option value="">Uncategorised</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        {input('price','Price','number',{step:'0.01',min:'0'})}
        {input('cost_price','Cost price','number',{step:'0.01',min:'0'})}
        {input('vat_rate','VAT rate','number',{step:'0.01',min:'0',max:'100'})}
        {input('low_stock_level','Low stock level','number',{step:'0.001',min:'0'})}
        {mode==='create'&&values.track_stock?input('stock_quantity','Opening stock','number',{step:'0.001',min:'0'}):null}
        {input('image_url','Image URL / data URL')}
        <label className="module-textarea-label product-editor-full"><span>Description</span><textarea value={values.description} onChange={e=>change('description',e.target.value)} rows={3}/></label>
        <div className="product-toggle-grid product-editor-full">
          {[
            ['vat_applicable','VAT applicable'],['age_restricted','Age restricted'],['track_stock','Track stock'],['batch_tracking','Batch tracking']
          ].map(([key,label])=><label key={key}><span>{label}</span><button type="button" className={`mac-switch ${values[key]?'is-on':''}`} onClick={()=>change(key,!values[key])}><span/></button></label>)}
        </div>

        {configuration?.recordTypes?.length?<label className="module-input-label product-editor-full"><span>Record type</span><select value={platform.recordTypeId||''} onChange={e=>setPlatform(p=>({...p,recordTypeId:e.target.value||null}))}><option value="">Default</option>{configuration.recordTypes.map(t=><option key={t.id} value={t.id}>{t.label||t.name}</option>)}</select></label>:null}

        <div className="product-extension-fields product-editor-full">
          <h3>OneKiosk experience data</h3>
          <p className="text-xs text-slate-500">These fields appear only when the kiosk workflow enables the matching customer experience.</p>
          <div className="product-editor-grid">
            <label className="module-textarea-label product-editor-full"><span>Specifications · one per line as Label: Value</span><textarea rows={5} value={kiosk.specifications} onChange={e=>setKiosk(v=>({...v,specifications:e.target.value}))} placeholder={'Screen: 6.7 inch\nStorage: 256GB\nCamera: 50MP'}/></label>
            <label className="module-textarea-label product-editor-full"><span>Nutrition · one per line as Label: Value</span><textarea rows={4} value={kiosk.nutrition} onChange={e=>setKiosk(v=>({...v,nutrition:e.target.value}))} placeholder={'Calories: 520 kcal\nProtein: 24g'}/></label>
            <label className="module-input-label"><span>Allergens · comma separated</span><input value={kiosk.allergens} onChange={e=>setKiosk(v=>({...v,allergens:e.target.value}))} placeholder="Milk, Wheat, Sesame"/></label>
            <label className="module-input-label"><span>Warranty / service text</span><input value={kiosk.warranty} onChange={e=>setKiosk(v=>({...v,warranty:e.target.value}))} placeholder="2 year manufacturer warranty"/></label>
            {[
              ['crossSell','Cross-sell products'],
              ['upsell','Upsell products'],
              ['accessory','Accessory / protection products'],
            ].map(([key,label])=><label key={key} className="module-input-label"><span>{label}</span><select multiple size={5} value={kiosk[key]||[]} onChange={e=>setKiosk(v=>({...v,[key]:Array.from(e.target.selectedOptions).map(option=>option.value)}))}>{products.filter(row=>String(row.id)!==String(product?.id||'')).map(row=><option key={row.id} value={row.id}>{row.name}{row.sku?` · ${row.sku}`:''}</option>)}</select></label>)}
          </div>
        </div>

        {extensionFields.length?<div className="product-extension-fields product-editor-full"><h3>Configured fields</h3>{extensionFields.map(field=><ExtensionField key={field.id||field.api_name} field={field} value={platform.customFields?.[field.api_name]} onChange={value=>setPlatform(p=>({...p,customFields:{...p.customFields,[field.api_name]:value}}))}/>)}</div>:null}
      </div>
      <footer className="module-modal-footer"><button type="button" onClick={onClose} disabled={saving}>Cancel</button><button className="module-primary-button" type="submit" disabled={saving}>{saving?'Saving…':'Save Product'}</button></footer>
    </form>
  </div>
}

function ExtensionField({field,value,onChange}){
  const type=String(field.field_type||'text').toLowerCase()
  const options=Array.isArray(field.options)?field.options:[]
  if(type==='boolean')return <label className="product-extension-toggle"><span>{field.label||field.api_name}</span><button type="button" className={`mac-switch ${value===true?'is-on':''}`} onClick={()=>onChange(value!==true)}><span/></button></label>
  if(type==='picklist')return <label className="module-input-label"><span>{field.label||field.api_name}</span><select value={value??''} onChange={e=>onChange(e.target.value)}><option value="">—</option>{options.map(o=><option key={typeof o==='object'?o.value:o} value={typeof o==='object'?o.value:o}>{typeof o==='object'?(o.label||o.value):o}</option>)}</select></label>
  if(type==='number'||type==='decimal'||type==='currency')return <label className="module-input-label"><span>{field.label||field.api_name}</span><input type="number" value={value??''} onChange={e=>onChange(e.target.value===''?null:Number(e.target.value))}/></label>
  if(type==='date')return <label className="module-input-label"><span>{field.label||field.api_name}</span><input type="date" value={value??''} onChange={e=>onChange(e.target.value||null)}/></label>
  return <label className="module-input-label"><span>{field.label||field.api_name}</span><input value={value??''} onChange={e=>onChange(e.target.value)}/></label>
}

function ProductHistoryModal({state,onClose}){
  return <div className="module-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
    <section className="module-modal product-history-modal"><header><div><strong>Product History</strong><span>{state.product?.name}</span></div><button onClick={onClose}><X size={16}/></button></header>
      <div className="module-modal-body">{state.rows.length?<div className="product-history-list">{state.rows.map(row=><div key={row.id}><div><strong>{row.action||'Change'}</strong><span>{row.full_name||row.username||'System'}</span></div><time>{row.created_at?new Date(row.created_at).toLocaleString():'—'}</time><pre>{row.details?JSON.stringify(row.details,null,2):''}</pre></div>)}</div>:<div className="module-state">No Product history available.</div>}</div>
    </section>
  </div>
}
