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
import Colors from '../../theme/colors';
import DbReceiptCard from '../DbReceiptCard';
import {
  DEPARTMENTS,
  FACULTY_CLASSIFICATIONS,
  SECTION_CODES,
} from './constants';

export default function ProvisionAuthorityTool({ onBack }) {
  const [authorityType, setAuthorityType] = useState('REGULAR_ADMIN');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState('CSE');
  const [sectionCode, setSectionCode] = useState('ADM');
  const [classification, setClassification] = useState('Assistant Professor');
  const [designation, setDesignation] = useState('');
  const [cabinRoom, setCabinRoom] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const handleAuthorityTypeChange = (type) => {
    setAuthorityType(type);
    if (type === 'HOD_ADMIN') {
      setClassification('HOD');
    } else if (type === 'FACULTY' && classification === 'HOD') {
      setClassification('Assistant Professor');
    }
  };

  const handleSubmit = async () => {
    if (!fullName.trim() || !email.trim() || !phone.trim()) {
      setError('Full name, institutional email, and phone are required.');
      return;
    }
    if (authorityType !== 'REGULAR_ADMIN' && !department.trim()) {
      setError('Department code is required for HOD or Faculty.');
      return;
    }

    setError('');
    setResult(null);
    setLoading(true);

    try {
      const payload = {
        authorityType,
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        department: authorityType !== 'REGULAR_ADMIN' ? department.trim().toUpperCase() : undefined,
        sectionCode: authorityType === 'REGULAR_ADMIN' ? sectionCode : undefined,
        subRoles: authorityType === 'HOD_ADMIN' ? ['HOD'] : [],
        classification:
          authorityType !== 'REGULAR_ADMIN'
            ? classification.trim() || undefined
            : undefined,
        designation:
          authorityType !== 'REGULAR_ADMIN' && designation.trim()
            ? designation.trim()
            : undefined,
        cabinRoom:
          authorityType !== 'REGULAR_ADMIN' && cabinRoom.trim()
            ? cabinRoom.trim()
            : undefined,
      };

      const res = await api.post('/api/v1/super-admin/provision-authority', payload);
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Provisioning failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.card}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={styles.backBtnText}>← Back to Services</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={styles.title}>Provision Institutional Authority</Text>
      <Text style={styles.subtitle}>
        Atomic dual-table synchronization into users and admin / faculty tables.
      </Text>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {result ? (
        <View style={styles.successBox}>
          <Text style={styles.successTitle}>Authority Provisioned</Text>
          <Text style={styles.successText}>Username: {result.username}</Text>
          <Text style={styles.successText}>Temporary Password: {result.temporaryPassword}</Text>
          {result.roleAssigned?.department ? (
            <Text style={styles.successText}>Department: {result.roleAssigned.department}</Text>
          ) : null}
          {result.roleAssigned?.sectionCode ? (
            <Text style={styles.successText}>Section: {result.roleAssigned.sectionCode}</Text>
          ) : null}
          {result.dbReceipt ? <DbReceiptCard receipt={result.dbReceipt} /> : null}
        </View>
      ) : null}

      <View style={styles.form}>
        <Text style={styles.label}>Authority Role</Text>
        <View style={styles.segmentedRow}>
          {[
            { id: 'REGULAR_ADMIN', label: 'Section Admin' },
            { id: 'HOD_ADMIN', label: 'Dept HOD' },
            { id: 'FACULTY', label: 'Faculty' },
          ].map((type) => (
            <TouchableOpacity
              key={type.id}
              onPress={() => handleAuthorityTypeChange(type.id)}
              style={[
                styles.segmentBtn,
                authorityType === type.id && styles.segmentBtnActive,
              ]}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.segmentText,
                  authorityType === type.id && styles.segmentTextActive,
                ]}
              >
                {type.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {authorityType === 'REGULAR_ADMIN' ? (
          <>
            <Text style={styles.label}>Section Code (All 7 Institutional Sections)</Text>
            <View style={styles.chipWrap}>
              {SECTION_CODES.map((sec) => {
                const active = sectionCode === sec.code;
                return (
                  <TouchableOpacity
                    key={sec.code}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setSectionCode(sec.code)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {sec.code}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.helperText}>
              {SECTION_CODES.find((s) => s.code === sectionCode)?.label || sectionCode}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.label}>Department (All 11 Departments)</Text>
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
                    onPress={() => setDepartment(d.code)}
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
                onChangeText={(val) => setDepartment(val.toUpperCase())}
                placeholder="CSE"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="characters"
              />
            </View>

            <Text style={styles.label}>Faculty Classification</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipScroll}
            >
              {FACULTY_CLASSIFICATIONS.map((cls) => {
                const active = classification === cls;
                return (
                  <TouchableOpacity
                    key={cls}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setClassification(cls)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {cls}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.twoCol}>
              <View style={styles.half}>
                <Text style={styles.label}>Designation (Optional)</Text>
                <View style={styles.inputContainer}>
                  <TextInput
                    style={styles.input}
                    value={designation}
                    onChangeText={setDesignation}
                    placeholder={classification}
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>
              </View>
              <View style={styles.half}>
                <Text style={styles.label}>Cabin Room (Optional)</Text>
                <View style={styles.inputContainer}>
                  <TextInput
                    style={styles.input}
                    value={cabinRoom}
                    onChangeText={setCabinRoom}
                    placeholder="CSE-204"
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>
              </View>
            </View>
          </>
        )}

        <Text style={styles.label}>Full Name *</Text>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Dr. Rajesh Sharma"
            placeholderTextColor={Colors.textMuted}
          />
        </View>

        <Text style={styles.label}>Institutional Email *</Text>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="rajesh.cse@rljit.ac.in"
            placeholderTextColor={Colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <Text style={styles.label}>Contact Phone *</Text>
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

        <TouchableOpacity
          style={styles.submitBtn}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.88}
        >
          {loading ? (
            <ActivityIndicator color={Colors.textInverse} size="small" />
          ) : (
            <Text style={styles.submitText}>Provision Authority in PostgreSQL</Text>
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
  helperText: {
    fontSize: 11,
    color: Colors.textBody,
    fontWeight: '600',
    marginTop: 4,
  },
  segmentedRow: { flexDirection: 'row', gap: 6, marginBottom: 4 },
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
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
  submitBtn: {
    backgroundColor: Colors.surfaceDark,
    borderRadius: 14,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  submitText: {
    color: Colors.textInverse,
    fontSize: 13,
    fontWeight: '700',
  },
});
