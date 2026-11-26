import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import {
  AlertTriangle,
  Award,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  GraduationCap,
  RefreshCw,
  Search,
  ShieldAlert,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';

const RISK_TIERS = ['ALL', 'EXCELLENT', 'ON_TRACK', 'WATCH', 'AT_RISK'];

const DEPARTMENTS = [
  'CSE',
  'AIML',
  'DS',
  'CYBER',
  'ECE',
  'ME',
  'ALLIED_SCIENCE',
  'MATH_SCI',
  'PHY_CHEM',
  'HUMANITIES',
  'RND_ACADEMICS',
];

function getRiskStyle(tier) {
  const norm = String(tier || '').trim().toUpperCase();
  switch (norm) {
    case 'EXCELLENT':
      return {
        label: 'EXCELLENT',
        badge: 'bg-emerald-50 text-[#15803D] border-emerald-200',
        pillActive: 'bg-[#15803D] text-white border-[#15803D]',
        bar: 'bg-[#10B981]',
        stroke: '#10B981',
        text: 'text-[#15803D]',
      };
    case 'ON_TRACK':
      return {
        label: 'ON_TRACK',
        badge: 'bg-slate-100 text-[#1E293B] border-slate-300',
        pillActive: 'bg-[#1E293B] text-white border-[#1E293B]',
        bar: 'bg-[#1E293B]',
        stroke: '#1E293B',
        text: 'text-[#1E293B]',
      };
    case 'WATCH':
      return {
        label: 'WATCH',
        badge: 'bg-amber-50 text-[#B45309] border-amber-200',
        pillActive: 'bg-[#B45309] text-white border-[#B45309]',
        bar: 'bg-[#F59E0B]',
        stroke: '#F59E0B',
        text: 'text-[#B45309]',
      };
    case 'AT_RISK':
      return {
        label: 'AT_RISK',
        badge: 'bg-rose-50 text-rose-700 border-rose-200',
        pillActive: 'bg-rose-700 text-white border-rose-700',
        bar: 'bg-[#EF4444]',
        stroke: '#EF4444',
        text: 'text-rose-700',
      };
    default:
      return {
        label: norm || 'UNCLASSIFIED',
        badge: 'bg-zinc-100 text-zinc-700 border-zinc-200',
        pillActive: 'bg-[#121214] text-white border-[#121214]',
        bar: 'bg-zinc-500',
        stroke: '#52525B',
        text: 'text-zinc-700',
      };
  }
}

function clampScore(val) {
  const num = Number(val);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, num));
}

function ScoreGauge({ score, riskTier }) {
  const safeScore = clampScore(score);
  const style = getRiskStyle(riskTier);
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - safeScore / 100);

  return (
    <div className="flex flex-col items-center justify-center p-4 bg-[#FBFBFC] border border-[#EBEBEF] rounded-2xl">
      <div className="relative w-32 h-32 flex items-center justify-center">
        <svg className="w-32 h-32 -rotate-90" viewBox="0 0 128 128" aria-label={`Composite score ${safeScore} out of 100`}>
          <circle
            cx="64"
            cy="64"
            r={radius}
            fill="none"
            stroke="#EBEBEF"
            strokeWidth="10"
          />
          <circle
            cx="64"
            cy="64"
            r={radius}
            fill="none"
            stroke={style.stroke}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold font-mono text-zinc-900">
            {Number.isFinite(Number(score)) ? Number(score).toFixed(1) : '0.0'}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            / 100 Score
          </span>
        </div>
      </div>
      <span
        className={`mt-2 px-3 py-0.5 rounded-full text-[11px] font-bold border ${style.badge}`}
      >
        {style.label.replace(/_/g, ' ')}
      </span>
    </div>
  );
}

function normalizeStudentRow(raw = {}) {
  const id = raw.student_id || raw.studentId || raw.id || raw.user_id || raw.userId;
  const metrics = raw.metrics || {};
  return {
    id,
    usn: raw.usn || raw.username || '—',
    fullName: raw.fullName || raw.full_name || raw.name || 'Unnamed Student',
    department: raw.department || '—',
    coreBranch: raw.coreBranch || raw.core_branch || null,
    semester: raw.semester ?? null,
    section: raw.section || null,
    dataCoverage: raw.dataCoverage || raw.data_coverage || null,
    compositeScore:
      raw.compositeScore ?? raw.composite_score ?? raw.overallScore ?? raw.overall_score ?? raw.score ?? null,
    riskTier:
      raw.riskTier || raw.risk_tier || raw.riskBand || raw.risk_band || raw.riskLevel || raw.risk_level || raw.status || '',
    attendancePct:
      raw.attendancePct ??
      raw.attendance_pct ??
      raw.attendancePercentage ??
      metrics.attendancePercentage ??
      metrics.attendancePct ??
      null,
    ciePct:
      raw.ciePct ??
      raw.cie_pct ??
      raw.avgCiePct ??
      raw.avg_cie_pct ??
      metrics.ciePercentage ??
      metrics.avgTotalCie ??
      raw.avgCie ??
      raw.avg_cie ??
      null,
    cgpa: raw.cgpa ?? null,
    pendingDues:
      raw.pendingDues ??
      raw.pending_dues ??
      raw.outstandingDues ??
      raw.outstanding_dues ??
      metrics.outstandingDues ??
      null,
    weakSubjectsCount:
      raw.weakSubjectsCount ??
      raw.weak_subjects_count ??
      (Array.isArray(raw.weakSubjects || raw.weak_subjects)
        ? (raw.weakSubjects || raw.weak_subjects).length
        : 0),
  };
}

function extractFactorBreakdown(detail = {}) {
  const breakdown = detail.breakdown || detail.factors || detail.factorScores || detail.factor_scores || {};
  const metrics = detail.metrics || {};

  const attObj = breakdown.attendance || {};
  const cieObj = breakdown.cie || breakdown.academics || {};
  const cgpaObj = breakdown.cgpaPlacement || breakdown.cgpa_placement || breakdown.placement || breakdown.cgpa || {};
  const finObj = breakdown.finance || breakdown.fees || {};

  const attHasData = attObj.hasData ?? metrics.hasAttendanceData ?? (attObj.percentage !== null && attObj.percentage !== undefined);
  const attScore = clampScore(
    attObj.percentage ?? attObj.score ?? metrics.attendancePercentage ?? detail.attendancePct ?? 0
  );
  const attMeta = attHasData
    ? attObj.totalClasses !== undefined
      ? `${attObj.attendedClasses ?? 0}/${attObj.totalClasses} classes (${attScore.toFixed(1)}%)`
      : `${attScore.toFixed(1)}%`
    : 'No records';

  const cieHasData = cieObj.hasData ?? metrics.hasCieData ?? (cieObj.percentage !== null && cieObj.percentage !== undefined);
  const cieScore = clampScore(
    cieObj.percentage ?? cieObj.score ?? metrics.ciePercentage ?? detail.ciePct ?? 0
  );
  const cieMeta = cieHasData
    ? cieObj.averageTotalCie !== undefined && cieObj.averageTotalCie !== null
      ? `Avg CIE ${cieObj.averageTotalCie} (${cieScore.toFixed(1)}%)`
      : `${cieScore.toFixed(1)}%`
    : 'No records';

  const cgpaHasData = cgpaObj.hasData ?? metrics.hasCgpaPlacementData ?? (cgpaObj.percentage !== null && cgpaObj.percentage !== undefined);
  const cgpaScore = clampScore(
    cgpaObj.percentage ?? cgpaObj.score ?? metrics.cgpaPlacementPercentage ?? 0
  );
  const cgpaVal = cgpaObj.cgpa ?? detail.cgpa ?? 0;
  const appsCount = cgpaObj.applicationsCount ?? metrics.placementApplications ?? 0;
  const cgpaMeta = cgpaHasData
    ? `CGPA ${Number(cgpaVal).toFixed(2)}${appsCount > 0 ? ` · ${appsCount} app(s)` : ''}`
    : 'No records';

  const finHasData = finObj.hasData ?? metrics.hasFinanceData ?? (finObj.percentage !== null && finObj.percentage !== undefined);
  const finScore = clampScore(
    finObj.percentage ?? finObj.score ?? metrics.financeCompletionPercentage ?? 0
  );
  const duesVal = finObj.outstandingDues ?? metrics.outstandingDues ?? 0;
  const finMeta = finHasData
    ? `Dues: ₹${Number(duesVal).toLocaleString('en-IN')}`
    : 'No records';

  return [
    {
      key: 'attendance',
      label: 'Attendance Consistency',
      weight: '35%',
      score: attScore,
      hasData: Boolean(attHasData),
      meta: attMeta,
      icon: ClipboardCheck,
      barColor: !attHasData ? 'bg-zinc-300' : attScore >= 75 ? 'bg-[#10B981]' : attScore >= 50 ? 'bg-[#F59E0B]' : 'bg-[#EF4444]',
    },
    {
      key: 'cie',
      label: 'CIE Academic Mastery',
      weight: '40%',
      score: cieScore,
      hasData: Boolean(cieHasData),
      meta: cieMeta,
      icon: Award,
      barColor: !cieHasData ? 'bg-zinc-300' : cieScore >= 70 ? 'bg-[#10B981]' : cieScore >= 45 ? 'bg-[#F59E0B]' : 'bg-[#EF4444]',
    },
    {
      key: 'cgpa',
      label: 'CGPA & Placement Readiness',
      weight: '15%',
      score: cgpaScore,
      hasData: Boolean(cgpaHasData),
      meta: cgpaMeta,
      icon: TrendingUp,
      barColor: !cgpaHasData ? 'bg-zinc-300' : cgpaScore >= 70 ? 'bg-[#1E293B]' : cgpaScore >= 45 ? 'bg-[#F59E0B]' : 'bg-[#EF4444]',
    },
    {
      key: 'finance',
      label: 'Finance & Clearance Standing',
      weight: '10%',
      score: finScore,
      hasData: Boolean(finHasData),
      meta: finMeta,
      icon: CreditCard,
      barColor: !finHasData ? 'bg-zinc-300' : finScore >= 80 ? 'bg-[#10B981]' : finScore >= 50 ? 'bg-[#F59E0B]' : 'bg-[#EF4444]',
    },
  ];
}

function deriveWeakSubjects(detail = {}) {
  const explicit = detail.weakSubjects || detail.weak_subjects;
  if (Array.isArray(explicit) && explicit.length > 0) return explicit;

  const list = [];
  const attSubs = detail.breakdown?.attendance?.subjectBreakdown;
  if (Array.isArray(attSubs)) {
    attSubs.forEach((s) => {
      if (Number(s.percentage) < 75) {
        list.push({
          subject_code: s.subject_code,
          attendance_pct: s.percentage,
          reason: `Attendance ${s.percentage}% (< 75% threshold)`,
        });
      }
    });
  }

  const cieSubs = detail.breakdown?.cie?.subjects;
  if (Array.isArray(cieSubs)) {
    cieSubs.forEach((s) => {
      const maxM = Number(s.max_marks || 50);
      const pct = maxM > 0 ? (Number(s.total_cie || 0) / maxM) * 100 : 0;
      if (pct < 50) {
        list.push({
          subject_code: s.subject_code,
          subject_name: s.subject_name,
          total_cie: s.total_cie,
          max_marks: maxM,
          reason: `CIE ${s.total_cie}/${maxM} (${pct.toFixed(0)}%)`,
        });
      }
    });
  }

  return list;
}

export default function StudentAnalyzerPage() {
  const { user } = useAuth();

  const isSuperAdmin = user?.adminTier === 'SUPER_ADMIN';
  const subRoles = Array.isArray(user?.subRoles) ? user.subRoles : [];
  const isHod = user?.adminTier === 'HOD_ADMIN' || subRoles.includes('HOD');
  const isFaculty = user?.baseRole === 'FACULTY';
  const isAllowed = isSuperAdmin || isHod || isFaculty;

  const [summary, setSummary] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [semester, setSemester] = useState('');
  const [riskFilter, setRiskFilter] = useState('ALL');
  const [departmentFilter, setDepartmentFilter] = useState(
    isSuperAdmin ? '' : user?.department || ''
  );

  // Student Diagnostic Modal State
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [diagnostic, setDiagnostic] = useState(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagError, setDiagError] = useState('');

  const loadAnalyzerData = useCallback(async () => {
    if (!isAllowed) return;
    setLoading(true);
    setError('');
    try {
      const summaryParams = new URLSearchParams();
      if (isSuperAdmin && departmentFilter) summaryParams.set('department', departmentFilter);
      if (semester) summaryParams.set('semester', semester);

      const listParams = new URLSearchParams();
      if (isSuperAdmin && departmentFilter) listParams.set('department', departmentFilter);
      if (semester) listParams.set('semester', semester);
      if (riskFilter !== 'ALL') listParams.set('riskTier', riskFilter);
      if (search.trim()) listParams.set('q', search.trim());
      listParams.set('limit', '200');

      const sumQs = summaryParams.toString();
      const listQs = listParams.toString();

      const [sumRes, listRes] = await Promise.all([
        api.get(`/api/v1/analyzer/summary${sumQs ? `?${sumQs}` : ''}`),
        api.get(`/api/v1/analyzer/students${listQs ? `?${listQs}` : ''}`),
      ]);

      const rawSummary = sumRes.data?.summary || sumRes.data || {};
      setSummary(rawSummary);

      const rawList = Array.isArray(listRes.data?.students)
        ? listRes.data.students
        : Array.isArray(listRes.data?.results)
        ? listRes.data.results
        : Array.isArray(listRes.data?.data)
        ? listRes.data.data
        : [];
      setStudents(rawList.map(normalizeStudentRow));
    } catch (err) {
      setError(
        err.response?.data?.error ||
          err.response?.data?.message ||
          err.message ||
          'Failed to load student performance analyzer telemetry.'
      );
    } finally {
      setLoading(false);
    }
  }, [isAllowed, isSuperAdmin, departmentFilter, semester, riskFilter, search]);

  useEffect(() => {
    loadAnalyzerData();
  }, [loadAnalyzerData]);

  const openDiagnostic = async (stu) => {
    if (!stu?.id) return;
    setSelectedStudentId(stu.id);
    setDiagnostic(null);
    setDiagError('');
    setDiagLoading(true);
    try {
      const res = await api.get(`/api/v1/analyzer/students/${encodeURIComponent(stu.id)}`);
      const payload = res.data?.diagnostic || res.data?.student || res.data || {};
      setDiagnostic({
        ...stu,
        ...payload,
        breakdown: res.data?.breakdown || payload.breakdown || null,
        weights: res.data?.weights || payload.weights || null,
        usn: payload.usn || stu.usn,
        fullName: payload.fullName || payload.full_name || stu.fullName,
        department: payload.department || stu.department,
        coreBranch: payload.coreBranch || payload.core_branch || stu.coreBranch,
        semester: payload.semester ?? stu.semester,
        section: payload.section || stu.section,
        compositeScore:
          payload.compositeScore ?? payload.composite_score ?? payload.score ?? stu.compositeScore,
        riskTier:
          payload.riskTier || payload.risk_tier || payload.riskBand || payload.risk_band || stu.riskTier,
      });
    } catch (err) {
      setDiagError(
        err.response?.data?.error ||
          err.response?.data?.message ||
          err.message ||
          'Unable to load student diagnostic breakdown.'
      );
    } finally {
      setDiagLoading(false);
    }
  };

  const riskCounts = useMemo(() => {
    const dist =
      summary?.riskDistribution ||
      summary?.risk_distribution ||
      summary?.riskCounts ||
      summary?.risk_counts ||
      summary?.counts ||
      {};
    return {
      EXCELLENT: Number(dist.EXCELLENT ?? summary?.excellentCount ?? summary?.excellent_count ?? 0),
      ON_TRACK: Number(dist.ON_TRACK ?? summary?.onTrackCount ?? summary?.on_track_count ?? 0),
      WATCH: Number(dist.WATCH ?? summary?.watchCount ?? summary?.watch_count ?? 0),
      AT_RISK: Number(dist.AT_RISK ?? summary?.atRiskCount ?? summary?.at_risk_count ?? 0),
    };
  }, [summary]);

  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      if (riskFilter !== 'ALL' && String(s.riskTier || '').toUpperCase() !== riskFilter) {
        return false;
      }
      if (semester && String(s.semester || '') !== String(semester)) {
        return false;
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matches =
          String(s.usn || '').toLowerCase().includes(q) ||
          String(s.fullName || '').toLowerCase().includes(q) ||
          String(s.department || '').toLowerCase().includes(q) ||
          String(s.coreBranch || '').toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [students, riskFilter, semester, search]);

  // Explicit 403 Restricted view for STUDENT or REGULAR_ADMIN
  if (!isAllowed) {
    return (
      <div className="max-w-xl mx-auto py-8">
        <div className="bg-white border border-[#EBEBEF] rounded-2xl p-8 text-center shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] space-y-4">
          <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto border border-rose-200">
            <ShieldAlert size={24} />
          </div>
          <div>
            <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-rose-50 text-rose-700 border border-rose-200 mb-2">
              403 Restricted
            </span>
            <h1 className="text-lg font-bold text-zinc-900">
              Student Performance Analyzer Access Denied
            </h1>
            <p className="text-xs text-zinc-500 mt-2 leading-relaxed">
              This diagnostic module is strictly restricted to Faculty, Department HODs, and Super Admin.
              Students and Regular Section Admins are not authorized to inspect cohort risk analytics.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const totalStudents = Number(summary?.totalStudents ?? summary?.total_students ?? students.length ?? 0);
  const rawAvg =
    summary?.averageCompositeScore ?? summary?.avgCompositeScore ?? summary?.avg_composite_score;
  const avgCompositeScore =
    rawAvg !== null && rawAvg !== undefined && Number.isFinite(Number(rawAvg))
      ? Number(rawAvg).toFixed(1)
      : '—';

  const factorBars = diagnostic ? extractFactorBreakdown(diagnostic) : [];
  const weakSubjects = diagnostic ? deriveWeakSubjects(diagnostic) : [];
  const lackingAreas = Array.isArray(diagnostic?.lackingAreas || diagnostic?.lacking_areas)
    ? diagnostic.lackingAreas || diagnostic.lacking_areas
    : [];
  const improvementSteps = Array.isArray(
    diagnostic?.improvementSteps || diagnostic?.improvement_steps
  )
    ? diagnostic.improvementSteps || diagnostic.improvement_steps
    : [];

  return (
    <div className="space-y-6">
      {/* Page Header & Filter Controls */}
      <div className="bg-white border border-[#EBEBEF] rounded-2xl p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#EBEBEF] pb-4">
          <div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-orange-50 text-[#EA580C] border border-orange-200">
              <BarChart3 size={12} /> Academic Early-Warning Telemetry
            </span>
            <h1 className="mt-2 text-lg font-bold text-zinc-900 tracking-tight">
              Student Performance &amp; Risk Analyzer
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Composite PostgreSQL scoring across Attendance (35%), CIE (40%), CGPA &amp; Placement (15%), and Finance Standing (10%).
            </p>
          </div>

          <button
            type="button"
            onClick={loadAnalyzerData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#121214] hover:bg-black text-white text-xs font-semibold transition disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>{loading ? 'Analyzing...' : 'Refresh Telemetry'}</span>
          </button>
        </div>

        {/* Search & Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search USN or Student Name..."
              className="w-full pl-9 pr-3 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 placeholder:text-zinc-400 outline-none focus:bg-white focus:border-[#EA580C]"
            />
          </div>

          {isSuperAdmin ? (
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="px-3 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 outline-none focus:border-[#EA580C]"
            >
              <option value="">All Departments</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          ) : (
            <div className="px-3 py-2.5 bg-zinc-100 border border-[#EBEBEF] rounded-xl text-xs font-semibold text-zinc-700 flex items-center justify-between">
              <span>Scope Department</span>
              <span className="font-mono text-[#1E293B]">{user?.department || 'ASSIGNED'}</span>
            </div>
          )}

          <select
            value={semester}
            onChange={(e) => setSemester(e.target.value)}
            className="px-3 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 outline-none focus:border-[#EA580C]"
          >
            <option value="">All Semesters</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
              <option key={s} value={s}>
                Semester {s}
              </option>
            ))}
          </select>

          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="px-3 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 outline-none focus:border-[#EA580C]"
          >
            {RISK_TIERS.map((tier) => (
              <option key={tier} value={tier}>
                {tier === 'ALL' ? 'All Risk Tiers' : tier.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>

        {/* Risk Tier Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pt-1">
          {RISK_TIERS.map((tier) => {
            const active = riskFilter === tier;
            const style = getRiskStyle(tier);
            const count = tier === 'ALL' ? totalStudents : riskCounts[tier] ?? 0;
            return (
              <button
                key={tier}
                type="button"
                onClick={() => setRiskFilter(tier)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap border transition ${
                  active
                    ? style.pillActive
                    : 'bg-[#FBFBFC] text-zinc-600 border-[#EBEBEF] hover:bg-zinc-100'
                }`}
              >
                {tier === 'ALL' ? 'ALL COHORT' : tier.replace(/_/g, ' ')} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-800 text-xs">
          <ShieldAlert size={16} className="text-rose-600 shrink-0 mt-0.5" />
          <span className="font-medium">{error}</span>
        </div>
      )}

      {/* Cohort KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="bg-white border border-[#EBEBEF] rounded-2xl p-4 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 flex items-center gap-1">
            <Users size={12} className="text-[#EA580C]" /> Total Students
          </span>
          <p className="mt-2 text-2xl font-bold text-zinc-900 font-mono">
            {totalStudents.toLocaleString()}
          </p>
        </div>

        <div className="bg-white border border-[#EBEBEF] rounded-2xl p-4 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 flex items-center gap-1">
            <BarChart3 size={12} className="text-[#1E293B]" /> Avg Score
          </span>
          <p className="mt-2 text-2xl font-bold text-zinc-900 font-mono">
            {avgCompositeScore}
            {avgCompositeScore !== '—' && (
              <span className="text-xs font-normal text-zinc-400"> /100</span>
            )}
          </p>
        </div>

        <div className="bg-white border border-emerald-200/80 rounded-2xl p-4 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#15803D]">
            EXCELLENT
          </span>
          <p className="mt-2 text-2xl font-bold text-[#15803D] font-mono">
            {riskCounts.EXCELLENT}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#1E293B]">
            ON TRACK
          </span>
          <p className="mt-2 text-2xl font-bold text-[#1E293B] font-mono">
            {riskCounts.ON_TRACK}
          </p>
        </div>

        <div className="bg-white border border-amber-200 rounded-2xl p-4 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#B45309]">
            WATCH
          </span>
          <p className="mt-2 text-2xl font-bold text-[#B45309] font-mono">
            {riskCounts.WATCH}
          </p>
        </div>

        <div className="bg-white border border-rose-200 rounded-2xl p-4 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-rose-700">
            AT RISK
          </span>
          <p className="mt-2 text-2xl font-bold text-rose-700 font-mono">
            {riskCounts.AT_RISK}
          </p>
        </div>
      </div>

      {/* Student Roster Table */}
      <section className="bg-white border border-[#EBEBEF] rounded-2xl p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] space-y-4">
        <div className="flex items-center justify-between border-b border-[#EBEBEF] pb-3">
          <div>
            <h2 className="text-sm font-bold text-zinc-900">
              Student Cohort Diagnostics ({filteredStudents.length})
            </h2>
            <p className="text-xs text-zinc-500">
              Click any student row to open full 4-factor diagnostic breakdown and improvement plan
            </p>
          </div>
        </div>

        {loading && students.length === 0 ? (
          <div className="py-10 text-center text-xs text-zinc-500">
            Computing live student composite scores from PostgreSQL...
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <GraduationCap size={28} className="mx-auto text-zinc-400" />
            <p className="text-sm font-semibold text-zinc-900">
              No Student Performance Records Found
            </p>
            <p className="text-xs text-zinc-500 max-w-md mx-auto">
              {students.length === 0
                ? 'No student academic, attendance, or finance telemetry records currently exist in your scope.'
                : 'No students matched the active search, semester, or risk tier filters.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-[#EBEBEF] rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAFAFA] border-b border-[#EBEBEF] text-zinc-500 font-semibold text-[11px]">
                <tr>
                  <th className="p-3">USN</th>
                  <th className="p-3">Student</th>
                  <th className="p-3">Dept / Sem</th>
                  <th className="p-3">Attendance</th>
                  <th className="p-3">CIE</th>
                  <th className="p-3">CGPA</th>
                  <th className="p-3">Composite Score</th>
                  <th className="p-3">Risk Tier</th>
                  <th className="p-3 text-right">Diagnostic</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EBEBEF]">
                {filteredStudents.map((stu) => {
                  const style = getRiskStyle(stu.riskTier);
                  const scoreVal =
                    stu.compositeScore !== null &&
                    stu.compositeScore !== undefined &&
                    Number.isFinite(Number(stu.compositeScore))
                      ? Number(stu.compositeScore).toFixed(1)
                      : '—';
                  return (
                    <tr
                      key={stu.id || stu.usn}
                      onClick={() => openDiagnostic(stu)}
                      className="hover:bg-[#FBFBFC] cursor-pointer transition"
                    >
                      <td className="p-3 font-mono font-bold text-zinc-900 whitespace-nowrap">
                        {stu.usn}
                      </td>
                      <td className="p-3 font-medium text-zinc-800 whitespace-nowrap">
                        {stu.fullName}
                      </td>
                      <td className="p-3 text-zinc-600 whitespace-nowrap">
                        {stu.department}
                        {stu.coreBranch ? ` (${stu.coreBranch})` : ''}
                        {stu.semester ? ` · S${stu.semester}` : ''}
                        {stu.section ? `-${stu.section}` : ''}
                      </td>
                      <td className="p-3 font-mono text-zinc-700 whitespace-nowrap">
                        {stu.attendancePct !== null && stu.attendancePct !== undefined
                          ? `${Number(stu.attendancePct).toFixed(1)}%`
                          : '—'}
                      </td>
                      <td className="p-3 font-mono text-zinc-700 whitespace-nowrap">
                        {stu.ciePct !== null && stu.ciePct !== undefined
                          ? `${Number(stu.ciePct).toFixed(1)}`
                          : '—'}
                      </td>
                      <td className="p-3 font-mono text-zinc-700 whitespace-nowrap">
                        {stu.cgpa !== null &&
                        stu.cgpa !== undefined &&
                        Number.isFinite(Number(stu.cgpa))
                          ? Number(stu.cgpa).toFixed(2)
                          : '—'}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 rounded-full bg-[#F4F4F6] border border-[#EBEBEF] overflow-hidden">
                            <div
                              className={`h-full rounded-full ${style.bar}`}
                              style={{ width: `${clampScore(stu.compositeScore)}%` }}
                            />
                          </div>
                          <span className="font-mono font-bold text-zinc-900">{scoreVal}</span>
                        </div>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${style.badge}`}
                        >
                          {style.label.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="p-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDiagnostic(stu);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-[#121214] hover:bg-black text-white text-[11px] font-semibold transition"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ─── STUDENT DIAGNOSTIC MODAL / DRAWER ─── */}
      {selectedStudentId && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] flex items-center justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label="Student Diagnostic Report"
        >
          <div className="bg-white border border-[#EBEBEF] rounded-2xl w-full max-w-3xl shadow-xl overflow-hidden my-auto">
            {/* Modal Header */}
            <div className="bg-[#141E2B] text-white px-6 py-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-orange-300 font-semibold">
                  PostgreSQL Student Performance Diagnostic
                </p>
                <h2 className="text-base font-bold mt-0.5">
                  {diagnostic?.fullName || 'Loading Student Diagnostic...'}{' '}
                  {diagnostic?.usn ? (
                    <span className="font-mono text-xs text-slate-300 font-normal">
                      ({diagnostic.usn})
                    </span>
                  ) : null}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedStudentId(null);
                  setDiagnostic(null);
                }}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition"
                aria-label="Close diagnostic"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
              {diagError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2">
                  <ShieldAlert size={15} className="text-rose-600 shrink-0 mt-0.5" />
                  <span>{diagError}</span>
                </div>
              )}

              {diagLoading ? (
                <div className="py-12 text-center text-xs text-zinc-500">
                  Loading live student factor scores, weak subjects, and improvement recommendations...
                </div>
              ) : (
                diagnostic && (
                  <>
                    {/* Top Row: Score Gauge + 4 Weighted Factor Bars */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
                      <ScoreGauge
                        score={diagnostic.compositeScore}
                        riskTier={diagnostic.riskTier}
                      />

                      <div className="md:col-span-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-2xl p-4 space-y-3.5">
                        <div className="flex items-center justify-between border-b border-[#EBEBEF] pb-2">
                          <h3 className="text-xs font-bold text-zinc-900">
                            Weighted Factor Breakdown
                          </h3>
                          <span className="text-[10px] font-mono text-zinc-500">
                            {diagnostic.department}
                            {diagnostic.coreBranch ? ` (${diagnostic.coreBranch})` : ''}
                            {diagnostic.semester ? ` · Sem ${diagnostic.semester}` : ''}
                            {diagnostic.section ? ` · Sec ${diagnostic.section}` : ''}
                          </span>
                        </div>

                        {factorBars.map((f) => {
                          const FIcon = f.icon;
                          return (
                            <div key={f.key} className="space-y-1">
                              <div className="flex items-center justify-between gap-2 text-xs">
                                <span className="inline-flex items-center gap-1.5 font-semibold text-zinc-800">
                                  <FIcon size={13} className="text-[#EA580C]" />
                                  <span>{f.label}</span>
                                  <span className="text-[10px] font-mono text-zinc-400">
                                    ({f.weight})
                                  </span>
                                </span>
                                <span className="font-mono font-bold text-zinc-900">
                                  {f.score.toFixed(1)}
                                  <span className="text-[10px] font-normal text-zinc-400">
                                    /100
                                  </span>
                                  {f.meta ? (
                                    <span className="ml-2 text-[10px] text-zinc-500 font-normal">
                                      [{f.meta}]
                                    </span>
                                  ) : null}
                                </span>
                              </div>
                              <div className="h-2 w-full rounded-full bg-white border border-[#EBEBEF] overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-300 ${f.barColor}`}
                                  style={{ width: `${f.score}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Weak Subjects */}
                    <div className="bg-white border border-[#EBEBEF] rounded-xl p-4 space-y-2.5">
                      <h3 className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                        <BookOpen size={14} className="text-[#EA580C]" />
                        <span>Weak Subjects ({weakSubjects.length})</span>
                      </h3>
                      {weakSubjects.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {weakSubjects.map((ws, idx) => (
                            <div
                              key={ws.subject_code || ws.subjectCode || idx}
                              className="p-3 rounded-xl bg-rose-50/50 border border-rose-200/80 text-xs space-y-1"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono font-bold text-zinc-900">
                                  {ws.subject_code || ws.subjectCode || ws.code || 'SUBJECT'}
                                </span>
                                {(ws.total_cie !== undefined || ws.attendance_pct !== undefined || ws.score !== undefined) && (
                                  <span className="font-mono text-[11px] font-semibold text-rose-700">
                                    {ws.total_cie !== undefined
                                      ? `CIE ${ws.total_cie}/${ws.max_marks || 50}`
                                      : ws.attendance_pct !== undefined
                                      ? `Att ${ws.attendance_pct}%`
                                      : `Score ${ws.score}`}
                                  </span>
                                )}
                              </div>
                              {(ws.subject_name || ws.subjectName || ws.reason || ws.issue) && (
                                <p className="text-[11px] text-zinc-600">
                                  {ws.subject_name || ws.subjectName}
                                  {ws.reason || ws.issue ? ` — ${ws.reason || ws.issue}` : ''}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-zinc-500">
                          No weak subjects flagged for this student.
                        </p>
                      )}
                    </div>

                    {/* Lacking Areas & Improvement Steps */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl p-4 space-y-2.5">
                        <h3 className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                          <AlertTriangle size={14} className="text-[#B45309]" />
                          <span>Lacking Areas ({lackingAreas.length})</span>
                        </h3>
                        {lackingAreas.length > 0 ? (
                          <ul className="space-y-1.5 text-xs text-zinc-700">
                            {lackingAreas.map((area, idx) => (
                              <li
                                key={idx}
                                className="p-2.5 rounded-lg bg-white border border-[#EBEBEF] flex items-start gap-2"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-[#B45309] mt-1.5 shrink-0" />
                                <span>
                                  {typeof area === 'string'
                                    ? area
                                    : area.label || area.title || area.description || JSON.stringify(area)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-zinc-500">
                            No critical lacking areas detected.
                          </p>
                        )}
                      </div>

                      <div className="bg-emerald-50/40 border border-emerald-200/80 rounded-xl p-4 space-y-2.5">
                        <h3 className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                          <CheckCircle2 size={14} className="text-[#15803D]" />
                          <span>Recommended Improvement Steps ({improvementSteps.length})</span>
                        </h3>
                        {improvementSteps.length > 0 ? (
                          <ol className="space-y-1.5 text-xs text-zinc-700">
                            {improvementSteps.map((step, idx) => (
                              <li
                                key={idx}
                                className="p-2.5 rounded-lg bg-white border border-emerald-200/70 flex items-start gap-2"
                              >
                                <span className="font-mono font-bold text-[#15803D] shrink-0">
                                  {idx + 1}.
                                </span>
                                <span>
                                  {typeof step === 'string'
                                    ? step
                                    : step.action || step.title || step.description || JSON.stringify(step)}
                                </span>
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <p className="text-xs text-zinc-500">
                            Student metrics are satisfactory; maintain current academic cadence.
                          </p>
                        )}
                      </div>
                    </div>
                  </>
                )
              )}

              <div className="flex justify-end pt-3 border-t border-[#EBEBEF]">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedStudentId(null);
                    setDiagnostic(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-[#121214] text-white text-xs font-semibold"
                >
                  Close Diagnostic
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
