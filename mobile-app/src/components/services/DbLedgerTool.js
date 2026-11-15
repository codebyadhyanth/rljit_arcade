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

export default function DbLedgerTool({ onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchLedger = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/api/v1/db/verify-storage');
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to fetch DB storage');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLedger();
  }, []);

  return (
    <View style={styles.card}>
      {onBack && (
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={styles.backBtnText}>← Back to Services Catalog</Text>
        </TouchableOpacity>
      )}

      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Cryptographic DB Ledger</Text>
          <Text style={styles.subtitle}>Raw PostgreSQL disk tuple coordinates</Text>
        </View>
        <TouchableOpacity
          onPress={fetchLedger}
          style={styles.refreshBtn}
          disabled={loading}
          activeOpacity={0.7}
        >
          <Text style={styles.refreshText}>{loading ? '...' : 'Refresh'}</Text>
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator color={Colors.brandOrange} style={{ marginVertical: 20 }} />
      ) : (
        <View style={styles.content}>
          {/* Table Counts */}
          <View style={styles.gridCounts}>
            <View style={styles.countBox}>
              <Text style={styles.countLabel}>Users</Text>
              <Text style={styles.countVal}>{data?.tableCounts?.users_count ?? 0}</Text>
            </View>
            <View style={styles.countBox}>
              <Text style={styles.countLabel}>Students</Text>
              <Text style={styles.countVal}>{data?.tableCounts?.student_count ?? 0}</Text>
            </View>
            <View style={styles.countBox}>
              <Text style={styles.countLabel}>Faculty</Text>
              <Text style={styles.countVal}>{data?.tableCounts?.faculty_count ?? 0}</Text>
            </View>
            <View style={styles.countBox}>
              <Text style={styles.countLabel}>Admins</Text>
              <Text style={styles.countVal}>{data?.tableCounts?.admin_count ?? 0}</Text>
            </View>
          </View>

          {/* Record Items */}
          <Text style={styles.sectionHeader}>Latest Database Tuples</Text>
          {data?.records && data.records.length > 0 ? (
            data.records.slice(0, 10).map((r, i) => (
              <View key={i} style={styles.recordItem}>
                <View style={styles.recordHeader}>
                  <Text style={styles.recordUsername}>{r.username}</Text>
                  <View style={styles.roleTag}>
                    <Text style={styles.roleTagText}>{r.baseRole}</Text>
                  </View>
                </View>
                <Text style={styles.recordName}>
                  {r.fullNameDecrypted || '<Decrypted Name>'}
                </Text>
                <View style={styles.tupleRow}>
                  <Text style={styles.tupleText}>xmin: {r.pg_xmin || '—'}</Text>
                  <Text style={styles.tupleText}>ctid: {r.pg_ctid || '—'}</Text>
                  <Text style={styles.tupleText}>Logins: {r.loginCount ?? 0}</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No user records found.</Text>
          )}
        </View>
      )}
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
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
  },
  refreshBtn: {
    backgroundColor: '#FBFBFC',
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  refreshText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textBody,
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
  content: {
    gap: 10,
  },
  gridCounts: {
    flexDirection: 'row',
    gap: 6,
  },
  countBox: {
    flex: 1,
    backgroundColor: '#FBFBFC',
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    borderRadius: 10,
    padding: 8,
    alignItems: 'center',
  },
  countLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
  },
  countVal: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    marginTop: 6,
  },
  recordItem: {
    backgroundColor: '#FBFBFC',
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    borderRadius: 12,
    padding: 10,
  },
  recordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recordUsername: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'monospace',
    color: Colors.textPrimary,
  },
  roleTag: {
    backgroundColor: Colors.surfaceDark,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  roleTagText: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.textInverse,
  },
  recordName: {
    fontSize: 12,
    color: Colors.textBody,
    marginTop: 2,
  },
  tupleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.hairlineBorder,
  },
  tupleText: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: Colors.textMuted,
  },
  emptyText: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    marginVertical: 10,
  },
});

