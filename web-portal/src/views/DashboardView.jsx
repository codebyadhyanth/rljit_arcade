import React, { useEffect, useState } from 'react';
import api from '../config/api';
import { useAuth } from '../context/AuthContext';
import {
  Activity,
  ArrowRight,
  Award,
  BarChart3,
  Briefcase,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  CreditCard,
  Database,
  FolderOpen,
  GraduationCap,
  Landmark,
  RefreshCw,
  ShieldAlert,
  UserPlus,
  Users,
} from 'lucide-react';

const CARD_CLS =
  'rounded-2xl border border-[#EBEBEF] bg-white p-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]';

function formatInr(val) {
  const num = Number(val || 0);
  return `₹${num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatVal(val) {
  return val === null || val === undefined || val === '' ? '—' : val;
}

function KpiCard({ label, value, subtitle, icon: Icon, tone = 'slate' }) {
  const toneClasses = {
    slate: 'bg-slate-100 text-[#1E293B]',
    orange: 'bg-orange-50 text-[#EA580C]',
    emerald: 'bg-emerald-50 text-[#15803D]',
    amber: 'bg-amber-50 text-[#B45309]',
    rose: 'bg-rose-50 text-rose-700',
  };

  return (
    <div className={CARD_CLS}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            {label}
          </p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 truncate">
            {formatVal(value)}
          </p>
          {subtitle && (
            <p className="mt-1 text-xs text-zinc-500 truncate">{subtitle}</p>
          )}
        </div>
        {Icon && (
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              toneClasses[tone] || toneClasses.slate
            }`}
          >
            <Icon size={18} />
          </div>
        )}
      </div>
    </div>
  );
}

function DistributionBarRow({ label, count, total, meta, barColor = 'bg-[#1E293B]' }) {
  const safeTotal = total > 0 ? total : 1;
  const pct = Math.min(100, Math.round((Number(count || 0) / safeTotal) * 100));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-zinc-800 truncate">{label}</span>
          {meta && (
            <span className="text-[11px] text-zinc-400 font-mono truncate">{meta}</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 font-mono">
          <span className="font-bold text-zinc-900">{Number(count || 0).toLocaleString()}</span>
          <span className="text-[11px] text-zinc-500 w-10 text-right">{pct}%</span>
        </div>
      </div>
      <div className="h-2 w-full rounded-full bg-[#F4F4F6] overflow-hidden border border-[#EBEBEF]">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function QuickActionButton({ label, icon: Icon, onClick, primary = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-between gap-2.5 px-4 py-3 rounded-xl text-xs font-semibold transition ${
        primary
          ? 'bg-[#121214] hover:bg-black text-white shadow-sm'
          : 'bg-[#FBFBFC] hover:bg-zinc-100 text-zinc-800 border border-[#EBEBEF]'
      }`}
    >
      <span className="flex items-center gap-2">
        {Icon && <Icon size={15} className={primary ? 'text-orange-400' : 'text-[#EA580C]'} />}
        <span>{label}</span>
      </span>
      <ArrowRight size={14} className={primary ? 'text-zinc-400' : 'text-zinc-400'} />
    </button>
  );
}

export default function DashboardView({ onNavigate, onNavigateTab }) {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState(null);
  const [profile, setProfile] = useState(null);
  const [storage, setStorage] = useState(null);
  const [studentAttendance, setStudentAttendance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const isSuperAdmin = user?.adminTier === 'SUPER_ADMIN';
  const subRoles = Array.isArray(user?.subRoles) ? user.subRoles : [];
  const secCode = String(user?.sectionCode || '').trim().toUpperCase();
  const isHod =
    user?.adminTier === 'HOD_ADMIN' || subRoles.includes('HOD');
  const isManagement =
    isSuperAdmin || secCode === 'MGT' || subRoles.includes('MANAGEMENT');
  const isPrincipal =
    isSuperAdmin ||
    secCode === 'PRN' ||
    secCode === 'PRINCIPAL' ||
    subRoles.includes('PRINCIPAL');
  const isStudent = user?.baseRole === 'STUDENT';
  const isFaculty = user?.baseRole === 'FACULTY' && !isHod;
  const isGlobalAuthority = isSuperAdmin || user?.baseRole === 'ADMIN';
  const canViewAcademicsStaff =
    isSuperAdmin || isHod || isFaculty || isPrincipal || isManagement || secCode === 'EXM';
  const canViewFinance =
    isStudent ||
    isSuperAdmin ||
    isHod ||
    isManagement ||
    isPrincipal ||
    secCode === 'ACC' ||
    secCode === 'EXM';

  const navigateTo = (target) => {
    if (typeof onNavigate === 'function') {
      onNavigate(target);
    } else if (typeof onNavigateTab === 'function') {
      if (target === 'directory') {
        onNavigateTab('directory');
      } else {
        onNavigateTab('services', target);
      }
    }
  };

  const loadDashboard = async () => {
    setLoading(true);
    setError('');
    try {
      const requests = [
        api.get('/api/v1/analytics/overview'),
        api.get('/api/v1/profile/me'),
        isSuperAdmin ? api.get('/api/v1/db/verify-storage') : Promise.resolve(null),
        isStudent ? api.get('/api/v1/attendance/student/me') : Promise.resolve(null),
      ];

      const [analyticsRes, profileRes, storageRes, studentAttRes] = await Promise.allSettled(
        requests
      );

      if (analyticsRes.status === 'fulfilled') {
        setAnalytics(analyticsRes.value?.data || null);
      } else {
        throw analyticsRes.reason;
      }

      if (profileRes.status === 'fulfilled') {
        setProfile(profileRes.value?.data?.profile || null);
      } else {
        setProfile(null);
      }

      if (storageRes.status === 'fulfilled' && storageRes.value) {
        setStorage(storageRes.value.data || null);
      } else {
        setStorage(null);
      }

      if (studentAttRes.status === 'fulfilled' && studentAttRes.value) {
        setStudentAttendance(studentAttRes.value.data || null);
      } else {
        setStudentAttendance(null);
      }
    } catch (err) {
      setError(
        err.response?.data?.error || err.message || 'Unable to load live institutional analytics.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [user?.username]);

  const totals = analytics?.totals || {};
  const scope = analytics?.scope || {};
  const finance = analytics?.financeSummary || {};
  const academic = analytics?.academicSummary || {};
  const placement = analytics?.placementSummary || {};
  const venueStats = analytics?.venueStats || {};
  const studentsByDepartment = Array.isArray(analytics?.studentsByDepartment)
    ? analytics.studentsByDepartment
    : [];
  const alliedScienceByBranch = Array.isArray(analytics?.alliedScienceByBranch)
    ? analytics.alliedScienceByBranch
    : [];
  const studentsByYear = Array.isArray(analytics?.studentsByYear) ? analytics.studentsByYear : [];
  const facultyByClassification = Array.isArray(analytics?.facultyByClassification)
    ? analytics.facultyByClassification
    : [];
  const facultyByDepartment = Array.isArray(analytics?.facultyByDepartment)
    ? analytics.facultyByDepartment
    : [];

  const displayName = profile?.fullName || user?.fullName || user?.username || 'Authorized User';
  const roleTitle = isSuperAdmin
    ? 'Super Admin Command Center'
    : isHod
    ? `HOD Portal · ${profile?.department || user?.department || 'Department'}`
    : isGlobalAuthority
    ? `Institutional Authority · ${user?.sectionCode || user?.adminTier || 'ADMIN'}`
    : isFaculty
    ? `Faculty Workspace · ${profile?.department || user?.department || ''}`
    : 'Student Academic Portal';

  const studentDetails = profile?.studentDetails || {};
  const attStudent = studentAttendance?.student || {};
  const attSummary = studentAttendance?.summary || {};
  const facultyDetails = profile?.facultyDetails || {};

  const studentSemester = studentDetails.semester ?? attStudent.semester ?? profile?.semester;
  const studentAcademicYear =
    studentDetails.academicYear ||
    (studentSemester ? Math.ceil(Number(studentSemester) / 2) : null);
  const studentCoreBranch =
    attStudent.core_branch ||
    studentDetails.coreBranch ||
    studentDetails.department ||
    profile?.department ||
    user?.department;
  const studentAttendancePct =
    attSummary.total_classes > 0
      ? attSummary.attendance_percentage
      : academic.attendance_present_pct ?? 0;

  const totalDeptStudents = studentsByDepartment.reduce((s, r) => s + Number(r.count || 0), 0);
  const totalAlliedStudents = alliedScienceByBranch.reduce((s, r) => s + Number(r.count || 0), 0);
  const totalYearStudents = studentsByYear.reduce((s, r) => s + Number(r.count || 0), 0);
  const totalClassifiedFaculty = facultyByClassification.reduce(
    (s, r) => s + Number(r.count || 0),
    0
  );

  const financeCollectedPct =
    Number(finance.total_billed || 0) > 0
      ? Math.min(100, Math.round((Number(finance.total_collected || 0) / Number(finance.total_billed)) * 100))
      : 0;

  const liveCounts = storage?.liveTableCounts || null;

  return (
    <div className="space-y-6">
      {/* Institutional Hero Header */}
      <section className="rounded-3xl bg-[#121214] border border-white/10 p-6 sm:p-8 text-white shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-[#EA580C] text-white">
                {scope.role || user?.adminTier || user?.sectionCode || user?.baseRole || 'PORTAL'}
              </span>
              {scope.level && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-[#1C1C1F] text-zinc-300 border border-white/10">
                  Scope: {scope.level}
                  {scope.department ? ` · ${scope.department}` : ''}
                </span>
              )}
              {analytics?.execTimeMs !== undefined && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-emerald-950/80 text-emerald-300 border border-emerald-700/40">
                  <Clock size={11} />
                  SQL {analytics.execTimeMs} ms
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              {displayName}
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400">
              {roleTitle} · Live PostgreSQL Telemetry
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={loadDashboard}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1C1C1F] hover:bg-zinc-800 border border-white/10 text-xs font-semibold text-white transition disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span>Refresh Live Data</span>
            </button>
            <button
              type="button"
              onClick={() => navigateTo('venue-catalog')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#EA580C] hover:bg-[#C2410C] text-xs font-semibold text-white transition"
            >
              <Landmark size={14} />
              <span>Venue Catalog</span>
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div
          role="alert"
          className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-rose-800 text-xs"
        >
          <ShieldAlert size={16} className="text-rose-600 shrink-0 mt-0.5" />
          <span className="font-medium">{error}</span>
        </div>
      )}

      {loading && !analytics ? (
        <div className={`${CARD_CLS} text-xs text-zinc-500 py-10 text-center`}>
          Querying PostgreSQL operational tables...
        </div>
      ) : null}

      {/* 1. SUPER ADMIN / PRINCIPAL / MANAGEMENT / SECTION ADMIN VIEW */}
      {analytics && isGlobalAuthority && (
        <div className="space-y-6">
          {/* Primary Institutional KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Total Registered Users"
              value={Number(totals.users || 0).toLocaleString()}
              subtitle={`${Number(totals.admins || 0)} institutional admins`}
              icon={Users}
              tone="slate"
            />
            <KpiCard
              label="Total Students"
              value={Number(totals.students || 0).toLocaleString()}
              subtitle={`${studentsByDepartment.length} active department cohorts`}
              icon={GraduationCap}
              tone="orange"
            />
            <KpiCard
              label="Total Faculty"
              value={Number(totals.faculty || 0).toLocaleString()}
              subtitle={`${facultyByClassification.length} designations recorded`}
              icon={Award}
              tone="emerald"
            />
            <KpiCard
              label="Campus Venues"
              value={Number(totals.venues || 0).toLocaleString()}
              subtitle={`${totals.pendingBookings || 0} pending · ${totals.approvedBookings || 0} approved`}
              icon={Landmark}
              tone="amber"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Pending Venue Bookings"
              value={Number(totals.pendingBookings || 0).toLocaleString()}
              subtitle="Awaiting HOD / Management / Principal"
              icon={Building2}
              tone="amber"
            />
            <KpiCard
              label="Open Placement Drives"
              value={Number(totals.openDrives ?? totals.open_drives ?? 0).toLocaleString()}
              subtitle={`${placement.total_drives || 0} total drives · ${placement.total_applications || 0} applications`}
              icon={Briefcase}
              tone="emerald"
            />
            <KpiCard
              label="Finance Collected"
              value={formatInr(finance.total_collected)}
              subtitle={`${finance.paid_count || 0} settled invoices`}
              icon={CheckCircle2}
              tone="emerald"
            />
            <KpiCard
              label="Finance Outstanding"
              value={formatInr(finance.total_outstanding)}
              subtitle={`${finance.pending_count || 0} pending · ${finance.partial_count || 0} partial`}
              icon={CreditCard}
              tone="rose"
            />
          </div>

          {/* Quick Navigation Strip */}
          <div className={CARD_CLS}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900">Institutional Workspaces</h2>
                <p className="text-xs text-zinc-500">Jump directly to live role-authorized portals</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2.5">
              <QuickActionButton
                label="Venue Catalog"
                icon={Landmark}
                onClick={() => navigateTo('venue-catalog')}
                primary
              />
              {(isSuperAdmin || isManagement || isPrincipal) && (
                <QuickActionButton
                  label="Approval Queue"
                  icon={Building2}
                  onClick={() => navigateTo('venue-approvals')}
                />
              )}
              <QuickActionButton
                label="Timetable"
                icon={CalendarDays}
                onClick={() => navigateTo('timetable')}
              />
              {canViewAcademicsStaff && (
                <QuickActionButton
                  label="Attendance"
                  icon={ClipboardCheck}
                  onClick={() => navigateTo('attendance')}
                />
              )}
              {canViewAcademicsStaff && (
                <QuickActionButton
                  label="CIE Marks"
                  icon={Award}
                  onClick={() => navigateTo('cie-marks')}
                />
              )}
              {isSuperAdmin && (
                <QuickActionButton
                  label="Student Analyzer"
                  icon={BarChart3}
                  onClick={() => navigateTo('student-analyzer')}
                />
              )}
              <QuickActionButton
                label="Placements"
                icon={Briefcase}
                onClick={() => navigateTo('placements')}
              />
              {canViewFinance && (
                <QuickActionButton
                  label="Finance Ledger"
                  icon={CreditCard}
                  onClick={() => navigateTo('finance')}
                />
              )}
              {(isSuperAdmin || secCode === 'ADM') && (
                <QuickActionButton
                  label="Provision Student"
                  icon={UserPlus}
                  onClick={() => navigateTo('admin-student')}
                />
              )}
              <QuickActionButton
                label="Docs & Notes"
                icon={FolderOpen}
                onClick={() => navigateTo('docs-vault')}
              />
            </div>
          </div>

          {/* Distribution Breakdowns */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Department Student Breakdown */}
            <section className={CARD_CLS}>
              <div className="flex items-center justify-between border-b border-[#EBEBEF] pb-3 mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-900">
                    Department Student Breakdown
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Regular & Lateral Entry enrollment across departments
                  </p>
                </div>
                <span className="font-mono text-xs font-bold text-zinc-700 bg-[#F4F4F6] px-2.5 py-1 rounded-lg border border-[#EBEBEF]">
                  {totalDeptStudents.toLocaleString()} Total
                </span>
              </div>

              {studentsByDepartment.length > 0 ? (
                <div className="space-y-3">
                  {studentsByDepartment.map((dept) => (
                    <DistributionBarRow
                      key={dept.department}
                      label={dept.department}
                      count={dept.count}
                      total={totalDeptStudents}
                      meta={`REG ${dept.regular_count || 0} · LAT ${dept.lateral_count || 0}`}
                      barColor={
                        dept.department === 'ALLIED_SCIENCE' ? 'bg-[#EA580C]' : 'bg-[#1E293B]'
                      }
                    />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-500">No student department records found.</p>
              )}

              {/* Allied Science Year-1 Branch Breakdown */}
              <div className="mt-6 pt-4 border-t border-[#EBEBEF]">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-600">
                    ALLIED_SCIENCE Year-1 Core Branch Breakdown
                  </h3>
                  <span className="font-mono text-[11px] font-semibold text-[#EA580C]">
                    {totalAlliedStudents.toLocaleString()} Year-1 Students
                  </span>
                </div>
                {alliedScienceByBranch.length > 0 ? (
                  <div className="space-y-2.5">
                    {alliedScienceByBranch.map((b) => (
                      <DistributionBarRow
                        key={b.core_branch}
                        label={b.core_branch}
                        count={b.count}
                        total={totalAlliedStudents}
                        barColor="bg-[#EA580C]"
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500">
                    No ALLIED_SCIENCE Year-1 records present in database.
                  </p>
                )}
              </div>
            </section>

            {/* Faculty Classification + Academic Year + Finance */}
            <div className="space-y-6">
              <section className={CARD_CLS}>
                <div className="flex items-center justify-between border-b border-[#EBEBEF] pb-3 mb-4">
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-900">
                      Faculty Classification Breakdown
                    </h2>
                    <p className="text-xs text-zinc-500">
                      Professor, Associate Professor, Assistant Professor, Programmer & Lab Assistant
                    </p>
                  </div>
                  <span className="font-mono text-xs font-bold text-zinc-700 bg-[#F4F4F6] px-2.5 py-1 rounded-lg border border-[#EBEBEF]">
                    {totalClassifiedFaculty.toLocaleString()} Faculty
                  </span>
                </div>

                {facultyByClassification.length > 0 ? (
                  <div className="space-y-3">
                    {facultyByClassification.map((fc) => (
                      <DistributionBarRow
                        key={fc.classification}
                        label={fc.classification}
                        count={fc.count}
                        total={totalClassifiedFaculty}
                        barColor="bg-[#15803D]"
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500">No faculty classification rows found.</p>
                )}

                {facultyByDepartment.length > 0 && (
                  <div className="mt-5 pt-4 border-t border-[#EBEBEF]">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-2.5">
                      Faculty Distribution by Department
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {facultyByDepartment.map((fd) => (
                        <span
                          key={fd.department}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#FBFBFC] border border-[#EBEBEF] text-xs"
                        >
                          <span className="font-semibold text-zinc-700">{fd.department}</span>
                          <span className="font-mono font-bold text-[#1E293B]">{fd.count}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              {/* Finance Ledger Collection Progress */}
              <section className={CARD_CLS}>
                <div className="flex items-center justify-between border-b border-[#EBEBEF] pb-3 mb-4">
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-900">
                      Finance Collection vs Outstanding
                    </h2>
                    <p className="text-xs text-zinc-500">
                      Total Billed: {formatInr(finance.total_billed)} (Fines:{' '}
                      {formatInr(finance.total_fines)})
                    </p>
                  </div>
                  <span className="font-mono text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                    {financeCollectedPct}% Collected
                  </span>
                </div>

                <div className="h-3 w-full rounded-full bg-amber-100 overflow-hidden border border-[#EBEBEF]">
                  <div
                    className="h-full bg-[#15803D] transition-all duration-300"
                    style={{ width: `${financeCollectedPct}%` }}
                  />
                </div>

                <div className="grid grid-cols-3 gap-3 mt-4 text-xs">
                  <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
                    <span className="text-[10px] font-semibold uppercase text-emerald-700 block">
                      Paid Invoices
                    </span>
                    <span className="font-mono font-bold text-emerald-900 text-sm">
                      {finance.paid_count || 0}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200">
                    <span className="text-[10px] font-semibold uppercase text-amber-700 block">
                      Partial
                    </span>
                    <span className="font-mono font-bold text-amber-900 text-sm">
                      {finance.partial_count || 0}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-rose-50/70 border border-rose-200">
                    <span className="text-[10px] font-semibold uppercase text-rose-700 block">
                      Pending
                    </span>
                    <span className="font-mono font-bold text-rose-900 text-sm">
                      {finance.pending_count || 0}
                    </span>
                  </div>
                </div>
              </section>
            </div>
          </div>

          {/* Academic Years & Venue Booking Pipeline */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className={CARD_CLS}>
              <h2 className="text-sm font-semibold text-zinc-900 mb-1">
                Student Cohort by Academic Year
              </h2>
              <p className="text-xs text-zinc-500 mb-4">Year 1 through Year 4 enrollment distribution</p>
              {studentsByYear.length > 0 ? (
                <div className="space-y-3">
                  {studentsByYear.map((yr) => (
                    <DistributionBarRow
                      key={yr.academic_year ?? 'unknown'}
                      label={yr.academic_year ? `Academic Year ${yr.academic_year}` : 'Unspecified Year'}
                      count={yr.count}
                      total={totalYearStudents}
                      barColor="bg-[#1E293B]"
                    />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-500">No academic year breakdown returned.</p>
              )}
            </section>

            <section className={CARD_CLS}>
              <h2 className="text-sm font-semibold text-zinc-900 mb-1">
                Venue Booking Approval Pipeline
              </h2>
              <p className="text-xs text-zinc-500 mb-4">
                Live booking status counts across {totals.venues || 0} institutional venues
              </p>
              {Object.keys(venueStats.bookings_by_status || {}).length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                  {Object.entries(venueStats.bookings_by_status).map(([statusKey, count]) => (
                    <div
                      key={statusKey}
                      className="p-3 rounded-xl bg-[#FBFBFC] border border-[#EBEBEF]"
                    >
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 block truncate">
                        {statusKey.replace(/_/g, ' ')}
                      </span>
                      <span className="font-mono font-bold text-base text-zinc-900 mt-0.5 block">
                        {count}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-500">
                  No venue booking status counts recorded yet.
                </p>
              )}
            </section>
          </div>

          {/* Super Admin Live DB Storage Snapshot */}
          {isSuperAdmin && liveCounts && (
            <section className={CARD_CLS}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EBEBEF] pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <Database size={16} className="text-[#15803D]" />
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-900">
                      PostgreSQL Storage Verification Snapshot
                    </h2>
                    <p className="text-xs text-zinc-500">
                      Live tuple counts from `/api/v1/db/verify-storage` ({storage.database})
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => navigateTo('admin-db-ledger')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#EBEBEF] bg-[#FBFBFC] hover:bg-zinc-100 text-xs font-semibold text-zinc-700"
                >
                  <span>Open DB Ledger</span>
                  <ArrowRight size={13} />
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5 text-xs">
                {Object.entries(liveCounts).map(([tableName, rowCount]) => (
                  <div
                    key={tableName}
                    className="p-2.5 rounded-xl bg-[#FBFBFC] border border-[#EBEBEF]"
                  >
                    <span className="text-[10px] font-mono text-zinc-500 block truncate">
                      {tableName}
                    </span>
                    <span className="font-mono font-bold text-sm text-zinc-900">
                      {Number(rowCount || 0).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* 2. HOD ADMIN VIEW */}
      {analytics && isHod && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Department Students"
              value={Number(totals.students || 0).toLocaleString()}
              subtitle={scope.department || user?.department}
              icon={GraduationCap}
              tone="orange"
            />
            <KpiCard
              label="Department Faculty"
              value={Number(totals.faculty || 0).toLocaleString()}
              subtitle={`${facultyByClassification.length} designations`}
              icon={Users}
              tone="slate"
            />
            <KpiCard
              label="Department Attendance Avg"
              value={`${academic.attendance_present_pct ?? 0}%`}
              subtitle={`${academic.attendance_records_count || 0} recorded entries`}
              icon={ClipboardCheck}
              tone="emerald"
            />
            <KpiCard
              label="Pending Venue Approvals"
              value={venueStats.bookings_by_status?.PENDING_HOD ?? totals.pendingBookings ?? 0}
              subtitle={`${totals.pendingBookings || 0} total dept pending`}
              icon={Landmark}
              tone="amber"
            />
          </div>

          <div className={CARD_CLS}>
            <h2 className="text-sm font-semibold text-zinc-900 mb-3">
              Department Quick Actions
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2.5">
              <QuickActionButton
                label="Venue Approvals"
                icon={Landmark}
                onClick={() => navigateTo('venue-approvals')}
                primary
              />
              <QuickActionButton
                label="Timetable"
                icon={CalendarDays}
                onClick={() => navigateTo('timetable')}
              />
              <QuickActionButton
                label="Class Swaps"
                icon={Activity}
                onClick={() => navigateTo('class-swaps')}
              />
              <QuickActionButton
                label="Attendance"
                icon={ClipboardCheck}
                onClick={() => navigateTo('attendance')}
              />
              <QuickActionButton
                label="CIE Marks"
                icon={Award}
                onClick={() => navigateTo('cie-marks')}
              />
              <QuickActionButton
                label="Student Analyzer"
                icon={BarChart3}
                onClick={() => navigateTo('student-analyzer')}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className={CARD_CLS}>
              <h2 className="text-sm font-semibold text-zinc-900 mb-1">
                Academic Year Breakdown
              </h2>
              <p className="text-xs text-zinc-500 mb-4">
                Student distribution in {scope.department || user?.department}
              </p>
              {studentsByYear.length > 0 ? (
                <div className="space-y-3">
                  {studentsByYear.map((yr) => (
                    <DistributionBarRow
                      key={yr.academic_year ?? 'unknown'}
                      label={yr.academic_year ? `Year ${yr.academic_year}` : 'Unspecified'}
                      count={yr.count}
                      total={totalYearStudents}
                      barColor="bg-[#1E293B]"
                    />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-500">No students in this department yet.</p>
              )}

              {alliedScienceByBranch.length > 0 && (
                <div className="mt-5 pt-4 border-t border-[#EBEBEF] space-y-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    Allied Science Year-1 Branch Cohort
                  </p>
                  {alliedScienceByBranch.map((b) => (
                    <DistributionBarRow
                      key={b.core_branch}
                      label={b.core_branch}
                      count={b.count}
                      total={totalAlliedStudents}
                      barColor="bg-[#EA580C]"
                    />
                  ))}
                </div>
              )}
            </section>

            <section className={CARD_CLS}>
              <h2 className="text-sm font-semibold text-zinc-900 mb-1">
                Faculty Classification Breakdown
              </h2>
              <p className="text-xs text-zinc-500 mb-4">
                Teaching & lab staff in {scope.department || user?.department}
              </p>
              {facultyByClassification.length > 0 ? (
                <div className="space-y-3">
                  {facultyByClassification.map((fc) => (
                    <DistributionBarRow
                      key={fc.classification}
                      label={fc.classification}
                      count={fc.count}
                      total={totalClassifiedFaculty}
                      barColor="bg-[#15803D]"
                    />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-500">No faculty classifications recorded.</p>
              )}
            </section>
          </div>
        </div>
      )}

      {/* 3. FACULTY VIEW */}
      {analytics && isFaculty && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Department Students"
              value={Number(totals.students || 0).toLocaleString()}
              subtitle={profile?.department || user?.department}
              icon={GraduationCap}
              tone="slate"
            />
            <KpiCard
              label="Attendance Logged"
              value={`${academic.attendance_present_pct ?? 0}%`}
              subtitle={`${academic.attendance_records_count || 0} department records`}
              icon={ClipboardCheck}
              tone="emerald"
            />
            <KpiCard
              label="Department CIE Average"
              value={academic.avg_cie_marks ?? 0}
              subtitle={`${academic.cie_records_count || 0} CIE evaluations`}
              icon={Award}
              tone="orange"
            />
            <KpiCard
              label="Pending Venue Bookings"
              value={totals.pendingBookings ?? 0}
              subtitle={`${totals.venues || 0} campus venues available`}
              icon={Landmark}
              tone="amber"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <section className={CARD_CLS}>
              <h2 className="text-sm font-semibold text-zinc-900 mb-3">Faculty Profile</h2>
              <dl className="space-y-2.5 text-xs">
                <div className="flex justify-between gap-2 py-1.5 border-b border-[#EBEBEF]">
                  <dt className="text-zinc-500">Employee ID</dt>
                  <dd className="font-mono font-semibold text-zinc-900">
                    {formatVal(facultyDetails.emp_id || user?.username)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2 py-1.5 border-b border-[#EBEBEF]">
                  <dt className="text-zinc-500">Department</dt>
                  <dd className="font-semibold text-zinc-900">
                    {formatVal(facultyDetails.department || user?.department)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2 py-1.5 border-b border-[#EBEBEF]">
                  <dt className="text-zinc-500">Designation</dt>
                  <dd className="font-semibold text-zinc-900">
                    {formatVal(facultyDetails.designation)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2 py-1.5">
                  <dt className="text-zinc-500">Cabin Room</dt>
                  <dd className="font-mono font-semibold text-zinc-900">
                    {formatVal(facultyDetails.cabin_room)}
                  </dd>
                </div>
              </dl>
            </section>

            <section className={`${CARD_CLS} lg:col-span-2`}>
              <h2 className="text-sm font-semibold text-zinc-900 mb-1">Faculty Academic Tools</h2>
              <p className="text-xs text-zinc-500 mb-4">
                Manage timetable slots, class swaps, attendance, CIE marks, mentorship, and venue reservations
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                <QuickActionButton
                  label="Mark Attendance"
                  icon={ClipboardCheck}
                  onClick={() => navigateTo('attendance')}
                  primary
                />
                <QuickActionButton
                  label="CIE Marks Entry"
                  icon={Award}
                  onClick={() => navigateTo('cie-marks')}
                />
                <QuickActionButton
                  label="Timetable"
                  icon={CalendarDays}
                  onClick={() => navigateTo('timetable')}
                />
                <QuickActionButton
                  label="Class Swaps"
                  icon={Activity}
                  onClick={() => navigateTo('class-swaps')}
                />
                <QuickActionButton
                  label="Venue Bookings"
                  icon={Landmark}
                  onClick={() => navigateTo('venue-catalog')}
                />
                <QuickActionButton
                  label="Student Analyzer"
                  icon={BarChart3}
                  onClick={() => navigateTo('student-analyzer')}
                />
                <QuickActionButton
                  label="Docs & Notes"
                  icon={FolderOpen}
                  onClick={() => navigateTo('docs-vault')}
                />
                <QuickActionButton
                  label="Directory & Mentorship"
                  icon={Users}
                  onClick={() => navigateTo('admin-directory')}
                />
              </div>
            </section>
          </div>
        </div>
      )}

      {/* 4. STUDENT VIEW */}
      {analytics && isStudent && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Personal Attendance"
              value={`${studentAttendancePct}%`}
              subtitle={
                attSummary.total_classes > 0
                  ? `${attSummary.attended_count || 0} of ${attSummary.total_classes} classes`
                  : 'From live attendance ledger'
              }
              icon={ClipboardCheck}
              tone={
                Number(studentAttendancePct) >= 85
                  ? 'emerald'
                  : Number(studentAttendancePct) >= 75
                  ? 'amber'
                  : 'rose'
              }
            />
            <KpiCard
              label="CIE Average"
              value={academic.avg_cie_marks ?? 0}
              subtitle={`${academic.cie_records_count || 0} subjects evaluated`}
              icon={Award}
              tone="slate"
            />
            <KpiCard
              label="Pending Fee Balance"
              value={formatInr(finance.total_outstanding)}
              subtitle={`Paid: ${formatInr(finance.total_collected)}`}
              icon={CreditCard}
              tone={Number(finance.total_outstanding || 0) > 0 ? 'amber' : 'emerald'}
            />
            <KpiCard
              label="Open Placement Drives"
              value={Number(totals.openDrives ?? totals.open_drives ?? 0).toLocaleString()}
              subtitle="Active recruitment drives"
              icon={Briefcase}
              tone="orange"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Verified Student Academic Identity Card */}
            <section className={`${CARD_CLS} lg:col-span-2`}>
              <div className="flex items-center justify-between border-b border-[#EBEBEF] pb-3 mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-900">
                    Verified Academic Profile
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Live enrollment record from PostgreSQL student registry
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 size={12} />
                  <span>{studentDetails.status || 'ACTIVE'}</span>
                </span>
              </div>

              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-[#FBFBFC] border border-[#EBEBEF]">
                  <dt className="text-[10px] font-semibold uppercase text-zinc-400">VTU USN</dt>
                  <dd className="font-mono font-bold text-zinc-900 mt-1">
                    {formatVal(studentDetails.usn || attStudent.usn || user?.username)}
                  </dd>
                </div>
                <div className="p-3 rounded-xl bg-[#FBFBFC] border border-[#EBEBEF]">
                  <dt className="text-[10px] font-semibold uppercase text-zinc-400">
                    Assigned Department
                  </dt>
                  <dd className="font-bold text-zinc-900 mt-1">
                    {formatVal(studentDetails.department || attStudent.department || user?.department)}
                  </dd>
                </div>
                <div className="p-3 rounded-xl bg-orange-50/70 border border-orange-200">
                  <dt className="text-[10px] font-semibold uppercase text-[#EA580C]">
                    Verified Core Branch
                  </dt>
                  <dd className="font-bold text-zinc-900 mt-1">{formatVal(studentCoreBranch)}</dd>
                </div>
                <div className="p-3 rounded-xl bg-[#FBFBFC] border border-[#EBEBEF]">
                  <dt className="text-[10px] font-semibold uppercase text-zinc-400">
                    Academic Year & Sem
                  </dt>
                  <dd className="font-bold text-zinc-900 mt-1">
                    Year {formatVal(studentAcademicYear)} · Sem {formatVal(studentSemester)}
                  </dd>
                </div>
                <div className="p-3 rounded-xl bg-[#FBFBFC] border border-[#EBEBEF]">
                  <dt className="text-[10px] font-semibold uppercase text-zinc-400">
                    Section & Entry
                  </dt>
                  <dd className="font-bold text-zinc-900 mt-1">
                    Sec {formatVal(studentDetails.section || attStudent.section)} ·{' '}
                    {formatVal(studentDetails.entryType || profile?.entryType)}
                  </dd>
                </div>
                <div className="p-3 rounded-xl bg-[#FBFBFC] border border-[#EBEBEF]">
                  <dt className="text-[10px] font-semibold uppercase text-zinc-400">
                    CGPA / LG Mentor
                  </dt>
                  <dd className="font-bold text-zinc-900 mt-1">
                    {studentDetails.cgpa !== null &&
                    studentDetails.cgpa !== undefined &&
                    studentDetails.cgpa !== '' &&
                    Number.isFinite(Number(studentDetails.cgpa))
                      ? Number(studentDetails.cgpa).toFixed(2)
                      : '—'}
                    {studentDetails.lgFaculty?.fullName
                      ? ` · ${studentDetails.lgFaculty.fullName}`
                      : ''}
                  </dd>
                </div>
              </dl>
            </section>

            {/* Student Navigation */}
            <section className={CARD_CLS}>
              <h2 className="text-sm font-semibold text-zinc-900 mb-1">Student Portals</h2>
              <p className="text-xs text-zinc-500 mb-4">
                Access your attendance, marks, placements, and fees
              </p>
              <div className="grid grid-cols-1 gap-2.5">
                <QuickActionButton
                  label="My Attendance"
                  icon={ClipboardCheck}
                  onClick={() => navigateTo('attendance')}
                  primary
                />
                <QuickActionButton
                  label="CIE Scorecard"
                  icon={Award}
                  onClick={() => navigateTo('cie-marks')}
                />
                <QuickActionButton
                  label="Weekly Timetable"
                  icon={CalendarDays}
                  onClick={() => navigateTo('timetable')}
                />
                <QuickActionButton
                  label="Placement Drives"
                  icon={Briefcase}
                  onClick={() => navigateTo('placements')}
                />
                <QuickActionButton
                  label="Fee Ledger"
                  icon={CreditCard}
                  onClick={() => navigateTo('finance')}
                />
                <QuickActionButton
                  label="Venue Bookings"
                  icon={Landmark}
                  onClick={() => navigateTo('venue-catalog')}
                />
                <QuickActionButton
                  label="Docs & Notes"
                  icon={FolderOpen}
                  onClick={() => navigateTo('docs-vault')}
                />
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
