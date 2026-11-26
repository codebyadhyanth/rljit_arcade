import React, { useState, useEffect, useCallback } from 'react';
import api from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import DbReceiptCard from '../../components/DbReceiptCard';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  MessageSquare,
  RefreshCw,
  Calendar,
  Clock,
  Building2,
  Users,
  ClipboardCheck,
} from 'lucide-react';

function getStatusBadge(status) {
  switch (status) {
    case 'APPROVED':
      return 'bg-emerald-50 text-[#15803D] border-emerald-200';
    case 'PENDING_HOD':
    case 'PENDING_MANAGEMENT':
    case 'PENDING_PRINCIPAL':
      return 'bg-amber-50 text-[#B45309] border-amber-200';
    case 'PARTIALLY_ACCEPTED':
      return 'bg-orange-50 text-[#EA580C] border-orange-200';
    case 'REJECTED':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    default:
      return 'bg-zinc-100 text-zinc-600 border-zinc-200';
  }
}

function formatDateOnly(val) {
  if (!val) return '—';
  const str = String(val);
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? str : d.toLocaleDateString('en-IN');
}

export default function ApprovalQueuePage() {
  const { user } = useAuth();
  const subRoles = Array.isArray(user?.subRoles) ? user.subRoles : [];
  const isSuperAdmin = user?.adminTier === 'SUPER_ADMIN';
  const isHod =
    user?.adminTier === 'HOD_ADMIN' || subRoles.includes('HOD');
  const isManagement =
    user?.sectionCode === 'MGT' || subRoles.includes('MANAGEMENT');
  const isPrincipal =
    user?.sectionCode === 'PRN' ||
    user?.sectionCode === 'PRINCIPAL' ||
    subRoles.includes('PRINCIPAL');

  const canAccessQueue = isSuperAdmin || isHod || isManagement || isPrincipal;
  const userDept = (user?.department || '').trim().toUpperCase();

  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reviewMap, setReviewMap] = useState({});
  const [partialOpen, setPartialOpen] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [lastReceipt, setLastReceipt] = useState(null);
  const [lastMessage, setLastMessage] = useState('');

  const isActionableForUser = useCallback(
    (booking) => {
      if (!booking) return false;
      if (isSuperAdmin) {
        return ['PENDING_HOD', 'PENDING_MANAGEMENT', 'PENDING_PRINCIPAL'].includes(
          booking.status
        );
      }
      if (isHod && booking.status === 'PENDING_HOD') {
        if (!userDept) return false;
        return (booking.department || '').toUpperCase() === userDept;
      }
      if (isManagement && booking.status === 'PENDING_MANAGEMENT') {
        return true;
      }
      if (isPrincipal && booking.status === 'PENDING_PRINCIPAL') {
        return true;
      }
      return false;
    },
    [isSuperAdmin, isHod, isManagement, isPrincipal, userDept]
  );

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/api/v1/venues/bookings');
      setBookings(res.data?.bookings || []);
    } catch (err) {
      setError(
        err.response?.data?.error ||
          err.message ||
          'Failed to fetch venue approval queue.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canAccessQueue) {
      fetchQueue();
    } else {
      setLoading(false);
    }
  }, [canAccessQueue, fetchQueue]);

  const updateRowInput = (bookingId, field, value) => {
    setReviewMap((prev) => ({
      ...prev,
      [bookingId]: {
        remarks: prev[bookingId]?.remarks || '',
        terms: prev[bookingId]?.terms || '',
        [field]: value,
      },
    }));
  };

  const handleReviewAction = async (booking, action) => {
    const rowInput = reviewMap[booking.id] || { remarks: '', terms: '' };
    const remarks = rowInput.remarks.trim();
    const rawTerms = rowInput.terms.trim();

    if (action === 'PARTIAL' && !rawTerms) {
      setPartialOpen((prev) => ({ ...prev, [booking.id]: true }));
      setError(
        `Enter conditional terms for ${booking.booking_code} before issuing Partial Terms.`
      );
      return;
    }

    setBusyId(booking.id);
    setError('');
    setLastReceipt(null);
    setLastMessage('');

    try {
      const termsArray = rawTerms
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

      const payload = {
        action,
        remarks: remarks || undefined,
        ...(action === 'PARTIAL'
          ? {
              terms_and_conditions:
                termsArray.length > 1 ? termsArray : termsArray[0] || rawTerms,
            }
          : {}),
      };

      const res = await api.patch(
        `/api/v1/venues/bookings/${booking.id}/review`,
        payload
      );

      setLastMessage(
        res.data?.message ||
          `Booking ${booking.booking_code} updated (${action}).`
      );
      if (res.data?.dbReceipt) {
        setLastReceipt({
          ...res.data.dbReceipt,
          storedInTables:
            res.data.dbReceipt.storedInTables || res.data.dbReceipt.storedInTable,
        });
      }
      setPartialOpen((prev) => ({ ...prev, [booking.id]: false }));
      await fetchQueue();
    } catch (err) {
      setError(
        err.response?.data?.error ||
          err.response?.data?.message ||
          err.message ||
          'Review action failed.'
      );
    } finally {
      setBusyId(null);
    }
  };

  if (!canAccessQueue) {
    return (
      <div className="bg-white border border-[#EBEBEF] rounded-2xl p-8 text-center space-y-2 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]">
        <ShieldCheck size={28} className="mx-auto text-zinc-400" />
        <h1 className="text-base font-bold text-zinc-900">
          Authority Review Access Required
        </h1>
        <p className="text-xs text-zinc-500 max-w-md mx-auto">
          The Venue Approval Queue is restricted to Department HODs, Management (MGT), Principal (PRN), and Super Admins.
        </p>
      </div>
    );
  }

  const actionableBookings = bookings.filter(isActionableForUser);
  const otherBookings = bookings.filter((b) => !isActionableForUser(b));

  const stageDescription = isSuperAdmin
    ? 'Super Admin Override — All Pending Stages (HOD / Management / Principal)'
    : isHod
      ? `Department HOD Stage — PENDING_HOD (${userDept || 'Department'})`
      : isManagement
        ? 'Management Stage — PENDING_MANAGEMENT'
        : 'Principal Final Clearance Stage — PENDING_PRINCIPAL';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-[#EBEBEF] rounded-2xl p-5 sm:p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-[#B45309] border border-amber-200">
            <ClipboardCheck size={12} /> Multi-Tier Review Engine
          </span>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900">
            Venue Approval Queue
          </h1>
          <p className="text-xs text-zinc-500 mt-1">{stageDescription}</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-3.5 py-2 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs">
            <span className="text-zinc-500">Actionable: </span>
            <strong className="text-[#EA580C] font-mono">
              {actionableBookings.length}
            </strong>
          </div>
          <button
            type="button"
            onClick={fetchQueue}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-[#EBEBEF] bg-white hover:bg-zinc-50 text-xs font-semibold text-zinc-700 transition"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Live Transaction Receipt */}
      {lastMessage && (
        <div className="space-y-3">
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-[#15803D] text-xs font-semibold">
            <CheckCircle2 size={16} className="shrink-0" />
            <span>{lastMessage}</span>
          </div>
          {lastReceipt && (
            <DbReceiptCard
              receipt={lastReceipt}
              title="Approval Decision Persisted to PostgreSQL"
            />
          )}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-800 text-xs"
        >
          <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
          <span className="font-medium">{error}</span>
        </div>
      )}

      {/* Section 1: Action Required */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider">
            Action Required — Your Review Stage ({actionableBookings.length})
          </h2>
        </div>

        {loading ? (
          <div className="bg-white border border-[#EBEBEF] rounded-2xl p-8 text-center text-xs text-zinc-500">
            Loading live queue from PostgreSQL...
          </div>
        ) : actionableBookings.length === 0 ? (
          <div className="bg-white border border-[#EBEBEF] rounded-2xl p-8 text-center space-y-1.5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]">
            <CheckCircle2 size={24} className="mx-auto text-[#15803D]" />
            <p className="text-sm font-semibold text-zinc-900">
              No Pending Requests at Your Review Stage
            </p>
            <p className="text-xs text-zinc-500">
              All bookings currently routed to your authority level have been processed.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {actionableBookings.map((b) => {
              const rowVal = reviewMap[b.id] || { remarks: '', terms: '' };
              const showTermsInput = Boolean(partialOpen[b.id]);
              const isBusy = busyId === b.id;

              return (
                <article
                  key={b.id}
                  className="bg-white border-2 border-[#EA580C]/40 rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] space-y-4"
                >
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold bg-zinc-900 text-white px-2.5 py-0.5 rounded-md">
                          {b.booking_code}
                        </span>
                        <span
                          className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${getStatusBadge(
                            b.status
                          )}`}
                        >
                          {b.status}
                        </span>
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-orange-50 text-[#EA580C] border border-orange-200">
                          Actionable Now
                        </span>
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                          Dept: {b.department}
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-zinc-900">
                        {b.event_title}
                      </h3>
                      <p className="text-xs text-zinc-600">{b.purpose}</p>
                    </div>

                    <div className="text-xs text-zinc-600 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3.5 py-2.5 space-y-1 shrink-0">
                      <div className="font-semibold text-zinc-900 flex items-center gap-1.5">
                        <Building2 size={13} className="text-[#EA580C]" />
                        <span>{b.venue_name}</span>
                      </div>
                      <div className="flex items-center gap-3 font-mono text-[11px]">
                        <span className="inline-flex items-center gap-1">
                          <Calendar size={12} /> {formatDateOnly(b.booking_date)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock size={12} /> {b.start_time || '—'}–{b.end_time || '—'}
                        </span>
                      </div>
                      <div className="text-[11px] flex items-center gap-3">
                        <span className="inline-flex items-center gap-1">
                          <Users size={12} /> {b.expected_headcount} seats
                        </span>
                        <span>Coord: {b.coordinator_username}</span>
                      </div>
                    </div>
                  </div>

                  {/* Action Bar */}
                  <div className="pt-3 border-t border-[#EBEBEF] space-y-3">
                    <div className="flex flex-col md:flex-row gap-3">
                      <input
                        type="text"
                        value={rowVal.remarks}
                        onChange={(e) =>
                          updateRowInput(b.id, 'remarks', e.target.value)
                        }
                        placeholder="Enter review remarks / approval note / rejection reason..."
                        className="flex-1 px-3.5 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 outline-none focus:bg-white focus:border-[#EA580C]"
                      />

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleReviewAction(b, 'APPROVE')}
                          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#15803D] hover:bg-emerald-800 text-white text-xs font-semibold shadow-sm transition disabled:opacity-50"
                        >
                          <CheckCircle2 size={14} />
                          <span>{isBusy ? 'Saving...' : 'Approve'}</span>
                        </button>

                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => {
                            if (showTermsInput && rowVal.terms.trim()) {
                              handleReviewAction(b, 'PARTIAL');
                            } else {
                              setPartialOpen((prev) => ({
                                ...prev,
                                [b.id]: !prev[b.id],
                              }));
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#B45309] hover:bg-amber-800 text-white text-xs font-semibold shadow-sm transition disabled:opacity-50"
                        >
                          <MessageSquare size={14} />
                          <span>
                            {showTermsInput && rowVal.terms.trim()
                              ? 'Send Partial Terms'
                              : 'Partial Terms'}
                          </span>
                        </button>

                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleReviewAction(b, 'REJECT')}
                          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold shadow-sm transition disabled:opacity-50"
                        >
                          <XCircle size={14} />
                          <span>Reject</span>
                        </button>
                      </div>
                    </div>

                    {showTermsInput && (
                      <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 space-y-2">
                        <label className="block text-[11px] font-bold text-[#B45309]">
                          Conditional Terms & Conditions (one condition per line) *
                        </label>
                        <textarea
                          rows={2}
                          value={rowVal.terms}
                          onChange={(e) =>
                            updateRowInput(b.id, 'terms', e.target.value)
                          }
                          placeholder="e.g. Restrict audio volume after 16:00&#10;Max headcount capped at 120"
                          className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-xs text-zinc-900 outline-none focus:border-[#EA580C]"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setPartialOpen((prev) => ({ ...prev, [b.id]: false }))
                            }
                            className="px-3 py-1.5 rounded-lg border border-[#EBEBEF] bg-white text-xs font-semibold text-zinc-600"
                          >
                            Hide
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleReviewAction(b, 'PARTIAL')}
                            className="px-3.5 py-1.5 rounded-lg bg-[#B45309] hover:bg-amber-800 text-white text-xs font-semibold disabled:opacity-50"
                          >
                            Submit Conditional Terms
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Section 2: Other Bookings in Pipeline */}
      {otherBookings.length > 0 && (
        <section className="bg-white border border-[#EBEBEF] rounded-2xl shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#EBEBEF] flex items-center justify-between">
            <h2 className="text-sm font-bold text-zinc-900">
              Other Visible Campus Bookings ({otherBookings.length})
            </h2>
            <span className="text-[11px] text-zinc-500">
              At other stages or completed
            </span>
          </div>
          <div className="divide-y divide-[#EBEBEF]">
            {otherBookings.map((b) => (
              <div
                key={b.id}
                className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="font-mono font-bold text-zinc-900">
                    {b.booking_code}
                  </span>
                  <span className="font-semibold text-zinc-800">
                    {b.event_title}
                  </span>
                  <span className="text-zinc-500">
                    · {b.venue_name} · {formatDateOnly(b.booking_date)} (
                    {b.start_time || '—'}–{b.end_time || '—'})
                  </span>
                </div>
                <span
                  className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${getStatusBadge(
                    b.status
                  )}`}
                >
                  {b.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
