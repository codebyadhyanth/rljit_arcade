import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import api from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import Colors from '../../theme/colors';
import DbReceiptCard from '../DbReceiptCard';

export default function StudentProvisioningTool({ onBack }) {
  const { user } = useAuth();

  const isHod =
    user?.adminTier === 'HOD_ADMIN' ||
    (Array.isArray(user?.subRoles) && user?.subRoles.includes('HOD'));
  const lockedDepartment = isHod ? (user?.department || '') : '';

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState(lockedDepartment);
  const [entryType, setEntryType] = useState('REGULAR');
  const [admissionYear, setAdmissionYear] = useState(String(new Date().getFullYear()));
  const [semester, setSemester] = useState('1');
  const [isCr, setIsCr] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const handleSubmit = async () => {
    if (!fullName.trim() || !email.trim() || !phone.trim()) {
      setError('Please fill in candidate name, email, and phone');
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
        department: isHod ? lockedDepartment : department,
        entryType,
        admissionYear: Number(admissionYear),
        semester: Number(semester),
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

  return (
    <View style={styles.card}>
      {onBack && (
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={styles.backBtnText}>← Back to Services Catalog</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.title}>Student USN Enrollment</Text>
      <Text style={styles.subtitle}>
        Issues valid VTU USN (e.g. 1RL26CS001) with dual-table synchronization.
      </Text>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {result ? (
        <View style={styles.successBox}>
          <Text style={styles.successTitle}>Student Enrolled!</Text>
          <Text style={styles.successText}>USN: {result.username}</Text>
          <Text style={styles.successText}>Password: {result.temporaryPassword}</Text>
          {result.dbReceipt && <DbReceiptCard receipt={result.dbReceipt} />}
        </View>
      ) : null}

      <View style={styles.form}>
        <Text style={styles.label}>Full Name</Text>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Ananya Rao"
            placeholderTextColor={Colors.textMuted}
          />
        </View>

        <Text style={styles.label}>Email</Text>
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

        <Text style={styles.label}>Phone</Text>
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
                setSemester(type === 'LATERAL' ? '3' : '1');
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

        <Text style={styles.label}>Department</Text>
        {isHod ? (
          <View style={[styles.inputContainer, { backgroundColor: '#F1F5F9' }]}>
            <Text style={[styles.input, { fontWeight: '700' }]}>
              {lockedDepartment} (Locked to HOD Scope)
            </Text>
          </View>
        ) : (
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={department}
              onChangeText={(val) => setDepartment(val.toUpperCase())}
              placeholder="CS"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="characters"
            />
          </View>
        )}

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
    marginBottom: 10,
  },
  backBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.brandOrange,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
    marginBottom: 14,
  },
  errorBox: {
    backgroundColor: Colors.statusRoseBg,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  errorText: {
    color: Colors.statusRose,
    fontSize: 12,
  },
  successBox: {
    backgroundColor: Colors.statusEmeraldBg,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  successTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.statusEmerald,
  },
  successText: {
    fontSize: 12,
    color: Colors.statusEmerald,
    marginTop: 2,
    fontFamily: 'monospace',
  },
  form: {
    gap: 4,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    marginTop: 8,
    marginBottom: 4,
  },
  segmentedRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },
  segmentBtn: {
    flex: 1,
    backgroundColor: '#FBFBFC',
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    borderRadius: 10,
    minHeight: 48,
    paddingVertical: 8,
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: Colors.surfaceDark,
    borderColor: Colors.surfaceDark,
  },
  segmentText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textBody,
  },
  segmentTextActive: {
    color: Colors.textInverse,
  },
  inputContainer: {
    backgroundColor: '#FBFBFC',
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 52,
    justifyContent: 'center',
  },
  input: {
    fontSize: 13,
    color: Colors.textPrimary,
  },
  crToggle: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: Colors.hairlineBorder,
    backgroundColor: '#FFFFFF',
  },
  checkboxActive: {
    backgroundColor: Colors.brandOrange,
    borderColor: Colors.brandOrange,
  },
  crToggleText: {
    fontSize: 12,
    color: Colors.textBody,
  },
  submitBtn: {
    backgroundColor: Colors.surfaceDark,
    borderRadius: 12,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  submitText: {
    color: Colors.textInverse,
    fontSize: 13,
    fontWeight: '600',
  },
});

