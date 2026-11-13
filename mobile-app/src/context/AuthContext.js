import React, { createContext, useContext, useState, useEffect } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';
import * as ScreenCapture from 'expo-screen-capture';
import { Platform } from 'react-native';
import api, { getToken, setToken, removeToken, initBaseUrl } from '../config/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [tokenState, setTokenState] = useState(null);
  const [user, setUser] = useState(null);
  const [auditReceipt, setAuditReceipt] = useState(null);
  const [redirectUrl, setRedirectUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  useEffect(() => {
    const initializeAuth = async () => {
      await initBaseUrl();
      const storedToken = await getToken();
      if (storedToken) {
        setTokenState(storedToken);
      }

      // Check biometric availability
      try {
        if (Platform.OS !== 'web') {
          const compatible = await LocalAuthentication.hasHardwareAsync();
          const enrolled = await LocalAuthentication.isEnrolledAsync();
          setBiometricAvailable(compatible && enrolled);
        }
      } catch {
        setBiometricAvailable(false);
      }

      setLoading(false);
    };

    initializeAuth();
  }, []);

  const login = async (username, password) => {
    setLoading(true);
    try {
      const res = await api.post('/api/v1/auth/login', {
        username: username.trim(),
        password,
      });

      const data = res.data;
      if (data.success && data.token) {
        await setToken(data.token);
        setTokenState(data.token);
        setUser(data.user);
        setAuditReceipt(data.auditReceipt || null);
        setRedirectUrl(data.redirectUrl || '/portal/student/home');

        return {
          success: true,
          redirectUrl: data.redirectUrl || '/portal/student/home',
          user: data.user,
          auditReceipt: data.auditReceipt,
        };
      }
      throw new Error(data.error || 'Authentication failed');
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.userMessage ||
        err.message ||
        'Login error';
      return { success: false, error: msg };
    } finally {
      setLoading(false);
    }
  };

  const authenticateWithBiometrics = async () => {
    if (!biometricAvailable) return false;
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'RLJIT Arcade Biometric Login',
        cancelLabel: 'Use Password',
        fallbackLabel: 'Enter Password',
        disableDeviceFallback: false,
      });
      return result.success;
    } catch {
      return false;
    }
  };

  const bootstrapSuperAdmin = async (payload, key) => {
    setLoading(true);
    try {
      const res = await api.post('/api/v1/auth/bootstrap-super-admin', payload, {
        headers: { 'x-bootstrap-key': key },
      });
      return { success: true, data: res.data };
    } catch (err) {
      return {
        success: false,
        error:
          err.response?.data?.error ||
          err.response?.data?.message ||
          err.userMessage ||
          err.message ||
          'Bootstrap error',
      };
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      if (tokenState) {
        await api.post('/api/v1/auth/logout').catch(() => {});
      }
    } finally {
      await removeToken();
      setTokenState(null);
      setUser(null);
      setAuditReceipt(null);
      setRedirectUrl('');
    }
  };

  // Screen privacy helper: prevent screenshots on sensitive screens
  const enableScreenPrivacy = async () => {
    try {
      if (Platform.OS !== 'web') {
        await ScreenCapture.preventScreenCaptureAsync();
      }
    } catch {}
  };

  const disableScreenPrivacy = async () => {
    try {
      if (Platform.OS !== 'web') {
        await ScreenCapture.allowScreenCaptureAsync();
      }
    } catch {}
  };

  return (
    <AuthContext.Provider
      value={{
        token: tokenState,
        user,
        auditReceipt,
        redirectUrl,
        loading,
        isAuthenticated: !!tokenState && !!user,
        biometricAvailable,
        authenticateWithBiometrics,
        login,
        bootstrapSuperAdmin,
        logout,
        enableScreenPrivacy,
        disableScreenPrivacy,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
