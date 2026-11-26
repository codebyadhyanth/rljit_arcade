import React, { useEffect, useMemo, useState } from 'react';
import api from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import DbReceiptCard from '../../components/DbReceiptCard';
import {
  ArrowLeftRight,
  Calendar,
  CheckCircle2,
  RefreshCw,
  Search,
  ShieldAlert,
  XCircle,
} from 'lucide-react';

const DAY_NAMES = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

function normalizeReceipt(receipt) {
  if (!receipt) return null;
  return {
    ...receipt,
    storedInTables: receipt.storedInTables || receipt.storedInTable,
  };
}

export default function ClassSwapsPage() {
  const { user } = useAuth();
  const currentUserId = user?.userId || user?.id;
  const isSuperAdmin = user?.adminTier === 'SUPER_ADMIN';
  const isHod =
    user?.adminTier === 'HOD_ADMIN' ||
    (Array.isArray(user?.subRoles) && user.subRoles.includes('HOD'));

  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [busySlotId, setBusySlotId] = useState(null);

  // Selected slot to initiate a swap request
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [swapDate, setSwapDate] = useState(new Date().toISOString().slice(0, 10));
  const [targetFacultyId, setTargetFacultyId] = useState('');
  const [searchQuery, setSearchQuery] = useState(user?.department || 'RLFAC');
  const [facultyCandidates, setFacultyCandidates] = useState([]);
  const [searchingFac, setSearchingFac] = useState(false);
  const [facSearched, setFacSearched] = useState(false);

  const loadSlots = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (!isSuperAdmin) {
        if (isHod && user?.department) {
          params.set('department', user.department);
        } else if (currentUserId) {
          params.set('facultyId', currentUserId);
        } else if (user?.department) {
          params.set('department', user.department);
        }
      }

      const qs = params.toString();
      const res = await api.get(`/api/v1/timetable${qs ? `?${qs}` : ''}`);
      setSlots(res.data?.slots || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load assigned timetable slots');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSlots();
  }, [currentUserId, user?.department]);

  const searchFaculty = async (qOverride = null, excludeFacultyId = selectedSlot?.faculty_id) => {
    const q = (qOverride ?? searchQuery).trim();
    if (!q) return;
    setSearchingFac(true);
    try {
      const res = await api.get(`/api/v1/users/search?q=${encodeURIComponent(q)}`);
      const candidates = (res.data?.results || []).filter(
        (u) => u.baseRole === 'FACULTY' && u.id !== excludeFacultyId
      );
      setFacultyCandidates(candidates);
      setFacSearched(true);
    } catch {
      setFacultyCandidates([]);
      setFacSearched(true);
    } finally {
      setSearchingFac(false);
    }
  };

  const pendingApprovals = useMemo(
    () =>
      slots.filter(
        (s) =>
          s.swap_status === 'PENDING' &&
          (s.swapped_faculty_id === currentUserId ||
            isSuperAdmin ||
            (isHod && String(s.department).toUpperCase() === String(user?.department || '').toUpperCase()))
      ),
    [slots, currentUserId, isSuperAdmin, isHod, user?.department]
  );

  const handleRequestSwap = async (e) => {
    e.preventDefault();
    if (!selectedSlot || !targetFacultyId) return;
    setBusySlotId(selectedSlot.id);
    setError('');
    setActionMessage('');
    setReceipt(null);

    try {
      const res = await api.patch(`/api/v1/timetable/${selectedSlot.id}/swap`, {
        action: 'REQUEST',
        swapped_faculty_id: targetFacultyId,
        swap_date: swapDate,
      });
      setActionMessage(res.data?.message || 'Class swap request submitted');
      setReceipt(normalizeReceipt(res.data?.dbReceipt));
      setSelectedSlot(null);
      setTargetFacultyId('');
      await loadSlots();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to submit swap request');
    } finally {
      setBusySlotId(null);
    }
  };

  const handleSwapDecision = async (slotId, action) => {
    setBusySlotId(slotId);
    setError('');
    setActionMessage('');
    setReceipt(null);

    try {
      const res = await api.patch(`/api/v1/timetable/${slotId}/swap`, { action });
      setActionMessage(res.data?.message || `Class swap ${action.toLowerCase()}ed`);
      setReceipt(normalizeReceipt(res.data?.dbReceipt));
      await loadSlots();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to respond to swap request');
    } finally {
      setBusySlotId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-white border border-[#EBEBEF] rounded-2xl p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
            <ArrowLeftRight size={19} className="text-[#EA580C]" />
            <span>Class Swaps & Exchange Desk</span>
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Request faculty substitution on scheduled periods and approve or reject incoming swap requests.
          </p>
        </div>
        <button
          type="button"
          onClick={loadSlots}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#FBFBFC] hover:bg-zinc-100 border border-[#EBEBEF] text-zinc-700 text-xs font-semibold transition"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          <span>Refresh Slots</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-800 text-xs">
          <ShieldAlert size={16} className="text-rose-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {actionMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-emerald-800 text-xs font-semibold">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{actionMessage}</span>
        </div>
      )}

      {receipt && <DbReceiptCard receipt={receipt} title="Class Swap Atomic Receipt" />}

      {/* Pending Incoming Swap Requests */}
      <section className="bg-white border border-[#EBEBEF] rounded-2xl p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] space-y-4">
        <div className="flex items-center justify-between border-b border-[#EBEBEF] pb-3">
          <div>
            <h2 className="text-sm font-bold text-zinc-900">
              Pending Swap Requests ({pendingApprovals.length})
            </h2>
            <p className="text-xs text-zinc-500">
              Incoming class handover requests requiring your confirmation
            </p>
          </div>
        </div>

        {pendingApprovals.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingApprovals.map((s) => (
              <div
                key={s.id}
                className="p-4 rounded-xl border border-amber-200 bg-amber-50/40 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-mono text-xs font-bold text-zinc-900">
                      {s.subject_code} {s.subject_name ? `· ${s.subject_name}` : ''}
                    </span>
                    <p className="text-xs text-zinc-600 mt-0.5">
                      {s.department} · Sem {s.semester} · Sec {s.section} ·{' '}
                      {DAY_NAMES[s.day_of_week] || `Day ${s.day_of_week}`} P{s.period_no}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-[#B45309] border border-amber-300">
                    PENDING
                  </span>
                </div>

                <div className="text-xs text-zinc-700 space-y-1 bg-white p-3 rounded-lg border border-[#EBEBEF]">
                  <div>
                    Original Faculty:{' '}
                    <strong>{s.faculty_name || s.faculty_username || '—'}</strong>
                  </div>
                  <div>
                    Replacement Faculty:{' '}
                    <strong className="text-[#EA580C]">
                      {s.swapped_faculty_name || s.swapped_faculty_username || '—'}
                    </strong>
                  </div>
                  {s.swap_date && (
                    <div className="font-mono text-[11px] text-zinc-500">
                      Swap Date: {String(s.swap_date).slice(0, 10)}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busySlotId === s.id}
                    onClick={() => handleSwapDecision(s.id, 'APPROVE')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#15803D] hover:bg-emerald-800 text-white text-xs font-semibold transition disabled:opacity-50"
                  >
                    <CheckCircle2 size={14} />
                    <span>Approve Swap</span>
                  </button>
                  <button
                    type="button"
                    disabled={busySlotId === s.id}
                    onClick={() => handleSwapDecision(s.id, 'REJECT')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold transition disabled:opacity-50"
                  >
                    <XCircle size={14} />
                    <span>Reject Swap</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-500">
            No pending incoming class swap requests awaiting your review.
          </p>
        )}
      </section>

      {/* Swap Request Modal / Panel */}
      {selectedSlot && (
        <section className="bg-white border-2 border-[#EA580C]/40 rounded-2xl p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] space-y-4">
          <div className="flex items-start justify-between gap-2 border-b border-[#EBEBEF] pb-3">
            <div>
              <h2 className="text-sm font-bold text-zinc-900">
                Request Class Swap · {selectedSlot.subject_code}
              </h2>
              <p className="text-xs text-zinc-500">
                {selectedSlot.department} Sem {selectedSlot.semester} Sec {selectedSlot.section} ·{' '}
                {DAY_NAMES[selectedSlot.day_of_week]} Period {selectedSlot.period_no}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedSlot(null)}
              className="text-xs font-semibold text-zinc-500 hover:text-zinc-900"
            >
              Cancel
            </button>
          </div>

          <form onSubmit={handleRequestSwap} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Swap Date
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={swapDate}
                    onChange={(e) => setSwapDate(e.target.value)}
                    required
                    className="w-full px-3 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900"
                  />
                </div>
              </div>

              <div className="sm:col-span-2 space-y-1">
                <label className="block text-xs font-semibold text-zinc-700">
                  Search Target Faculty (`/api/v1/users/search`)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search ID/USN, Email, or Phone"
                    className="flex-1 px-3 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900"
                  />
                  <button
                    type="button"
                    onClick={() => searchFaculty(null, selectedSlot?.faculty_id)}
                    disabled={searchingFac}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 border border-[#EBEBEF] text-xs font-semibold text-zinc-800"
                  >
                    <Search size={13} />
                    <span>{searchingFac ? 'Searching...' : 'Search'}</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Select Replacement Faculty
                </label>
                <select
                  value={targetFacultyId}
                  onChange={(e) => setTargetFacultyId(e.target.value)}
                  required
                  className="w-full px-3 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900"
                >
                  <option value="">
                    {searchingFac
                      ? 'Searching faculty candidates...'
                      : facultyCandidates.length === 0 && facSearched
                      ? '-- No matching faculty candidates --'
                      : '-- Choose faculty candidate --'}
                  </option>
                  {facultyCandidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName} ({c.username}) · {c.department || 'FAC'}
                    </option>
                  ))}
                </select>
                {!searchingFac && facSearched && facultyCandidates.length === 0 && (
                  <p className="text-[11px] text-amber-700 mt-1.5">
                    No matching faculty candidates found for &quot;{searchQuery.trim()}&quot;. Try searching by name, faculty ID, or department code.
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={busySlotId === selectedSlot.id || !targetFacultyId}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#121214] hover:bg-black text-white text-xs font-semibold rounded-xl transition disabled:opacity-50"
              >
                <Calendar size={14} />
                <span>{busySlotId === selectedSlot.id ? 'Submitting...' : 'Submit Swap Request'}</span>
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Faculty's Assigned Slots Table */}
      <section className="bg-white border border-[#EBEBEF] rounded-2xl p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] space-y-4">
        <div>
          <h2 className="text-sm font-bold text-zinc-900">
            {isSuperAdmin
              ? 'All Institutional Timetable Slots'
              : isHod
              ? `Department Timetable Slots (${user?.department})`
              : 'My Assigned Timetable Slots'}
          </h2>
          <p className="text-xs text-zinc-500">
            Select any slot assigned to you to initiate a class swap request
          </p>
        </div>

        {loading ? (
          <p className="text-xs text-zinc-500">Loading timetable slots...</p>
        ) : slots.length > 0 ? (
          <div className="overflow-x-auto border border-[#EBEBEF] rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAFAFA] border-b border-[#EBEBEF] text-zinc-500 font-semibold text-[11px]">
                <tr>
                  <th className="p-3">Class</th>
                  <th className="p-3">Day & Period</th>
                  <th className="p-3">Subject</th>
                  <th className="p-3">Assigned Faculty</th>
                  <th className="p-3">Room</th>
                  <th className="p-3">Swap Status</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EBEBEF]">
                {slots.map((s) => {
                  const canRequest =
                    s.faculty_id === currentUserId ||
                    isSuperAdmin ||
                    (isHod && String(s.department).toUpperCase() === String(user?.department || '').toUpperCase());

                  return (
                    <tr key={s.id} className="hover:bg-[#FBFBFC]">
                      <td className="p-3 font-semibold text-zinc-900 whitespace-nowrap">
                        {s.department} · Sem {s.semester} · {s.section}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span className="font-medium text-zinc-800">
                          {DAY_NAMES[s.day_of_week] || `Day ${s.day_of_week}`}
                        </span>{' '}
                        <span className="font-mono text-zinc-500">P{s.period_no}</span>
                        {s.start_time && (
                          <span className="block font-mono text-[10px] text-zinc-400">
                            {s.start_time} – {s.end_time}
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <span className="font-mono font-bold text-[#1E293B]">{s.subject_code}</span>
                        {s.subject_name && (
                          <span className="block text-[11px] text-zinc-500">{s.subject_name}</span>
                        )}
                      </td>
                      <td className="p-3 text-zinc-700">
                        {s.faculty_name || s.faculty_username || 'Unassigned'}
                      </td>
                      <td className="p-3 font-mono text-zinc-600">{s.room_no || '—'}</td>
                      <td className="p-3">
                        {s.swap_status ? (
                          <div className="space-y-0.5">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                s.swap_status === 'APPROVED'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : s.swap_status === 'PENDING'
                                  ? 'bg-amber-50 text-[#B45309] border-amber-200'
                                  : 'bg-rose-50 text-rose-700 border-rose-200'
                              }`}
                            >
                              {s.swap_status}
                            </span>
                            {s.swapped_faculty_name && (
                              <span className="block text-[10px] text-zinc-500">
                                → {s.swapped_faculty_name}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-zinc-400">Normal</span>
                        )}
                      </td>
                      <td className="p-3 text-right whitespace-nowrap">
                        {canRequest && (
                          <button
                            type="button"
                            onClick={() => {
                              const q = s.department || user?.department || 'RLFAC';
                              setSelectedSlot(s);
                              setTargetFacultyId('');
                              setSearchQuery(q);
                              setFacSearched(false);
                              searchFaculty(q, s.faculty_id);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#121214] hover:bg-black text-white text-[11px] font-semibold transition"
                          >
                            <ArrowLeftRight size={12} />
                            <span>Request Swap</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-zinc-500">
            No timetable slots found for your account or department scope.
          </p>
        )}
      </section>
    </div>
  );
}
