import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Colors from '../theme/colors';

export default function DbReceiptCard({
  receipt,
  title = 'PostgreSQL Live Audit Telemetry',
}) {
  if (!receipt) return null;

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
            <Text style={styles.metaValue}>{receipt.pgTransactionId}</Text>
          </View>
        ) : null}

        {receipt.physicalDiskTuple ? (
          <View style={styles.col}>
            <Text style={styles.metaLabel}>Disk Tuple (ctid)</Text>
            <Text style={styles.metaValue}>{receipt.physicalDiskTuple}</Text>
          </View>
        ) : null}

        {receipt.loginCount !== undefined ? (
          <View style={styles.col}>
            <Text style={styles.metaLabel}>Login Count</Text>
            <Text style={styles.metaValue}>{receipt.loginCount}</Text>
          </View>
        ) : null}

        {receipt.storedInTables ? (
          <View style={styles.col}>
            <Text style={styles.metaLabel}>Relational Tables</Text>
            <Text style={[styles.metaValue, { color: Colors.statusEmerald }]}>
              {Array.isArray(receipt.storedInTables)
                ? receipt.storedInTables.join(' & ')
                : receipt.storedInTables}
            </Text>
          </View>
        ) : null}

        {receipt.lastLoginAt ? (
          <View style={[styles.col, { width: '100%' }]}>
            <Text style={styles.metaLabel}>Last Login Audit Timestamp</Text>
            <Text style={[styles.metaValue, { fontSize: 11 }]}>
              {new Date(receipt.lastLoginAt).toLocaleString()}
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
