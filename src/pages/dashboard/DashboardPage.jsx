import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, Pencil, RefreshCw } from 'lucide-react'
import { apiRequest, getAvailableStores } from '../../services/api'

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
  const [currency, setCurrency] = useState('GBP')
  const [dashboardStores, setDashboardStores] = useState(() => getAvailableStores())
  const [dashboardStoreId, setDashboardStoreId] = useState(() => {
    const stores = getAvailableStores()
    return stores.length === 1 ? String(stores[0].id) : ''
  })

  useEffect(() => {
    let live = true
    Promise.all([
      apiRequest('/api/dashboards').catch(() => null),
      apiRequest('/api/settings').catch(() => null),
    ]).then(([dashboards, settings]) => {
      if (!live) return
      setAvailable(dashboards?.success ? dashboards.data || [] : [])
      setCurrency(settings?.data?.company?.currency || 'GBP')
    })
    return () => { live = false }
  }, [])

  const loadDashboard = useCallback(async (dashboardId = '', range = '') => {
    try {
      setLoading(true)
      setError('')
      let value
      if (dashboardId) {
        const saved = await apiRequest(`/api/dashboards/${dashboardId}`)
        if (saved?.success) value = {
          name: saved.data.name,
          description: saved.data.description,
          components: saved.data.components || [],
          filters: saved.data.filters || [],
        }
      }
      if (!value) {
        const fallback = await apiRequest('/api/dashboards/default')
        if (!fallback?.success) throw new Error(fallback?.message || 'Unable to load dashboard')
        value = fallback.data
      }
      setDefinition(value)

      // Dashboard store scope is independent from the store-bound Till runtime.
      // One mapped store is selected automatically. Multi-store users default
      // to All mapped stores, and every requested store is still validated by
      // the backend canAccessStore/RBAC path before a report executes.
      const stores = dashboardStores.length ? dashboardStores : getAvailableStores()
      const scopedStoreIds = dashboardStoreId
        ? [dashboardStoreId]
        : stores.map((store) => String(store.id)).filter(Boolean)
      const filters = [
        ...(value.filters || []).filter((filter) => filter?.field !== 'date' && filter?.field !== 'store'),
        ...(range ? [{ field: 'date', operator: range }] : (value.filters || []).filter((filter) => filter?.field === 'date')),
        ...(scopedStoreIds.length ? [{ field: 'store', operator: 'in', value: scopedStoreIds }] : []),
      ]
      const run = await apiRequest('/api/dashboards/run', {
        method: 'POST',
        body: JSON.stringify({ ...value, filters }),
      })
      setResults(run?.success ? run.data?.components || [] : [])
    } catch (err) {
      setError(err?.message || 'Unable to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [dashboardStoreId, dashboardStores])

  useEffect(() => { void loadDashboard(activeId, dateRange) }, [activeId, dashboardStoreId])
  useEffect(() => {
    const handleStoreChange = () => {
      const stores = getAvailableStores()
      setDashboardStores(stores)
      if (stores.length === 1) setDashboardStoreId(String(stores[0].id))
      else if (dashboardStoreId && !stores.some((store) => String(store.id) === String(dashboardStoreId))) setDashboardStoreId('')
    }
    const handleDashboardScope = (event) => {
      const requested = String(event?.detail?.storeId || '')
      const stores = getAvailableStores()
      if (!requested || stores.some((store) => String(store.id) === requested)) setDashboardStoreId(requested)
    }
    window.addEventListener('onepos:store-context-changed', handleStoreChange)
    window.addEventListener('onepos:dashboard-store-scope-changed', handleDashboardScope)
    return () => {
      window.removeEventListener('onepos:store-context-changed', handleStoreChange)
      window.removeEventListener('onepos:dashboard-store-scope-changed', handleDashboardScope)
    }
  }, [dashboardStoreId])

  const ordered = useMemo(() => {
    const rank = { clock_widget: 0, kpi: 0, modern_kpi_card: 0, text: 1, pie: 2, donut: 2, chart: 2, bar: 2, table: 3 }
    return [...(definition?.components || [])].sort((a, b) => (rank[a.type] ?? 9) - (rank[b.type] ?? 9))
  }, [definition])

  if (error && !definition) return <section className="dashboard-page"><div className="dashboard-error"><strong>Unable to load dashboard</strong><span>{error}</span><button onClick={() => loadDashboard(activeId, dateRange)}>Retry</button></div></section>

  return <section className="dashboard-page">
    <header className="dashboard-header">
      <div><span>Dashboards</span><h1>{definition?.name || 'Dashboard'}</h1><p>{definition?.description || 'Overview of your business performance.'}</p></div>
      <div className="dashboard-actions">
        <select value={activeId} onChange={(event) => setActiveId(event.target.value)} aria-label="Dashboard view">
          <option value="">{definition?.name || 'Default dashboard'} (Default)</option>
          {available.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <label><CalendarDays size={14}/><select value={dateRange} aria-label="Dashboard date range" onChange={(event) => { setDateRange(event.target.value); void loadDashboard(activeId, event.target.value) }}>{DATE_RANGES.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <button type="button" onClick={() => loadDashboard(activeId, dateRange)}><RefreshCw size={14}/></button>
        {onOpenBuilder ? <button type="button" onClick={onOpenBuilder}><Pencil size={14}/> Edit</button> : null}
      </div>
    </header>
    {error ? <div className="dashboard-inline-error">{error}</div> : null}
    <div className="dashboard-grid">
      {ordered.map((component) => <ComponentCard key={component.id} component={component} result={results.find((item) => item.id === component.id)} loading={loading} currency={currency} onRetry={() => loadDashboard(activeId, dateRange)} />)}
      {!loading && !ordered.length ? <div className="dash-empty">This dashboard has no components yet.</div> : null}
    </div>
    {loading && definition ? <div className="dashboard-refreshing">Refreshing…</div> : null}
  </section>
}
