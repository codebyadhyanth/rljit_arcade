import React, { useEffect, useMemo, useState } from 'react';
import api from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import DbReceiptCard from '../../components/DbReceiptCard';
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ArrowLeftRight,
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

const DAYS = [
  { day: 1, label: 'Monday', short: 'MON' },
  { day: 2, label: 'Tuesday', short: 'TUE' },
  { day: 3, label: 'Wednesday', short: 'WED' },
  { day: 4, label: 'Thursday', short: 'THU' },
  { day: 5, label: 'Friday', short: 'FRI' },
  { day: 6, label: 'Saturday', short: 'SAT' },
];

const DEFAULT_PERIOD_TIMES = {
  1: { start: '09:00', end: '09:55' },
  2: { start: '09:55', end: '10:50' },
  3: { start: '11:05', end: '12:00' },
  4: { start: '12:00', end: '12:55' },
  5: { start: '13:45', end: '14:40' },
  6: { start: '14:40', end: '15:35' },
  7: { start: '15:35', end: '16:30' },
  8: { start: '16:30', end: '17:25' },
};

function normalizeReceipt(receipt) {
  if (!receipt) return null;
  return {
    ...receipt,
    storedInTables: receipt.storedInTables || receipt.storedInTable,
  };
}

export default function TimetablePage() {
  const { user } = useAuth();

  const isSuperAdmin = user?.adminTier === 'SUPER_ADMIN';
  const isHod =
    user?.adminTier === 'HOD_ADMIN' ||
    (Array.isArray(user?.subRoles) && user.subRoles.includes('HOD'));
  const secCode = String(user?.sectionCode || '').toUpperCase();
  const isAdmOrExm =
    (user?.baseRole === 'ADMIN' || user?.adminTier === 'REGULAR_ADMIN') &&
    (secCode === 'ADM' || secCode === 'EXM');
  const canManageTimetable = isSuperAdmin || isHod || isAdmOrExm;

  const [filters, setFilters] = useState({
    department: user?.department || 'CSE',
    semester: user?.semester || 3,
    section: 'A',
  });
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Upsert form state
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [receipt, setReceipt] = useState(null);

  const [slotForm, setSlotForm] = useState({
    department: user?.department || 'CSE',
    semester: user?.semester || 3,
    section: 'A',
    day_of_week: 1,
    period_no: 1,
    subject_code: '',
    subject_name: '',
    start_time: '09:00',
    end_time: '09:55',
    room_no: '',
    faculty_id: '',
  });

  // Faculty lookup inside form
  const [facSearchQuery, setFacSearchQuery] = useState('RLFAC');
  const [facResults, setFacResults] = useState([]);
  const [facSearching, setFacSearching] = useState(false);

  const fetchTimetable = async (overrideFilters = null) => {
    const active = overrideFilters || filters;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (active.department) params.set('department', active.department);
      if (active.semester) params.set('semester', String(active.semester));
      if (active.section) params.set('section', active.section);

      const res = await api.get(`/api/v1/timetable?${params.toString()}`);
      setSlots(res.data?.slots || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load timetable');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    async function init() {
      let nextFilters = {
        department: user?.department || 'CSE',
        semester: user?.semester || 3,
        section: 'A',
      };

      if (user?.baseRole === 'STUDENT') {
        try {
          const profRes = await api.get('/api/v1/profile/me');
          const stu = profRes.data?.profile?.studentDetails;
          if (stu && active) {
            nextFilters = {
              department: stu.department || nextFilters.department,
              semester: stu.semester || nextFilters.semester,
              section: stu.section || 'A',
            };
            setFilters(nextFilters);
            setSlotForm((prev) => ({
              ...prev,
              department: nextFilters.department,
              semester: nextFilters.semester,
              section: nextFilters.section,
            }));
          }
        } catch {
          // Keep default filters if profile lookup fails
        }
      }

      if (active) {
        await fetchTimetable(nextFilters);
      }
    }
    init();
    return () => {
      active = false;
    };
  }, [user?.username]);

  const maxPeriod = useMemo(() => {
    const highest = slots.reduce((max, s) => Math.max(max, Number(s.period_no || 0)), 8);
    return Math.min(10, Math.max(8, highest));
  }, [slots]);

  const periodNumbers = useMemo(
    () => Array.from({ length: maxPeriod }, (_, i) => i + 1),
    [maxPeriod]
  );

  const slotMap = useMemo(() => {
    const map = new Map();
    slots.forEach((s) => {
      map.set(`${s.day_of_week}-${s.period_no}`, s);
    });
    return map;
  }, [slots]);

  const searchFaculty = async (qOverride = null) => {
    const q = (qOverride ?? facSearchQuery).trim();
    if (!q) return;
    setFacSearching(true);
    try {
      const res = await api.get(`/api/v1/users/search?q=${encodeURIComponent(q)}`);
      const onlyFaculty = (res.data?.results || []).filter((u) => u.baseRole === 'FACULTY');
      setFacResults(onlyFaculty);
    } catch {
      setFacResults([]);
    } finally {
      setFacSearching(false);
    }
  };

  const openCellInForm = (dayNum, periodNum, existingSlot) => {
    if (!canManageTimetable) return;
    const defaultTimes = DEFAULT_PERIOD_TIMES[periodNum] || { start: '', end: '' };
    setSlotForm({
      department:
        isHod && !isSuperAdmin && !isAdmOrExm ? user?.department || filters.department : filters.department,
      semester: Number(filters.semester),
      section: filters.section,
      day_of_week: dayNum,
      period_no: periodNum,
      subject_code: existingSlot?.subject_code || '',
      subject_name: existingSlot?.subject_name || '',
      start_time: existingSlot?.start_time || defaultTimes.start,
      end_time: existingSlot?.end_time || defaultTimes.end,
      room_no: existingSlot?.room_no || '',
      faculty_id: existingSlot?.faculty_id || '',
    });
    setShowForm(true);
    setSaveError('');
    setSaveMessage('');
  };

  const handleSaveSlot = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaveError('');
    setSaveMessage('');
    setReceipt(null);

    try {
      const payload = {
        department: slotForm.department.trim().toUpperCase(),
        semester: Number(slotForm.semester),
        section: slotForm.section.trim().toUpperCase(),
        day_of_week: Number(slotForm.day_of_week),
        period_no: Number(slotForm.period_no),
        subject_code: slotForm.subject_code.trim().toUpperCase(),
        subject_name: slotForm.subject_name.trim() || null,
        start_time: slotForm.start_time.trim() || null,
        end_time: slotForm.end_time.trim() || null,
        room_no: slotForm.room_no.trim() || null,
        faculty_id: slotForm.faculty_id.trim() || null,
      };

      const res = await api.post('/api/v1/timetable', payload);
      setSaveMessage(res.data?.message || 'Timetable slot saved successfully');
      setReceipt(normalizeReceipt(res.data?.dbReceipt));
      await fetchTimetable();
    } catch (err) {
      setSaveError(err.response?.data?.error || err.message || 'Failed to save timetable slot');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Filter Bar */}
      <div className="bg-white border border-[#EBEBEF] rounded-2xl p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#EBEBEF] pb-4">
          <div>
            <h1 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
              <CalendarDays size={19} className="text-[#EA580C]" />
              <span>Master Weekly Timetable</span>
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Monday–Saturday institutional schedule grid with live faculty assignments and approved class swaps.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canManageTimetable && (
              <button
                type="button"
                onClick={() => {
                  setShowForm((v) => !v);
                  setSlotForm((prev) => ({
                    ...prev,
                    department:
                      isHod && !isSuperAdmin && !isAdmOrExm
                        ? user?.department || filters.department
                        : filters.department,
                    semester: filters.semester,
                    section: filters.section,
                  }));
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#EA580C] hover:bg-[#C2410C] text-white text-xs font-semibold transition shadow-sm"
              >
                <Plus size={14} />
                <span>{showForm ? 'Close Slot Editor' : 'Add / Update Slot'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => fetchTimetable()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#FBFBFC] hover:bg-zinc-100 border border-[#EBEBEF] text-zinc-700 text-xs font-semibold transition"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Filter Controls */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchTimetable();
          }}
          className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
        >
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">Department</label>
            <select
              value={filters.department}
              onChange={(e) => setFilters({ ...filters, department: e.target.value })}
              className="w-full px-3 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 outline-none focus:border-[#EA580C]"
            >
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">Semester</label>
            <select
              value={filters.semester}
              onChange={(e) => setFilters({ ...filters, semester: Number(e.target.value) })}
              className="w-full px-3 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 outline-none focus:border-[#EA580C]"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
                <option key={sem} value={sem}>
                  Semester {sem}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">Section</label>
            <select
              value={filters.section}
              onChange={(e) => setFilters({ ...filters, section: e.target.value })}
              className="w-full px-3 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 outline-none focus:border-[#EA580C]"
            >
              {['A', 'B', 'C', 'D', 'E', 'F'].map((sec) => (
                <option key={sec} value={sec}>
                  Section {sec}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#121214] hover:bg-black text-white text-xs font-semibold rounded-xl transition"
          >
            <Search size={14} />
            <span>Load Schedule</span>
          </button>
        </form>
      </div>

      {/* Add / Update Slot Drawer */}
      {canManageTimetable && showForm && (
        <div className="bg-white border border-[#EBEBEF] rounded-2xl p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] space-y-5">
          <div className="border-b border-[#EBEBEF] pb-3">
            <h2 className="text-sm font-bold text-zinc-900">
              Create or Update Timetable Slot
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Upserts by (department, semester, section, day_of_week, period_no) in PostgreSQL.
            </p>
          </div>

          {saveError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-start gap-2">
              <ShieldAlert size={15} className="text-rose-600 shrink-0 mt-0.5" />
              <span>{saveError}</span>
            </div>
          )}

          {saveMessage && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
              <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
              <span className="font-semibold">{saveMessage}</span>
            </div>
          )}

          {receipt && (
            <DbReceiptCard receipt={receipt} title="Timetable Slot Persistence Receipt" />
          )}

          <form onSubmit={handleSaveSlot} className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Department</label>
                <select
                  value={slotForm.department}
                  onChange={(e) => setSlotForm({ ...slotForm, department: e.target.value })}
                  disabled={isHod && !isSuperAdmin && !isAdmOrExm}
                  className="w-full px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 disabled:bg-zinc-100"
                >
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Semester</label>
                <input
                  type="number"
                  min="1"
                  max="8"
                  value={slotForm.semester}
                  onChange={(e) => setSlotForm({ ...slotForm, semester: e.target.value })}
                  className="w-full px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Section</label>
                <input
                  type="text"
                  value={slotForm.section}
                  onChange={(e) => setSlotForm({ ...slotForm, section: e.target.value })}
                  className="w-full px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Day</label>
                <select
                  value={slotForm.day_of_week}
                  onChange={(e) => setSlotForm({ ...slotForm, day_of_week: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900"
                >
                  {DAYS.map((d) => (
                    <option key={d.day} value={d.day}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Period (1–8)</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={slotForm.period_no}
                  onChange={(e) => {
                    const p = Number(e.target.value);
                    const def = DEFAULT_PERIOD_TIMES[p];
                    setSlotForm({
                      ...slotForm,
                      period_no: e.target.value,
                      start_time: def?.start || slotForm.start_time,
                      end_time: def?.end || slotForm.end_time,
                    });
                  }}
                  className="w-full px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Subject Code</label>
                <input
                  type="text"
                  value={slotForm.subject_code}
                  onChange={(e) => setSlotForm({ ...slotForm, subject_code: e.target.value })}
                  placeholder="BCS301"
                  className="w-full px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 font-mono"
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Subject Name</label>
                <input
                  type="text"
                  value={slotForm.subject_name}
                  onChange={(e) => setSlotForm({ ...slotForm, subject_name: e.target.value })}
                  placeholder="Data Structures & Algorithms"
                  className="w-full px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Start Time</label>
                <input
                  type="text"
                  value={slotForm.start_time}
                  onChange={(e) => setSlotForm({ ...slotForm, start_time: e.target.value })}
                  placeholder="09:00"
                  className="w-full px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">End Time</label>
                <input
                  type="text"
                  value={slotForm.end_time}
                  onChange={(e) => setSlotForm({ ...slotForm, end_time: e.target.value })}
                  placeholder="09:55"
                  className="w-full px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-end">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Room No.</label>
                <input
                  type="text"
                  value={slotForm.room_no}
                  onChange={(e) => setSlotForm({ ...slotForm, room_no: e.target.value })}
                  placeholder="LH-204"
                  className="w-full px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900"
                />
              </div>

              <div className="lg:col-span-2 space-y-2">
                <label className="block text-xs font-semibold text-zinc-700">
                  Assign Faculty (Search `/api/v1/users/search` or Select)
                </label>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={facSearchQuery}
                    onChange={(e) => setFacSearchQuery(e.target.value)}
                    placeholder="Search RLFAC or username..."
                    className="flex-1 min-w-[160px] px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900"
                  />
                  <button
                    type="button"
                    onClick={() => searchFaculty()}
                    disabled={facSearching}
                    className="px-3.5 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-semibold border border-[#EBEBEF]"
                  >
                    {facSearching ? 'Searching...' : 'Find Faculty'}
                  </button>
                  <select
                    value={slotForm.faculty_id}
                    onChange={(e) => setSlotForm({ ...slotForm, faculty_id: e.target.value })}
                    className="flex-1 min-w-[200px] px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900"
                  >
                    <option value="">-- Unassigned / Select Faculty --</option>
                    {facResults.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.fullName} ({f.username}) · {f.department || 'FAC'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#121214] hover:bg-black text-white text-xs font-semibold rounded-xl transition disabled:opacity-50"
              >
                {saving ? 'Saving Slot...' : 'Save Timetable Slot'}
              </button>
            </div>
          </form>
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-800 text-xs">
          <ShieldAlert size={16} className="text-rose-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Weekly Mon-Sat Grid */}
      <div className="bg-white border border-[#EBEBEF] rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="text-xs text-zinc-600">
            Showing{' '}
            <strong className="text-zinc-900">
              {filters.department} · Sem {filters.semester} · Section {filters.section}
            </strong>{' '}
            ({slots.length} scheduled slot{slots.length === 1 ? '' : 's'})
          </div>
          {canManageTimetable && (
            <span className="text-[11px] text-zinc-500">
              Tip: Click any cell to populate or update that period slot.
            </span>
          )}
        </div>

        <table className="w-full min-w-[960px] border-collapse text-xs">
          <thead>
            <tr className="bg-[#1E293B] text-white">
              <th className="p-3 text-left font-semibold rounded-tl-xl w-28">Day / Period</th>
              {periodNumbers.map((p, idx) => (
                <th
                  key={p}
                  className={`p-3 text-left font-semibold border-l border-white/10 ${
                    idx === periodNumbers.length - 1 ? 'rounded-tr-xl' : ''
                  }`}
                >
                  <div className="font-mono text-[11px]">Period {p}</div>
                  {DEFAULT_PERIOD_TIMES[p] && (
                    <div className="text-[10px] font-normal text-slate-300 font-mono">
                      {DEFAULT_PERIOD_TIMES[p].start}–{DEFAULT_PERIOD_TIMES[p].end}
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EBEBEF]">
            {DAYS.map(({ day, label, short }) => (
              <tr key={day} className="hover:bg-[#FBFBFC]">
                <td className="p-3 bg-[#F8FAFC] border-r border-[#EBEBEF] align-top">
                  <span className="font-bold text-zinc-900 block">{short}</span>
                  <span className="text-[11px] text-zinc-500">{label}</span>
                </td>
                {periodNumbers.map((period) => {
                  const slot = slotMap.get(`${day}-${period}`);
                  const isSwappedApproved = slot?.swap_status === 'APPROVED';
                  const isSwapPending = slot?.swap_status === 'PENDING';

                  return (
                    <td
                      key={`${day}-${period}`}
                      onClick={() => canManageTimetable && openCellInForm(day, period, slot)}
                      className={`p-2.5 border-r border-[#EBEBEF] align-top min-w-[130px] ${
                        canManageTimetable ? 'cursor-pointer hover:bg-orange-50/40 transition' : ''
                      }`}
                    >
                      {slot ? (
                        <div
                          className={`rounded-xl p-2.5 border space-y-1.5 ${
                            isSwappedApproved
                              ? 'bg-amber-50/80 border-amber-300'
                              : isSwapPending
                              ? 'bg-orange-50/50 border-orange-200'
                              : 'bg-[#FBFBFC] border-[#EBEBEF]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-mono font-bold text-[11px] text-[#1E293B]">
                              {slot.subject_code}
                            </span>
                            {slot.room_no && (
                              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white border border-[#EBEBEF] text-zinc-600">
                                {slot.room_no}
                              </span>
                            )}
                          </div>

                          {slot.subject_name && (
                            <p className="text-[11px] font-medium text-zinc-800 leading-snug line-clamp-2">
                              {slot.subject_name}
                            </p>
                          )}

                          {(slot.start_time || slot.end_time) && (
                            <div className="flex items-center gap-1 text-[10px] font-mono text-zinc-500">
                              <Clock size={10} />
                              <span>
                                {slot.start_time || '—'} – {slot.end_time || '—'}
                              </span>
                            </div>
                          )}

                          {isSwappedApproved ? (
                            <div className="pt-1 border-t border-amber-200/80 space-y-1">
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-[#B45309] text-[10px] font-bold">
                                <ArrowLeftRight size={10} />
                                SWAPPED
                              </span>
                              <p className="text-[11px] font-semibold text-amber-900 truncate">
                                {slot.swapped_faculty_name || slot.swapped_faculty_username}
                              </p>
                              <p className="text-[10px] text-zinc-400 line-through truncate">
                                {slot.faculty_name || slot.faculty_username}
                              </p>
                            </div>
                          ) : (
                            <div className="pt-1 border-t border-[#EBEBEF] space-y-0.5">
                              <p className="text-[11px] font-medium text-zinc-700 truncate">
                                {slot.faculty_name || slot.faculty_username || 'Unassigned'}
                              </p>
                              {isSwapPending && (
                                <span className="inline-block text-[10px] font-semibold text-[#EA580C]">
                                  Swap Pending → {slot.swapped_faculty_name || slot.swapped_faculty_username}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="h-20 rounded-xl border border-dashed border-[#EBEBEF] flex items-center justify-center text-[11px] text-zinc-300">
                          {canManageTimetable ? '+ Assign' : '—'}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
