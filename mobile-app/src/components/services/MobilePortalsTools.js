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
  Briefcase,
  CreditCard,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react-native';
import api from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import Colors from '../../theme/colors';
import DbReceiptCard from '../DbReceiptCard';
import {
  CORE_BRANCHES,
  formatCurrency,
  getStatusTone,
  getTodayIsoDate,
  getUserRoles,
} from './constants';

const FEE_TYPES = ['TUITION_FEE', 'EXAM_FEE', 'HOSTEL_FEE', 'LIBRARY_FINE', 'MISC_FEE'];
const DRIVE_STATUSES = ['ALL', 'OPEN', 'CLOSED', 'COMPLETED'];
const FINANCE_STATUSES = ['ALL', 'PENDING', 'PARTIAL', 'PAID'];

function StatusPill({ status, label }) {
  const tone = getStatusTone(status);
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg, borderColor: tone.border }]}>
      <Text style={[styles.badgeText, { color: tone.text }]}>
        {label || String(status || '—')}
      </Text>
    </View>
  );
}

export default function MobilePortalsTools({ initialSection = 'placements' }) {
  const { user } = useAuth();
  const roles = getUserRoles(user);
  const canCreateDrive = roles.isPlacement || roles.isSuper;
  const canWriteFinance = roles.isFinance || roles.isSuper;
  const canViewFinance =
    roles.isStudent || roles.isSuper || roles.isHod || roles.isFinance || roles.isManagement || roles.isPrincipal;

  const [sectionTab, setSectionTab] = useState(
    initialSection === 'finance' && canViewFinance ? 'finance' : 'placements'
  );
  useEffect(() => {
    if (initialSection === 'finance' && canViewFinance) setSectionTab('finance');
    else if (initialSection === 'placements') setSectionTab('placements');
  }, [initialSection, canViewFinance]);

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [receipt, setReceipt] = useState(null);

  // ─── Placements State ───
  const [drives, setDrives] = useState([]);
  const [driveStatusFilter, setDriveStatusFilter] = useState('ALL');
  const [driveBranchFilter, setDriveBranchFilter] = useState('');
  const [showCreateDrive, setShowCreateDrive] = useState(false);
  const [driveForm, setDriveForm] = useState({
    company_name: '',
    role_title: '',
    package_lpa: '',
    min_cgpa: '6.5',
    eligible_branches: [],
    drive_date: getTodayIsoDate(),
    status: 'OPEN',
  });

  // ─── Finance State ───
  const [financeSummary, setFinanceSummary] = useState(null);
  const [financeRecords, setFinanceRecords] = useState([]);
  const [finFilters, setFinFilters] = useState({
    usn: '',
    department: '',
    status: 'ALL',
    fee_type: '',
  });
  const [showPostCharge, setShowPostCharge] = useState(false);
  const [chargeForm, setChargeForm] = useState({
    usn: '',
    fee_type: 'TUITION_FEE',
    amount_due: '',
    amount_paid: '0',
    fine_amount: '0',
    due_date: '',
  });
  const [stuSearchQ, setStuSearchQ] = useState('');
  const [stuSearchHits, setStuSearchHits] = useState([]);
  const [payDrawerId, setPayDrawerId] = useState(null);
  const [payForm, setPayForm] = useState({ payment_amount: '', fine_payment: '0' });
  const [clearance, setClearance] = useState(null);
  const [clearanceUsn, setClearanceUsn] = useState(roles.isStudent ? user?.username || '' : '');

  const loadDrives = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (driveStatusFilter !== 'ALL') params.status = driveStatusFilter;
      if (driveBranchFilter.trim()) params.branch = driveBranchFilter.trim().toUpperCase();
      const res = await api.get('/api/v1/placements/drives', { params });
      setDrives(Array.isArray(res.data?.drives) ? res.data.drives : []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load placement drives.');
    } finally {
      setLoading(false);
    }
  }, [driveStatusFilter, driveBranchFilter]);

  const loadFinanceRecords = useCallback(async () => {
    if (!canViewFinance) return;
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (!roles.isStudent) {
        if (finFilters.usn.trim()) params.usn = finFilters.usn.trim().toUpperCase();
        if (finFilters.department.trim()) params.department = finFilters.department.trim().toUpperCase();
      }
      if (finFilters.status !== 'ALL') params.status = finFilters.status;
      if (finFilters.fee_type.trim()) params.fee_type = finFilters.fee_type.trim().toUpperCase();

      const res = await api.get('/api/v1/finance/records', { params });
      setFinanceSummary(res.data?.summary || null);
      setFinanceRecords(Array.isArray(res.data?.records) ? res.data.records : []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load finance ledger.');
    } finally {
      setLoading(false);
    }
  }, [canViewFinance, roles.isStudent, finFilters]);

  useEffect(() => {
    setError('');
    setSuccessMsg('');
    setReceipt(null);
    if (sectionTab === 'placements') loadDrives();
    else if (sectionTab === 'finance') loadFinanceRecords();
  }, [sectionTab, loadDrives, loadFinanceRecords]);

  const handleApplyDrive = async (driveId) => {
    setBusy(true);
    setError('');
    setSuccessMsg('');
    setReceipt(null);
    try {
      const res = await api.post(`/api/v1/placements/drives/${driveId}/apply`, {});
      setSuccessMsg(res.data?.message || 'Application submitted.');
      setReceipt(res.data?.dbReceipt || null);
      await loadDrives();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to apply to drive.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateDrive = async () => {
    if (!driveForm.company_name.trim() || !driveForm.role_title.trim() || !driveForm.package_lpa || !driveForm.drive_date.trim()) {
      setError('Company name, role title, package (LPA), and drive date are required.');
      return;
    }
    setBusy(true);
    setError('');
    setSuccessMsg('');
    setReceipt(null);
    try {
      const res = await api.post('/api/v1/placements/drives', {
        company_name: driveForm.company_name.trim(),
        role_title: driveForm.role_title.trim(),
        package_lpa: Number(driveForm.package_lpa),
        min_cgpa: Number(driveForm.min_cgpa || 0),
        eligible_branches: driveForm.eligible_branches,
        drive_date: driveForm.drive_date.trim(),
        status: driveForm.status,
      });
      setSuccessMsg(res.data?.message || 'Placement drive created.');
      setReceipt(res.data?.dbReceipt || null);
      setShowCreateDrive(false);
      setDriveForm({
        company_name: '',
        role_title: '',
        package_lpa: '',
        min_cgpa: '6.5',
        eligible_branches: [],
        drive_date: getTodayIsoDate(),
        status: 'OPEN',
      });
      await loadDrives();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create placement drive.');
    } finally {
      setBusy(false);
    }
  };

  const searchStudentsForCharge = async () => {
    if (!stuSearchQ.trim()) return;
    setError('');
    try {
      const res = await api.get('/api/v1/users/search', { params: { q: stuSearchQ.trim() } });
      const hits = (res.data?.results || []).filter((u) => u.baseRole === 'STUDENT');
      setStuSearchHits(hits);
      if (hits.length === 0) setError('No students matched that search.');
    } catch (err) {
      setError(err.response?.data?.error || 'Student search failed.');
    }
  };

  const handlePostCharge = async () => {
    if (!chargeForm.usn.trim() || !chargeForm.fee_type.trim() || !chargeForm.amount_due) {
      setError('Student USN, fee type, and amount due are required.');
      return;
    }
    setBusy(true);
    setError('');
    setSuccessMsg('');
    setReceipt(null);
    try {
      const res = await api.post('/api/v1/finance/records', {
        usn: chargeForm.usn.trim().toUpperCase(),
        fee_type: chargeForm.fee_type.trim().toUpperCase(),
        amount_due: Number(chargeForm.amount_due),
        amount_paid: Number(chargeForm.amount_paid || 0),
        fine_amount: Number(chargeForm.fine_amount || 0),
        due_date: chargeForm.due_date.trim() || null,
      });
      setSuccessMsg(res.data?.message || 'Finance charge posted.');
      setReceipt(res.data?.dbReceipt || null);
      setShowPostCharge(false);
      setChargeForm((p) => ({ ...p, amount_due: '', amount_paid: '0', fine_amount: '0', due_date: '' }));
      await loadFinanceRecords();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create finance record.');
    } finally {
      setBusy(false);
    }
  };

  const handlePayRecord = async (recordId) => {
    const basePay = Number(payForm.payment_amount || 0);
    const finePay = Number(payForm.fine_payment || 0);
    if (basePay + finePay <= 0) {
      setError('Enter a positive payment amount.');
      return;
    }
    setBusy(true);
    setError('');
    setSuccessMsg('');
    setReceipt(null);
    try {
      const res = await api.patch(`/api/v1/finance/records/${recordId}/pay`, {
        payment_amount: basePay,
        fine_payment: finePay,
      });
      setSuccessMsg(res.data?.message || 'Payment recorded.');
      setReceipt(res.data?.dbReceipt || null);
      setPayDrawerId(null);
      await loadFinanceRecords();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to record payment.');
    } finally {
      setBusy(false);
    }
  };

  const handleLoadClearance = async () => {
    const target = (roles.isStudent ? user?.username : clearanceUsn).trim();
    if (!target) {
      setError('Enter a Student USN to evaluate clearance.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await api.get(`/api/v1/student/clearance-status/${encodeURIComponent(target)}`);
      setClearance(res.data || null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to check clearance status.');
    } finally {
      setBusy(false);
    }
  };

  const toggleBranch = (branch) => {
    setDriveForm((prev) => {
      const exists = prev.eligible_branches.includes(branch);
      return {
        ...prev,
        eligible_branches: exists
          ? prev.eligible_branches.filter((b) => b !== branch)
          : [...prev.eligible_branches, branch],
      };
    });
  };

  return (
    <View style={styles.container}>
      {/* Top Switcher */}
      {canViewFinance ? (
        <View style={styles.subTabBar}>
          <TouchableOpacity
            style={[styles.subTabBtn, sectionTab === 'placements' && styles.subTabBtnActive]}
            onPress={() => setSectionTab('placements')}
          >
            <Briefcase size={15} color={sectionTab === 'placements' ? '#FFFFFF' : Colors.textMuted} />
            <Text style={[styles.subTabText, sectionTab === 'placements' && styles.subTabTextActive]}>
              Placements
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.subTabBtn, sectionTab === 'finance' && styles.subTabBtnActive]}
            onPress={() => setSectionTab('finance')}
          >
            <CreditCard size={15} color={sectionTab === 'finance' ? '#FFFFFF' : Colors.textMuted} />
            <Text style={[styles.subTabText, sectionTab === 'finance' && styles.subTabTextActive]}>
              Finance Ledger
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

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
      {receipt ? <DbReceiptCard receipt={receipt} title="Portal PostgreSQL Receipt" /> : null}

      {/* ─── SECTION 1: PLACEMENTS ─── */}
      {sectionTab === 'placements' ? (
        <View style={styles.sectionGap}>
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>Campus Placement Drives</Text>
              <View style={styles.rowCenter}>
                {canCreateDrive ? (
                  <TouchableOpacity
                    style={styles.pillAction}
                    onPress={() => setShowCreateDrive((v) => !v)}
                  >
                    <Plus size={14} color={Colors.brandOrange} />
                    <Text style={styles.pillActionText}>
                      {showCreateDrive ? 'Close' : 'Create Drive'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity style={styles.iconTouch} onPress={loadDrives}>
                  <RefreshCw size={16} color={Colors.textBody} />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
              {DRIVE_STATUSES.map((st) => {
                const active = driveStatusFilter === st;
                return (
                  <TouchableOpacity
                    key={st}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                    onPress={() => setDriveStatusFilter(st)}
                  >
                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                      {st}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.searchRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={driveBranchFilter}
                onChangeText={(v) => setDriveBranchFilter(v.toUpperCase())}
                placeholder="Filter by branch (e.g. CSE, AIML)"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="characters"
              />
              <TouchableOpacity style={styles.darkSmallBtn} onPress={loadDrives}>
                <Text style={styles.darkSmallText}>Filter</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Create Placement Drive Form (PLC / Super Admin) */}
          {showCreateDrive && canCreateDrive ? (
            <View style={[styles.card, { borderColor: Colors.brandOrange }]}>
              <Text style={styles.cardTitle}>Post New Placement Drive</Text>
              <Text style={styles.label}>Company Name *</Text>
              <TextInput
                style={styles.input}
                value={driveForm.company_name}
                onChangeText={(v) => setDriveForm((p) => ({ ...p, company_name: v }))}
                placeholder="e.g. Bosch Global Software"
                placeholderTextColor={Colors.textMuted}
              />
              <Text style={styles.label}>Role Title *</Text>
              <TextInput
                style={styles.input}
                value={driveForm.role_title}
                onChangeText={(v) => setDriveForm((p) => ({ ...p, role_title: v }))}
                placeholder="e.g. Associate Software Engineer"
                placeholderTextColor={Colors.textMuted}
              />
              <View style={styles.twoCol}>
                <View style={styles.half}>
                  <Text style={styles.label}>Package (LPA) *</Text>
                  <TextInput
                    style={styles.input}
                    value={driveForm.package_lpa}
                    onChangeText={(v) => setDriveForm((p) => ({ ...p, package_lpa: v }))}
                    keyboardType="decimal-pad"
                    placeholder="8.5"
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>
                <View style={styles.half}>
                  <Text style={styles.label}>Min CGPA</Text>
                  <TextInput
                    style={styles.input}
                    value={driveForm.min_cgpa}
                    onChangeText={(v) => setDriveForm((p) => ({ ...p, min_cgpa: v }))}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>
              <Text style={styles.label}>Drive Date (YYYY-MM-DD) *</Text>
              <TextInput
                style={styles.input}
                value={driveForm.drive_date}
                onChangeText={(v) => setDriveForm((p) => ({ ...p, drive_date: v }))}
              />
              <Text style={styles.label}>Eligible Branches (None = All Branches)</Text>
              <View style={styles.wrapChips}>
                {CORE_BRANCHES.map((b) => {
                  const selected = driveForm.eligible_branches.includes(b);
                  return (
                    <TouchableOpacity
                      key={b}
                      style={[styles.filterChip, selected && styles.filterChipActive]}
                      onPress={() => toggleBranch(b)}
                    >
                      <Text style={[styles.filterChipText, selected && styles.filterChipTextActive]}>
                        {b}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TouchableOpacity style={styles.primaryBtn} onPress={handleCreateDrive} disabled={busy}>
                {busy ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.primaryBtnText}>Publish Placement Drive</Text>}
              </TouchableOpacity>
            </View>
          ) : null}

          {loading && drives.length === 0 ? (
            <ActivityIndicator color={Colors.brandOrange} style={{ marginVertical: 20 }} />
          ) : drives.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.metaText}>No placement drives found.</Text>
            </View>
          ) : (
            drives.map((d) => {
              const branchesLabel =
                Array.isArray(d.eligible_branches) && d.eligible_branches.length > 0
                  ? d.eligible_branches.join(', ')
                  : 'All Branches';
              const canApply =
                roles.isStudent && d.status === 'OPEN' && d.is_eligible && !d.applied;

              return (
                <View key={d.id} style={styles.card}>
                  <View style={styles.cardHeaderRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.overline}>₹{d.package_lpa} LPA · MIN CGPA {d.min_cgpa}</Text>
                      <Text style={styles.cardTitle}>{d.company_name}</Text>
                      <Text style={styles.roleTitle}>{d.role_title}</Text>
                    </View>
                    <StatusPill status={d.status} />
                  </View>

                  <Text style={styles.metaText}>
                    Drive Date: {d.drive_date ? String(d.drive_date).slice(0, 10) : '—'} · Applicants: {d.applications_count ?? 0}
                  </Text>
                  <Text style={styles.metaText}>Eligible Branches: {branchesLabel}</Text>

                  {roles.isStudent ? (
                    <View style={styles.studentDriveFooter}>
                      {d.applied ? (
                        <StatusPill
                          status="APPLIED"
                          label={`Applied · ${d.application_status || 'APPLIED'}`}
                        />
                      ) : d.is_eligible ? (
                        <StatusPill status="OPEN" label="Eligible to Apply" />
                      ) : (
                        <StatusPill status="REJECTED" label="Not Eligible (CGPA / Branch)" />
                      )}

                      {canApply ? (
                        <TouchableOpacity
                          style={styles.applyBtn}
                          onPress={() => handleApplyDrive(d.id)}
                          disabled={busy}
                        >
                          <Text style={styles.applyBtnText}>Apply Now</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </View>
      ) : null}

      {/* ─── SECTION 2: FINANCE LEDGER ─── */}
      {sectionTab === 'finance' && canViewFinance ? (
        <View style={styles.sectionGap}>
          {/* Summary Bento */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>Finance Summary</Text>
              <View style={styles.rowCenter}>
                {canWriteFinance ? (
                  <TouchableOpacity
                    style={styles.pillAction}
                    onPress={() => setShowPostCharge((v) => !v)}
                  >
                    <Plus size={14} color={Colors.brandOrange} />
                    <Text style={styles.pillActionText}>
                      {showPostCharge ? 'Close' : 'Post Charge'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity style={styles.iconTouch} onPress={loadFinanceRecords}>
                  <RefreshCw size={16} color={Colors.textBody} />
                </TouchableOpacity>
              </View>
            </View>

            {financeSummary ? (
              <View style={styles.bentoGrid}>
                <View style={styles.bentoBox}>
                  <Text style={styles.bentoLabel}>Total Due</Text>
                  <Text style={styles.bentoValue}>{formatCurrency(financeSummary.total_due)}</Text>
                </View>
                <View style={styles.bentoBox}>
                  <Text style={styles.bentoLabel}>Total Paid</Text>
                  <Text style={[styles.bentoValue, { color: Colors.statusEmerald }]}>
                    {formatCurrency(financeSummary.total_paid)}
                  </Text>
                </View>
                <View style={styles.bentoBox}>
                  <Text style={styles.bentoLabel}>Total Fine</Text>
                  <Text style={styles.bentoValue}>{formatCurrency(financeSummary.total_fine)}</Text>
                </View>
                <View style={styles.bentoBox}>
                  <Text style={styles.bentoLabel}>Outstanding</Text>
                  <Text
                    style={[
                      styles.bentoValue,
                      {
                        color:
                          Number(financeSummary.outstanding_balance || 0) > 0
                            ? Colors.brandOrange
                            : Colors.statusEmerald,
                      },
                    ]}
                  >
                    {formatCurrency(financeSummary.outstanding_balance)}
                  </Text>
                </View>
              </View>
            ) : loading ? (
              <ActivityIndicator color={Colors.brandOrange} />
            ) : null}

            {/* Filters */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
              {FINANCE_STATUSES.map((st) => {
                const active = finFilters.status === st;
                return (
                  <TouchableOpacity
                    key={st}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                    onPress={() => setFinFilters((p) => ({ ...p, status: st }))}
                  >
                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                      {st}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {!roles.isStudent ? (
              <View style={styles.twoCol}>
                <TextInput
                  style={[styles.input, styles.half]}
                  value={finFilters.usn}
                  onChangeText={(v) => setFinFilters((p) => ({ ...p, usn: v.toUpperCase() }))}
                  placeholder="Filter USN"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="characters"
                />
                <TextInput
                  style={[styles.input, styles.half]}
                  value={finFilters.department}
                  onChangeText={(v) => setFinFilters((p) => ({ ...p, department: v.toUpperCase() }))}
                  placeholder="Filter Dept"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="characters"
                />
              </View>
            ) : null}
          </View>

          {/* Post Charge Form (ACC / Super Admin) */}
          {showPostCharge && canWriteFinance ? (
            <View style={[styles.card, { borderColor: Colors.brandOrange }]}>
              <Text style={styles.cardTitle}>Post Fee / Fine Obligation</Text>
              <Text style={styles.label}>Find Student USN</Text>
              <View style={styles.searchRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={stuSearchQ}
                  onChangeText={setStuSearchQ}
                  placeholder="Search USN, email, or phone..."
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="none"
                />
                <TouchableOpacity style={styles.darkSmallBtn} onPress={searchStudentsForCharge}>
                  <Search size={16} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
              {stuSearchHits.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={styles.searchHit}
                  onPress={() => {
                    setChargeForm((p) => ({ ...p, usn: s.username }));
                    setStuSearchHits([]);
                  }}
                >
                  <Text style={styles.roleTitle}>{s.fullName || s.username}</Text>
                  <Text style={styles.metaText}>{s.username} · {s.department} · Sem {s.semester}</Text>
                </TouchableOpacity>
              ))}

              <Text style={styles.label}>Student USN *</Text>
              <TextInput
                style={styles.input}
                value={chargeForm.usn}
                onChangeText={(v) => setChargeForm((p) => ({ ...p, usn: v.toUpperCase() }))}
                placeholder="1RL26CSE001"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="characters"
              />

              <Text style={styles.label}>Fee Type *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
                {FEE_TYPES.map((ft) => {
                  const active = chargeForm.fee_type === ft;
                  return (
                    <TouchableOpacity
                      key={ft}
                      style={[styles.filterChip, active && styles.filterChipActive]}
                      onPress={() => setChargeForm((p) => ({ ...p, fee_type: ft }))}
                    >
                      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                        {ft.replace(/_/g, ' ')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <TextInput
                style={styles.input}
                value={chargeForm.fee_type}
                onChangeText={(v) => setChargeForm((p) => ({ ...p, fee_type: v.toUpperCase() }))}
                autoCapitalize="characters"
              />

              <View style={styles.twoCol}>
                <View style={styles.half}>
                  <Text style={styles.label}>Amount Due (₹) *</Text>
                  <TextInput
                    style={styles.input}
                    value={chargeForm.amount_due}
                    onChangeText={(v) => setChargeForm((p) => ({ ...p, amount_due: v }))}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.half}>
                  <Text style={styles.label}>Fine Amount (₹)</Text>
                  <TextInput
                    style={styles.input}
                    value={chargeForm.fine_amount}
                    onChangeText={(v) => setChargeForm((p) => ({ ...p, fine_amount: v }))}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              <View style={styles.twoCol}>
                <View style={styles.half}>
                  <Text style={styles.label}>Initial Paid (₹)</Text>
                  <TextInput
                    style={styles.input}
                    value={chargeForm.amount_paid}
                    onChangeText={(v) => setChargeForm((p) => ({ ...p, amount_paid: v }))}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.half}>
                  <Text style={styles.label}>Due Date (YYYY-MM-DD)</Text>
                  <TextInput
                    style={styles.input}
                    value={chargeForm.due_date}
                    onChangeText={(v) => setChargeForm((p) => ({ ...p, due_date: v }))}
                    placeholder="2026-12-31"
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>
              </View>

              <TouchableOpacity style={styles.primaryBtn} onPress={handlePostCharge} disabled={busy}>
                {busy ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.primaryBtnText}>Create Finance Record</Text>}
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Itemized Records */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Itemized Ledger ({financeRecords.length})</Text>
            {financeRecords.length === 0 ? (
              <Text style={styles.metaText}>
                {loading ? 'Loading finance records…' : 'No finance records found.'}
              </Text>
            ) : (
              financeRecords.map((rec) => {
                const balance = Math.max(
                  0,
                  Number(rec.amount_due || 0) + Number(rec.fine_amount || 0) - Number(rec.amount_paid || 0)
                );
                const isPayOpen = payDrawerId === rec.id;

                return (
                  <View key={rec.id} style={styles.rowItem}>
                    <View style={styles.cardHeaderRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.roleTitle}>{rec.fee_type}</Text>
                        <Text style={styles.metaText}>
                          {rec.student_name ? `${rec.student_name} · ` : ''}
                          {rec.usn} · {rec.department || '—'} {rec.semester ? `Sem ${rec.semester}` : ''}
                        </Text>
                      </View>
                      <StatusPill status={rec.status} />
                    </View>

                    <View style={styles.ledgerNumbers}>
                      <Text style={styles.metaText}>Due: {formatCurrency(rec.amount_due)}</Text>
                      <Text style={styles.metaText}>Fine: {formatCurrency(rec.fine_amount)}</Text>
                      <Text style={[styles.metaText, { color: Colors.statusEmerald, fontWeight: '700' }]}>
                        Paid: {formatCurrency(rec.amount_paid)}
                      </Text>
                      <Text style={[styles.metaText, { color: balance > 0 ? Colors.brandOrange : Colors.statusEmerald, fontWeight: '700' }]}>
                        Bal: {formatCurrency(balance)}
                      </Text>
                    </View>

                    {rec.due_date ? (
                      <Text style={styles.metaText}>Due Date: {String(rec.due_date).slice(0, 10)}</Text>
                    ) : null}

                    {canWriteFinance && rec.status !== 'PAID' ? (
                      <TouchableOpacity
                        style={styles.secondarySmallBtn}
                        onPress={() => {
                          if (isPayOpen) {
                            setPayDrawerId(null);
                          } else {
                            setPayDrawerId(rec.id);
                            setPayForm({ payment_amount: String(balance), fine_payment: '0' });
                          }
                        }}
                      >
                        <Text style={styles.secondarySmallText}>
                          {isPayOpen ? 'Close Payment' : 'Record Payment'}
                        </Text>
                      </TouchableOpacity>
                    ) : null}

                    {isPayOpen ? (
                      <View style={styles.payBox}>
                        <View style={styles.twoCol}>
                          <View style={styles.half}>
                            <Text style={styles.label}>Payment Amount (₹)</Text>
                            <TextInput
                              style={styles.input}
                              value={payForm.payment_amount}
                              onChangeText={(v) => setPayForm((p) => ({ ...p, payment_amount: v }))}
                              keyboardType="decimal-pad"
                            />
                          </View>
                          <View style={styles.half}>
                            <Text style={styles.label}>Fine Payment (₹)</Text>
                            <TextInput
                              style={styles.input}
                              value={payForm.fine_payment}
                              onChangeText={(v) => setPayForm((p) => ({ ...p, fine_payment: v }))}
                              keyboardType="decimal-pad"
                            />
                          </View>
                        </View>
                        <TouchableOpacity
                          style={styles.primaryBtn}
                          onPress={() => handlePayRecord(rec.id)}
                          disabled={busy}
                        >
                          <Text style={styles.primaryBtnText}>Confirm Payment</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
          </View>

          {/* 4-Pillar Examination Clearance Check */}
          {(roles.isStudent || canWriteFinance) ? (
            <View style={styles.card}>
              <View style={styles.rowCenter}>
                <ShieldCheck size={16} color={Colors.brandOrange} />
                <Text style={styles.cardTitle}>4-Pillar Exam Clearance</Text>
              </View>
              <View style={styles.searchRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={roles.isStudent ? (user?.username || '') : clearanceUsn}
                  onChangeText={(v) => setClearanceUsn(v.toUpperCase())}
                  editable={!roles.isStudent}
                  placeholder="Student USN"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="characters"
                />
                <TouchableOpacity style={styles.darkSmallBtn} onPress={handleLoadClearance} disabled={busy}>
                  <Text style={styles.darkSmallText}>Check</Text>
                </TouchableOpacity>
              </View>
              {clearance?.clearance ? (
                <View style={styles.clearanceBox}>
                  <Text style={styles.roleTitle}>
                    Hall Ticket Eligible:{' '}
                    {clearance.clearance.overallHallTicketEligible ? 'YES — APPROVED' : 'NO — BLOCKED'}
                  </Text>
                  <Text style={styles.metaText}>
                    Attendance: {clearance.clearance.attendancePercentage}% ({clearance.clearance.attendanceClear ? 'Clear' : 'Short'})
                  </Text>
                  <Text style={styles.metaText}>
                    CIE Avg: {clearance.clearance.avgCieMarks} ({clearance.clearance.cieClear ? 'Clear' : 'Short'})
                  </Text>
                  <Text style={styles.metaText}>
                    Finance Dues: {formatCurrency(clearance.clearance.outstandingDues)} ({clearance.clearance.financeClear ? 'Clear' : 'Pending'})
                  </Text>
                  <Text style={styles.metaText}>
                    Vault Docs: {clearance.clearance.unverifiedDocumentsCount} unverified ({clearance.clearance.documentsClear ? 'Clear' : 'Pending'})
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
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
  },
  subTabBtnActive: { backgroundColor: Colors.surfaceDark },
  subTabText: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  subTabTextActive: { color: Colors.textInverse },
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
  overline: { fontSize: 10, fontWeight: '800', color: Colors.brandOrange, letterSpacing: 0.5 },
  roleTitle: { fontSize: 13, fontWeight: '700', color: Colors.textBody },
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
  pillActionText: { fontSize: 12, fontWeight: '700', color: Colors.brandOrange },
  chipScroll: { gap: 8, paddingVertical: 4 },
  wrapChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 10, fontWeight: '800' },
  studentDriveFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  applyBtn: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: Colors.brandOrange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
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
  bentoValue: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary },
  rowItem: {
    borderTopWidth: 1,
    borderTopColor: Colors.hairlineBorder,
    paddingTop: 12,
    marginTop: 4,
    gap: 6,
  },
  ledgerNumbers: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
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
  secondarySmallText: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
  payBox: {
    backgroundColor: '#FBFBFC',
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  searchHit: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    backgroundColor: '#FBFBFC',
    padding: 10,
  },
  clearanceBox: {
    backgroundColor: '#FBFBFC',
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    borderRadius: 14,
    padding: 12,
    gap: 4,
  },
  metaText: { fontSize: 12, color: Colors.textMuted, lineHeight: 17 },
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
