import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, List, Plus, RefreshCw, Search, Settings2 } from 'lucide-react'
import { apiRequest } from '../../services/api'
import RecordModal from '../../components/RecordModal'
import { AdvancedRecordView, TableView } from '../../components/platform/CustomPageRenderer'

function dayRange(dateValue){
  const base=dateValue?new Date(dateValue+'T00:00:00'):new Date()
  const start=new Date(base); start.setHours(0,0,0,0)
  const end=new Date(start); end.setDate(end.getDate()+1)
  return {from:start.toISOString(),to:end.toISOString()}
}
function dateInput(value){
  if(!value)return new Date().toISOString().slice(0,10)
  const d=new Date(value)
  return Number.isNaN(d.getTime())?new Date().toISOString().slice(0,10):d.toISOString().slice(0,10)
}
function fmt(value){
  if(!value)return '—'
  const d=new Date(value)
  return Number.isNaN(d.getTime())?String(value):d.toLocaleString([], {dateStyle:'medium',timeStyle:'short'})
}
function statusLabel(value){
  return String(value||'').replace(/_/g,' ').toLowerCase().replace(/\b\w/g,m=>m.toUpperCase())
}

const calendarNode={
  id:'oneassistant-calendar',
  componentKey:'calendar',
  clickable:true,
  interaction:{type:'record'},
  config:{startField:'starts_at',endField:'ends_at',titleField:'display_title'},
}
const tableNode={
  id:'oneassistant-list',
  componentKey:'table',
  clickable:true,
  interaction:{type:'record'},
  collection:{fields:['starts_at','display_title','service_name','resource_name','status','payment_status'],maxRecords:500},
}

export default function OneAssistantPage(){
  const [view,setView]=useState('calendar')
  const [appointments,setAppointments]=useState([])
  const [services,setServices]=useState([])
  const [resources,setResources]=useState([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const [query,setQuery]=useState('')
  const [editor,setEditor]=useState(null)
  const [detail,setDetail]=useState(null)
  const [serviceEditor,setServiceEditor]=useState(false)
  const [resourceEditor,setResourceEditor]=useState(false)

  const load=async()=>{
    try{
      setLoading(true); setError('')
      const responses=await Promise.all([
        apiRequest('/api/appointments'),
        apiRequest('/api/appointments/services'),
        apiRequest('/api/appointments/resources'),
      ])
      const a=responses[0], s=responses[1], r=responses[2]
      if(!a?.success)throw new Error(a?.message||'Unable to load appointments')
      setAppointments(Array.isArray(a.data)?a.data:[])
      setServices(Array.isArray(s?.data)?s.data:[])
      setResources(Array.isArray(r?.data)?r.data:[])
    }catch(err){ setError(err?.message||'Unable to load OneAssistant') }
    finally{ setLoading(false) }
  }

  useEffect(()=>{ void load() },[])

  const rows=useMemo(()=>appointments.map(row=>({
    ...row,
    display_title:row.customer_name||row.service_name||'Appointment',
  })).filter(row=>{
    const text=[row.display_title,row.service_name,row.resource_name,row.status,row.customer_phone,row.customer_email].join(' ').toLowerCase()
    return !query.trim()||text.includes(query.trim().toLowerCase())
  }),[appointments,query])

  const calendarData={ [calendarNode.id]:{records:rows,loading,error,placeholder:false} }
  const tableData={records:rows,fields:tableNode.collection.fields,loading,error,placeholder:false,total:rows.length,page:1,onPageChange:()=>{}}
  const upcoming=appointments.filter(a=>new Date(a.starts_at)>=new Date()&&!['CANCELLED','COMPLETED','NO_SHOW'].includes(a.status)).length
  const today=appointments.filter(a=>dateInput(a.starts_at)===dateInput(new Date())).length

  return <section className="module-page oneassistant-page">
    <header className="module-page-header">
      <div><span>OneAssistant</span><h1>Appointments</h1><p>Calendar and list views powered by the shared OneEngine components.</p></div>
      <div className="module-header-actions">
        <button type="button" onClick={()=>load()} disabled={loading}><RefreshCw size={14}/> Refresh</button>
        <button type="button" className="module-primary-button" onClick={()=>setEditor({})}><Plus size={14}/> New Appointment</button>
      </div>
    </header>

    {message?<div className="module-success module-page-message"><strong>{message}</strong></div>:null}
    {error?<div className="module-inline-error module-page-message">{error}</div>:null}

    <div className="product-stats">
      <div><span>Total Appointments</span><strong>{appointments.length}</strong></div>
      <div><span>Today</span><strong>{today}</strong></div>
      <div><span>Upcoming</span><strong>{upcoming}</strong></div>
    </div>

    <section className="module-page-card">
      <div style={{display:'flex',gap:10,alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',marginBottom:14}}>
        <div style={{display:'flex',gap:8}}>
          <button type="button" className={view==='calendar'?'module-primary-button':''} onClick={()=>setView('calendar')}><CalendarDays size={14}/> Calendar</button>
          <button type="button" className={view==='list'?'module-primary-button':''} onClick={()=>setView('list')}><List size={14}/> List</button>
          <button type="button" className={view==='setup'?'module-primary-button':''} onClick={()=>setView('setup')}><Settings2 size={14}/> Setup</button>
        </div>
        <label style={{display:'flex',alignItems:'center',gap:8,minWidth:260}}>
          <Search size={14}/>
          <input style={{width:'100%'}} placeholder="Search appointments" value={query} onChange={e=>setQuery(e.target.value)}/>
        </label>
      </div>

      {view==='setup'
        ? <AssistantSetup services={services} resources={resources} onNewService={()=>setServiceEditor(true)} onNewResource={()=>setResourceEditor(true)}/>
        : loading&&!appointments.length
          ? <div className="module-state">Loading appointments…</div>
          : view==='calendar'
            ? <AdvancedRecordView node={calendarNode} data={calendarData} builderMode={false} onRecordClick={({record})=>setDetail(record)}/>
            : <TableView node={tableNode} builderMode={false} data={tableData} onRecordClick={({record})=>setDetail(record)}/>
      }
    </section>

    {editor?<AppointmentEditor
      appointment={editor}
      services={services}
      resources={resources}
      onClose={()=>setEditor(null)}
      onSaved={async text=>{setEditor(null);setMessage(text);await load()}}
    />:null}

    {detail?<AppointmentDetail
      appointment={detail}
      onClose={()=>setDetail(null)}
      onEdit={()=>{setEditor(detail);setDetail(null)}}
      onChanged={async text=>{setDetail(null);setMessage(text);await load()}}
    />:null}

    {serviceEditor?<ServiceEditor onClose={()=>setServiceEditor(false)} onSaved={async()=>{setServiceEditor(false);setMessage('Service created.');await load()}}/>:null}
    {resourceEditor?<ResourceEditor services={services} onClose={()=>setResourceEditor(false)} onSaved={async()=>{setResourceEditor(false);setMessage('Resource created with availability.');await load()}}/>:null}
  </section>
}

function AssistantSetup({services,resources,onNewService,onNewResource}){
  return <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:16}}>
    <section className="module-page-card" style={{margin:0}}>
      <div className="customer-section-head"><strong>Services</strong><button type="button" onClick={onNewService}><Plus size={13}/> New service</button></div>
      <div className="customer-loyalty-list">{services.length?services.map(service=><div key={service.id}><div><strong>{service.name}</strong><span>{service.duration_minutes} min · {service.payment_policy}</span></div><div><b>{service.currency} {Number(service.price||0).toFixed(2)}</b></div></div>):<div className="module-state compact">No services yet.</div>}</div>
    </section>
    <section className="module-page-card" style={{margin:0}}>
      <div className="customer-section-head"><strong>Resources / Staff</strong><button type="button" onClick={onNewResource}><Plus size={13}/> New resource</button></div>
      <div className="customer-loyalty-list">{resources.length?resources.map(resource=><div key={resource.id}><div><strong>{resource.name}</strong><span>{resource.resource_type||'STAFF'}</span></div><div><b>{resource.active===false?'Inactive':'Active'}</b></div></div>):<div className="module-state compact">No resources yet.</div>}</div>
    </section>
  </div>
}

function ServiceEditor({onClose,onSaved}){
  const [values,setValues]=useState({name:'',description:'',durationMinutes:30,price:0,currency:'GBP',paymentPolicy:'NO_ADVANCE',depositValue:0})
  const [saving,setSaving]=useState(false),[error,setError]=useState('')
  const save=async()=>{
    if(!values.name.trim())return setError('Service name is required.')
    try{
      setSaving(true);setError('')
      const result=await apiRequest('/api/appointments/services',{method:'POST',body:JSON.stringify(values)})
      if(!result?.success)throw new Error(result?.message||'Unable to create service')
      await onSaved?.()
    }catch(err){setError(err?.message||'Unable to create service')}finally{setSaving(false)}
  }
  return <RecordModal open mode="create" title="New Service" subtitle="Create a bookable service." saving={saving} saveLabel="Create Service" onClose={onClose} onSave={save}>
    {error?<div className="module-inline-error" style={{marginBottom:12}}>{error}</div>:null}
    <div className="customer-editor-grid">
      <label className="module-input-label"><span>Name</span><input value={values.name} onChange={e=>setValues(v=>({...v,name:e.target.value}))}/></label>
      <label className="module-input-label"><span>Duration (minutes)</span><input type="number" min="5" value={values.durationMinutes} onChange={e=>setValues(v=>({...v,durationMinutes:Number(e.target.value)}))}/></label>
      <label className="module-input-label"><span>Price</span><input type="number" min="0" step="0.01" value={values.price} onChange={e=>setValues(v=>({...v,price:Number(e.target.value)}))}/></label>
      <label className="module-input-label"><span>Currency</span><input value={values.currency} onChange={e=>setValues(v=>({...v,currency:e.target.value.toUpperCase()}))}/></label>
      <label className="module-input-label"><span>Payment policy</span><select value={values.paymentPolicy} onChange={e=>setValues(v=>({...v,paymentPolicy:e.target.value}))}><option value="NO_ADVANCE">No advance</option><option value="FIXED_DEPOSIT">Fixed deposit</option><option value="PERCENT_DEPOSIT">Percent deposit</option><option value="FULL_PAYMENT">Full payment</option></select></label>
      {values.paymentPolicy!=='NO_ADVANCE'&&values.paymentPolicy!=='FULL_PAYMENT'?<label className="module-input-label"><span>Deposit value</span><input type="number" min="0" step="0.01" value={values.depositValue} onChange={e=>setValues(v=>({...v,depositValue:Number(e.target.value)}))}/></label>:null}
      <label className="module-textarea-label customer-full"><span>Description</span><textarea rows={3} value={values.description} onChange={e=>setValues(v=>({...v,description:e.target.value}))}/></label>
    </div>
  </RecordModal>
}

function ResourceEditor({services,onClose,onSaved}){
  const [values,setValues]=useState({name:'',resourceType:'STAFF',serviceIds:[],weekdays:[1,2,3,4,5],startTime:'09:00',endTime:'17:00',slotIntervalMinutes:15})
  const [saving,setSaving]=useState(false),[error,setError]=useState('')
  const toggleService=id=>setValues(v=>({...v,serviceIds:v.serviceIds.includes(id)?v.serviceIds.filter(x=>x!==id):[...v.serviceIds,id]}))
  const toggleDay=day=>setValues(v=>({...v,weekdays:v.weekdays.includes(day)?v.weekdays.filter(x=>x!==day):[...v.weekdays,day].sort()}))
  const save=async()=>{
    if(!values.name.trim())return setError('Resource name is required.')
    if(!values.serviceIds.length)return setError('Select at least one service.')
    if(!values.weekdays.length)return setError('Select at least one working day.')
    try{
      setSaving(true);setError('')
      const result=await apiRequest('/api/appointments/resources',{method:'POST',body:JSON.stringify({
        name:values.name,resourceType:values.resourceType,serviceIds:values.serviceIds,
        availability:{weekdays:values.weekdays,startTime:values.startTime,endTime:values.endTime,slotIntervalMinutes:values.slotIntervalMinutes}
      })})
      if(!result?.success)throw new Error(result?.message||'Unable to create resource')
      await onSaved?.()
    }catch(err){setError(err?.message||'Unable to create resource')}finally{setSaving(false)}
  }
  const days=[['Sun',0],['Mon',1],['Tue',2],['Wed',3],['Thu',4],['Fri',5],['Sat',6]]
  return <RecordModal open mode="create" title="New Resource" subtitle="Assign services and normal working hours." size="lg" saving={saving} saveLabel="Create Resource" onClose={onClose} onSave={save}>
    {error?<div className="module-inline-error" style={{marginBottom:12}}>{error}</div>:null}
    <div className="customer-editor-grid">
      <label className="module-input-label"><span>Name</span><input value={values.name} onChange={e=>setValues(v=>({...v,name:e.target.value}))}/></label>
      <label className="module-input-label"><span>Type</span><select value={values.resourceType} onChange={e=>setValues(v=>({...v,resourceType:e.target.value}))}><option value="STAFF">Staff</option><option value="ROOM">Room</option><option value="BAY">Bay</option><option value="RESOURCE">Resource</option></select></label>
      <div className="customer-full"><span style={{display:'block',fontSize:12,fontWeight:600,marginBottom:8}}>Services</span><div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{services.filter(s=>s.active!==false).map(s=><button type="button" key={s.id} className={values.serviceIds.includes(s.id)?'module-primary-button':''} onClick={()=>toggleService(s.id)}>{s.name}</button>)}</div></div>
      <div className="customer-full"><span style={{display:'block',fontSize:12,fontWeight:600,marginBottom:8}}>Working days</span><div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{days.map(([label,day])=><button type="button" key={day} className={values.weekdays.includes(day)?'module-primary-button':''} onClick={()=>toggleDay(day)}>{label}</button>)}</div></div>
      <label className="module-input-label"><span>Start time</span><input type="time" value={values.startTime} onChange={e=>setValues(v=>({...v,startTime:e.target.value}))}/></label>
      <label className="module-input-label"><span>End time</span><input type="time" value={values.endTime} onChange={e=>setValues(v=>({...v,endTime:e.target.value}))}/></label>
      <label className="module-input-label"><span>Slot interval</span><select value={values.slotIntervalMinutes} onChange={e=>setValues(v=>({...v,slotIntervalMinutes:Number(e.target.value)}))}><option value="5">5 min</option><option value="10">10 min</option><option value="15">15 min</option><option value="30">30 min</option><option value="60">60 min</option></select></label>
    </div>
  </RecordModal>
}

function AppointmentEditor({appointment,services,resources,onClose,onSaved}){
  const editing=Boolean(appointment?.id)
  const [values,setValues]=useState({
    serviceId:appointment?.service_id||services[0]?.id||'',
    resourceId:appointment?.resource_id||'',
    date:dateInput(appointment?.starts_at),
    customerName:appointment?.customer_name||'',
    customerPhone:appointment?.customer_phone||'',
    customerEmail:appointment?.customer_email||'',
    notes:appointment?.notes||'',
    status:appointment?.status||'CONFIRMED',
  })
  const [slots,setSlots]=useState([])
  const [selectedSlot,setSelectedSlot]=useState(appointment?.starts_at?{startsAt:appointment.starts_at,endsAt:appointment.ends_at,resourceId:appointment.resource_id}:null)
  const [finding,setFinding]=useState(false)
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')

  const findSlots=async()=>{
    if(!values.serviceId)return setError('Choose a service first.')
    try{
      setFinding(true); setError('')
      const range=dayRange(values.date)
      const params=new URLSearchParams({serviceId:values.serviceId,from:range.from,to:range.to,limit:'20'})
      if(values.resourceId)params.set('resourceId',values.resourceId)
      const response=await apiRequest('/api/appointments/availability?'+params.toString())
      if(!response?.success)throw new Error(response?.message||'Unable to find slots')
      const found=Array.isArray(response.data)?response.data:[]
      setSlots(found); setSelectedSlot(null)
      if(!found.length)setError('No available slots for this date.')
    }catch(err){ setError(err?.message||'Unable to find slots') }
    finally{ setFinding(false) }
  }

  const save=async()=>{
    try{
      setSaving(true); setError('')
      if(editing){
        const result=await apiRequest('/api/appointments/'+encodeURIComponent(appointment.id),{
          method:'PATCH',
          body:JSON.stringify({status:values.status,notes:values.notes,customerName:values.customerName,customerPhone:values.customerPhone,customerEmail:values.customerEmail})
        })
        if(!result?.success)throw new Error(result?.message||'Unable to update appointment')
        await onSaved?.('Appointment updated.')
        return
      }

      if(!selectedSlot)throw new Error('Find and select an available slot.')
      const idempotency=['ui',values.serviceId,selectedSlot.resourceId,selectedSlot.startsAt].join(':')
      const hold=await apiRequest('/api/appointments/holds',{
        method:'POST',
        body:JSON.stringify({
          serviceId:values.serviceId,
          resourceId:selectedSlot.resourceId,
          storeId:selectedSlot.storeId||null,
          startsAt:selectedSlot.startsAt,
          endsAt:selectedSlot.endsAt,
          holdMinutes:10,
          idempotencyKey:idempotency,
        })
      })
      if(!hold?.success||!hold?.data?.id)throw new Error(hold?.message||'Unable to hold appointment slot')
      const confirmed=await apiRequest('/api/appointments/holds/'+encodeURIComponent(hold.data.id)+'/confirm',{
        method:'POST',
        body:JSON.stringify({
          customerName:values.customerName,
          customerPhone:values.customerPhone,
          customerEmail:values.customerEmail,
          notes:values.notes,
          sourceChannel:'UI',
        })
      })
      if(!confirmed?.success)throw new Error(confirmed?.message||'Unable to confirm appointment')
      await onSaved?.('Appointment created.')
    }catch(err){ setError(err?.message||'Unable to save appointment') }
    finally{ setSaving(false) }
  }

  return <RecordModal
    open
    mode={editing?'edit':'create'}
    title={editing?'Edit Appointment':'New Appointment'}
    subtitle={editing?'Update appointment details and status.':'Choose a service and an available slot.'}
    size="lg"
    saving={saving}
    saveDisabled={!editing&&!selectedSlot}
    saveLabel={editing?'Save Appointment':'Book Appointment'}
    onClose={onClose}
    onSave={save}
  >
    {error?<div className="module-inline-error" style={{marginBottom:12}}>{error}</div>:null}
    <div className="customer-editor-grid">
      {!editing?<>
        <label className="module-input-label"><span>Service</span><select value={values.serviceId} onChange={e=>{setValues(v=>({...v,serviceId:e.target.value}));setSelectedSlot(null);setSlots([])}}><option value="">Choose service</option>{services.filter(s=>s.active!==false).map(s=><option key={s.id} value={s.id}>{s.name} · {s.duration_minutes} min</option>)}</select></label>
        <label className="module-input-label"><span>Resource / Staff</span><select value={values.resourceId} onChange={e=>{setValues(v=>({...v,resourceId:e.target.value}));setSelectedSlot(null);setSlots([])}}><option value="">Any available</option>{resources.filter(r=>r.active!==false).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        <label className="module-input-label"><span>Date</span><input type="date" value={values.date} onChange={e=>{setValues(v=>({...v,date:e.target.value}));setSelectedSlot(null);setSlots([])}}/></label>
        <div style={{display:'flex',alignItems:'end'}}><button type="button" onClick={findSlots} disabled={finding}>{finding?'Finding…':'Find available slots'}</button></div>
        <div className="customer-full">
          <span style={{display:'block',fontSize:12,fontWeight:600,marginBottom:8}}>Available slots</span>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {slots.map(slot=>{
              const resource=resources.find(r=>r.id===slot.resourceId)
              const selected=selectedSlot?.startsAt===slot.startsAt&&selectedSlot?.resourceId===slot.resourceId
              return <button type="button" key={slot.resourceId+':'+slot.startsAt} className={selected?'module-primary-button':''} onClick={()=>setSelectedSlot(slot)}>{new Date(slot.startsAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}{resource?.name?' · '+resource.name:''}</button>
            })}
          </div>
        </div>
      </>:null}

      {editing?<label className="module-input-label"><span>Status</span><select value={values.status} onChange={e=>setValues(v=>({...v,status:e.target.value}))}>{['CONFIRMED','CHECKED_IN','COMPLETED','CANCELLED','NO_SHOW'].map(s=><option key={s} value={s}>{statusLabel(s)}</option>)}</select></label>:null}
      <label className="module-input-label"><span>Customer name</span><input value={values.customerName} onChange={e=>setValues(v=>({...v,customerName:e.target.value}))}/></label>
      <label className="module-input-label"><span>Phone</span><input value={values.customerPhone} onChange={e=>setValues(v=>({...v,customerPhone:e.target.value}))}/></label>
      <label className="module-input-label"><span>Email</span><input type="email" value={values.customerEmail} onChange={e=>setValues(v=>({...v,customerEmail:e.target.value}))}/></label>
      <label className="module-textarea-label customer-full"><span>Notes</span><textarea rows={4} value={values.notes} onChange={e=>setValues(v=>({...v,notes:e.target.value}))}/></label>
    </div>
  </RecordModal>
}

function AppointmentDetail({appointment,onClose,onEdit,onChanged}){
  const cancel=async()=>{
    try{
      const result=await apiRequest('/api/appointments/'+encodeURIComponent(appointment.id),{method:'PATCH',body:JSON.stringify({status:'CANCELLED'})})
      if(!result?.success)throw new Error(result?.message||'Unable to cancel appointment')
      await onChanged?.('Appointment cancelled.')
    }catch(err){ window.alert(err?.message||'Unable to cancel appointment') }
  }

  return <RecordModal
    open
    mode="view"
    title={appointment.customer_name||appointment.service_name||'Appointment'}
    subtitle={fmt(appointment.starts_at)+' · '+statusLabel(appointment.status)}
    size="md"
    onClose={onClose}
    footerStart={<div style={{display:'flex',gap:8}}><button type="button" onClick={onEdit}>Edit</button>{appointment.status!=='CANCELLED'?<button type="button" onClick={cancel}>Cancel appointment</button>:null}</div>}
  >
    <div className="customer-contact-grid">
      <div><span>Service</span><strong>{appointment.service_name||'—'}</strong></div>
      <div><span>Resource</span><strong>{appointment.resource_name||'—'}</strong></div>
      <div><span>Starts</span><strong>{fmt(appointment.starts_at)}</strong></div>
      <div><span>Ends</span><strong>{fmt(appointment.ends_at)}</strong></div>
      <div><span>Phone</span><strong>{appointment.customer_phone||'—'}</strong></div>
      <div><span>Email</span><strong>{appointment.customer_email||'—'}</strong></div>
      <div><span>Status</span><strong>{statusLabel(appointment.status)}</strong></div>
      <div><span>Payment</span><strong>{statusLabel(appointment.payment_status)}</strong></div>
    </div>
    {appointment.notes?<div className="customer-notes"><span>Notes</span><p>{appointment.notes}</p></div>:null}
  </RecordModal>
}
