import React, { useEffect, useState } from 'react';
import api from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import DbReceiptCard from '../../components/DbReceiptCard';
import { Award, CheckCircle2, RefreshCw, Save, Search, ShieldAlert } from 'lucide-react';

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

function normalizeReceipt(receipt) {
  if (!receipt) return null;
  return {
    ...receipt,
    storedInTables: receipt.storedInTables || receipt.storedInTable,
  };
}

function computeTotalCie(row) {
  const c1 = Number(row.cie1 || 0);
  const c2 = Number(row.cie2 || 0);
  const c3 = Number(row.cie3 || 0);
  const asgn = Number(row.assignment || 0);
  const maxMarks = Number(row.max_marks || 50);
  const avg = (c1 + c2 + c3) / 3.0 + asgn;
  const rounded = Math.round(avg * 100) / 100;
  return Math.min(rounded, maxMarks).toFixed(2);
}

function StudentCieView() {
  const [semesterFilter, setSemesterFilter] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadMyCie = async (sem = semesterFilter) => {
    setLoading(true);
    setError('');
    try {
      const qs = sem ? `?semester=${encodeURIComponent(sem)}` : '';
      const res = await api.get(`/api/v1/cie/student/me${qs}`);
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load CIE marks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMyCie('');
  }, []);

  const student = data?.student || {};
  const marks = Array.isArray(data?.marks) ? data.marks : [];

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#EBEBEF] rounded-2xl p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
            <Award size={19} className="text-[#EA580C]" />
            <span>My CIE Marks & Internal Scorecard</span>
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            {student.usn ? `${student.usn} · ${student.department}` : 'Live CIE evaluations'}
            {student.core_branch ? ` (${student.core_branch})` : ''}
            {student.semester ? ` · Sem ${student.semester}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={semesterFilter}
            onChange={(e) => {
              setSemesterFilter(e.target.value);
              loadMyCie(e.target.value);
            }}
            className="px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900"
          >
            <option value="">All Semesters</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
              <option key={s} value={s}>
                Semester {s}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => loadMyCie(semesterFilter)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#FBFBFC] border border-[#EBEBEF] text-xs font-semibold text-zinc-700"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-800 text-xs">
          <ShieldAlert size={16} className="text-rose-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-[#EBEBEF] rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Average Total CIE
          </span>
          <p className="mt-2 text-2xl font-bold text-zinc-900 font-mono">
            {data?.averageCie ?? 0}
          </p>
        </div>
        <div className="bg-white border border-[#EBEBEF] rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Subjects Evaluated
          </span>
          <p className="mt-2 text-2xl font-bold text-[#1E293B] font-mono">
            {data?.count ?? marks.length}
          </p>
        </div>
        <div className="bg-white border border-[#EBEBEF] rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Student USN
          </span>
          <p className="mt-2 text-xl font-bold text-zinc-900 font-mono">
            {student.usn || '—'}
          </p>
        </div>
      </div>

      <section className="bg-white border border-[#EBEBEF] rounded-2xl p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] space-y-4">
        <h2 className="text-sm font-bold text-zinc-900">Subject-wise CIE Scorecard</h2>
        {loading ? (
          <p className="text-xs text-zinc-500">Loading CIE scorecard...</p>
        ) : marks.length > 0 ? (
          <div className="overflow-x-auto border border-[#EBEBEF] rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAFAFA] border-b border-[#EBEBEF] text-zinc-500 font-semibold text-[11px]">
                <tr>
                  <th className="p-3">Subject</th>
                  <th className="p-3">Sem</th>
                  <th className="p-3">CIE 1</th>
                  <th className="p-3">CIE 2</th>
                  <th className="p-3">CIE 3</th>
                  <th className="p-3">Assignment</th>
                  <th className="p-3">Total CIE</th>
                  <th className="p-3">Performance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EBEBEF]">
                {marks.map((m) => {
                  const pct =
                    Number(m.max_marks || 0) > 0
                      ? Math.min(100, Math.round((Number(m.total_cie || 0) / Number(m.max_marks)) * 100))
                      : 0;
                  return (
                    <tr key={m.id} className="hover:bg-[#FBFBFC]">
                      <td className="p-3">
                        <span className="font-mono font-bold text-[#1E293B]">{m.subject_code}</span>
                        {m.subject_name && (
                          <span className="block text-[11px] text-zinc-500">{m.subject_name}</span>
                        )}
                      </td>
                      <td className="p-3 font-mono text-zinc-600">{m.semester}</td>
                      <td className="p-3 font-mono">{m.cie1}</td>
                      <td className="p-3 font-mono">{m.cie2}</td>
                      <td className="p-3 font-mono">{m.cie3}</td>
                      <td className="p-3 font-mono">{m.assignment}</td>
                      <td className="p-3 font-mono font-bold text-zinc-900">
                        {m.total_cie}{' '}
                        <span className="font-normal text-zinc-400">/ {m.max_marks}</span>
                      </td>
                      <td className="p-3 min-w-[140px]">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-[#F4F4F6] border border-[#EBEBEF] overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                pct >= 70
                                  ? 'bg-[#10B981]'
                                  : pct >= 40
                                  ? 'bg-amber-500'
                                  : 'bg-rose-500'
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="font-mono text-[11px] font-semibold text-zinc-700 w-9 text-right">
                            {pct}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-zinc-500">No CIE marks have been recorded yet.</p>
        )}
      </section>
    </div>
  );
}

export default function CieMarksPage() {
  const { user } = useAuth();
  if (user?.baseRole === 'STUDENT') {
    return <StudentCieView />;
  }
  return <StaffCieMarksView user={user} />;
}

function StaffCieMarksView({ user }) {
  const isSuperAdmin = user?.adminTier === 'SUPER_ADMIN';
  const isHod =
    user?.adminTier === 'HOD_ADMIN' ||
    (Array.isArray(user?.subRoles) && user.subRoles.includes('HOD'));
  const isFaculty = user?.baseRole === 'FACULTY';
  const canEdit = isSuperAdmin || isHod || isFaculty;

  const [filters, setFilters] = useState({
    department: user?.department || 'CSE',
    semester: user?.department === 'ALLIED_SCIENCE' ? 1 : 3,
    section: 'A',
    subject_code: 'BCS301',
    subject_name: '',
  });

  const [activeSubjectCode, setActiveSubjectCode] = useState('BCS301');
  const [students, setStudents] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [receipt, setReceipt] = useState(null);

  const loadSectionCie = async (e, preserveFeedback = false) => {
    e?.preventDefault();
    setLoading(true);
    setError('');
    if (!preserveFeedback) {
      setSuccessMsg('');
      setReceipt(null);
    }
    try {
      const subCode = filters.subject_code.trim().toUpperCase();
      const params = new URLSearchParams();
      if (filters.department) params.set('department', filters.department);
      if (filters.semester) params.set('semester', String(filters.semester));
      if (filters.section) params.set('section', filters.section);
      if (subCode) params.set('subject_code', subCode);

      const res = await api.get(`/api/v1/cie/section?${params.toString()}`);
      const list = res.data?.students || [];
      setStudents(list);
      setActiveSubjectCode(subCode);

      if (subCode) {
        const nextDrafts = {};
        list.forEach((stu) => {
          nextDrafts[stu.student_id] = {
            cie1: stu.cie1 ?? 0,
            cie2: stu.cie2 ?? 0,
            cie3: stu.cie3 ?? 0,
            assignment: stu.assignment ?? 0,
            max_marks: stu.max_marks ?? 50,
          };
        });
        setDrafts(nextDrafts);
      } else {
        setDrafts({});
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load section CIE marks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSectionCie();
  }, []);

  const updateDraftField = (studentId, field, value) => {
    setDrafts((prev) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || { cie1: 0, cie2: 0, cie3: 0, assignment: 0, max_marks: 50 }),
        [field]: value,
      },
    }));
  };

  const saveMarks = async (targetStudents) => {
    if (!activeSubjectCode) {
      setError('Enter a Subject Code and load the section before saving CIE marks.');
      return;
    }
    if (!targetStudents || targetStudents.length === 0) return;

    setSaving(true);
    setError('');
    setSuccessMsg('');
    setReceipt(null);

    try {
      const payload = {
        department: filters.department,
        semester: Number(filters.semester),
        subject_code: activeSubjectCode,
        subject_name: filters.subject_name.trim() || undefined,
        records: targetStudents.map((stu) => {
          const d = drafts[stu.student_id] || {};
          return {
            student_id: stu.student_id,
            department: stu.department || filters.department,
            semester: stu.semester ?? Number(filters.semester),
            cie1: Number(d.cie1 || 0),
            cie2: Number(d.cie2 || 0),
            cie3: Number(d.cie3 || 0),
            assignment: Number(d.assignment || 0),
            max_marks: Number(d.max_marks || 50),
          };
        }),
      };

      const res = await api.post('/api/v1/cie/manual', payload);
      setSuccessMsg(
        `Saved CIE marks for ${res.data?.committedCount || targetStudents.length} student(s) in ${activeSubjectCode}.`
      );
      setReceipt(normalizeReceipt(res.data?.dbReceipt));
      await loadSectionCie(null, true);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to save CIE marks');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#EBEBEF] rounded-2xl p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] space-y-4">
        <div className="border-b border-[#EBEBEF] pb-4">
          <h1 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
            <Award size={19} className="text-[#EA580C]" />
            <span>CIE Marks Entry & Moderation</span>
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Inline CIE 1, CIE 2, CIE 3, and Assignment marks with automatic PostgreSQL total_cie calculation.
          </p>
        </div>

        <form onSubmit={(e) => loadSectionCie(e, false)} className="grid grid-cols-2 sm:grid-cols-6 gap-3 items-end">
          <div>
            <label className="block text-[11px] font-semibold text-zinc-600 mb-1">Department</label>
            <select
              value={filters.department}
              onChange={(e) => setFilters({ ...filters, department: e.target.value })}
              className="w-full px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900"
            >
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-zinc-600 mb-1">Semester</label>
            <select
              value={filters.semester}
              onChange={(e) => setFilters({ ...filters, semester: Number(e.target.value) })}
              className="w-full px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900"
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
              className="w-full px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900"
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
              className="w-full px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
              Subject Name <span className="text-zinc-400">(opt)</span>
            </label>
            <input
              type="text"
              value={filters.subject_name}
              onChange={(e) => setFilters({ ...filters, subject_name: e.target.value })}
              placeholder="Data Structures"
              className="w-full px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#121214] hover:bg-black text-white text-xs font-semibold transition"
          >
            <Search size={13} />
            <span>{loading ? 'Loading...' : 'Load Marks'}</span>
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

      {receipt && <DbReceiptCard receipt={receipt} title="CIE Marks Persistence Receipt" />}

      <section className="bg-white border border-[#EBEBEF] rounded-2xl p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#EBEBEF] pb-3">
          <div className="text-xs text-zinc-600">
            Showing <strong className="text-zinc-900">{students.length}</strong> students
            {activeSubjectCode ? (
              <>
                {' '}
                for <span className="font-mono font-bold text-[#1E293B]">{activeSubjectCode}</span>
              </>
            ) : (
              ' (multi-subject summary — enter a Subject Code above to edit inline)'
            )}
          </div>

          {canEdit && activeSubjectCode && students.length > 0 && (
            <button
              type="button"
              disabled={saving}
              onClick={() => saveMarks(students)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#EA580C] hover:bg-[#C2410C] text-white text-xs font-semibold transition shadow-sm disabled:opacity-50"
            >
              <Save size={14} />
              <span>{saving ? 'Saving All...' : 'Save CIE Marks'}</span>
            </button>
          )}
        </div>

        {loading ? (
          <p className="text-xs text-zinc-500 py-4">Fetching section CIE roster...</p>
        ) : students.length === 0 ? (
          <p className="text-xs text-zinc-500 py-4">
            No students matched the selected department, semester, and section filters.
          </p>
        ) : activeSubjectCode ? (
          <div className="overflow-x-auto border border-[#EBEBEF] rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAFAFA] border-b border-[#EBEBEF] text-zinc-500 font-semibold text-[11px]">
                <tr>
                  <th className="p-3">USN</th>
                  <th className="p-3">Student Name</th>
                  <th className="p-3">CIE 1</th>
                  <th className="p-3">CIE 2</th>
                  <th className="p-3">CIE 3</th>
                  <th className="p-3">Assignment</th>
                  <th className="p-3">Max</th>
                  <th className="p-3">Total CIE (Live)</th>
                  {canEdit && <th className="p-3 text-right">Row Save</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EBEBEF]">
                {students.map((stu) => {
                  const d = drafts[stu.student_id] || {
                    cie1: 0,
                    cie2: 0,
                    cie3: 0,
                    assignment: 0,
                    max_marks: 50,
                  };
                  const liveTotal = computeTotalCie(d);

                  return (
                    <tr key={stu.student_id} className="hover:bg-[#FBFBFC]">
                      <td className="p-3 font-mono font-bold text-zinc-900 whitespace-nowrap">
                        {stu.usn}
                      </td>
                      <td className="p-3 font-medium text-zinc-800 whitespace-nowrap">
                        {stu.full_name}
                      </td>
                      {['cie1', 'cie2', 'cie3', 'assignment', 'max_marks'].map((fld) => (
                        <td key={fld} className="p-2">
                          <input
                            type="number"
                            step="0.5"
                            min={fld === 'max_marks' ? '1' : '0'}
                            max="999"
                            disabled={!canEdit}
                            value={d[fld]}
                            onChange={(e) => updateDraftField(stu.student_id, fld, e.target.value)}
                            className="w-20 px-2.5 py-1.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-lg text-xs font-mono text-zinc-900 focus:border-[#EA580C] outline-none disabled:bg-zinc-100"
                          />
                        </td>
                      ))}
                      <td className="p-3 font-mono font-bold text-[#15803D] whitespace-nowrap">
                        {liveTotal}{' '}
                        <span className="text-[11px] font-normal text-zinc-400">
                          / {d.max_marks || 50}
                        </span>
                      </td>
                      {canEdit && (
                        <td className="p-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => saveMarks([stu])}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#121214] hover:bg-black text-white text-[11px] font-semibold transition disabled:opacity-50"
                          >
                            <Save size={12} />
                            <span>Save</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto border border-[#EBEBEF] rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAFAFA] border-b border-[#EBEBEF] text-zinc-500 font-semibold text-[11px]">
                <tr>
                  <th className="p-3">USN</th>
                  <th className="p-3">Student Name</th>
                  <th className="p-3">Subjects Recorded</th>
                  <th className="p-3">Average CIE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EBEBEF]">
                {students.map((stu) => (
                  <tr key={stu.student_id} className="hover:bg-[#FBFBFC]">
                    <td className="p-3 font-mono font-bold text-zinc-900">{stu.usn}</td>
                    <td className="p-3 font-medium text-zinc-800">{stu.full_name}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1.5">
                        {(stu.subjects || []).length > 0 ? (
                          stu.subjects.map((sub) => (
                            <span
                              key={sub.id}
                              className="px-2 py-0.5 rounded bg-[#F4F4F6] border border-[#EBEBEF] font-mono text-[11px]"
                            >
                              {sub.subject_code}: {sub.total_cie}/{sub.max_marks}
                            </span>
                          ))
                        ) : (
                          <span className="text-zinc-400">None</span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 font-mono font-bold text-zinc-900">
                      {stu.average_cie ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
