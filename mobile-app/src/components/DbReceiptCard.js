import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Colors from '../theme/colors';

export default function DbReceiptCard({
  receipt,
  title = 'PostgreSQL Live Audit Telemetry',
}) {
  if (!receipt) return null;

  const tablesValue = Array.isArray(receipt.storedInTables)
    ? receipt.storedInTables.join(' & ')
    : receipt.storedInTables || receipt.storedInTable || null;

  const timestampValue = receipt.lastLoginAt || receipt.timestamp || null;
  const countValue = receipt.committedCount ?? receipt.count;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Live DB Confirmed</Text>
        </View>
      </View>

      <View style={styles.grid}>
        {receipt.pgTransactionId ? (
          <View style={styles.col}>
            <Text style={styles.metaLabel}>PG Transaction (xmin)</Text>
            <Text style={styles.metaValue}>{String(receipt.pgTransactionId)}</Text>
          </View>
        ) : null}

        {receipt.physicalDiskTuple ? (
          <View style={styles.col}>
            <Text style={styles.metaLabel}>Disk Tuple (ctid)</Text>
            <Text style={styles.metaValue}>{String(receipt.physicalDiskTuple)}</Text>
          </View>
        ) : null}

        {receipt.loginCount !== undefined ? (
          <View style={styles.col}>
            <Text style={styles.metaLabel}>Login Count</Text>
            <Text style={styles.metaValue}>{String(receipt.loginCount)}</Text>
          </View>
        ) : null}

        {countValue !== undefined ? (
          <View style={styles.col}>
            <Text style={styles.metaLabel}>Rows Persisted</Text>
            <Text style={styles.metaValue}>{String(countValue)}</Text>
          </View>
        ) : null}

        {tablesValue ? (
          <View style={[styles.col, { width: '100%' }]}>
            <Text style={styles.metaLabel}>Relational Table(s)</Text>
            <Text style={[styles.metaValue, { color: Colors.statusEmerald }]}>
              {tablesValue}
            </Text>
          </View>
        ) : null}

        {timestampValue ? (
          <View style={[styles.col, { width: '100%' }]}>
            <Text style={styles.metaLabel}>
              {receipt.lastLoginAt ? 'Last Login Audit Timestamp' : 'Commit Timestamp'}
            </Text>
            <Text style={[styles.metaValue, { fontSize: 11 }]}>
              {new Date(timestampValue).toLocaleString()}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FAFAFA',
    borderColor: Colors.hairlineBorder,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginVertical: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomColor: Colors.hairlineBorder,
    borderBottomWidth: 1,
    paddingBottom: 8,
    marginBottom: 10,
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
    flex: 1,
    paddingRight: 8,
  },
  badge: {
    backgroundColor: Colors.statusEmeraldBg,
    borderColor: '#A7F3D0',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.statusEmerald,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
  },
  col: {
    width: '48%',
    backgroundColor: Colors.surfaceCard,
    borderColor: Colors.hairlineBorder,
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
  },
  metaLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textMuted,
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
});
