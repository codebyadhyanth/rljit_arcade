import React, { useState, useEffect, useCallback } from 'react';
import api from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import {
  Calendar,
  Clock,
  Building2,
  FileText,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  XCircle,
  X,
  Users,
  ShieldCheck,
  MessageSquare,
  Ban,
  History,
  ArrowRightLeft,
} from 'lucide-react';

const STATUS_FILTERS = [
  'ALL',
  'PENDING_HOD',
  'PENDING_MANAGEMENT',
  'PENDING_PRINCIPAL',
  'PARTIALLY_ACCEPTED',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
];

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
    case 'CANCELLED':
    default:
      return 'bg-zinc-100 text-zinc-600 border-zinc-200';
  }
}

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatDateOnly(value) {
  if (!value) return '—';
  const str = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? str : d.toLocaleDateString('en-IN');
}

export default function MyBookingsPage({ onNavigate }) {
  const { user } = useAuth();
  const currentUserId = user?.userId || user?.id;
  const isSuperAdmin = user?.adminTier === 'SUPER_ADMIN';
  const isCoordinatorActor =
    isSuperAdmin || user?.baseRole === 'FACULTY' || user?.baseRole === 'ADMIN';

  const [bookings, setBookings] = useState([]);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionBanner, setActionBanner] = useState('');

  // Audit Trail Modal State
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  // Coordinator Negotiation State
  const [coordMessage, setCoordMessage] = useState('');
  const [coordBusy, setCoordBusy] = useState(false);

  // Cancel Booking State
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState('');

  // Transfer Response State
  const [transferNote, setTransferNote] = useState('');
  const [transferBusy, setTransferBusy] = useState(false);

  // Change Venue Modal State
  const [changeTarget, setChangeTarget] = useState(null);
  const [changeVenues, setChangeVenues] = useState([]);
  const [changeVenuesLoading, setChangeVenuesLoading] = useState(false);
  const [changeForm, setChangeForm] = useState({
    new_venue_id: '',
    booking_date: '',
    start_time: '',
    end_time: '',
  });
  const [changeBusy, setChangeBusy] = useState(false);
  const [changeError, setChangeError] = useState('');
  const [changeConflict, setChangeConflict] = useState(null);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/api/v1/venues/bookings');
      setBookings(res.data?.bookings || []);
    } catch (err) {
      setError(
        err.response?.data?.error || err.message || 'Failed to load venue bookings.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  const inspectAuditTrail = async (bookingId) => {
    setSelectedId(bookingId);
    setDetail(null);
    setDetailError('');
    setDetailLoading(true);
    setCoordMessage('');
    setActionBanner('');
    try {
      const res = await api.get(`/api/v1/venues/bookings/${bookingId}`);
      setDetail(res.data?.booking || null);
    } catch (err) {
      setDetailError(
        err.response?.data?.error || err.message || 'Failed to fetch audit trail.'
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCoordinatorResponse = async (agreeToTerms) => {
    if (!detail) return;
    setCoordBusy(true);
    setDetailError('');
    setActionBanner('');
    try {
      const res = await api.patch(
        `/api/v1/venues/bookings/${detail.id}/coordinator-response`,
        {
          agree_to_terms: agreeToTerms,
          coordinator_message:
            coordMessage.trim() ||
            (agreeToTerms
              ? 'Agreed to conditional terms'
              : 'Proposed counter-terms for review'),
        }
      );
      setActionBanner(res.data?.message || 'Coordinator response recorded.');
      await Promise.all([fetchBookings(), inspectAuditTrail(detail.id)]);
    } catch (err) {
      setDetailError(
        err.response?.data?.error ||
          err.response?.data?.message ||
          err.message ||
          'Failed to submit coordinator response.'
      );
    } finally {
      setCoordBusy(false);
    }
  };

  const handleTransferDecision = async (transferId, action) => {
    if (!detail) return;
    setTransferBusy(true);
    setDetailError('');
    setActionBanner('');
    try {
      const res = await api.patch(
        `/api/v1/venues/transfer-requests/${transferId}/respond`,
        {
          action,
          response_message:
            transferNote.trim() ||
            (action === 'APPROVE'
              ? 'Handover approved by coordinator'
              : 'Handover declined by coordinator'),
        }
      );
      setActionBanner(res.data?.message || `Transfer request ${action.toLowerCase()}ed.`);
      await Promise.all([fetchBookings(), inspectAuditTrail(detail.id)]);
    } catch (err) {
      setDetailError(
        err.response?.data?.error ||
          err.message ||
          'Failed to respond to transfer request.'
      );
    } finally {
      setTransferBusy(false);
    }
  };

  const handleCancelSubmit = async (e) => {
    e.preventDefault();
    if (!cancelTarget) return;
    setCancelBusy(true);
    setCancelError('');
    setError('');
    setDetailError('');
    setActionBanner('');
    try {
      const res = await api.post(
        `/api/v1/venues/bookings/${cancelTarget.id}/cancel`,
        {
          cancellation_reason:
            cancelReason.trim() || 'Cancelled by requester via web portal',
        }
      );
      setActionBanner(
        res.data?.message ||
          'Booking cancelled. Slot released and 24-hour venue cooldown active.'
      );
      const cancelledId = cancelTarget.id;
      setCancelTarget(null);
      setCancelReason('');
      setCancelError('');
      await fetchBookings();
      if (selectedId === cancelledId) {
        await inspectAuditTrail(cancelledId);
      }
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        'Failed to cancel booking.';
      setCancelError(msg);
    } finally {
      setCancelBusy(false);
    }
  };

  const filteredBookings =
    statusFilter === 'ALL'
      ? bookings
      : bookings.filter((b) => b.status === statusFilter);

  const isDetailCoordinator = Boolean(
    detail && (isSuperAdmin || (currentUserId && detail.coordinator?.id === currentUserId))
  );
  const isDetailInitiator = Boolean(
    detail && (isSuperAdmin || (currentUserId && detail.initiator?.id === currentUserId))
  );

  const canChangeVenueFor = (bookingObj) => {
    if (!bookingObj) return false;
    if (['CANCELLED', 'REJECTED'].includes(bookingObj.status)) return false;
    const coordId = bookingObj.coordinator_id || bookingObj.coordinator?.id;
    const isCoordOrSuper = isSuperAdmin || (isCoordinatorActor && currentUserId && coordId === currentUserId);
    if (!isCoordOrSuper) return false;
    const rawStart = bookingObj.event_start_time || bookingObj.event?.start_time;
    if (rawStart) {
      const startMs = new Date(rawStart).getTime();
      if (!Number.isNaN(startMs) && startMs <= Date.now()) return false;
    }
    return true;
  };

  const fetchAvailableReplacementVenues = useCallback(async (dateStr, startStr, endStr) => {
    if (!dateStr || !startStr || !endStr) return;
    setChangeVenuesLoading(true);
    setChangeError('');
    try {
      const startIso = `${dateStr}T${startStr.slice(0, 5)}:00+05:30`;
      const endIso = `${dateStr}T${endStr.slice(0, 5)}:00+05:30`;
      const params = new URLSearchParams({ start_time: startIso, end_time: endIso });
      const res = await api.get(`/api/v1/venues/availability?${params.toString()}`);
      setChangeVenues(res.data?.venues || []);
    } catch (err) {
      setChangeError(
        err.response?.data?.error || err.message || 'Failed to check free venues.'
      );
    } finally {
      setChangeVenuesLoading(false);
    }
  }, []);

  const openChangeVenueModal = (bookingObj) => {
    const normalized = {
      id: bookingObj.id,
      booking_code: bookingObj.booking_code,
      event_title: bookingObj.event_title || bookingObj.event?.title,
      expected_headcount:
        bookingObj.expected_headcount || bookingObj.event?.expected_headcount || 1,
      venue_id: bookingObj.venue_id || bookingObj.venue?.id,
      venue_name: bookingObj.venue_name || bookingObj.venue?.name,
      booking_date: formatDateOnly(
        bookingObj.booking_date || bookingObj.event?.booking_date
      ),
      start_time:
        bookingObj.start_time || bookingObj.event?.slot_start_time || '09:00',
      end_time:
        bookingObj.end_time || bookingObj.event?.slot_end_time || '10:00',
    };
    setChangeTarget(normalized);
    setChangeForm({
      new_venue_id: '',
      booking_date: normalized.booking_date,
      start_time: normalized.start_time,
      end_time: normalized.end_time,
    });
    setChangeError('');
    setChangeConflict(null);
    fetchAvailableReplacementVenues(
      normalized.booking_date,
      normalized.start_time,
      normalized.end_time
    );
  };

  const handleChangeVenueSubmit = async (e) => {
    e.preventDefault();
    if (!changeTarget || !changeForm.new_venue_id) return;

    setChangeBusy(true);
    setChangeError('');
    setChangeConflict(null);
    setActionBanner('');
    try {
      const payload = {
        new_venue_id: changeForm.new_venue_id,
      };
      if (changeForm.booking_date && changeForm.start_time && changeForm.end_time) {
        payload.new_start_time = `${changeForm.booking_date}T${changeForm.start_time.slice(0, 5)}:00+05:30`;
        payload.new_end_time = `${changeForm.booking_date}T${changeForm.end_time.slice(0, 5)}:00+05:30`;
      }
      const res = await api.patch(
        `/api/v1/venues/bookings/${changeTarget.id}/change-venue`,
        payload
      );
      setActionBanner(
        res.data?.message ||
          'Venue changed successfully. Approval hierarchy reset to PENDING_HOD.'
      );
      const changedId = changeTarget.id;
      setChangeTarget(null);
      await fetchBookings();
      if (selectedId === changedId) {
        await inspectAuditTrail(changedId);
      }
    } catch (err) {
      if (err.response?.status === 409) {
        const data = err.response.data || {};
        setChangeConflict({
          message: data.message || 'Place already occupied... kindly look for another one.',
          current_booking: data.current_booking || null,
        });
      } else {
        setChangeError(
          err.response?.data?.error || err.message || 'Failed to change venue.'
        );
      }
    } finally {
      setChangeBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-white border border-[#EBEBEF] rounded-2xl p-5 sm:p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-orange-50 text-[#EA580C] border border-orange-200">
              <FileText size={12} /> Booking Lifecycle
            </span>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900">
              My Venue Bookings & Audit Trails
            </h1>
            <p className="text-xs text-zinc-500 mt-1">
              Track live multi-tier approval status (HOD → Management → Principal), inspect chronological audit logs, negotiate conditional terms, or cancel slots.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('venue-catalog')}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#EA580C] hover:bg-[#C2410C] text-white text-xs font-semibold shadow-sm transition"
              >
                <Building2 size={14} />
                <span>Browse Venue Catalog</span>
              </button>
            )}
            <button
              type="button"
              onClick={fetchBookings}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-[#EBEBEF] bg-white hover:bg-zinc-50 text-xs font-semibold text-zinc-700 transition"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Status Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pt-2 border-t border-[#EBEBEF]">
          {STATUS_FILTERS.map((st) => {
            const count =
              st === 'ALL'
                ? bookings.length
                : bookings.filter((b) => b.status === st).length;
            const active = statusFilter === st;
            return (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap border transition ${
                  active
                    ? 'bg-[#1E293B] text-white border-[#1E293B]'
                    : 'bg-[#F8FAFC] text-zinc-600 border-[#E2E8F0] hover:bg-zinc-100'
                }`}
              >
                {st.replace(/_/g, ' ')} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {actionBanner && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-[#15803D] text-xs font-semibold">
          <CheckCircle2 size={16} className="shrink-0" />
          <span>{actionBanner}</span>
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

      {/* Bookings List */}
      <div className="bg-white border border-[#EBEBEF] rounded-2xl shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-zinc-500">
            Loading live bookings from PostgreSQL...
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Calendar size={28} className="mx-auto text-zinc-400" />
            <p className="text-sm font-semibold text-zinc-900">
              No Venue Bookings Found
            </p>
            <p className="text-xs text-zinc-500">
              {statusFilter === 'ALL'
                ? 'No bookings are currently linked to your account scope.'
                : `No bookings match the ${statusFilter} filter.`}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#EBEBEF]">
            {filteredBookings.map((b) => {
              const canCancel =
                !['CANCELLED', 'REJECTED'].includes(b.status) &&
                (isSuperAdmin ||
                  b.initiator_id === currentUserId ||
                  b.coordinator_id === currentUserId);

              return (
                <div
                  key={b.id}
                  className="p-5 hover:bg-[#FBFBFC] transition flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
                >
                  <div className="space-y-2 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-zinc-900 bg-zinc-100 border border-[#E2E8F0] px-2.5 py-0.5 rounded-md">
                        {b.booking_code}
                      </span>
                      <span
                        className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${getStatusBadge(
                          b.status
                        )}`}
                      >
                        {b.status}
                      </span>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                        Dept: {b.department}
                      </span>
                    </div>

                    <h2 className="text-base font-bold text-zinc-900 truncate">
                      {b.event_title}
                    </h2>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-600">
                      <span className="inline-flex items-center gap-1 font-medium text-zinc-800">
                        <Building2 size={13} className="text-[#EA580C]" />
                        {b.venue_name}
                        {b.venue_code ? ` (${b.venue_code})` : ''}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Calendar size={13} className="text-zinc-400" />
                        {formatDateOnly(b.booking_date)}
                      </span>
                      <span className="inline-flex items-center gap-1 font-mono">
                        <Clock size={13} className="text-zinc-400" />
                        {b.start_time || '—'} – {b.end_time || '—'}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Users size={13} className="text-zinc-400" />
                        {b.expected_headcount} attendees
                      </span>
                    </div>

                    {b.status === 'PARTIALLY_ACCEPTED' &&
                      b.active_terms_and_conditions && (
                        <div className="p-2.5 bg-orange-50/70 border border-orange-200 rounded-xl text-xs text-orange-900">
                          <strong>Conditional Terms Pending Negotiation:</strong>{' '}
                          {Array.isArray(b.active_terms_and_conditions.terms)
                            ? b.active_terms_and_conditions.terms.join(' · ')
                            : b.active_terms_and_conditions.reason || 'Inspect audit trail'}
                        </div>
                      )}

                    {b.rejection_reason && b.status === 'REJECTED' && (
                      <p className="text-xs text-rose-700">
                        <strong>Rejection Reason:</strong> {b.rejection_reason}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => inspectAuditTrail(b.id)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#141E2B] hover:bg-slate-800 text-white text-xs font-semibold transition"
                    >
                      <History size={14} />
                      <span>Inspect Audit Trail</span>
                    </button>

                    {canChangeVenueFor(b) && (
                      <button
                        type="button"
                        onClick={() => openChangeVenueModal(b)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#EBEBEF] bg-white hover:bg-zinc-50 text-zinc-800 text-xs font-semibold transition"
                      >
                        <ArrowRightLeft size={14} className="text-[#EA580C]" />
                        <span>Change Venue</span>
                      </button>
                    )}

                    {canCancel && (
                      <button
                        type="button"
                        onClick={() => {
                          setCancelTarget(b);
                          setCancelReason('');
                          setCancelError('');
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold transition"
                      >
                        <Ban size={14} />
                        <span>Cancel Booking</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── AUDIT TRAIL MODAL ─── */}
      {selectedId && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] flex items-center justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label="Booking Audit Trail"
        >
          <div className="bg-white border border-[#EBEBEF] rounded-2xl w-full max-w-3xl shadow-xl overflow-hidden my-auto">
            <div className="bg-[#1E293B] text-white px-6 py-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-orange-300 font-semibold">
                  PostgreSQL Booking Audit Trail
                </p>
                <h2 className="text-base font-bold mt-0.5">
                  {detail?.booking_code || 'Loading Booking Details...'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedId(null);
                  setDetail(null);
                }}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition"
                aria-label="Close audit trail"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
              {detailError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2">
                  <AlertCircle size={15} className="text-rose-600 shrink-0 mt-0.5" />
                  <span>{detailError}</span>
                </div>
              )}

              {detailLoading ? (
                <div className="py-10 text-center text-xs text-zinc-500">
                  Loading audit logs and decrypted participant records...
                </div>
              ) : (
                detail && (
                  <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3.5">
                        <span className="text-[10px] uppercase font-semibold text-zinc-500 block">
                          Current Status
                        </span>
                        <span
                          className={`inline-block mt-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${getStatusBadge(
                            detail.status
                          )}`}
                        >
                          {detail.status}
                        </span>
                      </div>

                      <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3.5">
                        <span className="text-[10px] uppercase font-semibold text-zinc-500 block">
                          Venue & Schedule
                        </span>
                        <p className="text-xs font-bold text-zinc-900 mt-1">
                          {detail.venue?.name}
                        </p>
                        <p className="text-[11px] font-mono text-zinc-600 mt-0.5">
                          {formatDateOnly(detail.event?.booking_date)} ·{' '}
                          {detail.event?.slot_start_time}–{detail.event?.slot_end_time} (
                          {detail.event?.duration_minutes}m)
                        </p>
                      </div>

                      <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3.5">
                        <span className="text-[10px] uppercase font-semibold text-zinc-500 block">
                          Faculty Coordinator
                        </span>
                        <p className="text-xs font-bold text-zinc-900 mt-1">
                          {detail.coordinator?.name || detail.coordinator?.username}
                        </p>
                        <p className="text-[11px] font-mono text-zinc-500 mt-0.5">
                          {detail.coordinator?.email || detail.coordinator?.username}
                        </p>
                      </div>
                    </div>

                    {/* Multi-Tier Approver Timestamps */}
                    <div className="bg-white border border-[#EBEBEF] rounded-xl p-4 space-y-2.5">
                      <h3 className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                        <ShieldCheck size={15} className="text-[#15803D]" />
                        <span>Multi-Tier Approval Checkpoints</span>
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        {[
                          { label: '1. HOD Review', data: detail.approvals?.hod },
                          {
                            label: '2. Management Review',
                            data: detail.approvals?.management,
                          },
                          {
                            label: '3. Principal Clearance',
                            data: detail.approvals?.principal,
                          },
                        ].map((stage) => (
                          <div
                            key={stage.label}
                            className="p-3 rounded-xl bg-[#FBFBFC] border border-[#EBEBEF]"
                          >
                            <span className="text-[11px] font-semibold text-zinc-700 block">
                              {stage.label}
                            </span>
                            {stage.data?.approved_at ? (
                              <>
                                <span className="text-[11px] font-semibold text-[#15803D] block mt-1">
                                  Approved ({stage.data.username})
                                </span>
                                <span className="text-[10px] text-zinc-500 block">
                                  {formatDateTime(stage.data.approved_at)}
                                </span>
                              </>
                            ) : (
                              <span className="text-[11px] text-zinc-400 block mt-1">
                                Pending / Not Recorded
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Active Terms & Coordinator Negotiation */}
                    {detail.active_terms_and_conditions && (
                      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3 text-xs">
                        <div className="font-bold text-[#B45309] flex items-center gap-1.5">
                          <MessageSquare size={15} />
                          <span>
                            Conditional Partial Acceptance Terms (Stage:{' '}
                            {detail.active_terms_and_conditions.stage || 'HOD'})
                          </span>
                        </div>

                        {Array.isArray(detail.active_terms_and_conditions.terms) && (
                          <ul className="list-disc pl-5 space-y-1 text-amber-950">
                            {detail.active_terms_and_conditions.terms.map((t, i) => (
                              <li key={i}>{String(t)}</li>
                            ))}
                          </ul>
                        )}

                        {detail.active_terms_and_conditions.reason && (
                          <p className="text-amber-900">
                            <strong>Remarks:</strong>{' '}
                            {detail.active_terms_and_conditions.reason}
                          </p>
                        )}

                        {detail.status === 'PARTIALLY_ACCEPTED' &&
                          (isDetailCoordinator ? (
                            <div className="bg-white border border-amber-200 rounded-xl p-3.5 space-y-3">
                              <label className="block text-[11px] font-semibold text-zinc-700">
                                Coordinator Negotiation Response / Counter Message
                              </label>
                              <textarea
                                rows={2}
                                value={coordMessage}
                                onChange={(e) => setCoordMessage(e.target.value)}
                                placeholder="Enter acceptance note or counter-proposal terms..."
                                className="w-full px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 outline-none focus:border-[#EA580C]"
                              />
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={coordBusy}
                                  onClick={() => handleCoordinatorResponse(true)}
                                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#15803D] hover:bg-emerald-800 text-white text-xs font-semibold disabled:opacity-50"
                                >
                                  <CheckCircle2 size={14} />
                                  <span>Agree & Escalate to Principal</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={coordBusy}
                                  onClick={() => handleCoordinatorResponse(false)}
                                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#B45309] hover:bg-amber-800 text-white text-xs font-semibold disabled:opacity-50"
                                >
                                  <MessageSquare size={14} />
                                  <span>Submit Counter Proposal</span>
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-[11px] text-amber-800">
                              Awaiting response from assigned Faculty Coordinator (
                              {detail.coordinator?.name || detail.coordinator?.username}).
                            </p>
                          ))}
                      </div>
                    )}

                    {/* Transfer Requests */}
                    {Array.isArray(detail.transfer_requests) &&
                      detail.transfer_requests.length > 0 && (
                        <div className="bg-white border border-[#EBEBEF] rounded-xl p-4 space-y-3">
                          <h3 className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                            <ArrowRightLeft size={15} className="text-[#EA580C]" />
                            <span>Venue Handover / Transfer Requests</span>
                          </h3>
                          {detail.transfer_requests.map((tr) => (
                            <div
                              key={tr.id}
                              className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-xs space-y-2"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-semibold text-zinc-900">
                                  {tr.new_event_title} (from {tr.requester_username})
                                </span>
                                <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-200 text-zinc-800">
                                  {tr.status}
                                </span>
                              </div>
                              <p className="text-zinc-600">{tr.urgency_reason}</p>
                              {isDetailCoordinator &&
                                tr.status === 'PENDING_COORDINATOR' && (
                                  <div className="pt-1 space-y-2">
                                    <input
                                      type="text"
                                      value={transferNote}
                                      onChange={(e) => setTransferNote(e.target.value)}
                                      placeholder="Optional coordinator response note..."
                                      className="w-full px-3 py-1.5 bg-white border border-[#EBEBEF] rounded-lg text-xs"
                                    />
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        disabled={transferBusy}
                                        onClick={() =>
                                          handleTransferDecision(tr.id, 'APPROVE')
                                        }
                                        className="px-3 py-1.5 rounded-lg bg-[#15803D] text-white text-xs font-semibold"
                                      >
                                        Approve Handover
                                      </button>
                                      <button
                                        type="button"
                                        disabled={transferBusy}
                                        onClick={() =>
                                          handleTransferDecision(tr.id, 'REJECT')
                                        }
                                        className="px-3 py-1.5 rounded-lg bg-rose-700 text-white text-xs font-semibold"
                                      >
                                        Decline Handover
                                      </button>
                                    </div>
                                  </div>
                                )}
                            </div>
                          ))}
                        </div>
                      )}

                    {/* Chronological Timeline Logs */}
                    <div className="space-y-2.5">
                      <h3 className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                        <History size={15} className="text-[#EA580C]" />
                        <span>Chronological Timeline Logs</span>
                      </h3>
                      {Array.isArray(detail.timeline_logs) &&
                      detail.timeline_logs.length > 0 ? (
                        <ol className="space-y-2 border-l-2 border-[#E2E8F0] ml-2 pl-4">
                          {detail.timeline_logs.map((log) => (
                            <li
                              key={log.id}
                              className="bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl p-3 text-xs space-y-1"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-mono font-bold text-zinc-900">
                                  {log.action}
                                </span>
                                <span className="text-[11px] text-zinc-500">
                                  {formatDateTime(log.created_at)}
                                </span>
                              </div>
                              <p className="text-zinc-700">{log.message}</p>
                              <div className="text-[11px] text-zinc-500 flex flex-wrap gap-3">
                                <span>
                                  Actor: {log.actor_username || 'System'} (
                                  {log.actor_role || 'ROLE'})
                                </span>
                                {log.new_status && (
                                  <span className="font-mono">
                                    {log.previous_status
                                      ? `${log.previous_status} → ${log.new_status}`
                                      : log.new_status}
                                  </span>
                                )}
                              </div>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="text-xs text-zinc-500">
                          No timeline logs returned for this booking.
                        </p>
                      )}
                    </div>

                    {/* Bottom Modal Actions */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[#EBEBEF]">
                      <div className="flex flex-wrap items-center gap-2">
                        {canChangeVenueFor(detail) && (
                          <button
                            type="button"
                            onClick={() => openChangeVenueModal(detail)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#EBEBEF] bg-white hover:bg-zinc-50 text-zinc-800 text-xs font-semibold"
                          >
                            <ArrowRightLeft size={14} className="text-[#EA580C]" />
                            <span>Change Venue</span>
                          </button>
                        )}
                        {!['CANCELLED', 'REJECTED'].includes(detail.status) &&
                        (isDetailInitiator || isDetailCoordinator) ? (
                          <button
                            type="button"
                            onClick={() => {
                              setCancelTarget(detail);
                              setCancelReason('');
                              setCancelError('');
                            }}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold"
                          >
                            <XCircle size={14} />
                            <span>Cancel Booking</span>
                          </button>
                        ) : null}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(null);
                          setDetail(null);
                        }}
                        className="px-4 py-2 rounded-xl bg-[#121214] text-white text-xs font-semibold"
                      >
                        Close
                      </button>
                    </div>
                  </>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── CHANGE VENUE MODAL ─── */}
      {changeTarget && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-[2px] flex items-center justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label="Reassign Booking Venue"
        >
          <div className="bg-white border border-[#EBEBEF] rounded-2xl w-full max-w-lg shadow-xl overflow-hidden my-auto">
            <div className="bg-[#141E2B] text-white px-6 py-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-orange-300 font-semibold">
                  Coordinator Venue Reassignment
                </p>
                <h2 className="text-base font-bold mt-0.5">
                  Change Venue · {changeTarget.booking_code}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setChangeTarget(null)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition"
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3.5 text-xs space-y-1">
                <p className="font-bold text-zinc-900">{changeTarget.event_title}</p>
                <p className="text-zinc-600">
                  Current Venue: <strong>{changeTarget.venue_name}</strong> · Required Seats:{' '}
                  <strong>{changeTarget.expected_headcount}</strong>
                </p>
                <p className="text-[#B45309] font-medium">
                  Changing the venue resets multi-tier approvals back to PENDING_HOD.
                </p>
              </div>

              {changeError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2">
                  <AlertCircle size={15} className="text-rose-600 shrink-0 mt-0.5" />
                  <span>{changeError}</span>
                </div>
              )}

              {changeConflict && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[#B45309] text-xs space-y-1">
                  <p className="font-bold">{changeConflict.message}</p>
                  {changeConflict.current_booking?.coordinator && (
                    <p>
                      Held by {changeConflict.current_booking.coordinator.name} (
                      {changeConflict.current_booking.coordinator.email ||
                        changeConflict.current_booking.coordinator.username}
                      )
                    </p>
                  )}
                </div>
              )}

              <form onSubmit={handleChangeVenueSubmit} className="space-y-3.5">
                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                      Date
                    </label>
                    <input
                      type="date"
                      required
                      value={changeForm.booking_date}
                      onChange={(e) => {
                        const next = { ...changeForm, booking_date: e.target.value };
                        setChangeForm(next);
                        fetchAvailableReplacementVenues(
                          next.booking_date,
                          next.start_time,
                          next.end_time
                        );
                      }}
                      className="w-full px-2.5 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 outline-none focus:border-[#EA580C]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                      Start Time
                    </label>
                    <input
                      type="time"
                      required
                      value={changeForm.start_time}
                      onChange={(e) => {
                        const next = { ...changeForm, start_time: e.target.value };
                        setChangeForm(next);
                        fetchAvailableReplacementVenues(
                          next.booking_date,
                          next.start_time,
                          next.end_time
                        );
                      }}
                      className="w-full px-2.5 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 outline-none focus:border-[#EA580C]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                      End Time
                    </label>
                    <input
                      type="time"
                      required
                      value={changeForm.end_time}
                      onChange={(e) => {
                        const next = { ...changeForm, end_time: e.target.value };
                        setChangeForm(next);
                        fetchAvailableReplacementVenues(
                          next.booking_date,
                          next.start_time,
                          next.end_time
                        );
                      }}
                      className="w-full px-2.5 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 outline-none focus:border-[#EA580C]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Select Free Replacement Venue *
                  </label>
                  {(() => {
                    const alternativeVenues = changeVenues.filter(
                      (v) => v.venue_id !== changeTarget.venue_id
                    );
                    const matchingVenues = alternativeVenues.filter(
                      (v) => v.is_available && v.capacity >= changeTarget.expected_headcount
                    );
                    return (
                      <>
                        <select
                          required
                          disabled={changeVenuesLoading}
                          value={changeForm.new_venue_id}
                          onChange={(e) =>
                            setChangeForm({ ...changeForm, new_venue_id: e.target.value })
                          }
                          className="w-full px-3.5 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 outline-none focus:border-[#EA580C]"
                        >
                          <option value="">
                            {changeVenuesLoading
                              ? 'Checking live PostgreSQL venue availability...'
                              : matchingVenues.length === 0
                              ? 'No matching free venues for this window'
                              : 'Select an available venue…'}
                          </option>
                          {alternativeVenues.map((v) => {
                            const fits = v.capacity >= changeTarget.expected_headcount;
                            const disabled = !v.is_available || !fits;
                            return (
                              <option key={v.venue_id} value={v.venue_id} disabled={disabled}>
                                {v.venue_name} ({v.capacity} seats) —{' '}
                                {!fits
                                  ? 'Capacity too small'
                                  : v.is_available
                                    ? 'Available'
                                    : 'Occupied'}
                              </option>
                            );
                          })}
                        </select>
                        {!changeVenuesLoading && !changeError && alternativeVenues.length === 0 && (
                          <p className="text-[11px] text-amber-700 mt-1.5">
                            No alternative venues found for the selected date and time window.
                          </p>
                        )}
                        {!changeVenuesLoading &&
                          !changeError &&
                          alternativeVenues.length > 0 &&
                          matchingVenues.length === 0 && (
                            <p className="text-[11px] text-amber-700 mt-1.5">
                              No available replacement venues match the required capacity ({changeTarget.expected_headcount} seats) during this slot. Adjust date or time above.
                            </p>
                          )}
                      </>
                    );
                  })()}
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-[#EBEBEF]">
                  <button
                    type="button"
                    onClick={() => setChangeTarget(null)}
                    className="px-4 py-2 rounded-xl border border-[#EBEBEF] text-xs font-semibold text-zinc-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={changeBusy || !changeForm.new_venue_id}
                    className="px-4 py-2 rounded-xl bg-[#EA580C] hover:bg-[#C2410C] text-white text-xs font-semibold disabled:opacity-50"
                  >
                    {changeBusy ? 'Reassigning...' : 'Confirm Venue Change'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ─── CANCEL CONFIRMATION MODAL ─── */}
      {cancelTarget && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-[2px] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm Booking Cancellation"
        >
          <div className="bg-white border border-[#EBEBEF] rounded-2xl w-full max-w-md p-6 shadow-xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-bold text-zinc-900">
                  Cancel Booking {cancelTarget.booking_code}?
                </h2>
                <p className="text-xs text-zinc-500 mt-1">
                  Cancelling releases this slot immediately and activates a 24-hour PostgreSQL cooldown lock preventing you from re-booking the same venue.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCancelTarget(null);
                  setCancelError('');
                }}
                className="p-1 text-zinc-400 hover:text-zinc-700"
              >
                <X size={17} />
              </button>
            </div>

            {cancelError && (
              <div
                role="alert"
                className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2"
              >
                <AlertCircle size={15} className="text-rose-600 shrink-0 mt-0.5" />
                <span>{cancelError}</span>
              </div>
            )}

            <form onSubmit={handleCancelSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Cancellation Reason
                </label>
                <textarea
                  rows={3}
                  required
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Provide reason for cancelling this venue booking..."
                  className="w-full px-3.5 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 outline-none focus:border-[#EA580C]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setCancelTarget(null);
                    setCancelError('');
                  }}
                  className="px-4 py-2 rounded-xl border border-[#EBEBEF] text-xs font-semibold text-zinc-700"
                >
                  Keep Booking
                </button>
                <button
                  type="submit"
                  disabled={cancelBusy}
                  className="px-4 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold disabled:opacity-50"
                >
                  {cancelBusy ? 'Cancelling...' : 'Confirm Cancellation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
