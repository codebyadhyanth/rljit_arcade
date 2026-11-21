import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import api from '../config/api';
import { useAuth } from '../context/AuthContext';
import Colors from '../theme/colors';
import DbReceiptCard from '../components/DbReceiptCard';

const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);
const display = (value) => value === null || value === undefined || value === '' ? '—' : String(value);
const pretty = (value) => String(value || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

function Card({ title, children }) {
  return <View style={styles.card}><Text style={styles.cardTitle}>{title}</Text>{children}</View>;
}

function Pair({ label, value }) {
  return <View style={styles.pair}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{display(value)}</Text></View>;
}

function Empty({ children = 'No records were returned by the connected service.' }) {
  return <Text style={styles.empty}>{children}</Text>;
}

export default function DashboardScreen({ onNavigateTab }) {
  const { user, auditReceipt } = useAuth();
  const [profile, setProfile] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [storage, setStorage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const [profileResponse, metricsResponse] = await Promise.all([
        api.get('/api/v1/profile/me'),
        api.get('/api/v1/dashboard/metrics'),
      ]);
      const nextProfile = profileResponse.data?.profile || null;
      const nextMetrics = isRecord(metricsResponse.data?.metrics) ? metricsResponse.data.metrics : {};
      setProfile(nextProfile);
      setMetrics(nextMetrics);

      const student = nextProfile?.studentDetails;
      if (student?.department && student?.semester && student?.section) {
        const params = new URLSearchParams({
          dept: student.department,
          sem: String(student.semester),
          sec: student.section,
        });
        const scheduleResponse = await api.get('/api/v1/timetable/daily-view?' + params.toString());
        setSchedule(Array.isArray(scheduleResponse.data?.schedule) ? scheduleResponse.data.schedule : []);
      } else if (Array.isArray(nextMetrics.todaySchedule)) {
        setSchedule(nextMetrics.todaySchedule);
      } else {
        setSchedule(null);
      }

      if (user?.adminTier === 'SUPER_ADMIN') {
        const storageResponse = await api.get('/api/v1/db/verify-storage');
        setStorage(storageResponse.data || null);
      } else {
        setStorage(null);
      }
    } catch (requestError) {
      setError(requestError?.response?.data?.error || 'Dashboard data could not be loaded. Pull to refresh and try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.adminTier, user?.username]);

  useEffect(() => { load(); }, [load]);

  const role = profile?.adminTier === 'SUPER_ADMIN'
    ? 'Super Admin'
    : (profile?.adminTier === 'HOD_ADMIN' || profile?.subRoles?.includes?.('HOD'))
      ? 'HOD'
      : profile?.sectionCode === 'ADM'
        ? 'Admissions Admin'
        : profile?.sectionCode === 'ACC'
          ? 'Finance Admin'
          : pretty(profile?.baseRole || user?.baseRole || 'Account');
  const detail = profile?.studentDetails || profile?.facultyDetails || profile?.adminDetails || {};
  const department = detail.department || profile?.department;
  const userTotals = isRecord(metrics?.collegeUserTotals) ? metrics.collegeUserTotals : null;
  const factEntries = Object.entries(metrics || {}).filter(([, value]) => value !== null && value !== undefined && typeof value !== 'object');
  const tableCounts = isRecord(storage?.tableCounts) ? Object.entries(storage.tableCounts) : [];

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.brandOrange} />}
    >
      <View style={styles.hero}>
        <Text style={styles.overline}>{role.toUpperCase()} PORTAL</Text>
        <Text style={styles.heading}>{profile?.fullName || user?.fullName || profile?.username || user?.username || 'Account'}</Text>
        <Text style={styles.heroSub}>
          {[department, detail.usn || detail.emp_id || profile?.username, detail.semester ? 'Semester ' + detail.semester : null, detail.section ? 'Section ' + detail.section : null].filter(Boolean).join(' · ') || 'Role-scoped institutional workspace'}
        </Text>
        <TouchableOpacity accessibilityRole="button" style={styles.heroButton} onPress={() => onNavigateTab?.('services')}>
          <Text style={styles.heroButtonText}>Open services</Text>
        </TouchableOpacity>
      </View>

      {error ? <View accessibilityRole="alert" style={styles.error}><Text style={styles.errorText}>{error}</Text></View> : null}
      {loading && !metrics ? <View style={styles.loading}><ActivityIndicator color={Colors.brandOrange} /><Text style={styles.empty}>Loading live dashboard data…</Text></View> : null}

      {role === 'Student' ? (
        <Card title="Academic overview">
          <Pair label="Attendance percentage" value={metrics?.totalSessions ? String(metrics.attendancePercentage) + '%' : 'No records'} />
          <Pair label="Recorded sessions" value={metrics?.totalSessions ? String(metrics.attendedSessions) + ' / ' + metrics.totalSessions : 'No attendance entries'} />
          <Pair label="CIE average" value={metrics?.testsRecorded ? metrics.avgCieMarks : 'No assessment records'} />
          <Pair label="Pending dues" value={metrics?.pendingDues} />
          <Pair label="Documents verified" value={metrics?.totalDocuments != null ? String(metrics.verifiedDocuments) + ' / ' + metrics.totalDocuments : '—'} />
        </Card>
      ) : role === 'Faculty' ? (
        <Card title="Teaching and mentorship">
          <Pair label="Today's timetable slots" value={metrics?.todaySlotsCount} />
          <Pair label="Assigned LG mentees" value={metrics?.lgMenteesCount} />
          <Pair label="Pending leave requests" value={metrics?.pendingLeaveRequests} />
        </Card>
      ) : role === 'HOD' ? (
        <Card title="Department overview">
          <Pair label="Department" value={metrics?.department || department} />
          <Pair label="Students" value={metrics?.departmentStudents} />
          <Pair label="Faculty" value={metrics?.departmentFaculty} />
          <Pair label="Pending unlock reviews" value={metrics?.pendingPostEodUnlockRequests} />
          <Pair label="Attendance average" value={metrics?.departmentAttendanceAverage == null ? '—' : String(metrics.departmentAttendanceAverage) + '%'} />
        </Card>
      ) : userTotals ? (
        <Card title="Institution overview">
          <Pair label="Total users" value={userTotals.TOTAL} />
          <Pair label="Administrators" value={userTotals.ADMIN} />
          <Pair label="Faculty" value={userTotals.FACULTY} />
          <Pair label="Students" value={userTotals.STUDENT} />
        </Card>
      ) : (
        <Card title="Live role metrics">
          {factEntries.length ? factEntries.map(([key, value]) => (
            <Pair key={key} label={pretty(key)} value={typeof value === 'number' && /percentage|average/i.test(key) ? value + '%' : value} />
          )) : <Empty />}
        </Card>
      )}

      {(role === 'Student' || role === 'Faculty') ? (
        <Card title="Today's timetable">
          {Array.isArray(schedule) && schedule.length ? schedule.map((item, index) => (
            <View key={item.timetable_id || item.id || index} style={styles.scheduleRow}>
              <Text style={styles.scheduleTitle}>{display(item.subject_code)}</Text>
              <Text style={styles.scheduleMeta}>{[
                item.department,
                item.semester && 'Semester ' + item.semester,
                item.section && 'Section ' + item.section,
                item.period_no && 'Period ' + item.period_no,
                item.room_no && 'Room ' + item.room_no,
                item.faculty_username,
              ].filter(Boolean).join(' · ')}</Text>
            </View>
          )) : <Empty>{schedule === null ? 'Timetable data is unavailable for this profile.' : 'No timetable entries were returned for today.'}</Empty>}
        </Card>
      ) : null}

      {role === 'Super Admin' ? (
        <Card title="Database storage verification">
          {tableCounts.length ? tableCounts.map(([name, count]) => <Pair key={name} label={name.replace(/_count$/, '')} value={count} />) : <Empty>Storage counts were not returned by the diagnostic endpoint.</Empty>}
        </Card>
      ) : null}

      {(role === 'Student' || role === 'Faculty' || role === 'HOD' || role === 'Admissions Admin' || role === 'Super Admin' || role === 'Finance Admin') ? (
        <Card title="Available services">
          <Text style={styles.empty}>Open role-authorized workflows for this account.</Text>
          <TouchableOpacity accessibilityRole="button" style={styles.action} onPress={() => onNavigateTab?.('services')}>
            <Text style={styles.actionText}>Go to Services</Text>
          </TouchableOpacity>
        </Card>
      ) : null}

      <Card title="Profile details">
        <Pair label="Username" value={profile?.username} />
        <Pair label="Department" value={department} />
        <Pair label="Section" value={profile?.sectionCode} />
        <Pair label="Account status" value={detail.status} />
        <Pair label="Login count" value={profile?.loginCount} />
        <Pair label="Last login" value={profile?.lastLoginAt ? new Date(profile.lastLoginAt).toLocaleString() : null} />
      </Card>
      {auditReceipt ? <DbReceiptCard receipt={auditReceipt} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32, gap: 14, backgroundColor: Colors.canvasBg },
  hero: { backgroundColor: Colors.surfaceDark, borderRadius: 20, padding: 20, gap: 8 },
  overline: { color: '#FDBA74', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  heading: { color: Colors.textInverse, fontSize: 24, fontWeight: '800' },
  heroSub: { color: '#E4E4E7', fontSize: 13, lineHeight: 19 },
  heroButton: { minHeight: 48, alignSelf: 'flex-start', borderRadius: 24, backgroundColor: Colors.surfaceCard, paddingHorizontal: 16, justifyContent: 'center', marginTop: 4 },
  heroButtonText: { color: Colors.textPrimary, fontSize: 13, fontWeight: '700' },
  card: { backgroundColor: Colors.surfaceCard, borderRadius: 20, borderWidth: 1, borderColor: Colors.hairlineBorder, padding: 16, gap: 10 },
  cardTitle: { color: Colors.textPrimary, fontSize: 15, fontWeight: '800', marginBottom: 2 },
  pair: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.divider, paddingVertical: 7 },
  label: { flex: 1, color: Colors.textMuted, fontSize: 12 },
  value: { flex: 1, color: Colors.textBody, fontSize: 12, fontWeight: '700', textAlign: 'right' },
  empty: { color: Colors.textMuted, fontSize: 12, lineHeight: 18 },
  error: { backgroundColor: Colors.statusRoseBg, borderRadius: 14, padding: 14, borderColor: '#FECACA', borderWidth: 1 },
  errorText: { color: Colors.statusRose, fontSize: 13, lineHeight: 19 },
  loading: { minHeight: 70, alignItems: 'center', justifyContent: 'center', gap: 8 },
  scheduleRow: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: Colors.divider, paddingVertical: 8, gap: 4 },
  scheduleTitle: { color: Colors.textBody, fontSize: 13, fontWeight: '700' },
  scheduleMeta: { color: Colors.textMuted, fontSize: 11 },
  action: { minHeight: 48, borderRadius: 14, backgroundColor: Colors.brandOrangeLight, justifyContent: 'center', paddingHorizontal: 14 },
  actionText: { color: Colors.brandOrange, fontSize: 13, fontWeight: '700' },
});
