import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react-native';
import api from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import Colors from '../../theme/colors';
import DbReceiptCard from '../DbReceiptCard';
import {
  VENUE_HOURS,
  VENUE_TYPES,
  getStatusTone,
  getTodayIsoDate,
  getUserRoles,
  shiftIsoDate,
} from './constants';

const IST_OFFSET_MS = 330 * 60 * 1000;

function parseMinutesFromSlot(slot, isEnd = false) {
  const raw = isEnd ? slot.end_time : slot.start_time;
  if (raw && typeof raw === 'string') {
    const m = raw.trim().match(/^(\d{1,2}):(\d{2})/);
    if (m) return Number(m[1]) * 60 + Number(m[2]);
  }
  const iso = isEnd ? slot.event_end_time : slot.event_start_time;
  if (iso) {
    const d = new Date(new Date(iso).getTime() + IST_OFFSET_MS);
    if (!Number.isNaN(d.getTime())) {
      return d.getUTCHours() * 60 + d.getUTCMinutes();
    }
  }
  return null;
}

function getSlotForHour(bookedSlots, hour) {
  const hStart = hour * 60;
  const hEnd = (hour + 1) * 60;
  for (const slot of bookedSlots || []) {
    const sMin = parseMinutesFromSlot(slot, false);
    const eMin = parseMinutesFromSlot(slot, true);
    if (sMin !== null && eMin !== null && sMin < hEnd && eMin > hStart) {
      return slot;
    }
  }
  return null;
}

function StatusPill({ status }) {
  const tone = getStatusTone(status);
  return (
    <View style={[styles.statusBadge, { backgroundColor: tone.bg, borderColor: tone.border }]}>
      <Text style={[styles.statusBadgeText, { color: tone.text }]}>
        {String(status || 'UNKNOWN').replace(/_/g, ' ')}
      </Text>
    </View>
  );
}

export default function MobileVenueCatalog() {
  const { user } = useAuth();
  const roles = getUserRoles(user);
  const canReview = roles.isSuper || roles.isHod || roles.isManagement || roles.isPrincipal;
  const canCreateVenue = roles.isSuper || roles.isManagement;
  const currentUserId = user?.id || user?.userId;

  const [subTab, setSubTab] = useState('catalog'); // 'catalog' | 'bookings' | 'approvals'
  const [selectedDate, setSelectedDate] = useState(getTodayIsoDate());
  const [dateInput, setDateInput] = useState(getTodayIsoDate());
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  const [venues, setVenues] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [receipt, setReceipt] = useState(null);

  // In-place Booking Form state
  const [bookingVenue, setBookingVenue] = useState(null);
  const [bookForm, setBookForm] = useState({
    event_title: '',
    purpose: '',
    expected_headcount: '50',
    booking_date: getTodayIsoDate(),
    start_time: '09:00',
    end_time: '10:00',
    department: user?.department || user?.sectionCode || 'CSE',
    coordinator_id: '',
  });
  const [selectedCoordinator, setSelectedCoordinator] = useState(null);
  const [coordQuery, setCoordQuery] = useState('');
  const [coordResults, setCoordResults] = useState([]);
  const [searchingCoord, setSearchingCoord] = useState(false);
  const [availabilityCheck, setAvailabilityCheck] = useState(null);
  const [occupiedSlotPreview, setOccupiedSlotPreview] = useState(null);

  // 409 Conflict & Transfer Request state
  const [conflictInfo, setConflictInfo] = useState(null);
  const [transferForm, setTransferForm] = useState({
    urgency_reason: '',
    new_event_title: '',
    new_purpose: '',
    new_coordinator_id: '',
  });

  // My Bookings detail & actions
  const [expandedDetailId, setExpandedDetailId] = useState(null);
  const [bookingDetail, setBookingDetail] = useState(null);
  const [coordTermsMsg, setCoordTermsMsg] = useState('');
  const [showAllScopedBookings, setShowAllScopedBookings] = useState(false);

  // Approval Queue state
  const [showResolvedQueue, setShowResolvedQueue] = useState(false);
  const [reviewInputs, setReviewInputs] = useState({}); // { [bookingId]: { remarks, terms } }

  // New / Edit Venue management (Super Admin / MGT)
  const [showNewVenue, setShowNewVenue] = useState(false);
  const [newVenueForm, setNewVenueForm] = useState({
    name: '',
    type: 'SEMINAR_HALL',
    department: user?.department || 'CENTRAL',
    building: '',
    floor: '',
    location_details: '',
    capacity: '120',
    amenities: 'Projector, PA System, AC',
  });
  const [editingVenue, setEditingVenue] = useState(null);
  const [editVenueForm, setEditVenueForm] = useState({
    name: '',
    type: 'SEMINAR_HALL',
    department: '',
    building: '',
    floor: '',
    location_details: '',
    capacity: '',
    amenities: '',
    is_active: true,
  });

  // Change Venue for Coordinator inside My Bookings
  const [changeVenueBookingId, setChangeVenueBookingId] = useState(null);
  const [changeVenueId, setChangeVenueId] = useState('');

  const loadVenues = useCallback(async (dateVal = selectedDate, catVal = categoryFilter) => {
    setLoading(true);
    setError('');
    try {
      const params = { date: dateVal };
      if (catVal && catVal !== 'ALL') params.type = catVal;
      if (roles.isSuper) params.is_active = 'all';
      const res = await api.get('/api/v1/venues', { params });
      setVenues(Array.isArray(res.data?.venues) ? res.data.venues : []);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load venues.');
    } finally {
      setLoading(false);
    }
  }, [selectedDate, categoryFilter, roles.isSuper]);

  const loadBookings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [bRes, vRes] = await Promise.all([
        api.get('/api/v1/venues/bookings'),
        api.get('/api/v1/venues').catch(() => null),
      ]);
      setBookings(Array.isArray(bRes.data?.bookings) ? bRes.data.bookings : []);
      if (Array.isArray(vRes?.data?.venues)) {
        setVenues(vRes.data.venues);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load venue bookings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (subTab === 'catalog') loadVenues(selectedDate, categoryFilter);
    else loadBookings();
  }, [subTab, selectedDate, categoryFilter, loadVenues, loadBookings]);

  const handleShiftDate = (delta) => {
    const next = delta === 0 ? getTodayIsoDate() : shiftIsoDate(selectedDate, delta);
    setSelectedDate(next);
    setDateInput(next);
    setOccupiedSlotPreview(null);
  };

  const applyManualDate = () => {
    const trimmed = dateInput.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      setError('Date must be in YYYY-MM-DD format.');
      return;
    }
    setError('');
    setSelectedDate(trimmed);
    setOccupiedSlotPreview(null);
  };

  const openBookForm = (venue, startHour = 9) => {
    const sTime = `${String(startHour).padStart(2, '0')}:00`;
    const eTime = `${String(startHour + 1).padStart(2, '0')}:00`;
    setBookingVenue(venue);
    setOccupiedSlotPreview(null);
    setConflictInfo(null);
    setAvailabilityCheck(null);
    setSuccessMsg('');
    setReceipt(null);
    setBookForm((prev) => ({
      ...prev,
      booking_date: selectedDate,
      start_time: sTime,
      end_time: eTime,
      expected_headcount: String(Math.min(50, Number(venue.capacity) || 50)),
      department: user?.department || user?.sectionCode || venue.department || 'CENTRAL',
    }));
  };

  const searchFacultyCoordinators = async () => {
    if (!coordQuery.trim()) return;
    setSearchingCoord(true);
    setError('');
    try {
      const res = await api.get('/api/v1/users/search', { params: { q: coordQuery.trim() } });
      const facultyOnly = (res.data?.results || []).filter((u) => u.baseRole === 'FACULTY');
      setCoordResults(facultyOnly);
      if (facultyOnly.length === 0) {
        setError('No active faculty accounts matched that search.');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Coordinator search failed.');
    } finally {
      setSearchingCoord(false);
    }
  };

  const handleCheckSlotAvailability = async () => {
    if (!bookingVenue) return;
    setBusy(true);
    setError('');
    setAvailabilityCheck(null);
    try {
      const startIso = `${bookForm.booking_date}T${bookForm.start_time}:00+05:30`;
      const endIso = `${bookForm.booking_date}T${bookForm.end_time}:00+05:30`;
      const res = await api.get('/api/v1/venues/availability', {
        params: {
          venue_id: bookingVenue.id,
          start_time: startIso,
          end_time: endIso,
        },
      });
      setAvailabilityCheck(res.data);
      if (res.data?.is_available === false && res.data?.current_booking) {
        setConflictInfo({
          message: res.data.message,
          current_booking: res.data.current_booking,
        });
      } else {
        setConflictInfo(null);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Availability check failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitBooking = async () => {
    if (!bookingVenue) return;
    if (!bookForm.event_title.trim() || !bookForm.purpose.trim()) {
      setError('Event title and purpose are required.');
      return;
    }
    if (roles.isStudent && !bookForm.coordinator_id) {
      setError('Students must search and select an active Faculty Coordinator.');
      return;
    }
    setBusy(true);
    setError('');
    setSuccessMsg('');
    setConflictInfo(null);
    setReceipt(null);

    try {
      const payload = {
        venue_id: bookingVenue.id,
        event_title: bookForm.event_title.trim(),
        purpose: bookForm.purpose.trim(),
        expected_headcount: Number(bookForm.expected_headcount || 10),
        booking_date: bookForm.booking_date,
        start_time: bookForm.start_time,
        end_time: bookForm.end_time,
        department: bookForm.department.trim() || 'CENTRAL',
        coordinator_id: bookForm.coordinator_id || undefined,
      };
      const res = await api.post('/api/v1/venues/bookings', payload);
      setSuccessMsg(
        `${res.data?.message || 'Booking submitted'} (${res.data?.booking?.booking_code || 'Confirmed'})`
      );
      setReceipt(res.data?.dbReceipt || null);
      setBookingVenue(null);
      await loadVenues(selectedDate, categoryFilter);
    } catch (err) {
      if (err.response?.status === 409) {
        setConflictInfo({
          message: err.response.data?.message || 'Place already occupied... kindly look for another one.',
          current_booking: err.response.data?.current_booking || null,
        });
        setError(err.response.data?.message || '409 Conflict: Slot already occupied.');
      } else {
        setError(err.response?.data?.error || err.response?.data?.message || 'Booking submission failed.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRequestTransfer = async (bookingId) => {
    if (!transferForm.urgency_reason.trim() || !transferForm.new_event_title.trim() || !transferForm.new_purpose.trim()) {
      setError('Urgency reason, proposed event title, and purpose are required.');
      return;
    }
    const coordId = transferForm.new_coordinator_id || bookForm.coordinator_id;
    if (roles.isStudent && !coordId) {
      setError('Select a Faculty Coordinator above for the transfer request.');
      return;
    }
    setBusy(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await api.post(`/api/v1/venues/bookings/${bookingId}/transfer-request`, {
        urgency_reason: transferForm.urgency_reason.trim(),
        new_event_title: transferForm.new_event_title.trim(),
        new_purpose: transferForm.new_purpose.trim(),
        new_coordinator_id: coordId || undefined,
      });
      setSuccessMsg(res.data?.message || 'Transfer request sent to current coordinator.');
      setConflictInfo(null);
      setTransferForm({ urgency_reason: '', new_event_title: '', new_purpose: '', new_coordinator_id: '' });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit transfer request.');
    } finally {
      setBusy(false);
    }
  };

  const handleInspectTimeline = async (bookingId) => {
    if (expandedDetailId === bookingId) {
      setExpandedDetailId(null);
      setBookingDetail(null);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await api.get(`/api/v1/venues/bookings/${bookingId}`);
      setBookingDetail(res.data?.booking || null);
      setExpandedDetailId(bookingId);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load audit timeline.');
    } finally {
      setBusy(false);
    }
  };

  const handleCancelBooking = (booking) => {
    Alert.alert(
      'Cancel Venue Booking?',
      `Cancelling ${booking.booking_code} immediately releases the slot and activates a 24-hour venue cooldown on this venue.`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Cancel Booking',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            setError('');
            setSuccessMsg('');
            try {
              const res = await api.post(`/api/v1/venues/bookings/${booking.id}/cancel`, {
                cancellation_reason: 'Cancelled via RLJIT Arcade Mobile',
              });
              setSuccessMsg(res.data?.message || 'Booking cancelled.');
              setExpandedDetailId(null);
              await loadBookings();
            } catch (err) {
              setError(err.response?.data?.error || 'Failed to cancel booking.');
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  const handleCoordinatorTerms = async (bookingId, agree) => {
    setBusy(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await api.patch(`/api/v1/venues/bookings/${bookingId}/coordinator-response`, {
        agree_to_terms: agree,
        coordinator_message: coordTermsMsg.trim() || (agree ? 'Agreed to imposed terms' : 'Counter-proposal requested'),
      });
      setSuccessMsg(res.data?.message || 'Coordinator response recorded.');
      setCoordTermsMsg('');
      await loadBookings();
      const detailRes = await api.get(`/api/v1/venues/bookings/${bookingId}`).catch(() => null);
      if (detailRes?.data?.booking) setBookingDetail(detailRes.data.booking);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit coordinator response.');
    } finally {
      setBusy(false);
    }
  };

  const handleTransferRespond = async (transferId, action, bookingId) => {
    setBusy(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await api.patch(`/api/v1/venues/transfer-requests/${transferId}/respond`, {
        action,
        response_message: action === 'APPROVE' ? 'Approved handover' : 'Declined handover',
      });
      setSuccessMsg(res.data?.message || `Transfer ${action.toLowerCase()}d.`);
      await loadBookings();
      const detailRes = await api.get(`/api/v1/venues/bookings/${bookingId}`).catch(() => null);
      if (detailRes?.data?.booking) setBookingDetail(detailRes.data.booking);
    } catch (err) {
      setError(err.response?.data?.error || 'Transfer response failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleReviewBooking = async (bookingId, action) => {
    const entry = reviewInputs[bookingId] || {};
    const termsArr = (entry.terms || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    if (action === 'PARTIAL' && termsArr.length === 0) {
      setError('Enter at least one conditional term (one per line) for Partial Acceptance.');
      return;
    }

    setBusy(true);
    setError('');
    setSuccessMsg('');
    setReceipt(null);
    try {
      const res = await api.patch(`/api/v1/venues/bookings/${bookingId}/review`, {
        action,
        remarks: entry.remarks || undefined,
        terms_and_conditions: action === 'PARTIAL' ? termsArr : undefined,
      });
      setSuccessMsg(res.data?.message || `Booking ${action.toLowerCase()} action recorded.`);
      setReceipt(res.data?.dbReceipt || null);
      await loadBookings();
    } catch (err) {
      setError(err.response?.data?.error || 'Review action failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateVenue = async () => {
    if (!newVenueForm.name.trim() || !newVenueForm.capacity) {
      setError('Venue name and capacity are required.');
      return;
    }
    setBusy(true);
    setError('');
    setSuccessMsg('');
    setReceipt(null);
    try {
      const res = await api.post('/api/v1/venues', {
        name: newVenueForm.name.trim(),
        type: newVenueForm.type,
        department: newVenueForm.department.trim() || 'CENTRAL',
        building: newVenueForm.building.trim() || undefined,
        floor: newVenueForm.floor.trim() || undefined,
        location_details: newVenueForm.location_details.trim() || undefined,
        capacity: Number(newVenueForm.capacity),
        amenities: newVenueForm.amenities.split(',').map((a) => a.trim()).filter(Boolean),
      });
      setSuccessMsg(res.data?.message || 'Venue created.');
      setReceipt(res.data?.dbReceipt || null);
      setShowNewVenue(false);
      setNewVenueForm((p) => ({ ...p, name: '', building: '', floor: '', location_details: '' }));
      await loadVenues(selectedDate, categoryFilter);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create venue.');
    } finally {
      setBusy(false);
    }
  };

  const openEditVenue = (venue) => {
    setEditingVenue(venue);
    setShowNewVenue(false);
    setBookingVenue(null);
    const amList = Array.isArray(venue.amenities) && venue.amenities.length > 0
      ? venue.amenities
      : Array.isArray(venue.facilities)
      ? venue.facilities
      : [];
    setEditVenueForm({
      name: venue.name || '',
      type: venue.type || 'SEMINAR_HALL',
      department: venue.department || '',
      building: venue.building || '',
      floor: venue.floor || '',
      location_details: venue.location_details || '',
      capacity: String(venue.capacity || ''),
      amenities: amList.join(', '),
      is_active: venue.is_active !== false,
    });
  };

  const handleSaveEditVenue = async () => {
    if (!editingVenue) return;
    if (!editVenueForm.name.trim() || !editVenueForm.capacity) {
      setError('Venue name and capacity are required.');
      return;
    }
    setBusy(true);
    setError('');
    setSuccessMsg('');
    setReceipt(null);
    try {
      const res = await api.patch(`/api/v1/venues/${editingVenue.id}`, {
        name: editVenueForm.name.trim(),
        type: editVenueForm.type,
        department: editVenueForm.department.trim() || null,
        building: editVenueForm.building.trim() || null,
        floor: editVenueForm.floor.trim() || null,
        location_details: editVenueForm.location_details.trim() || null,
        capacity: Number(editVenueForm.capacity),
        amenities: editVenueForm.amenities.split(',').map((a) => a.trim()).filter(Boolean),
        is_active: editVenueForm.is_active,
      });
      setSuccessMsg(res.data?.message || 'Venue updated.');
      setReceipt(res.data?.dbReceipt || null);
      setEditingVenue(null);
      await loadVenues(selectedDate, categoryFilter);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update venue.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleVenueActive = async (venue) => {
    setBusy(true);
    setError('');
    setSuccessMsg('');
    setReceipt(null);
    try {
      const res = await api.patch(`/api/v1/venues/${venue.id}`, {
        is_active: !(venue.is_active !== false),
      });
      setSuccessMsg(res.data?.message || 'Venue status updated.');
      setReceipt(res.data?.dbReceipt || null);
      await loadVenues(selectedDate, categoryFilter);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to toggle venue status.');
    } finally {
      setBusy(false);
    }
  };

  const handleChangeVenue = async (booking) => {
    if (!changeVenueId) {
      setError('Select a new venue first.');
      return;
    }
    setBusy(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await api.patch(`/api/v1/venues/bookings/${booking.id}/change-venue`, {
        new_venue_id: changeVenueId,
      });
      setSuccessMsg(res.data?.message || 'Venue changed and approval hierarchy reset.');
      setChangeVenueBookingId(null);
      setChangeVenueId('');
      await loadBookings();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          'Failed to change booking venue.'
      );
    } finally {
      setBusy(false);
    }
  };

  const myBookingsList = useMemo(() => {
    if (!canReview || showAllScopedBookings) return bookings;
    return bookings.filter(
      (b) => b.initiator_id === currentUserId || b.coordinator_id === currentUserId || b.requested_by === currentUserId
    );
  }, [bookings, canReview, showAllScopedBookings, currentUserId]);

  const approvalQueueList = useMemo(() => {
    const pendingStatuses = ['PENDING_HOD', 'PENDING_MANAGEMENT', 'PENDING_PRINCIPAL', 'PARTIALLY_ACCEPTED'];
    if (showResolvedQueue) return bookings;
    return bookings.filter((b) => pendingStatuses.includes(b.status));
  }, [bookings, showResolvedQueue]);

  const canActOnStage = (booking) => {
    if (roles.isSuper) return true;
    const isSameDeptHod =
      roles.isHod &&
      (booking.department || '').toUpperCase() === (user?.department || '').toUpperCase();
    const st = booking.status;
    if (st === 'PENDING_HOD') return isSameDeptHod;
    if (st === 'PENDING_MANAGEMENT') return roles.isManagement;
    if (st === 'PENDING_PRINCIPAL') return roles.isPrincipal;
    if (st === 'PARTIALLY_ACCEPTED') {
      const stage = booking.active_terms_and_conditions?.stage || 'HOD';
      if (stage === 'HOD') return isSameDeptHod;
      if (stage === 'MANAGEMENT') return roles.isManagement;
      if (stage === 'PRINCIPAL') return roles.isPrincipal;
    }
    return false;
  };

  return (
    <View style={styles.container}>
      {/* Sub-Tabs Header */}
      <View style={styles.subTabBar}>
        <TouchableOpacity
          style={[styles.subTabBtn, subTab === 'catalog' && styles.subTabBtnActive]}
          onPress={() => setSubTab('catalog')}
          activeOpacity={0.85}
        >
          <Text style={[styles.subTabText, subTab === 'catalog' && styles.subTabTextActive]}>
            Catalog
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.subTabBtn, subTab === 'bookings' && styles.subTabBtnActive]}
          onPress={() => setSubTab('bookings')}
          activeOpacity={0.85}
        >
          <Text style={[styles.subTabText, subTab === 'bookings' && styles.subTabTextActive]}>
            My Bookings
          </Text>
        </TouchableOpacity>
        {canReview ? (
          <TouchableOpacity
            style={[styles.subTabBtn, subTab === 'approvals' && styles.subTabBtnActive]}
            onPress={() => setSubTab('approvals')}
            activeOpacity={0.85}
          >
            <Text style={[styles.subTabText, subTab === 'approvals' && styles.subTabTextActive]}>
              Approval Queue
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
      {successMsg ? (
        <View style={styles.successBox}>
          <Text style={styles.successText}>{successMsg}</Text>
        </View>
      ) : null}
      {receipt ? <DbReceiptCard receipt={receipt} title="Venue PostgreSQL Receipt" /> : null}

      {/* ─── SUB-TAB 1: CATALOG ─── */}
      {subTab === 'catalog' ? (
        <View style={styles.sectionGap}>
          {/* Date Switcher Card */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.rowCenter}>
                <Calendar size={16} color={Colors.brandOrange} />
                <Text style={styles.cardTitle}>Availability Date</Text>
              </View>
              <View style={styles.rowCenter}>
                {canCreateVenue ? (
                  <TouchableOpacity
                    style={styles.pillAction}
                    onPress={() => setShowNewVenue((v) => !v)}
                    activeOpacity={0.8}
                  >
                    <Plus size={14} color={Colors.brandOrange} />
                    <Text style={styles.pillActionText}>{showNewVenue ? 'Close' : 'New Venue'}</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={styles.iconTouch}
                  onPress={() => loadVenues(selectedDate, categoryFilter)}
                  activeOpacity={0.8}
                >
                  <RefreshCw size={16} color={Colors.textBody} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.dateRow}>
              <TouchableOpacity
                style={styles.dateNavBtn}
                onPress={() => handleShiftDate(-1)}
                activeOpacity={0.8}
              >
                <ChevronLeft size={18} color={Colors.textPrimary} />
              </TouchableOpacity>
              <TextInput
                style={styles.dateInput}
                value={dateInput}
                onChangeText={setDateInput}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={Colors.textMuted}
                onSubmitEditing={applyManualDate}
              />
              <TouchableOpacity style={styles.dateGoBtn} onPress={applyManualDate} activeOpacity={0.8}>
                <Text style={styles.dateGoText}>Go</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dateTodayBtn}
                onPress={() => handleShiftDate(0)}
                activeOpacity={0.8}
              >
                <Text style={styles.dateTodayText}>Today</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dateNavBtn}
                onPress={() => handleShiftDate(1)}
                activeOpacity={0.8}
              >
                <ChevronRight size={18} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Category Filter Chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipScroll}
            >
              {VENUE_TYPES.map((t) => {
                const active = categoryFilter === t;
                return (
                  <TouchableOpacity
                    key={t}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                    onPress={() => setCategoryFilter(t)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                      {t === 'ALL' ? 'All Venues' : t.replace(/_/g, ' ')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Optional New Venue Form (Super Admin / Management) */}
          {showNewVenue && canCreateVenue ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Create Campus Venue</Text>
              <Text style={styles.label}>Venue Name</Text>
              <TextInput
                style={styles.input}
                value={newVenueForm.name}
                onChangeText={(v) => setNewVenueForm((p) => ({ ...p, name: v }))}
                placeholder="e.g. Sir M. Visvesvaraya Auditorium"
                placeholderTextColor={Colors.textMuted}
              />
              <Text style={styles.label}>Category / Type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
                {VENUE_TYPES.filter((x) => x !== 'ALL').map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.filterChip, newVenueForm.type === t && styles.filterChipActive]}
                    onPress={() => setNewVenueForm((p) => ({ ...p, type: t }))}
                  >
                    <Text style={[styles.filterChipText, newVenueForm.type === t && styles.filterChipTextActive]}>
                      {t.replace(/_/g, ' ')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={styles.twoCol}>
                <View style={styles.half}>
                  <Text style={styles.label}>Capacity</Text>
                  <TextInput
                    style={styles.input}
                    value={newVenueForm.capacity}
                    onChangeText={(v) => setNewVenueForm((p) => ({ ...p, capacity: v }))}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.half}>
                  <Text style={styles.label}>Department</Text>
                  <TextInput
                    style={styles.input}
                    value={newVenueForm.department}
                    onChangeText={(v) => setNewVenueForm((p) => ({ ...p, department: v.toUpperCase() }))}
                    autoCapitalize="characters"
                  />
                </View>
              </View>
              <View style={styles.twoCol}>
                <View style={styles.half}>
                  <Text style={styles.label}>Building</Text>
                  <TextInput
                    style={styles.input}
                    value={newVenueForm.building}
                    onChangeText={(v) => setNewVenueForm((p) => ({ ...p, building: v }))}
                    placeholder="Admin Block"
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>
                <View style={styles.half}>
                  <Text style={styles.label}>Floor</Text>
                  <TextInput
                    style={styles.input}
                    value={newVenueForm.floor}
                    onChangeText={(v) => setNewVenueForm((p) => ({ ...p, floor: v }))}
                    placeholder="Ground / 2nd"
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>
              </View>
              <Text style={styles.label}>Location Details</Text>
              <TextInput
                style={styles.input}
                value={newVenueForm.location_details}
                onChangeText={(v) => setNewVenueForm((p) => ({ ...p, location_details: v }))}
                placeholder="East Wing, Ground Floor"
                placeholderTextColor={Colors.textMuted}
              />
              <Text style={styles.label}>Amenities (comma-separated)</Text>
              <TextInput
                style={styles.input}
                value={newVenueForm.amenities}
                onChangeText={(v) => setNewVenueForm((p) => ({ ...p, amenities: v }))}
              />
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={handleCreateVenue}
                disabled={busy}
                activeOpacity={0.88}
              >
                {busy ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.primaryBtnText}>Save Campus Venue</Text>}
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Edit Venue Card (Super Admin) */}
          {editingVenue && roles.isSuper ? (
            <View style={[styles.card, styles.highlightCard]}>
              <View style={styles.cardHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.overline}>EDIT VENUE · {editingVenue.code || editingVenue.type}</Text>
                  <Text style={styles.cardTitle}>{editingVenue.name}</Text>
                </View>
                <TouchableOpacity
                  style={styles.secondarySmallBtn}
                  onPress={() => setEditingVenue(null)}
                >
                  <Text style={styles.secondarySmallText}>Close</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Venue Name *</Text>
              <TextInput
                style={styles.input}
                value={editVenueForm.name}
                onChangeText={(v) => setEditVenueForm((p) => ({ ...p, name: v }))}
              />

              <Text style={styles.label}>Category / Type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
                {VENUE_TYPES.filter((x) => x !== 'ALL').map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.filterChip, editVenueForm.type === t && styles.filterChipActive]}
                    onPress={() => setEditVenueForm((p) => ({ ...p, type: t }))}
                  >
                    <Text style={[styles.filterChipText, editVenueForm.type === t && styles.filterChipTextActive]}>
                      {t.replace(/_/g, ' ')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={styles.twoCol}>
                <View style={styles.half}>
                  <Text style={styles.label}>Capacity *</Text>
                  <TextInput
                    style={styles.input}
                    value={editVenueForm.capacity}
                    onChangeText={(v) => setEditVenueForm((p) => ({ ...p, capacity: v }))}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.half}>
                  <Text style={styles.label}>Department</Text>
                  <TextInput
                    style={styles.input}
                    value={editVenueForm.department}
                    onChangeText={(v) => setEditVenueForm((p) => ({ ...p, department: v.toUpperCase() }))}
                    autoCapitalize="characters"
                  />
                </View>
              </View>

              <View style={styles.twoCol}>
                <View style={styles.half}>
                  <Text style={styles.label}>Building</Text>
                  <TextInput
                    style={styles.input}
                    value={editVenueForm.building}
                    onChangeText={(v) => setEditVenueForm((p) => ({ ...p, building: v }))}
                  />
                </View>
                <View style={styles.half}>
                  <Text style={styles.label}>Floor</Text>
                  <TextInput
                    style={styles.input}
                    value={editVenueForm.floor}
                    onChangeText={(v) => setEditVenueForm((p) => ({ ...p, floor: v }))}
                  />
                </View>
              </View>

              <Text style={styles.label}>Location Details</Text>
              <TextInput
                style={styles.input}
                value={editVenueForm.location_details}
                onChangeText={(v) => setEditVenueForm((p) => ({ ...p, location_details: v }))}
              />

              <Text style={styles.label}>Amenities (comma-separated)</Text>
              <TextInput
                style={styles.input}
                value={editVenueForm.amenities}
                onChangeText={(v) => setEditVenueForm((p) => ({ ...p, amenities: v }))}
              />

              <TouchableOpacity
                style={[styles.filterChip, editVenueForm.is_active && styles.filterChipActive]}
                onPress={() => setEditVenueForm((p) => ({ ...p, is_active: !p.is_active }))}
              >
                <Text style={[styles.filterChipText, editVenueForm.is_active && styles.filterChipTextActive]}>
                  Status: {editVenueForm.is_active ? 'Active (Bookable)' : 'Inactive (Disabled)'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={handleSaveEditVenue}
                disabled={busy}
                activeOpacity={0.88}
              >
                {busy ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.primaryBtnText}>Update Venue Details</Text>}
              </TouchableOpacity>
            </View>
          ) : null}

          {/* In-Place Book Venue Drawer Card */}
          {bookingVenue ? (
            <View style={[styles.card, styles.highlightCard]}>
              <View style={styles.cardHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.overline}>BOOK VENUE · {bookingVenue.code || bookingVenue.type}</Text>
                  <Text style={styles.cardTitle}>{bookingVenue.name}</Text>
                </View>
                <TouchableOpacity
                  style={styles.secondarySmallBtn}
                  onPress={() => {
                    setBookingVenue(null);
                    setConflictInfo(null);
                  }}
                >
                  <Text style={styles.secondarySmallText}>Close</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Event Title *</Text>
              <TextInput
                style={styles.input}
                value={bookForm.event_title}
                onChangeText={(v) => setBookForm((p) => ({ ...p, event_title: v }))}
                placeholder="e.g. Technical Symposium / Guest Lecture"
                placeholderTextColor={Colors.textMuted}
              />

              <Text style={styles.label}>Purpose *</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={bookForm.purpose}
                onChangeText={(v) => setBookForm((p) => ({ ...p, purpose: v }))}
                placeholder="Describe event purpose and setup requirements"
                placeholderTextColor={Colors.textMuted}
                multiline
              />

              <View style={styles.twoCol}>
                <View style={styles.half}>
                  <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
                  <TextInput
                    style={styles.input}
                    value={bookForm.booking_date}
                    onChangeText={(v) => setBookForm((p) => ({ ...p, booking_date: v }))}
                  />
                </View>
                <View style={styles.half}>
                  <Text style={styles.label}>Headcount (Max {bookingVenue.capacity})</Text>
                  <TextInput
                    style={styles.input}
                    value={bookForm.expected_headcount}
                    onChangeText={(v) => setBookForm((p) => ({ ...p, expected_headcount: v }))}
                    keyboardType="number-pad"
                  />
                </View>
              </View>

              <View style={styles.twoCol}>
                <View style={styles.half}>
                  <Text style={styles.label}>Start Time (HH:MM)</Text>
                  <TextInput
                    style={styles.input}
                    value={bookForm.start_time}
                    onChangeText={(v) => setBookForm((p) => ({ ...p, start_time: v }))}
                    placeholder="09:00"
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>
                <View style={styles.half}>
                  <Text style={styles.label}>End Time (HH:MM)</Text>
                  <TextInput
                    style={styles.input}
                    value={bookForm.end_time}
                    onChangeText={(v) => setBookForm((p) => ({ ...p, end_time: v }))}
                    placeholder="11:00"
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>
              </View>

              <Text style={styles.label}>Department</Text>
              <TextInput
                style={styles.input}
                value={bookForm.department}
                onChangeText={(v) => setBookForm((p) => ({ ...p, department: v.toUpperCase() }))}
                autoCapitalize="characters"
              />

              {/* Faculty Coordinator Search (Required for Students, Optional for others) */}
              <Text style={styles.label}>
                Faculty Coordinator {roles.isStudent ? '(Required)' : '(Optional — defaults to you)'}
              </Text>
              {selectedCoordinator ? (
                <View style={styles.selectedCoordBox}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.selectedCoordName}>
                      {selectedCoordinator.fullName || selectedCoordinator.username}
                    </Text>
                    <Text style={styles.metaText}>
                      {selectedCoordinator.username} · {selectedCoordinator.department || 'Faculty'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.secondarySmallBtn}
                    onPress={() => {
                      setSelectedCoordinator(null);
                      setBookForm((p) => ({ ...p, coordinator_id: '' }));
                      setTransferForm((p) => ({ ...p, new_coordinator_id: '' }));
                    }}
                  >
                    <Text style={styles.secondarySmallText}>Change</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.searchCoordBox}>
                  <View style={styles.searchRow}>
                    <TextInput
                      style={[styles.input, { flex: 1, marginBottom: 0 }]}
                      value={coordQuery}
                      onChangeText={setCoordQuery}
                      placeholder="Search faculty ID, email, or phone..."
                      placeholderTextColor={Colors.textMuted}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      style={styles.searchBtn}
                      onPress={searchFacultyCoordinators}
                      disabled={searchingCoord}
                      activeOpacity={0.85}
                    >
                      {searchingCoord ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Search size={18} color="#FFFFFF" />
                      )}
                    </TouchableOpacity>
                  </View>
                  {coordResults.map((f) => (
                    <TouchableOpacity
                      key={f.id}
                      style={styles.coordResultRow}
                      onPress={() => {
                        setSelectedCoordinator(f);
                        setBookForm((p) => ({ ...p, coordinator_id: f.id }));
                        setTransferForm((p) => ({ ...p, new_coordinator_id: f.id }));
                        setCoordResults([]);
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.coordResultName}>{f.fullName || f.username}</Text>
                      <Text style={styles.metaText}>
                        {f.username} · {f.department || 'Faculty'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {availabilityCheck ? (
                <View
                  style={[
                    styles.infoBanner,
                    availabilityCheck.is_available ? styles.emeraldBanner : styles.roseBanner,
                  ]}
                >
                  <Text
                    style={[
                      styles.infoBannerText,
                      { color: availabilityCheck.is_available ? Colors.statusEmerald : Colors.statusRose },
                    ]}
                  >
                    {availabilityCheck.message}
                  </Text>
                </View>
              ) : null}

              {/* 409 Conflict Coordinator Info + Handover Request */}
              {conflictInfo?.current_booking ? (
                <View style={styles.conflictCard}>
                  <Text style={styles.conflictTitle}>Slot Occupied · {conflictInfo.current_booking.booking_code}</Text>
                  <Text style={styles.metaText}>{conflictInfo.message}</Text>
                  <Text style={styles.conflictDetail}>
                    Event: {conflictInfo.current_booking.event_title} ({conflictInfo.current_booking.status})
                  </Text>
                  {conflictInfo.current_booking.coordinator ? (
                    <View style={styles.coordContactCard}>
                      <Text style={styles.label}>Current Coordinator Contact</Text>
                      <Text style={styles.selectedCoordName}>
                        {conflictInfo.current_booking.coordinator.name} ({conflictInfo.current_booking.coordinator.username})
                      </Text>
                      <Text style={styles.metaText}>
                        {conflictInfo.current_booking.coordinator.designation} · {conflictInfo.current_booking.coordinator.department} · Cabin {conflictInfo.current_booking.coordinator.cabin_room}
                      </Text>
                      <Text style={styles.metaText}>
                        Email: {conflictInfo.current_booking.coordinator.email || '—'} · Phone: {conflictInfo.current_booking.coordinator.phone || '—'}
                      </Text>
                    </View>
                  ) : null}

                  <Text style={styles.label}>Urgent Handover / Transfer Reason</Text>
                  <TextInput
                    style={styles.input}
                    value={transferForm.urgency_reason}
                    onChangeText={(v) => setTransferForm((p) => ({ ...p, urgency_reason: v }))}
                    placeholder="Explain institutional urgency for transfer"
                    placeholderTextColor={Colors.textMuted}
                  />
                  <Text style={styles.label}>Proposed Event Title</Text>
                  <TextInput
                    style={styles.input}
                    value={transferForm.new_event_title}
                    onChangeText={(v) => setTransferForm((p) => ({ ...p, new_event_title: v }))}
                    placeholder={bookForm.event_title || 'Proposed event title'}
                    placeholderTextColor={Colors.textMuted}
                  />
                  <Text style={styles.label}>Proposed Purpose</Text>
                  <TextInput
                    style={styles.input}
                    value={transferForm.new_purpose}
                    onChangeText={(v) => setTransferForm((p) => ({ ...p, new_purpose: v }))}
                    placeholder={bookForm.purpose || 'Proposed purpose'}
                    placeholderTextColor={Colors.textMuted}
                  />
                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={() => handleRequestTransfer(conflictInfo.current_booking.booking_id)}
                    disabled={busy}
                  >
                    <Text style={styles.secondaryBtnText}>Request Venue Handover</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              <View style={styles.twoCol}>
                <TouchableOpacity
                  style={[styles.secondaryBtn, styles.half]}
                  onPress={handleCheckSlotAvailability}
                  disabled={busy}
                  activeOpacity={0.85}
                >
                  <Text style={styles.secondaryBtnText}>Check Slot</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryBtn, styles.half, { marginTop: 0 }]}
                  onPress={handleSubmitBooking}
                  disabled={busy}
                  activeOpacity={0.88}
                >
                  {busy ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Book Venue</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {/* Occupied Slot Inspection Banner */}
          {occupiedSlotPreview ? (
            <View style={styles.conflictCard}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.conflictTitle}>
                  Booked Slot · {occupiedSlotPreview.venueName}
                </Text>
                <TouchableOpacity onPress={() => setOccupiedSlotPreview(null)} style={styles.secondarySmallBtn}>
                  <Text style={styles.secondarySmallText}>Dismiss</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.conflictDetail}>
                {occupiedSlotPreview.slot.event_title} ({occupiedSlotPreview.slot.booking_code})
              </Text>
              <Text style={styles.metaText}>
                Time: {occupiedSlotPreview.slot.start_time}–{occupiedSlotPreview.slot.end_time} · Status:{' '}
                {occupiedSlotPreview.slot.status} · Coord: {occupiedSlotPreview.slot.coordinator_username}
              </Text>
            </View>
          ) : null}

          {/* Venue Cards List */}
          {loading && venues.length === 0 ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={Colors.brandOrange} />
              <Text style={styles.metaText}>Loading campus venues for {selectedDate}…</Text>
            </View>
          ) : venues.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.metaText}>No active venues matched this filter.</Text>
            </View>
          ) : (
            venues.map((v) => {
              const amenitiesList = Array.isArray(v.amenities) && v.amenities.length > 0
                ? v.amenities
                : Array.isArray(v.facilities)
                ? v.facilities
                : [];
              return (
                <View key={v.id} style={styles.card}>
                  <View style={styles.cardHeaderRow}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={styles.venueCode}>
                        {v.code || v.type}{v.is_active === false ? ' · INACTIVE' : ''}
                      </Text>
                      <Text style={styles.venueTitle}>{v.name}</Text>
                    </View>
                    <StatusPill status={v.is_active === false ? 'CLOSED' : v.availability_status} />
                  </View>

                  <View style={styles.venueMetaRow}>
                    <View style={styles.metaChip}>
                      <Users size={12} color={Colors.textMuted} />
                      <Text style={styles.metaChipText}>Cap {v.capacity}</Text>
                    </View>
                    {v.building || v.location_details ? (
                      <View style={styles.metaChip}>
                        <MapPin size={12} color={Colors.textMuted} />
                        <Text style={styles.metaChipText} numberOfLines={1}>
                          {[v.building, v.floor ? `Fl ${v.floor}` : null, v.location_details]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                      </View>
                    ) : null}
                    {v.department ? (
                      <View style={styles.metaChip}>
                        <Building2 size={12} color={Colors.textMuted} />
                        <Text style={styles.metaChipText}>{v.department}</Text>
                      </View>
                    ) : null}
                  </View>

                  {amenitiesList.length > 0 ? (
                    <View style={styles.amenitiesWrap}>
                      {amenitiesList.slice(0, 6).map((am, idx) => (
                        <View key={idx} style={styles.amenityPill}>
                          <Text style={styles.amenityText}>{String(am)}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {/* Hourly Slot Dots/Chips (09:00 - 17:00) */}
                  <View style={styles.slotsSection}>
                    <View style={styles.slotsHeader}>
                      <Clock size={12} color={Colors.textMuted} />
                      <Text style={styles.slotsTitle}>Hourly Slots (09:00–17:00) · Tap free slot to book</Text>
                    </View>
                    <View style={styles.slotsGrid}>
                      {VENUE_HOURS.map((hr) => {
                        const occupyingSlot = getSlotForHour(v.booked_slots, hr);
                        const isBooked = Boolean(occupyingSlot);
                        const label = `${String(hr).padStart(2, '0')}:00`;
                        return (
                          <TouchableOpacity
                            key={hr}
                            style={[styles.hourChip, isBooked ? styles.hourChipBooked : styles.hourChipFree]}
                            onPress={() => {
                              if (isBooked) {
                                setOccupiedSlotPreview({ venueName: v.name, slot: occupyingSlot });
                              } else {
                                openBookForm(v, hr);
                              }
                            }}
                            activeOpacity={0.8}
                          >
                            <View
                              style={[
                                styles.hourDot,
                                { backgroundColor: isBooked ? Colors.statusRose : Colors.statusEmerald },
                              ]}
                            />
                            <Text
                              style={[
                                styles.hourText,
                                { color: isBooked ? Colors.statusRose : Colors.textPrimary },
                              ]}
                            >
                              {label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  {v.is_active !== false ? (
                    <TouchableOpacity
                      style={styles.bookBtn}
                      onPress={() => openBookForm(v, 9)}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.bookBtnText}>Book Custom Window</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.metaText}>Venue is currently deactivated.</Text>
                  )}

                  {roles.isSuper ? (
                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={[styles.secondarySmallBtn, styles.actionFlex]}
                        onPress={() => openEditVenue(v)}
                        disabled={busy}
                      >
                        <Text style={styles.secondarySmallText}>Edit Venue</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          v.is_active === false ? styles.approveBtn : styles.dangerSmallBtn,
                          styles.actionFlex,
                        ]}
                        onPress={() => handleToggleVenueActive(v)}
                        disabled={busy}
                      >
                        <Text
                          style={
                            v.is_active === false ? styles.approveBtnText : styles.dangerSmallText
                          }
                        >
                          {v.is_active === false ? 'Activate' : 'Deactivate'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </View>
      ) : null}

      {/* ─── SUB-TAB 2: MY BOOKINGS ─── */}
      {subTab === 'bookings' ? (
        <View style={styles.sectionGap}>
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>
                {canReview && showAllScopedBookings ? 'All Visible Bookings' : 'My Venue Bookings'}
              </Text>
              <View style={styles.rowCenter}>
                {canReview ? (
                  <TouchableOpacity
                    style={styles.pillAction}
                    onPress={() => setShowAllScopedBookings((x) => !x)}
                  >
                    <Text style={styles.pillActionText}>
                      {showAllScopedBookings ? 'Mine Only' : 'All Scoped'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity style={styles.iconTouch} onPress={loadBookings}>
                  <RefreshCw size={16} color={Colors.textBody} />
                </TouchableOpacity>
              </View>
            </View>

            {loading && myBookingsList.length === 0 ? (
              <ActivityIndicator color={Colors.brandOrange} style={{ marginVertical: 16 }} />
            ) : myBookingsList.length === 0 ? (
              <Text style={styles.metaText}>No bookings returned for this account.</Text>
            ) : (
              myBookingsList.map((b) => {
                const isExpanded = expandedDetailId === b.id;
                const canCancel =
                  (roles.isSuper || b.initiator_id === currentUserId || b.coordinator_id === currentUserId) &&
                  !['CANCELLED', 'REJECTED'].includes(b.status);
                const canChangeVenue =
                  (roles.isSuper || ((roles.isFaculty || roles.isAdmin) && b.coordinator_id === currentUserId)) &&
                  !['CANCELLED', 'REJECTED'].includes(b.status);
                const isChangeOpen = changeVenueBookingId === b.id;

                return (
                  <View key={b.id} style={styles.bookingRowCard}>
                    <View style={styles.cardHeaderRow}>
                      <Text style={styles.bookingCode}>{b.booking_code}</Text>
                      <StatusPill status={b.status} />
                    </View>
                    <Text style={styles.venueTitle}>{b.event_title}</Text>
                    <Text style={styles.metaText}>
                      {b.venue_name} · {b.booking_date ? String(b.booking_date).slice(0, 10) : '—'} ·{' '}
                      {b.start_time}–{b.end_time}
                    </Text>
                    <Text style={styles.metaText}>
                      Dept: {b.department} · Coordinator: {b.coordinator_username || '—'}
                    </Text>

                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={[styles.secondarySmallBtn, styles.actionFlex]}
                        onPress={() => handleInspectTimeline(b.id)}
                      >
                        <Text style={styles.secondarySmallText}>
                          {isExpanded ? 'Hide Timeline' : 'Inspect Timeline'}
                        </Text>
                      </TouchableOpacity>
                      {canChangeVenue ? (
                        <TouchableOpacity
                          style={[styles.secondarySmallBtn, styles.actionFlex]}
                          onPress={() => {
                            if (isChangeOpen) {
                              setChangeVenueBookingId(null);
                              setChangeVenueId('');
                            } else {
                              setChangeVenueBookingId(b.id);
                              setChangeVenueId('');
                            }
                          }}
                        >
                          <Text style={styles.secondarySmallText}>
                            {isChangeOpen ? 'Close Swap' : 'Change Venue'}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                      {canCancel ? (
                        <TouchableOpacity
                          style={[styles.dangerSmallBtn, styles.actionFlex]}
                          onPress={() => handleCancelBooking(b)}
                        >
                          <Text style={styles.dangerSmallText}>Cancel</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>

                    {isChangeOpen && canChangeVenue ? (
                      <View style={styles.timelineBox}>
                        <Text style={styles.label}>
                          Select Replacement Venue (Resets approval to PENDING_HOD)
                        </Text>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.chipScroll}
                        >
                          {venues
                            .filter((vn) => vn.is_active !== false && vn.id !== b.venue_id)
                            .map((vn) => {
                              const picked = changeVenueId === vn.id;
                              return (
                                <TouchableOpacity
                                  key={vn.id}
                                  style={[styles.filterChip, picked && styles.filterChipActive]}
                                  onPress={() => setChangeVenueId(vn.id)}
                                >
                                  <Text
                                    style={[
                                      styles.filterChipText,
                                      picked && styles.filterChipTextActive,
                                    ]}
                                  >
                                    {vn.name} (Cap {vn.capacity})
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                        </ScrollView>
                        <TouchableOpacity
                          style={styles.primaryBtn}
                          onPress={() => handleChangeVenue(b)}
                          disabled={busy || !changeVenueId}
                        >
                          {busy ? (
                            <ActivityIndicator color="#FFFFFF" size="small" />
                          ) : (
                            <Text style={styles.primaryBtnText}>Confirm Venue Change</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    ) : null}

                    {isExpanded && bookingDetail ? (
                      <View style={styles.timelineBox}>
                        <Text style={styles.label}>Audit Contacts & Approvals</Text>
                        <Text style={styles.metaText}>
                          Initiator: {bookingDetail.initiator?.name} ({bookingDetail.initiator?.username})
                        </Text>
                        <Text style={styles.metaText}>
                          Coordinator: {bookingDetail.coordinator?.name} · {bookingDetail.coordinator?.phone || '—'}
                        </Text>
                        {bookingDetail.active_terms_and_conditions ? (
                          <View style={styles.termsBox}>
                            <Text style={styles.termsTitle}>Conditional Terms</Text>
                            <Text style={styles.termsText}>
                              {(bookingDetail.active_terms_and_conditions.terms || []).join('\n') ||
                                JSON.stringify(bookingDetail.active_terms_and_conditions)}
                            </Text>
                          </View>
                        ) : null}

                        {bookingDetail.status === 'PARTIALLY_ACCEPTED' &&
                        (roles.isSuper || bookingDetail.coordinator?.id === currentUserId) ? (
                          <View style={styles.coordResponseBox}>
                            <Text style={styles.label}>Coordinator Terms Response</Text>
                            <TextInput
                              style={styles.input}
                              value={coordTermsMsg}
                              onChangeText={setCoordTermsMsg}
                              placeholder="Response / counter-proposal note"
                              placeholderTextColor={Colors.textMuted}
                            />
                            <View style={styles.twoCol}>
                              <TouchableOpacity
                                style={[styles.primaryBtn, styles.half, { marginTop: 0 }]}
                                onPress={() => handleCoordinatorTerms(b.id, true)}
                                disabled={busy}
                              >
                                <Text style={styles.primaryBtnText}>Agree to Terms</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.secondaryBtn, styles.half]}
                                onPress={() => handleCoordinatorTerms(b.id, false)}
                                disabled={busy}
                              >
                                <Text style={styles.secondaryBtnText}>Counter Proposal</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        ) : null}

                        {(bookingDetail.transfer_requests || []).map((tr) => (
                          <View key={tr.id} style={styles.termsBox}>
                            <Text style={styles.termsTitle}>
                              Handover Request · {tr.status}
                            </Text>
                            <Text style={styles.metaText}>
                              {tr.new_event_title} ({tr.requester_username}) — {tr.urgency_reason}
                            </Text>
                            {tr.status === 'PENDING_COORDINATOR' &&
                            (roles.isSuper || bookingDetail.coordinator?.id === currentUserId) ? (
                              <View style={[styles.twoCol, { marginTop: 8 }]}>
                                <TouchableOpacity
                                  style={[styles.primaryBtn, styles.half, { marginTop: 0 }]}
                                  onPress={() => handleTransferRespond(tr.id, 'APPROVE', b.id)}
                                >
                                  <Text style={styles.primaryBtnText}>Approve Handover</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={[styles.dangerSmallBtn, styles.half]}
                                  onPress={() => handleTransferRespond(tr.id, 'REJECT', b.id)}
                                >
                                  <Text style={styles.dangerSmallText}>Reject</Text>
                                </TouchableOpacity>
                              </View>
                            ) : null}
                          </View>
                        ))}

                        <Text style={[styles.label, { marginTop: 8 }]}>Timeline Logs</Text>
                        {(bookingDetail.timeline_logs || []).map((log) => (
                          <View key={log.id} style={styles.logItem}>
                            <Text style={styles.logAction}>
                              {log.action} · {log.actor_username || log.actor_role}
                            </Text>
                            <Text style={styles.metaText}>{log.message}</Text>
                            <Text style={styles.logTime}>
                              {log.created_at ? new Date(log.created_at).toLocaleString() : ''}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
          </View>
        </View>
      ) : null}

      {/* ─── SUB-TAB 3: APPROVAL QUEUE (HOD / MGT / PRN / SUPER_ADMIN) ─── */}
      {subTab === 'approvals' && canReview ? (
        <View style={styles.sectionGap}>
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Multi-Stage Approval Queue</Text>
                <Text style={styles.metaText}>
                  HOD → Management → Principal unified state machine
                </Text>
              </View>
              <View style={styles.rowCenter}>
                <TouchableOpacity
                  style={styles.pillAction}
                  onPress={() => setShowResolvedQueue((x) => !x)}
                >
                  <Text style={styles.pillActionText}>
                    {showResolvedQueue ? 'Pending Only' : 'Show All'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconTouch} onPress={loadBookings}>
                  <RefreshCw size={16} color={Colors.textBody} />
                </TouchableOpacity>
              </View>
            </View>

            {loading && approvalQueueList.length === 0 ? (
              <ActivityIndicator color={Colors.brandOrange} style={{ marginVertical: 16 }} />
            ) : approvalQueueList.length === 0 ? (
              <Text style={styles.metaText}>No bookings awaiting review in your scope.</Text>
            ) : (
              approvalQueueList.map((b) => {
                const actionable = canActOnStage(b);
                const reviewDraft = reviewInputs[b.id] || { remarks: '', terms: '' };
                const setDraft = (patch) =>
                  setReviewInputs((prev) => ({
                    ...prev,
                    [b.id]: { ...reviewDraft, ...patch },
                  }));

                return (
                  <View key={b.id} style={styles.bookingRowCard}>
                    <View style={styles.cardHeaderRow}>
                      <Text style={styles.bookingCode}>{b.booking_code}</Text>
                      <StatusPill status={b.status} />
                    </View>
                    <Text style={styles.venueTitle}>{b.event_title}</Text>
                    <Text style={styles.metaText}>
                      {b.venue_name} · Dept {b.department} · Headcount {b.expected_headcount}
                    </Text>
                    <Text style={styles.metaText}>
                      {b.booking_date ? String(b.booking_date).slice(0, 10) : '—'} · {b.start_time}–{b.end_time} · By {b.initiator_username}
                    </Text>
                    {b.purpose ? <Text style={styles.purposeText}>{b.purpose}</Text> : null}

                    {actionable ? (
                      <View style={styles.reviewBox}>
                        <Text style={styles.label}>Review Remarks (Required for Reject)</Text>
                        <TextInput
                          style={styles.input}
                          value={reviewDraft.remarks}
                          onChangeText={(v) => setDraft({ remarks: v })}
                          placeholder="Reason / review notes"
                          placeholderTextColor={Colors.textMuted}
                        />
                        <Text style={styles.label}>Conditional Terms (For Partial Accept, 1 per line)</Text>
                        <TextInput
                          style={[styles.input, styles.multiline]}
                          value={reviewDraft.terms}
                          onChangeText={(v) => setDraft({ terms: v })}
                          placeholder="e.g. Wrap up audio by 12:30 PM"
                          placeholderTextColor={Colors.textMuted}
                          multiline
                        />
                        <View style={styles.reviewBtnRow}>
                          <TouchableOpacity
                            style={styles.approveBtn}
                            onPress={() => handleReviewBooking(b.id, 'APPROVE')}
                            disabled={busy}
                          >
                            <Text style={styles.approveBtnText}>Approve</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.partialBtn}
                            onPress={() => handleReviewBooking(b.id, 'PARTIAL')}
                            disabled={busy}
                          >
                            <Text style={styles.partialBtnText}>Partial</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.rejectBtn}
                            onPress={() => handleReviewBooking(b.id, 'REJECT')}
                            disabled={busy}
                          >
                            <Text style={styles.rejectBtnText}>Reject</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <Text style={styles.stageNote}>
                        Currently at stage: {(b.status || '').replace(/_/g, ' ')}
                      </Text>
                    )}
                  </View>
                );
              })
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  sectionGap: { gap: 12 },
  subTabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    padding: 4,
    gap: 4,
  },
  subTabBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  subTabBtnActive: {
    backgroundColor: Colors.surfaceDark,
  },
  subTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  subTabTextActive: {
    color: Colors.textInverse,
  },
  card: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    padding: 16,
    gap: 10,
  },
  highlightCard: {
    borderColor: Colors.brandOrange,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  rowCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  overline: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.brandOrange,
    letterSpacing: 0.6,
  },
  iconTouch: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.canvasBg,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillAction: {
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: Colors.brandOrangeLight,
    borderWidth: 1,
    borderColor: '#FED7AA',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pillActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.brandOrange,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateNavBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.canvasBg,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateInput: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    backgroundColor: '#FBFBFC',
    paddingHorizontal: 10,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  dateGoBtn: {
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: Colors.surfaceDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateGoText: { color: Colors.textInverse, fontSize: 12, fontWeight: '700' },
  dateTodayBtn: {
    minHeight: 48,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: Colors.brandOrangeLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateTodayText: { color: Colors.brandOrange, fontSize: 12, fontWeight: '700' },
  chipScroll: {
    gap: 8,
    paddingVertical: 4,
  },
  filterChip: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    backgroundColor: '#FBFBFC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterChipActive: {
    backgroundColor: Colors.surfaceDark,
    borderColor: Colors.surfaceDark,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textBody,
  },
  filterChipTextActive: {
    color: Colors.textInverse,
    fontWeight: '700',
  },
  venueCode: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 0.5,
  },
  venueTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  venueMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.canvasBg,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  metaChipText: {
    fontSize: 11,
    color: Colors.textBody,
    fontWeight: '600',
    maxWidth: 200,
  },
  amenitiesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  amenityPill: {
    backgroundColor: '#FBFBFC',
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  amenityText: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  slotsSection: {
    backgroundColor: '#FBFBFC',
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    borderRadius: 14,
    padding: 10,
    gap: 8,
  },
  slotsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  slotsTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  slotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  hourChip: {
    minWidth: '22%',
    minHeight: 48,
    flexGrow: 1,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  hourChipFree: {
    backgroundColor: Colors.surfaceCard,
    borderColor: '#A7F3D0',
  },
  hourChipBooked: {
    backgroundColor: Colors.statusRoseBg,
    borderColor: '#FECACA',
  },
  hourDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  hourText: {
    fontSize: 12,
    fontWeight: '700',
  },
  bookBtn: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: Colors.surfaceDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textInverse,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    marginTop: 4,
  },
  input: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    fontSize: 14,
    color: Colors.textPrimary,
  },
  multiline: {
    minHeight: 80,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  twoCol: {
    flexDirection: 'row',
    gap: 10,
  },
  half: { flex: 1 },
  searchCoordBox: { gap: 8 },
  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  searchBtn: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: Colors.surfaceDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coordResultRow: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    backgroundColor: '#FBFBFC',
    padding: 10,
    justifyContent: 'center',
  },
  coordResultName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  selectedCoordBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.statusEmeraldBg,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  selectedCoordName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  primaryBtn: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: Colors.surfaceDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  primaryBtnText: {
    color: Colors.textInverse,
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryBtn: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: Colors.brandOrangeLight,
    borderWidth: 1,
    borderColor: '#FED7AA',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  secondaryBtnText: {
    color: Colors.brandOrange,
    fontSize: 13,
    fontWeight: '700',
  },
  secondarySmallBtn: {
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    backgroundColor: Colors.canvasBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondarySmallText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  dangerSmallBtn: {
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: Colors.statusRoseBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerSmallText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.statusRose,
  },
  infoBanner: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  emeraldBanner: {
    backgroundColor: Colors.statusEmeraldBg,
    borderColor: '#A7F3D0',
  },
  roseBanner: {
    backgroundColor: Colors.statusRoseBg,
    borderColor: '#FECACA',
  },
  infoBannerText: {
    fontSize: 12,
    fontWeight: '700',
  },
  conflictCard: {
    backgroundColor: Colors.statusAmberBg,
    borderColor: '#FDE68A',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
  conflictTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#92400E',
  },
  conflictDetail: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  coordContactCard: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    padding: 10,
    gap: 2,
    marginVertical: 4,
  },
  bookingRowCard: {
    borderTopWidth: 1,
    borderTopColor: Colors.hairlineBorder,
    paddingTop: 12,
    marginTop: 6,
    gap: 6,
  },
  bookingCode: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.brandOrange,
  },
  purposeText: {
    fontSize: 12,
    color: Colors.textBody,
    lineHeight: 17,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  actionFlex: { flex: 1 },
  timelineBox: {
    backgroundColor: '#FBFBFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    padding: 12,
    gap: 6,
    marginTop: 6,
  },
  termsBox: {
    backgroundColor: Colors.statusAmberBg,
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 10,
    padding: 10,
    gap: 2,
  },
  termsTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#92400E',
  },
  termsText: {
    fontSize: 11,
    color: '#78350F',
    lineHeight: 16,
  },
  coordResponseBox: {
    gap: 8,
    marginTop: 4,
  },
  logItem: {
    borderLeftWidth: 2,
    borderLeftColor: Colors.brandOrange,
    paddingLeft: 8,
    paddingVertical: 4,
  },
  logAction: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  logTime: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  reviewBox: {
    backgroundColor: '#FBFBFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    padding: 12,
    gap: 6,
    marginTop: 4,
  },
  reviewBtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  approveBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: Colors.statusEmerald,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  partialBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: Colors.statusAmberBg,
    borderWidth: 1,
    borderColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  partialBtnText: { color: '#92400E', fontSize: 12, fontWeight: '800' },
  rejectBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: Colors.statusRoseBg,
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectBtnText: { color: Colors.statusRose, fontSize: 12, fontWeight: '800' },
  stageNote: {
    fontSize: 11,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  metaText: {
    fontSize: 12,
    color: Colors.textMuted,
    lineHeight: 17,
  },
  loadingBox: {
    minHeight: 80,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  errorBox: {
    backgroundColor: Colors.statusRoseBg,
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 12,
  },
  errorText: {
    color: Colors.statusRose,
    fontSize: 12,
    fontWeight: '600',
  },
  successBox: {
    backgroundColor: Colors.statusEmeraldBg,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    padding: 12,
  },
  successText: {
    color: Colors.statusEmerald,
    fontSize: 12,
    fontWeight: '700',
  },
});
