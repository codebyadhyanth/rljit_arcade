import React, { useEffect, useState } from 'react';
import api from '../config/api';
import { useAuth } from '../context/AuthContext';
import ProvisionAuthorityTool from '../components/services/ProvisionAuthorityTool';
import StudentProvisioningTool from '../components/services/StudentProvisioningTool';
import DbLedgerTool from '../components/services/DbLedgerTool';
import DbDiagnosticsTool from '../components/services/DbDiagnosticsTool';
import { Activity, ArrowLeft, Briefcase, CalendarDays, Check, Database, FileText, GraduationCap, Landmark, RefreshCw, Search, ShieldCheck, Users } from 'lucide-react';

const card='rounded-2xl border border-[#EBEBEF] bg-white p-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]';
const button='inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#121214] px-4 py-2 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50';
const secondary='inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#EBEBEF] bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50';
const field='w-full rounded-xl border border-[#EBEBEF] bg-[#FBFBFC] px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-[#EA580C] focus:ring-4 focus:ring-orange-500/10';
const statusNames=['PENDING_HOD','PENDING_PRINCIPAL','PARTIALLY_ACCEPTED','APPROVED','REJECTED','CANCELLED'];
function Input({ label, value, onChange, type='text', required=false, placeholder='', min }) { return <label className="block space-y-1.5"><span className="text-xs font-semibold text-zinc-600">{label}</span><input className={field} value={value ?? ''} onChange={e=>onChange(e.target.value)} type={type} required={required} placeholder={placeholder} min={min}/></label>; }
function TextArea({ label, value, onChange, required=false, rows=3 }) { return <label className="block space-y-1.5"><span className="text-xs font-semibold text-zinc-600">{label}</span><textarea className={field} value={value ?? ''} onChange={e=>onChange(e.target.value)} rows={rows} required={required}/></label>; }
function Select({ label, value, onChange, options, required=false }) { return <label className="block space-y-1.5"><span className="text-xs font-semibold text-zinc-600">{label}</span><select className={field} value={value ?? ''} onChange={e=>onChange(e.target.value)} required={required}><option value="">Select…</option>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>; }
function Panel({ title, note, children }) { return <section className={card}><div className="mb-4"><h2 className="text-sm font-semibold text-zinc-900">{title}</h2>{note && <p className="mt-1 text-xs text-zinc-500">{note}</p>}</div>{children}</section>; }
function Notice({ error, result, loading }) { return <div className="space-y-2">{loading && <p className="text-sm text-zinc-500">Working with the live service…</p>}{error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}{result && <pre className="max-h-64 overflow-auto rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">{JSON.stringify(result,null,2)}</pre>}</div>; }
function Stat({ label,value }) { return <div className="rounded-xl border border-[#EBEBEF] bg-white p-3"><p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{label}</p><p className="mt-1 break-words text-sm font-semibold text-zinc-900">{value ?? '—'}</p></div>; }

function VenueWorkspace({ user, isSuperAdmin, isHod, isPrincipal, isFaculty, isStudent }) {
  const [venues,setVenues]=useState([]); const [bookings,setBookings]=useState([]); const [selected,setSelected]=useState(null); const [detail,setDetail]=useState(null); const [faculty,setFaculty]=useState([]); const [search,setSearch]=useState(''); const [availability,setAvailability]=useState(null); const [transferInbox,setTransferInbox]=useState([]); const [error,setError]=useState(''); const [result,setResult]=useState(null); const [loading,setLoading]=useState(false);
  const [query,setQuery]=useState({start_time:'',end_time:'',venue_id:''});
  const [book,setBook]=useState({venue_id:'',coordinator_id:'',event_title:'',purpose:'',expected_headcount:'',event_start_time:'',event_end_time:'',department:user?.department || ''});
  const [review,setReview]=useState({reason:'',terms:''});
  const [transfer,setTransfer]=useState({urgency_reason:'',new_event_title:'',new_purpose:'',new_coordinator_id:''});
  const refresh=async()=>{setLoading(true);setError('');try{const [v,b]=await Promise.all([api.get('/api/v1/venues'),api.get('/api/v1/venues/bookings')]);setVenues(v.data?.venues||[]);setBookings(b.data?.bookings||[]);const tr=(b.data?.bookings||[]).flatMap(x=>x.transfer_requests||[]);setTransferInbox(tr);}catch(e){setError(e.response?.data?.error||e.message||'Venue data unavailable.');}finally{setLoading(false);}};
  useEffect(()=>{refresh();},[]);
  const run=async(fn)=>{setLoading(true);setError('');setResult(null);try{const r=await fn();setResult(r.data);await refresh();return r.data;}catch(e){setError(e.response?.data?.error||e.response?.data?.message||e.message||'The request failed.');return null;}finally{setLoading(false);}};
  const loadDetail=async(id)=>{setSelected(id);try{const r=await api.get('/api/v1/venues/bookings/'+id);setDetail(r.data?.booking||null);}catch(e){setError(e.response?.data?.error||e.message);}};
  const searchFaculty=async()=>{if(!search.trim())return;try{const r=await api.get('/api/v1/users/search?q='+encodeURIComponent(search));const rows=(r.data?.results||[]).filter(x=>x.baseRole==='FACULTY');setFaculty(rows);}catch(e){setError(e.response?.data?.error||'Faculty search failed.');}};
  const availabilityCheck=async(e)=>{e.preventDefault();await run(async()=>{const params=new URLSearchParams({start_time:new Date(query.start_time).toISOString(),end_time:new Date(query.end_time).toISOString()});if(query.venue_id)params.set('venue_id',query.venue_id);const r=await api.get('/api/v1/venues/availability?'+params.toString());setAvailability(r.data);return r;});};
  const submitBooking=async(e)=>{e.preventDefault();await run(()=>api.post('/api/v1/venues/bookings',{...book,expected_headcount:Number(book.expected_headcount),event_start_time:new Date(book.event_start_time).toISOString(),event_end_time:new Date(book.event_end_time).toISOString(),coordinator_id:isFaculty ? (book.coordinator_id||user?.userId) : book.coordinator_id}));};
  const reviewAction=(id,stage,action)=>run(()=>api.patch('/api/v1/venues/bookings/'+id+'/'+stage+'-review',{action,reason:review.reason,terms_and_conditions:review.terms.split('\n').map(s=>s.trim()).filter(Boolean)}));
  const booking=detail;
  const currentUserId=user?.userId||user?.id;
  const isCoordinator=Boolean(currentUserId && booking?.coordinator?.id===currentUserId);
  const isInitiator=Boolean(currentUserId && booking?.initiator?.id===currentUserId);
  return <div className="space-y-4">
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="Venue discovery and availability" note="Availability uses the backend's buffered booking window."><form onSubmit={availabilityCheck} className="grid gap-3 sm:grid-cols-2"><Select label="Venue (optional)" value={query.venue_id} onChange={v=>setQuery({...query,venue_id:v})} options={venues.map(v=>({value:v.id,label:v.name+' · '+v.type}))}/><Input label="Start" type="datetime-local" required value={query.start_time} onChange={v=>setQuery({...query,start_time:v})}/><Input label="End" type="datetime-local" required value={query.end_time} onChange={v=>setQuery({...query,end_time:v})}/><div className="sm:col-span-2"><button className={button} disabled={loading}><Search size={15}/> Check availability</button></div></form>{availability && <div className="mt-4 rounded-xl border border-[#EBEBEF] bg-zinc-50 p-3 text-sm"><p className={availability.is_available?'text-emerald-700':'text-rose-700'}>{availability.message || (availability.is_available?'Venue is available.':'Venue unavailable.')}</p>{availability.current_booking && <div className="mt-2 text-xs text-zinc-700"><p>{availability.current_booking.event_title} · {availability.current_booking.booking_code}</p><p>Coordinator: {availability.current_booking.coordinator?.name} · {availability.current_booking.coordinator?.email}</p>{(isStudent||isFaculty)&&<form className="mt-3 grid gap-2" onSubmit={e=>{e.preventDefault();run(()=>api.post('/api/v1/venues/bookings/'+availability.current_booking.booking_id+'/transfer-request',transfer));}}><TextArea label="Urgency reason" required value={transfer.urgency_reason} onChange={v=>setTransfer({...transfer,urgency_reason:v})}/><Input label="New event title" required value={transfer.new_event_title} onChange={v=>setTransfer({...transfer,new_event_title:v})}/><Input label="New purpose" required value={transfer.new_purpose} onChange={v=>setTransfer({...transfer,new_purpose:v})}/><Input label="New coordinator user ID" required value={transfer.new_coordinator_id} onChange={v=>setTransfer({...transfer,new_coordinator_id:v})}/><button className={secondary}>Request venue transfer</button></form>}</div>}</div>}</Panel>
      {(isStudent||isFaculty||isSuperAdmin)&&<Panel title="Initiate booking" note={isStudent?'Students must provide an active faculty coordinator.':'Faculty booking requests use the signed-in faculty account as coordinator.'}><form onSubmit={submitBooking} className="grid gap-3 sm:grid-cols-2"><Select label="Venue" required value={book.venue_id} onChange={v=>setBook({...book,venue_id:v})} options={venues.filter(v=>v.is_active).map(v=>({value:v.id,label:v.name+' · '+v.type+' · capacity '+v.capacity}))}/><Input label="Department" required value={book.department} onChange={v=>setBook({...book,department:v})}/><Input label="Event title" required value={book.event_title} onChange={v=>setBook({...book,event_title:v})}/><Input label="Expected headcount" type="number" min="1" required value={book.expected_headcount} onChange={v=>setBook({...book,expected_headcount:v})}/><Input label="Start" type="datetime-local" required value={book.event_start_time} onChange={v=>setBook({...book,event_start_time:v})}/><Input label="End" type="datetime-local" required value={book.event_end_time} onChange={v=>setBook({...book,event_end_time:v})}/><TextArea label="Purpose" required value={book.purpose} onChange={v=>setBook({...book,purpose:v})}/>{isStudent && <div className="space-y-2"><Input label="Find faculty coordinator" value={search} onChange={setSearch} placeholder="Search by faculty name or username"/><button type="button" className={secondary} onClick={searchFaculty}>Search faculty</button><Select label="Faculty coordinator" required value={book.coordinator_id} onChange={v=>setBook({...book,coordinator_id:v})} options={faculty.map(f=>({value:f.id||f.userId,label:(f.fullName||f.username)+' · '+(f.department||'')}))}/></div>}<div className="sm:col-span-2"><button className={button} disabled={loading}>Submit booking request</button></div></form></Panel>}
    </div>
    <Panel title="Bookings and approval queues" note="Rows are returned by the role-scoped booking endpoint."><div className="mb-3 flex justify-end"><button className={secondary} onClick={refresh}><RefreshCw size={14}/> Refresh</button></div>{bookings.length? <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="text-xs uppercase text-zinc-500"><tr><th className="p-2">Booking</th><th className="p-2">Venue</th><th className="p-2">Event</th><th className="p-2">When</th><th className="p-2">Status</th><th className="p-2"></th></tr></thead><tbody>{bookings.map(b=><tr key={b.id} className="border-t border-zinc-100"><td className="p-2 font-mono text-xs">{b.booking_code}</td><td className="p-2">{b.venue_name}</td><td className="p-2">{b.event_title}</td><td className="p-2 text-xs">{b.event_start_time ? new Date(b.event_start_time).toLocaleString() : '—'}</td><td className="p-2"><span className="rounded-full bg-orange-50 px-2 py-1 text-xs text-orange-800">{b.status}</span></td><td className="p-2"><button className={secondary} onClick={()=>loadDetail(b.id)}>View</button></td></tr>)}</tbody></table></div>:<p className="text-sm text-zinc-500">{loading?'Loading bookings…':'No bookings were returned for your account or review scope.'}</p>}</Panel>
    {booking && <Panel title={'Booking details · '+(booking.booking_code||booking.id)} note="Full status history is returned by the booking audit endpoint."><div className="grid gap-2 sm:grid-cols-3"><Stat label="Status" value={booking.status}/><Stat label="Venue" value={booking.venue?.name}/><Stat label="Event" value={booking.event?.title}/></div>{booking.active_terms_and_conditions && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Terms: {JSON.stringify(booking.active_terms_and_conditions)}</p>}<div className="mt-4 space-y-2">{booking.timeline_logs?.length ? booking.timeline_logs.map(x=><div key={x.id} className="rounded-xl border border-[#EBEBEF] p-3 text-xs"><strong>{x.action}</strong> · {x.actor_username} · {x.created_at}<p className="mt-1 text-zinc-600">{x.message}</p></div>):<p className="text-sm text-zinc-500">No timeline records returned.</p>}</div>{booking.transfer_requests?.map(tr=><div key={tr.id} className="mt-3 rounded-xl border border-[#EBEBEF] p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><span>Transfer request · {tr.status}</span>{isCoordinator&&tr.status==='PENDING_COORDINATOR'&&<div className="flex gap-2"><button className={secondary} onClick={()=>run(()=>api.patch('/api/v1/venues/transfer-requests/'+tr.id+'/respond',{action:'APPROVE',response_message:'Approved'}))}>Approve handover</button><button className={secondary} onClick={()=>run(()=>api.patch('/api/v1/venues/transfer-requests/'+tr.id+'/respond',{action:'REJECT',response_message:'Declined'}))}>Reject handover</button></div>}</div></div>)}<div className="mt-4 grid gap-3 sm:grid-cols-2">{(isHod||isSuperAdmin)&&booking.status==='PENDING_HOD'&&<div className="space-y-2"><TextArea label="Review reason" value={review.reason} onChange={v=>setReview({...review,reason:v})}/><TextArea label="Terms (one per line, for partial acceptance)" value={review.terms} onChange={v=>setReview({...review,terms:v})}/><div className="flex flex-wrap gap-2">{['APPROVE','PARTIAL','REJECT'].map(a=><button key={a} className={secondary} onClick={()=>reviewAction(booking.id,'hod',a)}>{a}</button>)}</div></div>}{(isPrincipal||isSuperAdmin)&&booking.status==='PENDING_PRINCIPAL'&&<div className="space-y-2"><TextArea label="Review reason" value={review.reason} onChange={v=>setReview({...review,reason:v})}/><TextArea label="Terms" value={review.terms} onChange={v=>setReview({...review,terms:v})}/><div className="flex gap-2">{['APPROVE','PARTIAL','REJECT'].map(a=><button key={a} className={secondary} onClick={()=>reviewAction(booking.id,'principal',a)}>{a}</button>)}</div></div>}{isFaculty&&isCoordinator&&booking.status==='PARTIALLY_ACCEPTED'&&<div className="space-y-2"><TextArea label="Coordinator message" value={review.reason} onChange={v=>setReview({...review,reason:v})}/><button className={button} onClick={()=>run(()=>api.patch('/api/v1/venues/bookings/'+booking.id+'/coordinator-response',{agree_to_terms:true,coordinator_message:review.reason}))}>Agree to terms</button><button className={secondary} onClick={()=>run(()=>api.patch('/api/v1/venues/bookings/'+booking.id+'/coordinator-response',{agree_to_terms:false,coordinator_message:review.reason}))}>Counter proposal</button></div>}{['PENDING_HOD','PENDING_PRINCIPAL','APPROVED'].includes(booking.status)&&(isInitiator||isCoordinator)&&<div className="space-y-2"><TextArea label="Cancellation reason" value={review.reason} onChange={v=>setReview({...review,reason:v})}/><button className={secondary} onClick={()=>run(()=>api.post('/api/v1/venues/bookings/'+booking.id+'/cancel',{cancellation_reason:review.reason}))}>Cancel booking</button></div>}{isCoordinator&&booking.status==='APPROVED'&&<div className="space-y-2"><Select label="Change venue" value={transfer.new_venue_id||''} onChange={v=>setTransfer({...transfer,new_venue_id:v})} options={venues.filter(v=>v.is_active&&v.id!==booking.venue?.id).map(v=>({value:v.id,label:v.name}))}/><button className={secondary} onClick={()=>run(()=>api.patch('/api/v1/venues/bookings/'+booking.id+'/change-venue',{new_venue_id:transfer.new_venue_id}))}>Change venue and restart approvals</button></div>}</div></Panel>}
    {isSuperAdmin&&<Panel title="Venue master directory" note="Create, update, and activate venues through the admin API."><form className="grid gap-3 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);run(()=>api.post('/api/v1/venues',{name:f.get('name'),type:f.get('type'),department:f.get('department'),location_details:f.get('location_details'),capacity:Number(f.get('capacity'))}));e.currentTarget.reset();}}><label className="block space-y-1.5"><span className="text-xs font-semibold text-zinc-600">Name</span><input name="name" className={field} required/></label><label className="block space-y-1.5"><span className="text-xs font-semibold text-zinc-600">Type</span><select name="type" className={field} required><option value="">Select…</option>{['AUDITORIUM','SEMINAR_HALL','CONFERENCE_ROOM','LAB','OPEN_AIR_THEATRE'].map(x=><option key={x}>{x}</option>)}</select></label><label className="block space-y-1.5"><span className="text-xs font-semibold text-zinc-600">Department</span><input name="department" className={field} required/></label><label className="block space-y-1.5"><span className="text-xs font-semibold text-zinc-600">Location</span><input name="location_details" className={field} required/></label><label className="block space-y-1.5"><span className="text-xs font-semibold text-zinc-600">Capacity</span><input name="capacity" type="number" min="1" className={field} required/></label><div><button className={button}>Create venue</button></div></form><div className="mt-4 space-y-2">{venues.map(v=><div key={v.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 py-2 text-sm"><span>{v.name} · {v.type} · {v.capacity} · {v.is_active?'Active':'Inactive'}</span><button type="button" className={secondary} onClick={()=>run(()=>api.patch('/api/v1/venues/'+v.id,{is_active:!v.is_active}))}>{v.is_active?'Deactivate':'Activate'}</button></div>)}</div></Panel>}
    <Notice error={error} result={result} loading={loading}/>
  </div>;
}

function TimetableWorkspace({ user, isHod, isSuperAdmin, isFaculty }) {
 const [schedule,setSchedule]=useState([]),[err,setErr]=useState(''),[result,setResult]=useState(null);const [q,setQ]=useState({dept:user?.department||'',sem:'',sec:'',date:new Date().toISOString().slice(0,10)});const [busy,setBusy]=useState(false);
 const load=async()=>{setBusy(true);setErr('');try{const p=new URLSearchParams(Object.fromEntries(Object.entries(q).filter(([,v])=>v)));const r=await api.get('/api/v1/timetable/daily-view?'+p);setSchedule(r.data?.schedule||[]);}catch(e){setErr(e.response?.data?.error||e.message);}finally{setBusy(false);}};useEffect(()=>{if(q.dept&&q.sem&&q.sec)load();},[]);
 const [slot,setSlot]=useState({timetable_id:'',swap_date:q.date,target_faculty_id:'',new_subject_code:''});
 return <div className="space-y-4"><Panel title="Daily timetable" note="Schedule is read from the database and includes approved swap overlays."><div className="grid gap-3 sm:grid-cols-4"><Input label="Department" value={q.dept} onChange={v=>setQ({...q,dept:v})}/><Input label="Semester" value={q.sem} onChange={v=>setQ({...q,sem:v})}/><Input label="Section" value={q.sec} onChange={v=>setQ({...q,sec:v})}/><Input label="Date" type="date" value={q.date} onChange={v=>setQ({...q,date:v})}/></div><button className={button+' mt-3'} onClick={load}>Load timetable</button><div className="mt-4 divide-y divide-zinc-100">{schedule.map(s=><div key={s.timetable_id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span>{s.period_no} · {s.subject_code} · {s.section}</span><span className="text-zinc-500">{s.faculty_username||s.faculty_id} · {s.room_no||'Room not assigned'}</span></div>)}</div>{!schedule.length&&!busy&&<p className="text-sm text-zinc-500">{err||'No timetable entries returned for this selection.'}</p>}</Panel>{(isFaculty||isHod)&&<Panel title="Request a class swap" note="The authenticated faculty member must own the source timetable slot."><form className="grid gap-3 sm:grid-cols-2" onSubmit={async e=>{e.preventDefault();setBusy(true);try{const r=await api.post('/api/v1/timetable/swap-request',{timetable_id:Number(slot.timetable_id),swap_date:slot.swap_date,target_faculty_id:slot.target_faculty_id,new_subject_code:slot.new_subject_code||undefined});setResult(r.data);}catch(x){setErr(x.response?.data?.error||x.message);}finally{setBusy(false);}}}><Input label="Timetable slot ID" required value={slot.timetable_id} onChange={v=>setSlot({...slot,timetable_id:v})}/><Input label="Swap date" type="date" required value={slot.swap_date} onChange={v=>setSlot({...slot,swap_date:v})}/><Input label="Target faculty ID" required value={slot.target_faculty_id} onChange={v=>setSlot({...slot,target_faculty_id:v})}/><Input label="Replacement subject code (optional)" value={slot.new_subject_code} onChange={v=>setSlot({...slot,new_subject_code:v})}/><button className={button}>Submit swap</button></form><Notice error={err} result={result} loading={busy}/></Panel>}{(isFaculty||isSuperAdmin)&&<Panel title="Review a class swap" note="The backend authorizes the target faculty member to approve or reject a swap."><form className="grid gap-3 sm:grid-cols-3" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{const r=await api.patch('/api/v1/timetable/swap-approve/'+f.get('swapId'),{decision:f.get('decision')});setResult(r.data);setErr('');}catch(x){setErr(x.response?.data?.error||x.message);}}}><label className="space-y-1.5 text-xs font-semibold">Swap request ID<input name="swapId" className={field} required/></label><label className="space-y-1.5 text-xs font-semibold">Decision<select name="decision" className={field}><option>APPROVED</option><option>REJECTED</option></select></label><button className={button}>Submit decision</button></form><Notice error={err} result={result}/></Panel>}{(isHod||isSuperAdmin)&&<Panel title="Master timetable setup" note="Provide the exact slot list accepted by the backend."><form onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{const slots=JSON.parse(f.get('slots'));const r=await api.post('/api/v1/timetable/master-setup',{department:f.get('department'),semester:Number(f.get('semester')),section:f.get('section'),slots});setResult(r.data);setErr('');}catch(x){setErr(x.response?.data?.error||x.message);}}} className="grid gap-3 sm:grid-cols-2"><label className="space-y-1.5 text-xs font-semibold">Department<input name="department" defaultValue={q.dept} className={field} required/></label><label className="space-y-1.5 text-xs font-semibold">Semester<input name="semester" type="number" className={field} required/></label><label className="space-y-1.5 text-xs font-semibold">Section<input name="section" className={field} required/></label><label className="space-y-1.5 text-xs font-semibold">Slots JSON<textarea name="slots" className={field} rows="4" placeholder='[{"day_of_week":1,"period_no":1,"subject_code":"…","faculty_id":"…"}]' required/></label><button className={button}>Save timetable</button></form><Notice error={err} result={result}/></Panel>}</div>
}

function LeaveWorkspace({ isStudent, isFaculty }) {
 const [err,setErr]=useState(''),[result,setResult]=useState(null),[pending,setPending]=useState(false);return <div className="space-y-4">{isStudent&&<Panel title="Submit a leave request" note="The request is routed to the authenticated student's assigned LG faculty."><form className="grid gap-3 sm:grid-cols-2" onSubmit={async e=>{e.preventDefault();setPending(true);setErr('');try{const f=new FormData(e.currentTarget);const r=await api.post('/api/v1/student/leave-request',{fromDate:f.get('fromDate'),toDate:f.get('toDate'),reason:f.get('reason')});setResult(r.data);e.currentTarget.reset();}catch(x){setErr(x.response?.data?.error||x.message);}finally{setPending(false);}}}><label className="space-y-1.5 text-xs font-semibold">From date<input name="fromDate" type="date" className={field} required/></label><label className="space-y-1.5 text-xs font-semibold">To date<input name="toDate" type="date" className={field} required/></label><label className="sm:col-span-2 space-y-1.5 text-xs font-semibold">Reason<textarea name="reason" className={field} rows="3" required/></label><button className={button}>Submit leave request</button></form><Notice error={err} result={result} loading={pending}/></Panel>}{isFaculty&&<LeaveReview/>}{!isStudent&&!isFaculty&&<Panel title="Leave workflow"><p className="text-sm text-zinc-500">Leave submission is available to students and review is available to faculty mentors. No other leave endpoint is exposed.</p></Panel>}</div>
}
function LeaveReview(){const [mentees,setMentees]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);const load=()=>api.get('/api/v1/faculty/lg-mentees').then(r=>setMentees(r.data?.mentees||[])).catch(e=>setError(e.response?.data?.error||e.message));useEffect(()=>{load();},[]);return <Panel title="Mentor scope" note="The API provides mentee summaries, not a separate pending-leave list."><button className={secondary+' mb-3'} onClick={load}><RefreshCw size={14}/> Refresh mentees</button>{error&&<p role="alert" className="text-sm text-rose-700">{error}</p>}{mentees.length?mentees.map(m=><div key={m.usn} className="flex flex-wrap justify-between gap-3 border-t border-zinc-100 py-3 text-sm"><span>{m.fullName} · {m.usn}</span><span className="text-zinc-500">{m.department} · Sem {m.semester} · Sec {m.section}</span></div>):<p className="text-sm text-zinc-500">No mentees returned for your faculty account.</p>}<p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">The backend does not expose a pending leave inbox or leave ID list, so approve/reject controls cannot be populated safely.</p></Panel>}

function AcademicWorkspace({ user, isFaculty, isHod, isSuperAdmin, isStudent }) {
  const [err, setErr] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState(isStudent ? 'my-attendance' : 'manual-attendance');

  const [attDept, setAttDept] = useState(user?.department || 'CSE');
  const [attSem, setAttSem] = useState('3');
  const [attSec, setAttSec] = useState('A');
  const [attSub, setAttSub] = useState('BCS301');
  const [attPeriod, setAttPeriod] = useState('1');
  const [attDate, setAttDate] = useState(new Date().toISOString().slice(0, 10));
  const [attStudents, setAttStudents] = useState('');
  const [attDefaultStatus, setAttDefaultStatus] = useState('PRESENT');

  const [secAttendance, setSecAttendance] = useState([]);
  const [myAttendance, setMyAttendance] = useState(null);
  const [myCie, setMyCie] = useState([]);

  const [cieUsn, setCieUsn] = useState('');
  const [cieDept, setCieDept] = useState(user?.department || 'CSE');
  const [cieSem, setCieSem] = useState('3');
  const [cieSub, setCieSub] = useState('BCS301');
  const [cieSubName, setCieSubName] = useState('Data Structures & Applications');
  const [cie1, setCie1] = useState('');
  const [cie2, setCie2] = useState('');
  const [cie3, setCie3] = useState('');
  const [cieAssign, setCieAssign] = useState('');
  const [cieMax, setCieMax] = useState('50');

  const run = async (fn) => {
    setBusy(true); setErr(''); setResult(null);
    try {
      const r = await fn();
      setResult(r.data);
      return r.data;
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const loadMyAttendance = async () => {
    const usn = user?.username;
    if (!usn) return;
    try {
      const res = await api.get('/api/v1/attendance/student/' + encodeURIComponent(usn));
      setMyAttendance(res.data);
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    }
  };

  const loadMyCie = async () => {
    const usn = user?.username;
    if (!usn) return;
    try {
      const res = await api.get('/api/v1/cie/student/' + encodeURIComponent(usn));
      setMyCie(res.data?.marks || []);
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    }
  };

  const loadSectionAttendance = async () => {
    try {
      const params = new URLSearchParams({
        department: attDept,
        semester: attSem,
        section: attSec,
        subject_code: attSub,
      });
      const res = await api.get('/api/v1/attendance/section?' + params.toString());
      setSecAttendance(res.data?.records || []);
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    }
  };

  useEffect(() => {
    if (isStudent) {
      loadMyAttendance();
      loadMyCie();
    }
  }, [isStudent, user?.username]);

  const submitManualAttendance = async (e) => {
    e.preventDefault();
    const usnList = attStudents.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    if (usnList.length === 0) {
      setErr('Please enter at least one Student USN');
      return;
    }
    const records = usnList.map((u) => ({
      student_id: u,
      status: attDefaultStatus,
    }));
    await run(() => api.post('/api/v1/attendance/manual', {
      department: attDept,
      semester: Number(attSem),
      section: attSec,
      subject_code: attSub,
      period_no: Number(attPeriod),
      attendance_date: attDate,
      records,
    }));
  };

  const submitManualCie = async (e) => {
    e.preventDefault();
    if (!cieUsn.trim()) {
      setErr('Student USN is required');
      return;
    }
    await run(() => api.post('/api/v1/cie/manual', {
      student_id: cieUsn.trim(),
      department: cieDept,
      semester: Number(cieSem),
      subject_code: cieSub,
      subject_name: cieSubName,
      cie1_marks: Number(cie1 || 0),
      cie2_marks: Number(cie2 || 0),
      cie3_marks: Number(cie3 || 0),
      assignment_marks: Number(cieAssign || 0),
      max_marks: Number(cieMax || 50),
    }));
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto border-b border-zinc-200 pb-2 text-xs font-semibold">
        {isStudent && (
          <>
            <button onClick={() => setActiveTab('my-attendance')} className={'rounded-lg px-3 py-1.5 ' + (activeTab === 'my-attendance' ? 'bg-[#121214] text-white' : 'bg-zinc-100 text-zinc-700')}>My Attendance</button>
            <button onClick={() => setActiveTab('my-cie')} className={'rounded-lg px-3 py-1.5 ' + (activeTab === 'my-cie' ? 'bg-[#121214] text-white' : 'bg-zinc-100 text-zinc-700')}>My CIE Scorecard</button>
          </>
        )}
        {(isFaculty || isHod || isSuperAdmin) && (
          <>
            <button onClick={() => setActiveTab('manual-attendance')} className={'rounded-lg px-3 py-1.5 ' + (activeTab === 'manual-attendance' ? 'bg-[#121214] text-white' : 'bg-zinc-100 text-zinc-700')}>Manual Attendance Entry</button>
            <button onClick={() => setActiveTab('section-attendance')} className={'rounded-lg px-3 py-1.5 ' + (activeTab === 'section-attendance' ? 'bg-[#121214] text-white' : 'bg-zinc-100 text-zinc-700')}>Section Attendance Records</button>
            <button onClick={() => setActiveTab('manual-cie')} className={'rounded-lg px-3 py-1.5 ' + (activeTab === 'manual-cie' ? 'bg-[#121214] text-white' : 'bg-zinc-100 text-zinc-700')}>CIE Marks Entry</button>
            <button onClick={() => setActiveTab('eod-unlock')} className={'rounded-lg px-3 py-1.5 ' + (activeTab === 'eod-unlock' ? 'bg-[#121214] text-white' : 'bg-zinc-100 text-zinc-700')}>EOD Lock & Unlock Flow</button>
          </>
        )}
      </div>

      {activeTab === 'my-attendance' && (
        <Panel title="Personal Attendance Summary" note="Real-time attendance calculated across all enrolled courses">
          {myAttendance ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <Stat label="Overall Attendance" value={myAttendance.summary?.overallPercentage + '%'} />
                <Stat label="Total Classes" value={myAttendance.summary?.totalClasses} />
                <Stat label="Classes Attended" value={myAttendance.summary?.presentCount} />
                <Stat label="Classes Absent" value={myAttendance.summary?.absentCount} />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-zinc-500">
                    <tr><th className="p-2">Subject</th><th className="p-2">Total</th><th className="p-2">Present</th><th className="p-2">Absent</th><th className="p-2">Percentage</th></tr>
                  </thead>
                  <tbody>
                    {myAttendance.subjectWise?.map((sw) => (
                      <tr key={sw.subject_code} className="border-t border-zinc-100">
                        <td className="p-2 font-mono font-semibold">{sw.subject_code}</td>
                        <td className="p-2">{sw.total}</td>
                        <td className="p-2 text-emerald-700 font-medium">{sw.present}</td>
                        <td className="p-2 text-rose-700 font-medium">{sw.absent}</td>
                        <td className="p-2 font-bold">{sw.percentage}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">No attendance records returned for USN {user?.username}.</p>
          )}
        </Panel>
      )}

      {activeTab === 'my-cie' && (
        <Panel title="CIE Assessment Scorecard" note="Continuous Internal Evaluation marks from PostgreSQL">
          {myCie.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-zinc-500">
                  <tr><th className="p-2">Subject</th><th className="p-2">Sem</th><th className="p-2">CIE 1</th><th className="p-2">CIE 2</th><th className="p-2">CIE 3</th><th className="p-2">Assignment</th><th className="p-2">Total CIE</th><th className="p-2">Max</th></tr>
                </thead>
                <tbody>
                  {myCie.map((c) => (
                    <tr key={c.id} className="border-t border-zinc-100">
                      <td className="p-2 font-mono font-semibold">{c.subject_code} <span className="text-xs text-zinc-500 font-normal">{c.subject_name}</span></td>
                      <td className="p-2">{c.semester}</td>
                      <td className="p-2">{c.cie1_marks}</td>
                      <td className="p-2">{c.cie2_marks}</td>
                      <td className="p-2">{c.cie3_marks}</td>
                      <td className="p-2">{c.assignment_marks}</td>
                      <td className="p-2 font-bold text-emerald-800">{c.total_cie}</td>
                      <td className="p-2">{c.max_marks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">No CIE marks available yet for USN {user?.username}.</p>
          )}
        </Panel>
      )}

      {activeTab === 'manual-attendance' && (
        <Panel title="Manual Attendance Console" note="Mark section attendance with atomic transaction and audit receipt">
          <form onSubmit={submitManualAttendance} className="grid gap-3 sm:grid-cols-3">
            <Input label="Department" required value={attDept} onChange={setAttDept} />
            <Input label="Semester" type="number" required value={attSem} onChange={setAttSem} />
            <Input label="Section" required value={attSec} onChange={setAttSec} />
            <Input label="Subject Code" required value={attSub} onChange={setAttSub} />
            <Input label="Period Number" type="number" required value={attPeriod} onChange={setAttPeriod} />
            <Input label="Date" type="date" required value={attDate} onChange={setAttDate} />
            <div className="sm:col-span-3">
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-zinc-600">Default Status for Entered USNs</span>
                <select className={field} value={attDefaultStatus} onChange={(e) => setAttDefaultStatus(e.target.value)}>
                  <option value="PRESENT">PRESENT (P)</option>
                  <option value="ABSENT">ABSENT (A)</option>
                  <option value="LATE">LATE (L)</option>
                </select>
              </label>
            </div>
            <div className="sm:col-span-3">
              <TextArea
                label="Student USNs (one per line or comma-separated)"
                required
                rows={5}
                value={attStudents}
                onChange={setAttStudents}
              />
            </div>
            <div className="sm:col-span-3">
              <button className={button} disabled={busy}>Commit Manual Attendance</button>
            </div>
          </form>
        </Panel>
      )}

      {activeTab === 'section-attendance' && (
        <Panel title="Section Attendance Inspector" note="View section-wide attendance records by subject">
          <div className="mb-4 grid gap-3 sm:grid-cols-4">
            <Input label="Department" value={attDept} onChange={setAttDept} />
            <Input label="Semester" value={attSem} onChange={setAttSem} />
            <Input label="Section" value={attSec} onChange={setAttSec} />
            <Input label="Subject Code" value={attSub} onChange={setAttSub} />
            <div className="sm:col-span-4">
              <button className={secondary} onClick={loadSectionAttendance}>Load Section Records</button>
            </div>
          </div>
          {secAttendance.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-zinc-500">
                  <tr><th className="p-2">USN</th><th className="p-2">Date</th><th className="p-2">Period</th><th className="p-2">Status</th><th className="p-2">Faculty</th></tr>
                </thead>
                <tbody>
                  {secAttendance.map((r) => (
                    <tr key={r.id} className="border-t border-zinc-100">
                      <td className="p-2 font-mono font-semibold">{r.student_usn}</td>
                      <td className="p-2">{r.attendance_date ? new Date(r.attendance_date).toLocaleDateString() : '—'}</td>
                      <td className="p-2">Period {r.period_no}</td>
                      <td className="p-2">
                        <span className={'rounded-full px-2 py-0.5 text-xs font-semibold ' + (r.status === 'PRESENT' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800')}>
                          {r.status}
                        </span>
                      </td>
                      <td className="p-2 text-xs text-zinc-500">{r.faculty_username || 'Faculty'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">Click Load Section Records to fetch stored attendance.</p>
          )}
        </Panel>
      )}

      {activeTab === 'manual-cie' && (
        <Panel title="Continuous Internal Evaluation (CIE) Console" note="Enter assessment scores; total is calculated automatically">
          <form onSubmit={submitManualCie} className="grid gap-3 sm:grid-cols-3">
            <Input label="Student USN" required value={cieUsn} onChange={setCieUsn} placeholder="e.g. 1RL26CS001" />
            <Input label="Department" required value={cieDept} onChange={setCieDept} />
            <Input label="Semester" type="number" required value={cieSem} onChange={setCieSem} />
            <Input label="Subject Code" required value={cieSub} onChange={setCieSub} />
            <div className="sm:col-span-2">
              <Input label="Subject Name" value={cieSubName} onChange={setCieSubName} />
            </div>
            <Input label="CIE 1 Marks" type="number" step="0.01" value={cie1} onChange={setCie1} />
            <Input label="CIE 2 Marks" type="number" step="0.01" value={cie2} onChange={setCie2} />
            <Input label="CIE 3 Marks" type="number" step="0.01" value={cie3} onChange={setCie3} />
            <Input label="Assignment Marks" type="number" step="0.01" value={cieAssign} onChange={setCieAssign} />
            <Input label="Max Marks" type="number" value={cieMax} onChange={setCieMax} />
            <div className="sm:col-span-3">
              <button className={button} disabled={busy}>Upsert CIE Marks</button>
            </div>
          </form>
        </Panel>
      )}

      {activeTab === 'eod-unlock' && (
        <div className="space-y-4">
          {isFaculty && (
            <Panel title="Submit Post-Lock Edit Request" note="Institutional workflow for post-EOD record adjustment">
              <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                run(() => api.post('/api/v1/faculty/unlock-request', {
                  academicRecordId: Number(f.get('academicRecordId')),
                  proposedVal: f.get('proposedVal'),
                  reason: f.get('reason'),
                }));
              }}>
                <label className="space-y-1.5 text-xs font-semibold">Academic Record ID<input name="academicRecordId" type="number" className={field} required /></label>
                <label className="space-y-1.5 text-xs font-semibold">Proposed Value<input name="proposedVal" className={field} required /></label>
                <label className="space-y-1.5 text-xs font-semibold">Reason<input name="reason" className={field} required /></label>
                <div className="sm:col-span-3"><button className={button}>Request Unlock</button></div>
              </form>
            </Panel>
          )}
          {(isHod || isSuperAdmin) && (
            <Panel title="Review Academic Unlock Request" note="Multi-tier unlock authorization">
              <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const ep = isHod ? '/api/v1/hod/unlock-approve/' : '/api/v1/principal/unlock-approve/';
                run(() => api.patch(ep + f.get('requestId'), { decision: f.get('decision') }));
              }}>
                <label className="space-y-1.5 text-xs font-semibold">Request ID<input name="requestId" className={field} required /></label>
                <label className="space-y-1.5 text-xs font-semibold">Decision<select name="decision" className={field}><option>APPROVED</option><option>REJECTED</option></select></label>
                <div className="sm:col-span-3"><button className={button}>Submit Review</button></div>
              </form>
            </Panel>
          )}
        </div>
      )}

      <Notice error={err} result={result} loading={busy} />
    </div>
  );
}

function PlacementWorkspace({ user, isSuperAdmin, isStudent }) {
  const [drives, setDrives] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [applyModal, setApplyModal] = useState(null);
  const [resumeUrl, setResumeUrl] = useState('');

  const [companyName, setCompanyName] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [packageLpa, setPackageLpa] = useState('');
  const [minCgpa, setMinCgpa] = useState('6.5');
  const [eligibleBranches, setEligibleBranches] = useState('CSE,AIML,DS,CYBER');
  const [driveDate, setDriveDate] = useState('');

  const isPlcAdmin = isSuperAdmin || (user?.baseRole === 'ADMIN' && user?.sectionCode === 'PLC');

  const loadDrives = async () => {
    setLoading(true); setError('');
    try {
      const res = await api.get('/api/v1/placements/drives');
      setDrives(res.data?.drives || []);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDrives(); }, []);

  const submitDrive = async (e) => {
    e.preventDefault();
    setLoading(true); setError(''); setResult(null);
    try {
      const res = await api.post('/api/v1/placements/drives', {
        company_name: companyName,
        role_title: roleTitle,
        package_lpa: Number(packageLpa),
        min_cgpa: Number(minCgpa),
        eligible_branches: eligibleBranches.split(',').map((s) => s.trim().toUpperCase()),
        drive_date: driveDate,
        status: 'UPCOMING',
      });
      setResult(res.data);
      setCompanyName(''); setRoleTitle(''); setPackageLpa(''); setDriveDate('');
      loadDrives();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  const applyForDrive = async (e) => {
    e.preventDefault();
    if (!applyModal) return;
    setLoading(true); setError(''); setResult(null);
    try {
      const res = await api.post(`/api/v1/placements/drives/${applyModal.id}/apply`, {
        resume_url: resumeUrl || undefined,
      });
      setResult(res.data);
      setApplyModal(null);
      setResumeUrl('');
      loadDrives();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {isPlcAdmin && (
        <Panel title="Create Placement Drive" note="Announce campus recruitment drives for eligible branches">
          <form onSubmit={submitDrive} className="grid gap-3 sm:grid-cols-3">
            <Input label="Company Name" required value={companyName} onChange={setCompanyName} placeholder="e.g. Google India" />
            <Input label="Role Title" required value={roleTitle} onChange={setRoleTitle} placeholder="e.g. Software Engineer" />
            <Input label="Package (LPA)" type="number" step="0.1" required value={packageLpa} onChange={setPackageLpa} placeholder="e.g. 14.5" />
            <Input label="Minimum CGPA" type="number" step="0.1" value={minCgpa} onChange={setMinCgpa} />
            <Input label="Eligible Branches (comma-separated)" value={eligibleBranches} onChange={setEligibleBranches} />
            <Input label="Drive Date" type="date" required value={driveDate} onChange={setDriveDate} />
            <div className="sm:col-span-3">
              <button className={button} disabled={loading}>Publish Placement Drive</button>
            </div>
          </form>
        </Panel>
      )}

      <Panel title="Active & Upcoming Placement Drives" note="Live opportunities from the placement portal">
        <div className="mb-3 flex justify-end">
          <button className={secondary} onClick={loadDrives}><RefreshCw size={14} /> Refresh</button>
        </div>
        {drives.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-zinc-500">
                <tr><th className="p-2">Company</th><th className="p-2">Role</th><th className="p-2">Package</th><th className="p-2">Min CGPA</th><th className="p-2">Branches</th><th className="p-2">Date</th><th className="p-2">Status</th><th className="p-2"></th></tr>
              </thead>
              <tbody>
                {drives.map((d) => (
                  <tr key={d.id} className="border-t border-zinc-100">
                    <td className="p-2 font-semibold text-zinc-900">{d.company_name}</td>
                    <td className="p-2">{d.role_title}</td>
                    <td className="p-2 font-mono font-bold text-emerald-700">₹{d.package_lpa} LPA</td>
                    <td className="p-2">{d.min_cgpa}</td>
                    <td className="p-2 text-xs">{Array.isArray(d.eligible_branches) ? d.eligible_branches.join(', ') : d.eligible_branches}</td>
                    <td className="p-2 text-xs">{d.drive_date ? new Date(d.drive_date).toLocaleDateString() : '—'}</td>
                    <td className="p-2">
                      <span className={'rounded-full px-2 py-0.5 text-xs font-semibold ' + (d.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-100 text-zinc-800')}>
                        {d.status}
                      </span>
                    </td>
                    <td className="p-2">
                      {isStudent && (
                        <button className={secondary} onClick={() => setApplyModal(d)}>Apply</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">{loading ? 'Loading drives...' : 'No placement drives scheduled.'}</p>
        )}
      </Panel>

      {applyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold">Apply for {applyModal.company_name}</h3>
            <p className="text-xs text-zinc-500">{applyModal.role_title} • ₹{applyModal.package_lpa} LPA</p>
            <form onSubmit={applyForDrive} className="space-y-3">
              <Input label="Resume URL (PDF or Drive link)" value={resumeUrl} onChange={setResumeUrl} placeholder="https://..." />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className={secondary} onClick={() => setApplyModal(null)}>Cancel</button>
                <button type="submit" className={button} disabled={loading}>Confirm Application</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Notice error={error} result={result} loading={loading} />
    </div>
  );
}


function PeopleWorkspace({ isFaculty,isHod,isSuperAdmin }) {const [mentees,setMentees]=useState([]),[risk,setRisk]=useState([]),[error,setError]=useState(''),[result,setResult]=useState(null);const load=async()=>{try{const [m,r]=await Promise.all([api.get('/api/v1/faculty/lg-mentees'),api.get('/api/v1/faculty/lg-radar')]);setMentees(m.data?.mentees||[]);setRisk(r.data?.atRiskMentees||[]);setError('');}catch(e){setError(e.response?.data?.error||e.message);}};useEffect(()=>{if(isFaculty||isHod||isSuperAdmin)load();},[]);const [q,setQ]=useState('');return <div className="space-y-4"><Panel title="LG mentees" note="Visible when your role is authorized by the mentorship API."><button className={secondary+' mb-3'} onClick={load}>Refresh</button>{mentees.length?mentees.map(m=><div key={m.usn} className="grid gap-2 border-t border-zinc-100 py-3 sm:grid-cols-4"><Stat label="Student" value={m.fullName}/><Stat label="USN" value={m.usn}/><Stat label="Attendance" value={m.attendancePercentage==null?'No record':m.attendancePercentage+'%'}/><Stat label="Pending dues" value={m.pendingFeeDues}/></div>):<p className="text-sm text-zinc-500">No mentees returned for this account.</p>}</Panel><Panel title="At-risk radar" note="Risk rows are returned by the live radar endpoint.">{risk.length?risk.map(m=><div key={m.usn} className="flex flex-wrap justify-between gap-2 border-t border-zinc-100 py-3 text-sm"><span>{m.fullName} · {m.usn}</span><span className="text-amber-700">{m.riskTriggers?.join(' · ')}</span></div>):<p className="text-sm text-zinc-500">No at-risk rows were returned.</p>}</Panel>{(isHod||isSuperAdmin)&&<Panel title="Assign LG mentor" note="Map existing student USNs to an existing faculty user ID."><form className="grid gap-3 sm:grid-cols-3" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{const r=await api.post('/api/v1/hod/lg-mapping/assign',{lgFacultyId:f.get('lgFacultyId'),studentUsns:f.get('studentUsns').split(/[\s,]+/).filter(Boolean),department:f.get('department')});setResult(r.data);setError('');}catch(x){setError(x.response?.data?.error||x.message);}}}><label className="space-y-1.5 text-xs font-semibold">Faculty user ID<input name="lgFacultyId" className={field} required/></label><label className="space-y-1.5 text-xs font-semibold">Department<input name="department" className={field} required/></label><label className="space-y-1.5 text-xs font-semibold">Student USNs<input name="studentUsns" className={field} placeholder="Comma or space separated" required/></label><button className={button}>Assign mentor</button></form></Panel>}{(isHod||isSuperAdmin)&&<Panel title="Manage sub-roles" note="Assign role codes supported by the LG controller to an existing user."><form className="grid gap-3 sm:grid-cols-3" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{const r=await api.patch('/api/v1/hod/assign-subroles',{targetUserId:f.get('targetUserId'),subRoles:f.get('subRoles').split(/[\s,]+/).filter(Boolean)});setResult(r.data);setError('');}catch(x){setError(x.response?.data?.error||x.message);}}}><label className="space-y-1.5 text-xs font-semibold">Target user ID<input name="targetUserId" className={field} required/></label><label className="space-y-1.5 text-xs font-semibold">Sub-role codes<input name="subRoles" className={field} placeholder="CR, LG_COORDINATOR" required/></label><button className={button}>Assign sub-roles</button></form></Panel>}<Notice error={error} result={result}/></div>}

function FinanceWorkspace({ user,isFinance,isSuperAdmin,isStudent }) {const [usn,setUsn]=useState(user?.username||''),[ledger,setLedger]=useState(null),[clearance,setClearance]=useState(null),[error,setError]=useState(''),[result,setResult]=useState(null);if(!isStudent&&!isFinance&&!isSuperAdmin)return <Panel title="Finance & clearance"><p className="text-sm text-zinc-500">This service is available to students and finance administrators.</p></Panel>;const load=async()=>{if(!usn)return;try{const [l,c]=await Promise.all([api.get('/api/v1/finance/ledger/'+encodeURIComponent(usn)),api.get('/api/v1/student/clearance-status/'+encodeURIComponent(usn))]);setLedger(l.data);setClearance(c.data);setError('');}catch(e){setError(e.response?.data?.error||e.message);}};return <div className="space-y-4"><Panel title="Student ledger and clearance" note="Read actual student finance and examination clearance data."><div className="flex flex-wrap gap-2"><input className={field+' max-w-sm'} value={usn} onChange={e=>setUsn(e.target.value)} readOnly={isStudent} aria-label="Student USN" placeholder="Student USN"/><button className={button} onClick={load}>Load ledger</button></div>{ledger&&<div className="mt-4"><pre className="max-h-64 overflow-auto rounded-xl bg-zinc-50 p-3 text-xs">{JSON.stringify(ledger,null,2)}</pre></div>}{clearance&&<div className="mt-3 rounded-xl border border-[#EBEBEF] p-3 text-sm">Clearance response: <strong>{String(clearance.clearanceStatus ?? clearance.eligible ?? 'Returned')}</strong><pre className="mt-2 overflow-auto text-xs">{JSON.stringify(clearance,null,2)}</pre></div>}</Panel>{(isFinance||isSuperAdmin)&&<Panel title="Create a ledger charge" note="Finance writes are restricted to the finance administrator or super admin."><form className="grid gap-3 sm:grid-cols-3" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{const r=await api.post('/api/v1/finance/ledger/charge',{studentUsn:f.get('studentUsn'),category:f.get('category'),title:f.get('title'),totalAmount:Number(f.get('totalAmount')),dueDate:f.get('dueDate')||undefined});setResult(r.data);setError('');}catch(x){setError(x.response?.data?.error||x.message);}}}><label className="space-y-1.5 text-xs font-semibold">Student USN<input name="studentUsn" className={field} required/></label><label className="space-y-1.5 text-xs font-semibold">Category<select name="category" className={field}>{['TUITION','EXAM','FINE','OTHER'].map(x=><option key={x}>{x}</option>)}</select></label><label className="space-y-1.5 text-xs font-semibold">Title<input name="title" className={field} required/></label><label className="space-y-1.5 text-xs font-semibold">Amount<input name="totalAmount" type="number" min="0.01" step="0.01" className={field} required/></label><label className="space-y-1.5 text-xs font-semibold">Due date<input name="dueDate" type="date" className={field}/></label><button className={button}>Create charge</button></form></Panel>}{(isFinance||isSuperAdmin)&&<Panel title="Record a ledger payment" note="Payment writes require a ledger ID and positive amount."><form className="grid gap-3 sm:grid-cols-2" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{const r=await api.post('/api/v1/finance/ledger/pay',{ledgerId:Number(f.get('ledgerId')),amountPaid:Number(f.get('amountPaid')),paymentMode:f.get('paymentMode')||undefined,referenceNo:f.get('referenceNo')||undefined});setResult(r.data);setError('');}catch(x){setError(x.response?.data?.error||x.message);}}}><label className="space-y-1.5 text-xs font-semibold">Ledger ID<input name="ledgerId" className={field} type="number" required/></label><label className="space-y-1.5 text-xs font-semibold">Amount paid<input name="amountPaid" className={field} type="number" min="0.01" step="0.01" required/></label><label className="space-y-1.5 text-xs font-semibold">Payment mode<input name="paymentMode" className={field}/></label><label className="space-y-1.5 text-xs font-semibold">Reference number<input name="referenceNo" className={field}/></label><button className={button}>Record payment</button></form></Panel>}{isStudent&&<p className="rounded-xl bg-zinc-50 p-3 text-sm text-zinc-600">Your USN is prefilled from your authenticated username. Review only your own ledger.</p>}<Notice error={error} result={result}/></div>}

function VaultWorkspace({user,isAdmission,isSuperAdmin,isStudent}) {const [usn,setUsn]=useState(user?.username||''),[vault,setVault]=useState(null),[error,setError]=useState(''),[result,setResult]=useState(null);if(!isStudent&&!isAdmission&&!isSuperAdmin)return <Panel title="Student document vault"><p className="text-sm text-zinc-500">Vault access is limited to the student's own record or an authorized admissions administrator.</p></Panel>;const load=()=>api.get('/api/v1/admissions/vault/'+encodeURIComponent(usn)).then(r=>{setVault(r.data);setError('');}).catch(e=>setError(e.response?.data?.error||e.message));return <div className="space-y-4"><Panel title="Student document vault" note="Vault data is fetched for the entered student USN."><div className="flex gap-2"><input className={field+' max-w-sm'} value={usn} onChange={e=>setUsn(e.target.value)} readOnly={isStudent} placeholder="Student USN"/><button className={button} onClick={load}>Load vault</button></div>{vault&&<pre className="mt-3 max-h-64 overflow-auto rounded-xl bg-zinc-50 p-3 text-xs">{JSON.stringify(vault,null,2)}</pre>}</Panel>{isAdmission||isSuperAdmin?<Panel title="Upload and verify documents" note="Upload stores the file through the backend vault endpoint."><form className="grid gap-3 sm:grid-cols-2" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{const body=new FormData();body.append('studentUsn',f.get('studentUsn'));body.append('docType',f.get('docType'));body.append('document',f.get('document'));const r=await api.post('/api/v1/admissions/documents/upload',body,{headers:{'Content-Type':'multipart/form-data'}});setResult(r.data);setError('');}catch(x){setError(x.response?.data?.error||x.message);}}}><label className="space-y-1.5 text-xs font-semibold">Student USN<input name="studentUsn" className={field} required/></label><label className="space-y-1.5 text-xs font-semibold">Document type<input name="docType" className={field} required/></label><label className="space-y-1.5 text-xs font-semibold">Document file<input name="document" type="file" accept=".jpg,.jpeg,.png,.pdf" className={field} required/></label><button className={button}>Upload document</button></form><form className="mt-4 grid gap-3 sm:grid-cols-3" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{const r=await api.patch('/api/v1/admissions/documents/'+f.get('docId')+'/verify',{verificationStatus:f.get('verificationStatus'),custodyStatus:f.get('custodyStatus')});setResult(r.data);setError('');}catch(x){setError(x.response?.data?.error||x.message);}}}><label className="space-y-1.5 text-xs font-semibold">Document ID<input name="docId" className={field} required/></label><label className="space-y-1.5 text-xs font-semibold">Verification<select name="verificationStatus" className={field}>{['PENDING_REVIEW','VERIFIED','REJECTED'].map(x=><option key={x}>{x}</option>)}</select></label><label className="space-y-1.5 text-xs font-semibold">Custody<select name="custodyStatus" className={field}>{['WITH_STUDENT','SUBMITTED_TO_ADMISSION_DEPT','RETURNED_TO_STUDENT'].map(x=><option key={x}>{x}</option>)}</select></label><button className={button}>Update verification</button></form></Panel>:<p className="rounded-xl border border-[#EBEBEF] bg-zinc-50 p-3 text-sm text-zinc-500">Document upload and verification are limited to admissions administrators and super admins.</p>}<Notice error={error} result={result}/></div>}

export default function ServicesView({ initialTool=null }) {
 const {user}=useAuth();const [activeTool,setActiveTool]=useState(initialTool);const [category,setCategory]=useState('venues');
 const isSuperAdmin=user?.adminTier==='SUPER_ADMIN';const isHod=user?.adminTier==='HOD_ADMIN'||user?.subRoles?.includes?.('HOD');const isAdmission=user?.baseRole==='ADMIN'&&user?.sectionCode==='ADM';const isFinance=user?.baseRole==='ADMIN'&&user?.sectionCode==='ACC';const isFaculty=user?.baseRole==='FACULTY';const isStudent=user?.baseRole==='STUDENT';
 if(activeTool==='provision-authority')return <ProvisionAuthorityTool onBack={()=>setActiveTool(null)}/>;
 if(activeTool==='provision-student')return <StudentProvisioningTool onBack={()=>setActiveTool(null)}/>;
 if(activeTool==='db-ledger')return <DbLedgerTool onBack={()=>setActiveTool(null)}/>;
 if(activeTool==='db-diagnostics')return <DbDiagnosticsTool onBack={()=>setActiveTool(null)}/>;
 const items=[{id:'venues',label:'Venue bookings',icon:Landmark,show:true},{id:'timetable',label:'Timetable & swaps',icon:CalendarDays,show:true},{id:'academic',label:'Academic & CIE',icon:GraduationCap,show:true},{id:'placements',label:'Placements',icon:Briefcase,show:true},{id:'leave',label:'Leave requests',icon:FileText,show:true},{id:'mentorship',label:'Mentorship',icon:Users,show:isFaculty||isHod||isSuperAdmin},{id:'finance',label:'Finance & clearance',icon:Activity,show:true},{id:'vault',label:'Document vault',icon:ShieldCheck,show:true},{id:'provision',label:'Provisioning',icon:Users,show:isSuperAdmin||isHod||isAdmission},{id:'database',label:'Database tools',icon:Database,show:isSuperAdmin}].filter(x=>x.show);
 const openProvision=(key)=>setActiveTool(key);
 return <div className="space-y-5"><header className="rounded-3xl bg-gradient-to-br from-[#1e1916] via-[#24232a] to-slate-900 p-6 text-white"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-300">Services</p><h1 className="mt-2 text-2xl font-bold">Institutional workflows</h1><p className="mt-2 max-w-2xl text-sm text-white/70">Choose an action available to your signed-in role. Each view is connected to the current backend API.</p></header><nav className="flex gap-2 overflow-x-auto pb-1">{items.map(x=><button key={x.id} onClick={()=>setCategory(x.id)} className={'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-semibold '+(category===x.id?'bg-[#121214] text-white':'border border-[#EBEBEF] bg-white text-zinc-700')}><x.icon size={15}/>{x.label}</button>)}</nav>
 {category==='venues'&&<VenueWorkspace user={user} isSuperAdmin={isSuperAdmin} isHod={isHod} isPrincipal={user?.adminTier==='PRINCIPAL'||user?.subRoles?.includes?.('PRINCIPAL')||user?.sectionCode==='PRN'} isFaculty={isFaculty} isStudent={isStudent}/>}
 {category==='timetable'&&<TimetableWorkspace user={user} isHod={isHod} isSuperAdmin={isSuperAdmin} isFaculty={isFaculty}/>}
 {category==='leave'&&<LeaveWorkspace isStudent={isStudent} isFaculty={isFaculty}/>}
 {category==='academic'&&<AcademicWorkspace user={user} isFaculty={isFaculty} isHod={isHod} isSuperAdmin={isSuperAdmin} isStudent={isStudent}/>}
 {category==='placements'&&<PlacementWorkspace user={user} isSuperAdmin={isSuperAdmin} isStudent={isStudent}/>}
 {category==='mentorship'&&<PeopleWorkspace isFaculty={isFaculty} isHod={isHod} isSuperAdmin={isSuperAdmin}/>}
 {category==='finance'&&<FinanceWorkspace user={user} isFinance={isFinance} isSuperAdmin={isSuperAdmin} isStudent={isStudent}/>}
 {category==='vault'&&<VaultWorkspace user={user} isAdmission={isAdmission} isSuperAdmin={isSuperAdmin} isStudent={isStudent}/>}
 {category==='provision'&&<div className="grid gap-4 sm:grid-cols-2">{isSuperAdmin&&<Panel title="Provision authority"><p className="mb-3 text-sm text-zinc-600">Create institutional authorities through the provisioning API.</p><button className={button} onClick={()=>openProvision('provision-authority')}>Open authority provisioning</button></Panel>}{(isHod||isAdmission)&&<Panel title="Provision student"><p className="mb-3 text-sm text-zinc-600">Create a student record through the role-scoped endpoint.</p><button className={button} onClick={()=>openProvision('provision-student')}>Open student provisioning</button></Panel>}</div>}
 {category==='database'&&<div className="grid gap-4 sm:grid-cols-2"><Panel title="PostgreSQL ledger"><button className={button} onClick={()=>openProvision('db-ledger')}>Open database ledger</button></Panel><Panel title="Schema and storage diagnostics"><button className={button} onClick={()=>openProvision('db-diagnostics')}>Open database diagnostics</button></Panel></div>}
 </div>;
}
