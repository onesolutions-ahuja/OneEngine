import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronRight, CircleAlert, PackageCheck, Search, ShoppingBag, Store, X } from 'lucide-react'
import { apiRequest } from '../../services/api'
import {
  filterStorePackages,
  installedPackageVersionState,
  packageDependencies,
  storefrontStatus,
} from './oneStoreModel'
import { appIconUrl, applyDefaultAppIcon, readMarketplaceCache, resolveAppOpenRoute, writeMarketplaceCache } from '../../utils/appMarketplace'

const STATUS_LABELS={
  AVAILABLE:'Available',INSTALLED:'Installed',INACTIVE:'Inactive',UPDATE_AVAILABLE:'Update available',
  LICENCE_REQUIRED:'Requires licence',NOT_INSTALLABLE:'Not installable',NOT_AVAILABLE:'Not available',
}

export default function OneStorePopover({onClose,onOpenRoute,initialPackages=[],initialSelectedPackageKey='',onPackagesChange,canManagePackages=false}){
  const [packages,setPackages]=useState(()=>Array.isArray(initialPackages)&&initialPackages.length?initialPackages:readMarketplaceCache())
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [query,setQuery]=useState('')
  const [view,setView]=useState('All')
  const [category,setCategory]=useState('All')
  const [selectedKey,setSelectedKey]=useState(()=>String(initialSelectedPackageKey||''))
  const [workingKey,setWorkingKey]=useState('')
  const canManage=canManagePackages

  const load=async({refreshCatalogue=false}={})=>{
    try{
      setLoading(true);setError('')
      const catalogue=await (refreshCatalogue||!packages.length?apiRequest('/api/packages/marketplace'):Promise.resolve({success:true,data:packages}))
      if(!catalogue?.success)throw new Error(catalogue?.message||'Unable to load oneStore')
      const nextPackages=Array.isArray(catalogue.data)?catalogue.data:[]
      setPackages(nextPackages)
      writeMarketplaceCache(nextPackages)
      onPackagesChange?.(nextPackages)
      return nextPackages
    }catch(err){
      const cached=readMarketplaceCache()
      if(cached.length){
        setPackages(cached)
        onPackagesChange?.(cached)
      }
      setError(err?.message||'Unable to load oneStore')
      return cached
    }finally{setLoading(false)}
  }
  useEffect(()=>{void load()},[])
  useEffect(()=>{if(Array.isArray(initialPackages)&&initialPackages.length){setPackages(initialPackages);writeMarketplaceCache(initialPackages)}},[initialPackages])
  useEffect(()=>{setSelectedKey(String(initialSelectedPackageKey||''))},[initialSelectedPackageKey])
  const hasPending=packages.some(item=>['QUEUED','UPDATING'].includes(String(item.company_installation?.update_status||'').toUpperCase()))
  useEffect(()=>{
    if(!hasPending)return undefined
    const timer=setInterval(()=>{void load()},5000)
    return()=>clearInterval(timer)
  },[hasPending])

  const categories=useMemo(()=>['All',...new Set(packages.filter(i=>i.visible===true&&i.system_only!==true).map(i=>i.category||'Uncategorised').sort())],[packages])
  const shown=useMemo(()=>filterStorePackages(packages,{search:query,category,view}),[packages,query,category,view])
  useEffect(()=>{
    if(!shown.length){if(selectedKey)setSelectedKey('');return}
    if(!shown.some(item=>item.package_key===selectedKey))setSelectedKey(shown[0].package_key)
  },[shown,selectedKey])
  const selected=shown.find(i=>i.package_key===selectedKey)||packages.find(i=>i.package_key===selectedKey)||shown[0]||null
  const dependencies=selected?packageDependencies(selected):[]
  const installedKeys=new Set(packages.filter(i=>i.company_installation).map(i=>i.package_key))

  const actionFor=item=>{
    const status=storefrontStatus(item)
    const installed=Boolean(item.company_installation)
    if(status==='LICENCE_REQUIRED')return item.licence_request_status==='PENDING'?{label:'Request Pending',disabled:true}:{label:'Request Licence',action:'request-licence'}
    if(status==='NOT_INSTALLABLE'||status==='NOT_AVAILABLE')return {label:STATUS_LABELS[status],disabled:true}
    if(status==='UPDATE_AVAILABLE'){
      const forced=String(item.company_installation?.auto_update_policy||item.auto_update_policy||'OPTIONAL').toUpperCase()==='FORCED'
      return forced?{label:'Forced update',disabled:true}:{label:'Update now',action:'upgrade'}
    }
    if(installed&&item.company_installation.status==='inactive')return {label:'Reinstall',action:'install'}
    if(installed)return {label:'Installed',disabled:true,secondary:'deactivate'}
    return {label:'Install',action:'install'}
  }

  const run=async(item,action)=>{
    if(!item?.package_key||!canManage)return
    try{
      setWorkingKey(item.package_key);setError('');setNotice('')
      const key=encodeURIComponent(item.package_key)
      if(action==='trial'){
        const r=await apiRequest(`/api/packages/${key}/activate-trial`,{method:'POST'})
        if(r?.success===false)throw new Error(r?.message||'Unable to activate free trial')
        setNotice(`7-day free trial activated for ${item.name}. Install is now available.`)
      }else if(action==='request-licence'){
        const r=await apiRequest(`/api/packages/${key}/request-licence`,{method:'POST'})
        if(r?.success===false)throw new Error(r?.message||'Unable to request licence')
        setNotice('Licence request sent.')
      }else if(action==='upgrade'){
        const r=await apiRequest(`/api/packages/${key}/upgrade`,{method:'POST'})
        if(r?.success===false)throw new Error(r?.message||'Unable to update app')
        setNotice(`${item.name} update queued.`)
      }else{
        const endpoint=action==='install'?'install':action==='activate'?'reactivate':action==='uninstall'?'uninstall':'deactivate'
        const r=await apiRequest(`/api/packages/${key}/${endpoint}`,{method:'POST'})
        if(r?.success===false)throw new Error(r?.message||`Unable to ${action} app`)
        setNotice(action==='install'?`${item.name} installed.`:action==='activate'?`${item.name} activated.`:action==='uninstall'?`${item.name} uninstalled. Existing data and configuration were preserved.`:`${item.name} deactivated.`)
      }
      await load({refreshCatalogue:true})
    }catch(err){setError(err?.message||'Package action failed')}
    finally{setWorkingKey('')}
  }

  const version=selected?.company_installation?installedPackageVersionState(selected):null
  const selectedAction=selected?actionFor(selected):null
  const openInstalled=()=>{
    if(!selected?.company_installation)return
    const route=resolveAppOpenRoute(selected)
    onOpenRoute?.(route)
    onClose?.()
  }

  return <div className="mac-popover onestore-popover">
    <header className="onestore-popover-header">
      <div><strong>oneStore</strong><span>Discover and manage company apps</span></div>
      <button type="button" aria-label="Close oneStore" onClick={onClose}><X size={15}/></button>
    </header>
    <label className="onestore-search"><Search size={13}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search apps"/></label>
    {error?<div className="onestore-message is-error"><CircleAlert size={13}/><span>{error}</span><button type="button" onClick={()=>load({refreshCatalogue:true})}>Retry</button></div>:null}
    {notice?<div className="onestore-message is-success"><Check size={13}/>{notice}</div>:null}

    <div className="onestore-filters">
      {['All','Installed','Available'].map(v=><button key={v} className={view===v?'is-active':''} onClick={()=>setView(v)}>{v}</button>)}
      <select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(v=><option key={v}>{v}</option>)}</select>
    </div>

    <div className="onestore-layout">
      <section className="onestore-list">
        {loading?<div className="module-state compact">Loading apps…</div>:!shown.length?<div className="module-state compact">No apps match.</div>:shown.map(item=>{
          const icon=appIconUrl(item),status=storefrontStatus(item)
          return <button key={item.package_key} className={selected?.package_key===item.package_key?'is-selected':''} onClick={()=>setSelectedKey(item.package_key)}>
            <span className="onestore-app-icon">{icon?<img src={icon} alt="" onError={applyDefaultAppIcon}/>:<ShoppingBag size={17}/>}</span>
            <span><strong>{item.name}</strong><small>{item.category||'App'} · {STATUS_LABELS[status]}</small></span>
            <ChevronRight size={13}/>
          </button>
        })}
      </section>

      <aside className="onestore-detail">
        {!selected?<div className="module-state compact">Select an app.</div>:<>
          <div className="onestore-detail-title">
            <span className="onestore-app-icon large">{appIconUrl(selected)?<img src={appIconUrl(selected)} alt="" onError={applyDefaultAppIcon}/>:<Store size={20}/>}</span>
            <div><strong>{selected.name}</strong><span>{selected.publisher||'onePOS'}</span></div>
          </div>
          <p>{selected.description||'No description available.'}</p>
          <div className="onestore-badges"><span>{STATUS_LABELS[storefrontStatus(selected)]}</span><span>{selected.category||'Uncategorised'}</span></div>
          <dl><div><dt>Version</dt><dd>{selected.version||'—'}</dd></div><div><dt>Package</dt><dd>{selected.package_type||'APPLICATION'}</dd></div><div><dt>Licence</dt><dd>{selected.licence_mode==='TECHNICAL'||selected.licensed?'Included':'Required'}</dd></div><div><dt>Availability</dt><dd>{selected.billable===false?'Included':selected.licensed?'Available':'Requires licence'}</dd></div></dl>
          {version?<div className="onestore-version"><span>Installed v{version.installedVersion}</span><span>Latest v{version.latestVersion}</span><strong>{version.label}</strong></div>:null}
          {dependencies.length?<div className="onestore-deps"><b>Dependencies</b>{dependencies.map(dep=><div key={dep.key}><span>{packages.find(p=>p.package_key===dep.key)?.name||dep.key}</span><small>{installedKeys.has(dep.key)?'Included':'Installed automatically'}{dep.optional?' · Optional':''}</small></div>)}</div>:null}
          {workingKey===selected.package_key?<progress className="onestore-action-progress" aria-label="App action in progress"/>:null}
          <div className="onestore-actions">
            {selectedAction?.secondary?<button disabled={!canManage||workingKey===selected.package_key} onClick={()=>run(selected,selectedAction.secondary)}>Deactivate</button>:null}
            {selected?.company_installation?.status==='active'?<button disabled={!canManage||workingKey===selected.package_key} onClick={()=>run(selected,'uninstall')}>Uninstall</button>:null}
            {selected?.company_installation&&storefrontStatus(selected)==='INSTALLED'?<button onClick={openInstalled}>Open</button>:null}
            {selected?.trial_available===true?<button className="module-primary-button" disabled={!canManage||workingKey===selected.package_key} onClick={()=>run(selected,'trial')}>{workingKey===selected.package_key?'Working…':`Free ${selected.trial_days||7}-day trial`}</button>:null}
            {selectedAction?.action?<button className="module-primary-button" disabled={selectedAction.disabled||!canManage||workingKey===selected.package_key} onClick={()=>run(selected,selectedAction.action)}>{workingKey===selected.package_key?'Working…':selectedAction.label}</button>:selectedAction?.label?<button disabled>{selectedAction.label}</button>:null}
          </div>
          {!canManage&&selectedAction?.action?<small className="onestore-no-permission">Package management permission is required.</small>:null}
        </>}
      </aside>
    </div>
  </div>
}
