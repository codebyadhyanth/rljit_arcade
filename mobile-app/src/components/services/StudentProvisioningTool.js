import React, { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import api from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import Colors from '../../theme/colors';
import DbReceiptCard from '../DbReceiptCard';
import {
  ACADEMIC_YEARS,
  ADMISSION_QUOTAS,
  CORE_BRANCHES,
  DEPARTMENTS,
} from './constants';

export default function StudentProvisioningTool({ onBack }) {
  const { user } = useAuth();

  const isHod =
    user?.adminTier === 'HOD_ADMIN' ||
    (Array.isArray(user?.subRoles) && user?.subRoles.includes('HOD'));
  const lockedDepartment = isHod ? (user?.department || '') : '';

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState(lockedDepartment || 'CSE');
  const [coreBranch, setCoreBranch] = useState(
    lockedDepartment && lockedDepartment !== 'ALLIED_SCIENCE' ? lockedDepartment : 'CSE'
  );
  const [entryType, setEntryType] = useState('REGULAR');
  const [admissionYear, setAdmissionYear] = useState(String(new Date().getFullYear()));
  const [semester, setSemester] = useState('1');
  const [academicYear, setAcademicYear] = useState('1');
  const [section, setSection] = useState('A');
  const [admissionQuota, setAdmissionQuota] = useState('KEA_CET');
  const [cgpa, setCgpa] = useState('0.00');
  const [isCr, setIsCr] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const handleSemesterChange = (val) => {
    setSemester(val);
    const num = parseInt(val, 10);
    if (!Number.isNaN(num) && num >= 1 && num <= 8) {
      setAcademicYear(String(Math.ceil(num / 2)));
    }
  };

  const handleSubmit = async () => {
    const finalDept = (isHod ? lockedDepartment : department).trim().toUpperCase();
    if (!fullName.trim() || !email.trim() || !phone.trim() || !finalDept) {
      setError('Full name, email, phone, and department are required.');
      return;
    }
    if (finalDept === 'ALLIED_SCIENCE' && !coreBranch.trim()) {
      setError('Core Branch is required for ALLIED_SCIENCE students.');
      return;
    }

    setError('');
    setResult(null);
    setLoading(true);

    try {
      const subRoles = ['STUDENT'];
      if (isCr) subRoles.push('CR');

      const payload = {
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        department: finalDept,
        coreBranch:
          finalDept === 'ALLIED_SCIENCE' ? coreBranch.trim().toUpperCase() : finalDept,
        entryType,
        admissionYear: Number(admissionYear),
        academicYear: Number(academicYear),
        semester: Number(semester),
        section: section.trim().toUpperCase() || 'A',
        admissionQuota,
        cgpa: Number(cgpa || 0),
        subRoles,
      };

      const res = await api.post('/api/v1/portals/provision-student', payload);
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Student provisioning failed');
    } finally {
      setLoading(false);
    }
  };

  const createdUsn = result?.credentials?.username || result?.username;
  const createdPass = result?.credentials?.temporaryPassword || result?.temporaryPassword;

  return (
    <View style={styles.card}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={styles.backBtnText}>← Back to Services</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={styles.title}>Student USN Enrollment</Text>
      <Text style={styles.subtitle}>
        Issues VTU USN (e.g. 1RL26CSE001) with dual-table persistence in users & student.
      </Text>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {result ? (
        <View style={styles.successBox}>
          <Text style={styles.successTitle}>Student Enrolled</Text>
          <Text style={styles.successText}>USN: {createdUsn}</Text>
          <Text style={styles.successText}>Temporary Password: {createdPass}</Text>
          {result.studentProfile ? (
            <Text style={styles.successText}>
              Dept: {result.studentProfile.department}
              {result.studentProfile.coreBranch ? ` (${result.studentProfile.coreBranch})` : ''} ·
              Year {result.studentProfile.academicYear} · Sem {result.studentProfile.semester} Sec {result.studentProfile.section}
            </Text>
          ) : null}
          {result.dbReceipt ? <DbReceiptCard receipt={result.dbReceipt} /> : null}
        </View>
      ) : null}

      <View style={styles.form}>
        <Text style={styles.label}>Full Name *</Text>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Ananya Rao"
            placeholderTextColor={Colors.textMuted}
          />
        </View>

        <Text style={styles.label}>Email *</Text>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="ananya.student@rljit.ac.in"
            placeholderTextColor={Colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <Text style={styles.label}>Phone *</Text>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="+919876543210"
            placeholderTextColor={Colors.textMuted}
            keyboardType="phone-pad"
          />
        </View>

        <Text style={styles.label}>Entry Mode</Text>
        <View style={styles.segmentedRow}>
          {['REGULAR', 'LATERAL'].map((type) => (
            <TouchableOpacity
              key={type}
              onPress={() => {
                setEntryType(type);
                const sem = type === 'LATERAL' ? '3' : '1';
                setSemester(sem);
                setAcademicYear(type === 'LATERAL' ? '2' : '1');
              }}
              style={[
                styles.segmentBtn,
                entryType === type && styles.segmentBtnActive,
              ]}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.segmentText,
                  entryType === type && styles.segmentTextActive,
                ]}
              >
                {type === 'REGULAR' ? 'Regular (Sem 1)' : 'Lateral Diploma (Sem 3)'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Department (All 11 Departments)</Text>
        {isHod ? (
          <View style={[styles.inputContainer, { backgroundColor: Colors.canvasBg }]}>
            <Text style={[styles.input, { fontWeight: '700' }]}>
              {lockedDepartment} (Locked to HOD Scope)
            </Text>
          </View>
        ) : (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipScroll}
            >
              {DEPARTMENTS.map((d) => {
                const active = department.toUpperCase() === d.code;
                return (
                  <TouchableOpacity
                    key={d.code}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => {
                      setDepartment(d.code);
                      if (d.code !== 'ALLIED_SCIENCE') {
                        setCoreBranch(d.code);
                      }
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {d.code}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                value={department}
                onChangeText={(val) => {
                  const upper = val.toUpperCase();
                  setDepartment(upper);
                  if (upper && upper !== 'ALLIED_SCIENCE') {
                    setCoreBranch(upper);
                  }
                }}
                placeholder="CSE"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="characters"
              />
            </View>
          </>
        )}

        <Text style={styles.label}>
          Core Branch {department === 'ALLIED_SCIENCE' ? '(Used for 1st-Year USN Prefix)' : '(Optional Override)'}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipScroll}
        >
          {CORE_BRANCHES.map((b) => {
            const active = coreBranch.toUpperCase() === b;
            return (
              <TouchableOpacity
                key={b}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setCoreBranch(b)}
                activeOpacity={0.8}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{b}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={coreBranch}
            onChangeText={(v) => setCoreBranch(v.toUpperCase())}
            placeholder="CSE"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="characters"
          />
        </View>

        <View style={styles.twoCol}>
          <View style={styles.half}>
            <Text style={styles.label}>Admission Year</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                value={admissionYear}
                onChangeText={setAdmissionYear}
                keyboardType="number-pad"
              />
            </View>
          </View>
          <View style={styles.half}>
            <Text style={styles.label}>Semester (1-8)</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                value={semester}
                onChangeText={handleSemesterChange}
                keyboardType="number-pad"
              />
            </View>
          </View>
        </View>

        <Text style={styles.label}>Academic Year</Text>
        <View style={styles.segmentedRow}>
          {ACADEMIC_YEARS.map((yr) => {
            const active = String(academicYear) === String(yr);
            return (
              <TouchableOpacity
                key={yr}
                style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                onPress={() => setAcademicYear(String(yr))}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  Year {yr}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.twoCol}>
          <View style={styles.half}>
            <Text style={styles.label}>Section</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                value={section}
                onChangeText={(v) => setSection(v.toUpperCase())}
                autoCapitalize="characters"
              />
            </View>
          </View>
          <View style={styles.half}>
            <Text style={styles.label}>Initial CGPA</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                value={cgpa}
                onChangeText={setCgpa}
                keyboardType="decimal-pad"
              />
            </View>
          </View>
        </View>

        <Text style={styles.label}>Admission Quota</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
          {ADMISSION_QUOTAS.map((q) => {
            const active = admissionQuota === q;
            return (
              <TouchableOpacity
                key={q}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setAdmissionQuota(q)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{q}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <TouchableOpacity
          style={styles.crToggle}
          onPress={() => setIsCr(!isCr)}
          activeOpacity={0.8}
        >
          <View style={[styles.checkbox, isCr && styles.checkboxActive]} />
          <Text style={styles.crToggleText}>
            Designate as Section Class Representative (CR)
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.submitBtn}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.88}
        >
          {loading ? (
            <ActivityIndicator color={Colors.textInverse} size="small" />
          ) : (
            <Text style={styles.submitText}>Enroll & Generate VTU USN</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    padding: 16,
    marginVertical: 8,
  },
  backBtn: {
    minHeight: 48,
    justifyContent: 'center',
    marginBottom: 8,
  },
  backBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.brandOrange,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
    marginBottom: 14,
  },
  errorBox: {
    backgroundColor: Colors.statusRoseBg,
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    color: Colors.statusRose,
    fontSize: 12,
    fontWeight: '600',
  },
  successBox: {
    backgroundColor: Colors.statusEmeraldBg,
    borderColor: '#A7F3D0',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  successTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.statusEmerald,
  },
  successText: {
    fontSize: 12,
    color: Colors.statusEmerald,
    marginTop: 2,
    fontWeight: '600',
  },
  form: { gap: 4 },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    marginTop: 10,
    marginBottom: 4,
  },
  segmentedRow: { flexDirection: 'row', gap: 6 },
  segmentBtn: {
    flex: 1,
    backgroundColor: '#FBFBFC',
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    borderRadius: 12,
    minHeight: 48,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: Colors.surfaceDark,
    borderColor: Colors.surfaceDark,
  },
  segmentText: { fontSize: 11, fontWeight: '600', color: Colors.textBody },
  segmentTextActive: { color: Colors.textInverse, fontWeight: '700' },
  chipScroll: { gap: 8, paddingVertical: 4 },
  chip: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    backgroundColor: '#FBFBFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: Colors.surfaceDark,
    borderColor: Colors.surfaceDark,
  },
  chipText: { fontSize: 12, fontWeight: '600', color: Colors.textBody },
  chipTextActive: { color: Colors.textInverse, fontWeight: '700' },
  twoCol: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  inputContainer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    borderRadius: 14,
    paddingHorizontal: 14,
    minHeight: 52,
    justifyContent: 'center',
  },
  input: { fontSize: 14, color: Colors.textPrimary },
  crToggle: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Colors.hairlineBorder,
    backgroundColor: '#FFFFFF',
  },
  checkboxActive: {
    backgroundColor: Colors.brandOrange,
    borderColor: Colors.brandOrange,
  },
  crToggleText: { fontSize: 13, color: Colors.textBody, fontWeight: '600' },
  submitBtn: {
    backgroundColor: Colors.surfaceDark,
    borderRadius: 14,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  submitText: {
    color: Colors.textInverse,
    fontSize: 13,
    fontWeight: '700',
  },
});
