import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../config/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => localStorage.getItem('rljit_token') || null);
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('rljit_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [auditReceipt, setAuditReceipt] = useState(() => {
    try {
      const stored = localStorage.getItem('rljit_audit_receipt');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [redirectUrl, setRedirectUrl] = useState(
    () => localStorage.getItem('rljit_redirect_url') || ''
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token) {
      localStorage.setItem('rljit_token', token);
    } else {
      localStorage.removeItem('rljit_token');
    }
  }, [token]);

  useEffect(() => {
    if (user) {
      localStorage.setItem('rljit_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('rljit_user');
    }
  }, [user]);

  useEffect(() => {
    if (auditReceipt) {
      localStorage.setItem('rljit_audit_receipt', JSON.stringify(auditReceipt));
    } else {
      localStorage.removeItem('rljit_audit_receipt');
    }
  }, [auditReceipt]);

  useEffect(() => {
    if (redirectUrl) {
      localStorage.setItem('rljit_redirect_url', redirectUrl);
    } else {
      localStorage.removeItem('rljit_redirect_url');
    }
  }, [redirectUrl]);

  const login = async (username, password) => {
    setLoading(true);
    try {
      const response = await api.post('/api/v1/auth/login', {
        username: username.trim(),
        password,
      });

      const data = response.data;
      if (data.success && data.token) {
        setToken(data.token);
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
      throw new Error(data.error || 'Login failed');
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Invalid credentials';
      return { success: false, error: msg };
    } finally {
      setLoading(false);
    }
  };

  const bootstrapSuperAdmin = async (payload, bootstrapKey) => {
    setLoading(true);
    try {
      const response = await api.post('/api/v1/auth/bootstrap-super-admin', payload, {
        headers: {
          'x-bootstrap-key': bootstrapKey,
        },
      });
      return { success: true, data: response.data };
    } catch (err) {
      return {
        success: false,
        error: err.response?.data?.error || err.message || 'Bootstrap failed',
      };
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      if (token) {
        await api.post('/api/v1/auth/logout').catch(() => {});
      }
    } finally {
      setToken(null);
      setUser(null);
      setAuditReceipt(null);
      setRedirectUrl('');
      localStorage.removeItem('rljit_token');
      localStorage.removeItem('rljit_user');
      localStorage.removeItem('rljit_audit_receipt');
      localStorage.removeItem('rljit_redirect_url');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        auditReceipt,
        redirectUrl,
        loading,
        isAuthenticated: !!token && !!user,
        login,
        bootstrapSuperAdmin,
        logout,
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
