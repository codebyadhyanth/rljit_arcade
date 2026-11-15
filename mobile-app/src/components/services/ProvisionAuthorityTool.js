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
import Colors from '../../theme/colors';
import DbReceiptCard from '../DbReceiptCard';

export default function ProvisionAuthorityTool({ onBack }) {
  const [authorityType, setAuthorityType] = useState('REGULAR_ADMIN');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState('CS');
  const [sectionCode, setSectionCode] = useState('ADM');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const handleSubmit = async () => {
    if (!fullName.trim() || !email.trim() || !phone.trim()) {
      setError('Please fill in all required fields');
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
        department: authorityType !== 'REGULAR_ADMIN' ? department : undefined,
        sectionCode: authorityType === 'REGULAR_ADMIN' ? sectionCode : undefined,
        subRoles: authorityType === 'HOD_ADMIN' ? ['HOD'] : [],
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
      {onBack && (
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={styles.backBtnText}>← Back to Services Catalog</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.title}>Provision Institutional Authority</Text>
      <Text style={styles.subtitle}>
        Dual-table synchronization into users and admin/faculty tables.
      </Text>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {result ? (
        <View style={styles.successBox}>
          <Text style={styles.successTitle}>Authority Provisioned!</Text>
          <Text style={styles.successText}>Username: {result.username}</Text>
          <Text style={styles.successText}>Password: {result.temporaryPassword}</Text>
          {result.dbReceipt && <DbReceiptCard receipt={result.dbReceipt} />}
        </View>
      ) : null}

      <View style={styles.form}>
        <Text style={styles.label}>Authority Role</Text>
        <View style={styles.segmentedRow}>
          {['REGULAR_ADMIN', 'HOD_ADMIN', 'FACULTY'].map((type) => (
            <TouchableOpacity
              key={type}
              onPress={() => setAuthorityType(type)}
              style={[
                styles.segmentBtn,
                authorityType === type && styles.segmentBtnActive,
              ]}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.segmentText,
                  authorityType === type && styles.segmentTextActive,
                ]}
              >
                {type === 'REGULAR_ADMIN' ? 'Section' : type === 'HOD_ADMIN' ? 'HOD' : 'Faculty'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {authorityType === 'REGULAR_ADMIN' ? (
          <>
            <Text style={styles.label}>Section Code (ADM / ACC / PLC / SPT)</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                value={sectionCode}
                onChangeText={(val) => setSectionCode(val.toUpperCase())}
                placeholder="ADM"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="characters"
              />
            </View>
          </>
        ) : (
          <>
            <Text style={styles.label}>Department Code (CS / IS / EC / ME)</Text>
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
          </>
        )}

        <Text style={styles.label}>Full Name</Text>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Dr. Rajesh Sharma"
            placeholderTextColor={Colors.textMuted}
          />
        </View>

        <Text style={styles.label}>Institutional Email</Text>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="rajesh.cs@rljit.ac.in"
            placeholderTextColor={Colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <Text style={styles.label}>Contact Phone</Text>
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
    height: 46,
    justifyContent: 'center',
  },
  input: {
    fontSize: 13,
    color: Colors.textPrimary,
  },
  submitBtn: {
    backgroundColor: Colors.surfaceDark,
    borderRadius: 12,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  submitText: {
    color: Colors.textInverse,
    fontSize: 13,
    fontWeight: '600',
  },
});

