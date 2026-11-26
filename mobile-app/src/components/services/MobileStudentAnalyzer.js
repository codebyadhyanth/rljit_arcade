import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react-native';
import api from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import Colors from '../../theme/colors';
import { getUserRoles } from './constants';

const RISK_TIERS = ['ALL', 'HIGH', 'MEDIUM', 'LOW'];

function safeScore(val, fallback = 0) {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(100, Math.round(num * 10) / 10));
}

function normalizeRiskTier(raw) {
  const s = String(raw || '').trim().toUpperCase();
  if (['HIGH', 'CRITICAL', 'AT_RISK', 'SEVERE'].includes(s)) return 'HIGH';
  if (['MEDIUM', 'MODERATE', 'WATCH', 'WARNING'].includes(s)) return 'MEDIUM';
  if (['LOW', 'ON_TRACK', 'GOOD', 'HEALTHY'].includes(s)) return 'LOW';
  return s || 'LOW';
}

function getRiskTone(tier) {
  const t = normalizeRiskTier(tier);
  if (t === 'HIGH') {
    return { bg: Colors.statusRoseBg, text: Colors.statusRose, border: '#FECACA' };
  }
  if (t === 'MEDIUM') {
    return { bg: Colors.statusAmberBg, text: Colors.statusAmber, border: '#FDE68A' };
  }
  return { bg: Colors.statusEmeraldBg, text: Colors.statusEmerald, border: '#A7F3D0' };
}

function getScoreColor(score) {
  const s = safeScore(score, 0);
  if (s >= 75) return Colors.statusEmerald;
  if (s >= 50) return Colors.statusAmber;
  return Colors.statusRose;
}

function RiskBadge({ tier }) {
  const normalized = normalizeRiskTier(tier);
  const tone = getRiskTone(normalized);
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg, borderColor: tone.border }]}>
      <Text style={[styles.badgeText, { color: tone.text }]}>{normalized} RISK</Text>
    </View>
  );
}

function extractFourFactors(detail) {
  if (!detail || typeof detail !== 'object') return [];

  const rawArray =
    (Array.isArray(detail.factors) && detail.factors) ||
    (Array.isArray(detail.factorScores) && detail.factorScores) ||
    (Array.isArray(detail.pillars) && detail.pillars) ||
    null;

  if (rawArray && rawArray.length > 0) {
    return rawArray.slice(0, 4).map((f, idx) => ({
      key: f.key || f.id || `factor-${idx}`,
      label: f.label || f.name || f.title || `Factor ${idx + 1}`,
      score: safeScore(f.score ?? f.value ?? f.normalizedScore ?? 0, 0),
      detail:
        f.detail ||
        f.summary ||
        (f.weight != null ? `Weight: ${f.weight}%` : ''),
    }));
  }

  const fObj =
    (detail.factors && !Array.isArray(detail.factors) && detail.factors) ||
    detail.breakdown ||
    detail.factorBreakdown ||
    detail.metrics ||
    detail;

  const attendanceVal =
    fObj.attendanceScore ??
    fObj.attendance_score ??
    fObj.attendance ??
    detail.attendancePercentage ??
    detail.attendance_percentage;
  const cieVal =
    fObj.cieScore ??
    fObj.cie_score ??
    fObj.cie ??
    detail.ciePercentage ??
    detail.cie_percentage;
  const cgpaRaw = fObj.cgpa ?? detail.cgpa;
  const cgpaVal =
    fObj.cgpaScore ??
    fObj.cgpa_score ??
    fObj.academicScore ??
    (cgpaRaw != null && Number.isFinite(Number(cgpaRaw)) ? Number(cgpaRaw) * 10 : undefined);
  const financeVal =
    fObj.financeScore ??
    fObj.finance_score ??
    fObj.clearanceScore ??
    fObj.engagementScore ??
    fObj.consistencyScore ??
    fObj.finance ??
    detail.financeScore;

  return [
    {
      key: 'attendance',
      label: 'Attendance Consistency',
      score: safeScore(attendanceVal, 0),
      detail:
        detail.attendancePercentage != null
          ? `${safeScore(detail.attendancePercentage)}% present`
          : '',
    },
    {
      key: 'cie',
      label: 'CIE Assessment',
      score: safeScore(cieVal, 0),
      detail:
        detail.avgCie != null ? `Avg CIE: ${detail.avgCie}` : '',
    },
    {
      key: 'cgpa',
      label: 'CGPA & Academic Standing',
      score: safeScore(cgpaVal, 0),
      detail: cgpaRaw != null ? `CGPA: ${cgpaRaw}` : '',
    },
    {
      key: 'clearance',
      label: 'Finance & Engagement',
      score: safeScore(financeVal, 0),
      detail:
        detail.pendingDues != null ? `Pending dues: ₹${detail.pendingDues}` : '',
    },
  ];
}

export default function MobileStudentAnalyzer() {
  const { user } = useAuth();
  const roles = getUserRoles(user);
  const isAuthorized = Boolean(roles.isSuper || roles.isHod || roles.isFaculty);

  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [summaryData, setSummaryData] = useState(null);
  const [students, setStudents] = useState([]);
  const [riskFilter, setRiskFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [studentDetail, setStudentDetail] = useState(null);

  const loadAnalyzer = useCallback(async () => {
    if (!isAuthorized) return;
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (riskFilter !== 'ALL') params.riskTier = riskFilter;
      if (searchQuery.trim()) params.q = searchQuery.trim();

      const [sumRes, listRes] = await Promise.all([
        api.get('/api/v1/analyzer/summary'),
        api.get('/api/v1/analyzer/students', { params }),
      ]);

      setSummaryData(sumRes.data || null);
      const list = Array.isArray(listRes.data?.students)
        ? listRes.data.students
        : Array.isArray(listRes.data?.rows)
        ? listRes.data.rows
        : Array.isArray(listRes.data?.data)
        ? listRes.data.data
        : Array.isArray(listRes.data)
        ? listRes.data
        : [];
      setStudents(list);
    } catch (err) {
      setError(
        err?.response?.data?.error ||
          err?.response?.data?.message ||
          err?.message ||
          'Failed to load student performance analyzer.'
      );
    } finally {
      setLoading(false);
    }
  }, [isAuthorized, riskFilter, searchQuery]);

  useEffect(() => {
    if (isAuthorized) {
      loadAnalyzer();
    }
  }, [isAuthorized, loadAnalyzer]);

  const loadStudentDetail = async (student) => {
    const id = student?.studentId || student?.student_id || student?.user_id || student?.id;
    if (!id) {
      setError('Selected student record is missing a studentId.');
      return;
    }
    setSelectedStudentId(id);
    setStudentDetail(null);
    setDetailLoading(true);
    setError('');
    try {
      const res = await api.get(`/api/v1/analyzer/students/${encodeURIComponent(id)}`);
      const detail = res.data?.student || res.data?.analysis || res.data?.data || res.data || null;
      setStudentDetail(detail);
    } catch (err) {
      setError(
        err?.response?.data?.error ||
          err?.response?.data?.message ||
          err?.message ||
          'Failed to load student diagnostic profile.'
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return students.filter((s) => {
      const tier = normalizeRiskTier(s.riskTier || s.risk_tier || s.riskLevel);
      if (riskFilter !== 'ALL' && tier !== riskFilter) return false;
      if (!q) return true;
      const usn = String(s.usn || s.username || '').toLowerCase();
      const name = String(s.fullName || s.full_name || s.name || '').toLowerCase();
      const dept = String(s.department || s.core_branch || '').toLowerCase();
      return usn.includes(q) || name.includes(q) || dept.includes(q);
    });
  }, [students, riskFilter, searchQuery]);

  if (!isAuthorized) {
    return (
      <View style={styles.restrictedCard}>
        <View style={styles.restrictedHeader}>
          <AlertTriangle size={18} color={Colors.statusRose} />
          <Text style={styles.restrictedTitle}>Restricted Institutional Module</Text>
        </View>
        <Text style={styles.restrictedText}>
          Student Performance Analyzer is strictly authorized for Faculty, Department HODs, and
          Super Admin accounts. Student and Section Admin sessions do not have cohort diagnostic
          access.
        </Text>
      </View>
    );
  }

  // ─── DIAGNOSTIC DETAIL PANEL ───
  if (selectedStudentId) {
    const detail = studentDetail || {};
    const compositeScore = safeScore(
      detail.compositeScore ?? detail.composite_score ?? detail.overallScore ?? detail.score ?? 0,
      0
    );
    const riskTier = normalizeRiskTier(
      detail.riskTier || detail.risk_tier || detail.riskLevel
    );
    const factors = extractFourFactors(detail);
    const weakSubjects = Array.isArray(detail.weakSubjects || detail.weak_subjects)
      ? detail.weakSubjects || detail.weak_subjects
      : [];
    const lackingAreas = Array.isArray(detail.lackingAreas || detail.lacking_areas)
      ? detail.lackingAreas || detail.lacking_areas
      : [];
    const improvementSteps = Array.isArray(
      detail.improvementSteps || detail.improvement_steps || detail.recommendations
    )
      ? detail.improvementSteps || detail.improvement_steps || detail.recommendations
      : [];

    return (
      <View style={styles.sectionGap}>
        <TouchableOpacity
          style={styles.backToListBtn}
          onPress={() => {
            setSelectedStudentId(null);
            setStudentDetail(null);
            setError('');
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.backToListText}>← Back to Student Cohort</Text>
        </TouchableOpacity>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {detailLoading ? (
          <View style={styles.card}>
            <ActivityIndicator color={Colors.brandOrange} style={{ marginVertical: 20 }} />
            <Text style={[styles.metaText, { textAlign: 'center' }]}>
              Computing live 4-factor student diagnostic…
            </Text>
          </View>
        ) : studentDetail ? (
          <>
            {/* Composite Score Card */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>
                    {detail.fullName || detail.full_name || detail.usn || 'Student Profile'}
                  </Text>
                  <Text style={styles.metaText}>
                    {[
                      detail.usn || detail.username,
                      detail.department || detail.core_branch,
                      detail.semester ? `Sem ${detail.semester}` : null,
                      detail.section ? `Sec ${detail.section}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                <RiskBadge tier={riskTier} />
              </View>

              <View style={styles.compositeBox}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.bentoLabel}>COMPOSITE SCORE (0–100)</Text>
                  <Text
                    style={[
                      styles.compositeScoreVal,
                      { color: getScoreColor(compositeScore) },
                    ]}
                  >
                    {compositeScore} / 100
                  </Text>
                </View>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${compositeScore}%`,
                        backgroundColor: getScoreColor(compositeScore),
                      },
                    ]}
                  />
                </View>
              </View>
            </View>

            {/* 4-Factor Bars */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardTitle}>4-Factor Diagnostic Breakdown</Text>
                <Activity size={16} color={Colors.brandOrange} />
              </View>
              {factors.map((f) => (
                <View key={f.key} style={styles.factorRow}>
                  <View style={styles.cardHeaderRow}>
                    <Text style={styles.factorLabel}>{f.label}</Text>
                    <Text
                      style={[styles.factorScore, { color: getScoreColor(f.score) }]}
                    >
                      {f.score} / 100
                    </Text>
                  </View>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          width: `${f.score}%`,
                          backgroundColor: getScoreColor(f.score),
                        },
                      ]}
                    />
                  </View>
                  {f.detail ? <Text style={styles.metaSmall}>{f.detail}</Text> : null}
                </View>
              ))}
            </View>

            {/* Weak Subjects */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                Weak Subjects ({weakSubjects.length})
              </Text>
              {weakSubjects.length === 0 ? (
                <Text style={styles.metaText}>
                  No weak subjects flagged for this student.
                </Text>
              ) : (
                weakSubjects.map((sub, idx) => {
                  const isStr = typeof sub === 'string';
                  const title = isStr
                    ? sub
                    : `${sub.subject_code || sub.subjectCode || 'Subject'}${
                        sub.subject_name || sub.subjectName
                          ? ` · ${sub.subject_name || sub.subjectName}`
                          : ''
                      }`;
                  return (
                    <View key={idx} style={styles.detailRowItem}>
                      <Text style={styles.rowTitle}>{title}</Text>
                      {!isStr ? (
                        <Text style={styles.metaText}>
                          {[
                            sub.total_cie != null
                              ? `CIE: ${sub.total_cie}${sub.max_marks ? `/${sub.max_marks}` : ''}`
                              : null,
                            sub.attendance_percentage != null
                              ? `Att: ${sub.attendance_percentage}%`
                              : null,
                            sub.reason || sub.note,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                      ) : null}
                    </View>
                  );
                })
              )}
            </View>

            {/* Lacking Areas */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                Lacking Areas ({lackingAreas.length})
              </Text>
              {lackingAreas.length === 0 ? (
                <Text style={styles.metaText}>
                  No critical lacking areas identified.
                </Text>
              ) : (
                lackingAreas.map((area, idx) => {
                  const isStr = typeof area === 'string';
                  return (
                    <View key={idx} style={styles.warningItem}>
                      <AlertTriangle size={15} color={Colors.statusAmber} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={styles.rowTitle}>
                          {isStr ? area : area.area || area.title || `Area ${idx + 1}`}
                        </Text>
                        {!isStr && (area.description || area.detail || area.metric) ? (
                          <Text style={styles.metaText}>
                            {area.description || area.detail || area.metric}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })
              )}
            </View>

            {/* Improvement Steps */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                Improvement Steps ({improvementSteps.length})
              </Text>
              {improvementSteps.length === 0 ? (
                <Text style={styles.metaText}>
                  No corrective action steps generated.
                </Text>
              ) : (
                improvementSteps.map((step, idx) => {
                  const isStr = typeof step === 'string';
                  return (
                    <View key={idx} style={styles.stepItem}>
                      <View style={styles.stepNumBadge}>
                        <Text style={styles.stepNumText}>{idx + 1}</Text>
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={styles.rowTitle}>
                          {isStr
                            ? step
                            : step.title || step.action || step.step || `Step ${idx + 1}`}
                        </Text>
                        {!isStr && (step.description || step.detail || step.priority) ? (
                          <Text style={styles.metaText}>
                            {step.description || step.detail || `Priority: ${step.priority}`}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </>
        ) : null}
      </View>
    );
  }

  // ─── COHORT SUMMARY & STUDENT LIST ───
  const summary =
    summaryData?.summary || summaryData?.cohortSummary || summaryData || {};
  const totalStudents =
    summary.totalStudents ??
    summary.total_students ??
    summary.studentCount ??
    students.length;
  const avgCompositeRaw =
    summary.averageCompositeScore ??
    summary.avgCompositeScore ??
    summary.avg_composite_score ??
    summary.averageScore ??
    summary.avg_score;
  const avgComposite = Number.isFinite(Number(avgCompositeRaw))
    ? `${safeScore(avgCompositeRaw)} / 100`
    : '—';
  const highRiskCount =
    summary.highRiskCount ??
    summary.high_risk_count ??
    summary.riskCounts?.HIGH ??
    summary.riskDistribution?.HIGH ??
    summary.byRiskTier?.HIGH ??
    0;
  const mediumRiskCount =
    summary.mediumRiskCount ??
    summary.medium_risk_count ??
    summary.moderateRiskCount ??
    summary.riskCounts?.MEDIUM ??
    summary.riskDistribution?.MEDIUM ??
    summary.byRiskTier?.MEDIUM ??
    0;
  const lowRiskCount =
    summary.lowRiskCount ??
    summary.low_risk_count ??
    summary.riskCounts?.LOW ??
    summary.riskDistribution?.LOW ??
    summary.byRiskTier?.LOW ??
    0;

  return (
    <View style={styles.sectionGap}>
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Student Performance Analyzer</Text>
            <Text style={styles.metaText}>
              Live cohort risk telemetry powered by PostgreSQL attendance, CIE & fee records.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.iconTouch}
            onPress={loadAnalyzer}
            disabled={loading}
          >
            <RefreshCw size={16} color={Colors.textBody} />
          </TouchableOpacity>
        </View>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Cohort Summary Cards */}
      <View style={styles.bentoGrid}>
        <View style={styles.bentoCard}>
          <Text style={styles.bentoLabel}>Cohort Students</Text>
          <Text style={styles.bentoValue}>{totalStudents}</Text>
          <Text style={styles.metaSmall}>Analyzed</Text>
        </View>
        <View style={styles.bentoCard}>
          <Text style={styles.bentoLabel}>Avg Composite</Text>
          <Text style={styles.bentoValue}>{avgComposite}</Text>
          <Text style={styles.metaSmall}>0–100 Index</Text>
        </View>
        <View style={styles.bentoCard}>
          <Text style={styles.bentoLabel}>High Risk</Text>
          <Text style={[styles.bentoValue, { color: Colors.statusRose }]}>
            {highRiskCount}
          </Text>
          <Text style={styles.metaSmall}>Immediate Attention</Text>
        </View>
        <View style={styles.bentoCard}>
          <Text style={styles.bentoLabel}>Medium / Low</Text>
          <Text style={[styles.bentoValue, { color: Colors.statusEmerald }]}>
            {mediumRiskCount} / {lowRiskCount}
          </Text>
          <Text style={styles.metaSmall}>Watch / On Track</Text>
        </View>
      </View>

      {/* Filters */}
      <View style={styles.card}>
        <View style={styles.searchRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Filter by USN, student name, or dept..."
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={styles.darkSmallBtn}
            onPress={loadAnalyzer}
            disabled={loading}
          >
            <Search size={16} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.tierRow}>
          {RISK_TIERS.map((tier) => {
            const active = riskFilter === tier;
            return (
              <TouchableOpacity
                key={tier}
                style={[styles.tierChip, active && styles.tierChipActive]}
                onPress={() => setRiskFilter(tier)}
                activeOpacity={0.85}
              >
                <Text
                  style={[styles.tierChipText, active && styles.tierChipTextActive]}
                >
                  {tier}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Student List */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>
            Cohort Diagnostics ({filteredStudents.length})
          </Text>
          <BarChart3 size={16} color={Colors.brandOrange} />
        </View>

        {loading && students.length === 0 ? (
          <ActivityIndicator color={Colors.brandOrange} style={{ marginVertical: 18 }} />
        ) : filteredStudents.length === 0 ? (
          <View style={styles.emptyBox}>
            <CheckCircle2 size={18} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No students matched</Text>
            <Text style={styles.metaText}>
              0 students returned for risk tier "{riskFilter}". Adjust filters or refresh cohort
              data.
            </Text>
          </View>
        ) : (
          filteredStudents.map((stu, idx) => {
            const score = safeScore(
              stu.compositeScore ?? stu.composite_score ?? stu.overallScore ?? stu.score ?? 0,
              0
            );
            const tier = normalizeRiskTier(
              stu.riskTier || stu.risk_tier || stu.riskLevel
            );
            const sid = stu.studentId || stu.student_id || stu.user_id || stu.id || idx;
            return (
              <TouchableOpacity
                key={sid}
                style={styles.studentRow}
                onPress={() => loadStudentDetail(stu)}
                activeOpacity={0.85}
              >
                <View style={styles.cardHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>
                      {stu.fullName || stu.full_name || stu.usn || 'Student'}
                    </Text>
                    <Text style={styles.metaText}>
                      {[
                        stu.usn || stu.username,
                        stu.department || stu.core_branch,
                        stu.semester ? `Sem ${stu.semester}` : null,
                        stu.section ? `Sec ${stu.section}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  <RiskBadge tier={tier} />
                  <ChevronRight size={16} color={Colors.textMuted} />
                </View>

                <View style={styles.scoreRow}>
                  <View style={[styles.barTrack, { flex: 1 }]}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          width: `${score}%`,
                          backgroundColor: getScoreColor(score),
                        },
                      ]}
                    />
                  </View>
                  <Text
                    style={[styles.scoreTag, { color: getScoreColor(score) }]}
                  >
                    {score} / 100
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionGap: { gap: 12 },
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
  cardTitle: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  metaText: { fontSize: 12, color: Colors.textMuted, lineHeight: 17 },
  metaSmall: { fontSize: 11, color: Colors.textMuted },
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
  bentoLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted },
  bentoValue: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
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
  darkSmallBtn: {
    minHeight: 52,
    minWidth: 52,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: Colors.surfaceDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierRow: { flexDirection: 'row', gap: 8 },
  tierChip: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    backgroundColor: '#FBFBFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierChipActive: { backgroundColor: Colors.surfaceDark, borderColor: Colors.surfaceDark },
  tierChipText: { fontSize: 11, fontWeight: '700', color: Colors.textBody },
  tierChipTextActive: { color: Colors.textInverse },
  studentRow: {
    minHeight: 72,
    borderTopWidth: 1,
    borderTopColor: Colors.hairlineBorder,
    paddingTop: 12,
    gap: 8,
  },
  rowTitle: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 10, fontWeight: '800' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  scoreTag: { fontSize: 12, fontWeight: '800', minWidth: 64, textAlign: 'right' },
  barTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: Colors.canvasBg,
    overflow: 'hidden',
  },
  barFill: { height: 8, borderRadius: 999 },
  backToListBtn: {
    minHeight: 48,
    backgroundColor: Colors.surfaceCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  backToListText: { fontSize: 13, fontWeight: '700', color: Colors.brandOrange },
  compositeBox: {
    backgroundColor: '#FBFBFC',
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  compositeScoreVal: { fontSize: 20, fontWeight: '800' },
  factorRow: {
    borderTopWidth: 1,
    borderTopColor: Colors.hairlineBorder,
    paddingTop: 10,
    gap: 6,
  },
  factorLabel: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, flex: 1 },
  factorScore: { fontSize: 13, fontWeight: '800' },
  detailRowItem: {
    borderTopWidth: 1,
    borderTopColor: Colors.hairlineBorder,
    paddingTop: 10,
    gap: 3,
  },
  warningItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: Colors.statusAmberBg,
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 10,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#FBFBFC',
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    borderRadius: 12,
    padding: 10,
  },
  stepNumBadge: {
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: Colors.surfaceDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: { fontSize: 11, fontWeight: '800', color: Colors.textInverse },
  emptyBox: {
    backgroundColor: '#FBFBFC',
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    gap: 6,
  },
  emptyTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  restrictedCard: {
    backgroundColor: Colors.statusRoseBg,
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 20,
    padding: 18,
    gap: 8,
  },
  restrictedHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  restrictedTitle: { fontSize: 15, fontWeight: '800', color: Colors.statusRose },
  restrictedText: { fontSize: 13, color: Colors.textBody, lineHeight: 19 },
  errorBox: {
    backgroundColor: Colors.statusRoseBg,
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 12,
  },
  errorText: { color: Colors.statusRose, fontSize: 12, fontWeight: '600' },
});
