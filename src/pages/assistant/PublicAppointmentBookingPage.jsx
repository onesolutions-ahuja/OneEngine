import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, CheckCircle2, Clock3 } from 'lucide-react'
import { apiRequest } from '../../services/api'

function tokenFromPath(){
  const parts=window.location.pathname.split('/').filter(Boolean)
  const i=parts.indexOf('book')
  return i>=0&&parts[i+1]?decodeURIComponent(parts[i+1]):''
}
function dayRange(date){
  const start=new Date((date||new Date().toISOString().slice(0,10))+'T00:00:00')
  const end=new Date(start); end.setDate(end.getDate()+14)
  return {from:start.toISOString(),to:end.toISOString()}
}

export default function PublicAppointmentBookingPage({token:tokenProp}){
  const token=tokenProp||tokenFromPath()
  const [data,setData]=useState(null)
  const [serviceId,setServiceId]=useState('')
  const [date,setDate]=useState(()=>new Date().toISOString().slice(0,10))
  const [slots,setSlots]=useState([])
  const [loading,setLoading]=useState(true)
  const [finding,setFinding]=useState(false)
  const [saving,setSaving]=useState('')
  const [error,setError]=useState('')
  const [result,setResult]=useState(null)

  const services=Array.isArray(data?.services)?data.services:[]
  const selectedService=useMemo(()=>services.find(s=>s.id===serviceId)||null,[services,serviceId])

  const load=async()=>{
    try{
      setLoading(true);setError('')
      const r=await apiRequest('/api/public/assistant/book/'+encodeURIComponent(token))
      if(!r?.success)throw new Error(r?.message||'Unable to open booking link')
      setData(r.data)
      const availableServices=Array.isArray(r.data?.services)?r.data.services:[]
      if(r.data?.selectedServiceId)setServiceId(r.data.selectedServiceId)
      else if(availableServices.length===1)setServiceId(availableServices[0].id)
    }catch(err){setError(err?.message||'This booking link is unavailable')}
    finally{setLoading(false)}
  }
  useEffect(()=>{void load()},[token])

  const findSlots=async()=>{
    if(!serviceId)return setError('Choose a service first.')
    try{
      setFinding(true);setError('')
      const range=dayRange(date)
      const qs=new URLSearchParams({serviceId,from:range.from,to:range.to,limit:'20'})
      const r=await apiRequest('/api/public/assistant/book/'+encodeURIComponent(token)+'?'+qs.toString())
      if(!r?.success)throw new Error(r?.message||'Unable to load available times')
      setSlots(Array.isArray(r.data?.slots)?r.data.slots:[])
      if(!r.data?.slots?.length)setError('No available times were found in this period.')
    }catch(err){setError(err?.message||'Unable to load available times')}
    finally{setFinding(false)}
  }

  const selectSlot=async(slot)=>{
    try{
      setSaving(slot.startsAt);setError('')
      const r=await apiRequest('/api/public/assistant/book/'+encodeURIComponent(token)+'/select',{
        method:'POST',
        body:JSON.stringify({
          serviceId,
          resourceId:slot.resourceId,
          startsAt:slot.startsAt,
          endsAt:slot.endsAt,
        })
      })
      if(!r?.success)throw new Error(r?.message||'Unable to reserve this appointment')
      setResult(r.data)
    }catch(err){setError(err?.message||'Unable to reserve this appointment')}
    finally{setSaving('')}
  }

  if(loading)return <main className="login-page"><section className="module-page-card" style={{maxWidth:720,margin:'10vh auto'}}>Loading booking…</section></main>
  if(error&&!data)return <main className="login-page"><section className="module-page-card" style={{maxWidth:720,margin:'10vh auto'}}><h1>Booking link unavailable</h1><p>{error}</p></section></main>

  if(result)return <main className="login-page">
    <section className="module-page-card" style={{maxWidth:720,margin:'8vh auto'}}>
      <CheckCircle2 size={34}/>
      <h1>{result.requiresPayment?'Appointment slot reserved':'Appointment confirmed'}</h1>
      <p>{result.requiresPayment
        ? 'Your slot is temporarily reserved. Please use the payment link sent through your booking channel to complete the booking.'
        : 'Your appointment is confirmed. A confirmation message will be sent through your booking channel.'}</p>
      {result.amountDue>0?<div className="product-stats"><div><span>Amount due</span><strong>{result.currency} {Number(result.amountDue).toFixed(2)}</strong></div></div>:null}
    </section>
  </main>

  return <main className="login-page">
    <section className="module-page-card" style={{maxWidth:840,margin:'5vh auto'}}>
      <div style={{display:'flex',gap:12,alignItems:'center'}}><CalendarDays size={28}/><div><span>OneAssistant</span><h1>Book an appointment</h1></div></div>
      <p>Choose a service and an available time. No account or sign-in is required.</p>
      {data?.expiresAt?<div className="module-page-card" style={{margin:'12px 0',padding:12}}>
        <strong><Clock3 size={14} style={{verticalAlign:'middle',marginRight:6}}/>Temporary booking link</strong>
        <div>This link expires 15 minutes after it was issued. Current expiry: {new Date(data.expiresAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}.</div>
      </div>:null}
      {error?<div className="module-inline-error" style={{marginBottom:12}}>{error}</div>:null}
      {services.length===0?<div className="module-page-card" style={{margin:'12px 0',padding:14}}>
        <strong>No appointment services are configured yet.</strong>
        <div style={{marginTop:4}}>Please contact the business to complete its OneAssistant setup before booking.</div>
      </div>:null}
      <div className="customer-editor-grid">
        {services.length===1
          ? <div className="module-input-label">
              <span>Service</span>
              <div className="module-page-card" style={{padding:12}}>
                <strong>{services[0].name}</strong>
                <div>{services[0].duration_minutes} min · {services[0].currency} {Number(services[0].price||0).toFixed(2)}</div>
              </div>
            </div>
          : <label className="module-input-label"><span>Service</span><select value={serviceId} disabled={services.length===0} onChange={e=>{setServiceId(e.target.value);setSlots([])}}><option value="">{services.length===0?'No services available':'Choose service'}</option>{services.map(s=><option key={s.id} value={s.id}>{s.name} · {s.duration_minutes} min</option>)}</select></label>}
        <label className="module-input-label"><span>Search from</span><input type="date" value={date} onChange={e=>{setDate(e.target.value);setSlots([])}}/></label>
      </div>
      {selectedService?<div className="product-stats" style={{marginTop:12}}><div><span>Service</span><strong>{selectedService.name}</strong></div><div><span>Price</span><strong>{selectedService.currency} {Number(selectedService.price||0).toFixed(2)}</strong></div><div><span>Payment</span><strong>{String(selectedService.payment_policy||'NO_ADVANCE').replaceAll('_',' ')}</strong></div></div>:null}
      <button type="button" className="module-primary-button" onClick={findSlots} disabled={finding||!serviceId}>{finding?'Finding…':'Find available times'}</button>
      <div style={{display:'grid',gap:8,marginTop:16}}>
        {slots.map(slot=><button type="button" key={slot.resourceId+slot.startsAt} onClick={()=>selectSlot(slot)} disabled={Boolean(saving)} style={{display:'flex',alignItems:'center',gap:10,justifyContent:'space-between'}}>
          <span><Clock3 size={14}/> {new Date(slot.startsAt).toLocaleString([], {dateStyle:'medium',timeStyle:'short'})}</span>
          <strong>{saving===slot.startsAt?'Reserving…':'Select'}</strong>
        </button>)}
      </div>
    </section>
  </main>
}
