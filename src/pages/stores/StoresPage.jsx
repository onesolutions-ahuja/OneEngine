import { useEffect, useMemo, useState } from 'react'
import { Archive, Edit3, MapPin, Phone, Plus, RefreshCw, RotateCcw, Store } from 'lucide-react'
import { apiRequest } from '../../services/api'
import { cachedGet } from '../../services/cachedApi'
import MetadataRecordFormModal from '../../components/MetadataRecordFormModal'

function money(value,currency='GBP'){
  const n=Number(value||0)
  try{return new Intl.NumberFormat(undefined,{style:'currency',currency,maximumFractionDigits:2}).format(n)}
  catch{return `${n.toFixed(2)} ${currency}`}
}

export default function StoresPage(){
  const [stores,setStores]=useState([])
  const [stats,setStats]=useState({})
  const [currency,setCurrency]=useState('GBP')
  const [permissions,setPermissions]=useState([])
  const [isAdmin,setIsAdmin]=useState(false)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [showArchived,setShowArchived]=useState(false)
  const [editor,setEditor]=useState(null)

  const load=async(forceRefresh=false)=>{
    try{
      setLoading(true);setError('')
      const [s,p,settings]=await Promise.all([
        cachedGet('/api/admin/stores',{forceRefresh,onFresh:fresh=>fresh?.success&&setStores(Array.isArray(fresh.data)?fresh.data:[])}),
        apiRequest('/api/auth/me/permissions').catch(()=>null),
        cachedGet('/api/settings',{cacheKey:'settings:company',forceRefresh,onFresh:fresh=>fresh?.data?.company?.currency&&setCurrency(fresh.data.company.currency)}).catch(()=>null),
      ])
      if(!s?.success)throw new Error(s?.message||'Unable to load stores')
      const rows=Array.isArray(s.data)?s.data:[]
      setStores(rows)
      setPermissions(p?.data?.permissions||[])
      setIsAdmin(p?.data?.isAdmin===true)
      setCurrency(settings?.data?.company?.currency||'GBP')
      const entries=await Promise.all(rows.map(store=>
        apiRequest(`/api/admin/stores/${encodeURIComponent(store.id)}/stats`)
          .then(r=>[store.id,r?.success?r.data:null])
          .catch(()=>[store.id,null])
      ))
      setStats(Object.fromEntries(entries))
    }catch(err){setError(err?.message||'Unable to load stores')}
    finally{setLoading(false)}
  }
  useEffect(()=>{void load()},[])

  const canCreate=isAdmin||permissions.includes('store.create')
  const canEdit=isAdmin||permissions.includes('store.edit')
  const canDelete=isAdmin||permissions.includes('store.delete')
  const active=stores.filter(s=>s.active!==false)
  const archived=stores.filter(s=>s.active===false)
  const visible=showArchived?stores:active

  const setActive=async(store,next)=>{
    try{
      setError('')
      const r=await apiRequest(`/api/platform/objects/store/records/${encodeURIComponent(store.id)}`,{
        method:'PUT',
        body:JSON.stringify({data:{active:next}})
      })
      if(r?.success===false)throw new Error(r?.message||'Unable to update store')
      await load(true)
    }catch(err){setError(err?.message||'Unable to update store')}
  }

  return <section className="module-page stores-page">
    <header className="module-page-header">
      <div><span>Locations</span><h1>Stores</h1><p>{stores.length} configured · {active.length} active</p></div>
      <div className="module-header-actions">
        {archived.length?<button onClick={()=>setShowArchived(v=>!v)}><Archive size={14}/>{showArchived?'Hide archived':`Show archived (${archived.length})`}</button>:null}
        <button onClick={()=>load(true)}><RefreshCw size={14}/> Refresh</button>
        {canCreate?<button className="module-primary-button" onClick={()=>setEditor({mode:'create',record:null})}><Plus size={14}/> Add Store</button>:null}
      </div>
    </header>

    {error?<div className="module-inline-error module-page-message">{error}</div>:null}

    {loading?<section className="module-page-card"><div className="module-state">Loading stores…</div></section>
      :!visible.length?<section className="module-page-card"><div className="module-state">{stores.length?'No active stores.':'No stores yet.'}</div></section>
      :<div className="store-card-grid">{visible.map(store=>{
        const stat=stats[store.id],activeStore=store.active!==false
        return <article className={`store-card ${activeStore?'':'is-inactive'}`} key={store.id}>
          <header><div className="store-card-icon"><Store size={17}/></div><div><strong>{store.name}</strong><span>{store.code||'No code'}</span></div><em>{activeStore?'Active':'Inactive'}</em></header>
          <div className="store-card-stats">
            <div><strong>{stat?money(stat.today_sales,currency):'—'}</strong><span>Today’s sales</span></div>
            <div><strong>{stat?Number(stat.today_transactions||0):'—'}</strong><span>Transactions</span></div>
            <div><strong>{stat?Number(stat.low_stock_count||0):'—'}</strong><span>Low stock</span></div>
          </div>
          {(store.address_line1||store.city||store.postcode||store.phone)?<div className="store-card-meta">
            {(store.address_line1||store.city||store.postcode)?<span><MapPin size={12}/>{[store.address_line1,store.city,store.postcode].filter(Boolean).join(', ')}</span>:null}
            {store.phone?<span><Phone size={12}/>{store.phone}</span>:null}
          </div>:null}
          {(canEdit||canDelete)?<footer>
            {canEdit?<button onClick={()=>setEditor({mode:'edit',record:store})}><Edit3 size={12}/> Edit</button>:null}
            {canDelete?<button onClick={()=>setActive(store,!activeStore)}>{activeStore?<><Archive size={12}/> Deactivate</>:<><RotateCcw size={12}/> Restore</>}</button>:null}
          </footer>:null}
        </article>
      })}</div>}

    {editor?<MetadataRecordFormModal
      objectKey="store"
      record={editor.record}
      mode={editor.mode}
      title={editor.mode==='create'?'Add Store':'Edit Store'}
      onClose={()=>setEditor(null)}
      onSaved={async()=>{setEditor(null);await load(true)}}
    />:null}
  </section>
}
