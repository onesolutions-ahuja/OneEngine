import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Copy, Hash, LayoutGrid, Monitor, Plus, ReceiptText, ScanLine, Store, X } from 'lucide-react'
import { apiRequest } from '../../services/api'
import { patchSettings } from '../../services/settings'
import MetadataRecordFormModal from '../../components/MetadataRecordFormModal'

const DOCK_MAX=8
const DOCK_PAGE_OPTIONS=[
  'Dashboard','Sales','Returns','Supplier Returns','Order Prep','Payments',
  'Products','Global Products','Categories','Purchases','Suppliers','Inventory',
  'Replenishment','Customers','Employees','Stores','Reports','Integrations',
  'Accounting','Settings',
]

export default function StoreTillSettingsPage({settings,onSettingsChanged}){
  const [stores,setStores]=useState([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const [storeEditor,setStoreEditor]=useState(null)
  const [tillEditor,setTillEditor]=useState(null)
  const [prefixes,setPrefixes]=useState({till:'TO',delivery:'DEL',selfCheckout:'SC'})
  const [productView,setProductView]=useState('image')
  const [negative,setNegative]=useState(false)
  const [dock,setDock]=useState([])
  const [customerDisplay,setCustomerDisplay]=useState(false)
  const [selfKeys,setSelfKeys]=useState({})
  const [busy,setBusy]=useState('')

  const load=async()=>{
    try{
      setLoading(true);setError('')
      const [s,cfg]=await Promise.all([apiRequest('/api/admin/stores'),apiRequest('/api/settings')])
      if(!s?.success||!cfg?.success)throw new Error(s?.message||cfg?.message||'Unable to load Store & Till')
      setStores(Array.isArray(s.data)?s.data:[])
      const d=cfg.data||{}
      setPrefixes({
        till:d.invoicePrefixes?.till||'TO',
        delivery:d.invoicePrefixes?.delivery||'DEL',
        selfCheckout:d.invoicePrefixes?.selfCheckout||'SC',
      })
      setProductView(d.till?.productView==='compact'?'compact':'image')
      setNegative(d.inventory?.allowNegativeInventoryBilling===true)
      setDock(Array.isArray(d.dock?.quickAccess)?d.dock.quickAccess.slice(0,DOCK_MAX):[])
      setCustomerDisplay(d.customerDisplay?.enabled===true)
    }catch(err){setError(err?.message||'Unable to load Store & Till')}
    finally{setLoading(false)}
  }
  useEffect(()=>{void load()},[])

  const savePatch=async(patch,success)=>{
    try{
      setBusy(success||'saving');setError('')
      const r=await patchSettings(patch)
      if(r?.success===false)throw new Error(r?.message||'Unable to save settings')
      setMessage(success||'Settings saved.')
      await onSettingsChanged?.()
      return true
    }catch(err){setError(err?.message||'Unable to save settings');return false}
    finally{setBusy('')}
  }

  const saveTill=async(form)=>{
    try{
      setBusy(`till-${form.id}`);setError('')
      const r=await apiRequest(`/api/admin/tills/${encodeURIComponent(form.id)}`,{
        method:'PUT',
        body:JSON.stringify({
          name:form.name,
          terminalNumber:form.terminalNumber||null,
          deviceIdentifier:form.deviceIdentifier||null,
          active:form.active!==false,
        })
      })
      if(!r?.success)throw new Error(r?.message||'Unable to update till')
      setTillEditor(null);setMessage('Till updated.');await load()
    }catch(err){setError(err?.message||'Unable to update till')}
    finally{setBusy('')}
  }

  const savePrefixes=async()=>{
    const ok=await savePatch({
      tillInvoicePrefix:prefixes.till,
      deliveryInvoicePrefix:prefixes.delivery,
      selfCheckoutInvoicePrefix:prefixes.selfCheckout,
    },'Invoice prefixes saved.')
    if(ok)await load()
  }

  const changeNegative=async next=>{
    if(next&&!window.confirm('Allow the till to complete sales when recorded stock is insufficient? Stock can go negative and affected sales are audited.'))return
    const ok=await savePatch(next?{allowNegativeInventoryBilling:true,acknowledged:true}:{allowNegativeInventoryBilling:false},next?'Negative-inventory billing enabled.':'Negative-inventory billing disabled.')
    if(ok)setNegative(next)
  }

  const saveDock=async next=>{
    if(next.length>DOCK_MAX)return
    const ok=await savePatch({dockQuickAccess:next},'Dock quick access saved.')
    if(ok)setDock(next)
  }
  const moveDock=(index,dir)=>{
    const target=index+dir
    if(target<0||target>=dock.length)return
    const next=[...dock],[item]=next.splice(index,1);next.splice(target,0,item);void saveDock(next)
  }

  const saveProductView=async next=>{
    const ok=await savePatch({productView:next},'Till product view saved.')
    if(ok)setProductView(next)
  }
  const saveCustomerDisplay=async next=>{
    const ok=await savePatch({customerDisplayEnabled:next},next?'Customer Display enabled.':'Customer Display disabled.')
    if(ok)setCustomerDisplay(next)
  }

  const generateKey=async store=>{
    try{
      setBusy(`self-${store.id}`);setError('')
      const r=await apiRequest(`/api/admin/stores/${encodeURIComponent(store.id)}/self-checkout-key`,{method:'POST',body:'{}'})
      if(!r?.success)throw new Error(r?.message||'Unable to generate key')
      setSelfKeys(v=>({...v,[store.id]:r.data?.deviceKey||''}))
      setMessage('Self-Checkout device key generated. Copy it now; it is shown only once.')
    }catch(err){setError(err?.message||'Unable to generate Self-Checkout key')}
    finally{setBusy('')}
  }
  const clearKey=async store=>{
    try{
      setBusy(`self-${store.id}`);setError('')
      const r=await apiRequest(`/api/admin/stores/${encodeURIComponent(store.id)}/self-checkout-key`,{method:'POST',body:JSON.stringify({clear:true})})
      if(!r?.success)throw new Error(r?.message||'Unable to clear pairing')
      setSelfKeys(v=>({...v,[store.id]:null}));setMessage('Self-Checkout pairing cleared.')
    }catch(err){setError(err?.message||'Unable to clear Self-Checkout pairing')}
    finally{setBusy('')}
  }

  const tillCount=useMemo(()=>stores.reduce((sum,s)=>sum+(s.tills||[]).length,0),[stores])

  if(loading)return <div className="module-state">Loading stores and tills…</div>

  return <div className="store-till-settings">
    {message?<div className="module-success"><strong>{message}</strong></div>:null}
    {error?<div className="module-inline-error">{error}</div>:null}

    <section className="settings-feature-card">
      <header><div><Store size={16}/><span><strong>Current store and till</strong><small>Authenticated device/session context.</small></span></div></header>
      <div className="settings-feature-rows">
        <div><span>Store</span><strong>{settings?.store?.name||settings?.store?.storeName||'Unassigned'}</strong></div>
        <div><span>Till</span><strong>{settings?.till?.name||'Unassigned'}</strong></div>
        <div><span>Terminal number</span><strong>{settings?.till?.terminalNumber||'—'}</strong></div>
      </div>
    </section>

    <section className="settings-feature-card">
      <header><div><Store size={16}/><span><strong>Stores & till terminals</strong><small>{stores.length} stores · {tillCount} tills</small></span></div></header>
      <div className="store-till-list">
        {stores.map(store=><article key={store.id}>
          <div className="store-till-store-head">
            <div><strong>{store.name}</strong><span>{store.code||'No code'} · {store.active===false?'Inactive':'Active'}</span></div>
            <button onClick={()=>setStoreEditor(store)}>Edit store</button>
          </div>
          {(store.tills||[]).length?<div className="store-till-terminals">{store.tills.map(till=><button key={till.id} onClick={()=>setTillEditor({...till,storeName:store.name,deviceIdentifier:till.deviceIdentifier||''})}>
            <Monitor size={14}/><span><strong>{till.name||'Till'}</strong><small>{till.terminalNumber||'No terminal number'} · {till.active===false?'Inactive':'Active'}</small></span>
          </button>)}</div>:<div className="module-state compact">No tills configured for this store.</div>}
        </article>)}
      </div>
    </section>

    <section className="settings-feature-card">
      <header><div><Monitor size={16}/><span><strong>Till Product View</strong><small>Applied by the Smart Theme Till from company settings.</small></span></div></header>
      <div className="settings-choice-row">{[['image','Image View'],['compact','Compact View']].map(([value,label])=><button key={value} className={productView===value?'is-active':''} disabled={Boolean(busy)} onClick={()=>saveProductView(value)}>{label}</button>)}</div>
    </section>

    <section className="settings-feature-card">
      <header><div><ReceiptText size={16}/><span><strong>Invoice Prefixes</strong><small>Changes affect new receipts only.</small></span></div></header>
      <div className="invoice-prefix-grid">{[
        ['till','Till'],['delivery','Delivery'],['selfCheckout','Self-Checkout']
      ].map(([key,label])=><label key={key}><span>{label}</span><input maxLength={10} value={prefixes[key]} onChange={e=>setPrefixes(v=>({...v,[key]:e.target.value.toUpperCase()}))}/></label>)}</div>
      <footer><button className="module-primary-button" disabled={Boolean(busy)} onClick={savePrefixes}>Save Prefixes</button></footer>
    </section>

    <section className="settings-feature-card">
      <header><div><Hash size={16}/><span><strong>Inventory billing rule</strong><small>Company-wide and audited.</small></span></div><button type="button" className={`mac-switch ${negative?'is-on':''}`} disabled={Boolean(busy)} onClick={()=>changeNegative(!negative)}><span/></button></header>
      <p className="settings-feature-note">{negative?'Till may complete sales beyond recorded stock.':'Till blocks sales when recorded stock is insufficient.'}</p>
    </section>

    <section className="settings-feature-card">
      <header><div><LayoutGrid size={16}/><span><strong>Dock Quick Access</strong><small>Up to {DOCK_MAX} pages, kept in order.</small></span></div></header>
      <div className="dock-setting-selected">{dock.map((page,index)=><span key={page}>{page}<button disabled={index===0||Boolean(busy)} onClick={()=>moveDock(index,-1)}><ArrowUp size={11}/></button><button disabled={index===dock.length-1||Boolean(busy)} onClick={()=>moveDock(index,1)}><ArrowDown size={11}/></button><button disabled={Boolean(busy)} onClick={()=>saveDock(dock.filter(x=>x!==page))}><X size={11}/></button></span>)}</div>
      <div className="dock-setting-available">{DOCK_PAGE_OPTIONS.filter(page=>!dock.includes(page)).map(page=><button key={page} disabled={dock.length>=DOCK_MAX||Boolean(busy)} onClick={()=>saveDock([...dock,page])}><Plus size={11}/>{page}</button>)}</div>
    </section>

    <section className="settings-feature-card">
      <header><div><Monitor size={16}/><span><strong>Customer Display</strong><small>Second-screen bill mirror; Till remains source of truth.</small></span></div><button type="button" className={`mac-switch ${customerDisplay?'is-on':''}`} disabled={Boolean(busy)} onClick={()=>saveCustomerDisplay(!customerDisplay)}><span/></button></header>
      {customerDisplay?<footer><button onClick={()=>window.open(`${import.meta.env.BASE_URL || '/'}customer-display`,'onepos-customer-display-window','popup=yes,width=720,height=1080')}>Open Customer Display</button></footer>:null}
    </section>

    <section className="settings-feature-card">
      <header><div><ScanLine size={16}/><span><strong>Self-Checkout device pairing</strong><small>Per-store pairing key; raw key is shown once.</small></span></div></header>
      <div className="self-checkout-store-list">{stores.map(store=><div key={store.id}>
        <div><strong>{store.name}</strong><span>{selfKeys[store.id]?'Key generated — copy now.':'Generate or replace this store’s pairing key.'}</span></div>
        {selfKeys[store.id]?<code>{selfKeys[store.id]}</code>:null}
        <span className="self-checkout-actions">
          {selfKeys[store.id]?<button title="Copy key" onClick={()=>navigator.clipboard?.writeText(selfKeys[store.id])}><Copy size={12}/></button>:null}
          <button disabled={busy===`self-${store.id}`} onClick={()=>generateKey(store)}>{selfKeys[store.id]?'Regenerate':'Generate key'}</button>
          {selfKeys[store.id]?<button disabled={busy===`self-${store.id}`} onClick={()=>clearKey(store)}>Clear</button>:null}
        </span>
      </div>)}</div>
    </section>

    {storeEditor?<MetadataRecordFormModal objectKey="store" record={storeEditor} mode="edit" title="Edit Store" onClose={()=>setStoreEditor(null)} onSaved={async()=>{setStoreEditor(null);setMessage('Store updated.');await load()}}/>:null}
    {tillEditor?<TillEditor till={tillEditor} busy={busy===`till-${tillEditor.id}`} onClose={()=>setTillEditor(null)} onSave={saveTill}/>:null}
  </div>
}

function TillEditor({till,busy,onClose,onSave}){
  const [form,setForm]=useState({id:till.id,name:till.name||'',terminalNumber:till.terminalNumber||'',deviceIdentifier:till.deviceIdentifier||'',active:till.active!==false})
  return <div className="module-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&!busy&&onClose()}>
    <form className="module-modal till-editor-modal" onSubmit={e=>{e.preventDefault();void onSave(form)}}>
      <header><div><strong>Edit {till.name||'Till'}</strong><span>{till.storeName}</span></div><button type="button" onClick={onClose}><X size={16}/></button></header>
      <div className="module-modal-body till-editor-grid">
        <label className="module-input-label"><span>Name</span><input value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))}/></label>
        <label className="module-input-label"><span>Terminal number</span><input value={form.terminalNumber} onChange={e=>setForm(v=>({...v,terminalNumber:e.target.value}))}/></label>
        <label className="module-input-label till-editor-full"><span>Device identifier</span><input value={form.deviceIdentifier} onChange={e=>setForm(v=>({...v,deviceIdentifier:e.target.value}))}/></label>
        <label className="settings-toggle-line till-editor-full"><span>Active till</span><button type="button" className={`mac-switch ${form.active?'is-on':''}`} onClick={()=>setForm(v=>({...v,active:!v.active}))}><span/></button></label>
      </div>
      <footer className="module-modal-footer"><button type="button" onClick={onClose}>Cancel</button><button className="module-primary-button" disabled={busy}>{busy?'Saving…':'Save Till'}</button></footer>
    </form>
  </div>
}
