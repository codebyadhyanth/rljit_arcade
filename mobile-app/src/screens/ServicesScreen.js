import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  Award,
  BarChart3,
  Bot,
  Briefcase,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  CreditCard,
  Database,
  FileText,
  FolderOpen,
  GraduationCap,
  Landmark,
  Layers,
  ShieldCheck,
  Users,
} from 'lucide-react-native';
import api from '../config/api';
import { useAuth } from '../context/AuthContext';
import Colors from '../theme/colors';
import ProvisionAuthorityTool from '../components/services/ProvisionAuthorityTool';
import StudentProvisioningTool from '../components/services/StudentProvisioningTool';
import DbLedgerTool from '../components/services/DbLedgerTool';
import DbDiagnosticsTool from '../components/services/DbDiagnosticsTool';
import {
  MobileVenueCatalog,
  MobileAcademicsTools,
  MobilePortalsTools,
  MobileDocsVault,
  MobileStudentAnalyzer,
  MobileChatbotPlaceholder,
} from '../components/services/MobileDomainTools';
import { getUserRoles } from '../components/services/constants';

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  keyboardType,
  readOnly = false,
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        editable={!readOnly}
        placeholder={placeholder || label}
        placeholderTextColor={Colors.textMuted}
        multiline={multiline}
        keyboardType={keyboardType}
        style={[
          styles.input,
          multiline && styles.multiline,
          readOnly && styles.readOnly,
        ]}
      />
    </View>
  );
}

function ActionButton({ title, onPress, secondary = false, disabled = false }) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.button,
        secondary && styles.secondaryButton,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.buttonText, secondary && styles.secondaryText]}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}

function ServiceCard({ icon: Icon, title, subtitle, badge, onPress }) {
  return (
    <TouchableOpacity
      style={styles.serviceCard}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.serviceIconBox}>
        <Icon size={18} color={Colors.brandOrange} />
      </View>
      <View style={styles.serviceInfo}>
        <View style={styles.serviceTopRow}>
          <Text style={styles.serviceTitle}>{title}</Text>
          {badge ? (
            <View style={styles.serviceBadge}>
              <Text style={styles.serviceBadgeText}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.serviceSub}>{subtitle}</Text>
      </View>
      <ChevronRight size={18} color={Colors.textMuted} />
    </TouchableOpacity>
  );
}

function Feedback({ error, result, busy }) {
  return (
    <>
      {busy ? <ActivityIndicator color={Colors.brandOrange} /> : null}
      {error ? (
        <View style={styles.error}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
      {result ? (
        <View style={styles.success}>
          <Text style={styles.successText}>{result}</Text>
        </View>
      ) : null}
    </>
  );
}

export default function ServicesScreen({ initialTool = null }) {
  const { user } = useAuth();
  const roles = getUserRoles(user);

  const [activeTool, setActiveTool] = useState(initialTool);
  const [profile, setProfile] = useState(null);
  const [mentees, setMentees] = useState([]);
  const [radar, setRadar] = useState([]);
  const [vaultDocs, setVaultDocs] = useState([]);
  const [form, setForm] = useState({});
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setActiveTool(initialTool || null);
  }, [initialTool]);

  useEffect(() => {
    api
      .get('/api/v1/profile/me')
      .then((r) => setProfile(r.data?.profile || null))
      .catch(() => {});
  }, []);

  const setField = (key, value) => setForm((old) => ({ ...old, [key]: value }));

  const request = useCallback(async (method, path, data, params, extraConfig = {}) => {
    setBusy(true);
    setError('');
    setResult('');
    try {
      const response = await api.request({ method, url: path, data, params, ...extraConfig });
      setResult(response.data?.message || 'Request completed.');
      return response.data;
    } catch (e) {
      setError(
        e?.response?.data?.message ||
          e?.response?.data?.error ||
          'The service request failed.'
      );
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const loadMentees = useCallback(async () => {
    const response = await request('get', '/api/v1/faculty/lg-mentees');
    if (response) setMentees(Array.isArray(response.mentees) ? response.mentees : []);
  }, [request]);

  const loadRadar = useCallback(async () => {
    const response = await request('get', '/api/v1/faculty/lg-radar');
    if (response) {
      setRadar(Array.isArray(response.atRiskMentees) ? response.atRiskMentees : []);
    }
  }, [request]);

  const openTool = (toolId) => {
    setError('');
    setResult('');
    setActiveTool(toolId);
  };

  const canViewFinance =
    roles.isStudent ||
    roles.isSuper ||
    roles.isHod ||
    roles.isFinance ||
    roles.isManagement ||
    roles.isPrincipal;

  const canProvisionStudents = roles.isHod || roles.isAdmission || roles.isSuper;
  const canUseAcademics =
    roles.isStudent ||
    roles.isFaculty ||
    roles.isHod ||
    roles.isSuper ||
    roles.isPrincipal ||
    roles.isManagement ||
    roles.isExam;
  const canUseStudentAnalyzer = roles.isSuper || roles.isHod || roles.isFaculty;

  if (activeTool) {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity
            style={styles.backBar}
            onPress={() => openTool(null)}
            activeOpacity={0.8}
          >
            <Text style={styles.backBarText}>← Back to Services</Text>
          </TouchableOpacity>

          {activeTool === 'venues' ? <MobileVenueCatalog /> : null}
          {activeTool === 'attendance' ? (
            <MobileAcademicsTools initialSection="attendance" profile={profile} />
          ) : null}
          {activeTool === 'cie' ? (
            <MobileAcademicsTools initialSection="cie" profile={profile} />
          ) : null}
          {activeTool === 'timetable' ? (
            <MobileAcademicsTools initialSection="timetable" profile={profile} />
          ) : null}
          {activeTool === 'placements' ? (
            <MobilePortalsTools initialSection="placements" />
          ) : null}
          {activeTool === 'finance' && canViewFinance ? (
            <MobilePortalsTools initialSection="finance" />
          ) : null}
          {activeTool === 'docs_vault' ? <MobileDocsVault /> : null}
          {activeTool === 'student_analyzer' ? <MobileStudentAnalyzer /> : null}
          {activeTool === 'ai_chatbot' ? <MobileChatbotPlaceholder /> : null}

          {activeTool === 'provision-authority' && roles.isSuper ? (
            <ProvisionAuthorityTool />
          ) : null}
          {activeTool === 'provision-student' && canProvisionStudents ? (
            <StudentProvisioningTool />
          ) : null}
          {activeTool === 'db-ledger' && roles.isSuper ? <DbLedgerTool /> : null}
          {activeTool === 'db-diagnostics' && roles.isSuper ? (
            <DbDiagnosticsTool />
          ) : null}

          {activeTool === 'leave' && roles.isStudent ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Submit Leave Request</Text>
              <Text style={styles.body}>
                Sent directly to your assigned Local Guardian (LG) faculty mentor.
              </Text>
              <Field
                label="From Date (YYYY-MM-DD)"
                value={form.fromDate || ''}
                onChangeText={(v) => setField('fromDate', v)}
              />
              <Field
                label="To Date (YYYY-MM-DD)"
                value={form.toDate || ''}
                onChangeText={(v) => setField('toDate', v)}
              />
              <Field
                label="Reason"
                value={form.reason || ''}
                onChangeText={(v) => setField('reason', v)}
                multiline
              />
              <ActionButton
                title="Submit Leave Request"
                disabled={busy || !form.fromDate || !form.toDate || !form.reason}
                onPress={() =>
                  request('post', '/api/v1/student/leave-request', {
                    fromDate: form.fromDate,
                    toDate: form.toDate,
                    reason: form.reason,
                  })
                }
              />
              <Feedback error={error} result={result} busy={busy} />
            </View>
          ) : null}

          {activeTool === 'lg-mentees' && (roles.isFaculty || roles.isHod || roles.isSuper) ? (
            <View style={styles.sectionGap}>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>LG Mentees & At-Risk Radar</Text>
                <View style={styles.twoCol}>
                  <ActionButton title="Load Mentees" onPress={loadMentees} />
                  <ActionButton title="Load Risk Radar" secondary onPress={loadRadar} />
                </View>
                {mentees.length > 0 ? (
                  mentees.map((m, i) => (
                    <View key={m.usn || i} style={styles.row}>
                      <Text style={styles.rowTitle}>
                        {m.fullName || m.usn} ({m.usn})
                      </Text>
                      <Text style={styles.body}>
                        {[
                          m.department,
                          m.semester && `Sem ${m.semester}`,
                          `Att: ${m.attendancePercentage ?? 0}%`,
                          `Dues: ₹${m.pendingFeeDues ?? 0}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.empty}>Tap Load Mentees to inspect assigned students.</Text>
                )}

                {radar.length > 0 ? (
                  <View style={styles.radarBox}>
                    <Text style={styles.rowTitle}>At-Risk Students ({radar.length})</Text>
                    {radar.map((m, i) => (
                      <View key={m.usn || i} style={styles.row}>
                        <Text style={styles.rowTitle}>
                          {m.fullName || m.usn} · {m.usn}
                        </Text>
                        <Text style={styles.body}>
                          {(m.riskTriggers || []).join(' · ')}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Review Mentee Leave Request</Text>
                <Field
                  label="Leave Request ID (UUID)"
                  value={form.leaveId || ''}
                  onChangeText={(v) => setField('leaveId', v)}
                />
                <View style={styles.twoCol}>
                  <ActionButton
                    title="Approve Leave"
                    disabled={busy || !form.leaveId}
                    onPress={() =>
                      request(
                        'patch',
                        `/api/v1/faculty/leave-approve/${encodeURIComponent(form.leaveId)}`,
                        { decision: 'APPROVED' }
                      )
                    }
                  />
                  <ActionButton
                    title="Reject Leave"
                    secondary
                    disabled={busy || !form.leaveId}
                    onPress={() =>
                      request(
                        'patch',
                        `/api/v1/faculty/leave-approve/${encodeURIComponent(form.leaveId)}`,
                        { decision: 'REJECTED' }
                      )
                    }
                  />
                </View>
              </View>
              <Feedback error={error} result={result} busy={busy} />
            </View>
          ) : null}

          {activeTool === 'lg-admin' && (roles.isHod || roles.isSuper) ? (
            <View style={styles.sectionGap}>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Assign Local Guardian Mapping</Text>
                <Field
                  label="Faculty User ID (UUID)"
                  value={form.lgFacultyId || ''}
                  onChangeText={(v) => setField('lgFacultyId', v)}
                />
                <Field
                  label="Student USNs (comma separated)"
                  value={form.studentUsns || ''}
                  onChangeText={(v) => setField('studentUsns', v)}
                />
                <Field
                  label="Department"
                  value={form.department ?? profile?.department ?? ''}
                  onChangeText={(v) => setField('department', v.toUpperCase())}
                />
                <ActionButton
                  title="Save Mentorship Mapping"
                  disabled={
                    busy ||
                    !form.lgFacultyId ||
                    !form.studentUsns ||
                    !(form.department || profile?.department)
                  }
                  onPress={() =>
                    request('post', '/api/v1/hod/lg-mapping/assign', {
                      lgFacultyId: form.lgFacultyId,
                      studentUsns: form.studentUsns
                        .split(',')
                        .map((v) => v.trim())
                        .filter(Boolean),
                      department: form.department || profile?.department,
                    })
                  }
                />
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Assign Faculty Sub-Roles</Text>
                <Field
                  label="Target User ID (UUID)"
                  value={form.targetUserId || ''}
                  onChangeText={(v) => setField('targetUserId', v)}
                />
                <Field
                  label="Sub-Roles (comma separated)"
                  value={form.subRoles || ''}
                  onChangeText={(v) => setField('subRoles', v)}
                  placeholder="CR, LG_COORDINATOR, CLUB_COORDINATOR, CIE_COORDINATOR"
                />
                <ActionButton
                  title="Update Sub-Roles"
                  disabled={busy || !form.targetUserId || !form.subRoles}
                  onPress={() =>
                    request('patch', '/api/v1/hod/assign-subroles', {
                      targetUserId: form.targetUserId,
                      subRoles: form.subRoles
                        .split(',')
                        .map((v) => v.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </View>
              <Feedback error={error} result={result} busy={busy} />
            </View>
          ) : null}

          {activeTool === 'vault' && (roles.isStudent || roles.isAdmission || roles.isSuper) ? (
            <View style={styles.sectionGap}>
              {roles.isAdmission || roles.isSuper ? (
                <>
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Upload Document to Vault</Text>
                    <Field
                      label="Student USN"
                      value={form.uploadUsn || ''}
                      onChangeText={(v) => setField('uploadUsn', v.toUpperCase())}
                    />
                    <Field
                      label="Document Type"
                      value={form.docType || ''}
                      onChangeText={(v) => setField('docType', v.toUpperCase())}
                      placeholder="10TH_MARKS_CARD, 12TH_MARKS_CARD, TRANSFER_CERTIFICATE"
                    />
                    <ActionButton
                      title={
                        form.documentAsset ? 'Choose Different Image' : 'Choose Document Image'
                      }
                      secondary
                      onPress={async () => {
                        const picked = await ImagePicker.launchImageLibraryAsync({
                          mediaTypes: ['images'],
                          quality: 1,
                        });
                        if (!picked.canceled && picked.assets?.[0]) {
                          setField('documentAsset', picked.assets[0]);
                        }
                      }}
                    />
                    <Text style={styles.body}>
                      {form.documentAsset?.fileName ||
                        form.documentAsset?.uri ||
                        'No image selected'}
                    </Text>
                    <ActionButton
                      title="Upload Document"
                      disabled={
                        busy ||
                        !form.uploadUsn ||
                        !form.docType ||
                        !form.documentAsset?.uri
                      }
                      onPress={async () => {
                        const asset = form.documentAsset;
                        const body = new FormData();
                        body.append('studentUsn', form.uploadUsn);
                        body.append('docType', form.docType);
                        body.append('document', {
                          uri: asset.uri,
                          name: asset.fileName || 'student-document.jpg',
                          type: asset.mimeType || 'image/jpeg',
                        });
                        await request(
                          'post',
                          '/api/v1/admissions/documents/upload',
                          body,
                          null,
                          { headers: { 'Content-Type': 'multipart/form-data' } }
                        );
                      }}
                    />
                  </View>

                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Verify & Update Custody</Text>
                    <Field
                      label="Document ID (UUID)"
                      value={form.docId || ''}
                      onChangeText={(v) => setField('docId', v)}
                    />
                    <Field
                      label="Verification Status"
                      value={form.verificationStatus || ''}
                      onChangeText={(v) => setField('verificationStatus', v.toUpperCase())}
                      placeholder="VERIFIED / REJECTED / PENDING_REVIEW"
                    />
                    <Field
                      label="Custody Status"
                      value={form.custodyStatus || ''}
                      onChangeText={(v) => setField('custodyStatus', v.toUpperCase())}
                      placeholder="SUBMITTED_TO_ADMISSION_DEPT / RETURNED_TO_STUDENT"
                    />
                    <ActionButton
                      title="Update Verification"
                      disabled={busy || !form.docId || !form.verificationStatus}
                      onPress={() =>
                        request(
                          'patch',
                          `/api/v1/admissions/documents/${encodeURIComponent(form.docId)}/verify`,
                          {
                            verificationStatus: form.verificationStatus,
                            custodyStatus: form.custodyStatus || undefined,
                          }
                        )
                      }
                    />
                  </View>
                </>
              ) : null}

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Student Document Vault</Text>
                <Field
                  label="Student USN"
                  value={
                    roles.isStudent
                      ? profile?.studentDetails?.usn || user?.username || ''
                      : form.vaultUsn || ''
                  }
                  onChangeText={(v) => setField('vaultUsn', v.toUpperCase())}
                  readOnly={roles.isStudent}
                />
                <ActionButton
                  title="Load Vault Documents"
                  onPress={async () => {
                    const targetUsn = roles.isStudent
                      ? profile?.studentDetails?.usn || user?.username || ''
                      : form.vaultUsn || '';
                    if (!targetUsn) return;
                    const r = await request(
                      'get',
                      `/api/v1/admissions/vault/${encodeURIComponent(targetUsn)}`
                    );
                    if (r) setVaultDocs(Array.isArray(r.documents) ? r.documents : []);
                  }}
                />
                {vaultDocs.length > 0 ? (
                  vaultDocs.map((d, i) => (
                    <View key={d.id || i} style={styles.row}>
                      <Text style={styles.rowTitle}>{d.doc_type}</Text>
                      <Text style={styles.body}>
                        Verification: {d.verification_status} · Custody: {d.custody_status}
                      </Text>
                      <Text style={styles.empty}>ID: {d.id}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.empty}>No vault documents loaded.</Text>
                )}
              </View>
              <Feedback error={error} result={result} busy={busy} />
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.flex}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text style={styles.overline}>
            {profile?.adminTier || profile?.baseRole || user?.baseRole || 'ACCOUNT'} · SERVICES HUB
          </Text>
          <Text style={styles.heroTitle}>Campus Services</Text>
          <Text style={styles.heroSub}>
            All role-authorized institutional workflows backed by live PostgreSQL endpoints.
          </Text>
        </View>

        {/* Category 1: Spaces & Venues */}
        <Text style={styles.catLabel}>Spaces & Bookings</Text>
        <ServiceCard
          icon={Landmark}
          title="Venues Catalog & Approvals"
          subtitle="Hourly 09:00–17:00 availability, bookings, timelines, and multi-stage approvals"
          badge={
            roles.isSuper || roles.isHod || roles.isManagement || roles.isPrincipal
              ? 'Approval Queue'
              : 'Book'
          }
          onPress={() => openTool('venues')}
        />

        {/* Category 2: Academics */}
        {canUseAcademics ? (
          <>
            <Text style={styles.catLabel}>Academics & Schedules</Text>
            <ServiceCard
              icon={CalendarDays}
              title="Timetable & Class Swaps"
              subtitle="Weekly class schedule, HOD/Admin slot setup, and faculty swap handovers"
              onPress={() => openTool('timetable')}
            />
            <ServiceCard
              icon={ClipboardCheck}
              title="Manual Attendance"
              subtitle={
                roles.isStudent
                  ? 'Subject-wise attendance percentage and session logs'
                  : 'Section roster attendance marking (Phase 3 camera scanner coming soon)'
              }
              onPress={() => openTool('attendance')}
            />
            <ServiceCard
              icon={Award}
              title="CIE Marks & Scorecards"
              subtitle={
                roles.isStudent
                  ? 'CIE 1/2/3, assignment scores, and semester averages'
                  : 'Enter CIE 1/2/3 & assignment marks with live total calculation'
              }
              onPress={() => openTool('cie')}
            />
          </>
        ) : null}

        {/* Category 3: Portals & Student Lifecycle */}
        <Text style={styles.catLabel}>Portals & Student Records</Text>
        <ServiceCard
          icon={Briefcase}
          title="Placement Drives"
          subtitle={
            roles.isStudent
              ? 'Check CGPA & branch eligibility and apply in 1 tap'
              : roles.isPlacement || roles.isSuper
              ? 'Publish campus placement drives and monitor applicants'
              : 'Inspect active and upcoming campus recruitment drives'
          }
          badge={roles.isPlacement || roles.isSuper ? 'PLC' : null}
          onPress={() => openTool('placements')}
        />

        {canViewFinance ? (
          <ServiceCard
            icon={CreditCard}
            title="Finance Ledger & Clearance"
            subtitle={
              roles.isFinance || roles.isSuper
                ? 'Summary totals, post charges, record payments, and 4-pillar clearance'
                : 'Itemized fee dues, payments, and examination hall-ticket clearance'
            }
            badge={roles.isFinance || roles.isSuper ? 'ACC' : null}
            onPress={() => openTool('finance')}
          />
        ) : null}

        {roles.isStudent ? (
          <ServiceCard
            icon={FileText}
            title="Leave Request"
            subtitle="Submit leave applications directly to your Local Guardian mentor"
            onPress={() => openTool('leave')}
          />
        ) : null}

        {roles.isFaculty || roles.isHod || roles.isSuper ? (
          <ServiceCard
            icon={Users}
            title="Leave & Mentorship"
            subtitle="LG mentee roster, early-warning risk radar, and leave approvals"
            onPress={() => openTool('lg-mentees')}
          />
        ) : null}

        {roles.isStudent || roles.isAdmission || roles.isSuper ? (
          <ServiceCard
            icon={ShieldCheck}
            title="Document Vault"
            subtitle={
              roles.isAdmission || roles.isSuper
                ? 'Upload, verify, and track physical custody of certificates'
                : 'View your submitted admission certificates and verification status'
            }
            onPress={() => openTool('vault')}
          />
        ) : null}

        {/* Category 3.5: Knowledge, Analytics & AI Assistant */}
        <Text style={styles.catLabel}>Knowledge & Intelligence</Text>
        <ServiceCard
          icon={FolderOpen}
          title="Docs & Notes"
          subtitle="Institutional circulars, lecture notes, college info, and authenticated previews"
          badge="VAULT"
          onPress={() => openTool('docs_vault')}
        />
        {canUseStudentAnalyzer ? (
          <ServiceCard
            icon={BarChart3}
            title="Student Analyzer"
            subtitle="Cohort risk tiers, 4-factor diagnostic scores, weak subjects, and improvement steps"
            badge="ANALYZER"
            onPress={() => openTool('student_analyzer')}
          />
        ) : null}
        <ServiceCard
          icon={Bot}
          title="AI Chatbot"
          subtitle="RLJIT Arcade AI Assistant (Upcoming Phase)"
          badge="UPCOMING"
          onPress={() => openTool('ai_chatbot')}
        />

        {/* Category 4: Administration & PostgreSQL Diagnostics */}
        {canProvisionStudents || roles.isSuper || roles.isHod ? (
          <>
            <Text style={styles.catLabel}>Administration & PostgreSQL</Text>
            {roles.isSuper ? (
              <ServiceCard
                icon={Layers}
                title="Provision Authority"
                subtitle="Create Section Admins (7 codes), HODs, and Faculty (11 depts)"
                badge="SUPER"
                onPress={() => openTool('provision-authority')}
              />
            ) : null}
            {canProvisionStudents ? (
              <ServiceCard
                icon={GraduationCap}
                title="Enroll Student (VTU USN)"
                subtitle="Provision students across all 11 depts with core branch & academic year"
                onPress={() => openTool('provision-student')}
              />
            ) : null}
            {roles.isHod || roles.isSuper ? (
              <ServiceCard
                icon={Users}
                title="LG Mapping & Sub-Roles"
                subtitle="Assign Local Guardian mentors and institutional sub-roles"
                onPress={() => openTool('lg-admin')}
              />
            ) : null}
            {roles.isSuper ? (
              <>
                <ServiceCard
                  icon={Database}
                  title="Cryptographic DB Ledger"
                  subtitle="Inspect liveTableCounts, xmin/ctid tuples, and Argon2id proofs"
                  onPress={() => openTool('db-ledger')}
                />
                <ServiceCard
                  icon={Database}
                  title="Database Diagnostics"
                  subtitle="Verify PostgreSQL schema definitions and initialize core tables"
                  onPress={() => openTool('db-diagnostics')}
                />
              </>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.canvasBg },
  content: {
    padding: 16,
    paddingBottom: 36,
    gap: 12,
    backgroundColor: Colors.canvasBg,
  },
  sectionGap: { gap: 12 },
  hero: {
    backgroundColor: Colors.surfaceDark,
    borderRadius: 20,
    padding: 18,
    gap: 6,
  },
  overline: {
    color: '#FDBA74',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  heroTitle: { color: Colors.textInverse, fontSize: 22, fontWeight: '800' },
  heroSub: { color: '#E4E4E7', fontSize: 12, lineHeight: 18 },
  catLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginTop: 6,
    marginLeft: 2,
  },
  serviceCard: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    padding: 14,
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  serviceIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.brandOrangeLight,
    borderWidth: 1,
    borderColor: '#FED7AA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceInfo: { flex: 1, gap: 3 },
  serviceTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  serviceTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  serviceBadge: {
    backgroundColor: Colors.surfaceDark,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  serviceBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.textInverse,
  },
  serviceSub: {
    fontSize: 11,
    color: Colors.textMuted,
    lineHeight: 16,
  },
  backBar: {
    minHeight: 48,
    backgroundColor: Colors.surfaceCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backBarText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.brandOrange,
  },
  card: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    padding: 16,
    gap: 10,
  },
  cardTitle: { color: Colors.textPrimary, fontSize: 15, fontWeight: '800' },
  field: { marginBottom: 4 },
  label: { color: Colors.textMuted, fontSize: 11, fontWeight: '700', marginBottom: 5 },
  input: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    color: Colors.textPrimary,
    fontSize: 14,
  },
  multiline: { minHeight: 84, paddingTop: 12, textAlignVertical: 'top' },
  readOnly: { backgroundColor: Colors.canvasBg, color: Colors.textMuted },
  twoCol: { flexDirection: 'row', gap: 10 },
  button: {
    flex: 1,
    minHeight: 48,
    backgroundColor: Colors.surfaceDark,
    borderRadius: 14,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  secondaryButton: {
    backgroundColor: Colors.brandOrangeLight,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  secondaryText: { color: Colors.brandOrange },
  disabled: { opacity: 0.45 },
  row: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.divider,
    paddingTop: 10,
    gap: 4,
  },
  rowTitle: { color: Colors.textPrimary, fontSize: 13, fontWeight: '800' },
  radarBox: {
    backgroundColor: Colors.statusAmberBg,
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  body: { color: Colors.textBody, fontSize: 12, lineHeight: 18 },
  empty: { color: Colors.textMuted, fontSize: 12 },
  error: {
    backgroundColor: Colors.statusRoseBg,
    borderColor: '#FECACA',
    borderWidth: 1,
    padding: 12,
    borderRadius: 12,
  },
  errorText: { color: Colors.statusRose, fontSize: 12, fontWeight: '600' },
  success: {
    backgroundColor: Colors.statusEmeraldBg,
    borderColor: '#A7F3D0',
    borderWidth: 1,
    padding: 12,
    borderRadius: 12,
  },
  successText: { color: Colors.statusEmerald, fontSize: 12, fontWeight: '700' },
});
