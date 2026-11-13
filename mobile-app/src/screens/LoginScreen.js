import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { getBaseUrl, setBaseUrl } from '../config/api';
import Colors from '../theme/colors';
import DbReceiptCard from '../components/DbReceiptCard';

export default function LoginScreen({ navigation }) {
  const {
    login,
    authenticateWithBiometrics,
    biometricAvailable,
    bootstrapSuperAdmin,
    loading,
  } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [auditReceipt, setAuditReceipt] = useState(null);

  // Server URL Config
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [serverUrl, setServerUrl] = useState(getBaseUrl());
  const [serverSaved, setServerSaved] = useState(false);

  // Bootstrap Accordion
  const [showBootstrap, setShowBootstrap] = useState(false);
  const [bootKey, setBootKey] = useState('RLJIT_SUPER_MASTERMIND_BOOTSTRAP_KEY_2026');
  const [bootFullName, setBootFullName] = useState('Super Admin Mastermind');
  const [bootEmail, setBootEmail] = useState('superadmin@rljit.ac.in');
  const [bootPhone, setBootPhone] = useState('+919888877777');
  const [bootPassword, setBootPassword] = useState('p$4K9!vQ2#xM');
  const [bootResult, setBootResult] = useState(null);
  const [bootError, setBootError] = useState('');

  const handleLogin = async () => {
    setError('');
    setAuditReceipt(null);
    if (!username.trim() || !password) {
      setError('Username / USN and password are required');
      return;
    }

    const res = await login(username, password);
    if (res.success) {
      if (res.auditReceipt) setAuditReceipt(res.auditReceipt);
      setTimeout(() => {
        navigation.replace('RbacVerification');
      }, 300);
    } else {
      setError(res.error);
    }
  };

  const handleBiometricAuth = async () => {
    const success = await authenticateWithBiometrics();
    if (success) {
      navigation.replace('RbacVerification');
    } else {
      setError('Biometric authentication cancelled or failed');
    }
  };

  const handleBootstrap = async () => {
    setBootError('');
    setBootResult(null);

    const payload = {
      fullName: bootFullName,
      email: bootEmail,
      phone: bootPhone,
      password: bootPassword,
    };

    const res = await bootstrapSuperAdmin(payload, bootKey);
    if (res.success) {
      setBootResult(res.data);
      setUsername(res.data.username);
      setPassword(res.data.temporaryPassword || bootPassword);
    } else {
      setBootError(res.error);
    }
  };

  const handleSaveServer = async () => {
    await setBaseUrl(serverUrl);
    setServerSaved(true);
    setTimeout(() => setServerSaved(false), 2000);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardContainer}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Main Card */}
          <View style={styles.card}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.logoBadge}>
                <Text style={styles.logoText}>RL</Text>
              </View>
              <Text style={styles.title}>RLJIT Arcade</Text>
              <Text style={styles.subtitle}>
                R.L. Jalappa Institute of Technology • Mobile Gateway
              </Text>
            </View>

            {/* Error Banner */}
            {error ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* Live DB Audit Receipt */}
            {auditReceipt ? (
              <DbReceiptCard receipt={auditReceipt} title="Login Persisted to PostgreSQL" />
            ) : null}

            {/* Form Fields */}
            <View style={styles.form}>
              <Text style={styles.label}>Institutional ID / Username</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. RLSUPER001, 1RL26CS001"
                  placeholderTextColor={Colors.textMuted}
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <Text style={styles.label}>Account Password</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  placeholder="••••••••••••"
                  placeholderTextColor={Colors.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.maskToggle}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.maskToggleText}>
                    {showPassword ? 'Hide' : 'Show'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Obsidian Primary Action */}
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.88}
              >
                {loading ? (
                  <ActivityIndicator color={Colors.textInverse} size="small" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    Sign In to Institutional Portal
                  </Text>
                )}
              </TouchableOpacity>

              {/* Biometrics */}
              {biometricAvailable ? (
                <TouchableOpacity
                  style={styles.biometricButton}
                  onPress={handleBiometricAuth}
                  activeOpacity={0.88}
                >
                  <Text style={styles.biometricButtonText}>
                    Authenticate with Biometrics
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Accordion: Super Admin Bootstrap */}
            <View style={styles.accordionSection}>
              <TouchableOpacity
                onPress={() => setShowBootstrap(!showBootstrap)}
                style={styles.accordionHeader}
                activeOpacity={0.7}
              >
                <Text style={styles.accordionHeaderText}>
                  First-Time Setup: Bootstrap Super Admin
                </Text>
                <Text style={styles.accordionToggleText}>
                  {showBootstrap ? 'Hide' : 'Open'}
                </Text>
              </TouchableOpacity>

              {showBootstrap ? (
                <View style={styles.bootstrapBox}>
                  {bootError ? (
                    <View style={styles.miniError}>
                      <Text style={styles.miniErrorText}>{bootError}</Text>
                    </View>
                  ) : null}

                  {bootResult ? (
                    <View style={styles.miniSuccess}>
                      <Text style={styles.miniSuccessTitle}>Super Admin Created!</Text>
                      <Text style={styles.miniSuccessText}>
                        Username: {bootResult.username}
                      </Text>
                      <Text style={styles.miniSuccessText}>
                        Password: {bootResult.temporaryPassword || bootPassword}
                      </Text>
                    </View>
                  ) : null}

                  <Text style={styles.miniLabel}>x-bootstrap-key Header</Text>
                  <TextInput
                    style={styles.miniInput}
                    value={bootKey}
                    onChangeText={setBootKey}
                    autoCapitalize="none"
                  />

                  <Text style={styles.miniLabel}>Super Admin Full Name</Text>
                  <TextInput
                    style={styles.miniInput}
                    value={bootFullName}
                    onChangeText={setBootFullName}
                  />

                  <Text style={styles.miniLabel}>Email</Text>
                  <TextInput
                    style={styles.miniInput}
                    value={bootEmail}
                    onChangeText={setBootEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />

                  <Text style={styles.miniLabel}>Phone</Text>
                  <TextInput
                    style={styles.miniInput}
                    value={bootPhone}
                    onChangeText={setBootPhone}
                    keyboardType="phone-pad"
                  />

                  <Text style={styles.miniLabel}>Password</Text>
                  <TextInput
                    style={styles.miniInput}
                    value={bootPassword}
                    onChangeText={setBootPassword}
                    autoCapitalize="none"
                  />

                  <TouchableOpacity
                    style={styles.bootstrapBtn}
                    onPress={handleBootstrap}
                    disabled={loading}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.bootstrapBtnText}>Bootstrap Super Admin</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {/* Accordion: Server URL */}
              <TouchableOpacity
                onPress={() => setShowServerConfig(!showServerConfig)}
                style={styles.serverHeader}
                activeOpacity={0.7}
              >
                <Text style={styles.serverHeaderText}>
                  Backend Server URL ({serverUrl})
                </Text>
                <Text style={styles.accordionToggleText}>
                  {showServerConfig ? 'Close' : 'Config'}
                </Text>
              </TouchableOpacity>

              {showServerConfig ? (
                <View style={styles.serverBox}>
                  <TextInput
                    style={styles.serverInput}
                    value={serverUrl}
                    onChangeText={setServerUrl}
                    autoCapitalize="none"
                    placeholder="http://10.0.2.2:5000"
                  />
                  <TouchableOpacity
                    style={styles.saveServerBtn}
                    onPress={handleSaveServer}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.saveServerText}>
                      {serverSaved ? 'Saved!' : 'Save'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                Argon2id Hashed • AES-256-GCM Encrypted PII
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.canvasBg,
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingVertical: 32,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 16,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  header: {
    padding: 24,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.hairlineBorder,
  },
  logoBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: Colors.brandOrangeLight,
    borderWidth: 1,
    borderColor: '#FED7AA',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  logoText: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.brandOrange,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 4,
    textAlign: 'center',
  },
  errorBanner: {
    backgroundColor: Colors.statusRoseBg,
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 14,
    padding: 12,
    margin: 20,
    marginBottom: 0,
  },
  errorText: {
    color: Colors.statusRose,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  form: {
    padding: 20,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textBody,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  inputContainer: {
    backgroundColor: '#FBFBFC',
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: Colors.textPrimary,
  },
  passwordInput: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  maskToggle: {
    padding: 6,
  },
  maskToggleText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  primaryButton: {
    backgroundColor: Colors.surfaceDark,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryButtonText: {
    color: Colors.textInverse,
    fontSize: 14,
    fontWeight: '600',
  },
  biometricButton: {
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    backgroundColor: '#FAFAFA',
  },
  biometricButtonText: {
    color: Colors.textBody,
    fontSize: 13,
    fontWeight: '600',
  },
  accordionSection: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.hairlineBorder,
  },
  accordionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.hairlineBorder,
  },
  accordionHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textBody,
  },
  accordionToggleText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.brandOrange,
  },
  bootstrapBox: {
    backgroundColor: '#FBFBFC',
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
  },
  miniError: {
    backgroundColor: Colors.statusRoseBg,
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
  },
  miniErrorText: {
    color: Colors.statusRose,
    fontSize: 11,
  },
  miniSuccess: {
    backgroundColor: Colors.statusEmeraldBg,
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
  },
  miniSuccessTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.statusEmerald,
  },
  miniSuccessText: {
    fontSize: 10,
    color: Colors.statusEmerald,
  },
  miniLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textMuted,
    marginBottom: 4,
    marginTop: 6,
  },
  miniInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 40,
    fontSize: 12,
    color: Colors.textPrimary,
  },
  bootstrapBtn: {
    backgroundColor: Colors.surfaceDark,
    borderRadius: 10,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  bootstrapBtnText: {
    color: Colors.textInverse,
    fontSize: 12,
    fontWeight: '600',
  },
  serverHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  serverHeaderText: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  serverBox: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    marginBottom: 8,
  },
  serverInput: {
    flex: 1,
    backgroundColor: '#FBFBFC',
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 40,
    fontSize: 12,
    color: Colors.textPrimary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  saveServerBtn: {
    backgroundColor: Colors.surfaceDark,
    paddingHorizontal: 14,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveServerText: {
    color: Colors.textInverse,
    fontSize: 12,
    fontWeight: '600',
  },
  footer: {
    paddingVertical: 14,
    backgroundColor: '#FAFAFA',
    borderTopWidth: 1,
    borderTopColor: Colors.hairlineBorder,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 10,
    color: Colors.textMuted,
  },
});
