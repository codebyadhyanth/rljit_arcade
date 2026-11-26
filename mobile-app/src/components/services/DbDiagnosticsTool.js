import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import api from '../../config/api';
import Colors from '../../theme/colors';

export default function DbDiagnosticsTool({ onBack }) {
  const [roleStatuses, setRoleStatuses] = useState({});
  const [loading, setLoading] = useState(false);
  const [initResult, setInitResult] = useState(null);
  const [error, setError] = useState('');

  const roles = ['student', 'faculty', 'admin'];

  const fetchStatuses = async () => {
    setLoading(true);
    setError('');
    try {
      const results = {};
      for (const r of roles) {
        try {
          const res = await api.get(`/db:rljit_arcade:${r}/status`);
          results[r] = res.data;
        } catch (err) {
          results[r] = { exists: false, error: err.message };
        }
      }
      setRoleStatuses(results);
    } catch (err) {
      setError('Failed to fetch role status');
    } finally {
      setLoading(false);
    }
  };

  const handleInitAll = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/db:rljit_arcade/connect');
      setInitResult(res.data);
      await fetchStatuses();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Initialization failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatuses();
  }, []);

  return (
    <View style={styles.card}>
      {onBack && (
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={styles.backBtnText}>← Back to Services Catalog</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.title}>Database Table Diagnostics</Text>
      <Text style={styles.subtitle}>
        PostgreSQL schema definitions and live row counts.
      </Text>

      <View style={styles.btnRow}>
        <TouchableOpacity
          onPress={fetchStatuses}
          style={styles.actionBtn}
          disabled={loading}
          activeOpacity={0.8}
        >
          <Text style={styles.actionBtnText}>{loading ? '...' : 'Check Status'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleInitAll}
          style={[styles.actionBtn, styles.actionBtnDark]}
          disabled={loading}
          activeOpacity={0.8}
        >
          <Text style={[styles.actionBtnText, styles.actionBtnTextDark]}>
            Verify All
          </Text>
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {initResult ? (
        <View style={styles.successBox}>
          <Text style={styles.successText}>
            {initResult.status}: Tables [{initResult.tablesCreated?.join(', ')}] verified.
          </Text>
        </View>
      ) : null}

      <View style={styles.roleGrid}>
        {roles.map((r) => {
          const st = roleStatuses[r];
          return (
            <View key={r} style={styles.roleBox}>
              <View style={styles.roleHeader}>
                <Text style={styles.roleName}>{r.toUpperCase()} TABLE</Text>
                <View
                  style={[
                    styles.statusPill,
                    st?.exists ? styles.statusPillActive : styles.statusPillInactive,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      st?.exists ? styles.statusTextActive : styles.statusTextInactive,
                    ]}
                  >
                    {st?.exists ? 'Verified' : 'Missing'}
                  </Text>
                </View>
              </View>

              <Text style={styles.rowCountText}>Rows: {st?.rowCount ?? 0}</Text>
              <Text style={styles.colCountText}>
                Columns: {st?.columns?.length ?? 0}
              </Text>
            </View>
          );
        })}
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
    marginBottom: 6,
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
    marginBottom: 12,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  actionBtn: {
    flex: 1,
    minHeight: 48,
    backgroundColor: '#FBFBFC',
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnDark: {
    backgroundColor: Colors.surfaceDark,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textBody,
  },
  actionBtnTextDark: {
    color: Colors.textInverse,
  },
  errorBox: {
    backgroundColor: Colors.statusRoseBg,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  errorText: {
    color: Colors.statusRose,
    fontSize: 12,
  },
  successBox: {
    backgroundColor: Colors.statusEmeraldBg,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  successText: {
    color: Colors.statusEmerald,
    fontSize: 12,
    fontWeight: '600',
  },
  roleGrid: {
    gap: 8,
  },
  roleBox: {
    backgroundColor: '#FBFBFC',
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    borderRadius: 12,
    padding: 12,
  },
  roleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  roleName: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  statusPillActive: {
    backgroundColor: Colors.statusEmeraldBg,
  },
  statusPillInactive: {
    backgroundColor: Colors.statusRoseBg,
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: '700',
  },
  statusTextActive: {
    color: Colors.statusEmerald,
  },
  statusTextInactive: {
    color: Colors.statusRose,
  },
  rowCountText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: Colors.textBody,
  },
  colCountText: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
});

