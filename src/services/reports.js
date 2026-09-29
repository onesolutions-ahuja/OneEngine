import { apiRequest } from './api'

const buildDateQuery=(from,to)=>`?dateFrom=${encodeURIComponent(from||'')}&dateTo=${encodeURIComponent(to||'')}`

export const getSummary=(from,to)=>apiRequest(`/api/reports/summary${buildDateQuery(from,to)}`)
export const getSales=(from,to)=>apiRequest(`/api/reports/sales${buildDateQuery(from,to)}`)
export const getProducts=(from,to)=>apiRequest(`/api/reports/products${buildDateQuery(from,to)}`)
export const getPayments=(from,to)=>apiRequest(`/api/reports/payments${buildDateQuery(from,to)}`)
export const getCustomers=(from,to)=>apiRequest(`/api/reports/customers${buildDateQuery(from,to)}`)
export const getTill=(from,to)=>apiRequest(`/api/reports/till${buildDateQuery(from,to)}`)
export const getVat=(from,to)=>apiRequest(`/api/reports/vat${buildDateQuery(from,to)}`)
export const getTillSession=(id)=>apiRequest(`/api/reports/till/${encodeURIComponent(id)}`)

export function getSalesOverview({by='day',from,to,storeId='',userId=''}={}){
  const qs=new URLSearchParams({by,dateFrom:from||'',dateTo:to||''})
  if(storeId)qs.set('storeId',storeId)
  if(userId)qs.set('userId',userId)
  return apiRequest(`/api/reports/sales/overview?${qs}`)
}

export function getInventoryOverview({dateFrom='',dateTo='',limit=1000,offset=0}={}){
  const qs=new URLSearchParams({
    dateFrom,dateTo,
    limit:String(Math.max(1,Math.min(10000,Number(limit)||1000))),
    offset:String(Math.max(0,Number(offset)||0)),
  })
  return apiRequest(`/api/reports/inventory-overview?${qs}`)
}

export function getInventoryMovements({
  companyId='current',storeId='current',dateFrom='',dateTo='',productIds=[],
  movementTypes=[],reason='',productId='',category='',limit=500,offset=0,
}={}){
  const qs=new URLSearchParams({
    companyId,storeId,dateFrom,dateTo,
    productIds:(productIds||[]).join(','),
    movementTypes:(movementTypes||[]).join(','),
    limit:String(Math.max(1,Math.min(10000,Number(limit)||500))),
    offset:String(Math.max(0,Number(offset)||0)),
  })
  if(reason)qs.set('reason',reason)
  if(productId)qs.set('productId',productId)
  if(category)qs.set('category',category)
  return apiRequest(`/api/reports/inventory-movements?${qs}`)
}

export const getCustomReportMetadata=()=>apiRequest('/api/reports/custom/metadata')
export const getPlatformReportFields=(objectId)=>apiRequest(`/api/reports/custom/platform-objects/${encodeURIComponent(objectId)}/metadata`)
export const getCustomReports=()=>apiRequest('/api/reports/custom')
export const createCustomReport=(definition)=>apiRequest('/api/reports/custom',{method:'POST',body:JSON.stringify(definition)})
export const updateCustomReport=(id,definition)=>apiRequest(`/api/reports/custom/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify(definition)})
export const runCustomReport=(id,definition={})=>apiRequest(`/api/reports/custom/${encodeURIComponent(id)}/run`,{method:'POST',body:JSON.stringify(definition)})
export const previewCustomReport=(definition)=>apiRequest('/api/reports/custom/preview',{method:'POST',body:JSON.stringify(definition)})
export const duplicateCustomReport=(id)=>apiRequest(`/api/reports/custom/${encodeURIComponent(id)}/duplicate`,{method:'POST'})
export const archiveCustomReport=(id)=>apiRequest(`/api/reports/custom/${encodeURIComponent(id)}`,{method:'DELETE'})
export const updateCustomReportUsers=(id,userIds)=>apiRequest(`/api/reports/custom/${encodeURIComponent(id)}/users`,{method:'PUT',body:JSON.stringify({userIds})})
