import React, { useEffect, useState } from 'react';
import { Activity, ArrowRight, CalendarDays, Database, GraduationCap, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import api from '../config/api';
import { useAuth } from '../context/AuthContext';

const card = 'rounded-2xl border border-[#EBEBEF] bg-white p-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]';
const format = (value) => value === null || value === undefined || value === '' ? '—' : value;
const roleLabel = (user) => user?.adminTier || user?.subRoles?.[0] || user?.baseRole || 'Account';
function Empty({ children = 'No records are available from the connected service.' }) { return <p className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500">{children}</p>; }
function ErrorNote({ children }) { return children ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{children}</p> : null; }
function Metric({ label, value, detail }) { return <div className="rounded-xl border border-[#EBEBEF] bg-white p-4"><p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p><p className="mt-2 text-2xl font-bold tracking-tight text-zinc-900">{format(value)}</p>{detail && <p className="mt-1 text-xs text-zinc-500">{detail}</p>}</div>; }
function Card({ title, subtitle, children, className = '' }) { return <section className={card + ' ' + className}><div className="mb-4"><h2 className="text-sm font-semibold text-zinc-900">{title}</h2>{subtitle && <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>}</div>{children}</section>; }

export default function DashboardView({ onNavigateTab }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [storage, setStorage] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const isHod = user?.adminTier === 'HOD_ADMIN' || user?.subRoles?.includes?.('HOD');
  const isSuperAdmin = user?.adminTier === 'SUPER_ADMIN';
  const isFaculty = user?.baseRole === 'FACULTY' && !isHod;
  const isStudent = user?.baseRole === 'STUDENT';
  const isAdmission = user?.baseRole === 'ADMIN' && user?.sectionCode === 'ADM';
  const isFinance = user?.baseRole === 'ADMIN' && user?.sectionCode === 'ACC';

  const load = async () => {
    setLoading(true); setError('');
    try {
      const results = await Promise.allSettled([
        api.get('/api/v1/profile/me'),
        api.get('/api/v1/dashboard/metrics'),
        isSuperAdmin ? api.get('/api/v1/db/verify-storage') : Promise.resolve(null),
      ]);
      if (results[0].status === 'fulfilled') setProfile(results[0].value?.data?.profile || null);
      else throw results[0].reason;
      if (results[1].status === 'fulfilled') setMetrics(results[1].value?.data?.metrics || null);
      else throw results[1].reason;
      if (results[2].status === 'fulfilled') setStorage(results[2].value?.data || null);
      else setStorage(null);
    } catch (e) { setError(e.response?.data?.error || e.message || 'Dashboard data could not be loaded.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [user?.username]);

  const student = profile?.studentDetails;
  const faculty = profile?.facultyDetails;
  const dept = student?.department || faculty?.department || user?.department;
  const sem = student?.semester;
  const sec = student?.section;
  useEffect(() => {
    if (!isStudent || !dept || !sem || !sec) { setSchedule(null); return; }
    const params = new URLSearchParams({ dept, date: new Date().toISOString().slice(0,10) });
    if (sem) params.set('sem', sem);
    if (sec) params.set('sec', sec);
    api.get('/api/v1/timetable/daily-view?' + params.toString())
      .then((r) => setSchedule(r.data?.schedule || []))
      .catch(() => setSchedule(null));
  }, [dept, sem, sec, isStudent]);

  const profileName = profile?.fullName || user?.fullName || user?.username;
  const heroTone = isHod ? 'from-emerald-950 via-[#15352f] to-slate-900' : isAdmission ? 'from-orange-950 via-[#3b2116] to-slate-900' : 'from-[#21140f] via-[#20202a] to-slate-900';
  const openServices = () => onNavigateTab?.('services');
  let metricsContent = null;
  if (isStudent) metricsContent = <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <Metric label="Attendance" value={metrics?.totalSessions ? String(metrics.attendancePercentage) + '%' : 'No records'} detail={metrics?.totalSessions ? String(metrics.attendedSessions) + ' of ' + metrics.totalSessions + ' recorded sessions' : 'No attendance entries returned'} />
    <Metric label="CIE average" value={metrics?.avgCieMarks} detail="Value returned by the dashboard metrics endpoint" />
    <Metric label="Pending dues" value={metrics?.pendingDues != null ? metrics.pendingDues : '—'} detail={metrics?.pendingBillsCount != null ? String(metrics.pendingBillsCount) + ' unpaid bills' : 'Finance data'} />
    <Metric label="Documents verified" value={metrics?.totalDocuments != null ? String(metrics.verifiedDocuments) + ' / ' + metrics.totalDocuments : '—'} detail="Student vault" />
  </div>;
  else if (isFaculty) metricsContent = <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <Metric label="Today's classes" value={metrics?.todaySlotsCount} detail="Returned timetable slots" />
    <Metric label="LG mentees" value={metrics?.lgMenteesCount} />
    <Metric label="Pending leave requests" value={metrics?.pendingLeaveRequests} />
  </div>;
  else if (isHod) metricsContent = <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <Metric label="Department students" value={metrics?.departmentStudents} detail={dept || 'Department scope'} />
    <Metric label="Department faculty" value={metrics?.departmentFaculty} />
    <Metric label="Pending record unlocks" value={metrics?.pendingPostEodUnlockRequests} />
    <Metric label="Attendance average" value={metrics?.departmentAttendanceAverage != null ? String(metrics.departmentAttendanceAverage) + '%' : '—'} />
  </div>;
  else metricsContent = <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <Metric label="Total users" value={metrics?.collegeUserTotals?.TOTAL} />
    <Metric label="Administrators" value={metrics?.collegeUserTotals?.ADMIN} />
    <Metric label="Faculty" value={metrics?.collegeUserTotals?.FACULTY} />
    <Metric label="Students" value={metrics?.collegeUserTotals?.STUDENT} />
  </div>;

  const todaysClasses = isFaculty ? metrics?.todaySchedule : schedule;
  const sections = storage?.tableCounts ? Object.entries(storage.tableCounts) : [];
  return <div className="space-y-5">
    <div className={'relative overflow-hidden rounded-3xl bg-gradient-to-br ' + heroTone + ' p-6 text-white shadow-sm sm:p-8'}>
      <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-300">{roleLabel(user)} portal</p><h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Welcome, {format(profileName)}</h1><p className="mt-2 text-sm text-white/75">{dept ? dept + ' department' : 'Your role-scoped institutional workspace'}</p></div>
        <button onClick={openServices} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-zinc-900 hover:bg-orange-50">Open Services <ArrowRight size={16}/></button>
      </div>
    </div>
    <ErrorNote>{error}</ErrorNote>
    {loading ? <div className={card + ' text-sm text-zinc-500'}>Loading live dashboard data…</div> : <>
      <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Live overview</h2><button onClick={load} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#EBEBEF] bg-white px-4 text-sm font-medium"><RefreshCw size={15}/> Refresh</button></div>
      {metricsContent}
      {isStudent && <div className="grid gap-4 lg:grid-cols-2"><Card title="Academic identity" subtitle="Loaded from your authenticated profile">{student ? <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-zinc-500">USN</dt><dd className="mt-1 font-medium">{format(student.usn || user?.username)}</dd></div><div><dt className="text-xs text-zinc-500">Semester / section</dt><dd className="mt-1 font-medium">{format(student.semester)} / {format(student.section)}</dd></div></dl> : <Empty>Student profile details were not returned.</Empty>}</Card><Card title="Student services" subtitle="Actions connect to available institutional workflows"><div className="flex flex-wrap gap-2"><button className="min-h-11 rounded-xl bg-[#121214] px-4 text-sm font-semibold text-white" onClick={openServices}>Leave, finance, clearance and venues</button></div></Card></div>}
      {isAdmission && <div className="grid gap-3 sm:grid-cols-3"><Metric label="Pending document review" value={metrics?.documentVerificationStatus?.pendingReview}/><Metric label="Verified documents" value={metrics?.documentVerificationStatus?.verified}/><Metric label="Student onboarding" value="Open service" detail="Provisioning workflow"/></div>}
      {isFinance && <div className="grid gap-3 sm:grid-cols-2"><Metric label="Collected" value={metrics?.financialOverview?.totalCollected}/><Metric label="Outstanding dues" value={metrics?.financialOverview?.totalOutstandingDues}/></div>}
      {(isStudent || isFaculty) && <Card title="Today's timetable" subtitle={schedule?.length === 0 ? 'The connected timetable has no slots for this day.' : 'Live entries returned by the timetable service.'}><div className="flex items-center gap-2 text-xs text-zinc-500 mb-3"><CalendarDays size={14}/> {new Date().toLocaleDateString()}</div>{Array.isArray(todaysClasses) && todaysClasses.length ? <div className="divide-y divide-zinc-100">{todaysClasses.map((slot) => <div key={slot.timetable_id || slot.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><span className="font-medium">Period {format(slot.period_no)} · {format(slot.subject_code)}</span><span className="text-zinc-500">{format(slot.department)} · {format(slot.section)} · Room {format(slot.room_no)}</span></div>)}</div> : <Empty>{todaysClasses === null ? 'Timetable data is unavailable for this profile.' : 'No timetable entries were returned for today.'}</Empty>}</Card>}
      {isSuperAdmin && <div className="grid gap-4 lg:grid-cols-2"><Card title="Database storage verification" subtitle="Live PostgreSQL storage diagnostics"><div className="flex items-start gap-3"><Database className="mt-0.5 text-emerald-600" size={18}/><div className="min-w-0 flex-1">{sections.length ? <div className="space-y-2">{sections.map(([name,count]) => <div key={name} className="flex justify-between gap-3 text-sm"><span className="break-all text-zinc-600">{name.replace(/_count$/, '')}</span><span className="font-mono font-semibold">{count}</span></div>)}</div> : <Empty>Storage metrics were not returned by the diagnostic endpoint.</Empty>}</div></div></Card><Card title="Administrative actions" subtitle="Available services for your authority"><button onClick={openServices} className="min-h-11 rounded-xl bg-[#121214] px-4 text-sm font-semibold text-white">Authority, venue and database tools</button></Card></div>}
      {isHod && <Card title="Department scope" subtitle="Metrics are returned by the HOD-scoped dashboard endpoint"><div className="grid gap-3 sm:grid-cols-2"><Metric label="Department" value={metrics?.department || dept}/><Metric label="Record unlocks awaiting review" value={metrics?.pendingPostEodUnlockRequests}/></div><button onClick={openServices} className="mt-4 min-h-11 rounded-xl bg-[#121214] px-4 text-sm font-semibold text-white">Open department services</button></Card>}
      {!isStudent && !isFaculty && !isHod && !isSuperAdmin && !isAdmission && !isFinance && <Card title="Role dashboard" subtitle="The API returned the available role metrics above"><Empty>No additional dashboard modules are connected to this role yet.</Empty></Card>}
    </>}
  </div>;
}
