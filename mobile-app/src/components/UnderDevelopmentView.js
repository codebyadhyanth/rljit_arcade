import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Colors from '../theme/colors';

export default function UnderDevelopmentView({
  moduleName = 'Institutional Service',
  phase = 'Phase 2',
  description = 'This service module is architected in the RLJIT Arcade blueprint and scheduled for activation once its respective backend controller and PostgreSQL schema are mounted.',
  onBack,
}) {
  return (
    <View style={styles.card}>
      {onBack && (
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={styles.backBtnText}>← Back to Services Catalog</Text>
        </TouchableOpacity>
      )}

      <View style={styles.badge}>
        <Text style={styles.badgeText}>Scheduled for {phase}</Text>
      </View>

      <Text style={styles.title}>{moduleName}</Text>
      <Text style={styles.desc}>{description}</Text>

      <View style={styles.guaranteeBox}>
        <Text style={styles.guaranteeTitle}>Architectural Guarantee</Text>
        <Text style={styles.guaranteeText}>
          Per the Autonomous Agent Governance Protocol, interactive features are only activated
          when backed by verified, persistent PostgreSQL controllers. No simulated or mock data
          is permitted.
        </Text>
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
    padding: 18,
    marginVertical: 8,
  },
  backBtn: {
    marginBottom: 12,
  },
  backBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.brandOrange,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.brandOrangeLight,
    borderColor: '#FED7AA',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    marginBottom: 10,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.brandOrange,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  desc: {
    fontSize: 13,
    color: Colors.textBody,
    lineHeight: 18,
    marginBottom: 14,
  },
  guaranteeBox: {
    backgroundColor: '#FBFBFC',
    borderColor: Colors.hairlineBorder,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  guaranteeTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  guaranteeText: {
    fontSize: 11,
    color: Colors.textMuted,
    lineHeight: 16,
  },
});

