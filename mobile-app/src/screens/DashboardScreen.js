import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop, Circle } from 'react-native-svg';
import api from '../config/api';
import { useAuth } from '../context/AuthContext';
import Colors from '../theme/colors';
import DbReceiptCard from '../components/DbReceiptCard';
import {
  Clock,
  Activity,
  BookOpen,
  PieChart,
  Trophy,
  Flame,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  GraduationCap,
  CheckCircle2,
} from 'lucide-react-native';

export default function DashboardScreen({ onNavigateTab }) {
  const { user, auditReceipt } = useAuth();
  const [loading, setLoading] = useState(true);
  const [storageData, setStorageData] = useState(null);
  const [departmentUsers, setDepartmentUsers] = useState([]);
  const [deptStats, setDeptStats] = useState({ studentCount: 0, facultyCount: 0 });

  const isSuperAdmin = user?.adminTier === 'SUPER_ADMIN';
  const isHod =
    user?.adminTier === 'HOD_ADMIN' ||
    (Array.isArray(user?.subRoles) && user?.subRoles.includes('HOD'));
  const isAdmissionAdmin = user?.baseRole === 'ADMIN' && user?.sectionCode === 'ADM';

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      if (isSuperAdmin) {
        const res = await api.get('/api/v1/db/verify-storage').catch(() => ({ data: null }));
        if (res.data) setStorageData(res.data);
      } else if (isHod) {
        const dept = user?.department || 'CS';
        const [studentRes, usersRes] = await Promise.all([
          api.get('/db:rljit_arcade:student/status').catch(() => ({ data: null })),
          api.get(`/api/v1/users/search?q=${encodeURIComponent(dept)}`).catch(() => ({ data: null })),
        ]);
        setDeptStats({
          studentCount: studentRes.data?.rowCount ?? 0,
        });
        if (usersRes.data?.results) setDepartmentUsers(usersRes.data.results);
      } else if (isAdmissionAdmin) {
        const [studentRes, searchRes] = await Promise.all([
          api.get('/db:rljit_arcade:student/status').catch(() => ({ data: null })),
          api.get('/api/v1/users/search?q=1RL').catch(() => ({ data: null })),
        ]);
        setDeptStats({ studentCount: studentRes.data?.rowCount ?? 0 });
        if (searchRes.data?.results) setDepartmentUsers(searchRes.data.results);
      }
    } catch (err) {
      // Non-fatal telemetry catch
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [user]);

  // Calculations for proportions
  const counts = storageData?.tableCounts || {};
  const totalUsers = counts.users_count || (isHod ? departmentUsers.length || 1 : 1);
  const adminCount = counts.admin_count || 1;
  const facultyCount = counts.faculty_count || 0;
  const studentCount = counts.student_count || (isHod ? departmentUsers.length : 0);

  const adminPct = Math.min(100, Math.round((adminCount / Math.max(totalUsers, 1)) * 100)) || 10;
  const facultyPct = Math.min(100, Math.round((facultyCount / Math.max(totalUsers, 1)) * 100)) || 22;
  const studentPct = Math.max(0, 100 - adminPct - facultyPct) || 68;

  // Donut circumference for r=24: 2 * PI * 24 ≈ 150.8
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const getOffset = (pct) => circumference - (pct / 100) * circumference;

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {/* ─── 1. BENTO HERO BANNER ─── */}
      <LinearGradient
        colors={['#170a04', '#2a1104', '#121214']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCard}
      >
        <View style={styles.heroHeader}>
          <Text style={styles.heroOverline}>GOOD MORNING,</Text>
          <Text style={styles.heroHeadline}>Make Today Count</Text>
          <Text style={styles.heroSubtitle}>
            Classes, friends, services and verified records — all in one place.
          </Text>
        </View>

        <View style={styles.heroActionsRow}>
          <TouchableOpacity
            style={styles.heroBtn}
            onPress={() => onNavigateTab && onNavigateTab('services')}
            activeOpacity={0.85}
          >
            <Text style={styles.heroBtnText}>Explore CampusHub</Text>
            <ArrowRight size={13} color="#121214" />
          </TouchableOpacity>
        </View>

        {/* Frosted Quote Pill */}
        <View style={styles.heroQuotePill}>
          <GraduationCap size={14} color="#EA580C" />
          <Text style={styles.heroQuoteText}>&ldquo;A brighter you, a bolder tomorrow.&rdquo;</Text>
        </View>
      </LinearGradient>

      {/* ─── 2. TODAY'S SCHEDULE CARD ─── */}
      <View style={styles.scheduleCard}>
        <View style={styles.scheduleHeader}>
          <View style={styles.scheduleTitleRow}>
            <Text style={styles.scheduleTitle}>Mon, Oct 12</Text>
            <View style={styles.todayPill}>
              <Text style={styles.todayPillText}>Today</Text>
            </View>
          </View>
          <View style={styles.scheduleArrows}>
            <ChevronLeft size={16} color="#A1A1AA" />
            <ChevronRight size={16} color="#A1A1AA" />
          </View>
        </View>

        {/* Timeline markers */}
        <View style={styles.timelineHours}>
          <Text style={styles.hourText}>8AM</Text>
          <Text style={styles.hourText}>10AM</Text>
          <Text style={styles.hourText}>12PM</Text>
          <Text style={styles.hourText}>2PM</Text>
          <Text style={styles.hourText}>4PM</Text>
        </View>

        {/* Blocks */}
        <View style={styles.scheduleBlocks}>
          <View style={[styles.scheduleBlock, { backgroundColor: '#EA580C' }]}>
            <Text style={styles.blockTitleLight}>CS101 Lecture</Text>
            <Text style={styles.blockSubLight}>09:00 - 10:30 AM</Text>
          </View>

          <View style={[styles.scheduleBlock, { backgroundColor: '#FFFFFF' }]}>
            <Text style={styles.blockTitleDark}>Lunch Break</Text>
            <Text style={styles.blockSubDark}>12:30 - 01:30 PM</Text>
          </View>

          <View style={[styles.scheduleBlock, { backgroundColor: '#10B981' }]}>
            <Text style={styles.blockTitleLight}>Design Workshop</Text>
            <Text style={styles.blockSubLight}>02:00 - 03:30 PM</Text>
          </View>
        </View>
      </View>

      {/* ─── 3. FOCUS TIME CARD (WAVE AREA CURVE) ─── */}
      <View style={styles.bentoCard}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <View style={styles.iconSquircle}>
              <Clock size={16} color="#FFFFFF" />
            </View>
            <View>
              <Text style={styles.cardTitle}>Focus Time</Text>
              <Text style={styles.cardSub}>Deep work sessions</Text>
            </View>
          </View>
          <View style={styles.periodPill}>
            <Text style={styles.periodText}>This Week</Text>
          </View>
        </View>

        <View style={styles.metricRow}>
          <Text style={styles.metricBig}>
            {counts.users_count ? `${counts.users_count}h 24m` : '18h 24m'}
          </Text>
          <View style={styles.trendBadge}>
            <Text style={styles.trendText}>↑ 28%</Text>
          </View>
          <Text style={styles.trendSub}>vs. last week</Text>
        </View>

        {/* Smooth SVG Area Wave */}
        <View style={styles.svgContainer}>
          <Svg height="80" width="100%" viewBox="0 0 320 80">
            <Defs>
              <SvgLinearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#EA580C" stopOpacity="0.35" />
                <Stop offset="1" stopColor="#EA580C" stopOpacity="0.0" />
              </SvgLinearGradient>
            </Defs>
            <Path
              d="M 0 65 Q 45 25, 90 50 T 180 20 T 260 45 T 320 15 L 320 80 L 0 80 Z"
              fill="url(#grad)"
            />
            <Path
              d="M 0 65 Q 45 25, 90 50 T 180 20 T 260 45 T 320 15"
              fill="none"
              stroke="#EA580C"
              strokeWidth="2.5"
            />
          </Svg>
        </View>
      </View>

      {/* ─── 4. STUDY RHYTHM CARD ─── */}
      <View style={styles.bentoCard}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <View style={styles.iconSquircle}>
              <Activity size={16} color="#FFFFFF" />
            </View>
            <View>
              <Text style={styles.cardTitle}>Study Rhythm</Text>
              <Text style={styles.cardSub}>Focus patterns this week</Text>
            </View>
          </View>
          <View style={styles.periodPill}>
            <Text style={styles.periodText}>This Week</Text>
          </View>
        </View>

        <View style={styles.rhythmBarsContainer}>
          {[
            { day: 'Mon', h: '35%', hl: false },
            { day: 'Tue', h: '80%', hl: true },
            { day: 'Wed', h: '45%', hl: false },
            { day: 'Thu', h: '40%', hl: false },
            { day: 'Fri', h: '88%', hl: true },
            { day: 'Sat', h: '25%', hl: false },
            { day: 'Sun', h: '15%', hl: false },
          ].map((bar, idx) => (
            <View key={idx} style={styles.barColumn}>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { height: bar.h, backgroundColor: bar.hl ? '#EA580C' : '#D4D4D8' },
                  ]}
                />
              </View>
              <Text style={styles.barDay}>{bar.day}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ─── 5. FOCUS MAP CARD (DOT MATRIX) ─── */}
      <View style={styles.bentoCard}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <View style={styles.iconSquircle}>
              <BookOpen size={16} color="#FFFFFF" />
            </View>
            <View>
              <Text style={styles.cardTitle}>Focus Map</Text>
              <Text style={styles.cardSub}>When you&apos;re most focused</Text>
            </View>
          </View>
          <View style={styles.periodPill}>
            <Text style={styles.periodText}>This Week</Text>
          </View>
        </View>

        <View style={styles.matrixContainer}>
          {['8h', '6h', '4h', '2h', '0h'].map((hour, rIdx) => (
            <View key={rIdx} style={styles.matrixRow}>
              <Text style={styles.matrixHour}>{hour}</Text>
              <View style={styles.matrixDots}>
                {[0, 1, 2, 3, 4, 5, 6].map((col) => {
                  const isHigh = (col === 1 && rIdx < 2) || (col === 4 && rIdx < 3);
                  const isMed = (col === 0 && rIdx === 2) || (col === 3 && rIdx === 1) || (col === 4 && rIdx === 3);
                  return (
                    <View
                      key={col}
                      style={[
                        styles.matrixDot,
                        {
                          backgroundColor: isHigh
                            ? '#EA580C'
                            : isMed
                            ? '#FBBF24'
                            : '#F4F4F6',
                        },
                      ]}
                    />
                  );
                })}
              </View>
            </View>
          ))}
          <View style={styles.matrixDays}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => (
              <Text key={i} style={styles.matrixDayLabel}>{d}</Text>
            ))}
          </View>
        </View>
      </View>

      {/* ─── 6. PERFORMANCE CARD (3 CIRCULAR DONUTS) ─── */}
      <View style={styles.bentoCard}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <View style={styles.iconSquircle}>
              <PieChart size={16} color="#FFFFFF" />
            </View>
            <View>
              <Text style={styles.cardTitle}>Performance</Text>
              <Text style={styles.cardSub}>Your activity balance</Text>
            </View>
          </View>
          <View style={styles.periodPill}>
            <Text style={styles.periodText}>This Week</Text>
          </View>
        </View>

        <View style={styles.donutsRow}>
          {/* Gauge 1: Productive (Emerald) */}
          <View style={styles.donutCol}>
            <View style={styles.donutWrap}>
              <Svg width={64} height={64} viewBox="0 0 64 64">
                <Circle cx={32} cy={32} r={radius} stroke="#F4F4F6" strokeWidth={6} fill="none" />
                <Circle
                  cx={32}
                  cy={32}
                  r={radius}
                  stroke="#10B981"
                  strokeWidth={6}
                  strokeDasharray={circumference}
                  strokeDashoffset={getOffset(studentPct)}
                  strokeLinecap="round"
                  fill="none"
                  transform="rotate(-90 32 32)"
                />
              </Svg>
              <View style={styles.donutCenter}>
                <Text style={styles.donutValue}>{studentPct}%</Text>
              </View>
            </View>
            <Text style={styles.donutLabel}>Productive</Text>
          </View>

          {/* Gauge 2: Neutral (Slate) */}
          <View style={styles.donutCol}>
            <View style={styles.donutWrap}>
              <Svg width={64} height={64} viewBox="0 0 64 64">
                <Circle cx={32} cy={32} r={radius} stroke="#F4F4F6" strokeWidth={6} fill="none" />
                <Circle
                  cx={32}
                  cy={32}
                  r={radius}
                  stroke="#A1A1AA"
                  strokeWidth={6}
                  strokeDasharray={circumference}
                  strokeDashoffset={getOffset(facultyPct)}
                  strokeLinecap="round"
                  fill="none"
                  transform="rotate(-90 32 32)"
                />
              </Svg>
              <View style={styles.donutCenter}>
                <Text style={styles.donutValue}>{facultyPct}%</Text>
              </View>
            </View>
            <Text style={styles.donutLabel}>Neutral</Text>
          </View>

          {/* Gauge 3: Distracted (Orange) */}
          <View style={styles.donutCol}>
            <View style={styles.donutWrap}>
              <Svg width={64} height={64} viewBox="0 0 64 64">
                <Circle cx={32} cy={32} r={radius} stroke="#F4F4F6" strokeWidth={6} fill="none" />
                <Circle
                  cx={32}
                  cy={32}
                  r={radius}
                  stroke="#EA580C"
                  strokeWidth={6}
                  strokeDasharray={circumference}
                  strokeDashoffset={getOffset(adminPct)}
                  strokeLinecap="round"
                  fill="none"
                  transform="rotate(-90 32 32)"
                />
              </Svg>
              <View style={styles.donutCenter}>
                <Text style={styles.donutValue}>{adminPct}%</Text>
              </View>
            </View>
            <Text style={styles.donutLabel}>Distracted</Text>
          </View>
        </View>
      </View>

      {/* ─── 7. STUDY STREAK BANNER ─── */}
      <View style={styles.streakBanner}>
        <View style={styles.streakHeader}>
          <View style={styles.iconSquircle}>
            <Trophy size={18} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.streakTitle}>You&apos;re on a 5-day study streak!</Text>
            <Text style={styles.streakSub}>Keep it going — consistency leads to success.</Text>
          </View>
        </View>

        <View style={styles.flamesRow}>
          {[
            { day: 'Mon', on: true },
            { day: 'Tue', on: true },
            { day: 'Wed', on: true },
            { day: 'Thu', on: true },
            { day: 'Fri', on: true },
            { day: 'Sat', on: false },
            { day: 'Sun', on: false },
          ].map((f, i) => (
            <View key={i} style={styles.flameCol}>
              <View
                style={[
                  styles.flameCircle,
                  { backgroundColor: f.on ? '#FFF7ED' : '#F4F4F6' },
                ]}
              >
                <Flame size={14} color={f.on ? '#EA580C' : '#D4D4D8'} />
              </View>
              <Text style={styles.flameDay}>{f.day}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={styles.streakBtn}
          onPress={() => onNavigateTab && onNavigateTab('services')}
          activeOpacity={0.85}
        >
          <Text style={styles.streakBtnText}>Keep Learning</Text>
          <ArrowRight size={13} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Audit Receipt if available */}
      {auditReceipt && (
        <View style={{ marginTop: 14 }}>
          <DbReceiptCard receipt={auditReceipt} />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: 14,
    paddingBottom: 36,
    gap: 14,
  },
  heroCard: {
    borderRadius: 24,
    padding: 20,
    overflow: 'hidden',
    position: 'relative',
    gap: 14,
  },
  heroHeader: {
    gap: 4,
  },
  heroOverline: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FB923C',
    letterSpacing: 1,
  },
  heroHeadline: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    fontSize: 12,
    color: '#D4D4D8',
    lineHeight: 18,
  },
  heroActionsRow: {
    flexDirection: 'row',
  },
  heroBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  heroBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#121214',
  },
  heroQuotePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  heroQuoteText: {
    fontSize: 11,
    fontStyle: 'italic',
    color: '#FEF3C7',
  },
  scheduleCard: {
    backgroundColor: '#18181B',
    borderRadius: 24,
    padding: 18,
    gap: 12,
  },
  scheduleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scheduleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scheduleTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  todayPill: {
    backgroundColor: '#27272A',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  todayPillText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#D4D4D8',
  },
  scheduleArrows: {
    flexDirection: 'row',
    gap: 6,
  },
  timelineHours: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  hourText: {
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#71717A',
  },
  scheduleBlocks: {
    gap: 8,
  },
  scheduleBlock: {
    padding: 10,
    borderRadius: 12,
  },
  blockTitleLight: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  blockSubLight: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 2,
  },
  blockTitleDark: {
    fontSize: 12,
    fontWeight: '800',
    color: '#121214',
  },
  blockSubDark: {
    fontSize: 10,
    color: '#71717A',
    marginTop: 2,
  },
  bentoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#EBEBEF',
    gap: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconSquircle: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#121214',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#09090B',
  },
  cardSub: {
    fontSize: 10,
    color: '#71717A',
  },
  periodPill: {
    backgroundColor: '#F4F4F6',
    borderWidth: 1,
    borderColor: '#EBEBEF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  periodText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#52525B',
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  metricBig: {
    fontSize: 24,
    fontWeight: '900',
    color: '#09090B',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  trendBadge: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  trendText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
  trendSub: {
    fontSize: 10,
    color: '#71717A',
  },
  svgContainer: {
    marginTop: 4,
  },
  rhythmBarsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 110,
    paddingTop: 10,
  },
  barColumn: {
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  barTrack: {
    width: 22,
    height: 75,
    backgroundColor: '#F4F4F6',
    borderRadius: 6,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: 6,
  },
  barDay: {
    fontSize: 10,
    fontWeight: '600',
    color: '#71717A',
  },
  matrixContainer: {
    gap: 6,
  },
  matrixRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  matrixHour: {
    fontSize: 9,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#A1A1AA',
    width: 20,
  },
  matrixDots: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flex: 1,
  },
  matrixDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  matrixDays: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: 28,
    paddingTop: 4,
  },
  matrixDayLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: '#A1A1AA',
  },
  donutsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 6,
  },
  donutCol: {
    alignItems: 'center',
    gap: 4,
  },
  donutWrap: {
    position: 'relative',
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutCenter: {
    position: 'absolute',
  },
  donutValue: {
    fontSize: 12,
    fontWeight: '900',
    color: '#09090B',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  donutLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#52525B',
  },
  streakBanner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#EBEBEF',
    gap: 14,
  },
  streakHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  streakTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#09090B',
  },
  streakSub: {
    fontSize: 10,
    color: '#71717A',
  },
  flamesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  flameCol: {
    alignItems: 'center',
    gap: 4,
  },
  flameCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flameDay: {
    fontSize: 9,
    fontWeight: '700',
    color: '#71717A',
  },
  streakBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#121214',
    paddingVertical: 10,
    borderRadius: 18,
  },
  streakBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
