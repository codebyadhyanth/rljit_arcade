import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
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

  const counts = data?.liveTableCounts || {};
  const countEntries = Object.entries(counts);

  return (
    <View style={styles.card}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={styles.backBtnText}>← Back to Services</Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Cryptographic DB Ledger</Text>
          <Text style={styles.subtitle}>
            Live PostgreSQL table counts & physical tuple coordinates (xmin / ctid)
          </Text>
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
          {/* Live Table Counts */}
          <Text style={styles.sectionHeader}>
            Live PostgreSQL Table Counts ({countEntries.length} tables)
          </Text>
          <View style={styles.gridCounts}>
            {countEntries.map(([table, count]) => (
              <View key={table} style={styles.countBox}>
                <Text style={styles.countLabel} numberOfLines={1}>
                  {table.replace(/_/g, ' ')}
                </Text>
                <Text style={styles.countVal}>{count ?? 0}</Text>
              </View>
            ))}
          </View>

          {/* Latest Database Tuples */}
          <Text style={styles.sectionHeader}>
            Latest Database Tuples ({data?.recordsCount ?? data?.records?.length ?? 0})
          </Text>
          {Array.isArray(data?.records) && data.records.length > 0 ? (
            data.records.slice(0, 15).map((r, i) => {
              const meta = r.metadata || {};
              const preview = r.decryptedPreview || {};
              const proof = r.rawDatabaseProof || {};
              const linked = meta.linkedRoleRecord;

              return (
                <View key={meta.id || i} style={styles.recordItem}>
                  <View style={styles.recordHeader}>
                    <Text style={styles.recordUsername}>{meta.username || '—'}</Text>
                    <View style={styles.roleTag}>
                      <Text style={styles.roleTagText}>
                        {meta.admin_tier || meta.base_role || 'USER'}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.recordName}>
                    {preview.fullName || '<Decrypted Name Unavailable>'}
                  </Text>
                  <Text style={styles.recordScope}>
                    {[
                      meta.department ? `Dept: ${meta.department}` : null,
                      meta.section_code ? `Sec: ${meta.section_code}` : null,
                      linked ? `Linked: ${linked.table}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Global Scope'}
                  </Text>

                  {proof.passwordHashPrefix ? (
                    <Text style={styles.hashText} numberOfLines={1}>
                      Argon2id: {proof.passwordHashPrefix}
                    </Text>
                  ) : null}

                  <View style={styles.tupleRow}>
                    <Text style={styles.tupleText}>xmin: {meta.pg_xmin || '—'}</Text>
                    <Text style={styles.tupleText}>ctid: {meta.pg_ctid || '—'}</Text>
                    <Text style={styles.tupleText}>Logins: {meta.login_count ?? 0}</Text>
                  </View>
                </View>
              );
            })
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
    minHeight: 48,
    justifyContent: 'center',
    marginBottom: 8,
  },
  backBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.brandOrange,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  refreshBtn: {
    minHeight: 48,
    backgroundColor: '#FBFBFC',
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  refreshText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textBody,
  },
  errorBox: {
    backgroundColor: Colors.statusRoseBg,
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  errorText: {
    color: Colors.statusRose,
    fontSize: 12,
    fontWeight: '600',
  },
  content: { gap: 10 },
  gridCounts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  countBox: {
    width: '31%',
    flexGrow: 1,
    backgroundColor: '#FBFBFC',
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
  },
  countLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  countVal: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginTop: 3,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    marginTop: 6,
  },
  recordItem: {
    backgroundColor: '#FBFBFC',
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    borderRadius: 14,
    padding: 12,
    gap: 3,
  },
  recordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recordUsername: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  roleTag: {
    backgroundColor: Colors.surfaceDark,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  roleTagText: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.textInverse,
  },
  recordName: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textBody,
    marginTop: 2,
  },
  recordScope: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  hashText: {
    fontSize: 10,
    color: Colors.textMuted,
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
    fontWeight: '600',
    color: Colors.textMuted,
  },
  emptyText: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    marginVertical: 10,
  },
});
