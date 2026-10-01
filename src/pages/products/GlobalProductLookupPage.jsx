import { useEffect, useState } from 'react'
import { Check, KeyRound, LoaderCircle, Plus, Search, Wifi, X } from 'lucide-react'
import { apiRequest } from '../../services/api'
import { ProductEditor } from './ProductsPage'

const DEFAULT_PROVIDER={enabled:true,priority:100,timeoutMs:5000,fallbackEnabled:true,cacheTtlSeconds:5}

export default function GlobalProductLookupPage({onBack,onOpenStore}){
  const [providers,setProviders]=useState([])
  const [categories,setCategories]=useState([])
  const [lookupMode,setLookupMode]=useState('barcode')
  const [barcode,setBarcode]=useState('')
  const [searchText,setSearchText]=useState('')
  const [result,setResult]=useState(null)
  const [searchResults,setSearchResults]=useState([])
  const [loading,setLoading]=useState(false)
  const [settingsLoading,setSettingsLoading]=useState(true)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [apiKeys,setApiKeys]=useState({})
  const [savingProvider,setSavingProvider]=useState('')
  const [testingProvider,setTestingProvider]=useState('')
  const [preset,setPreset]=useState(null)

  const loadSettings=async()=>{
    try{
      setSettingsLoading(true);setError('')
      const [p,c]=await Promise.all([apiRequest('/api/global-products/providers'),apiRequest('/api/categories')])
      if(!p?.success)throw new Error(p?.message||'Unable to load providers')
      setProviders(Array.isArray(p.data)?p.data:[])
      setCategories(Array.isArray(c?.data)?c.data:[])
    }catch(err){setError(err?.message||'Unable to load Product Lookup settings')}
    finally{setSettingsLoading(false)}
  }
  useEffect(()=>{void loadSettings()},[])

  const lookup=async(e)=>{
    e.preventDefault()
    if(settingsLoading){
      setError('Product lookup providers are still loading. Please wait a moment and retry.')
      return
    }
    if(providerMissing){
      setError('Install and enable a Global Product Lookup provider before searching.')
      return
    }
    try{
      setLoading(true);setError('');setNotice('');setResult(null);setSearchResults([])
      if(lookupMode==='barcode'){
        if(!barcode.trim())return
        const r=await apiRequest('/api/global-products/lookup',{method:'POST',body:JSON.stringify({barcode:barcode.trim()})})
        if(!r?.success)throw new Error(r?.message||'Product lookup failed')
        setResult(r.data)
      }else{
        const q=searchText.trim()
        if(q.length<2)return
        const r=await apiRequest(`/api/global-products/search?q=${encodeURIComponent(q)}&pageSize=24`)
        if(!r?.success)throw new Error(r?.message||'Product search failed')
        setResult(r.data)
        setSearchResults(Array.isArray(r.data?.products)?r.data.products:[])
      }
    }catch(err){setError(err?.message||'Unable to search the worldwide product database')}
    finally{setLoading(false)}
  }

  const setProviderField=(key,field,value)=>setProviders(list=>list.map(p=>p.providerKey===key?{...p,[field]:value}:p))
  const saveProvider=async(provider)=>{
    try{
      setSavingProvider(provider.providerKey);setError('');setNotice('')
      const r=await apiRequest(`/api/global-products/providers/${encodeURIComponent(provider.providerKey)}`,{
        method:'PATCH',
        body:JSON.stringify({
          enabled:provider.enabled,
          priority:provider.priority,
          timeoutMs:provider.timeoutMs,
          fallbackEnabled:provider.fallbackEnabled,
          cacheTtlSeconds:provider.cacheTtlSeconds,
          ...(provider.configurableFields?.includes('baseUrl')?{baseUrl:provider.baseUrl}:{}),
          ...(provider.configurableFields?.includes('userAgent')?{userAgent:provider.userAgent}:{}),
          ...(provider.requiresApiKey&&apiKeys[provider.providerKey]?{apiKey:apiKeys[provider.providerKey]}:{}),
        })
      })
      if(!r?.success)throw new Error(r?.message||'Unable to save provider settings')
      setProviders(list=>list.map(p=>p.providerKey===provider.providerKey?r.data:p))
      setApiKeys(keys=>({...keys,[provider.providerKey]:''}))
      setNotice(`${provider.displayName} settings saved.`)
    }catch(err){setError(err?.message||'Unable to save provider settings')}
    finally{setSavingProvider('')}
  }
  const testProvider=async(provider)=>{
    try{
      setTestingProvider(provider.providerKey);setError('');setNotice('')
      const r=await apiRequest(`/api/global-products/providers/${encodeURIComponent(provider.providerKey)}/test`,{method:'POST',body:'{}'})
      if(!r?.success)throw new Error(r?.message||'Provider connection test failed')
      setNotice(`${provider.displayName} connection succeeded.`)
    }catch(err){setError(err?.message||'Provider connection test failed')}
    finally{setTestingProvider('')}
  }

  const addToCatalogue=(product)=>{
    const category=categories.find(c=>String(c.name||'').toLowerCase()===String(product.category||'').toLowerCase())
    setPreset({
      name:product.name||'',
      barcode:product.barcode||'',
      description:product.description||'',
      categoryId:category?.id||'',
      imageUrl:product.imageUrl||'',
      brand:product.brand||'',
      quantity:product.quantity||'',
      sourceProvider:product.sourceProvider,
    })
  }

  const availableProviders=providers.filter(p=>p.installed&&p.licensed&&p.enabled)
  const providerMissing=!settingsLoading&&availableProviders.length===0

  return <section className="module-page global-product-page">
    <header className="module-page-header">
      <div><span>Catalogue</span><h1>Global Product Lookup</h1><p>Search worldwide products by barcode or product name, then add the result to your company catalogue.</p></div>
      <div className="module-header-actions">{onBack?<button onClick={onBack}>Back to Products</button>:null}</div>
    </header>

    {notice?<div className="module-success module-page-message"><strong>{notice}</strong></div>:null}
    {error?<div className="module-inline-error module-page-message">{error}</div>:null}

    <section className="module-panel global-lookup-panel">
      <form onSubmit={lookup} className="global-lookup-form">
        <label className="module-input-label"><span>Search by</span><select value={lookupMode} onChange={e=>{setLookupMode(e.target.value);setResult(null);setSearchResults([]);setError('')}}><option value="barcode">Barcode / EAN / UPC / GTIN</option><option value="name">Product name / brand</option></select></label>
        {lookupMode==='barcode'
          ?<label className="module-input-label"><span>Barcode</span><input inputMode="numeric" autoComplete="off" value={barcode} maxLength={20} onChange={e=>setBarcode(e.target.value)} placeholder="Scan or enter EAN, UPC or GTIN"/></label>
          :<label className="module-input-label"><span>Product search</span><input autoComplete="off" value={searchText} maxLength={120} onChange={e=>setSearchText(e.target.value)} placeholder="e.g. Nutella, Haribo, Coca-Cola"/></label>}
        <button className="module-primary-button" type="submit" disabled={loading||settingsLoading||providerMissing||(lookupMode==='barcode'?!barcode.trim():searchText.trim().length<2)}>{loading?<LoaderCircle size={14}/>:settingsLoading?<LoaderCircle size={14}/>:<Search size={14}/>} {loading?'Searching…':settingsLoading?'Loading providers…':'Search worldwide'}</button>
      </form>
      <div className="module-state" style={{paddingTop:8,paddingBottom:8}}>Worldwide scope — no UK or Europe-only restriction. Open Food Facts does not require an API key for read/search access.</div>

      {providerMissing?<div className="module-state global-provider-missing">No Global Product Lookup provider is installed and enabled.{onOpenStore?<button type="button" onClick={onOpenStore}>Browse oneStore</button>:null}</div>:null}

      {result?.status==='not_found'?<div className="module-state">No provider found a Product for this barcode.</div>:null}
      {result?.status==='unavailable'?<div className="module-inline-error">Product Lookup providers are temporarily unavailable.</div>:null}
      {lookupMode==='name'&&result?.status==='not_found'?<div className="module-state">No matching products were found in the worldwide database.</div>:null}
      {lookupMode==='name'&&searchResults.length?<div className="global-product-search-results">{searchResults.map(product=><div className="global-product-result" key={`${product.sourceProvider}:${product.barcode}`}>
        {product.imageUrl?<img src={product.imageUrl} alt="" />:null}
        <div><strong>{product.name}</strong><span>{[product.brand,product.quantity].filter(Boolean).join(' · ')}</span><small>Barcode {product.barcode} · {[product.country,product.sourceProvider&&String(product.sourceProvider).replaceAll('_',' ')].filter(Boolean).join(' · ')}</small>{product.category?<small>{product.category}</small>:null}</div>
        <button className="module-primary-button" type="button" onClick={()=>addToCatalogue(product)}><Plus size={14}/> Add to company catalogue</button>
      </div>)}</div>:null}
      {result?.status==='found'?<div className="global-product-result">
        {result.product.imageUrl?<img src={result.product.imageUrl} alt="" />:null}
        <div><strong>{result.product.name}</strong><span>{[result.product.brand,result.product.variant,result.product.quantity].filter(Boolean).join(' · ')}</span><small>Barcode {result.product.barcode} · Source {String(result.product.sourceProvider||'').replaceAll('_',' ')}</small>{result.product.description?<p>{result.product.description}</p>:null}{result.product.category?<small>{result.product.category}</small>:null}</div>
        <button className="module-primary-button" type="button" onClick={()=>addToCatalogue(result.product)}><Plus size={14}/> Add to company catalogue</button>
      </div>:null}
    </section>

    <section className="module-panel global-provider-panel">
      <header className="module-card-header"><strong>Provider settings</strong><span>{providers.length} providers</span></header>
      {settingsLoading?<div className="module-state">Loading provider settings…</div>:<div className="global-provider-list">{providers.map(provider=><article key={provider.providerKey}>
        <div className="global-provider-heading"><div><strong>{provider.displayName}</strong><span>{provider.installed&&provider.licensed?'Installed':'Not installed'}{provider.requiresApiKey?` · ${provider.configured?'Key configured':'Not configured'}`:''}</span></div><div>
          <button type="button" disabled={!provider.installed||!provider.licensed||testingProvider===provider.providerKey} onClick={()=>testProvider(provider)}>{testingProvider===provider.providerKey?<LoaderCircle size={13}/>:<Wifi size={13}/>} Test</button>
          <button type="button" disabled={!provider.installed||!provider.licensed||savingProvider===provider.providerKey} onClick={()=>saveProvider(provider)}>{savingProvider===provider.providerKey?<LoaderCircle size={13}/>:<Check size={13}/>} Save</button>
        </div></div>
        <div className="global-provider-grid">
          <label className="global-provider-toggle"><span>Enabled</span><button type="button" className={`mac-switch ${provider.enabled?'is-on':''}`} onClick={()=>setProviderField(provider.providerKey,'enabled',!provider.enabled)}><span/></button></label>
          <label className="module-input-label"><span>Priority</span><input type="number" min="1" max="9999" value={provider.priority??DEFAULT_PROVIDER.priority} onChange={e=>setProviderField(provider.providerKey,'priority',Number(e.target.value))}/></label>
          <label className="module-input-label"><span>Timeout (ms)</span><input type="number" min="500" max="30000" step="500" value={provider.timeoutMs??DEFAULT_PROVIDER.timeoutMs} onChange={e=>setProviderField(provider.providerKey,'timeoutMs',Number(e.target.value))}/></label>
          <label className="module-input-label"><span>Cache TTL</span><input type="number" min="0" max="86400" value={provider.cacheTtlSeconds??DEFAULT_PROVIDER.cacheTtlSeconds} onChange={e=>setProviderField(provider.providerKey,'cacheTtlSeconds',Number(e.target.value))}/></label>
          <label className="global-provider-toggle"><span>Fallback</span><button type="button" className={`mac-switch ${provider.fallbackEnabled!==false?'is-on':''}`} onClick={()=>setProviderField(provider.providerKey,'fallbackEnabled',provider.fallbackEnabled===false)}><span/></button></label>
        </div>
        {provider.configurableFields?.includes('baseUrl')?<label className="module-input-label"><span>API base URL</span><input value={provider.baseUrl||''} onChange={e=>setProviderField(provider.providerKey,'baseUrl',e.target.value)}/></label>:null}
        {provider.configurableFields?.includes('userAgent')?<label className="module-input-label"><span>User-Agent identification</span><input value={provider.userAgent||''} onChange={e=>setProviderField(provider.providerKey,'userAgent',e.target.value)}/></label>:null}
        {provider.requiresApiKey?<label className="module-input-label global-provider-key"><span>{provider.displayName} API key</span><div><KeyRound size={13}/><input type="password" autoComplete="new-password" value={apiKeys[provider.providerKey]||''} onChange={e=>setApiKeys(keys=>({...keys,[provider.providerKey]:e.target.value}))} placeholder={provider.configured?'Enter a new key to replace saved key':'Enter your customer API key'}/></div></label>:null}
      </article>)}</div>}
    </section>

    {preset?<ProductEditor mode="create" product={null} preset={preset} categories={categories} onClose={()=>setPreset(null)} onSaved={()=>{setPreset(null);setNotice('Product added to your company catalogue.')}}/>:null}
  </section>
}
