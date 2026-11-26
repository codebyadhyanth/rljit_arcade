import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Award,
  CalendarDays,
  ClipboardCheck,
  Clock,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-react-native';
import api from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import Colors from '../../theme/colors';
import DbReceiptCard from '../DbReceiptCard';
import {
  DEPARTMENTS,
  WEEKDAYS,
  getStatusTone,
  getTodayIsoDate,
  getUserRoles,
} from './constants';

function StatusBadge({ status }) {
  const tone = getStatusTone(status);
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg, borderColor: tone.border }]}>
      <Text style={[styles.badgeText, { color: tone.text }]}>{String(status || '—')}</Text>
    </View>
  );
}

export default function MobileAcademicsTools({ initialSection = 'attendance', profile = null }) {
  const { user } = useAuth();
  const roles = getUserRoles(user);
  const currentUserId = user?.id || user?.userId;
  const canMarkRecords = roles.isFaculty || roles.isHod || roles.isSuper;
  const canManageTimetable = roles.isSuper || roles.isHod || roles.isAdmission || roles.isExam;

  const [sectionTab, setSectionTab] = useState(initialSection); // 'attendance' | 'cie' | 'timetable'
  useEffect(() => {
    if (initialSection) setSectionTab(initialSection);
  }, [initialSection]);

  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [receipt, setReceipt] = useState(null);

  const defaultDept =
    profile?.studentDetails?.department ||
    profile?.department ||
    user?.department ||
    'CSE';
  const defaultSem = String(
    profile?.studentDetails?.semester || profile?.semester || '1'
  );
  const defaultSec = profile?.studentDetails?.section || 'A';

  // ─── Attendance State ───
  const [attFilter, setAttFilter] = useState({
    department: defaultDept,
    core_branch: '',
    semester: defaultSem,
    section: defaultSec,
    subject_code: '',
    attendance_date: getTodayIsoDate(),
    period_no: '1',
  });
  const [attRoster, setAttRoster] = useState([]);
  const [attStatusMap, setAttStatusMap] = useState({});
  const [studentAttData, setStudentAttData] = useState(null);
  const [studentAttSubject, setStudentAttSubject] = useState('');

  // ─── CIE State ───
  const [cieFilter, setCieFilter] = useState({
    department: defaultDept,
    core_branch: '',
    semester: defaultSem,
    section: defaultSec,
    subject_code: '',
    subject_name: '',
    max_marks: '50',
  });
  const [cieRoster, setCieRoster] = useState([]);
  const [cieEdits, setCieEdits] = useState({}); // { [studentId]: { cie1, cie2, cie3, assignment } }
  const [studentCieData, setStudentCieData] = useState(null);
  const [studentCieSem, setStudentCieSem] = useState('');

  // ─── Timetable State ───
  const [ttFilter, setTtFilter] = useState({
    department: roles.isStudent ? defaultDept : (roles.isHod ? defaultDept : ''),
    semester: roles.isStudent ? defaultSem : '',
    section: roles.isStudent ? defaultSec : '',
    day: 'ALL',
    mySlotsOnly: roles.isFaculty && !roles.isHod,
  });
  const [slots, setSlots] = useState([]);
  const [showCreateSlot, setShowCreateSlot] = useState(false);
  const [slotForm, setSlotForm] = useState({
    department: defaultDept,
    semester: defaultSem,
    section: 'A',
    day_of_week: 1,
    period_no: '1',
    subject_code: '',
    subject_name: '',
    start_time: '09:00',
    end_time: '10:00',
    room_no: '',
    faculty_id: '',
  });

  // Shared Faculty Search Helper (used for timetable slot creation & swap trigger)
  const [facSearchQ, setFacSearchQ] = useState('');
  const [facSearchResults, setFacSearchResults] = useState([]);
  const [selectedSlotFaculty, setSelectedSlotFaculty] = useState(null);
  const [swapTargetSlotId, setSwapTargetSlotId] = useState(null);
  const [swapDate, setSwapDate] = useState(getTodayIsoDate());
  const [swapFacQ, setSwapFacQ] = useState('');
  const [swapFacResults, setSwapFacResults] = useState([]);
  const [selectedSwapFaculty, setSelectedSwapFaculty] = useState(null);

  const searchFaculty = async (q, setResults) => {
    if (!q.trim()) return;
    setError('');
    try {
      const res = await api.get('/api/v1/users/search', { params: { q: q.trim() } });
      const facs = (res.data?.results || []).filter((u) => u.baseRole === 'FACULTY');
      setResults(facs);
      if (facs.length === 0) setError('No active faculty members matched.');
    } catch (err) {
      setError(err.response?.data?.error || 'Faculty search failed.');
    }
  };

  // ─── Loaders ───
  const loadStudentAttendance = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (studentAttSubject.trim()) params.subject_code = studentAttSubject.trim().toUpperCase();
      const res = await api.get('/api/v1/attendance/student/me', { params });
      setStudentAttData(res.data || null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load student attendance.');
    } finally {
      setLoading(false);
    }
  }, [studentAttSubject]);

  const loadSectionAttendance = async () => {
    setLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      const params = {};
      if (attFilter.department.trim()) params.department = attFilter.department.trim().toUpperCase();
      if (attFilter.core_branch.trim()) params.core_branch = attFilter.core_branch.trim().toUpperCase();
      if (attFilter.semester.trim()) params.semester = attFilter.semester.trim();
      if (attFilter.section.trim()) params.section = attFilter.section.trim().toUpperCase();
      if (attFilter.subject_code.trim()) params.subject_code = attFilter.subject_code.trim().toUpperCase();
      if (attFilter.attendance_date.trim()) params.attendance_date = attFilter.attendance_date.trim();
      if (attFilter.period_no.trim()) params.period_no = attFilter.period_no.trim();

      const res = await api.get('/api/v1/attendance/section', { params });
      const list = Array.isArray(res.data?.students) ? res.data.students : [];
      setAttRoster(list);
      const map = {};
      list.forEach((stu) => {
        map[stu.student_id] = stu.session_status || 'PRESENT';
      });
      setAttStatusMap(map);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load section attendance roster.');
    } finally {
      setLoading(false);
    }
  };

  const handleCommitAttendance = async () => {
    if (!attFilter.subject_code.trim()) {
      setError('Subject code is required before committing attendance.');
      return;
    }
    if (attRoster.length === 0) {
      setError('Load a section roster first.');
      return;
    }
    setBusy(true);
    setError('');
    setSuccessMsg('');
    setReceipt(null);
    try {
      const payload = {
        department: attFilter.department.trim().toUpperCase() || undefined,
        semester: attFilter.semester ? Number(attFilter.semester) : undefined,
        section: attFilter.section.trim().toUpperCase() || 'A',
        subject_code: attFilter.subject_code.trim().toUpperCase(),
        attendance_date: attFilter.attendance_date.trim() || getTodayIsoDate(),
        period_no: Number(attFilter.period_no || 1),
        records: attRoster.map((stu) => ({
          student_id: stu.student_id,
          status: attStatusMap[stu.student_id] || 'PRESENT',
        })),
      };
      const res = await api.post('/api/v1/attendance/manual', payload);
      setSuccessMsg(`Committed attendance for ${res.data?.committedCount || attRoster.length} student(s).`);
      setReceipt(res.data?.dbReceipt || null);
      await loadSectionAttendance();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to commit attendance.');
    } finally {
      setBusy(false);
    }
  };

  const loadStudentCie = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (studentCieSem.trim()) params.semester = studentCieSem.trim();
      const res = await api.get('/api/v1/cie/student/me', { params });
      setStudentCieData(res.data || null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load student CIE scorecard.');
    } finally {
      setLoading(false);
    }
  }, [studentCieSem]);

  const loadSectionCie = async () => {
    setLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      const params = {};
      if (cieFilter.department.trim()) params.department = cieFilter.department.trim().toUpperCase();
      if (cieFilter.core_branch.trim()) params.core_branch = cieFilter.core_branch.trim().toUpperCase();
      if (cieFilter.semester.trim()) params.semester = cieFilter.semester.trim();
      if (cieFilter.section.trim()) params.section = cieFilter.section.trim().toUpperCase();
      if (cieFilter.subject_code.trim()) params.subject_code = cieFilter.subject_code.trim().toUpperCase();

      const res = await api.get('/api/v1/cie/section', { params });
      const list = Array.isArray(res.data?.students) ? res.data.students : [];
      setCieRoster(list);
      const editMap = {};
      list.forEach((stu) => {
        editMap[stu.student_id] = {
          cie1: stu.cie1 != null ? String(stu.cie1) : '',
          cie2: stu.cie2 != null ? String(stu.cie2) : '',
          cie3: stu.cie3 != null ? String(stu.cie3) : '',
          assignment: stu.assignment != null ? String(stu.assignment) : '',
        };
      });
      setCieEdits(editMap);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load section CIE roster.');
    } finally {
      setLoading(false);
    }
  };

  const handleCommitCie = async () => {
    if (!cieFilter.subject_code.trim()) {
      setError('Subject code is required before committing CIE marks.');
      return;
    }
    if (cieRoster.length === 0) {
      setError('Load a section roster first.');
      return;
    }
    setBusy(true);
    setError('');
    setSuccessMsg('');
    setReceipt(null);
    try {
      const records = cieRoster.map((stu) => {
        const e = cieEdits[stu.student_id] || {};
        const row = { student_id: stu.student_id };
        if (e.cie1 !== '' && e.cie1 !== undefined) row.cie1 = Number(e.cie1);
        if (e.cie2 !== '' && e.cie2 !== undefined) row.cie2 = Number(e.cie2);
        if (e.cie3 !== '' && e.cie3 !== undefined) row.cie3 = Number(e.cie3);
        if (e.assignment !== '' && e.assignment !== undefined) row.assignment = Number(e.assignment);
        return row;
      });
      const res = await api.post('/api/v1/cie/manual', {
        department: cieFilter.department.trim().toUpperCase() || undefined,
        semester: cieFilter.semester ? Number(cieFilter.semester) : undefined,
        subject_code: cieFilter.subject_code.trim().toUpperCase(),
        subject_name: cieFilter.subject_name.trim() || undefined,
        max_marks: Number(cieFilter.max_marks || 50),
        records,
      });
      setSuccessMsg(`Saved CIE marks for ${res.data?.committedCount || records.length} student(s).`);
      setReceipt(res.data?.dbReceipt || null);
      await loadSectionCie();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save CIE marks.');
    } finally {
      setBusy(false);
    }
  };

  const loadTimetable = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (ttFilter.department.trim()) params.department = ttFilter.department.trim().toUpperCase();
      if (ttFilter.semester.trim()) params.semester = ttFilter.semester.trim();
      if (ttFilter.section.trim()) params.section = ttFilter.section.trim().toUpperCase();
      if (ttFilter.day !== 'ALL') params.day = ttFilter.day;
      if (ttFilter.mySlotsOnly && currentUserId) params.facultyId = currentUserId;

      const res = await api.get('/api/v1/timetable', { params });
      setSlots(Array.isArray(res.data?.slots) ? res.data.slots : []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load timetable slots.');
    } finally {
      setLoading(false);
    }
  }, [ttFilter, currentUserId]);

  const handleCreateSlot = async () => {
    if (!slotForm.department.trim() || !slotForm.semester.trim() || !slotForm.section.trim() || !slotForm.subject_code.trim()) {
      setError('Department, semester, section, and subject code are required.');
      return;
    }
    setBusy(true);
    setError('');
    setSuccessMsg('');
    setReceipt(null);
    try {
      const res = await api.post('/api/v1/timetable', {
        department: slotForm.department.trim().toUpperCase(),
        semester: Number(slotForm.semester),
        section: slotForm.section.trim().toUpperCase(),
        day_of_week: Number(slotForm.day_of_week),
        period_no: Number(slotForm.period_no || 1),
        subject_code: slotForm.subject_code.trim().toUpperCase(),
        subject_name: slotForm.subject_name.trim() || undefined,
        start_time: slotForm.start_time.trim() || undefined,
        end_time: slotForm.end_time.trim() || undefined,
        room_no: slotForm.room_no.trim() || undefined,
        faculty_id: slotForm.faculty_id.trim() || undefined,
      });
      setSuccessMsg(res.data?.message || 'Timetable slot saved.');
      setReceipt(res.data?.dbReceipt || null);
      setShowCreateSlot(false);
      await loadTimetable();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save timetable slot.');
    } finally {
      setBusy(false);
    }
  };

  const handleRequestSwap = async (slotId) => {
    if (!selectedSwapFaculty?.id) {
      setError('Search and select a target faculty member for the class swap.');
      return;
    }
    setBusy(true);
    setError('');
    setSuccessMsg('');
    setReceipt(null);
    try {
      const res = await api.patch(`/api/v1/timetable/${slotId}/swap`, {
        action: 'REQUEST',
        swapped_faculty_id: selectedSwapFaculty.id,
        swap_date: swapDate.trim() || getTodayIsoDate(),
      });
      setSuccessMsg(res.data?.message || 'Swap request submitted.');
      setReceipt(res.data?.dbReceipt || null);
      setSwapTargetSlotId(null);
      setSelectedSwapFaculty(null);
      setSwapFacResults([]);
      await loadTimetable();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to request class swap.');
    } finally {
      setBusy(false);
    }
  };

  const handleRespondSwap = async (slotId, action) => {
    setBusy(true);
    setError('');
    setSuccessMsg('');
    setReceipt(null);
    try {
      const res = await api.patch(`/api/v1/timetable/${slotId}/swap`, { action });
      setSuccessMsg(res.data?.message || `Swap ${action.toLowerCase()}d.`);
      setReceipt(res.data?.dbReceipt || null);
      await loadTimetable();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to respond to class swap.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    setError('');
    setSuccessMsg('');
    setReceipt(null);
    if (sectionTab === 'attendance' && roles.isStudent) loadStudentAttendance();
    if (sectionTab === 'cie' && roles.isStudent) loadStudentCie();
    if (sectionTab === 'timetable') loadTimetable();
  }, [sectionTab, roles.isStudent, loadStudentAttendance, loadStudentCie, loadTimetable]);

  return (
    <View style={styles.container}>
      {/* Domain Switcher */}
      <View style={styles.subTabBar}>
        {[
          { id: 'attendance', label: 'Attendance', icon: ClipboardCheck },
          { id: 'cie', label: 'CIE Marks', icon: Award },
          { id: 'timetable', label: 'Timetable', icon: CalendarDays },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = sectionTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.subTabBtn, active && styles.subTabBtnActive]}
              onPress={() => setSectionTab(tab.id)}
              activeOpacity={0.85}
            >
              <Icon size={14} color={active ? '#FFFFFF' : Colors.textMuted} />
              <Text style={[styles.subTabText, active && styles.subTabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
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
      {receipt ? <DbReceiptCard receipt={receipt} title="Academic PostgreSQL Receipt" /> : null}

      {/* ─── TAB 1: ATTENDANCE ─── */}
      {sectionTab === 'attendance' ? (
        roles.isStudent ? (
          <View style={styles.sectionGap}>
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardTitle}>My Attendance Summary</Text>
                <TouchableOpacity style={styles.iconTouch} onPress={loadStudentAttendance}>
                  <RefreshCw size={16} color={Colors.textBody} />
                </TouchableOpacity>
              </View>

              <View style={styles.searchRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={studentAttSubject}
                  onChangeText={(v) => setStudentAttSubject(v.toUpperCase())}
                  placeholder="Optional subject code (e.g. BCS301)"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="characters"
                />
                <TouchableOpacity style={styles.darkSmallBtn} onPress={loadStudentAttendance}>
                  <Text style={styles.darkSmallText}>Filter</Text>
                </TouchableOpacity>
              </View>

              {loading && !studentAttData ? (
                <ActivityIndicator color={Colors.brandOrange} style={{ marginVertical: 16 }} />
              ) : studentAttData?.summary ? (
                <View style={styles.bentoGrid}>
                  <View style={styles.bentoBox}>
                    <Text style={styles.bentoLabel}>Overall %</Text>
                    <Text
                      style={[
                        styles.bentoValue,
                        {
                          color:
                            studentAttData.summary.attendance_percentage >= 85
                              ? Colors.statusEmerald
                              : studentAttData.summary.attendance_percentage >= 75
                              ? Colors.statusAmber
                              : Colors.statusRose,
                        },
                      ]}
                    >
                      {studentAttData.summary.attendance_percentage}%
                    </Text>
                  </View>
                  <View style={styles.bentoBox}>
                    <Text style={styles.bentoLabel}>Attended</Text>
                    <Text style={styles.bentoValue}>
                      {studentAttData.summary.attended_count} / {studentAttData.summary.total_classes}
                    </Text>
                  </View>
                  <View style={styles.bentoBox}>
                    <Text style={styles.bentoLabel}>Present / Late</Text>
                    <Text style={styles.bentoValue}>
                      {studentAttData.summary.present_count}P · {studentAttData.summary.late_count}L
                    </Text>
                  </View>
                  <View style={styles.bentoBox}>
                    <Text style={styles.bentoLabel}>Absent</Text>
                    <Text style={[styles.bentoValue, { color: Colors.statusRose }]}>
                      {studentAttData.summary.absent_count}
                    </Text>
                  </View>
                </View>
              ) : (
                <Text style={styles.metaText}>No attendance records found.</Text>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Subject Breakdown</Text>
              {studentAttData?.subject_breakdown?.length ? (
                studentAttData.subject_breakdown.map((sub) => (
                  <View key={sub.subject_code} style={styles.rowItem}>
                    <View style={styles.cardHeaderRow}>
                      <Text style={styles.rowTitle}>{sub.subject_code}</Text>
                      <StatusBadge status={`${sub.percentage}%`} />
                    </View>
                    <Text style={styles.metaText}>
                      Total {sub.total_classes} · Present {sub.present_count} · Late {sub.late_count} · Absent {sub.absent_count}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={styles.metaText}>No subject attendance logged yet.</Text>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.sectionGap}>
            {/* Phase 3 Coming Soon Tag */}
            <View style={styles.comingSoonBanner}>
              <Sparkles size={16} color={Colors.brandOrange} />
              <Text style={styles.comingSoonText}>
                Camera Attendance Scanner — Phase 3 Coming Soon
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Section Attendance Register</Text>
              <Text style={styles.label}>Department</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
                {DEPARTMENTS.map((d) => {
                  const active = attFilter.department === d.code;
                  return (
                    <TouchableOpacity
                      key={d.code}
                      style={[styles.filterChip, active && styles.filterChipActive]}
                      onPress={() => setAttFilter((p) => ({ ...p, department: d.code }))}
                    >
                      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                        {d.code}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={styles.twoCol}>
                <View style={styles.half}>
                  <Text style={styles.label}>Semester</Text>
                  <TextInput
                    style={styles.input}
                    value={attFilter.semester}
                    onChangeText={(v) => setAttFilter((p) => ({ ...p, semester: v }))}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.half}>
                  <Text style={styles.label}>Section</Text>
                  <TextInput
                    style={styles.input}
                    value={attFilter.section}
                    onChangeText={(v) => setAttFilter((p) => ({ ...p, section: v.toUpperCase() }))}
                    autoCapitalize="characters"
                  />
                </View>
              </View>

              <View style={styles.twoCol}>
                <View style={styles.half}>
                  <Text style={styles.label}>Subject Code *</Text>
                  <TextInput
                    style={styles.input}
                    value={attFilter.subject_code}
                    onChangeText={(v) => setAttFilter((p) => ({ ...p, subject_code: v.toUpperCase() }))}
                    placeholder="BCS301"
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="characters"
                  />
                </View>
                <View style={styles.half}>
                  <Text style={styles.label}>Core Branch (Opt)</Text>
                  <TextInput
                    style={styles.input}
                    value={attFilter.core_branch}
                    onChangeText={(v) => setAttFilter((p) => ({ ...p, core_branch: v.toUpperCase() }))}
                    placeholder="e.g. CSE"
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="characters"
                  />
                </View>
              </View>

              <View style={styles.twoCol}>
                <View style={styles.half}>
                  <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
                  <TextInput
                    style={styles.input}
                    value={attFilter.attendance_date}
                    onChangeText={(v) => setAttFilter((p) => ({ ...p, attendance_date: v }))}
                  />
                </View>
                <View style={styles.half}>
                  <Text style={styles.label}>Period No</Text>
                  <TextInput
                    style={styles.input}
                    value={attFilter.period_no}
                    onChangeText={(v) => setAttFilter((p) => ({ ...p, period_no: v }))}
                    keyboardType="number-pad"
                  />
                </View>
              </View>

              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={loadSectionAttendance}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.primaryBtnText}>Load Section Roster</Text>
                )}
              </TouchableOpacity>
            </View>

            {attRoster.length > 0 ? (
              <View style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.cardTitle}>Roster ({attRoster.length})</Text>
                  {canMarkRecords ? (
                    <View style={styles.rowCenter}>
                      <TouchableOpacity
                        style={styles.pillAction}
                        onPress={() => {
                          const next = {};
                          attRoster.forEach((s) => {
                            next[s.student_id] = 'PRESENT';
                          });
                          setAttStatusMap(next);
                        }}
                      >
                        <Text style={styles.pillActionText}>All Present</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.dangerPill}
                        onPress={() => {
                          const next = {};
                          attRoster.forEach((s) => {
                            next[s.student_id] = 'ABSENT';
                          });
                          setAttStatusMap(next);
                        }}
                      >
                        <Text style={styles.dangerPillText}>All Absent</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>

                {attRoster.map((stu) => {
                  const chosen = attStatusMap[stu.student_id] || 'PRESENT';
                  return (
                    <View key={stu.student_id} style={styles.rowItem}>
                      <View style={styles.cardHeaderRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rowTitle}>{stu.full_name || stu.usn}</Text>
                          <Text style={styles.metaText}>
                            {stu.usn} · Avg {stu.attendance_percentage}% ({stu.present_count}P/{stu.absent_count}A)
                          </Text>
                        </View>
                        {stu.session_status ? <StatusBadge status={`Saved: ${stu.session_status}`} /> : null}
                      </View>

                      {canMarkRecords ? (
                        <View style={styles.toggleRow}>
                          {['PRESENT', 'ABSENT', 'LATE'].map((st) => {
                            const active = chosen === st;
                            const activeStyle =
                              st === 'PRESENT'
                                ? styles.chipPresent
                                : st === 'ABSENT'
                                ? styles.chipAbsent
                                : styles.chipLate;
                            const activeTextStyle =
                              st === 'PRESENT'
                                ? styles.chipPresentText
                                : st === 'ABSENT'
                                ? styles.chipAbsentText
                                : styles.chipLateText;

                            return (
                              <TouchableOpacity
                                key={st}
                                style={[styles.statusChip, active && activeStyle]}
                                onPress={() =>
                                  setAttStatusMap((prev) => ({ ...prev, [stu.student_id]: st }))
                                }
                              >
                                <Text style={[styles.statusChipText, active && activeTextStyle]}>
                                  {st}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      ) : null}
                    </View>
                  );
                })}

                {canMarkRecords ? (
                  <TouchableOpacity
                    style={[styles.primaryBtn, { marginTop: 10 }]}
                    onPress={handleCommitAttendance}
                    disabled={busy}
                  >
                    {busy ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={styles.primaryBtnText}>Commit Attendance</Text>
                    )}
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.metaText}>
                    Read-only view: Faculty or Super Admin authority is required to commit attendance.
                  </Text>
                )}
              </View>
            ) : (
              <View style={styles.card}>
                <Text style={styles.rowTitle}>Section Attendance Roster (0)</Text>
                <Text style={styles.metaText}>
                  {loading
                    ? 'Loading section attendance roster…'
                    : 'No students loaded yet. Set department, semester, and section filters, then tap Load Section Roster.'}
                </Text>
              </View>
            )}
          </View>
        )
      ) : null}

      {/* ─── TAB 2: CIE MARKS ─── */}
      {sectionTab === 'cie' ? (
        roles.isStudent ? (
          <View style={styles.sectionGap}>
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardTitle}>My CIE Scorecard</Text>
                <TouchableOpacity style={styles.iconTouch} onPress={loadStudentCie}>
                  <RefreshCw size={16} color={Colors.textBody} />
                </TouchableOpacity>
              </View>

              <View style={styles.searchRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={studentCieSem}
                  onChangeText={setStudentCieSem}
                  placeholder="Optional semester filter (1-8)"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="number-pad"
                />
                <TouchableOpacity style={styles.darkSmallBtn} onPress={loadStudentCie}>
                  <Text style={styles.darkSmallText}>Load</Text>
                </TouchableOpacity>
              </View>

              {loading && !studentCieData ? (
                <ActivityIndicator color={Colors.brandOrange} style={{ marginVertical: 16 }} />
              ) : studentCieData ? (
                <View style={styles.bentoGrid}>
                  <View style={styles.bentoBox}>
                    <Text style={styles.bentoLabel}>Average CIE</Text>
                    <Text style={styles.bentoValue}>{studentCieData.averageCie ?? 0}</Text>
                  </View>
                  <View style={styles.bentoBox}>
                    <Text style={styles.bentoLabel}>Subjects</Text>
                    <Text style={styles.bentoValue}>{studentCieData.count ?? 0}</Text>
                  </View>
                </View>
              ) : null}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Subject Scores</Text>
              {studentCieData?.marks?.length ? (
                studentCieData.marks.map((m) => (
                  <View key={m.id || m.subject_code} style={styles.rowItem}>
                    <View style={styles.cardHeaderRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle}>
                          {m.subject_code} {m.subject_name ? `· ${m.subject_name}` : ''}
                        </Text>
                        <Text style={styles.metaText}>Semester {m.semester}</Text>
                      </View>
                      <StatusBadge status={`${m.total_cie} / ${m.max_marks}`} />
                    </View>
                    <Text style={styles.metaText}>
                      CIE 1: {m.cie1} · CIE 2: {m.cie2} · CIE 3: {m.cie3} · Assignment: {m.assignment}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={styles.metaText}>No CIE marks published yet.</Text>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.sectionGap}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>CIE Marks Entry & Roster</Text>
              <Text style={styles.label}>Department</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
                {DEPARTMENTS.map((d) => {
                  const active = cieFilter.department === d.code;
                  return (
                    <TouchableOpacity
                      key={d.code}
                      style={[styles.filterChip, active && styles.filterChipActive]}
                      onPress={() => setCieFilter((p) => ({ ...p, department: d.code }))}
                    >
                      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                        {d.code}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={styles.twoCol}>
                <View style={styles.half}>
                  <Text style={styles.label}>Semester</Text>
                  <TextInput
                    style={styles.input}
                    value={cieFilter.semester}
                    onChangeText={(v) => setCieFilter((p) => ({ ...p, semester: v }))}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.half}>
                  <Text style={styles.label}>Section</Text>
                  <TextInput
                    style={styles.input}
                    value={cieFilter.section}
                    onChangeText={(v) => setCieFilter((p) => ({ ...p, section: v.toUpperCase() }))}
                    autoCapitalize="characters"
                  />
                </View>
              </View>

              <View style={styles.twoCol}>
                <View style={styles.half}>
                  <Text style={styles.label}>Subject Code *</Text>
                  <TextInput
                    style={styles.input}
                    value={cieFilter.subject_code}
                    onChangeText={(v) => setCieFilter((p) => ({ ...p, subject_code: v.toUpperCase() }))}
                    placeholder="BCS301"
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="characters"
                  />
                </View>
                <View style={styles.half}>
                  <Text style={styles.label}>Max Marks</Text>
                  <TextInput
                    style={styles.input}
                    value={cieFilter.max_marks}
                    onChangeText={(v) => setCieFilter((p) => ({ ...p, max_marks: v }))}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              <Text style={styles.label}>Subject Name (Optional)</Text>
              <TextInput
                style={styles.input}
                value={cieFilter.subject_name}
                onChangeText={(v) => setCieFilter((p) => ({ ...p, subject_name: v }))}
                placeholder="Data Structures & Algorithms"
                placeholderTextColor={Colors.textMuted}
              />

              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={loadSectionCie}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.primaryBtnText}>Load CIE Roster</Text>
                )}
              </TouchableOpacity>
            </View>

            {cieRoster.length > 0 ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Student Scores ({cieRoster.length})</Text>
                {cieRoster.map((stu) => {
                  const e = cieEdits[stu.student_id] || {};
                  const safeNum = (v, fallback = 0) => {
                    const n = Number(v);
                    return Number.isFinite(n) ? n : fallback;
                  };
                  const c1 = safeNum(e.cie1, 0);
                  const c2 = safeNum(e.cie2, 0);
                  const c3 = safeNum(e.cie3, 0);
                  const asgn = safeNum(e.assignment, 0);
                  const rawMax = safeNum(cieFilter.max_marks || stu.max_marks, 50);
                  const maxM = rawMax > 0 ? rawMax : 50;
                  const avgScore = (c1 + c2 + c3) / 3 + asgn;
                  const previewTotal = Number.isFinite(avgScore)
                    ? Math.max(0, Math.min(maxM, Number(avgScore.toFixed(2))))
                    : 0;

                  const setField = (key, val) =>
                    setCieEdits((prev) => ({
                      ...prev,
                      [stu.student_id]: { ...e, [key]: val },
                    }));

                  return (
                    <View key={stu.student_id} style={styles.rowItem}>
                      <View style={styles.cardHeaderRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rowTitle}>{stu.full_name || stu.usn}</Text>
                          <Text style={styles.metaText}>{stu.usn}</Text>
                        </View>
                        <StatusBadge status={`Total: ${previewTotal} / ${maxM}`} />
                      </View>

                      {canMarkRecords ? (
                        <View style={styles.cieInputGrid}>
                          {[
                            { key: 'cie1', label: 'CIE 1' },
                            { key: 'cie2', label: 'CIE 2' },
                            { key: 'cie3', label: 'CIE 3' },
                            { key: 'assignment', label: 'Assign' },
                          ].map((f) => (
                            <View key={f.key} style={styles.cieCell}>
                              <Text style={styles.cieCellLabel}>{f.label}</Text>
                              <TextInput
                                style={styles.cieInput}
                                value={e[f.key] ?? ''}
                                onChangeText={(val) => setField(f.key, val)}
                                keyboardType="decimal-pad"
                                placeholder="0"
                                placeholderTextColor={Colors.textMuted}
                              />
                            </View>
                          ))}
                        </View>
                      ) : (
                        <Text style={styles.metaText}>
                          CIE1: {stu.cie1 ?? '—'} · CIE2: {stu.cie2 ?? '—'} · CIE3: {stu.cie3 ?? '—'} · Assign: {stu.assignment ?? '—'}
                        </Text>
                      )}
                    </View>
                  );
                })}

                {canMarkRecords ? (
                  <TouchableOpacity
                    style={[styles.primaryBtn, { marginTop: 10 }]}
                    onPress={handleCommitCie}
                    disabled={busy}
                  >
                    {busy ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={styles.primaryBtnText}>Commit CIE Marks</Text>
                    )}
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : (
              <View style={styles.card}>
                <Text style={styles.rowTitle}>Section CIE Roster (0)</Text>
                <Text style={styles.metaText}>
                  {loading
                    ? 'Loading section CIE roster…'
                    : 'No students loaded yet. Set department, semester, and section filters, then tap Load CIE Roster.'}
                </Text>
              </View>
            )}
          </View>
        )
      ) : null}

      {/* ─── TAB 3: TIMETABLE & CLASS SWAPS ─── */}
      {sectionTab === 'timetable' ? (
        <View style={styles.sectionGap}>
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>Weekly Timetable</Text>
              <View style={styles.rowCenter}>
                {canManageTimetable ? (
                  <TouchableOpacity
                    style={styles.pillAction}
                    onPress={() => setShowCreateSlot((v) => !v)}
                  >
                    <Plus size={14} color={Colors.brandOrange} />
                    <Text style={styles.pillActionText}>{showCreateSlot ? 'Close' : 'Add Slot'}</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity style={styles.iconTouch} onPress={loadTimetable}>
                  <RefreshCw size={16} color={Colors.textBody} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.twoCol}>
              <View style={styles.half}>
                <Text style={styles.label}>Department</Text>
                <TextInput
                  style={styles.input}
                  value={ttFilter.department}
                  onChangeText={(v) => setTtFilter((p) => ({ ...p, department: v.toUpperCase() }))}
                  placeholder="ALL"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="characters"
                />
              </View>
              <View style={styles.half}>
                <Text style={styles.label}>Semester / Sec</Text>
                <View style={styles.twoCol}>
                  <TextInput
                    style={[styles.input, styles.half]}
                    value={ttFilter.semester}
                    onChangeText={(v) => setTtFilter((p) => ({ ...p, semester: v }))}
                    placeholder="Sem"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="number-pad"
                  />
                  <TextInput
                    style={[styles.input, styles.half]}
                    value={ttFilter.section}
                    onChangeText={(v) => setTtFilter((p) => ({ ...p, section: v.toUpperCase() }))}
                    placeholder="Sec"
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="characters"
                  />
                </View>
              </View>
            </View>

            {roles.isFaculty ? (
              <TouchableOpacity
                style={[styles.filterChip, ttFilter.mySlotsOnly && styles.filterChipActive]}
                onPress={() => setTtFilter((p) => ({ ...p, mySlotsOnly: !p.mySlotsOnly }))}
              >
                <Text style={[styles.filterChipText, ttFilter.mySlotsOnly && styles.filterChipTextActive]}>
                  {ttFilter.mySlotsOnly ? 'Showing My Assigned Slots' : 'Show My Slots Only'}
                </Text>
              </TouchableOpacity>
            ) : null}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
              {[{ day: 'ALL', short: 'All Days' }, ...WEEKDAYS].map((d) => {
                const active = String(ttFilter.day) === String(d.day);
                return (
                  <TouchableOpacity
                    key={String(d.day)}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                    onPress={() => setTtFilter((p) => ({ ...p, day: String(d.day) }))}
                  >
                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                      {d.short}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity style={styles.primaryBtn} onPress={loadTimetable} disabled={loading}>
              {loading ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.primaryBtnText}>Load Schedule</Text>}
            </TouchableOpacity>
          </View>

          {/* HOD / ADM / EXM / Super Admin Create Slot Form */}
          {showCreateSlot && canManageTimetable ? (
            <View style={[styles.card, { borderColor: Colors.brandOrange }]}>
              <Text style={styles.cardTitle}>Create / Update Timetable Slot</Text>
              <View style={styles.twoCol}>
                <View style={styles.half}>
                  <Text style={styles.label}>Department *</Text>
                  <TextInput
                    style={styles.input}
                    value={slotForm.department}
                    onChangeText={(v) => setSlotForm((p) => ({ ...p, department: v.toUpperCase() }))}
                    autoCapitalize="characters"
                  />
                </View>
                <View style={styles.half}>
                  <Text style={styles.label}>Semester *</Text>
                  <TextInput
                    style={styles.input}
                    value={slotForm.semester}
                    onChangeText={(v) => setSlotForm((p) => ({ ...p, semester: v }))}
                    keyboardType="number-pad"
                  />
                </View>
              </View>

              <View style={styles.twoCol}>
                <View style={styles.half}>
                  <Text style={styles.label}>Section *</Text>
                  <TextInput
                    style={styles.input}
                    value={slotForm.section}
                    onChangeText={(v) => setSlotForm((p) => ({ ...p, section: v.toUpperCase() }))}
                    autoCapitalize="characters"
                  />
                </View>
                <View style={styles.half}>
                  <Text style={styles.label}>Period No *</Text>
                  <TextInput
                    style={styles.input}
                    value={slotForm.period_no}
                    onChangeText={(v) => setSlotForm((p) => ({ ...p, period_no: v }))}
                    keyboardType="number-pad"
                  />
                </View>
              </View>

              <Text style={styles.label}>Day of Week</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
                {WEEKDAYS.map((d) => {
                  const active = slotForm.day_of_week === d.day;
                  return (
                    <TouchableOpacity
                      key={d.day}
                      style={[styles.filterChip, active && styles.filterChipActive]}
                      onPress={() => setSlotForm((p) => ({ ...p, day_of_week: d.day }))}
                    >
                      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                        {d.short}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={styles.twoCol}>
                <View style={styles.half}>
                  <Text style={styles.label}>Subject Code *</Text>
                  <TextInput
                    style={styles.input}
                    value={slotForm.subject_code}
                    onChangeText={(v) => setSlotForm((p) => ({ ...p, subject_code: v.toUpperCase() }))}
                    placeholder="BCS301"
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="characters"
                  />
                </View>
                <View style={styles.half}>
                  <Text style={styles.label}>Room No</Text>
                  <TextInput
                    style={styles.input}
                    value={slotForm.room_no}
                    onChangeText={(v) => setSlotForm((p) => ({ ...p, room_no: v }))}
                    placeholder="LH-204"
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>
              </View>

              <Text style={styles.label}>Subject Name (Optional)</Text>
              <TextInput
                style={styles.input}
                value={slotForm.subject_name}
                onChangeText={(v) => setSlotForm((p) => ({ ...p, subject_name: v }))}
              />

              <View style={styles.twoCol}>
                <View style={styles.half}>
                  <Text style={styles.label}>Start Time</Text>
                  <TextInput
                    style={styles.input}
                    value={slotForm.start_time}
                    onChangeText={(v) => setSlotForm((p) => ({ ...p, start_time: v }))}
                    placeholder="09:00"
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>
                <View style={styles.half}>
                  <Text style={styles.label}>End Time</Text>
                  <TextInput
                    style={styles.input}
                    value={slotForm.end_time}
                    onChangeText={(v) => setSlotForm((p) => ({ ...p, end_time: v }))}
                    placeholder="10:00"
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>
              </View>

              <Text style={styles.label}>Assign Faculty (Optional Search)</Text>
              {selectedSlotFaculty ? (
                <View style={styles.selectedBox}>
                  <Text style={[styles.rowTitle, { flex: 1 }]}>
                    {selectedSlotFaculty.fullName || selectedSlotFaculty.username}
                  </Text>
                  <TouchableOpacity
                    style={styles.secondarySmallBtn}
                    onPress={() => {
                      setSelectedSlotFaculty(null);
                      setSlotForm((p) => ({ ...p, faculty_id: '' }));
                    }}
                  >
                    <Text style={styles.secondarySmallText}>Clear</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ gap: 6 }}>
                  <View style={styles.searchRow}>
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      value={facSearchQ}
                      onChangeText={setFacSearchQ}
                      placeholder="Search faculty username / email..."
                      placeholderTextColor={Colors.textMuted}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      style={styles.darkSmallBtn}
                      onPress={() => searchFaculty(facSearchQ, setFacSearchResults)}
                    >
                      <Search size={16} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                  {facSearchResults.map((f) => (
                    <TouchableOpacity
                      key={f.id}
                      style={styles.searchHit}
                      onPress={() => {
                        setSelectedSlotFaculty(f);
                        setSlotForm((p) => ({ ...p, faculty_id: f.id }));
                        setFacSearchResults([]);
                      }}
                    >
                      <Text style={styles.rowTitle}>{f.fullName || f.username}</Text>
                      <Text style={styles.metaText}>{f.username} · {f.department}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <TouchableOpacity style={styles.primaryBtn} onPress={handleCreateSlot} disabled={busy}>
                {busy ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.primaryBtnText}>Save Timetable Slot</Text>}
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Weekly Slots List */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Timetable Slots ({slots.length})</Text>
            {slots.length === 0 ? (
              <Text style={styles.metaText}>
                {loading ? 'Loading timetable slots…' : 'No timetable slots matched these filters.'}
              </Text>
            ) : (
              slots.map((slot) => {
                const dayLabel = WEEKDAYS.find((w) => w.day === slot.day_of_week)?.short || `Day ${slot.day_of_week}`;
                const canRequestSwap =
                  canMarkRecords && (slot.faculty_id === currentUserId || roles.isHod || roles.isSuper);
                const canRespondSwap =
                  canMarkRecords &&
                  slot.swap_status === 'PENDING' &&
                  (slot.swapped_faculty_id === currentUserId || roles.isHod || roles.isSuper);
                const isSwapOpen = swapTargetSlotId === slot.id;

                return (
                  <View key={slot.id} style={styles.rowItem}>
                    <View style={styles.cardHeaderRow}>
                      <Text style={styles.rowTitle}>
                        {dayLabel} · P{slot.period_no} · {slot.subject_code}
                      </Text>
                      {slot.swap_status ? <StatusBadge status={`Swap: ${slot.swap_status}`} /> : null}
                    </View>
                    {slot.subject_name ? <Text style={styles.metaBody}>{slot.subject_name}</Text> : null}
                    <View style={styles.rowCenter}>
                      <Clock size={12} color={Colors.textMuted} />
                      <Text style={styles.metaText}>
                        {slot.start_time && slot.end_time ? `${slot.start_time}–${slot.end_time}` : 'Time TBD'} ·{' '}
                        {slot.department} Sem {slot.semester}-{slot.section} · {slot.room_no || 'Room TBD'}
                      </Text>
                    </View>
                    <Text style={styles.metaText}>
                      Faculty: {slot.faculty_name || slot.faculty_username || 'Unassigned'}
                    </Text>

                    {slot.swapped_faculty_id ? (
                      <View style={styles.swapInfoBox}>
                        <Text style={styles.swapInfoText}>
                          Swap Target: {slot.swapped_faculty_name || slot.swapped_faculty_username}
                          {slot.swap_date ? ` · Date: ${String(slot.swap_date).slice(0, 10)}` : ''}
                        </Text>
                      </View>
                    ) : null}

                    {(canRequestSwap || canRespondSwap) ? (
                      <View style={styles.toggleRow}>
                        {canRequestSwap ? (
                          <TouchableOpacity
                            style={styles.secondarySmallBtn}
                            onPress={() => {
                              setSwapTargetSlotId(isSwapOpen ? null : slot.id);
                              setSelectedSwapFaculty(null);
                              setSwapFacResults([]);
                            }}
                          >
                            <Text style={styles.secondarySmallText}>
                              {isSwapOpen ? 'Close Swap' : 'Trigger Swap'}
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                        {canRespondSwap ? (
                          <>
                            <TouchableOpacity
                              style={styles.approveSmallBtn}
                              onPress={() => handleRespondSwap(slot.id, 'APPROVE')}
                              disabled={busy}
                            >
                              <Text style={styles.approveSmallText}>Approve Swap</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.dangerSmallBtn}
                              onPress={() => handleRespondSwap(slot.id, 'REJECT')}
                              disabled={busy}
                            >
                              <Text style={styles.dangerSmallText}>Reject</Text>
                            </TouchableOpacity>
                          </>
                        ) : null}
                      </View>
                    ) : null}

                    {isSwapOpen ? (
                      <View style={styles.swapDrawer}>
                        <Text style={styles.label}>Swap Date (YYYY-MM-DD)</Text>
                        <TextInput
                          style={styles.input}
                          value={swapDate}
                          onChangeText={setSwapDate}
                        />
                        <Text style={styles.label}>Target Faculty</Text>
                        {selectedSwapFaculty ? (
                          <View style={styles.selectedBox}>
                            <Text style={[styles.rowTitle, { flex: 1 }]}>
                              {selectedSwapFaculty.fullName || selectedSwapFaculty.username}
                            </Text>
                            <TouchableOpacity
                              style={styles.secondarySmallBtn}
                              onPress={() => setSelectedSwapFaculty(null)}
                            >
                              <Text style={styles.secondarySmallText}>Change</Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <>
                            <View style={styles.searchRow}>
                              <TextInput
                                style={[styles.input, { flex: 1 }]}
                                value={swapFacQ}
                                onChangeText={setSwapFacQ}
                                placeholder="Search replacement faculty..."
                                placeholderTextColor={Colors.textMuted}
                                autoCapitalize="none"
                              />
                              <TouchableOpacity
                                style={styles.darkSmallBtn}
                                onPress={() => searchFaculty(swapFacQ, setSwapFacResults)}
                              >
                                <Search size={16} color="#FFFFFF" />
                              </TouchableOpacity>
                            </View>
                            {swapFacResults.map((f) => (
                              <TouchableOpacity
                                key={f.id}
                                style={styles.searchHit}
                                onPress={() => {
                                  setSelectedSwapFaculty(f);
                                  setSwapFacResults([]);
                                }}
                              >
                                <Text style={styles.rowTitle}>{f.fullName || f.username}</Text>
                                <Text style={styles.metaText}>{f.username} · {f.department}</Text>
                              </TouchableOpacity>
                            ))}
                          </>
                        )}
                        <TouchableOpacity
                          style={styles.primaryBtn}
                          onPress={() => handleRequestSwap(slot.id)}
                          disabled={busy}
                        >
                          <Text style={styles.primaryBtnText}>Send Swap Request</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 6,
  },
  subTabBtnActive: { backgroundColor: Colors.surfaceDark },
  subTabText: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  subTabTextActive: { color: Colors.textInverse },
  comingSoonBanner: {
    backgroundColor: Colors.brandOrangeLight,
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  comingSoonText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.brandOrange,
    flex: 1,
  },
  card: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    padding: 16,
    gap: 10,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  label: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, marginTop: 2 },
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
  twoCol: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  chipScroll: { gap: 8, paddingVertical: 4 },
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
  filterChipActive: { backgroundColor: Colors.surfaceDark, borderColor: Colors.surfaceDark },
  filterChipText: { fontSize: 12, fontWeight: '600', color: Colors.textBody },
  filterChipTextActive: { color: Colors.textInverse, fontWeight: '700' },
  primaryBtn: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: Colors.surfaceDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: Colors.textInverse, fontSize: 13, fontWeight: '700' },
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
  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  darkSmallBtn: {
    minHeight: 52,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: Colors.surfaceDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  darkSmallText: { color: Colors.textInverse, fontSize: 12, fontWeight: '700' },
  bentoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bentoBox: {
    width: '48%',
    backgroundColor: '#FBFBFC',
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    borderRadius: 14,
    padding: 12,
    gap: 4,
  },
  bentoLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted },
  bentoValue: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  rowItem: {
    borderTopWidth: 1,
    borderTopColor: Colors.hairlineBorder,
    paddingTop: 12,
    marginTop: 4,
    gap: 8,
  },
  rowTitle: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary },
  metaBody: { fontSize: 12, fontWeight: '600', color: Colors.textBody },
  metaText: { fontSize: 12, color: Colors.textMuted, lineHeight: 17 },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 10, fontWeight: '800' },
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
  pillActionText: { fontSize: 11, fontWeight: '700', color: Colors.brandOrange },
  dangerPill: {
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: Colors.statusRoseBg,
    borderWidth: 1,
    borderColor: '#FECACA',
    justifyContent: 'center',
  },
  dangerPillText: { fontSize: 11, fontWeight: '700', color: Colors.statusRose },
  toggleRow: { flexDirection: 'row', gap: 8 },
  statusChip: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    backgroundColor: '#FBFBFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusChipText: { fontSize: 11, fontWeight: '700', color: Colors.textMuted },
  chipPresent: { backgroundColor: Colors.statusEmeraldBg, borderColor: '#A7F3D0' },
  chipPresentText: { color: Colors.statusEmerald },
  chipAbsent: { backgroundColor: Colors.statusRoseBg, borderColor: '#FECACA' },
  chipAbsentText: { color: Colors.statusRose },
  chipLate: { backgroundColor: Colors.statusAmberBg, borderColor: '#FDE68A' },
  chipLateText: { color: '#92400E' },
  cieInputGrid: { flexDirection: 'row', gap: 6 },
  cieCell: { flex: 1, gap: 4 },
  cieCellLabel: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, textAlign: 'center' },
  cieInput: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    backgroundColor: '#FFFFFF',
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  selectedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.statusEmeraldBg,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    padding: 10,
  },
  searchHit: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    backgroundColor: '#FBFBFC',
    padding: 10,
  },
  swapInfoBox: {
    backgroundColor: Colors.statusAmberBg,
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 10,
    padding: 8,
  },
  swapInfoText: { fontSize: 11, fontWeight: '700', color: '#92400E' },
  swapDrawer: {
    backgroundColor: '#FBFBFC',
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  secondarySmallBtn: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    backgroundColor: Colors.canvasBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondarySmallText: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
  approveSmallBtn: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: Colors.statusEmerald,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveSmallText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  dangerSmallBtn: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: Colors.statusRoseBg,
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerSmallText: { fontSize: 12, fontWeight: '700', color: Colors.statusRose },
  errorBox: {
    backgroundColor: Colors.statusRoseBg,
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 12,
  },
  errorText: { color: Colors.statusRose, fontSize: 12, fontWeight: '600' },
  successBox: {
    backgroundColor: Colors.statusEmeraldBg,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    padding: 12,
  },
  successText: { color: Colors.statusEmerald, fontSize: 12, fontWeight: '700' },
});
