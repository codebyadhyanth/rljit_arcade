import React, { useState, useEffect, useCallback } from 'react';
import api from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import DbReceiptCard from '../../components/DbReceiptCard';
import {
  Building2,
  Calendar,
  Clock,
  Users,
  MapPin,
  Plus,
  Search,
  X,
  AlertCircle,
  CheckCircle2,
  ArrowRightLeft,
  RefreshCw,
  Tag,
  Phone,
  Mail,
  UserCheck,
  Pencil,
  Power,
} from 'lucide-react';

const IST_OFFSET_MS = 330 * 60 * 1000;
const getTodayIst = () => new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);

const VENUE_CATEGORIES = [
  { value: 'ALL', label: 'All' },
  { value: 'AUDITORIUM', label: 'Auditorium' },
  { value: 'SEMINAR_HALL', label: 'Seminar Hall' },
  { value: 'CONFERENCE_ROOM', label: 'Conference Room' },
  { value: 'LAB', label: 'Lab' },
  { value: 'OPEN_AIR_THEATRE', label: 'Open Air Theatre' },
];

const HOURLY_SLOTS = [9, 10, 11, 12, 13, 14, 15, 16];

const pad2 = (n) => String(n).padStart(2, '0');

function parseTimeToMinutes(hhmm) {
  if (!hhmm || typeof hhmm !== 'string') return null;
  const match = hhmm.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

function getSlotMinutesForDate(slot, targetDate) {
  const dayStartMs = new Date(`${targetDate}T00:00:00+05:30`).getTime();
  const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;
  const sMs = slot.event_start_time ? new Date(slot.event_start_time).getTime() : NaN;
  const eMs = slot.event_end_time ? new Date(slot.event_end_time).getTime() : NaN;

  if (!Number.isNaN(sMs) && !Number.isNaN(eMs) && eMs > sMs) {
    const clampedS = Math.max(sMs, dayStartMs);
    const clampedE = Math.min(eMs, dayEndMs);
    if (clampedE > clampedS) {
      return [(clampedS - dayStartMs) / 60000, (clampedE - dayStartMs) / 60000];
    }
  }

  const startMin = parseTimeToMinutes(slot.start_time);
  const endMin = parseTimeToMinutes(slot.end_time);
  if (startMin !== null && endMin !== null && endMin > startMin) {
    return [startMin, endMin];
  }
  return null;
}

function extractAmenities(venue) {
  const tags = new Set();
  if (Array.isArray(venue.amenities)) {
    venue.amenities.forEach((item) => {
      if (item && String(item).trim()) tags.add(String(item).trim());
    });
  }
  if (Array.isArray(venue.facilities)) {
    venue.facilities.forEach((item) => {
      if (item && String(item).trim()) tags.add(String(item).trim());
    });
  } else if (venue.facilities && typeof venue.facilities === 'object') {
    Object.entries(venue.facilities).forEach(([key, val]) => {
      if (val) tags.add(String(key).trim());
    });
  }
  return Array.from(tags);
}

function getAvailabilityBadgeStyle(status) {
  switch (status) {
    case 'AVAILABLE':
      return {
        label: 'AVAILABLE',
        cls: 'bg-emerald-50 text-[#15803D] border-emerald-200',
      };
    case 'PARTIALLY_BOOKED':
      return {
        label: 'PARTIALLY BOOKED',
        cls: 'bg-amber-50 text-[#B45309] border-amber-200',
      };
    case 'OCCUPIED':
    default:
      return {
        label: 'OCCUPIED',
        cls: 'bg-rose-50 text-rose-700 border-rose-200',
      };
  }
}

export default function VenueCatalogPage({ onNavigate }) {
  const { user } = useAuth();
  const isStudent = user?.baseRole === 'STUDENT';
  const isSuperAdmin = user?.adminTier === 'SUPER_ADMIN';
  const canCreateVenue =
    isSuperAdmin ||
    user?.sectionCode === 'MGT' ||
    (Array.isArray(user?.subRoles) && user.subRoles.includes('MANAGEMENT'));

  const [selectedDate, setSelectedDate] = useState(getTodayIst);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [venues, setVenues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [venueActionMessage, setVenueActionMessage] = useState('');
  const [venueActionReceipt, setVenueActionReceipt] = useState(null);
  const [togglingVenueId, setTogglingVenueId] = useState(null);

  // Booking modal state
  const [bookingVenue, setBookingVenue] = useState(null);
  const [bookingForm, setBookingForm] = useState({
    event_title: '',
    purpose: '',
    expected_headcount: '',
    department: user?.department || '',
    booking_date: getTodayIst(),
    start_time: '09:00',
    end_time: '10:00',
    coordinator_id: '',
  });
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [bookingReceipt, setBookingReceipt] = useState(null);
  const [createdBookingInfo, setCreatedBookingInfo] = useState(null);
  const [availabilityCheck, setAvailabilityCheck] = useState({
    loading: false,
    checked: false,
    is_available: null,
    message: '',
    current_booking: null,
    error: '',
  });

  // 409 Conflict & Transfer Request state
  const [conflictData, setConflictData] = useState(null);
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [transferForm, setTransferForm] = useState({
    urgency_reason: '',
    new_event_title: '',
    new_purpose: '',
    new_coordinator_id: '',
  });
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferSuccess, setTransferSuccess] = useState('');
  const [transferError, setTransferError] = useState('');

  // Faculty coordinator search for students
  const [facultyQuery, setFacultyQuery] = useState('');
  const [facultyResults, setFacultyResults] = useState([]);
  const [facultySearching, setFacultySearching] = useState(false);
  const [facultySearchNote, setFacultySearchNote] = useState('');

  // Add Venue modal state
  const [showAddVenue, setShowAddVenue] = useState(false);
  const [addVenueForm, setAddVenueForm] = useState({
    name: '',
    code: '',
    type: 'SEMINAR_HALL',
    category: '',
    department: '',
    building: '',
    floor: '',
    location_details: '',
    capacity: '',
    amenitiesText: '',
  });
  const [addVenueLoading, setAddVenueLoading] = useState(false);
  const [addVenueError, setAddVenueError] = useState('');
  const [addVenueReceipt, setAddVenueReceipt] = useState(null);
  const [addVenueMessage, setAddVenueMessage] = useState('');

  // Edit Venue modal state (SUPER_ADMIN)
  const [editVenue, setEditVenue] = useState(null);
  const [editVenueForm, setEditVenueForm] = useState({
    name: '',
    code: '',
    type: 'SEMINAR_HALL',
    category: '',
    department: '',
    building: '',
    floor: '',
    location_details: '',
    capacity: '',
    amenitiesText: '',
    is_active: true,
  });
  const [editVenueLoading, setEditVenueLoading] = useState(false);
  const [editVenueError, setEditVenueError] = useState('');
  const [editVenueReceipt, setEditVenueReceipt] = useState(null);
  const [editVenueMessage, setEditVenueMessage] = useState('');

  const fetchVenues = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ date: selectedDate });
      if (selectedCategory !== 'ALL') {
        params.set('type', selectedCategory);
      }
      if (isSuperAdmin) {
        params.set('is_active', 'all');
      }
      const res = await api.get(`/api/v1/venues?${params.toString()}`);
      setVenues(res.data?.venues || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load campus venues');
    } finally {
      setLoading(false);
    }
  }, [selectedDate, selectedCategory, isSuperAdmin]);

  useEffect(() => {
    fetchVenues();
  }, [fetchVenues]);

  // Real-time availability pre-check inside Booking Modal
  useEffect(() => {
    if (!bookingVenue || !bookingForm.booking_date || !bookingForm.start_time || !bookingForm.end_time) {
      return undefined;
    }
    const startMin = parseTimeToMinutes(bookingForm.start_time);
    const endMin = parseTimeToMinutes(bookingForm.end_time);
    if (startMin === null || endMin === null || endMin <= startMin) {
      setAvailabilityCheck({
        loading: false,
        checked: false,
        is_available: null,
        message: '',
        current_booking: null,
        error:
          startMin !== null && endMin !== null && endMin <= startMin
            ? 'End time must be after start time.'
            : '',
      });
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setAvailabilityCheck((prev) => ({ ...prev, loading: true, error: '' }));
      try {
        const startIso = `${bookingForm.booking_date}T${bookingForm.start_time.slice(0, 5)}:00+05:30`;
        const endIso = `${bookingForm.booking_date}T${bookingForm.end_time.slice(0, 5)}:00+05:30`;
        const params = new URLSearchParams({
          venue_id: bookingVenue.id,
          start_time: startIso,
          end_time: endIso,
        });
        const res = await api.get(`/api/v1/venues/availability?${params.toString()}`);
        if (cancelled) return;
        const data = res.data || {};
        setAvailabilityCheck({
          loading: false,
          checked: true,
          is_available: Boolean(data.is_available),
          message: data.message || '',
          current_booking: data.current_booking || null,
          error: '',
        });
        if (data.is_available === false && data.current_booking) {
          setConflictData({
            message: data.message || 'Place already occupied... kindly look for another one.',
            current_booking: data.current_booking,
          });
        } else if (data.is_available === true) {
          setConflictData(null);
        }
      } catch (err) {
        if (cancelled) return;
        setAvailabilityCheck({
          loading: false,
          checked: false,
          is_available: null,
          message: '',
          current_booking: null,
          error: err.response?.data?.error || 'Availability pre-check failed.',
        });
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [bookingVenue, bookingForm.booking_date, bookingForm.start_time, bookingForm.end_time]);

  const searchFacultyCoordinators = useCallback(async (queryText) => {
    const q = (queryText || '').trim();
    if (!q) {
      setFacultyResults([]);
      setFacultySearchNote('');
      return;
    }
    setFacultySearching(true);
    setFacultySearchNote('');
    try {
      const res = await api.get(`/api/v1/users/search?q=${encodeURIComponent(q)}`);
      const facultyOnly = (res.data?.results || []).filter(
        (u) => u.baseRole === 'FACULTY' && u.isActive !== false
      );
      setFacultyResults(facultyOnly);
      if (facultyOnly.length === 0) {
        setFacultySearchNote(`No active faculty members found matching "${q}".`);
      }
    } catch (err) {
      setFacultySearchNote(err.response?.data?.error || 'Faculty lookup failed.');
    } finally {
      setFacultySearching(false);
    }
  }, []);

  const openBookingModal = (venue, startHour = 9, endHour = 10) => {
    setBookingVenue(venue);
    setBookingForm({
      event_title: '',
      purpose: '',
      expected_headcount: '',
      department: user?.department || venue.department || '',
      booking_date: selectedDate,
      start_time: `${pad2(startHour)}:00`,
      end_time: `${pad2(endHour)}:00`,
      coordinator_id: '',
    });
    setBookingError('');
    setBookingReceipt(null);
    setCreatedBookingInfo(null);
    setAvailabilityCheck({
      loading: false,
      checked: false,
      is_available: null,
      message: '',
      current_booking: null,
      error: '',
    });
    setConflictData(null);
    setShowTransferForm(false);
    setTransferSuccess('');
    setTransferError('');
    setTransferForm({
      urgency_reason: '',
      new_event_title: '',
      new_purpose: '',
      new_coordinator_id: '',
    });
    if (isStudent && facultyResults.length === 0) {
      setFacultyQuery('RLFAC');
      searchFacultyCoordinators('RLFAC');
    }
  };

  const closeBookingModal = () => {
    setBookingVenue(null);
    setConflictData(null);
    setBookingError('');
    setBookingReceipt(null);
    setCreatedBookingInfo(null);
    setAvailabilityCheck({
      loading: false,
      checked: false,
      is_available: null,
      message: '',
      current_booking: null,
      error: '',
    });
  };

  const handleBookingSubmit = async (e) => {
    e.preventDefault();
    if (!bookingVenue) return;

    setBookingError('');
    setBookingReceipt(null);
    setCreatedBookingInfo(null);
    setConflictData(null);
    setTransferSuccess('');
    setTransferError('');

    const headcount = parseInt(bookingForm.expected_headcount, 10);
    if (Number.isNaN(headcount) || headcount <= 0) {
      setBookingError('Expected headcount must be a positive integer.');
      return;
    }
    if (headcount > bookingVenue.capacity) {
      setBookingError(
        `Expected headcount (${headcount}) exceeds venue capacity (${bookingVenue.capacity} seats).`
      );
      return;
    }
    if (isStudent && !bookingForm.coordinator_id) {
      setBookingError('Students must select an active Faculty Coordinator.');
      return;
    }

    setBookingSubmitting(true);
    try {
      const payload = {
        venue_id: bookingVenue.id,
        event_title: bookingForm.event_title.trim(),
        purpose: bookingForm.purpose.trim(),
        expected_headcount: headcount,
        department: (bookingForm.department || user?.department || 'CENTRAL').trim().toUpperCase(),
        booking_date: bookingForm.booking_date,
        start_time: bookingForm.start_time,
        end_time: bookingForm.end_time,
      };
      if (isStudent || bookingForm.coordinator_id) {
        payload.coordinator_id = bookingForm.coordinator_id;
      }

      const res = await api.post('/api/v1/venues/bookings', payload);
      const rawReceipt = res.data?.dbReceipt;
      setBookingReceipt(
        rawReceipt
          ? {
              ...rawReceipt,
              storedInTables: rawReceipt.storedInTables || rawReceipt.storedInTable,
            }
          : null
      );
      setCreatedBookingInfo({
        message: res.data?.message || 'Venue booking request initiated.',
        booking: res.data?.booking,
      });
      await fetchVenues();
    } catch (err) {
      if (err.response?.status === 409) {
        const data = err.response.data || {};
        setConflictData({
          message: data.message || 'Place already occupied... kindly look for another one.',
          current_booking: data.current_booking || null,
        });
        setTransferForm({
          urgency_reason: '',
          new_event_title: bookingForm.event_title,
          new_purpose: bookingForm.purpose,
          new_coordinator_id: bookingForm.coordinator_id || '',
        });
      } else {
        setBookingError(
          err.response?.data?.error ||
            err.response?.data?.message ||
            err.message ||
            'Failed to submit venue booking.'
        );
      }
    } finally {
      setBookingSubmitting(false);
    }
  };

  const handleTransferSubmit = async (e) => {
    e.preventDefault();
    const targetBookingId = conflictData?.current_booking?.booking_id;
    if (!targetBookingId) return;

    setTransferError('');
    setTransferSuccess('');

    if (isStudent && !(transferForm.new_coordinator_id || bookingForm.coordinator_id)) {
      setTransferError('Please select a Faculty Coordinator for the transfer request.');
      return;
    }

    setTransferSubmitting(true);
    try {
      const res = await api.post(
        `/api/v1/venues/bookings/${targetBookingId}/transfer-request`,
        {
          urgency_reason: transferForm.urgency_reason.trim(),
          new_event_title: (transferForm.new_event_title || bookingForm.event_title).trim(),
          new_purpose: (transferForm.new_purpose || bookingForm.purpose).trim(),
          ...(isStudent || transferForm.new_coordinator_id || bookingForm.coordinator_id
            ? {
                new_coordinator_id:
                  transferForm.new_coordinator_id || bookingForm.coordinator_id,
              }
            : {}),
        }
      );
      setTransferSuccess(
        res.data?.message || 'Transfer request sent to the current Faculty Coordinator.'
      );
      setShowTransferForm(false);
    } catch (err) {
      setTransferError(
        err.response?.data?.error ||
          err.response?.data?.message ||
          err.message ||
          'Transfer request failed.'
      );
    } finally {
      setTransferSubmitting(false);
    }
  };

  const handleAddVenueSubmit = async (e) => {
    e.preventDefault();
    setAddVenueError('');
    setAddVenueReceipt(null);
    setAddVenueMessage('');

    const cap = parseInt(addVenueForm.capacity, 10);
    if (Number.isNaN(cap) || cap <= 0) {
      setAddVenueError('Capacity must be a positive integer.');
      return;
    }

    setAddVenueLoading(true);
    try {
      const amenitiesArr = addVenueForm.amenitiesText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const payload = {
        name: addVenueForm.name.trim(),
        code: addVenueForm.code.trim() || undefined,
        type: addVenueForm.type,
        category: addVenueForm.category.trim() || addVenueForm.type,
        department: addVenueForm.department.trim() || undefined,
        building: addVenueForm.building.trim() || undefined,
        floor: addVenueForm.floor.trim() || undefined,
        location_details: addVenueForm.location_details.trim() || undefined,
        capacity: cap,
        amenities: amenitiesArr,
      };

      const res = await api.post('/api/v1/venues', payload);
      const rawReceipt = res.data?.dbReceipt;
      setAddVenueReceipt(
        rawReceipt
          ? {
              ...rawReceipt,
              storedInTables: rawReceipt.storedInTables || rawReceipt.storedInTable,
            }
          : null
      );
      setAddVenueMessage(res.data?.message || 'Venue created successfully.');
      setAddVenueForm({
        name: '',
        code: '',
        type: 'SEMINAR_HALL',
        category: '',
        department: '',
        building: '',
        floor: '',
        location_details: '',
        capacity: '',
        amenitiesText: '',
      });
      await fetchVenues();
    } catch (err) {
      setAddVenueError(
        err.response?.data?.error || err.message || 'Failed to create campus venue.'
      );
    } finally {
      setAddVenueLoading(false);
    }
  };

  const openEditVenueModal = (venue) => {
    setEditVenue(venue);
    setEditVenueForm({
      name: venue.name || '',
      code: venue.code || '',
      type: venue.type || 'SEMINAR_HALL',
      category: venue.category || venue.type || '',
      department: venue.department || '',
      building: venue.building || '',
      floor: venue.floor || '',
      location_details: venue.location_details || '',
      capacity: String(venue.capacity || ''),
      amenitiesText: extractAmenities(venue).join(', '),
      is_active: venue.is_active !== false,
    });
    setEditVenueError('');
    setEditVenueReceipt(null);
    setEditVenueMessage('');
  };

  const handleToggleVenueActive = async (venue) => {
    if (!isSuperAdmin) return;
    setTogglingVenueId(venue.id);
    setError('');
    setVenueActionMessage('');
    setVenueActionReceipt(null);
    try {
      const res = await api.patch(`/api/v1/venues/${venue.id}`, {
        is_active: !venue.is_active,
      });
      const rawReceipt = res.data?.dbReceipt;
      setVenueActionMessage(
        `${venue.name} ${!venue.is_active ? 'activated' : 'deactivated'} successfully.`
      );
      setVenueActionReceipt(
        rawReceipt
          ? {
              ...rawReceipt,
              storedInTables: rawReceipt.storedInTables || rawReceipt.storedInTable,
            }
          : null
      );
      await fetchVenues();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to update venue status.');
    } finally {
      setTogglingVenueId(null);
    }
  };

  const handleEditVenueSubmit = async (e) => {
    e.preventDefault();
    if (!editVenue) return;
    setEditVenueError('');
    setEditVenueReceipt(null);
    setEditVenueMessage('');

    const cap = parseInt(editVenueForm.capacity, 10);
    if (Number.isNaN(cap) || cap <= 0) {
      setEditVenueError('Capacity must be a positive integer.');
      return;
    }

    setEditVenueLoading(true);
    try {
      const amenitiesArr = editVenueForm.amenitiesText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const payload = {
        name: editVenueForm.name.trim(),
        code: editVenueForm.code.trim() || undefined,
        type: editVenueForm.type,
        category: editVenueForm.category.trim() || editVenueForm.type,
        department: editVenueForm.department.trim() || null,
        building: editVenueForm.building.trim() || null,
        floor: editVenueForm.floor.trim() || null,
        location_details: editVenueForm.location_details.trim() || null,
        capacity: cap,
        amenities: amenitiesArr,
        is_active: editVenueForm.is_active,
      };

      const res = await api.patch(`/api/v1/venues/${editVenue.id}`, payload);
      const rawReceipt = res.data?.dbReceipt;
      setEditVenueReceipt(
        rawReceipt
          ? {
              ...rawReceipt,
              storedInTables: rawReceipt.storedInTables || rawReceipt.storedInTable,
            }
          : null
      );
      setEditVenueMessage(res.data?.message || 'Venue updated successfully.');
      await fetchVenues();
    } catch (err) {
      setEditVenueError(
        err.response?.data?.error || err.message || 'Failed to update campus venue.'
      );
    } finally {
      setEditVenueLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Institutional Header & Controls */}
      <div className="bg-white border border-[#EBEBEF] rounded-2xl p-5 sm:p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-orange-50 text-[#EA580C] border border-orange-200">
                <Building2 size={12} /> Campus Venues
              </span>
              <span className="text-xs text-zinc-500 font-mono">{selectedDate}</span>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900">
              Visual Campus Venue Catalog
            </h1>
            <p className="text-xs text-zinc-500 mt-1">
              Click any green hourly slot (09:00–17:00) on a venue card to initiate a booking request directly against live PostgreSQL availability.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Date Picker */}
            <label className="flex items-center gap-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl px-3 py-2 text-xs font-medium text-zinc-700 focus-within:border-[#EA580C]">
              <Calendar size={15} className="text-[#EA580C]" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value || getTodayIst())}
                className="bg-transparent text-xs font-semibold text-zinc-900 outline-none"
                aria-label="Select booking date"
              />
            </label>

            <button
              type="button"
              onClick={fetchVenues}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-white hover:bg-zinc-50 border border-[#EBEBEF] rounded-xl text-xs font-semibold text-zinc-700 transition"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>

            {canCreateVenue && (
              <button
                type="button"
                onClick={() => {
                  setAddVenueError('');
                  setAddVenueReceipt(null);
                  setAddVenueMessage('');
                  setShowAddVenue(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-[#121214] hover:bg-black text-white rounded-xl text-xs font-semibold shadow-sm transition"
              >
                <Plus size={15} />
                <span>Add Campus Venue</span>
              </button>
            )}
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 border-t border-[#EBEBEF]">
          {VENUE_CATEGORIES.map((cat) => {
            const active = selectedCategory === cat.value;
            return (
              <button
                key={cat.value}
                type="button"
                onClick={() => setSelectedCategory(cat.value)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition ${
                  active
                    ? 'bg-[#141E2B] text-white border-[#141E2B]'
                    : 'bg-[#F8FAFC] text-zinc-600 border-[#E2E8F0] hover:bg-zinc-100 hover:text-zinc-900'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Super Admin Update Receipt */}
      {venueActionMessage && (
        <div className="space-y-3">
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-[#15803D] text-xs font-semibold">
            <CheckCircle2 size={16} className="shrink-0" />
            <span>{venueActionMessage}</span>
          </div>
          {venueActionReceipt && (
            <DbReceiptCard
              receipt={venueActionReceipt}
              title="Venue Update Persisted to PostgreSQL"
            />
          )}
        </div>
      )}

      {/* Error State */}
      {error && (
        <div
          role="alert"
          className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-rose-800 text-xs"
        >
          <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
          <span className="font-medium">{error}</span>
        </div>
      )}

      {/* Loading / Empty / Visual Card Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="bg-white border border-[#EBEBEF] rounded-2xl p-6 h-72 animate-pulse space-y-4"
            >
              <div className="h-4 bg-zinc-200 rounded w-1/3" />
              <div className="h-6 bg-zinc-200 rounded w-3/4" />
              <div className="h-4 bg-zinc-100 rounded w-1/2" />
              <div className="grid grid-cols-4 gap-2 pt-4">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((b) => (
                  <div key={b} className="h-10 bg-zinc-100 rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : venues.length === 0 ? (
        <div className="bg-white border border-[#EBEBEF] rounded-2xl p-10 text-center space-y-2 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]">
          <Building2 size={28} className="mx-auto text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-900">No Campus Venues Found</h2>
          <p className="text-xs text-zinc-500 max-w-md mx-auto">
            No venues matched the selected category filter ({selectedCategory}) for {selectedDate}.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {venues.map((venue) => {
            const badge = getAvailabilityBadgeStyle(venue.availability_status);
            const amenities = extractAmenities(venue);
            const bookedSlots = Array.isArray(venue.booked_slots) ? venue.booked_slots : [];

            return (
              <article
                key={venue.id}
                className={`bg-white border border-[#EBEBEF] rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] flex flex-col justify-between gap-4 hover:border-zinc-300 transition ${
                  !venue.is_active ? 'opacity-80' : ''
                }`}
              >
                <div className="space-y-3.5">
                  {/* Top Meta Row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {venue.code && (
                        <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-800 border border-[#E2E8F0]">
                          {venue.code}
                        </span>
                      )}
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-[#1E293B] border border-[#E2E8F0]">
                        {venue.category || venue.type}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 justify-end">
                      {!venue.is_active && (
                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full border bg-zinc-100 text-zinc-600 border-zinc-200">
                          INACTIVE
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-full border shrink-0 ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                  </div>

                  {/* Title & Location */}
                  <div>
                    <h2 className="text-base font-bold text-zinc-900 leading-snug">
                      {venue.name}
                    </h2>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                      {(venue.building || venue.floor || venue.location_details) && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={13} className="text-[#EA580C] shrink-0" />
                          <span>
                            {[venue.building, venue.floor, venue.location_details]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 font-semibold text-zinc-700">
                        <Users size={13} className="text-zinc-500" />
                        <span>{venue.capacity} Seats</span>
                      </span>
                    </div>
                  </div>

                  {/* Amenities Chips */}
                  {amenities.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {amenities.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-[11px] font-medium text-zinc-600"
                        >
                          <Tag size={10} className="text-zinc-400" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Visual Hourly Slot Availability Strip (09:00 - 17:00) */}
                  <div className="pt-2 border-t border-[#EBEBEF] space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-zinc-700 flex items-center gap-1">
                        <Clock size={12} className="text-[#EA580C]" />
                        <span>Hourly Slots (09:00–17:00)</span>
                      </span>
                      <span className="text-zinc-400">
                        {bookedSlots.length} booking{bookedSlots.length === 1 ? '' : 's'}
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-1.5">
                      {HOURLY_SLOTS.map((hour) => {
                        const blockStart = hour * 60;
                        const blockEnd = (hour + 1) * 60;
                        const matchingSlot = bookedSlots.find((s) => {
                          const range = getSlotMinutesForDate(s, selectedDate);
                          if (!range) return false;
                          return range[0] < blockEnd && range[1] > blockStart;
                        });

                        const label = `${pad2(hour)}–${pad2(hour + 1)}`;

                        if (!matchingSlot) {
                          return (
                            <button
                              key={hour}
                              type="button"
                              disabled={!venue.is_active}
                              onClick={() => openBookingModal(venue, hour, hour + 1)}
                              title={
                                venue.is_active
                                  ? `${pad2(hour)}:00–${pad2(hour + 1)}:00 Available — Click to Book`
                                  : 'Venue is deactivated'
                              }
                              className="group flex flex-col items-start justify-between p-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-left transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <span className="font-mono text-[10px] font-bold text-[#15803D]">
                                {label}
                              </span>
                              <span className="text-[9px] font-semibold text-emerald-700/80 group-hover:text-emerald-900">
                                Free
                              </span>
                            </button>
                          );
                        }

                        const isApproved = matchingSlot.status === 'APPROVED';
                        return (
                          <div
                            key={hour}
                            title={`${pad2(hour)}:00–${pad2(hour + 1)}:00 Occupied (${matchingSlot.status}): ${matchingSlot.event_title} [${matchingSlot.booking_code}]`}
                            className={`flex flex-col items-start justify-between p-2 rounded-lg border text-left ${
                              isApproved
                                ? 'bg-rose-50 border-rose-200 text-rose-700'
                                : 'bg-amber-50 border-amber-200 text-[#B45309]'
                            }`}
                          >
                            <span className="font-mono text-[10px] font-bold">{label}</span>
                            <span className="text-[9px] font-semibold truncate w-full">
                              {matchingSlot.event_title || matchingSlot.booking_code}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Card Footer CTA */}
                <div className="pt-3 border-t border-[#EBEBEF] flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-zinc-400">
                    {venue.department ? `Dept: ${venue.department}` : 'Central Campus'}
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {isSuperAdmin && (
                      <>
                        <button
                          type="button"
                          onClick={() => openEditVenueModal(venue)}
                          title="Edit venue details"
                          className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl border border-[#EBEBEF] bg-[#FBFBFC] hover:bg-zinc-100 text-zinc-700 text-xs font-semibold transition"
                        >
                          <Pencil size={12} />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          disabled={togglingVenueId === venue.id}
                          onClick={() => handleToggleVenueActive(venue)}
                          title={venue.is_active ? 'Deactivate venue' : 'Activate venue'}
                          className={`inline-flex items-center gap-1 px-2.5 py-2 rounded-xl border text-xs font-semibold transition disabled:opacity-50 ${
                            venue.is_active
                              ? 'border-amber-200 bg-amber-50 hover:bg-amber-100 text-[#B45309]'
                              : 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-[#15803D]'
                          }`}
                        >
                          <Power size={12} />
                          <span>
                            {togglingVenueId === venue.id
                              ? '...'
                              : venue.is_active
                                ? 'Deactivate'
                                : 'Activate'}
                          </span>
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      disabled={!venue.is_active}
                      onClick={() => openBookingModal(venue, 9, 10)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#121214] hover:bg-black text-white text-xs font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Calendar size={13} />
                      <span>{venue.is_active ? 'Request Booking' : 'Deactivated'}</span>
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* ─── BOOKING REQUEST MODAL ─── */}
      {bookingVenue && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] flex items-center justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label="Request Venue Booking"
        >
          <div className="bg-white border border-[#EBEBEF] rounded-2xl w-full max-w-2xl shadow-xl overflow-hidden my-auto">
            {/* Modal Header */}
            <div className="bg-[#141E2B] text-white px-6 py-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-orange-300 font-semibold">
                  Venue Booking Request
                </p>
                <h2 className="text-base font-bold mt-0.5">
                  {bookingVenue.name}{' '}
                  {bookingVenue.code ? (
                    <span className="font-mono text-xs text-slate-300">
                      ({bookingVenue.code})
                    </span>
                  ) : null}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeBookingModal}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition"
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
              {/* Venue Specs Strip */}
              <div className="flex flex-wrap items-center gap-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-2.5 text-xs text-zinc-700">
                <span className="font-semibold">
                  Max Capacity: {bookingVenue.capacity} Seats
                </span>
                {bookingVenue.building && (
                  <span>
                    · {bookingVenue.building}
                    {bookingVenue.floor ? ` (${bookingVenue.floor})` : ''}
                  </span>
                )}
                <span className="text-zinc-500">
                  · 30-min turnaround buffer enforced by PostgreSQL
                </span>
              </div>

              {/* Live Availability Pre-Check Strip */}
              {(availabilityCheck.loading || availabilityCheck.checked || availabilityCheck.error) && (
                <div
                  className={`px-3.5 py-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                    availabilityCheck.error
                      ? 'bg-rose-50 border-rose-200 text-rose-800'
                      : availabilityCheck.loading
                        ? 'bg-zinc-50 border-[#EBEBEF] text-zinc-600'
                        : availabilityCheck.is_available
                          ? 'bg-emerald-50 border-emerald-200 text-[#15803D]'
                          : 'bg-amber-50 border-amber-200 text-[#B45309]'
                  }`}
                >
                  <div className="flex items-center gap-2 font-semibold">
                    {availabilityCheck.is_available ? (
                      <CheckCircle2 size={14} className="shrink-0" />
                    ) : (
                      <Clock size={14} className="shrink-0" />
                    )}
                    <span>
                      {availabilityCheck.loading
                        ? 'Checking live PostgreSQL slot availability...'
                        : availabilityCheck.error || availabilityCheck.message}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] shrink-0">
                    {bookingForm.start_time}–{bookingForm.end_time}
                  </span>
                </div>
              )}

              {/* Success Confirmation & DbReceiptCard */}
              {createdBookingInfo && (
                <div className="space-y-3">
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1.5 text-xs text-emerald-900">
                    <div className="flex items-center gap-2 font-bold text-[#15803D]">
                      <CheckCircle2 size={16} />
                      <span>{createdBookingInfo.message}</span>
                    </div>
                    {createdBookingInfo.booking?.booking_code && (
                      <p className="font-mono text-xs">
                        Booking Reference:{' '}
                        <strong>{createdBookingInfo.booking.booking_code}</strong> · Status:{' '}
                        <strong>{createdBookingInfo.booking.status}</strong>
                      </p>
                    )}
                    {onNavigate && (
                      <div className="pt-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            closeBookingModal();
                            onNavigate('venue-bookings');
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#15803D] hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold transition"
                        >
                          <span>Inspect in My Bookings</span>
                        </button>
                      </div>
                    )}
                  </div>
                  {bookingReceipt && (
                    <DbReceiptCard
                      receipt={bookingReceipt}
                      title="Booking Persisted to PostgreSQL"
                    />
                  )}
                </div>
              )}

              {/* Standard Error Banner */}
              {bookingError && (
                <div
                  role="alert"
                  className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-800 text-xs"
                >
                  <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                  <span className="font-medium">{bookingError}</span>
                </div>
              )}

              {/* 409 Conflict Panel + Coordinator Contact + Transfer Option */}
              {conflictData && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3 text-xs">
                  <div className="flex items-start gap-2.5 text-[#B45309]">
                    <AlertCircle size={17} className="shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-sm">{conflictData.message}</p>
                      <p className="text-amber-800 mt-0.5">
                        An overlapping booking (including the 30-minute turnaround buffer) already holds this slot.
                      </p>
                    </div>
                  </div>

                  {conflictData.current_booking && (
                    <div className="bg-white border border-amber-200/80 rounded-xl p-3.5 space-y-2 text-zinc-800">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EBEBEF] pb-2">
                        <span className="font-semibold text-zinc-900">
                          {conflictData.current_booking.event_title}
                        </span>
                        <span className="font-mono text-[11px] bg-amber-100 text-[#B45309] px-2 py-0.5 rounded-full font-semibold">
                          {conflictData.current_booking.booking_code} ·{' '}
                          {conflictData.current_booking.status}
                        </span>
                      </div>

                      {conflictData.current_booking.coordinator && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          <div className="flex items-center gap-1.5">
                            <UserCheck size={14} className="text-[#EA580C]" />
                            <span>
                              <strong>Coordinator:</strong>{' '}
                              {conflictData.current_booking.coordinator.name ||
                                conflictData.current_booking.coordinator.username}
                            </span>
                          </div>
                          <div>
                            <strong>Designation:</strong>{' '}
                            {conflictData.current_booking.coordinator.designation || 'Faculty'}
                            {conflictData.current_booking.coordinator.cabin_room
                              ? ` (Cabin: ${conflictData.current_booking.coordinator.cabin_room})`
                              : ''}
                          </div>
                          {conflictData.current_booking.coordinator.email && (
                            <div className="flex items-center gap-1.5">
                              <Mail size={13} className="text-zinc-500" />
                              <span className="font-mono">
                                {conflictData.current_booking.coordinator.email}
                              </span>
                            </div>
                          )}
                          {conflictData.current_booking.coordinator.phone && (
                            <div className="flex items-center gap-1.5">
                              <Phone size={13} className="text-zinc-500" />
                              <span className="font-mono">
                                {conflictData.current_booking.coordinator.phone}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {!transferSuccess && (
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={() => setShowTransferForm(!showTransferForm)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#EA580C] hover:bg-[#C2410C] text-white font-semibold text-xs transition"
                          >
                            <ArrowRightLeft size={14} />
                            <span>
                              {showTransferForm
                                ? 'Hide Transfer Request Form'
                                : 'Submit Urgent Transfer Request'}
                            </span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {transferSuccess && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-[#15803D] font-semibold flex items-center gap-2">
                      <CheckCircle2 size={15} />
                      <span>{transferSuccess}</span>
                    </div>
                  )}

                  {showTransferForm && conflictData.current_booking && (
                    <form
                      onSubmit={handleTransferSubmit}
                      className="bg-white border border-[#EBEBEF] rounded-xl p-4 space-y-3"
                    >
                      <h3 className="text-xs font-bold text-zinc-900">
                        Request Venue Handover from Coordinator
                      </h3>
                      {transferError && (
                        <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">
                          {transferError}
                        </p>
                      )}
                      <div>
                        <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                          Urgency Reason *
                        </label>
                        <textarea
                          rows={2}
                          required
                          value={transferForm.urgency_reason}
                          onChange={(e) =>
                            setTransferForm({ ...transferForm, urgency_reason: e.target.value })
                          }
                          placeholder="Explain why your event needs priority handover of this slot..."
                          className="w-full px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 outline-none focus:border-[#EA580C]"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                            New Event Title *
                          </label>
                          <input
                            type="text"
                            required
                            value={transferForm.new_event_title}
                            onChange={(e) =>
                              setTransferForm({
                                ...transferForm,
                                new_event_title: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 outline-none focus:border-[#EA580C]"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                            New Purpose *
                          </label>
                          <input
                            type="text"
                            required
                            value={transferForm.new_purpose}
                            onChange={(e) =>
                              setTransferForm({
                                ...transferForm,
                                new_purpose: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 outline-none focus:border-[#EA580C]"
                          />
                        </div>
                      </div>
                      {isStudent && (
                        <div>
                          <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                            Your Faculty Coordinator *
                          </label>
                          <select
                            required
                            value={
                              transferForm.new_coordinator_id || bookingForm.coordinator_id
                            }
                            onChange={(e) =>
                              setTransferForm({
                                ...transferForm,
                                new_coordinator_id: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 outline-none focus:border-[#EA580C]"
                          >
                            <option value="">Select active faculty coordinator…</option>
                            {facultyResults.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.fullName || f.username} ({f.username}) ·{' '}
                                {f.department || 'Faculty'}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div className="flex justify-end">
                        <button
                          type="submit"
                          disabled={transferSubmitting}
                          className="px-4 py-2 rounded-xl bg-[#121214] hover:bg-black text-white text-xs font-semibold disabled:opacity-50"
                        >
                          {transferSubmitting ? 'Sending...' : 'Send Transfer Request'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {/* Booking Form */}
              <form onSubmit={handleBookingSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                      Event Title *
                    </label>
                    <input
                      type="text"
                      required
                      value={bookingForm.event_title}
                      onChange={(e) =>
                        setBookingForm({ ...bookingForm, event_title: e.target.value })
                      }
                      placeholder="e.g. Department Technical Symposium"
                      className="w-full px-3.5 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-sm text-zinc-900 outline-none focus:bg-white focus:border-[#EA580C] focus:ring-4 focus:ring-orange-500/10"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                      Purpose / Event Brief *
                    </label>
                    <textarea
                      rows={2}
                      required
                      value={bookingForm.purpose}
                      onChange={(e) =>
                        setBookingForm({ ...bookingForm, purpose: e.target.value })
                      }
                      placeholder="Describe event agenda, speakers, and resource needs..."
                      className="w-full px-3.5 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-sm text-zinc-900 outline-none focus:bg-white focus:border-[#EA580C] focus:ring-4 focus:ring-orange-500/10"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                      Expected Headcount (Max {bookingVenue.capacity}) *
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={bookingVenue.capacity}
                      required
                      value={bookingForm.expected_headcount}
                      onChange={(e) =>
                        setBookingForm({
                          ...bookingForm,
                          expected_headcount: e.target.value,
                        })
                      }
                      placeholder={`1 – ${bookingVenue.capacity}`}
                      className="w-full px-3.5 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-sm text-zinc-900 outline-none focus:bg-white focus:border-[#EA580C] focus:ring-4 focus:ring-orange-500/10"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                      Organizing Department *
                    </label>
                    <input
                      type="text"
                      required
                      value={bookingForm.department}
                      onChange={(e) =>
                        setBookingForm({ ...bookingForm, department: e.target.value })
                      }
                      placeholder="e.g. CSE, AIML, CENTRAL"
                      className="w-full px-3.5 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-sm text-zinc-900 uppercase outline-none focus:bg-white focus:border-[#EA580C] focus:ring-4 focus:ring-orange-500/10"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                      Booking Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={bookingForm.booking_date}
                      onChange={(e) =>
                        setBookingForm({ ...bookingForm, booking_date: e.target.value })
                      }
                      className="w-full px-3.5 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-sm text-zinc-900 outline-none focus:bg-white focus:border-[#EA580C] focus:ring-4 focus:ring-orange-500/10"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                        Start Time *
                      </label>
                      <input
                        type="time"
                        required
                        value={bookingForm.start_time}
                        onChange={(e) =>
                          setBookingForm({ ...bookingForm, start_time: e.target.value })
                        }
                        className="w-full px-3 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-sm text-zinc-900 outline-none focus:bg-white focus:border-[#EA580C]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                        End Time *
                      </label>
                      <input
                        type="time"
                        required
                        value={bookingForm.end_time}
                        onChange={(e) =>
                          setBookingForm({ ...bookingForm, end_time: e.target.value })
                        }
                        className="w-full px-3 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-sm text-zinc-900 outline-none focus:bg-white focus:border-[#EA580C]"
                      />
                    </div>
                  </div>
                </div>

                {/* Mandatory Faculty Coordinator Lookup for Students */}
                {isStudent && (
                  <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-zinc-900">
                        Faculty Coordinator Assignment (Mandatory for Students) *
                      </label>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        Search active faculty members via live directory and select your supervising coordinator.
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Search
                          size={14}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                        />
                        <input
                          type="text"
                          value={facultyQuery}
                          onChange={(e) => setFacultyQuery(e.target.value)}
                          placeholder="Search by username (e.g. RLFAC), email, or phone..."
                          className="w-full pl-9 pr-3 py-2 bg-white border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 outline-none focus:border-[#EA580C]"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => searchFacultyCoordinators(facultyQuery)}
                        disabled={facultySearching}
                        className="px-3.5 py-2 bg-[#141E2B] hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition disabled:opacity-50"
                      >
                        {facultySearching ? 'Searching...' : 'Lookup Faculty'}
                      </button>
                    </div>

                    {facultySearchNote && (
                      <p className="text-[11px] text-[#B45309]">{facultySearchNote}</p>
                    )}

                    <select
                      required
                      value={bookingForm.coordinator_id}
                      onChange={(e) =>
                        setBookingForm({ ...bookingForm, coordinator_id: e.target.value })
                      }
                      className="w-full px-3.5 py-2.5 bg-white border border-[#EBEBEF] rounded-xl text-xs font-medium text-zinc-900 outline-none focus:border-[#EA580C]"
                    >
                      <option value="">
                        {facultyResults.length > 0
                          ? 'Select an active Faculty Coordinator…'
                          : 'Search above to load active Faculty Coordinators…'}
                      </option>
                      {facultyResults.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.fullName || f.username} ({f.username}) —{' '}
                          {f.department || 'Institutional Faculty'}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#EBEBEF]">
                  <button
                    type="button"
                    onClick={closeBookingModal}
                    className="px-4 py-2.5 rounded-xl border border-[#EBEBEF] text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={bookingSubmitting}
                    className="px-5 py-2.5 rounded-xl bg-[#EA580C] hover:bg-[#C2410C] text-white text-xs font-semibold shadow-sm transition disabled:opacity-50"
                  >
                    {bookingSubmitting ? 'Persisting Request...' : 'Submit Booking Request'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ─── ADD CAMPUS VENUE MODAL (SUPER_ADMIN / MGT) ─── */}
      {showAddVenue && canCreateVenue && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] flex items-center justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label="Add Campus Venue"
        >
          <div className="bg-white border border-[#EBEBEF] rounded-2xl w-full max-w-xl shadow-xl overflow-hidden my-auto">
            <div className="bg-[#141E2B] text-white px-6 py-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-orange-300 font-semibold">
                  Master Venue Directory
                </p>
                <h2 className="text-base font-bold mt-0.5">Add New Campus Venue</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowAddVenue(false)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition"
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
              {addVenueError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2">
                  <AlertCircle size={15} className="text-rose-600 shrink-0 mt-0.5" />
                  <span>{addVenueError}</span>
                </div>
              )}

              {addVenueMessage && (
                <div className="space-y-3">
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-[#15803D] text-xs font-semibold flex items-center gap-2">
                    <CheckCircle2 size={15} />
                    <span>{addVenueMessage}</span>
                  </div>
                  {addVenueReceipt && (
                    <DbReceiptCard
                      receipt={addVenueReceipt}
                      title="Venue Registered in PostgreSQL"
                    />
                  )}
                </div>
              )}

              <form onSubmit={handleAddVenueSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Venue Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={addVenueForm.name}
                    onChange={(e) =>
                      setAddVenueForm({ ...addVenueForm, name: e.target.value })
                    }
                    placeholder="e.g. Sir M. Visvesvaraya Auditorium"
                    className="w-full px-3.5 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-sm text-zinc-900 outline-none focus:border-[#EA580C]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Venue Type *
                  </label>
                  <select
                    required
                    value={addVenueForm.type}
                    onChange={(e) =>
                      setAddVenueForm({ ...addVenueForm, type: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-sm text-zinc-900 outline-none focus:border-[#EA580C]"
                  >
                    <option value="AUDITORIUM">AUDITORIUM</option>
                    <option value="SEMINAR_HALL">SEMINAR_HALL</option>
                    <option value="CONFERENCE_ROOM">CONFERENCE_ROOM</option>
                    <option value="LAB">LAB</option>
                    <option value="OPEN_AIR_THEATRE">OPEN_AIR_THEATRE</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Seating Capacity *
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={addVenueForm.capacity}
                    onChange={(e) =>
                      setAddVenueForm({ ...addVenueForm, capacity: e.target.value })
                    }
                    placeholder="e.g. 250"
                    className="w-full px-3.5 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-sm text-zinc-900 outline-none focus:border-[#EA580C]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Venue Code (Optional)
                  </label>
                  <input
                    type="text"
                    value={addVenueForm.code}
                    onChange={(e) =>
                      setAddVenueForm({ ...addVenueForm, code: e.target.value })
                    }
                    placeholder="Auto VEN-XXX if empty"
                    className="w-full px-3.5 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-sm font-mono uppercase text-zinc-900 outline-none focus:border-[#EA580C]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Owning Department
                  </label>
                  <input
                    type="text"
                    value={addVenueForm.department}
                    onChange={(e) =>
                      setAddVenueForm({ ...addVenueForm, department: e.target.value })
                    }
                    placeholder="e.g. CENTRAL, CSE"
                    className="w-full px-3.5 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-sm uppercase text-zinc-900 outline-none focus:border-[#EA580C]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Building
                  </label>
                  <input
                    type="text"
                    value={addVenueForm.building}
                    onChange={(e) =>
                      setAddVenueForm({ ...addVenueForm, building: e.target.value })
                    }
                    placeholder="e.g. Main Block"
                    className="w-full px-3.5 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-sm text-zinc-900 outline-none focus:border-[#EA580C]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Floor
                  </label>
                  <input
                    type="text"
                    value={addVenueForm.floor}
                    onChange={(e) =>
                      setAddVenueForm({ ...addVenueForm, floor: e.target.value })
                    }
                    placeholder="e.g. 2nd Floor"
                    className="w-full px-3.5 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-sm text-zinc-900 outline-none focus:border-[#EA580C]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Location Details
                  </label>
                  <input
                    type="text"
                    value={addVenueForm.location_details}
                    onChange={(e) =>
                      setAddVenueForm({
                        ...addVenueForm,
                        location_details: e.target.value,
                      })
                    }
                    placeholder="Wing, landmark, or access instructions..."
                    className="w-full px-3.5 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-sm text-zinc-900 outline-none focus:border-[#EA580C]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Amenities (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={addVenueForm.amenitiesText}
                    onChange={(e) =>
                      setAddVenueForm({ ...addVenueForm, amenitiesText: e.target.value })
                    }
                    placeholder="Projector, AC, Audio System, Podium, Wi-Fi"
                    className="w-full px-3.5 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-sm text-zinc-900 outline-none focus:border-[#EA580C]"
                  />
                </div>

                <div className="sm:col-span-2 flex justify-end gap-2 pt-2 border-t border-[#EBEBEF]">
                  <button
                    type="button"
                    onClick={() => setShowAddVenue(false)}
                    className="px-4 py-2.5 rounded-xl border border-[#EBEBEF] text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={addVenueLoading}
                    className="px-5 py-2.5 rounded-xl bg-[#121214] hover:bg-black text-white text-xs font-semibold disabled:opacity-50"
                  >
                    {addVenueLoading ? 'Creating...' : 'Create Venue'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ─── EDIT CAMPUS VENUE MODAL (SUPER_ADMIN) ─── */}
      {editVenue && isSuperAdmin && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] flex items-center justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label="Edit Campus Venue"
        >
          <div className="bg-white border border-[#EBEBEF] rounded-2xl w-full max-w-xl shadow-xl overflow-hidden my-auto">
            <div className="bg-[#141E2B] text-white px-6 py-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-orange-300 font-semibold">
                  Super Admin Venue Control
                </p>
                <h2 className="text-base font-bold mt-0.5">Edit Venue: {editVenue.name}</h2>
              </div>
              <button
                type="button"
                onClick={() => setEditVenue(null)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition"
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
              {editVenueError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2">
                  <AlertCircle size={15} className="text-rose-600 shrink-0 mt-0.5" />
                  <span>{editVenueError}</span>
                </div>
              )}

              {editVenueMessage && (
                <div className="space-y-3">
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-[#15803D] text-xs font-semibold flex items-center gap-2">
                    <CheckCircle2 size={15} />
                    <span>{editVenueMessage}</span>
                  </div>
                  {editVenueReceipt && (
                    <DbReceiptCard
                      receipt={editVenueReceipt}
                      title="Venue Update Persisted to PostgreSQL"
                    />
                  )}
                </div>
              )}

              <form onSubmit={handleEditVenueSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Venue Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={editVenueForm.name}
                    onChange={(e) =>
                      setEditVenueForm({ ...editVenueForm, name: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-sm text-zinc-900 outline-none focus:border-[#EA580C]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Venue Type *
                  </label>
                  <select
                    required
                    value={editVenueForm.type}
                    onChange={(e) =>
                      setEditVenueForm({ ...editVenueForm, type: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-sm text-zinc-900 outline-none focus:border-[#EA580C]"
                  >
                    <option value="AUDITORIUM">AUDITORIUM</option>
                    <option value="SEMINAR_HALL">SEMINAR_HALL</option>
                    <option value="CONFERENCE_ROOM">CONFERENCE_ROOM</option>
                    <option value="LAB">LAB</option>
                    <option value="OPEN_AIR_THEATRE">OPEN_AIR_THEATRE</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Seating Capacity *
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={editVenueForm.capacity}
                    onChange={(e) =>
                      setEditVenueForm({ ...editVenueForm, capacity: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-sm text-zinc-900 outline-none focus:border-[#EA580C]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Venue Code
                  </label>
                  <input
                    type="text"
                    value={editVenueForm.code}
                    onChange={(e) =>
                      setEditVenueForm({ ...editVenueForm, code: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-sm font-mono uppercase text-zinc-900 outline-none focus:border-[#EA580C]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Owning Department
                  </label>
                  <input
                    type="text"
                    value={editVenueForm.department}
                    onChange={(e) =>
                      setEditVenueForm({ ...editVenueForm, department: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-sm uppercase text-zinc-900 outline-none focus:border-[#EA580C]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Building
                  </label>
                  <input
                    type="text"
                    value={editVenueForm.building}
                    onChange={(e) =>
                      setEditVenueForm({ ...editVenueForm, building: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-sm text-zinc-900 outline-none focus:border-[#EA580C]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Floor
                  </label>
                  <input
                    type="text"
                    value={editVenueForm.floor}
                    onChange={(e) =>
                      setEditVenueForm({ ...editVenueForm, floor: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-sm text-zinc-900 outline-none focus:border-[#EA580C]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Location Details
                  </label>
                  <input
                    type="text"
                    value={editVenueForm.location_details}
                    onChange={(e) =>
                      setEditVenueForm({
                        ...editVenueForm,
                        location_details: e.target.value,
                      })
                    }
                    className="w-full px-3.5 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-sm text-zinc-900 outline-none focus:border-[#EA580C]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Amenities (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={editVenueForm.amenitiesText}
                    onChange={(e) =>
                      setEditVenueForm({ ...editVenueForm, amenitiesText: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-sm text-zinc-900 outline-none focus:border-[#EA580C]"
                  />
                </div>

                <div className="sm:col-span-2 flex items-center justify-between bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3.5 py-2.5">
                  <span className="text-xs font-semibold text-zinc-700">
                    Active Status (Available for campus bookings)
                  </span>
                  <input
                    type="checkbox"
                    checked={editVenueForm.is_active}
                    onChange={(e) =>
                      setEditVenueForm({ ...editVenueForm, is_active: e.target.checked })
                    }
                    className="h-4 w-4 accent-[#EA580C]"
                  />
                </div>

                <div className="sm:col-span-2 flex justify-end gap-2 pt-2 border-t border-[#EBEBEF]">
                  <button
                    type="button"
                    onClick={() => setEditVenue(null)}
                    className="px-4 py-2.5 rounded-xl border border-[#EBEBEF] text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={editVenueLoading}
                    className="px-5 py-2.5 rounded-xl bg-[#121214] hover:bg-black text-white text-xs font-semibold disabled:opacity-50"
                  >
                    {editVenueLoading ? 'Updating...' : 'Save Venue Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
