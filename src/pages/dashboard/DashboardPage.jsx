import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bell, CalendarDays, Pencil, RefreshCw, X } from 'lucide-react'
import { apiRequest, getAvailableStores, loadSessionPermissions } from '../../services/api'
import DashboardGrid from '../../components/dashboard/DashboardGrid.jsx'

const DATE_RANGES = [
  ['all_time', 'All time'],
  ['today', 'Today'],
  ['yesterday', 'Yesterday'],
  ['this_week', 'This week'],
  ['last_7_days', 'Last 7 days'],
  ['this_month', 'MTD'],
  ['this_quarter', 'This quarter'],
  ['fiscal_year', 'Fiscal year'],
]

function displayValue(value) {
  if (value == null || value === '') return '—'
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)) {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return date.toLocaleDateString()
  }
  return String(value)
}

function formatNumber(value, format, currency = 'GBP') {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  if (format === 'currency') {
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(n) } catch {}
  }
  if (format === 'percent') return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n)}%`
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n)
}

function seriesFrom(config, result) {
  const rows = Array.isArray(result?.data?.rows) ? result.data.rows : []
  const columns = Array.isArray(result?.data?.columns) ? result.data.columns : []
  const valueField = config?.valueField || columns.find((key) => key !== config?.labelField)
  const labelField = config?.labelField || columns.find((key) => key !== valueField)
  return rows.map((row) => ({
    label: labelField ? displayValue(row?.[labelField]) : 'Total',
    value: Number(row?.[valueField]) || 0,
  }))
}

function mergeCaseInsensitiveSeries(points) {
  const merged = new Map()
  for (const point of points || []) {
    const label = String(point?.label ?? '').trim()
    const key = label.toLowerCase()
    if (!key) continue
    const existing = merged.get(key)
    if (existing) existing.value += Number(point?.value) || 0
    else merged.set(key, { ...point, label, value: Number(point?.value) || 0 })
  }
  return [...merged.values()]
}

function DashboardFilterControl({ filter, value, onChange }) {
  const type = String(filter?.type || "select");
  const options = Array.isArray(filter?.options) ? filter.options.slice(0, 50) : [];
  const label = filter?.label || filter?.key || "Filter";

  if (type === "multi_select") {
    const selected = Array.isArray(value) ? value.map(String) : value == null || value === "" ? [] : [String(value)];
    return <label className="onepos-label min-w-[190px]">{label}
      <select multiple className="onepos-input mt-1 min-h-[88px]" value={selected} onChange={(event) => onChange(Array.from(event.target.selectedOptions).map((option) => option.value))}>
        {options.map((option) => <option key={String(option.value)} value={option.value}>{option.label}</option>)}
      </select>
      {filter.allowAll !== false ? <span className="block mt-1 text-[11px] opacity-70">No selection = All</span> : null}
    </label>;
  }

  if (type === "date") {
    return <label className="onepos-label min-w-[170px]">{label}
      <input type="date" className="onepos-input mt-1" value={value || ""} onChange={(event) => onChange(event.target.value)} />
    </label>;
  }

  if (type === "number") {
    return <label className="onepos-label min-w-[170px]">{label}
      <input type="number" className="onepos-input mt-1" value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))} />
    </label>;
  }

  if (type === "boolean") {
    const normalized = value === true || value === "true" ? "true" : value === false || value === "false" ? "false" : "";
    return <label className="onepos-label min-w-[170px]">{label}
      <select className="onepos-input mt-1" value={normalized} onChange={(event) => onChange(event.target.value === "" ? "" : event.target.value === "true")}>
        {filter.allowAll !== false ? <option value="">All</option> : null}
        <option value="true">True</option>
        <option value="false">False</option>
      </select>
    </label>;
  }

  return <label className="onepos-label min-w-[170px]">{label}
    <select className="onepos-input mt-1" value={value ?? ""} onChange={(event) => onChange(event.target.value)}>
      {filter.allowAll !== false ? <option value="">All</option> : null}
      {options.map((option) => <option key={String(option.value)} value={option.value}>{option.label}</option>)}
    </select>
  </label>;
}

function DashboardClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30000)
    return () => window.clearInterval(id)
  }, [])
  return <div className="dash-clock">
    <strong>{new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(now)}</strong>
    <span>{new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(now)}</span>
  </div>
}

function ComponentCard({ component, result, loading, currency, onRetry }) {
  const config = component?.config || {}
  const type = component?.type === 'chart' ? (config.chartType || 'bar') : component?.type
  const rawPoints = seriesFrom(config, result)
  const normalizePaymentLabels = /payment\s*(method|type|tender)/i.test(`${component?.title || ''} ${config?.labelField || ''}`)
  const points = normalizePaymentLabels ? mergeCaseInsensitiveSeries(rawPoints) : rawPoints
  const rows = Array.isArray(result?.data?.rows) ? result.data.rows : []
  const columns = Array.isArray(result?.data?.columns) ? result.data.columns : []

  let body = null
  if (type === 'clock_widget') {
    body = <DashboardClock />
  } else if (loading) {
    body = <div className="dash-skeleton" />
  } else if (result?.error) {
    body = <div className="dashboard-component-error" role="alert"><strong>This component could not be loaded.</strong><span>{result.error}</span><button type="button" onClick={onRetry}>Retry</button></div>
  } else if (type === 'text') {
    body = <p className="dash-text">{config.content || ''}</p>
  } else if (type === 'image') {
    const rawSrc = String(config.imageUrl || '').trim()
    const src = /^(https?:\/\/|\/)/i.test(rawSrc) ? rawSrc : ''
    const rawLink = String(config.linkUrl || '').trim()
    const link = /^(https?:\/\/|\/)/i.test(rawLink) ? rawLink : ''
    const image = src
      ? <img src={src} alt={config.altText || component?.title || 'Dashboard image'} className="h-full w-full rounded-lg" style={{ objectFit: config.imageFit === 'cover' ? 'cover' : 'contain' }} />
      : <div className="dash-empty">Configure an image URL</div>
    body = link && src
      ? <a href={link} target={link.startsWith('/') ? undefined : '_blank'} rel={link.startsWith('/') ? undefined : 'noopener noreferrer'} className="block h-full">{image}</a>
      : image
  } else if (type === 'kpi' || type === 'modern_kpi_card') {
    const total = points.reduce((sum, point) => sum + point.value, 0)
    body = points.length
      ? <div className="dash-kpi"><strong>{formatNumber(config.labelField ? points[0]?.value : total, config.format, currency)}</strong>{config.labelField && points[0] ? <span>{points[0].label}</span> : null}</div>
      : <div className="dash-empty">No data</div>
  } else if (type === 'bar') {
    const shown = points.slice(0, config.limit || 12)
    const max = Math.max(...shown.map((point) => Math.abs(point.value)), 0)
    body = shown.length ? <div className="dash-bars">{shown.map((point) => (
      <div className="dash-bar-item" key={point.label} title={`${point.label}: ${formatNumber(point.value, config.format, currency)}`}>
        <div className="dash-bar-track"><span style={{ height: `${max ? Math.max((Math.abs(point.value) / max) * 100, 3) : 3}%` }} /></div>
        <small>{point.label}</small>
      </div>
    ))}</div> : <div className="dash-empty">No data</div>
  } else if (type === 'pie' || type === 'donut') {
    const shown = points.slice(0, config.maxCategories || 6)
    const total = shown.reduce((sum, point) => sum + Math.max(0, point.value), 0)
    let cursor = 0
    const stops = shown.map((point, index) => {
      const start = total ? (cursor / total) * 100 : 0
      cursor += Math.max(0, point.value)
      const end = total ? (cursor / total) * 100 : 0
      return `var(--dash-series-${(index % 6) + 1}) ${start}% ${end}%`
    }).join(', ')
    body = shown.length ? <div className="dash-pie-wrap">
      <div className={`dash-pie ${type === 'donut' ? 'is-donut' : ''}`} style={{ background: `conic-gradient(${stops})` }} />
      <div className="dash-legend">{shown.map((point, index) => <div key={point.label}><i className={`dash-series-${(index % 6) + 1}`} /><span>{point.label}</span><strong>{formatNumber(point.value, config.format, currency)}</strong></div>)}</div>
    </div> : <div className="dash-empty">No data</div>
  } else if (type === 'table') {
    body = rows.length ? <div className="dash-table-wrap"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{columns.map((column) => <td key={column}>{displayValue(row[column])}</td>)}</tr>)}</tbody></table></div> : <div className="dash-empty">No data</div>
  } else if (['folder_card','avatar_group','modern_app_card','modern_section_header','modern_data_card','icon_action_tile'].includes(type)) {
    body = <div className="dash-modern"><strong>{config.title || component.title || 'Component'}</strong><span>{config.subtitle || 'Overview'}</span>{config.metric != null ? <b>{displayValue(config.metric)}</b> : null}</div>
  } else {
    body = <div className="dash-empty">No data</div>
  }

  const isSalesByPeriod = /sales\s+by\s+period/i.test(String(component?.title || ''))
  return <section className={`dashboard-component ${isSalesByPeriod ? 'dashboard-component--sales-period' : ''}`} style={{ gridColumn: `span ${Math.max(1, Math.min(12, Number(component?.layout?.w) || 4))}` }}>
    {component?.title ? <h3>{component.title}</h3> : null}
    <div className="dashboard-component-body">{body}</div>
  </section>
}

export default function DashboardPage({ onOpenBuilder }) {
  const [available, setAvailable] = useState([])
  const [activeId, setActiveId] = useState('')
  const [definition, setDefinition] = useState(null)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dateRange, setDateRange] = useState('this_month')
  const [globalFilterValues, setGlobalFilterValues] = useState({})
  const [permissionCodes, setPermissionCodes] = useState([])
  const [showSubscriptions, setShowSubscriptions] = useState(false)
  const [subscriptions, setSubscriptions] = useState([])
  const [subscriptionBusy, setSubscriptionBusy] = useState(false)
  const [subscriptionError, setSubscriptionError] = useState('')
  const [subscriptionPrincipals, setSubscriptionPrincipals] = useState(null)
  const [subscriptionDraft, setSubscriptionDraft] = useState(() => ({
    cadence: 'DAILY',
    hour: 8,
    minute: 0,
    weekday: 1,
    monthday: 1,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London',
    recipientPrincipals: [],
  }))
  const [dashboardStores, setDashboardStores] = useState(() => getAvailableStores())
  const [dashboardStoreId, setDashboardStoreId] = useState(() => {
    const stores = getAvailableStores()
    return stores.length === 1 ? String(stores[0].id) : ''
  })
  const [viewportMode, setViewportMode] = useState(() => (
    typeof window === 'undefined' ? 'desktop' : window.innerWidth < 640 ? 'mobile' : window.innerWidth < 1024 ? 'tablet' : 'desktop'
  ))

  useEffect(() => {
    let live = true
    apiRequest('/api/dashboards').then((dashboards) => {
      if (live) setAvailable(dashboards?.success ? dashboards.data || [] : [])
    }).catch(() => {})
    return () => { live = false }
  }, [])

  useEffect(() => {
    let live = true
    loadSessionPermissions().then((response) => {
      if (live) setPermissionCodes(Array.isArray(response?.permissions) ? response.permissions : [])
    }).catch(() => {})
    return () => { live = false }
  }, [])

  useEffect(() => {
    const onResize = () => setViewportMode(window.innerWidth < 640 ? 'mobile' : window.innerWidth < 1024 ? 'tablet' : 'desktop')
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const loadDashboard = useCallback(async (dashboardId = '', range = dateRange, filterValues = globalFilterValues) => {
    try {
      setLoading(true)
      setError('')
      let value
      if (dashboardId) {
        const saved = await apiRequest(`/api/dashboards/${encodeURIComponent(dashboardId)}`)
        if (saved?.success) value = {
          id: saved.data.id,
          name: saved.data.name,
          description: saved.data.description,
          components: saved.data.components || [],
          filters: saved.data.filters || [],
          global_filters: saved.data.global_filters || [],
          responsive_layouts: saved.data.responsive_layouts || {},
          run_as_mode: saved.data.run_as_mode || 'VIEWER',
          run_as_user_id: saved.data.run_as_user_id || null,
        }
      }
      if (!value) {
        const fallback = await apiRequest('/api/dashboards/default')
        if (!fallback?.success) throw new Error(fallback?.message || 'Unable to load dashboard')
        value = fallback.data
      }

      if (value?.id) {
        const state = await apiRequest(`/api/dashboards/${encodeURIComponent(value.id)}/state`).catch(() => null)
        if (state?.success && Object.keys(filterValues || {}).length === 0) {
          filterValues = state.data?.filter_values || {}
          setGlobalFilterValues(filterValues)
        }
      }

      setDefinition(value)
      const stores = dashboardStores.length ? dashboardStores : getAvailableStores()
      const scopedStoreIds = dashboardStoreId ? [dashboardStoreId] : stores.map((store) => String(store.id)).filter(Boolean)
      const filters = [
        ...(value.filters || []).filter((filter) => filter?.field !== 'date' && filter?.field !== 'store'),
        ...(range ? [{ field: 'date', operator: range }] : (value.filters || []).filter((filter) => filter?.field === 'date')),
        ...(scopedStoreIds.length ? [{ field: 'store', operator: 'in', value: scopedStoreIds }] : []),
      ]
      const endpoint = value.id ? `/api/dashboards/${encodeURIComponent(value.id)}/run` : '/api/dashboards/run'
      const body = value.id ? { filters, globalFilterValues: filterValues } : { ...value, filters, globalFilterValues: filterValues }
      const run = await apiRequest(endpoint, { method: 'POST', body: JSON.stringify(body) })
      if (!run?.success) throw new Error(run?.message || 'Unable to run dashboard')
      setResults(run.data?.components || [])
    } catch (err) {
      setError(err?.message || 'Unable to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [dashboardStoreId, dashboardStores, dateRange, globalFilterValues])

  useEffect(() => { void loadDashboard(activeId, dateRange, globalFilterValues) }, [activeId, dashboardStoreId])

  useEffect(() => {
    const handleStoreChange = () => {
      const stores = getAvailableStores()
      setDashboardStores(stores)
      if (stores.length === 1) setDashboardStoreId(String(stores[0].id))
      else if (dashboardStoreId && !stores.some((store) => String(store.id) === String(dashboardStoreId))) setDashboardStoreId('')
    }
    const handleDashboardStoreScopeChange = (event) => {
      const stores = getAvailableStores()
      setDashboardStores(stores)
      const requested = String(event?.detail?.storeId || '')
      if (stores.length <= 1) {
        setDashboardStoreId(stores[0]?.id ? String(stores[0].id) : '')
        return
      }
      setDashboardStoreId(requested && stores.some((store) => String(store.id) === requested) ? requested : '')
    }
    window.addEventListener('onepos:store-context-changed', handleStoreChange)
    window.addEventListener('onepos:dashboard-store-scope-changed', handleDashboardStoreScopeChange)
    return () => {
      window.removeEventListener('onepos:store-context-changed', handleStoreChange)
      window.removeEventListener('onepos:dashboard-store-scope-changed', handleDashboardStoreScopeChange)
    }
  }, [dashboardStoreId])

  useEffect(() => {
    const handleDrill = (event) => {
      const drill = event?.detail?.drill
      if (!drill) return
      if (drill.type === 'url' && drill.targetId) window.open(drill.targetId, '_blank', 'noopener,noreferrer')
      else window.dispatchEvent(new CustomEvent(`oneengine:open-${drill.type || 'report'}`, { detail: drill }))
    }
    window.addEventListener('oneengine:analytics-drill', handleDrill)
    return () => window.removeEventListener('oneengine:analytics-drill', handleDrill)
  }, [])

  const components = useMemo(() => {
    const overrides = new Map((definition?.responsive_layouts?.[viewportMode] || []).map((item) => [String(item.id), item]))
    return (definition?.components || []).map((component) => {
      const override = overrides.get(String(component.id))
      return override ? { ...component, layout: { ...component.layout, ...override } } : component
    })
  }, [definition, viewportMode])

  const updateGlobalFilters = async (next) => {
    setGlobalFilterValues(next)
    if (definition?.id) {
      await apiRequest(`/api/dashboards/${encodeURIComponent(definition.id)}/state`, {
        method: 'PUT',
        body: JSON.stringify({ filterValues: next }),
      }).catch(() => null)
    }
    await loadDashboard(activeId, dateRange, next)
  }

  const canSubscribe = permissionCodes.includes('dashboard.subscribe')
  const canAddRecipients = permissionCodes.includes('dashboard.subscribe.recipients')

  const openSubscriptions = async () => {
    if (!definition?.id || !canSubscribe) return
    setSubscriptionError('')
    setShowSubscriptions(true)
    setSubscriptionBusy(true)
    try {
      const requests = [apiRequest(`/api/dashboards/${encodeURIComponent(definition.id)}/subscriptions`)]
      if (canAddRecipients) requests.push(apiRequest('/api/dashboards/principals'))
      const [list, principals] = await Promise.all(requests)
      if (!list?.success) throw new Error(list?.message || 'Unable to load dashboard subscriptions')
      setSubscriptions(list.data || [])
      if (canAddRecipients && principals?.success) setSubscriptionPrincipals(principals.data)
    } catch (err) {
      setSubscriptionError(err?.message || 'Unable to load dashboard subscriptions')
    } finally {
      setSubscriptionBusy(false)
    }
  }

  const saveSubscription = async () => {
    if (!definition?.id) return
    setSubscriptionBusy(true)
    setSubscriptionError('')
    try {
      const response = await apiRequest(`/api/dashboards/${encodeURIComponent(definition.id)}/subscriptions`, {
        method: 'POST',
        body: JSON.stringify(subscriptionDraft),
      })
      if (!response?.success) throw new Error(response?.message || 'Unable to subscribe to dashboard')
      setSubscriptions((rows) => [response.data, ...rows])
    } catch (err) {
      setSubscriptionError(err?.message || 'Unable to subscribe to dashboard')
    } finally {
      setSubscriptionBusy(false)
    }
  }

  const removeSubscription = async (subscriptionId) => {
    if (!definition?.id) return
    setSubscriptionBusy(true)
    setSubscriptionError('')
    try {
      const response = await apiRequest(`/api/dashboards/${encodeURIComponent(definition.id)}/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: 'DELETE' })
      if (!response?.success) throw new Error(response?.message || 'Unable to remove dashboard subscription')
      setSubscriptions((rows) => rows.filter((row) => String(row.id) !== String(subscriptionId)))
    } catch (err) {
      setSubscriptionError(err?.message || 'Unable to remove dashboard subscription')
    } finally {
      setSubscriptionBusy(false)
    }
  }

  const principalOptions = [
    ...(subscriptionPrincipals?.users || []).map((item) => ({ value:`USER:${item.id}`, label:item.full_name || item.username || 'User' })),
    ...(subscriptionPrincipals?.roles || []).map((item) => ({ value:`ROLE:${item.id}`, label:`Role · ${item.name}` })),
    ...(subscriptionPrincipals?.groups || []).map((item) => ({ value:`PUBLIC_GROUP:${item.id}`, label:`Group · ${item.name}` })),
  ]

  if (error && !definition) return <section className="dashboard-page"><div className="dashboard-error"><strong>Unable to load dashboard</strong><span>{error}</span><button onClick={() => loadDashboard(activeId, dateRange, globalFilterValues)}>Retry</button></div></section>

  return <section className="dashboard-page">
    <header className="dashboard-header">
      <div><span>Dashboards</span><h1>{definition?.name || 'Dashboard'}</h1><p>{definition?.description || 'Overview of your business performance.'}</p></div>
      <div className="dashboard-actions">
        <select value={activeId} onChange={(event) => setActiveId(event.target.value)} aria-label="Dashboard view">
          <option value="">Default dashboard</option>
          {available.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <label><CalendarDays size={14}/><select value={dateRange} aria-label="Dashboard date range" onChange={(event) => { const next=event.target.value; setDateRange(next); void loadDashboard(activeId,next,globalFilterValues) }}>{DATE_RANGES.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <button type="button" onClick={() => loadDashboard(activeId,dateRange,globalFilterValues)}><RefreshCw size={14}/></button>
        {canSubscribe && definition?.id ? <button type="button" onClick={openSubscriptions}><Bell size={14}/> Subscribe</button> : null}
        {onOpenBuilder ? <button type="button" onClick={onOpenBuilder}><Pencil size={14}/> Edit</button> : null}
      </div>
    </header>
    {showSubscriptions ? <div className="onepos-card onepos-card-body mb-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div><strong>Dashboard subscription</strong><p className="text-xs opacity-70">Scheduled email uses the dashboard's fixed run-as user. Dashboard filter selections are not included in subscription emails.</p></div>
        <button type="button" className="onepos-btn onepos-btn-sm" onClick={() => setShowSubscriptions(false)} aria-label="Close subscriptions"><X size={14}/></button>
      </div>
      {String(definition?.run_as_mode || 'VIEWER').toUpperCase() !== 'FIXED_USER'
        ? <div className="onepos-alert onepos-alert-warning">Dynamic dashboards cannot be subscribed. Change “Run dashboard as” to a specified user in Dashboard Builder first.</div>
        : <>
          <div className="grid gap-2 md:grid-cols-4">
            <label className="onepos-label">Frequency<select className="onepos-input mt-1" value={subscriptionDraft.cadence} onChange={(event)=>setSubscriptionDraft((draft)=>({...draft,cadence:event.target.value}))}><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option></select></label>
            <label className="onepos-label">Hour<input className="onepos-input mt-1" type="number" min="0" max="23" value={subscriptionDraft.hour} onChange={(event)=>setSubscriptionDraft((draft)=>({...draft,hour:Number(event.target.value)}))}/></label>
            <label className="onepos-label">Minute<input className="onepos-input mt-1" type="number" min="0" max="59" value={subscriptionDraft.minute} onChange={(event)=>setSubscriptionDraft((draft)=>({...draft,minute:Number(event.target.value)}))}/></label>
            <label className="onepos-label">Timezone<input className="onepos-input mt-1" value={subscriptionDraft.timezone} onChange={(event)=>setSubscriptionDraft((draft)=>({...draft,timezone:event.target.value}))}/></label>
          </div>
          {subscriptionDraft.cadence === 'WEEKLY' ? <label className="onepos-label block max-w-[240px]">Weekday<select className="onepos-input mt-1" value={subscriptionDraft.weekday} onChange={(event)=>setSubscriptionDraft((draft)=>({...draft,weekday:Number(event.target.value)}))}>{['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((label,index)=><option key={label} value={index}>{label}</option>)}</select></label> : null}
          {subscriptionDraft.cadence === 'MONTHLY' ? <label className="onepos-label block max-w-[240px]">Day of month<input className="onepos-input mt-1" type="number" min="1" max="28" value={subscriptionDraft.monthday} onChange={(event)=>setSubscriptionDraft((draft)=>({...draft,monthday:Number(event.target.value)}))}/></label> : null}
          {canAddRecipients && principalOptions.length ? <label className="onepos-label block">Recipients <span className="font-normal opacity-70">(leave empty to send only to you)</span><select multiple className="onepos-input mt-1 min-h-[110px]" value={(subscriptionDraft.recipientPrincipals||[]).map((item)=>`${item.principalType}:${item.principalId}`)} onChange={(event)=>{const values=Array.from(event.target.selectedOptions).map((option)=>option.value);setSubscriptionDraft((draft)=>({...draft,recipientPrincipals:values.map((value)=>{const [principalType,principalId]=value.split(':');return {principalType,principalId}})}))}}>{principalOptions.map((option)=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label> : null}
          <button type="button" className="onepos-btn onepos-btn-primary" disabled={subscriptionBusy} onClick={saveSubscription}>{subscriptionBusy ? 'Saving…' : 'Save subscription'}</button>
        </>}
      {subscriptionError ? <div className="onepos-alert onepos-alert-error">{subscriptionError}</div> : null}
      <div className="space-y-2">
        {subscriptions.map((subscription)=><div key={subscription.id} className="flex items-center justify-between gap-3 rounded-lg border p-3" style={{borderColor:'var(--onepos-border)'}}><div><strong className="text-sm">{subscription.definition?.cadence || 'DAILY'} · {String(subscription.definition?.hour ?? 8).padStart(2,'0')}:{String(subscription.definition?.minute ?? 0).padStart(2,'0')}</strong><div className="text-xs opacity-70">{subscription.definition?.timezone || 'UTC'} · {subscription.last_status || 'Not run yet'}</div></div><button type="button" className="onepos-btn onepos-btn-sm" disabled={subscriptionBusy} onClick={()=>removeSubscription(subscription.id)}>Unsubscribe</button></div>)}
        {!subscriptionBusy && !subscriptions.length ? <p className="text-sm opacity-70">No dashboard subscriptions yet.</p> : null}
      </div>
    </div>
    {(definition?.global_filters || []).length ? <div className="onepos-card onepos-card-body flex flex-wrap items-end gap-3 mb-4">
      {(definition.global_filters || []).map((filter) => <DashboardFilterControl
        key={filter.key}
        filter={filter}
        value={globalFilterValues[filter.key] ?? filter.defaultValue ?? ""}
        onChange={(value) => updateGlobalFilters({ ...globalFilterValues, [filter.key]: value })}
      />)}
      <button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={() => updateGlobalFilters({})}>Reset filters</button>
    </div> : null}
    {error ? <div className="dashboard-inline-error">{error}</div> : null}
    <DashboardGrid components={components} results={results} loading={loading} />
    {loading && definition ? <div className="dashboard-refreshing">Refreshing…</div> : null}
  </section>
}

