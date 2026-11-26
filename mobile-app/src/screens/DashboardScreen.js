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
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CreditCard,
  Database,
  GraduationCap,
  Layers,
  Users,
} from 'lucide-react-native';
import api from '../config/api';
import { useAuth } from '../context/AuthContext';
import Colors from '../theme/colors';
import DbReceiptCard from '../components/DbReceiptCard';
import { formatCurrency, getUserRoles } from '../components/services/constants';

const display = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));

function BentoMetric({ label, value, sub, accent }) {
  return (
    <View style={styles.bentoCard}>
      <Text style={styles.bentoLabel}>{label}</Text>
      <Text style={[styles.bentoValue, accent ? { color: accent } : null]}>{display(value)}</Text>
      {sub ? <Text style={styles.bentoSub}>{sub}</Text> : null}
    </View>
  );
}

function Card({ title, rightBadge, children }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{title}</Text>
        {rightBadge || null}
      </View>
      {children}
    </View>
  );
}

function Pair({ label, value, accent }) {
  return (
    <View style={styles.pair}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, accent ? { color: accent } : null]}>{display(value)}</Text>
    </View>
  );
}

function ProgressBarRow({ label, count, maxCount, sub }) {
  const pct = maxCount > 0 ? Math.max(4, Math.round((count / maxCount) * 100)) : 0;
  return (
    <View style={styles.barItem}>
      <View style={styles.barTop}>
        <Text style={styles.barLabel}>{label}</Text>
        <Text style={styles.barCount}>
          {count} {sub ? `· ${sub}` : ''}
        </Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

export default function DashboardScreen({ onNavigateTab }) {
  const { user, auditReceipt } = useAuth();
  const roles = getUserRoles(user);

  const [profile, setProfile] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [storage, setStorage] = useState(null);
  const [studentAtt, setStudentAtt] = useState(null);
  const [facultySlots, setFacultySlots] = useState([]);
  const [menteesCount, setMenteesCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError('');

      try {
        const userId = user?.id || user?.userId;
        const [profileRes, analyticsRes, storageRes, studentAttRes, ttRes, menteesRes] =
          await Promise.allSettled([
            api.get('/api/v1/profile/me'),
            api.get('/api/v1/analytics/overview'),
            roles.isSuper ? api.get('/api/v1/db/verify-storage') : Promise.resolve(null),
            roles.isStudent ? api.get('/api/v1/attendance/student/me') : Promise.resolve(null),
            roles.isFaculty && !roles.isHod && userId
              ? api.get('/api/v1/timetable', { params: { facultyId: userId } })
              : Promise.resolve(null),
            roles.isFaculty && !roles.isHod
              ? api.get('/api/v1/faculty/lg-mentees')
              : Promise.resolve(null),
          ]);

        if (profileRes.status === 'fulfilled') {
          setProfile(profileRes.value?.data?.profile || null);
        } else {
          throw profileRes.reason;
        }

        if (analyticsRes.status === 'fulfilled') {
          setAnalytics(analyticsRes.value?.data || null);
        } else {
          throw analyticsRes.reason;
        }

        if (storageRes.status === 'fulfilled' && storageRes.value?.data) {
          setStorage(storageRes.value.data);
        } else {
          setStorage(null);
        }

        if (studentAttRes.status === 'fulfilled' && studentAttRes.value?.data) {
          setStudentAtt(studentAttRes.value.data);
        } else {
          setStudentAtt(null);
        }

        if (ttRes.status === 'fulfilled' && Array.isArray(ttRes.value?.data?.slots)) {
          setFacultySlots(ttRes.value.data.slots);
        } else {
          setFacultySlots([]);
        }

        if (menteesRes.status === 'fulfilled' && menteesRes.value?.data) {
          setMenteesCount(
            menteesRes.value.data.count ??
              (Array.isArray(menteesRes.value.data.mentees)
                ? menteesRes.value.data.mentees.length
                : 0)
          );
        } else {
          setMenteesCount(null);
        }
      } catch (err) {
        setError(
          err?.response?.data?.error ||
            err?.message ||
            'Dashboard telemetry could not be loaded. Pull down to refresh.'
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user?.id, user?.userId, roles.isSuper, roles.isStudent, roles.isFaculty, roles.isHod]
  );

  useEffect(() => {
    load(false);
  }, [load]);

  const effectiveUser = profile || user;
  const effRoles = getUserRoles(effectiveUser);
  const isExecutiveOrAdmin =
    effRoles.isSuper || effRoles.isPrincipal || effRoles.isManagement || effRoles.isAdmin;

  const roleHeading = effRoles.isSuper
    ? 'SUPER ADMIN'
    : effRoles.isPrincipal
    ? 'PRINCIPAL'
    : effRoles.isManagement
    ? 'MANAGEMENT'
    : effRoles.isHod
    ? 'DEPARTMENT HOD'
    : effRoles.isAdmin
    ? `${effRoles.sectionCode || 'ADMIN'} SECTION`
    : effRoles.isFaculty
    ? 'FACULTY'
    : 'STUDENT';

  const totals = analytics?.totals || {};
  const fin = analytics?.financeSummary || {};
  const acad = analytics?.academicSummary || {};
  const placement = analytics?.placementSummary || {};

  const deptBars = Array.isArray(analytics?.studentsByDepartment)
    ? analytics.studentsByDepartment
    : [];
  const maxDeptCount = deptBars.reduce((mx, d) => Math.max(mx, Number(d.count || 0)), 0);

  const alliedBars = Array.isArray(analytics?.alliedScienceByBranch)
    ? analytics.alliedScienceByBranch
    : [];
  const maxAlliedCount = alliedBars.reduce((mx, d) => Math.max(mx, Number(d.count || 0)), 0);

  const facClassBars = Array.isArray(analytics?.facultyByClassification)
    ? analytics.facultyByClassification
    : [];
  const maxFacClassCount = facClassBars.reduce((mx, d) => Math.max(mx, Number(d.count || 0)), 0);

  const liveTableCounts =
    storage?.liveTableCounts && typeof storage.liveTableCounts === 'object'
      ? Object.entries(storage.liveTableCounts)
      : [];

  // Student computed identity
  const stuDetail = profile?.studentDetails || {};
  const stuBranch = studentAtt?.student?.department || stuDetail.department || profile?.department;
  const stuCoreBranch = studentAtt?.student?.core_branch || stuDetail.coreBranch || null;
  const stuSem = studentAtt?.student?.semester || stuDetail.semester || profile?.semester;
  const stuAcadYear =
    stuDetail.academicYear ||
    (stuSem ? Math.ceil(Number(stuSem) / 2) : null);

  // Faculty today's timetable slots
  const jsDay = new Date().getDay();
  const isoToday = jsDay === 0 ? 7 : jsDay;
  const todaysFacultySlots = facultySlots.filter((s) => Number(s.day_of_week) === isoToday);

  const openServices = (tool = null) => onNavigateTab?.('services', tool);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => load(true)}
          tintColor={Colors.brandOrange}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* Hero Banner */}
      <View style={styles.hero}>
        <View style={styles.heroTopRow}>
          <Text style={styles.overline}>{roleHeading} PORTAL</Text>
          {analytics?.execTimeMs != null ? (
            <View style={styles.execBadge}>
              <Text style={styles.execBadgeText}>{analytics.execTimeMs} ms SQL</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.heading}>
          {profile?.fullName || user?.fullName || profile?.username || user?.username || 'Account'}
        </Text>
        <Text style={styles.heroSub}>
          {[
            stuBranch || profile?.department,
            stuDetail.usn || profile?.facultyDetails?.emp_id || profile?.username,
            stuSem ? `Sem ${stuSem}` : null,
            stuDetail.section ? `Sec ${stuDetail.section}` : null,
          ]
            .filter(Boolean)
            .join(' · ') || 'Role-scoped institutional workspace'}
        </Text>
        <TouchableOpacity
          style={styles.heroButton}
          onPress={() => openServices(null)}
          activeOpacity={0.85}
        >
          <Text style={styles.heroButtonText}>Open Services Hub</Text>
          <ArrowRight size={15} color={Colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.error}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {loading && !analytics ? (
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.brandOrange} />
          <Text style={styles.empty}>Loading live PostgreSQL analytics…</Text>
        </View>
      ) : null}

      {/* ─── ROLE 1: SUPER ADMIN / PRINCIPAL / MANAGEMENT / SECTION ADMINS ─── */}
      {isExecutiveOrAdmin && analytics ? (
        <>
          <View style={styles.bentoGrid}>
            <BentoMetric label="Total Users" value={totals.users ?? 0} />
            <BentoMetric label="Students" value={totals.students ?? 0} />
            <BentoMetric label="Faculty" value={totals.faculty ?? 0} />
            <BentoMetric label="Venues" value={totals.venues ?? 0} />
            <BentoMetric
              label="Pending Venues"
              value={totals.pendingBookings ?? 0}
              sub={`${totals.approvedBookings ?? 0} approved`}
              accent={Number(totals.pendingBookings || 0) > 0 ? Colors.brandOrange : Colors.statusEmerald}
            />
            <BentoMetric
              label="Open Drives"
              value={totals.openDrives ?? placement.open_drives ?? 0}
              sub={`${placement.total_applications ?? 0} applications`}
            />
          </View>

          <Card
            title="Finance Summary"
            rightBadge={
              <View style={styles.tagPill}>
                <Text style={styles.tagPillText}>Live Ledger</Text>
              </View>
            }
          >
            <View style={styles.bentoGrid}>
              <BentoMetric
                label="Collected"
                value={formatCurrency(fin.total_collected)}
                accent={Colors.statusEmerald}
              />
              <BentoMetric
                label="Outstanding"
                value={formatCurrency(fin.total_outstanding)}
                accent={
                  Number(fin.total_outstanding || 0) > 0
                    ? Colors.brandOrange
                    : Colors.statusEmerald
                }
              />
            </View>
            <Pair label="Total Billed" value={formatCurrency(fin.total_billed)} />
            <Pair label="Total Fines" value={formatCurrency(fin.total_fines)} />
            <Pair
              label="Record Statuses"
              value={`${fin.paid_count ?? 0} Paid · ${fin.partial_count ?? 0} Partial · ${fin.pending_count ?? 0} Pending`}
            />
          </Card>

          <Card title="Department Student Breakdown">
            {deptBars.length > 0 ? (
              deptBars.map((d) => (
                <ProgressBarRow
                  key={d.department}
                  label={d.department}
                  count={d.count}
                  maxCount={maxDeptCount}
                  sub={`${d.regular_count} Reg · ${d.lateral_count} Lat`}
                />
              ))
            ) : (
              <Text style={styles.empty}>No student records enrolled yet.</Text>
            )}
          </Card>

          {alliedBars.length > 0 ? (
            <Card title="Allied Science by Core Branch">
              {alliedBars.map((b) => (
                <ProgressBarRow
                  key={b.core_branch}
                  label={b.core_branch}
                  count={b.count}
                  maxCount={maxAlliedCount}
                />
              ))}
            </Card>
          ) : null}

          <Card title="Faculty Classification Breakdown">
            {facClassBars.length > 0 ? (
              facClassBars.map((f) => (
                <ProgressBarRow
                  key={f.classification}
                  label={f.classification}
                  count={f.count}
                  maxCount={maxFacClassCount}
                />
              ))
            ) : (
              <Text style={styles.empty}>No faculty classification rows yet.</Text>
            )}
          </Card>

          {effRoles.isSuper ? (
            <Card
              title="Database Storage Verification"
              rightBadge={
                <View style={styles.emeraldPill}>
                  <Text style={styles.emeraldPillText}>liveTableCounts</Text>
                </View>
              }
            >
              {liveTableCounts.length > 0 ? (
                <View style={styles.tableCountGrid}>
                  {liveTableCounts.map(([table, count]) => (
                    <View key={table} style={styles.tableCountBox}>
                      <Text style={styles.tableCountName} numberOfLines={1}>
                        {table.replace(/_/g, ' ')}
                      </Text>
                      <Text style={styles.tableCountVal}>{count}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.empty}>
                  Storage counts were not returned by /api/v1/db/verify-storage.
                </Text>
              )}
            </Card>
          ) : null}
        </>
      ) : null}

      {/* ─── ROLE 2: HOD ─── */}
      {!isExecutiveOrAdmin && effRoles.isHod && analytics ? (
        <>
          <View style={styles.bentoGrid}>
            <BentoMetric
              label="Dept Students"
              value={totals.students ?? 0}
              sub={analytics.scope?.department || profile?.department}
            />
            <BentoMetric label="Dept Faculty" value={totals.faculty ?? 0} />
            <BentoMetric
              label="Pending Dept Venues"
              value={totals.pendingBookings ?? 0}
              accent={Number(totals.pendingBookings || 0) > 0 ? Colors.brandOrange : Colors.statusEmerald}
            />
            <BentoMetric
              label="Dept Attendance Avg"
              value={`${acad.attendance_present_pct ?? 0}%`}
              sub={`${acad.attendance_records_count ?? 0} records`}
              accent={
                Number(acad.attendance_present_pct || 0) >= 75
                  ? Colors.statusEmerald
                  : Colors.brandOrange
              }
            />
          </View>

          <Card title="Department Academic & Faculty Overview">
            <Pair label="Department Scope" value={analytics.scope?.department || profile?.department} />
            <Pair label="Avg CIE Marks" value={acad.avg_cie_marks ?? 0} />
            <Pair label="CIE Records" value={acad.cie_records_count ?? 0} />
            <Pair label="Open Placement Drives" value={totals.openDrives ?? 0} />
          </Card>

          {facClassBars.length > 0 ? (
            <Card title="Department Faculty Classification">
              {facClassBars.map((f) => (
                <ProgressBarRow
                  key={f.classification}
                  label={f.classification}
                  count={f.count}
                  maxCount={maxFacClassCount}
                />
              ))}
            </Card>
          ) : null}
        </>
      ) : null}

      {/* ─── ROLE 3: FACULTY (NON-HOD) ─── */}
      {!isExecutiveOrAdmin && !effRoles.isHod && effRoles.isFaculty && analytics ? (
        <>
          <View style={styles.bentoGrid}>
            <BentoMetric
              label="Today's Slots"
              value={todaysFacultySlots.length}
              sub={`${facultySlots.length} weekly slots`}
            />
            <BentoMetric
              label="LG Mentees"
              value={menteesCount != null ? menteesCount : '—'}
            />
            <BentoMetric
              label="Dept Attendance Avg"
              value={`${acad.attendance_present_pct ?? 0}%`}
              sub={`${acad.attendance_records_count ?? 0} entries`}
            />
            <BentoMetric
              label="Dept Avg CIE"
              value={acad.avg_cie_marks ?? 0}
              sub={`${acad.cie_records_count ?? 0} marks`}
            />
          </View>

          <Card title="Today's Timetable Slots">
            {todaysFacultySlots.length > 0 ? (
              todaysFacultySlots.map((slot) => (
                <View key={slot.id} style={styles.scheduleRow}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.scheduleTitle}>
                      Period {slot.period_no} · {slot.subject_code}
                    </Text>
                    {slot.swap_status ? (
                      <View style={styles.tagPill}>
                        <Text style={styles.tagPillText}>Swap: {slot.swap_status}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.scheduleMeta}>
                    {[
                      slot.start_time && slot.end_time ? `${slot.start_time}–${slot.end_time}` : null,
                      slot.department,
                      `Sem ${slot.semester}`,
                      `Sec ${slot.section}`,
                      slot.room_no ? `Room ${slot.room_no}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.empty}>
                {facultySlots.length > 0
                  ? `No classes scheduled for today (${facultySlots.length} slot(s) in weekly timetable).`
                  : 'No timetable slots assigned yet.'}
              </Text>
            )}
          </Card>

          <Card title="Quick Academic & Venue Services">
            <View style={styles.quickGrid}>
              <TouchableOpacity style={styles.quickBtn} onPress={() => openServices('attendance')}>
                <Text style={styles.quickBtnText}>Manual Attendance</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickBtn} onPress={() => openServices('cie')}>
                <Text style={styles.quickBtnText}>CIE Marks</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickBtn} onPress={() => openServices('timetable')}>
                <Text style={styles.quickBtnText}>Timetable & Swaps</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickBtn} onPress={() => openServices('venues')}>
                <Text style={styles.quickBtnText}>Venues</Text>
              </TouchableOpacity>
            </View>
          </Card>
        </>
      ) : null}

      {/* ─── ROLE 4: STUDENT ─── */}
      {effRoles.isStudent && analytics ? (
        <>
          <View style={styles.bentoGrid}>
            <BentoMetric
              label="Attendance %"
              value={
                acad.attendance_records_count > 0
                  ? `${acad.attendance_present_pct}%`
                  : studentAtt?.summary?.total_classes > 0
                  ? `${studentAtt.summary.attendance_percentage}%`
                  : 'No records'
              }
              sub={
                studentAtt?.summary?.total_classes > 0
                  ? `${studentAtt.summary.attended_count}/${studentAtt.summary.total_classes} classes`
                  : `${acad.attendance_records_count ?? 0} sessions`
              }
              accent={
                Number(acad.attendance_present_pct || studentAtt?.summary?.attendance_percentage || 0) >= 85
                  ? Colors.statusEmerald
                  : Colors.brandOrange
              }
            />
            <BentoMetric
              label="Avg CIE"
              value={acad.cie_records_count > 0 ? acad.avg_cie_marks : 'No records'}
              sub={`${acad.cie_records_count ?? 0} subjects`}
            />
            <BentoMetric
              label="Pending Fee Balance"
              value={formatCurrency(fin.total_outstanding)}
              sub={`Paid: ${formatCurrency(fin.total_collected ?? fin.total_paid ?? 0)}`}
              accent={
                Number(fin.total_outstanding || 0) > 0
                  ? Colors.brandOrange
                  : Colors.statusEmerald
              }
            />
            <BentoMetric
              label="Open Drives"
              value={placement.open_drives ?? totals.openDrives ?? 0}
              sub="Placements"
            />
          </View>

          <Card title="Academic Branch & Enrollment">
            <Pair label="Branch / Department" value={stuBranch} />
            <Pair label="Core Branch" value={stuCoreBranch} />
            <Pair label="Semester" value={stuSem ? `Semester ${stuSem}` : null} />
            <Pair label="Academic Year" value={stuAcadYear ? `Year ${stuAcadYear}` : null} />
            <Pair label="Section" value={stuDetail.section} />
            <Pair label="CGPA" value={stuDetail.cgpa} />
          </Card>

          <Card title="Student Services Shortcuts">
            <View style={styles.quickGrid}>
              <TouchableOpacity style={styles.quickBtn} onPress={() => openServices('attendance')}>
                <Text style={styles.quickBtnText}>Attendance</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickBtn} onPress={() => openServices('cie')}>
                <Text style={styles.quickBtnText}>CIE Scorecard</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickBtn} onPress={() => openServices('placements')}>
                <Text style={styles.quickBtnText}>Placements</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickBtn} onPress={() => openServices('finance')}>
                <Text style={styles.quickBtnText}>Finance Ledger</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.action}
              onPress={() => openServices('venues')}
              activeOpacity={0.85}
            >
              <Text style={styles.actionText}>Book Campus Venues & Open All Services</Text>
            </TouchableOpacity>
          </Card>
        </>
      ) : null}

      {/* Profile Telemetry Footer */}
      <Card title="Session Telemetry">
        <Pair label="Username / ID" value={profile?.username || user?.username} />
        <Pair label="Department" value={profile?.department || user?.department} />
        <Pair label="Section Code" value={profile?.sectionCode || user?.sectionCode} />
        <Pair label="Login Count" value={profile?.loginCount} />
        <Pair
          label="Last Login"
          value={profile?.lastLoginAt ? new Date(profile.lastLoginAt).toLocaleString() : null}
        />
      </Card>

      {auditReceipt ? <DbReceiptCard receipt={auditReceipt} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 14,
    backgroundColor: Colors.canvasBg,
  },
  hero: {
    backgroundColor: Colors.surfaceDark,
    borderRadius: 20,
    padding: 20,
    gap: 8,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  overline: {
    color: '#FDBA74',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  execBadge: {
    backgroundColor: Colors.surfaceDarkSubtle,
    borderWidth: 1,
    borderColor: Colors.hairlineBorderDark,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  execBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.statusEmerald,
  },
  heading: {
    color: Colors.textInverse,
    fontSize: 22,
    fontWeight: '800',
  },
  heroSub: {
    color: '#E4E4E7',
    fontSize: 13,
    lineHeight: 19,
  },
  heroButton: {
    minHeight: 48,
    alignSelf: 'flex-start',
    borderRadius: 24,
    backgroundColor: Colors.surfaceCard,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  heroButtonText: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  bentoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  bentoCard: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: Colors.surfaceCard,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    padding: 14,
    gap: 4,
  },
  bentoLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  bentoValue: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  bentoSub: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  card: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    padding: 16,
    gap: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  tagPill: {
    backgroundColor: Colors.brandOrangeLight,
    borderColor: '#FED7AA',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  tagPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.brandOrange,
  },
  emeraldPill: {
    backgroundColor: Colors.statusEmeraldBg,
    borderColor: '#A7F3D0',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  emeraldPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.statusEmerald,
  },
  pair: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.divider,
    paddingVertical: 7,
  },
  label: { flex: 1, color: Colors.textMuted, fontSize: 12 },
  value: {
    flex: 1,
    color: Colors.textBody,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  barItem: { gap: 4, paddingVertical: 4 },
  barTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  barLabel: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
  barCount: { fontSize: 11, fontWeight: '600', color: Colors.textMuted },
  barTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: Colors.canvasBg,
    overflow: 'hidden',
  },
  barFill: {
    height: 8,
    borderRadius: 999,
    backgroundColor: Colors.brandOrange,
  },
  tableCountGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tableCountBox: {
    width: '31%',
    flexGrow: 1,
    backgroundColor: '#FBFBFC',
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    borderRadius: 12,
    padding: 8,
    alignItems: 'center',
  },
  tableCountName: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  tableCountVal: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginTop: 2,
  },
  scheduleRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.divider,
    paddingVertical: 8,
    gap: 4,
  },
  scheduleTitle: { color: Colors.textBody, fontSize: 13, fontWeight: '700' },
  scheduleMeta: { color: Colors.textMuted, fontSize: 11 },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickBtn: {
    width: '48%',
    flexGrow: 1,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: '#FBFBFC',
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  quickBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  action: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: Colors.brandOrangeLight,
    borderWidth: 1,
    borderColor: '#FED7AA',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  actionText: {
    color: Colors.brandOrange,
    fontSize: 13,
    fontWeight: '700',
  },
  empty: { color: Colors.textMuted, fontSize: 12, lineHeight: 18 },
  error: {
    backgroundColor: Colors.statusRoseBg,
    borderRadius: 14,
    padding: 14,
    borderColor: '#FECACA',
    borderWidth: 1,
  },
  errorText: { color: Colors.statusRose, fontSize: 13, lineHeight: 19 },
  loading: { minHeight: 70, alignItems: 'center', justifyContent: 'center', gap: 8 },
});
