import { useCallback, useEffect, useMemo, useState } from 'react'
import { Clock, LogIn, LogOut, RefreshCw, Search } from 'lucide-react'
import { apiRequest } from '../../services/api'

export function formatWorked(minutes){
  const total=Math.max(0,Math.floor(Number(minutes)||0))
  const hours=Math.floor(total/60),mins=total%60
  return hours<=0?`${mins}m`:`${hours}h ${String(mins).padStart(2,'0')}m`
}
export function formatClockTime(value){
  if(!value)return '—'
  return new Date(value).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})
}
export function formatAttendanceDate(value){
  if(!value)return '—'
  return new Date(value).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})
}
function isNetworkError(error){
  return /failed to fetch|networkerror|load failed|fetch failed/i.test(String(error?.message||''))
}

export default function AttendancePage(){
  const [tab,setTab]=useState('mine')
  const [permissions,setPermissions]=useState({loaded:false,isAdmin:false,canManage:false})
  useEffect(()=>{
    let live=true
    apiRequest('/api/auth/me/permissions').then(r=>{
      if(!live)return
      const codes=Array.isArray(r?.data?.permissions)?r.data.permissions:[]
      const isAdmin=r?.data?.isAdmin===true
      setPermissions({loaded:true,isAdmin,canManage:isAdmin||codes.includes('attendance.view')})
    }).catch(()=>live&&setPermissions({loaded:true,isAdmin:false,canManage:false}))
    return()=>{live=false}
  },[])

  return <section className="module-page attendance-page">
    <header className="module-page-header">
      <div><span>Staff</span><h1>Employees</h1><p>Server-authoritative clock in/out and attendance records.</p></div>
    </header>
    <div className="module-segmented attendance-tabs">
      <button className={tab==='mine'?'is-active':''} onClick={()=>setTab('mine')}>My Attendance</button>
      {permissions.canManage?<button className={tab==='management'?'is-active':''} onClick={()=>setTab('management')}>Attendance Management</button>:null}
    </div>
    {tab==='mine'?<MyAttendance/>:permissions.canManage?<AttendanceManagement/>:null}
  </section>
}

function MyAttendance(){
  const [status,setStatus]=useState(null)
  const [fetchedAt,setFetchedAt]=useState(null)
  const [records,setRecords]=useState([])
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [now,setNow]=useState(Date.now())

  const load=useCallback(async()=>{
    try{
      setLoading(true);setError('')
      const [me,history]=await Promise.all([
        apiRequest('/api/attendance/me'),
        apiRequest('/api/attendance/me/records'),
      ])
      if(!me?.success||!history?.success)throw new Error(me?.message||history?.message||'Unable to load attendance')
      setStatus(me.data||null);setFetchedAt(Date.now());setRecords(history.data||[])
    }catch(err){setError(err?.message||'Unable to load attendance')}
    finally{setLoading(false)}
  },[])
  useEffect(()=>{void load()},[load])
  useEffect(()=>{
    if(status?.status!=='open')return undefined
    const timer=setInterval(()=>setNow(Date.now()),30000)
    return()=>clearInterval(timer)
  },[status?.status])

  const open=status?.status==='open'
  const elapsed=open
    ? (status.elapsedMinutes??Math.max(0,Math.floor((Date.now()-new Date(status.clockIn).getTime())/60000)))+
      Math.floor((now-(fetchedAt||now))/60000)
    : null

  const clockIn=async()=>{
    try{
      setBusy(true);setError('');setNotice('')
      const r=await apiRequest('/api/attendance/clock-in',{method:'POST',body:'{}'})
      if(!r?.success)throw new Error(r?.message||'Unable to record clock-in')
      setNotice('Clocked in.');await load()
    }catch(err){
      setError(isNetworkError(err)
        ? 'You appear to be offline — the clock-in could NOT be recorded. Nothing was saved locally; reconnect and try again.'
        : err?.message||'Unable to record clock-in')
      if(err?.status===409)await load()
    }finally{setBusy(false)}
  }
  const clockOut=async()=>{
    try{
      setBusy(true);setError('');setNotice('')
      const r=await apiRequest('/api/attendance/clock-out',{method:'POST',body:'{}'})
      if(!r?.success)throw new Error(r?.message||'Unable to record clock-out')
      setNotice(r.data?.workedMinutes!=null?`Clocked out — worked ${formatWorked(r.data.workedMinutes)}.`:'Clocked out.')
      await load()
    }catch(err){
      setError(isNetworkError(err)
        ? 'You appear to be offline — the clock-out could NOT be recorded. Nothing was saved locally; reconnect and try again.'
        : err?.message||'Unable to record clock-out')
      if(err?.status===409)await load()
    }finally{setBusy(false)}
  }

  return <div className="attendance-stack">
    {notice?<div className="module-success"><strong>{notice}</strong></div>:null}
    {error?<div className="module-inline-error">{error}</div>:null}

    <section className="module-panel attendance-status-card">
      {loading?<div className="module-state">Loading attendance…</div>:<>
        <div className="attendance-status-head">
          <div><Clock size={17}/><span>Status</span><strong className={open?'is-open':''}>{open?'Clocked in':'Not clocked in'}</strong></div>
          <button onClick={load}><RefreshCw size={13}/> Refresh</button>
        </div>
        {open?<div className="attendance-clock-state">
          <div><span>Clocked in</span><strong>{formatClockTime(status.clockIn)}</strong><small>{formatAttendanceDate(status.clockIn)}</small></div>
          <div><span>Worked</span><strong>{formatWorked(elapsed)}</strong><small>Live display; official duration comes from server on clock-out</small></div>
          <button className="module-primary-button" disabled={busy} onClick={clockOut}><LogOut size={14}/>{busy?'Clocking out…':'Clock Out'}</button>
        </div>:<div className="attendance-clock-state">
          <div className="attendance-not-clocked"><span>Attendance uses the server clock.</span><small>{status?'Your most recent session is shown below.':'You have no attendance sessions yet.'}</small></div>
          <button className="module-primary-button" disabled={busy} onClick={clockIn}><LogIn size={14}/>{busy?'Clocking in…':'Clock In'}</button>
        </div>}
      </>}
    </section>

    <section className="module-page-card">
      <div className="attendance-card-heading"><div><strong>Attendance History</strong><span>Your last recorded sessions.</span></div></div>
      {!records.length&&!loading?<div className="module-state">No attendance records.</div>:<AttendanceTable records={records}/>}
    </section>
  </div>
}

function AttendanceManagement(){
  const [records,setRecords]=useState([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [filters,setFilters]=useState({search:'',storeId:'',userId:''})

  const load=useCallback(async(next=filters)=>{
    try{
      setLoading(true);setError('')
      const q=new URLSearchParams()
      if(next.storeId.trim())q.set('storeId',next.storeId.trim())
      if(next.userId.trim())q.set('userId',next.userId.trim())
      const suffix=q.toString()?`?${q}`:''
      const r=await apiRequest(`/api/attendance${suffix}`)
      if(!r?.success)throw new Error(r?.message||'Unable to load attendance records')
      setRecords(r.data||[])
    }catch(err){
      setError(err?.status===403
        ? 'You do not have permission to view these attendance records.'
        : isNetworkError(err)
          ? 'You appear to be offline — attendance records could not be loaded.'
          : err?.message||'Unable to load attendance records')
      setRecords([])
    }finally{setLoading(false)}
  },[filters])
  useEffect(()=>{void load({search:'',storeId:'',userId:''})},[])

  const visible=useMemo(()=>{
    const q=filters.search.trim().toLowerCase()
    if(!q)return records
    return records.filter(r=>[r.fullName,r.username,r.storeName].some(v=>String(v||'').toLowerCase().includes(q)))
  },[records,filters.search])

  return <div className="attendance-stack">
    {error?<div className="module-inline-error">{error}</div>:null}
    <section className="module-panel attendance-management-toolbar">
      <label className="module-search"><Search size={13}/><input value={filters.search} onChange={e=>setFilters(f=>({...f,search:e.target.value}))} placeholder="Employee or store"/></label>
      <input value={filters.storeId} onChange={e=>setFilters(f=>({...f,storeId:e.target.value}))} placeholder="Store ID filter"/>
      <input value={filters.userId} onChange={e=>setFilters(f=>({...f,userId:e.target.value}))} placeholder="User ID filter"/>
      <button onClick={()=>load(filters)}><RefreshCw size={13}/> Apply / Refresh</button>
    </section>
    <section className="module-page-card">
      <div className="attendance-card-heading"><div><strong>Attendance Management</strong><span>{visible.length} records visible</span></div></div>
      {loading?<div className="module-state">Loading attendance records…</div>:!visible.length?<div className="module-state">No attendance records.</div>:<AttendanceTable records={visible} management/>}
    </section>
  </div>
}

function AttendanceTable({records,management=false}){
  return <div className="module-table-wrap no-border"><table><thead><tr>{management?<><th>Employee</th><th>Store</th></>:null}<th>Date</th><th>Clock In</th><th>Clock Out</th><th>Worked</th><th>Status</th></tr></thead><tbody>{records.map(r=><tr key={r.id}>
    {management?<><td><strong>{r.fullName||r.username||'—'}</strong></td><td>{r.storeName||'—'}</td></>:null}
    <td>{formatAttendanceDate(r.clockIn)}</td><td>{formatClockTime(r.clockIn)}</td><td>{formatClockTime(r.clockOut)}</td><td><strong>{r.workedMinutes!=null?formatWorked(r.workedMinutes):'—'}</strong></td><td><span className={`module-status-pill ${r.status==='open'?'is-active':'is-neutral'}`}>{r.status==='open'?'Clocked in':'Completed'}</span></td>
  </tr>)}</tbody></table></div>
}
