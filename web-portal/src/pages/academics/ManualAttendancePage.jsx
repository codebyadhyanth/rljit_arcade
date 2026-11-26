import React, { useEffect, useMemo, useState } from 'react';
import api from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import DbReceiptCard from '../../components/DbReceiptCard';
import {
  Camera,
  CheckCircle2,
  ClipboardCheck,
  RefreshCw,
  Search,
  ShieldAlert,
  Users,
} from 'lucide-react';

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
  'CS',
  'IS',
  'EC',
  'CV',
  'AI',
];

const CORE_BRANCHES = ['', 'CSE', 'AIML', 'DS', 'CYBER', 'ECE', 'ME', 'CS', 'IS', 'EC', 'CV', 'AI'];

function normalizeReceipt(receipt) {
  if (!receipt) return null;
  return {
    ...receipt,
    storedInTables: receipt.storedInTables || receipt.storedInTable,
  };
}

function getAttendanceBarStyle(pct) {
  const num = Number(pct || 0);
  if (num >= 85) {
    return {
      bar: 'bg-[#10B981]',
      badge: 'bg-emerald-50 text-[#15803D] border-emerald-200',
      label: 'Good Standing',
    };
  }
  if (num >= 75) {
    return {
      bar: 'bg-amber-500',
      badge: 'bg-amber-50 text-[#B45309] border-amber-200',
      label: 'Borderline (75–84%)',
    };
  }
  return {
    bar: 'bg-rose-500',
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
    label: 'Shortage (<75%)',
  };
}

function StudentAttendanceView() {
  const [subjectFilter, setSubjectFilter] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadMyAttendance = async (subCode = subjectFilter) => {
    setLoading(true);
    setError('');
    try {
      const qs = subCode.trim()
        ? `?subject_code=${encodeURIComponent(subCode.trim().toUpperCase())}`
        : '';
      const res = await api.get(`/api/v1/attendance/student/me${qs}`);
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to fetch attendance');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMyAttendance('');
  }, []);

  const summary = data?.summary || {};
  const student = data?.student || {};
  const breakdown = Array.isArray(data?.subject_breakdown) ? data.subject_breakdown : [];
  const records = Array.isArray(data?.records) ? data.records : [];
  const overallStyle = getAttendanceBarStyle(summary.attendance_percentage);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#EBEBEF] rounded-2xl p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
            <ClipboardCheck size={19} className="text-[#EA580C]" />
            <span>My Attendance Record</span>
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            {student.usn ? `${student.usn} · ${student.department}` : 'Live personal attendance telemetry'}
            {student.core_branch ? ` (${student.core_branch})` : ''}
            {student.semester ? ` · Sem ${student.semester}` : ''}
            {student.section ? ` · Sec ${student.section}` : ''}
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            loadMyAttendance(subjectFilter);
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            placeholder="Filter subject (e.g. BCS301)"
            className="px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 font-mono"
          />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#121214] text-white text-xs font-semibold"
          >
            <Search size={13} />
            <span>Filter</span>
          </button>
        </form>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-800 text-xs">
          <ShieldAlert size={16} className="text-rose-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Overall Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#EBEBEF] rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Overall Attendance
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-zinc-900 font-mono">
              {summary.attendance_percentage ?? 0}%
            </span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${overallStyle.badge}`}>
              {overallStyle.label}
            </span>
          </div>
        </div>

        <div className="bg-white border border-[#EBEBEF] rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Classes Attended
          </span>
          <p className="mt-2 text-2xl font-bold text-[#15803D] font-mono">
            {summary.attended_count ?? 0}{' '}
            <span className="text-sm font-normal text-zinc-400">/ {summary.total_classes ?? 0}</span>
          </p>
        </div>

        <div className="bg-white border border-[#EBEBEF] rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Present / Late
          </span>
          <p className="mt-2 text-2xl font-bold text-zinc-900 font-mono">
            {summary.present_count ?? 0}{' '}
            <span className="text-xs font-semibold text-[#B45309]">
              ({summary.late_count ?? 0} Late)
            </span>
          </p>
        </div>

        <div className="bg-white border border-[#EBEBEF] rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Absences
          </span>
          <p className="mt-2 text-2xl font-bold text-rose-700 font-mono">
            {summary.absent_count ?? 0}
          </p>
        </div>
      </div>

      {/* Subject-Wise Breakdown */}
      <section className="bg-white border border-[#EBEBEF] rounded-2xl p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] space-y-4">
        <div className="flex items-center justify-between border-b border-[#EBEBEF] pb-3">
          <div>
            <h2 className="text-sm font-bold text-zinc-900">Subject-wise Attendance Breakdown</h2>
            <p className="text-xs text-zinc-500">
              Thresholds: ≥85% Emerald · 75–84% Amber · &lt;75% Rose
            </p>
          </div>
          <button
            type="button"
            onClick={() => loadMyAttendance(subjectFilter)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FBFBFC] border border-[#EBEBEF] text-xs font-semibold text-zinc-700"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>

        {breakdown.length > 0 ? (
          <div className="space-y-4">
            {breakdown.map((sub) => {
              const style = getAttendanceBarStyle(sub.percentage);
              return (
                <div key={sub.subject_code} className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-[#1E293B]">
                        {sub.subject_code}
                      </span>
                      <span className="text-zinc-500">
                        P: {sub.present_count} · L: {sub.late_count} · A: {sub.absent_count} (Total{' '}
                        {sub.total_classes})
                      </span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-bold border ${style.badge}`}>
                      {sub.percentage}%
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-[#F4F4F6] border border-[#EBEBEF] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${style.bar}`}
                      style={{ width: `${Math.min(100, Number(sub.percentage || 0))}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-zinc-500">
            {loading ? 'Loading subject attendance...' : 'No attendance records found yet.'}
          </p>
        )}
      </section>

      {/* Recent Session Logs */}
      <section className="bg-white border border-[#EBEBEF] rounded-2xl p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] space-y-3">
        <h2 className="text-sm font-bold text-zinc-900">Recent Session Logs</h2>
        {records.length > 0 ? (
          <div className="overflow-x-auto border border-[#EBEBEF] rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAFAFA] border-b border-[#EBEBEF] text-zinc-500 font-semibold text-[11px]">
                <tr>
                  <th className="p-3">Date</th>
                  <th className="p-3">Period</th>
                  <th className="p-3">Subject Code</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Entry Mode</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EBEBEF]">
                {records.map((rec) => (
                  <tr key={rec.id} className="hover:bg-[#FBFBFC]">
                    <td className="p-3 font-mono text-zinc-800">
                      {rec.attendance_date ? String(rec.attendance_date).slice(0, 10) : '—'}
                    </td>
                    <td className="p-3 font-mono text-zinc-600">Period {rec.period_no}</td>
                    <td className="p-3 font-mono font-bold text-[#1E293B]">{rec.subject_code}</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          rec.status === 'PRESENT'
                            ? 'bg-emerald-50 text-[#15803D] border-emerald-200'
                            : rec.status === 'LATE'
                            ? 'bg-amber-50 text-[#B45309] border-amber-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        {rec.status}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-[11px] text-zinc-500">{rec.entry_mode}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-zinc-500">No session logs returned.</p>
        )}
      </section>
    </div>
  );
}

export default function ManualAttendancePage() {
  const { user } = useAuth();
  const isStudent = user?.baseRole === 'STUDENT';

  if (isStudent) {
    return <StudentAttendanceView />;
  }

  return <StaffManualAttendanceView user={user} />;
}

function StaffManualAttendanceView({ user }) {
  const isSuperAdmin = user?.adminTier === 'SUPER_ADMIN';
  const isHod =
    user?.adminTier === 'HOD_ADMIN' ||
    (Array.isArray(user?.subRoles) && user.subRoles.includes('HOD'));
  const isFaculty = user?.baseRole === 'FACULTY';
  const canCommit = isSuperAdmin || isHod || isFaculty;

  const [filters, setFilters] = useState({
    department: user?.department || 'CSE',
    core_branch: '',
    semester: user?.department === 'ALLIED_SCIENCE' ? 1 : 3,
    section: 'A',
    subject_code: '',
    attendance_date: new Date().toISOString().slice(0, 10),
    period_no: 1,
  });

  const [students, setStudents] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [receipt, setReceipt] = useState(null);

  const fetchRoster = async (e, preserveFeedback = false) => {
    e?.preventDefault();
    setLoading(true);
    setError('');
    if (!preserveFeedback) {
      setSuccessMsg('');
      setReceipt(null);
    }
    try {
      const params = new URLSearchParams();
      if (filters.department) params.set('department', filters.department);
      if (filters.core_branch) params.set('core_branch', filters.core_branch);
      if (filters.semester) params.set('semester', String(filters.semester));
      if (filters.section) params.set('section', filters.section);
      if (filters.subject_code.trim()) {
        params.set('subject_code', filters.subject_code.trim().toUpperCase());
      }
      if (filters.attendance_date) params.set('attendance_date', filters.attendance_date);
      if (filters.period_no) params.set('period_no', String(filters.period_no));

      const res = await api.get(`/api/v1/attendance/section?${params.toString()}`);
      const list = res.data?.students || [];
      setStudents(list);

      const initialMap = {};
      list.forEach((stu) => {
        initialMap[stu.student_id] = stu.session_status || 'PRESENT';
      });
      setStatuses(initialMap);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load section roster');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoster();
  }, []);

  const markAllPresent = () => {
    const next = {};
    students.forEach((s) => {
      next[s.student_id] = 'PRESENT';
    });
    setStatuses(next);
  };

  const counts = useMemo(() => {
    let present = 0;
    let absent = 0;
    let late = 0;
    students.forEach((s) => {
      const st = statuses[s.student_id] || 'PRESENT';
      if (st === 'PRESENT') present += 1;
      else if (st === 'ABSENT') absent += 1;
      else if (st === 'LATE') late += 1;
    });
    return { present, absent, late };
  }, [students, statuses]);

  const handleCommit = async () => {
    if (!filters.subject_code.trim()) {
      setError('Subject Code is required (e.g. BCS301) before committing attendance.');
      return;
    }
    if (students.length === 0) {
      setError('No students loaded in the active section roster.');
      return;
    }

    setCommitting(true);
    setError('');
    setSuccessMsg('');
    setReceipt(null);

    try {
      const payload = {
        department: filters.department,
        semester: Number(filters.semester),
        section: filters.section,
        subject_code: filters.subject_code.trim().toUpperCase(),
        attendance_date: filters.attendance_date,
        period_no: Number(filters.period_no),
        records: students.map((s) => ({
          student_id: s.student_id,
          department: s.department || filters.department,
          semester: s.semester ?? Number(filters.semester),
          section: s.section || filters.section,
          status: statuses[s.student_id] || 'PRESENT',
        })),
      };

      const res = await api.post('/api/v1/attendance/manual', payload);
      setSuccessMsg(
        `Committed attendance for ${res.data?.committedCount || students.length} students (${payload.subject_code}).`
      );
      setReceipt(normalizeReceipt(res.data?.dbReceipt));
      await fetchRoster(null, true);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to commit attendance');
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Phase 3 Camera Info Note */}
      <div className="bg-white border border-[#EBEBEF] rounded-2xl p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#EBEBEF] pb-4">
          <div>
            <h1 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
              <ClipboardCheck size={19} className="text-[#EA580C]" />
              <span>Manual Attendance Register</span>
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Mark PRESENT / ABSENT / LATE per student and commit atomically into PostgreSQL.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs text-zinc-700">
            <Camera size={14} className="text-[#1E293B] shrink-0" />
            <span>Physical Camera Sheet Scanner is reserved for the Mobile App Phase 3 release.</span>
          </div>
        </div>

        {/* Filter Bar */}
        <form onSubmit={(e) => fetchRoster(e, false)} className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 items-end">
          <div>
            <label className="block text-[11px] font-semibold text-zinc-600 mb-1">Department</label>
            <select
              value={filters.department}
              onChange={(e) => setFilters({ ...filters, department: e.target.value })}
              className="w-full px-2.5 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900"
            >
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
              Core Branch <span className="text-zinc-400">(opt)</span>
            </label>
            <select
              value={filters.core_branch}
              onChange={(e) => setFilters({ ...filters, core_branch: e.target.value })}
              className="w-full px-2.5 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900"
            >
              {CORE_BRANCHES.map((b) => (
                <option key={b || 'all'} value={b}>
                  {b || 'All Branches'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-zinc-600 mb-1">Semester</label>
            <select
              value={filters.semester}
              onChange={(e) => setFilters({ ...filters, semester: Number(e.target.value) })}
              className="w-full px-2.5 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                <option key={s} value={s}>
                  Sem {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-zinc-600 mb-1">Section</label>
            <select
              value={filters.section}
              onChange={(e) => setFilters({ ...filters, section: e.target.value })}
              className="w-full px-2.5 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900"
            >
              {['A', 'B', 'C', 'D', 'E', 'F'].map((sec) => (
                <option key={sec} value={sec}>
                  Sec {sec}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-zinc-600 mb-1">Subject Code</label>
            <input
              type="text"
              value={filters.subject_code}
              onChange={(e) => setFilters({ ...filters, subject_code: e.target.value })}
              placeholder="BCS301"
              className="w-full px-2.5 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-zinc-600 mb-1">Date</label>
            <input
              type="date"
              value={filters.attendance_date}
              onChange={(e) => setFilters({ ...filters, attendance_date: e.target.value })}
              className="w-full px-2.5 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-zinc-600 mb-1">Period</label>
            <input
              type="number"
              min="1"
              max="10"
              value={filters.period_no}
              onChange={(e) => setFilters({ ...filters, period_no: Number(e.target.value) })}
              className="w-full px-2.5 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 font-mono"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#121214] hover:bg-black text-white text-xs font-semibold transition"
          >
            <Search size={13} />
            <span>{loading ? 'Loading...' : 'Load Roster'}</span>
          </button>
        </form>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-800 text-xs">
          <ShieldAlert size={16} className="text-rose-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-emerald-800 text-xs font-semibold">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {receipt && <DbReceiptCard receipt={receipt} title="Attendance Transaction Receipt" />}

      {/* Roster Checklist Table */}
      <section className="bg-white border border-[#EBEBEF] rounded-2xl p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#EBEBEF] pb-3">
          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5 font-bold text-zinc-900">
              <Users size={15} className="text-[#EA580C]" />
              {students.length} Student{students.length === 1 ? '' : 's'}
            </span>
            {students.length > 0 && (
              <span className="font-mono text-[11px] text-zinc-500">
                P: {counts.present} · L: {counts.late} · A: {counts.absent}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canCommit && students.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={markAllPresent}
                  className="px-3.5 py-2 rounded-xl bg-[#FBFBFC] hover:bg-zinc-100 border border-[#EBEBEF] text-xs font-semibold text-zinc-800 transition"
                >
                  Mark All Present
                </button>
                <button
                  type="button"
                  onClick={handleCommit}
                  disabled={committing}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#EA580C] hover:bg-[#C2410C] text-white text-xs font-semibold transition shadow-sm disabled:opacity-50"
                >
                  <CheckCircle2 size={14} />
                  <span>{committing ? 'Committing...' : 'Commit Attendance'}</span>
                </button>
              </>
            )}
            {!canCommit && (
              <span className="text-[11px] text-zinc-500 bg-zinc-100 px-3 py-1.5 rounded-lg border border-zinc-200">
                View-Only Scope (Faculty / HOD / Super Admin required to commit)
              </span>
            )}
          </div>
        </div>

        {loading ? (
          <p className="text-xs text-zinc-500 py-4">Fetching section student roster...</p>
        ) : students.length > 0 ? (
          <div className="overflow-x-auto border border-[#EBEBEF] rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAFAFA] border-b border-[#EBEBEF] text-zinc-500 font-semibold text-[11px]">
                <tr>
                  <th className="p-3">USN</th>
                  <th className="p-3">Student Name</th>
                  <th className="p-3">Dept / Branch</th>
                  <th className="p-3">Cumul. Attendance</th>
                  <th className="p-3">Session Mark ({filters.attendance_date} · P{filters.period_no})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EBEBEF]">
                {students.map((stu) => {
                  const selected = statuses[stu.student_id] || 'PRESENT';
                  return (
                    <tr key={stu.student_id} className="hover:bg-[#FBFBFC]">
                      <td className="p-3 font-mono font-bold text-zinc-900 whitespace-nowrap">
                        {stu.usn}
                      </td>
                      <td className="p-3 font-medium text-zinc-800 whitespace-nowrap">
                        {stu.full_name}
                      </td>
                      <td className="p-3 text-zinc-600 whitespace-nowrap">
                        {stu.department}
                        {stu.core_branch ? ` (${stu.core_branch})` : ''} · Sem {stu.semester}
                        {stu.section}
                      </td>
                      <td className="p-3 font-mono whitespace-nowrap">
                        <span className="font-semibold text-zinc-800">
                          {stu.attendance_percentage ?? 0}%
                        </span>{' '}
                        <span className="text-[10px] text-zinc-400">
                          ({stu.present_count + stu.late_count}/{stu.total_classes})
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {['PRESENT', 'ABSENT', 'LATE'].map((option) => {
                            const active = selected === option;
                            const activeCls =
                              option === 'PRESENT'
                                ? 'bg-[#15803D] text-white border-[#15803D]'
                                : option === 'ABSENT'
                                ? 'bg-rose-600 text-white border-rose-600'
                                : 'bg-[#B45309] text-white border-[#B45309]';
                            return (
                              <button
                                key={option}
                                type="button"
                                disabled={!canCommit}
                                onClick={() =>
                                  setStatuses((prev) => ({
                                    ...prev,
                                    [stu.student_id]: option,
                                  }))
                                }
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition ${
                                  active
                                    ? activeCls
                                    : 'bg-white text-zinc-600 border-[#EBEBEF] hover:bg-zinc-100'
                                } disabled:opacity-60`}
                              >
                                {option}
                              </button>
                            );
                          })}
                          {stu.session_status && (
                            <span className="text-[10px] font-mono text-zinc-400 ml-1">
                              (Saved: {stu.session_status})
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-zinc-500 py-4">
            No students matched the selected department, semester, and section filters.
          </p>
        )}
      </section>
    </div>
  );
}
