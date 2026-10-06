import { useEffect, useState } from 'react'
import { Barcode, Check, ChevronRight, Globe2, KeyRound, LoaderCircle, PackageSearch, Plus, Search, Settings2, Wifi, X } from 'lucide-react'
import { apiRequest } from '../../services/api'
import { loadRuntimeSurface, mapRuntimePayload, mappedRecordValue, runtimeEndpoint } from '../../services/runtimeSurface'
import MetadataRecordFormModal from '../../platform/forms/MetadataRecordFormModal'

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
  const [changingDefault,setChangingDefault]=useState(false)
  const [preset,setPreset]=useState(null)
  const [manageProviders,setManageProviders]=useState(false)
  const [previewProduct,setPreviewProduct]=useState(null)
  const [runtimeSurface,setRuntimeSurface]=useState(null)

  const loadSettings=async()=>{
    try{
      setSettingsLoading(true);setError('')
      const surface=await loadRuntimeSurface('products','globalLookup')
      setRuntimeSurface(surface)
      const categoryObject=String(surface?.objects?.category||'')
      const providersPath=runtimeEndpoint(surface,'providers')
      if(!categoryObject||!providersPath)throw new Error('Product lookup runtime metadata is incomplete')
      const [p,c]=await Promise.all([
        apiRequest(providersPath),
        apiRequest(`/api/platform/objects/${encodeURIComponent(categoryObject)}/records?active=true`)
      ])
      if(!p?.success)throw new Error(p?.message||'Unable to load providers')
      setProviders(Array.isArray(p.data)?p.data:[])
      setCategories(Array.isArray(c?.data?.records)?c.data.records:Array.isArray(c?.records)?c.records:Array.isArray(c?.data)?c.data:[])
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
        const r=await apiRequest(runtimeEndpoint(runtimeSurface,'lookup'),{method:'POST',body:JSON.stringify({barcode:barcode.trim(),providerKey:activeProvider?.providerKey||null})})
        if(!r?.success)throw new Error(r?.message||'Product lookup failed')
        setResult(r.data)
      }else{
        const q=searchText.trim()
        if(q.length<2)return
        const searchPath=runtimeEndpoint(runtimeSurface,'search'); const r=await apiRequest(`${searchPath}?q=${encodeURIComponent(q)}&pageSize=24&providerKey=${encodeURIComponent(activeProvider?.providerKey||'')}`)
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
      const r=await apiRequest(runtimeEndpoint(runtimeSurface,'provider',{providerKey:provider.providerKey}),{
        method:'PATCH',
        body:JSON.stringify({
          enabled:provider.enabled,
          priority:provider.priority,
          timeoutMs:provider.timeoutMs,
          fallbackEnabled:provider.fallbackEnabled,
          cacheTtlSeconds:provider.cacheTtlSeconds,
          ...(provider.configurableFields?.includes('baseUrl')?{baseUrl:provider.baseUrl}:{}),
          ...(provider.configurableFields?.includes('userAgent')?{userAgent:provider.userAgent}:{}),
          ...(provider.acceptsApiKey&&apiKeys[provider.providerKey]?{apiKey:apiKeys[provider.providerKey]}:{}),
        })
      })
      if(!r?.success)throw new Error(r?.message||'Unable to save provider settings')
      setProviders(list=>list.map(p=>p.providerKey===provider.providerKey?r.data:p))
      setApiKeys(keys=>({...keys,[provider.providerKey]:''}))
      setNotice(`${provider.displayName} settings saved.`)
    }catch(err){setError(err?.message||'Unable to save provider settings')}
    finally{setSavingProvider('')}
  }
  const makeDefaultProvider=async(providerKey)=>{
    try{
      setChangingDefault(true);setError('');setNotice('')
      const r=await apiRequest(runtimeEndpoint(runtimeSurface,'defaultProvider'),{
        method:'PATCH',
        body:JSON.stringify({providerKey})
      })
      if(!r?.success)throw new Error(r?.message||'Unable to change default provider')
      setProviders(list=>list.map(p=>({...p,isDefault:p.providerKey===providerKey})))
      const selected=providers.find(p=>p.providerKey===providerKey)
      setNotice(`${selected?.displayName||'Provider'} is now the default lookup provider.`)
    }catch(err){setError(err?.message||'Unable to change default provider')}
    finally{setChangingDefault(false)}
  }

  const testProvider=async(provider)=>{
    try{
      setTestingProvider(provider.providerKey);setError('');setNotice('')
      const r=await apiRequest(runtimeEndpoint(runtimeSurface,'providerTest',{providerKey:provider.providerKey}),{method:'POST',body:'{}'})
      if(!r?.success)throw new Error(r?.message||'Provider connection test failed')
      setNotice(`${provider.displayName} connection succeeded.`)
    }catch(err){setError(err?.message||'Provider connection test failed')}
    finally{setTestingProvider('')}
  }

  const addToCatalogue=(product)=>{
    const categoryMap=runtimeSurface?.recordMappings?.category||{}
    const productMap=runtimeSurface?.recordMappings?.lookupProduct||{}
    const categoryName=(row)=>mappedRecordValue(row,categoryMap,'name','')
    const categoryId=(row)=>mappedRecordValue(row,categoryMap,'id','')
    const category=categories.find(row=>String(categoryName(row)).toLowerCase()===String(product.category||'').toLowerCase())
    setPreset(mapRuntimePayload(productMap,{
      name:product.name||'',
      barcode:product.barcode||'',
      description:product.description||'',
      category:categoryId(category)||'',
      imageUrl:product.imageUrl||'',
      brand:product.brand||'',
      quantity:product.quantity||'',
      sourceProvider:product.sourceProvider||'',
    }))
  }

  const availableProviders=providers.filter(p=>p.installed&&p.licensed&&p.enabled)
  const usableProviders=availableProviders.filter(p=>!p.requiresApiKey||p.configured)
  const activeProvider=usableProviders.find(p=>p.isDefault)||usableProviders[0]||null
  const providerMissing=!settingsLoading&&usableProviders.length===0
  const selectedProviderCannotSearch=lookupMode==='name'&&activeProvider&&activeProvider.supportsSearch===false
  const displayResults=lookupMode==='name'
    ? searchResults
    : result?.status==='found'&&result?.product
      ? [result.product]
      : []
  const visibleQuery=lookupMode==='barcode'?barcode.trim():searchText.trim()
  const providerLabel=(provider)=>String(provider?.displayName||provider?.providerKey||'Provider').replaceAll('_',' ')
  const exampleSearches=['Coca-Cola','Nutella','Haribo','Red Bull','Nivea','Heineken']

  return <section className="module-page global-product-page">
    <section className="global-search-hero">
      <div className="global-search-hero-copy">
        <div className="global-search-icon"><Globe2 size={28}/></div>
        <div>
          <span>CATALOGUE</span>
          <h1>Global Product Search</h1>
          <p>Search millions of products worldwide by barcode or product name, then add them to your company catalogue.</p>
        </div>
        {onBack?<button className="global-back-button" type="button" onClick={onBack}>Back to Products</button>:null}
      </div>

      <form onSubmit={lookup} className="global-search-bar">
        <div className="global-search-input">
          {lookupMode==='barcode'?<Barcode size={19}/>:<Search size={19}/>}
          <input
            inputMode={lookupMode==='barcode'?'numeric':'search'}
            autoComplete="off"
            value={lookupMode==='barcode'?barcode:searchText}
            maxLength={lookupMode==='barcode'?20:120}
            onChange={e=>lookupMode==='barcode'?setBarcode(e.target.value):setSearchText(e.target.value)}
            placeholder={lookupMode==='barcode'?'Scan barcode or enter EAN, UPC or GTIN…':'Search product name, brand or keyword…'}
          />
        </div>
        <select
          className="global-search-mode"
          value={lookupMode}
          onChange={e=>{setLookupMode(e.target.value);setResult(null);setSearchResults([]);setError('')}}
          aria-label="Search mode"
        >
          <option value="name">Product name</option>
          <option value="barcode">Barcode</option>
        </select>
        <button
          className="global-search-submit"
          type="submit"
          disabled={loading||settingsLoading||providerMissing||selectedProviderCannotSearch||(lookupMode==='barcode'?!barcode.trim():searchText.trim().length<2)}
        >
          {loading||settingsLoading?<LoaderCircle size={16} className="spin"/>:<Search size={16}/>}
          {loading?'Searching…':settingsLoading?'Loading…':'Search'}
        </button>
      </form>

      <div className="global-search-examples">
        <span>Examples:</span>
        {exampleSearches.map(item=><button key={item} type="button" onClick={()=>{setLookupMode('name');setSearchText(item);setResult(null);setSearchResults([])}}>{item}</button>)}
      </div>
    </section>

    {notice?<div className="module-success module-page-message"><strong>{notice}</strong></div>:null}
    {error?<div className="module-inline-error module-page-message">{error}</div>:null}

    <section className="global-provider-strip">
      <div className="global-provider-strip-left">
        <strong>Active providers:</strong>
        {usableProviders.length
          ? usableProviders.map(provider=><span className="global-provider-pill" key={provider.providerKey}><i/>{providerLabel(provider)}</span>)
          : <span className="global-provider-empty">No provider installed</span>}
      </div>
      <button type="button" className="global-manage-link" onClick={()=>setManageProviders(value=>!value)}>
        <Settings2 size={16}/>
        {manageProviders?'Hide provider settings':'Manage providers'}
        <ChevronRight size={15} className={manageProviders?'is-open':''}/>
      </button>
    </section>

    {providerMissing?<section className="global-provider-empty-state">
      <div className="global-provider-empty-icon"><PackageSearch size={24}/></div>
      <div>
        <strong>Install a product lookup provider to search worldwide</strong>
        <span>Choose Open Food Facts, UPCitemdb, Go-UPC or another compatible provider.</span>
      </div>
      {onOpenStore?<button type="button" onClick={onOpenStore}>Browse oneStore</button>:null}
    </section>:null}

    {selectedProviderCannotSearch?<div className="module-inline-error module-page-message">The selected provider supports barcode lookup only. Switch to Barcode or choose a provider with product-name search support.</div>:null}

    <section className="global-results-panel">
      <header className="global-results-header">
        <div>
          <h2>Search Results</h2>
          <p>{visibleQuery?<>Showing results for <strong>“{visibleQuery}”</strong></>:<>Search by product name or scan a barcode to begin.</>}</p>
        </div>
        {displayResults.length?<span>{displayResults.length} result{displayResults.length===1?'':'s'}</span>:null}
      </header>

      {result?.status==='not_found'?<div className="global-results-state">No matching product was found.</div>:null}
      {result?.status==='unavailable'?<div className="module-inline-error">
        <strong>{activeProvider?.displayName||'Product provider'} could not complete the request.</strong>
        {Array.isArray(result?.providerErrors)&&result.providerErrors.length?<ul>{result.providerErrors.map((item,index)=><li key={`${item.provider}-${index}`}>{item.message||item.code||'Provider request failed'}</li>)}</ul>:null}
      </div>:null}
      {!displayResults.length&&result?.status!=='not_found'&&result?.status!=='unavailable'
        ? <div className="global-results-state">
            <Globe2 size={30}/>
            <strong>Worldwide product catalogue</strong>
            <span>Search results will appear here as clean product cards.</span>
          </div>
        : null}

      {displayResults.length?<div className="global-product-grid">
        {displayResults.map((product,index)=><article className="global-product-card" key={`${product.sourceProvider||'provider'}:${product.barcode||product.name||index}`}>
          <div className="global-product-image">
            {product.imageUrl?<img src={product.imageUrl} alt="" />:<PackageSearch size={34}/>}
          </div>
          <div className="global-product-card-body">
            <strong className="global-product-name">{product.name||'Unnamed product'}</strong>
            <span className="global-product-brand">{product.brand||'Brand not provided'}</span>
            <span>{product.category||'Uncategorised'}</span>
            {product.quantity?<span>{product.quantity}</span>:null}
            <div className="global-product-barcode"><Barcode size={14}/><span>{product.barcode||'No barcode'}</span></div>
          </div>
          <div className="global-product-source">
            <span>{providerLabel({displayName:product.sourceProvider||activeProvider?.displayName||'Provider'})}</span>
          </div>
          <div className="global-product-actions">
            <button type="button" className="global-secondary-button" onClick={()=>setPreviewProduct(product)}>View Details</button>
            <button type="button" className="global-primary-button" onClick={()=>addToCatalogue(product)}><Plus size={15}/> Add to Catalogue</button>
          </div>
        </article>)}
      </div>:null}
    </section>

    {manageProviders?<section className="module-panel global-provider-panel">
      <header className="module-card-header">
        <div><strong>Provider settings</strong><span>{providers.length} providers</span></div>
        <label className="module-input-label" style={{minWidth:260}}>
          <span>Default provider</span>
          <select value={activeProvider?.providerKey||''} disabled={changingDefault||!usableProviders.length} onChange={e=>makeDefaultProvider(e.target.value)}>
            {!usableProviders.length?<option value="">No configured provider</option>:null}
            {usableProviders.map(provider=><option key={provider.providerKey} value={provider.providerKey}>{provider.displayName}</option>)}
          </select>
        </label>
      </header>
      {settingsLoading?<div className="module-state">Loading provider settings…</div>:<div className="global-provider-list">{providers.map(provider=><article key={provider.providerKey}>
        <div className="global-provider-heading"><div><strong>{provider.displayName}</strong><span>{provider.installed&&provider.licensed?'Installed':'Not installed'}{provider.isDefault?' · Default':''}{provider.requiresApiKey?` · ${provider.configured?'Key configured':'Not configured'}`:provider.acceptsApiKey&&provider.usingCustomerKey?' · Customer key configured':''}</span></div><div>
          <button type="button" disabled={!provider.installed||!provider.licensed||testingProvider===provider.providerKey} onClick={()=>testProvider(provider)}>{testingProvider===provider.providerKey?<LoaderCircle size={13}/>:<Wifi size={13}/>} Test</button>
          <button type="button" disabled={!provider.installed||!provider.licensed||savingProvider===provider.providerKey} onClick={()=>saveProvider(provider)}>{savingProvider===provider.providerKey?<LoaderCircle size={13}/>:<Check size={13}/>} Save</button>
        </div></div>
        <div className="global-provider-grid">
          <label className="global-provider-toggle"><span>Enabled</span><button type="button" className={`mac-switch ${provider.enabled?'is-on':''}`} onClick={()=>setProviderField(provider.providerKey,'enabled',!provider.enabled)}><span/></button></label>
          <label className="module-input-label"><span>Priority</span><input type="number" min="1" max="9999" value={provider.priority??runtimeSurface?.providerDefaults?.priority??100} onChange={e=>setProviderField(provider.providerKey,'priority',Number(e.target.value))}/></label>
          <label className="module-input-label"><span>Timeout (ms)</span><input type="number" min="500" max="30000" step="500" value={provider.timeoutMs??runtimeSurface?.providerDefaults?.timeoutMs??5000} onChange={e=>setProviderField(provider.providerKey,'timeoutMs',Number(e.target.value))}/></label>
          <label className="module-input-label"><span>Cache TTL</span><input type="number" min="0" max="86400" value={provider.cacheTtlSeconds??runtimeSurface?.providerDefaults?.cacheTtlSeconds??5} onChange={e=>setProviderField(provider.providerKey,'cacheTtlSeconds',Number(e.target.value))}/></label>
          <label className="global-provider-toggle"><span>Fallback</span><button type="button" className={`mac-switch ${provider.fallbackEnabled!==false?'is-on':''}`} onClick={()=>setProviderField(provider.providerKey,'fallbackEnabled',provider.fallbackEnabled===false)}><span/></button></label>
        </div>
        {provider.configurableFields?.includes('baseUrl')?<label className="module-input-label"><span>API base URL</span><input value={provider.baseUrl||''} onChange={e=>setProviderField(provider.providerKey,'baseUrl',e.target.value)}/></label>:null}
        {provider.configurableFields?.includes('userAgent')?<label className="module-input-label"><span>User-Agent identification</span><input value={provider.userAgent||''} onChange={e=>setProviderField(provider.providerKey,'userAgent',e.target.value)}/></label>:null}
        {provider.acceptsApiKey?<label className="module-input-label global-provider-key"><span>{provider.displayName} API key{provider.requiresApiKey?'':' (optional)'}</span><div><KeyRound size={13}/><input type="password" autoComplete="new-password" value={apiKeys[provider.providerKey]||''} onChange={e=>setApiKeys(keys=>({...keys,[provider.providerKey]:e.target.value}))} placeholder={provider.usingCustomerKey||provider.configured?'Enter a new key to replace saved key':provider.requiresApiKey?'Enter your customer API key':'Leave blank to use the provider free mode'}/></div></label>:null}
      </article>)}</div>}
    </section>:null}

    {previewProduct?<div className="global-product-preview-backdrop" role="presentation" onClick={()=>setPreviewProduct(null)}>
      <article className="global-product-preview" role="dialog" aria-modal="true" aria-label="Product details" onClick={e=>e.stopPropagation()}>
        <button type="button" className="global-preview-close" onClick={()=>setPreviewProduct(null)}><X size={18}/></button>
        <div className="global-preview-image">{previewProduct.imageUrl?<img src={previewProduct.imageUrl} alt="" />:<PackageSearch size={48}/>}</div>
        <div className="global-preview-content">
          <span>GLOBAL PRODUCT</span>
          <h2>{previewProduct.name||'Unnamed product'}</h2>
          <p>{previewProduct.description||'No product description is available from this provider.'}</p>
          <dl>
            <div><dt>Brand</dt><dd>{previewProduct.brand||'—'}</dd></div>
            <div><dt>Barcode</dt><dd>{previewProduct.barcode||'—'}</dd></div>
            <div><dt>Category</dt><dd>{previewProduct.category||'—'}</dd></div>
            <div><dt>Quantity</dt><dd>{previewProduct.quantity||'—'}</dd></div>
            <div><dt>Provider</dt><dd>{providerLabel({displayName:previewProduct.sourceProvider||activeProvider?.displayName||'Provider'})}</dd></div>
          </dl>
          <button type="button" className="global-primary-button" onClick={()=>{addToCatalogue(previewProduct);setPreviewProduct(null)}}><Plus size={15}/> Add to Catalogue</button>
        </div>
      </article>
    </div>:null}

    {preset?<MetadataRecordFormModal objectKey={runtimeSurface?.objects?.catalogue||''} mode="create" record={preset} title="Add Product to Catalogue" onClose={()=>setPreset(null)} onSaved={()=>{setPreset(null);setNotice('Product added to your company catalogue.')}}/>:null}
  </section>
}
