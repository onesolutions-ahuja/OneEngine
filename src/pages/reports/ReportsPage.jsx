import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Download, RefreshCw } from 'lucide-react'
import { apiRequest } from '../../services/api'
import {
  getCustomers,getInventoryMovements,getInventoryOverview,getPayments,getProducts,getSales,getSalesOverview,
  getSummary,getTill,getTillSession,getVat,
} from '../../services/reports'

const today=()=>new Date().toISOString().slice(0,10)
const money=(value,currency='GBP')=>{
  const n=Number(value||0)
  try{return new Intl.NumberFormat(undefined,{style:'currency',currency,maximumFractionDigits:2}).format(n)}
  catch{return `${n.toFixed(2)} ${currency}`}
}
const when=value=>value?new Date(value).toLocaleString():'—'

const TABS=[
  ['sales','Sales'],
  ['customers','Customers'],
  ['products','Products'],
  ['payments','Payments'],
  ['inventory','Inventory'],
  ['movements','Stock Movements'],
  ['till','Till Close'],
  ['vat','VAT'],
]

export default function ReportsPage({onOpenCustomReports}){
  const [tab,setTab]=useState('sales')
  const [from,setFrom]=useState(today())
  const [to,setTo]=useState(today())
  const [currency,setCurrency]=useState('GBP')
  const [settings,setSettings]=useState(null)
  const [refreshKey,setRefreshKey]=useState(0)

  useEffect(()=>{
    apiRequest('/api/settings').then(r=>{
      if(r?.success){setSettings(r.data||null);setCurrency(r.data?.company?.currency||'GBP')}
    }).catch(()=>{})
  },[])

  return <section className="module-page reports-page">
    <header className="module-page-header">
      <div><span>Reporting</span><h1>Reports</h1><p>Server-calculated operational reporting. Profit / Margin reporting is intentionally excluded.</p></div>
      <div className="module-header-actions">
        {onOpenCustomReports?<button onClick={onOpenCustomReports}>Custom Reports</button>:null}
        <label className="report-date-control"><span>From</span><input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
        <label className="report-date-control"><span>To</span><input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
        <button onClick={()=>setRefreshKey(v=>v+1)}><RefreshCw size={14}/> Run</button>
      </div>
    </header>

    <div className="module-segmented reports-tabs">
      {TABS.map(([key,label])=><button key={key} className={tab===key?'is-active':''} onClick={()=>setTab(key)}>{label}</button>)}
    </div>

    {tab==='sales'?<SalesReports from={from} to={to} currency={currency} refreshKey={refreshKey}/>:null}
    {tab==='customers'?<SimpleEndpointReport title="Customers" refreshKey={refreshKey} load={()=>getCustomers(from,to)} columns={[
      ['customer','Customer'],['transactions','Transactions'],['spend','Spend','money'],['returns','Returns','money'],['netSpend','Net spend','money']
    ]} currency={currency}/>:null}
    {tab==='products'?<SimpleEndpointReport title="Products" refreshKey={refreshKey} load={()=>getProducts(from,to)} columns={[
      ['product','Product'],['sku','SKU'],['quantitySold','Sold'],['returns','Returns'],['netSales','Net sales','money']
    ]} currency={currency}/>:null}
    {tab==='payments'?<SimpleEndpointReport title="Payments by method" refreshKey={refreshKey} load={()=>getPayments(from,to)} columns={[
      ['method','Method'],['transactions','Transactions'],['total','Total','money']
    ]} currency={currency}/>:null}
    {tab==='inventory'?<InventoryReport from={from} to={to} currency={currency} refreshKey={refreshKey}/>:null}
    {tab==='movements'?<StockMovementsReport from={from} to={to} currency={currency} refreshKey={refreshKey}/>:null}
    {tab==='till'?<TillCloseReport from={from} to={to} currency={currency} refreshKey={refreshKey}/>:null}
    {tab==='vat'?<VatReport from={from} to={to} currency={currency} refreshKey={refreshKey}/>:null}
  </section>
}

function useLoad(load,refreshKey,deps=[]){
  const [state,setState]=useState({loading:true,error:'',data:null})
  useEffect(()=>{
    let live=true
    setState(s=>({...s,loading:true,error:''}))
    Promise.resolve().then(load).then(r=>{
      if(!live)return
      if(r?.success===false)throw new Error(r?.message||'Unable to load report')
      setState({loading:false,error:'',data:r?.data??r})
    }).catch(err=>live&&setState({loading:false,error:err?.message||'Unable to load report',data:null}))
    return()=>{live=false}
  },[refreshKey,...deps])
  return state
}

function ReportCard({title,subtitle,children,onExport}){
  return <section className="module-page-card report-card">
    <header className="report-card-head"><div><strong>{title}</strong>{subtitle?<span>{subtitle}</span>:null}</div>{onExport?<button onClick={onExport}><Download size={12}/> CSV</button>:null}</header>
    {children}
  </section>
}

function exportCsv(name,columns,rows){
  const escape=value=>`"${String(value??'').replaceAll('"','""')}"`
  const csv=[columns.map(c=>escape(c[1])).join(','),...rows.map(row=>columns.map(c=>escape(row[c[0]])).join(','))].join('\n')
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a')
  a.href=url;a.download=`${name}-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(url)
}

function Table({columns,rows,currency='GBP'}){
  return <div className="module-table-wrap no-border report-table-wrap"><table><thead><tr>{columns.map(c=><th key={c[0]}>{c[1]}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={row.id||row.key||index}>{columns.map(([key,,type])=><td key={key}>{type==='money'?money(row[key],currency):type==='date'?when(row[key]):row[key]??'—'}</td>)}</tr>)}</tbody></table></div>
}

function SimpleEndpointReport({title,load,columns,currency,refreshKey}){
  const state=useLoad(load,refreshKey)
  const rows=Array.isArray(state.data)?state.data:[]
  return <ReportCard title={title} subtitle={`${rows.length} rows`} onExport={rows.length?()=>exportCsv(title.toLowerCase().replaceAll(' ','-'),columns,rows):null}>
    {state.loading?<div className="module-state">Loading {title.toLowerCase()}…</div>:state.error?<div className="module-inline-error">{state.error}</div>:rows.length?<Table columns={columns} rows={rows} currency={currency}/>:<div className="module-state">No data for this range.</div>}
  </ReportCard>
}

function SalesReports({from,to,currency,refreshKey}){
  const [by,setBy]=useState('day'),[storeId,setStoreId]=useState(''),[stores,setStores]=useState([]),[admin,setAdmin]=useState(false)
  useEffect(()=>{
    apiRequest('/api/auth/me/permissions').then(r=>{
      const yes=r?.data?.isAdmin===true;setAdmin(yes)
      if(yes)apiRequest('/api/admin/stores').then(s=>setStores((s?.data||[]).filter(x=>x.active!==false))).catch(()=>{})
    }).catch(()=>{})
  },[])
  const state=useLoad(()=>getSalesOverview({by,from,to,storeId}),refreshKey,[by,from,to,storeId])
  const data=state.data||{},rows=data.rows||[],totals=data.totals||{},payments=data.payments||[]
  const first={day:'Date',store:'Store',user:'Operator',product:'Product'}[by]
  const columns=[
    ['label',first],['count_sales','Sales count'],['total_qty','Quantity'],['total_sales','Sales','money'],
    ['total_discount','Discount','money'],['total_tax','Tax','money'],['total_returns','Returns','money'],['net_sales','Net sales','money'],
  ]
  const paymentCols=[['method','Method'],['count_sales','Sales count'],['total_sales','Total','money']]
  return <div className="report-stack">
    <section className="module-panel report-toolbar">
      <div className="module-segmented">{[['day','By Day'],['store','By Store'],['user','By Operator'],['product','By Product']].map(([k,l])=><button key={k} className={by===k?'is-active':''} onClick={()=>setBy(k)}>{l}</button>)}</div>
      {admin&&stores.length?<select value={storeId} onChange={e=>setStoreId(e.target.value)}><option value="">All accessible stores</option>{stores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>:null}
    </section>
    {state.error?<div className="module-inline-error">{state.error}</div>:null}
    <div className="report-kpis">{[
      ['Sales count',totals.count_sales||0],['Quantity',Number(totals.total_qty||0).toLocaleString()],
      ['Sales',money(totals.total_sales,currency)],['Discount',money(totals.total_discount,currency)],
      ['Tax',money(totals.total_tax,currency)],['Returns',money(totals.total_returns,currency)],['Net sales',money(totals.net_sales,currency)]
    ].map(([l,v])=><div key={l}><span>{l}</span><strong>{v}</strong></div>)}</div>
    <ReportCard title={`Sales ${first.toLowerCase()}`} subtitle={`${rows.length} groups`} onExport={rows.length?()=>exportCsv(`sales-by-${by}`,columns,rows):null}>
      {state.loading?<div className="module-state">Loading sales report…</div>:rows.length?<Table columns={columns} rows={rows} currency={currency}/>:<div className="module-state">No sales for this range.</div>}
    </ReportCard>
    <ReportCard title="Payment methods"><Table columns={paymentCols} rows={payments} currency={currency}/></ReportCard>
  </div>
}

function InventoryReport({from,to,currency,refreshKey}){
  const state=useLoad(()=>getInventoryOverview({dateFrom:from,dateTo:to}),refreshKey,[from,to])
  const rows=Array.isArray(state.data)?state.data:[]
  const cols=[['product','Product'],['sku','SKU'],['ean','EAN'],['category','Category'],['stock_quantity','Stock'],['cost_price','Cost','money'],['stock_value','Stock value','money'],['low_stock','Low stock']]
  return <ReportCard title="Inventory overview" subtitle={`${rows.length} products`} onExport={rows.length?()=>exportCsv('inventory-overview',cols,rows):null}>
    {state.loading?<div className="module-state">Loading inventory…</div>:state.error?<div className="module-inline-error">{state.error}</div>:<Table columns={cols} rows={rows} currency={currency}/>}
  </ReportCard>
}

function StockMovementsReport({from,to,currency,refreshKey}){
  const [filter,setFilter]=useState({movementTypes:'',reason:'',productId:'',category:''})
  const state=useLoad(()=>getInventoryMovements({
    dateFrom:from,dateTo:to,
    movementTypes:filter.movementTypes?[filter.movementTypes]:[],
    reason:filter.reason,productId:filter.productId,category:filter.category,
  }),refreshKey,[from,to,filter.movementTypes,filter.reason,filter.productId,filter.category])
  const payload=state.data||{},rows=payload.rows||[]
  const cols=[['createdAt','Date','date'],['product','Product'],['category','Category'],['storeName','Store'],['movementType','Movement'],['quantityChange','Qty'],['lineValue','Value','money'],['balanceAfter','Balance'],['referenceType','Reference'],['reason','Reason']]
  return <div className="report-stack">
    <section className="module-panel report-toolbar report-filter-grid">
      <select value={filter.movementTypes} onChange={e=>setFilter(v=>({...v,movementTypes:e.target.value}))}><option value="">All movement types</option>{['OPENING','PURCHASE','SALE','CUSTOMER_RETURN','SUPPLIER_RETURN','ADJUSTMENT_IN','ADJUSTMENT_OUT','RETURN_IN','RETURN_OUT','ONLINE_RESERVE','ONLINE_RELEASE'].map(x=><option key={x}>{x}</option>)}</select>
      <select value={filter.reason} onChange={e=>setFilter(v=>({...v,reason:e.target.value}))}><option value="">All reasons</option><option>Wastage</option><option>Breakage</option><option>Other</option></select>
      <input placeholder="Product ID" value={filter.productId} onChange={e=>setFilter(v=>({...v,productId:e.target.value}))}/>
      <input placeholder="Category" value={filter.category} onChange={e=>setFilter(v=>({...v,category:e.target.value}))}/>
    </section>
    <div className="report-kpis"><div><span>Rows</span><strong>{payload.total||0}</strong></div><div><span>Total quantity</span><strong>{payload.quantity||0}</strong></div><div><span>Movement value</span><strong>{money(payload.value,currency)}</strong></div></div>
    <ReportCard title="Stock movement ledger" onExport={rows.length?()=>exportCsv('stock-movements',cols,rows):null}>
      {state.loading?<div className="module-state">Loading stock movements…</div>:state.error?<div className="module-inline-error">{state.error}</div>:<Table columns={cols} rows={rows} currency={currency}/>}
    </ReportCard>
  </div>
}

function VatReport({from,to,currency,refreshKey}){
  const state=useLoad(()=>getVat(from,to),refreshKey,[from,to]),v=state.data
  const rows=v?[
    {metric:'Gross sales (incl. VAT)',value:money(v.grossSales,currency)},
    {metric:'Discounts',value:money(v.discounts,currency)},
    {metric:'Net sales (after returns)',value:money(v.netSales,currency)},
    {metric:'Sales excluding VAT',value:money(v.salesExVat,currency)},
    {metric:'VAT collected',value:money(v.vat,currency)},
    {metric:'Returns',value:money(v.returns,currency)},
    {metric:'VAT on returns',value:money(v.returnsVat,currency)},
    {metric:'VAT after returns',value:money(v.vatAfterReturns,currency)},
  ]:[]
  return <ReportCard title="VAT Summary">{state.loading?<div className="module-state">Loading VAT…</div>:state.error?<div className="module-inline-error">{state.error}</div>:<Table columns={[['metric','Metric'],['value','Value']]} rows={rows}/>}</ReportCard>
}

function TillCloseReport({from,to,currency,refreshKey}){
  const state=useLoad(()=>getTill(from,to),refreshKey,[from,to])
  const sessions=state.data?.sessions||[],summary=state.data?.summary||{}
  return <div className="report-stack">
    <div className="report-kpis"><div><span>Sessions</span><strong>{summary.sessions||0}</strong></div><div><span>Total variance</span><strong>{money(summary.difference,currency)}</strong></div></div>
    <ReportCard title="Daily Till Close">
      {state.loading?<div className="module-state">Loading till sessions…</div>:state.error?<div className="module-inline-error">{state.error}</div>:sessions.length?<div className="till-report-list">{sessions.map(s=><TillSessionRow key={s.id} session={s} currency={currency}/>)}</div>:<div className="module-state">No till sessions for this range.</div>}
    </ReportCard>
  </div>
}

function TillSessionRow({session,currency}){
  const [open,setOpen]=useState(false),[detail,setDetail]=useState(null),[error,setError]=useState('')
  const expand=async()=>{
    const next=!open;setOpen(next)
    if(next&&!detail){
      try{const r=await getTillSession(session.id);if(!r?.success)throw new Error(r?.message);setDetail(r.data)}
      catch(err){setError(err?.message||'Unable to load session detail')}
    }
  }
  return <article className="till-report-row">
    <button onClick={expand}>{open?<ChevronDown size={13}/>:<ChevronRight size={13}/>}<span>{session.terminal||'Till'}</span><span>{session.businessDate||session.openedAt?.slice?.(0,10)||'—'}</span><span>{session.openedBy||'—'}</span><span>{session.status}</span><strong>{session.difference==null?'—':money(session.difference,currency)}</strong></button>
    {open?<div className="till-report-detail">
      {error?<div className="module-inline-error">{error}</div>:!detail?<div className="module-state compact">Loading detail…</div>:<>
        <div className="report-kpis compact">{[
          ['Opening',detail.session?.openingCash],['Cash sales',detail.session?.cashSales],['Refunds',detail.session?.cashRefunds],['Cash in',detail.session?.cashIn],['Cash out',detail.session?.cashOut],['Expected',detail.session?.expectedClosing],['Actual',detail.session?.actualClosing],['Variance',detail.session?.difference]
        ].map(([l,v])=><div key={l}><span>{l}</span><strong>{v==null?'—':money(v,currency)}</strong></div>)}</div>
        <Table columns={[['createdAt','Date','date'],['username','User'],['type','Type'],['reason','Reason'],['amount','Amount','money']]} rows={detail.movements||[]} currency={currency}/>
      </>}
    </div>:null}
  </article>
}
