import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import api from '../config/api';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../context/AuthContext';
import Colors from '../theme/colors';
import ProvisionAuthorityTool from '../components/services/ProvisionAuthorityTool';
import StudentProvisioningTool from '../components/services/StudentProvisioningTool';
import DbLedgerTool from '../components/services/DbLedgerTool';
import DbDiagnosticsTool from '../components/services/DbDiagnosticsTool';

const valueText = (v) => v === null || v === undefined || v === '' ? '—' : String(v);
const record = (v) => v && typeof v === 'object' ? v : {};
function Field({ label, value, onChangeText, placeholder, multiline = false, keyboardType, readOnly = false }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} editable={!readOnly} placeholder={placeholder || label} placeholderTextColor={Colors.textMuted} multiline={multiline} keyboardType={keyboardType} style={[styles.input, multiline && styles.multiline, readOnly && styles.readOnly]} /></View>;
}
function Button({ title, onPress, secondary = false, disabled = false }) {
  return <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, secondary && styles.secondaryButton, disabled && styles.disabled]}><Text style={[styles.buttonText, secondary && styles.secondaryText]}>{title}</Text></TouchableOpacity>;
}
function Section({ title, children }) { return <View style={styles.card}><Text style={styles.cardTitle}>{title}</Text>{children}</View>; }
function Panel({ tool, onBack }) {
  if (tool === 'provision-authority') return <ProvisionAuthorityTool onBack={onBack} />;
  if (tool === 'provision-student') return <StudentProvisioningTool onBack={onBack} />;
  if (tool === 'db-ledger') return <DbLedgerTool onBack={onBack} />;
  if (tool === 'db-diagnostics') return <DbDiagnosticsTool onBack={onBack} />;
  return null;
}

export default function ServicesScreen({ initialTool = null }) {
  const { user } = useAuth();
  const [activeTool, setActiveTool] = useState(initialTool);
  const [profile, setProfile] = useState(null);
  const [venues, setVenues] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [bookingDetail, setBookingDetail] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [mentees, setMentees] = useState([]);
  const [radar, setRadar] = useState([]);
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState({});
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const isSuper = user?.adminTier === 'SUPER_ADMIN';
  const isHod = user?.adminTier === 'HOD_ADMIN' || (Array.isArray(user?.subRoles) && user.subRoles.includes('HOD'));
  const isStudent = user?.baseRole === 'STUDENT';
  const isFaculty = user?.baseRole === 'FACULTY';
  const isAdmission = user?.baseRole === 'ADMIN' && user?.sectionCode === 'ADM';
  const isFinance = user?.baseRole === 'ADMIN' && user?.sectionCode === 'ACC';
  const isPrincipal = isSuper || user?.subRoles?.includes('PRINCIPAL') || user?.sectionCode === 'PRN';
  const canProvision = isHod || isAdmission;

  const request = useCallback(async (method, path, data, params) => {
    setBusy(true); setError(''); setResult('');
    try {
      const response = await api.request({ method, url: path, data, params });
      setResult(response.data?.message || (typeof response.data?.is_available === 'boolean' ? (response.data.is_available ? 'The venue is available for this time window.' : 'The venue is not available for this time window.') : 'Request completed.'));
      return response.data;
    } catch (e) {
      const message = e?.response?.data?.message || e?.response?.data?.error || 'The service request failed.';
      setError(message);
      return null;
    } finally { setBusy(false); }
  }, []);

  const loadVenues = useCallback(async () => {
    const response = await request('get', '/api/v1/venues');
    if (response) setVenues(Array.isArray(response.venues) ? response.venues : []);
  }, [request]);
  const loadBookings = useCallback(async () => {
    const response = await request('get', '/api/v1/venues/bookings');
    if (response) setBookings(Array.isArray(response.bookings) ? response.bookings : []);
  }, [request]);
  const loadMentees = useCallback(async () => {
    const response = await request('get', '/api/v1/faculty/lg-mentees');
    if (response) setMentees(Array.isArray(response.mentees) ? response.mentees : []);
  }, [request]);
  const loadRadar = useCallback(async () => {
    const response = await request('get', '/api/v1/faculty/lg-radar');
    if (response) setRadar(Array.isArray(response.atRiskMentees) ? response.atRiskMentees : []);
  }, [request]);
  const load = useCallback(async () => {
    setError('');
    try {
      const r = await api.get('/api/v1/profile/me'); setProfile(r.data?.profile || null);
    } catch (e) { setError(e?.response?.data?.error || 'Could not load the current profile.'); }
    if (isStudent || isFaculty || isHod || isSuper || isPrincipal) {
      const r = await api.get('/api/v1/venues').catch(() => null); setVenues(Array.isArray(r?.data?.venues) ? r.data.venues : []);
      const b = await api.get('/api/v1/venues/bookings').catch(() => null); setBookings(Array.isArray(b?.data?.bookings) ? b.data.bookings : []);
    }
  }, [isStudent, isFaculty, isHod, isSuper, isPrincipal]);
  useEffect(() => { load(); }, [load]);
  const set = (key, value) => setForm((old) => ({ ...old, [key]: value }));
  const run = async (method, path, payload) => { const r = await request(method, path, payload); if (r) { await loadBookings(); } };

  if (['provision-authority', 'provision-student', 'db-ledger', 'db-diagnostics'].includes(activeTool)) return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><Button title="Back to services" secondary onPress={() => setActiveTool(null)} /><Panel tool={activeTool} onBack={() => setActiveTool(null)} /></ScrollView></KeyboardAvoidingView>;

  if (activeTool === 'leave') return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><Button title="Back to services" secondary onPress={() => setActiveTool(null)} /><Section title="Student leave request"><Field label="From date (YYYY-MM-DD)" value={form.fromDate || ''} onChangeText={(v) => set('fromDate', v)} /><Field label="To date (YYYY-MM-DD)" value={form.toDate || ''} onChangeText={(v) => set('toDate', v)} /><Field label="Reason" value={form.reason || ''} onChangeText={(v) => set('reason', v)} multiline /><Button title="Submit request" disabled={busy || !form.fromDate || !form.toDate || !form.reason} onPress={() => run('post', '/api/v1/student/leave-request', { fromDate: form.fromDate, toDate: form.toDate, reason: form.reason })} /></Section><Feedback error={error} result={result} busy={busy} /></ScrollView></KeyboardAvoidingView>;
  if (activeTool === 'finance') return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><Button title="Back to services" secondary onPress={() => setActiveTool(null)} /><Section title="Student financial records"><Field label="Student USN" value={isStudent ? (profile?.studentDetails?.usn || user?.username || '') : (form.usn || '')} onChangeText={(v) => set('usn', v)} readOnly={isStudent} /><Button title="Load ledger" onPress={async () => { const r = await request('get', '/api/v1/finance/ledger/' + encodeURIComponent(isStudent ? (profile?.studentDetails?.usn || user?.username || '') : (form.usn || ''))); setRecords(Array.isArray(r?.ledgerItems) ? r.ledgerItems : []); }} /><Button title="Load examination clearance" secondary onPress={async () => { const usn = isStudent ? (profile?.studentDetails?.usn || user?.username) : form.usn; if (!usn) return; const r = await request('get', '/api/v1/student/clearance-status/' + encodeURIComponent(usn)); setRecords(r ? [record(r.clearance || r.status || r)] : []); }} />{records.length ? records.map((row, i) => <Text key={i} style={styles.body}>{JSON.stringify(row)}</Text>) : <Text style={styles.empty}>No ledger or clearance data is loaded.</Text>}</Section><Feedback error={error} result={result} busy={busy} /></ScrollView></KeyboardAvoidingView>;
  if (activeTool === 'lg-mentees') return <ScrollView contentContainerStyle={styles.content}><Button title="Back to services" secondary onPress={() => setActiveTool(null)} /><Section title="Assigned mentees"><Button title="Load mentees" onPress={loadMentees} />{mentees.length ? mentees.map((m, i) => <Text key={m.usn || i} style={styles.body}>{[m.name || m.fullName, m.usn, m.department, m.semester && 'Sem ' + m.semester].filter(Boolean).join(' · ')}</Text>) : <Text style={styles.empty}>No mentees loaded.</Text>}</Section><Section title="At-risk review"><Button title="Load at-risk radar" onPress={loadRadar} />{radar.length ? radar.map((m, i) => <Text key={m.usn || i} style={styles.body}>{[m.name || m.fullName, m.usn, m.reason, m.attendancePercentage && m.attendancePercentage + '% attendance'].filter(Boolean).join(' · ')}</Text>) : <Text style={styles.empty}>No radar rows loaded.</Text>}</Section><Feedback error={error} result={result} busy={busy} /></ScrollView>;

  if (activeTool === 'lg-admin') return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><Button title="Back to services" secondary onPress={() => setActiveTool(null)} /><Section title="Assign local guardian"><Field label="Faculty user ID" value={form.lgFacultyId || ''} onChangeText={(v) => set('lgFacultyId', v)} /><Field label="Student USNs (comma separated)" value={form.studentUsns || ''} onChangeText={(v) => set('studentUsns', v)} /><Field label="Department" value={form.department || profile?.department || ''} onChangeText={(v) => set('department', v)} /><Button title="Save mentorship mapping" disabled={busy || !form.lgFacultyId || !form.studentUsns || !(form.department || profile?.department)} onPress={() => run('post', '/api/v1/hod/lg-mapping/assign', { lgFacultyId: form.lgFacultyId, studentUsns: form.studentUsns.split(',').map((v) => v.trim()).filter(Boolean), department: form.department || profile?.department })} /></Section><Section title="Assign faculty sub-roles"><Field label="Target user ID" value={form.targetUserId || ''} onChangeText={(v) => set('targetUserId', v)} /><Field label="Sub-roles (comma separated)" value={form.subRoles || ''} onChangeText={(v) => set('subRoles', v)} placeholder="CR, LG_COORDINATOR, CLUB_COORDINATOR, CIE_COORDINATOR" /><Button title="Update sub-roles" disabled={busy || !form.targetUserId || !form.subRoles} onPress={() => run('patch', '/api/v1/hod/assign-subroles', { targetUserId: form.targetUserId, subRoles: form.subRoles.split(',').map((v) => v.trim()).filter(Boolean) })} /></Section><Feedback error={error} result={result} busy={busy} /></ScrollView></KeyboardAvoidingView>;
  if (activeTool === 'venue-admin') return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><Button title="Back to services" secondary onPress={() => setActiveTool(null)} /><Section title="Create campus venue"><Field label="Venue name" value={form.name || ''} onChangeText={(v) => set('name', v)} /><Field label="Type" value={form.type || ''} onChangeText={(v) => set('type', v)} /><Field label="Department" value={form.department || ''} onChangeText={(v) => set('department', v)} /><Field label="Location details" value={form.location_details || ''} onChangeText={(v) => set('location_details', v)} /><Field label="Capacity" value={form.capacity || ''} onChangeText={(v) => set('capacity', v)} keyboardType="number-pad" /><Button title="Create venue" disabled={busy || !form.name || !form.type || !form.capacity} onPress={async () => { const r = await request('post', '/api/v1/venues', { name: form.name, type: form.type, department: form.department || undefined, location_details: form.location_details || undefined, capacity: Number(form.capacity) }); if (r) await loadVenues(); }} /></Section><Feedback error={error} result={result} busy={busy} /></ScrollView></KeyboardAvoidingView>;
  if (activeTool === 'documents' && (isAdmission || isSuper)) return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><Button title="Back to services" secondary onPress={() => setActiveTool(null)} /><Section title="Upload a document">
  <Text style={styles.body}>Select an image file accepted by the document vault.</Text>
  <Field label="Student USN" value={form.uploadUsn || ''} onChangeText={(v) => set('uploadUsn', v)} />
  <Field label="Document type" value={form.docType || ''} onChangeText={(v) => set('docType', v)} placeholder="10TH_MARKS_CARD, 12TH_MARKS_CARD, TRANSFER_CERTIFICATE" />
  <Button title={form.documentAsset ? 'Choose a different image' : 'Choose document image'} secondary onPress={async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1 });
    if (!picked.canceled && picked.assets?.[0]) set('documentAsset', picked.assets[0]);
  }} />
  <Text style={styles.body}>{form.documentAsset?.fileName || form.documentAsset?.uri || 'No image selected'}</Text>
  <Button title="Upload document" disabled={busy || !form.uploadUsn || !form.docType || !form.documentAsset?.uri} onPress={async () => {
    const asset = form.documentAsset;
    const body = new FormData();
    body.append('studentUsn', form.uploadUsn);
    body.append('docType', form.docType);
    body.append('document', { uri: asset.uri, name: asset.fileName || 'student-document.jpg', type: asset.mimeType || 'image/jpeg' });
    await run('post', '/api/v1/admissions/documents/upload', body);
  }} />
</Section>
<Section title="Verify a vault document"><Field label="Document ID" value={form.docId || ''} onChangeText={(v) => set('docId', v)} /><Field label="Verification status" value={form.verificationStatus || ''} onChangeText={(v) => set('verificationStatus', v)} placeholder="VERIFIED / REJECTED / PENDING_REVIEW" /><Field label="Custody status" value={form.custodyStatus || ''} onChangeText={(v) => set('custodyStatus', v)} placeholder="WITH_STUDENT / SUBMITTED_TO_ADMISSION_DEPT / RETURNED_TO_STUDENT" /><Button title="Update verification" disabled={busy || !form.docId || !form.verificationStatus} onPress={() => run('patch', '/api/v1/admissions/documents/' + encodeURIComponent(form.docId) + '/verify', { verificationStatus: form.verificationStatus, custodyStatus: form.custodyStatus || undefined })} /></Section><Section title="Student vault lookup"><Field label="Student USN" value={isStudent ? (profile?.studentDetails?.usn || user?.username || '') : (form.usn || '')} onChangeText={(v) => set('usn', v)} readOnly={isStudent} /><Button title="Load vault" onPress={async () => { const r = await request('get', '/api/v1/admissions/vault/' + encodeURIComponent(isStudent ? (profile?.studentDetails?.usn || user?.username || '') : (form.usn || ''))); setRecords(Array.isArray(r?.documents) ? r.documents : []); }} />{records.length ? records.map((d, i) => <Text key={d.id || i} style={styles.body}>{[d.doc_type, d.verification_status, d.custody_status, d.id].filter(Boolean).join(' · ')}</Text>) : <Text style={styles.empty}>No vault documents are loaded.</Text>}</Section><Feedback error={error} result={result} busy={busy} /></ScrollView></KeyboardAvoidingView>;
  if (activeTool === 'vault' && (isStudent || isAdmission || isSuper)) return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><Button title="Back to services" secondary onPress={() => setActiveTool(null)} /><Section title="Student vault"><Field label="Student USN" value={isStudent ? (profile?.studentDetails?.usn || user?.username || '') : (form.usn || '')} onChangeText={(v) => set('usn', v)} readOnly={isStudent} /><Button title="Load vault" onPress={async () => { const r = await request('get', '/api/v1/admissions/vault/' + encodeURIComponent(isStudent ? (profile?.studentDetails?.usn || user?.username || '') : (form.usn || ''))); setRecords(Array.isArray(r?.documents) ? r.documents : []); }} />{records.length ? records.map((d, i) => <Text key={d.id || i} style={styles.body}>{[d.doc_type, d.verification_status, d.custody_status].filter(Boolean).join(' · ')}</Text>) : <Text style={styles.empty}>No vault documents are loaded.</Text>}</Section><Feedback error={error} result={result} busy={busy} /></ScrollView></KeyboardAvoidingView>;
  if (activeTool === 'finance-charge' || activeTool === 'finance-payment') return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><Button title="Back to services" secondary onPress={() => setActiveTool(null)} /><Section title={activeTool === 'finance-charge' ? 'Create ledger charge' : 'Record a ledger payment'}>{activeTool === 'finance-charge' ? <><Field label="Student USN" value={form.studentUsn || ''} onChangeText={(v) => set('studentUsn', v)} /><Field label="Category" value={form.category || ''} onChangeText={(v) => set('category', v)} /><Field label="Title" value={form.title || ''} onChangeText={(v) => set('title', v)} /><Field label="Total amount" value={form.totalAmount || ''} onChangeText={(v) => set('totalAmount', v)} keyboardType="decimal-pad" /><Field label="Due date (YYYY-MM-DD, optional)" value={form.dueDate || ''} onChangeText={(v) => set('dueDate', v)} /><Button title="Post charge" disabled={busy || !form.studentUsn || !form.category || !form.title || !form.totalAmount} onPress={() => run('post', '/api/v1/finance/ledger/charge', { studentUsn: form.studentUsn, category: form.category, title: form.title, totalAmount: Number(form.totalAmount), dueDate: form.dueDate || undefined })} /></> : <><Field label="Ledger ID" value={form.ledgerId || ''} onChangeText={(v) => set('ledgerId', v)} /><Field label="Amount paid" value={form.amountPaid || ''} onChangeText={(v) => set('amountPaid', v)} keyboardType="decimal-pad" /><Field label="Payment mode" value={form.paymentMode || ''} onChangeText={(v) => set('paymentMode', v)} /><Field label="Reference number" value={form.referenceNo || ''} onChangeText={(v) => set('referenceNo', v)} /><Button title="Record payment" disabled={busy || !form.ledgerId || !form.amountPaid} onPress={() => run('post', '/api/v1/finance/ledger/pay', { ledgerId: Number(form.ledgerId), amountPaid: Number(form.amountPaid), paymentMode: form.paymentMode || undefined, referenceNo: form.referenceNo || undefined })} /></>}</Section><Feedback error={error} result={result} busy={busy} /></ScrollView></KeyboardAvoidingView>;
  if (activeTool === 'academic') return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><Button title="Back to services" secondary onPress={() => setActiveTool(null)} /><Section title="Commit academic records"><Text style={styles.body}>Submit actual database student identifiers and captured record values. OCR draft extraction is omitted because the backend currently fabricates its draft values.</Text><Field label="Record type" value={form.recordType || 'ATTENDANCE'} onChangeText={(v) => set('recordType', v)} /><Field label="Department" value={form.department || profile?.department || ''} onChangeText={(v) => set('department', v)} /><Field label="Semester" value={form.semester || ''} onChangeText={(v) => set('semester', v)} keyboardType="number-pad" /><Field label="Section" value={form.section || ''} onChangeText={(v) => set('section', v)} /><Field label="Subject code" value={form.subjectCode || ''} onChangeText={(v) => set('subjectCode', v)} /><Field label="Session date (YYYY-MM-DD)" value={form.sessionDate || ''} onChangeText={(v) => set('sessionDate', v)} /><Field label="Period number" value={form.periodNo || ''} onChangeText={(v) => set('periodNo', v)} keyboardType="number-pad" /><Field label="Records JSON array" value={form.recordsJson || ''} onChangeText={(v) => set('recordsJson', v)} multiline placeholder={'[{"studentUsn":"…","attendanceStatus":"P"}]'} /><Button title="Commit records" disabled={busy || !form.department || !form.semester || !form.section || !form.subjectCode || !form.sessionDate || !form.periodNo || !form.recordsJson} onPress={async () => { try { const records = JSON.parse(form.recordsJson); if (!Array.isArray(records)) throw new Error('Records must be a JSON array.'); await run('post', '/api/v1/faculty/academic-record/commit', { batchId: form.batchId || undefined, recordType: form.recordType || 'ATTENDANCE', department: form.department, semester: Number(form.semester), section: form.section, subjectCode: form.subjectCode, sessionDate: form.sessionDate, periodNo: Number(form.periodNo), records }); } catch (e) { setError(e.message || 'Records JSON is invalid.'); } }} /></Section><Section title="Post-EOD record unlock request"><Field label="Academic record ID" value={form.academicRecordId || ''} onChangeText={(v) => set('academicRecordId', v)} /><Field label="Proposed value" value={form.proposedVal || ''} onChangeText={(v) => set('proposedVal', v)} /><Field label="Reason" value={form.unlockReason || ''} onChangeText={(v) => set('unlockReason', v)} multiline /><Button title="Request unlock" disabled={busy || !form.academicRecordId || !form.proposedVal || !form.unlockReason} onPress={() => run('post', '/api/v1/faculty/unlock-request', { academicRecordId: Number(form.academicRecordId), proposedVal: form.proposedVal, reason: form.unlockReason })} /></Section>{isFaculty ? <Section title="Edit an academic record during the EOD window"><Text style={styles.body}>The service returns a locked response if the record’s edit window expired.</Text><Field label="Academic record ID" value={form.eodRecordId || ''} onChangeText={(v) => set('eodRecordId', v)} keyboardType="number-pad" /><Field label="Attendance status (optional)" value={form.attendanceStatus || ''} onChangeText={(v) => set('attendanceStatus', v)} placeholder="P / A / OD_PRESENT" /><Field label="Marks obtained (optional)" value={form.marksObtained || ''} onChangeText={(v) => set('marksObtained', v)} keyboardType="decimal-pad" /><Button title="Update record" disabled={busy || !form.eodRecordId || (!form.attendanceStatus && !form.marksObtained)} onPress={() => run('patch', '/api/v1/faculty/academic-record/' + encodeURIComponent(form.eodRecordId) + '/eod-edit', { attendanceStatus: form.attendanceStatus || undefined, marksObtained: form.marksObtained ? Number(form.marksObtained) : undefined })} /></Section> : null}<Section title="Execute an approved unlocked edit"><Text style={styles.body}>Execution consumes the approved single-use override and writes an audit record.</Text><Field label="Approved unlock request ID" value={form.executeReqId || ''} onChangeText={(v) => set('executeReqId', v)} keyboardType="number-pad" /><Button title="Execute approved edit" disabled={busy || !form.executeReqId} onPress={() => run('patch', '/api/v1/faculty/academic-record/execute-unlocked/' + encodeURIComponent(form.executeReqId), {})} /></Section>{isHod || isPrincipal ? <Section title="Review a post-EOD unlock request"><Text style={styles.body}>The backend does not expose an unlock-request inbox. Enter a request ID from an authorized source.</Text><Field label="Unlock request ID" value={form.reqId || ''} onChangeText={(v) => set('reqId', v)} /><Field label="Decision" value={form.unlockDecision || ''} onChangeText={(v) => set('unlockDecision', v)} placeholder="APPROVED / REJECTED" /><Button title="Submit decision" disabled={busy || !form.reqId || !['APPROVED', 'REJECTED'].includes(form.unlockDecision)} onPress={() => run('patch', (isHod ? '/api/v1/hod/unlock-approve/' : '/api/v1/principal/unlock-approve/') + encodeURIComponent(form.reqId), { decision: form.unlockDecision })} /></Section> : null}<Feedback error={error} result={result} busy={busy} /></ScrollView></KeyboardAvoidingView>;
  if (activeTool === 'leave-review') return <ScrollView contentContainerStyle={styles.content}><Button title="Back to services" secondary onPress={() => setActiveTool(null)} /><Section title="Leave review"><Text style={styles.body}>The API supports reviewing a leave request by ID, but does not provide an inbox endpoint to discover pending request IDs.</Text><Field label="Leave request ID" value={form.leaveId || ''} onChangeText={(v) => set('leaveId', v)} /><Field label="Decision (APPROVED or REJECTED)" value={form.decision || ''} onChangeText={(v) => set('decision', v)} /><Button title="Submit review" disabled={busy || !form.leaveId || !['APPROVED', 'REJECTED'].includes(form.decision)} onPress={() => run('patch', '/api/v1/faculty/leave-approve/' + encodeURIComponent(form.leaveId), { decision: form.decision })} /></Section><Feedback error={error} result={result} busy={busy} /></ScrollView>;
  if (activeTool === 'venues') return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><Button title="Back to services" secondary onPress={() => setActiveTool(null)} /><Section title="Venue directory"><Button title="Refresh venues" onPress={loadVenues} />{venues.length ? venues.map((v) => <View key={v.id} style={styles.row}><Text style={styles.rowTitle}>{v.name}</Text><Text style={styles.body}>{[v.type, v.department, v.location_details, v.capacity && 'Capacity ' + v.capacity, 'ID ' + v.id].filter(Boolean).join(' · ')}</Text></View>) : <Text style={styles.empty}>No active venues were returned.</Text>}</Section>
    <Section title="Check availability and request a booking"><Field label="Venue ID" value={form.venue_id || ''} onChangeText={(v) => set('venue_id', v)} /><Field label="Faculty coordinator ID (students required)" value={form.coordinator_id || ''} onChangeText={(v) => set('coordinator_id', v)} /><Field label="Event title" value={form.event_title || ''} onChangeText={(v) => set('event_title', v)} /><Field label="Purpose" value={form.purpose || ''} onChangeText={(v) => set('purpose', v)} multiline /><Field label="Expected headcount" value={form.expected_headcount || ''} onChangeText={(v) => set('expected_headcount', v)} keyboardType="number-pad" /><Field label="Start time (ISO 8601)" value={form.event_start_time || ''} onChangeText={(v) => set('event_start_time', v)} placeholder="2026-11-25T09:30:00Z" /><Field label="End time (ISO 8601)" value={form.event_end_time || ''} onChangeText={(v) => set('event_end_time', v)} placeholder="2026-11-25T12:30:00Z" /><Field label="Department" value={form.department || profile?.department || ''} onChangeText={(v) => set('department', v)} /><Button title="Check availability" secondary disabled={busy || !form.venue_id || !form.event_start_time || !form.event_end_time} onPress={async () => { const r = await request('get', '/api/v1/venues/availability', null, { venue_id: form.venue_id, start_time: form.event_start_time, end_time: form.event_end_time }); setAvailability(r || null); }} />{availability ? <View style={styles.availability}><Text style={styles.body}>{availability.message || (availability.is_available ? "Venue is available." : "Venue is not available.")}</Text>{availability.current_booking ? <><Text style={styles.body}>Current event: {availability.current_booking.event_title || availability.current_booking.booking_code}</Text><Text style={styles.body}>Coordinator: {availability.current_booking.coordinator?.name || "Name unavailable"} · {availability.current_booking.coordinator?.email || "Email unavailable"} · {availability.current_booking.coordinator?.phone || "Phone unavailable"}</Text>{(isStudent || isFaculty) ? <><Field label="Transfer urgency reason" value={form.urgency_reason || ""} onChangeText={(v) => set("urgency_reason", v)} /><Field label="Proposed event title" value={form.new_event_title || ""} onChangeText={(v) => set("new_event_title", v)} /><Field label="Proposed purpose" value={form.new_purpose || ""} onChangeText={(v) => set("new_purpose", v)} multiline /><Field label="Faculty coordinator user ID" value={form.new_coordinator_id || ""} onChangeText={(v) => set("new_coordinator_id", v)} /><Button title="Request venue transfer" disabled={busy || !form.urgency_reason || !form.new_event_title || !form.new_purpose || !form.new_coordinator_id} onPress={() => run("post", "/api/v1/venues/bookings/" + availability.current_booking.booking_id + "/transfer-request", { urgency_reason: form.urgency_reason, new_event_title: form.new_event_title, new_purpose: form.new_purpose, new_coordinator_id: form.new_coordinator_id })} /></> : null}</> : null}</View> : null}<Button title="Submit booking" disabled={busy || !form.venue_id || !form.event_title || !form.purpose || !form.event_start_time || !form.event_end_time || (isStudent && !form.coordinator_id)} onPress={() => run('post', '/api/v1/venues/bookings', { venue_id: form.venue_id, coordinator_id: form.coordinator_id || undefined, event_title: form.event_title, purpose: form.purpose, expected_headcount: Number(form.expected_headcount), event_start_time: form.event_start_time, event_end_time: form.event_end_time, department: form.department || profile?.department })} /></Section>
    <Section title="My bookings and approval queue"><Button title="Refresh bookings" onPress={loadBookings} /><Field label="Review reason / terms message" value={form.reviewReason || ''} onChangeText={(v) => set('reviewReason', v)} /><Field label="Conditional terms (one per line)" value={form.reviewTerms || ''} onChangeText={(v) => set('reviewTerms', v)} multiline /><Field label="Coordinator message" value={form.coordinatorMessage || ''} onChangeText={(v) => set('coordinatorMessage', v)} /><Field label="New venue ID for venue change" value={form.newVenueId || ''} onChangeText={(v) => set('newVenueId', v)} /><Field label="Transfer request coordinator ID (student)" value={form.newCoordinatorId || ''} onChangeText={(v) => set('newCoordinatorId', v)} />{bookings.length ? bookings.map((b) => <View key={b.id} style={styles.row}><Text style={styles.rowTitle}>{b.booking_code || b.event_title}</Text><Text style={styles.body}>{[b.venue_name, b.status, b.event_start_time, b.coordinator_username].filter(Boolean).join(' · ')}</Text><Button title="Inspect audit timeline" secondary onPress={async () => { const detail = await request('get', '/api/v1/venues/bookings/' + b.id); setBookingDetail(detail?.booking || null); }} /><View style={styles.buttonWrap}>{isHod && b.status === 'PENDING_HOD' ? <><Button title="Approve" onPress={() => run('patch', '/api/v1/venues/bookings/' + b.id + '/hod-review', { action: 'APPROVE' })} /><Button title="Reject" secondary onPress={() => run('patch', '/api/v1/venues/bookings/' + b.id + '/hod-review', { action: 'REJECT', reason: form.reviewReason || 'Rejected by HOD' })} /><Button title="Partially accept" secondary onPress={() => run('patch', '/api/v1/venues/bookings/' + b.id + '/hod-review', { action: 'PARTIAL', reason: form.reviewReason, terms_and_conditions: (form.reviewTerms || '').split('\n').filter(Boolean) })} disabled={busy || !form.reviewReason || !form.reviewTerms} /></> : null}{isPrincipal && b.status === 'PENDING_PRINCIPAL' ? <><Button title="Approve final" onPress={() => run('patch', '/api/v1/venues/bookings/' + b.id + '/principal-review', { action: 'APPROVE' })} /><Button title="Reject" secondary onPress={() => run('patch', '/api/v1/venues/bookings/' + b.id + '/principal-review', { action: 'REJECT', reason: form.reviewReason || 'Rejected by principal' })} /><Button title="Partially accept" secondary onPress={() => run('patch', '/api/v1/venues/bookings/' + b.id + '/principal-review', { action: 'PARTIAL', reason: form.reviewReason, terms_and_conditions: (form.reviewTerms || '').split('\n').filter(Boolean) })} /></> : null}{isFaculty && b.coordinator_id === profile?.id && b.status === 'PARTIALLY_ACCEPTED' ? <><Button title="Agree to terms" onPress={() => run('patch', '/api/v1/venues/bookings/' + b.id + '/coordinator-response', { agree_to_terms: true, coordinator_message: form.coordinatorMessage || '' })} /><Button title="Submit counter-proposal" secondary onPress={() => run('patch', '/api/v1/venues/bookings/' + b.id + '/coordinator-response', { agree_to_terms: false, coordinator_message: form.coordinatorMessage || '' })} /></> : null}{isFaculty && b.coordinator_id === profile?.id && b.status === 'APPROVED' && form.newVenueId ? <Button title="Request venue change" secondary onPress={() => run('patch', '/api/v1/venues/bookings/' + b.id + '/change-venue', { new_venue_id: form.newVenueId })} /> : null}{(isStudent || isFaculty) && ['PENDING_HOD', 'PENDING_PRINCIPAL', 'APPROVED'].includes(b.status) && form.reviewReason && form.event_title && form.purpose && form.newCoordinatorId ? <Button title="Request booking transfer" secondary onPress={() => run('post', '/api/v1/venues/bookings/' + b.id + '/transfer-request', { urgency_reason: form.reviewReason || 'Urgent venue transfer requested', new_event_title: form.event_title, new_purpose: form.purpose, new_coordinator_id: form.newCoordinatorId })} /> : null}{(isSuper || b.initiator_id === profile?.id || b.coordinator_id === profile?.id) && !['CANCELLED', 'REJECTED'].includes(b.status) ? <Button title="Cancel booking" secondary onPress={() => Alert.alert('Cancel booking?', 'This activates a 24-hour venue cooldown.', [{ text: 'Keep', style: 'cancel' }, { text: 'Cancel booking', style: 'destructive', onPress: () => run('post', '/api/v1/venues/bookings/' + b.id + '/cancel', { cancellation_reason: 'Cancelled by user' }) }])} /> : null}</View></View>) : <Text style={styles.empty}>No bookings were returned for this account.</Text>}{bookingDetail ? <View style={styles.row}><Text style={styles.rowTitle}>Audit details · {bookingDetail.booking_code}</Text><Text style={styles.body}>{bookingDetail.status}</Text>{(bookingDetail.timeline_logs || []).map((log, i) => <Text key={log.id || i} style={styles.body}>{[log.action, log.previous_status, log.new_status, log.message, log.created_at].filter(Boolean).join(' · ')}</Text>)}{(bookingDetail.transfer_requests || []).map((transfer) => <View key={transfer.id} style={styles.buttonWrap}><Text style={styles.body}>Transfer · {transfer.status} · {transfer.id}</Text>{isFaculty && bookingDetail.coordinator?.id === profile?.id && transfer.status === 'PENDING_COORDINATOR' ? <><Button title="Approve transfer" onPress={() => run('patch', '/api/v1/venues/transfer-requests/' + transfer.id + '/respond', { action: 'APPROVE' })} /><Button title="Reject transfer" secondary onPress={() => run('patch', '/api/v1/venues/transfer-requests/' + transfer.id + '/respond', { action: 'REJECT', response_message: 'Rejected by coordinator' })} /></> : null}</View>)}</View> : null}</Section><Feedback error={error} result={result} busy={busy} /></ScrollView></KeyboardAvoidingView>;

  if (activeTool === 'timetable') return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><Button title="Back to services" secondary onPress={() => setActiveTool(null)} /><Section title="Daily timetable"><Field label="Department" value={form.department || profile?.studentDetails?.department || profile?.department || ''} onChangeText={(v) => set('department', v)} /><Field label="Semester" value={form.semester || profile?.studentDetails?.semester?.toString() || ''} onChangeText={(v) => set('semester', v)} keyboardType="number-pad" /><Field label="Section" value={form.section || profile?.studentDetails?.section || ''} onChangeText={(v) => set('section', v)} /><Button title="Load timetable" onPress={async () => { const r = await request('get', '/api/v1/timetable/daily-view', null, { dept: form.department || profile?.studentDetails?.department || profile?.department, sem: form.semester || profile?.studentDetails?.semester, sec: form.section || profile?.studentDetails?.section }); setRecords(Array.isArray(r?.schedule) ? r.schedule : []); }} />{records.length ? records.map((slot, i) => <Text key={slot.timetable_id || i} style={styles.body}>{[slot.period_no && 'Period ' + slot.period_no, slot.subject_code, slot.section, slot.room_no, slot.faculty_username].filter(Boolean).join(' · ')}</Text>) : <Text style={styles.empty}>No timetable slots loaded.</Text>}</Section>{isFaculty ? <Section title="Request a class swap"><Field label="Timetable slot ID" value={form.timetable_id || ''} onChangeText={(v) => set('timetable_id', v)} /><Field label="Target faculty ID" value={form.target_faculty_id || ''} onChangeText={(v) => set('target_faculty_id', v)} /><Field label="Swap date (YYYY-MM-DD)" value={form.swap_date || ''} onChangeText={(v) => set('swap_date', v)} /><Field label="Replacement subject (optional)" value={form.new_subject_code || ''} onChangeText={(v) => set('new_subject_code', v)} /><Button title="Create swap request" onPress={() => run('post', '/api/v1/timetable/swap-request', { timetable_id: Number(form.timetable_id), target_faculty_id: form.target_faculty_id, swap_date: form.swap_date, new_subject_code: form.new_subject_code || undefined })} disabled={busy || !form.timetable_id || !form.target_faculty_id || !form.swap_date} /></Section> : null}<Feedback error={error} result={result} busy={busy} /></ScrollView></KeyboardAvoidingView>;


  if (activeTool === 'attendance') {
    const isStudentUser = isStudent;
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Button title="Back to services" secondary onPress={() => setActiveTool(null)} />
          {isStudentUser ? (
            <Section title="Student Attendance Records">
              <Button title="Load My Attendance" onPress={async () => {
                const usn = profile?.studentDetails?.usn || user?.username;
                const res = await request('get', '/api/v1/attendance/student/' + encodeURIComponent(usn));
                if (res) setRecords(res.records || []);
              }} />
              {records.length ? records.map((r, i) => (
                <View key={r.id || i} style={styles.row}>
                  <Text style={styles.rowTitle}>{r.subject_code} · Period {r.period_no}</Text>
                  <Text style={styles.body}>{r.attendance_date ? new Date(r.attendance_date).toLocaleDateString() : '—'} · Status: {r.status}</Text>
                </View>
              )) : <Text style={styles.empty}>Click Load My Attendance to fetch records.</Text>}
            </Section>
          ) : (
            <Section title="Manual Attendance Console">
              <Text style={styles.body}>Enter section and USNs. Status toggle chips apply to entered students.</Text>
              <Field label="Department" value={form.attDept || profile?.department || 'CSE'} onChangeText={(v) => set('attDept', v)} />
              <Field label="Semester" value={form.attSem || '3'} onChangeText={(v) => set('attSem', v)} keyboardType="number-pad" />
              <Field label="Section" value={form.attSec || 'A'} onChangeText={(v) => set('attSec', v)} />
              <Field label="Subject Code" value={form.attSub || 'BCS301'} onChangeText={(v) => set('attSub', v)} />
              <Field label="Period Number" value={form.attPeriod || '1'} onChangeText={(v) => set('attPeriod', v)} keyboardType="number-pad" />
              <Field label="Date (YYYY-MM-DD)" value={form.attDate || new Date().toISOString().slice(0, 10)} onChangeText={(v) => set('attDate', v)} />
              
              <Text style={styles.label}>Status Toggle</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginVertical: 6 }}>
                {['PRESENT', 'ABSENT', 'LATE'].map((st) => (
                  <TouchableOpacity
                    key={st}
                    onPress={() => set('attStatus', st)}
                    style={[
                      styles.chip,
                      (form.attStatus || 'PRESENT') === st ? styles.chipActive : styles.chipInactive,
                    ]}
                  >
                    <Text style={[(form.attStatus || 'PRESENT') === st ? styles.chipTextActive : styles.chipTextInactive]}>{st}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Field label="Student USNs (comma separated)" value={form.attUsns || ''} onChangeText={(v) => set('attUsns', v)} multiline placeholder="1RL26CS001, 1RL26CS002..." />
              
              <Button
                title="Capture Sheet with Camera (Phase 3 - Coming Soon)"
                secondary
                onPress={() => Alert.alert('Camera Capture', 'Phase 3 - Coming Soon. Please use manual entry.')}
              />
              
              <Button
                title="Commit Manual Attendance"
                disabled={busy || !form.attUsns}
                onPress={async () => {
                  const usns = (form.attUsns || '').split(',').map((u) => u.trim()).filter(Boolean);
                  const recordsPayload = usns.map((u) => ({ student_id: u, status: form.attStatus || 'PRESENT' }));
                  await run('post', '/api/v1/attendance/manual', {
                    department: form.attDept || profile?.department || 'CSE',
                    semester: Number(form.attSem || 3),
                    section: form.attSec || 'A',
                    subject_code: form.attSub || 'BCS301',
                    period_no: Number(form.attPeriod || 1),
                    attendance_date: form.attDate || new Date().toISOString().slice(0, 10),
                    records: recordsPayload,
                  });
                }}
              />
            </Section>
          )}
          <Feedback error={error} result={result} busy={busy} />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  if (activeTool === 'cie') {
    const isStudentUser = isStudent;
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Button title="Back to services" secondary onPress={() => setActiveTool(null)} />
          {isStudentUser ? (
            <Section title="My CIE Scorecards">
              <Button title="Load My CIE Marks" onPress={async () => {
                const usn = profile?.studentDetails?.usn || user?.username;
                const res = await request('get', '/api/v1/cie/student/' + encodeURIComponent(usn));
                if (res) setRecords(res.marks || []);
              }} />
              {records.length ? records.map((c, i) => (
                <View key={c.id || i} style={styles.row}>
                  <Text style={styles.rowTitle}>{c.subject_code} · {c.subject_name || 'Subject'}</Text>
                  <Text style={styles.body}>CIE: {c.cie1_marks} / {c.cie2_marks} / {c.cie3_marks} · Assign: {c.assignment_marks} · Total: {c.total_cie}/{c.max_marks}</Text>
                </View>
              )) : <Text style={styles.empty}>Click Load My CIE Marks to fetch scorecards.</Text>}
            </Section>
          ) : (
            <Section title="Continuous Internal Evaluation (CIE) Entry">
              <Field label="Student USN" value={form.cieUsn || ''} onChangeText={(v) => set('cieUsn', v)} placeholder="e.g. 1RL26CS001" />
              <Field label="Department" value={form.cieDept || profile?.department || 'CSE'} onChangeText={(v) => set('cieDept', v)} />
              <Field label="Semester" value={form.cieSem || '3'} onChangeText={(v) => set('cieSem', v)} keyboardType="number-pad" />
              <Field label="Subject Code" value={form.cieSub || 'BCS301'} onChangeText={(v) => set('cieSub', v)} />
              <Field label="Subject Name" value={form.cieSubName || 'Data Structures'} onChangeText={(v) => set('cieSubName', v)} />
              <Field label="CIE 1 Marks" value={form.cie1 || '0'} onChangeText={(v) => set('cie1', v)} keyboardType="decimal-pad" />
              <Field label="CIE 2 Marks" value={form.cie2 || '0'} onChangeText={(v) => set('cie2', v)} keyboardType="decimal-pad" />
              <Field label="CIE 3 Marks" value={form.cie3 || '0'} onChangeText={(v) => set('cie3', v)} keyboardType="decimal-pad" />
              <Field label="Assignment Marks" value={form.cieAssign || '0'} onChangeText={(v) => set('cieAssign', v)} keyboardType="decimal-pad" />
              <Field label="Max Marks" value={form.cieMax || '50'} onChangeText={(v) => set('cieMax', v)} keyboardType="number-pad" />
              <Button
                title="Upsert CIE Marks"
                disabled={busy || !form.cieUsn}
                onPress={() => run('post', '/api/v1/cie/manual', {
                  student_id: form.cieUsn.trim(),
                  department: form.cieDept || profile?.department || 'CSE',
                  semester: Number(form.cieSem || 3),
                  subject_code: form.cieSub || 'BCS301',
                  subject_name: form.cieSubName || 'Data Structures',
                  cie1_marks: Number(form.cie1 || 0),
                  cie2_marks: Number(form.cie2 || 0),
                  cie3_marks: Number(form.cie3 || 0),
                  assignment_marks: Number(form.cieAssign || 0),
                  max_marks: Number(form.cieMax || 50),
                })}
              />
            </Section>
          )}
          <Feedback error={error} result={result} busy={busy} />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  if (activeTool === 'placements') {
    const isPlcAdmin = isSuper || (user?.baseRole === 'ADMIN' && user?.sectionCode === 'PLC');
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Button title="Back to services" secondary onPress={() => setActiveTool(null)} />
          <Section title="Placement Recruitment Drives">
            <Button title="Refresh Placement Drives" onPress={async () => {
              const res = await request('get', '/api/v1/placements/drives');
              if (res) setRecords(res.drives || []);
            }} />
            {records.length ? records.map((d, i) => (
              <View key={d.id || i} style={styles.row}>
                <Text style={styles.rowTitle}>{d.company_name} · {d.role_title}</Text>
                <Text style={styles.body}>Package: ₹{d.package_lpa} LPA · Min CGPA: {d.min_cgpa} · Date: {d.drive_date ? new Date(d.drive_date).toLocaleDateString() : '—'}</Text>
                {isStudent ? (
                  <Button
                    title="Apply for Drive"
                    secondary
                    onPress={() => run('post', `/api/v1/placements/drives/${d.id}/apply`, {})}
                  />
                ) : null}
              </View>
            )) : <Text style={styles.empty}>Click Refresh to load active drives.</Text>}
          </Section>
          {isPlcAdmin ? (
            <Section title="Create Placement Drive">
              <Field label="Company Name" value={form.plcCompany || ''} onChangeText={(v) => set('plcCompany', v)} />
              <Field label="Role Title" value={form.plcRole || ''} onChangeText={(v) => set('plcRole', v)} />
              <Field label="Package (LPA)" value={form.plcLpa || ''} onChangeText={(v) => set('plcLpa', v)} keyboardType="decimal-pad" />
              <Field label="Minimum CGPA" value={form.plcCgpa || '6.5'} onChangeText={(v) => set('plcCgpa', v)} keyboardType="decimal-pad" />
              <Field label="Drive Date (YYYY-MM-DD)" value={form.plcDate || ''} onChangeText={(v) => set('plcDate', v)} />
              <Button
                title="Publish Drive"
                disabled={busy || !form.plcCompany || !form.plcRole || !form.plcLpa || !form.plcDate}
                onPress={async () => {
                  const r = await request('post', '/api/v1/placements/drives', {
                    company_name: form.plcCompany,
                    role_title: form.plcRole,
                    package_lpa: Number(form.plcLpa),
                    min_cgpa: Number(form.plcCgpa || 6.5),
                    drive_date: form.plcDate,
                    status: 'UPCOMING',
                  });
                  if (r) {
                    const d = await request('get', '/api/v1/placements/drives');
                    if (d) setRecords(d.drives || []);
                  }
                }}
              />
            </Section>
          ) : null}
          <Feedback error={error} result={result} busy={busy} />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
    <View style={styles.hero}><Text style={styles.overline}>{profile?.adminTier || profile?.baseRole || user?.baseRole || 'ACCOUNT'}</Text><Text style={styles.heroTitle}>Campus services</Text><Text style={styles.heroSub}>Available actions are limited to the permissions on this account.</Text></View>
    {(canProvision || isSuper) ? <Section title="Provisioning and administration">{isSuper ? <Button title="Provision authority" onPress={() => setActiveTool('provision-authority')} /> : null}{canProvision ? <Button title={isHod ? 'Provision department student' : 'Provision student'} onPress={() => setActiveTool('provision-student')} /> : null}{(isHod || isSuper) ? <Button title="LG mapping and sub-roles" secondary onPress={() => setActiveTool('lg-admin')} /> : null}{isSuper ? <><Button title="Database transaction ledger" secondary onPress={() => setActiveTool('db-ledger')} /><Button title="Database diagnostics" secondary onPress={() => setActiveTool('db-diagnostics')} /><Button title="Manage venues" secondary onPress={() => setActiveTool('venue-admin')} /></> : null}{isAdmission ? <Button title="Document verification" secondary onPress={() => setActiveTool('documents')} /> : null}</Section> : null}
    {isStudent || isFaculty || isHod || isSuper || isPrincipal ? <Section title="Venue booking workflow"><Text style={styles.body}>Availability, booking requests, approval queues, coordinator negotiation, cancellation and transfer workflows.</Text><Button title="Open venue services" onPress={() => setActiveTool('venues')} /></Section> : null}
    {isStudent || isFaculty || isHod || isSuper ? <Section title="Timetable and class exchange"><Text style={styles.body}>View published daily schedules and submit faculty swap requests where authorized.</Text><Button title="Open timetable services" onPress={() => setActiveTool('timetable')} /></Section> : null}
    {isStudent ? <Section title="Student requests and records"><Button title="Submit leave request" onPress={() => setActiveTool('leave')} /><Button title="Finance ledger and clearance" secondary onPress={() => setActiveTool('finance')} /><Button title="Student document vault" secondary onPress={() => { set('usn', profile?.studentDetails?.usn || ''); setActiveTool('vault'); }} /></Section> : null}
    {isFaculty || isHod ? <Section title="Mentorship and at-risk review"><Button title="Mentees and radar" onPress={() => setActiveTool('lg-mentees')} /><Button title="Review mentee leaves" secondary onPress={() => setActiveTool('leave-review')} /></Section> : null}
    {isFinance ? <Section title="Finance ledger"><Button title="View student ledger" onPress={() => setActiveTool('finance')} /><Button title="Post a ledger charge" secondary onPress={() => setActiveTool('finance-charge')} /><Button title="Record a payment" secondary onPress={() => setActiveTool('finance-payment')} /></Section> : null}
    {isAdmission ? <Section title="Student document vault"><Button title="Verify a document" onPress={() => setActiveTool('documents')} /><Button title="View student vault" secondary onPress={() => setActiveTool('vault')} /></Section> : null}
    
    <Section title="Academic & Placements Console">
      <Button title="Attendance Console" onPress={() => setActiveTool('attendance')} />
      <Button title="CIE Assessment Marks" secondary onPress={() => setActiveTool('cie')} />
      <Button title="Placement Recruitment Drives" secondary onPress={() => setActiveTool('placements')} />
    </Section>

    {isFaculty ? <Section title="Academic record management"><Text style={styles.body}>Commit attendance or CIE records with the authorized database roster, then manage EOD lock requests.</Text><Button title="Open academic records" onPress={() => setActiveTool('academic')} /></Section> : null}
    <Feedback error={error} result={result} busy={busy} />
  </ScrollView></KeyboardAvoidingView>;
}
function Feedback({ error, result, busy }) { return <>{busy ? <ActivityIndicator color={Colors.brandOrange} /> : null}{error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text></View> : null}{result ? <View style={styles.success}><Text style={styles.successText}>{result}</Text></View> : null}</>; }

const styles = StyleSheet.create({
 content: { padding: 16, paddingBottom: 36, gap: 14, backgroundColor: Colors.canvasBg },
 hero: { backgroundColor: Colors.surfaceDark, borderRadius: 20, padding: 18, gap: 7 }, overline: { color: '#FDBA74', fontSize: 10, fontWeight: '800', letterSpacing: 1 }, heroTitle: { color: Colors.textInverse, fontSize: 21, fontWeight: '800' }, heroSub: { color: '#E4E4E7', fontSize: 12, lineHeight: 18 },
 card: { backgroundColor: Colors.surfaceCard, borderRadius: 20, borderWidth: 1, borderColor: Colors.hairlineBorder, padding: 16, gap: 10 }, cardTitle: { color: Colors.textPrimary, fontSize: 15, fontWeight: '800' }, label: { color: Colors.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 5 }, field: { marginBottom: 4 }, input: { minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: Colors.hairlineBorder, backgroundColor: '#FFFFFF', paddingHorizontal: 14, color: Colors.textPrimary, fontSize: 14 }, multiline: { minHeight: 84, paddingTop: 12, textAlignVertical: 'top' },
 button: { minHeight: 48, backgroundColor: Colors.surfaceDark, borderRadius: 14, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', marginTop: 3 }, buttonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' }, secondaryButton: { backgroundColor: Colors.brandOrangeLight }, secondaryText: { color: Colors.brandOrange }, disabled: { opacity: 0.45 }, readOnly: { backgroundColor: Colors.canvasBg, color: Colors.textMuted }, availability: { borderWidth: 1, borderColor: Colors.hairlineBorder, borderRadius: 14, backgroundColor: Colors.canvasBg, padding: 12, gap: 8 }, row: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: Colors.divider, paddingTop: 10, gap: 6 }, rowTitle: { color: Colors.textBody, fontSize: 13, fontWeight: '800' }, body: { color: Colors.textMuted, fontSize: 12, lineHeight: 18 }, empty: { color: Colors.textMuted, fontSize: 12 },
 chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: Colors.hairlineBorder },
 chipActive: { backgroundColor: Colors.surfaceDark, borderColor: Colors.surfaceDark },
 chipInactive: { backgroundColor: '#FFFFFF' },
 chipTextActive: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
 chipTextInactive: { color: Colors.textMuted, fontSize: 12, fontWeight: '600' },
 buttonWrap: { gap: 7 }, error: { backgroundColor: Colors.statusRoseBg, borderColor: '#FECACA', borderWidth: 1, padding: 12, borderRadius: 12 }, errorText: { color: Colors.statusRose, fontSize: 12, lineHeight: 18 }, success: { backgroundColor: Colors.statusEmeraldBg, padding: 12, borderRadius: 12 }, successText: { color: Colors.statusEmerald, fontSize: 12, fontWeight: '600' },
});
