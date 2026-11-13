import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import Colors from '../theme/colors';
import DbReceiptCard from '../components/DbReceiptCard';
import MaskedField from '../components/MaskedField';

export default function RbacVerificationShell({ navigation }) {
  const { user, auditReceipt, redirectUrl, logout } = useAuth();

  const handleSignOut = async () => {
    await logout();
    navigation.replace('Login');
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerContainer}>
          <Text style={styles.noSessionText}>No active session found.</Text>
          <TouchableOpacity
            style={styles.signOutBtn}
            onPress={() => navigation.replace('Login')}
          >
            <Text style={styles.signOutText}>Go to Login</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const subRolesList = Array.isArray(user.subRoles) ? user.subRoles : [];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header */}
        <View style={styles.header}>
          <View>
            <View style={styles.titleRow}>
              <Text style={styles.appTitle}>RLJIT Arcade</Text>
              <View style={styles.liveBadge}>
                <Text style={styles.liveBadgeText}>Live Session</Text>
              </View>
            </View>
            <Text style={styles.subtitle}>
              RBAC Session Gateway • Zero Mock Data
            </Text>
          </View>

          <TouchableOpacity
            onPress={handleSignOut}
            style={styles.signOutBtn}
            activeOpacity={0.85}
          >
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        {/* Master RBAC Session Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Verified Identity & Role Scope</Text>
            <Text style={styles.cardCaption}>
              Argon2id authenticated session details from live PostgreSQL.
            </Text>
          </View>

          {/* Primary Meta Grid */}
          <View style={styles.metaRow}>
            <View style={styles.metaBox}>
              <Text style={styles.metaLabel}>Institutional ID</Text>
              <Text style={styles.metaValueMono}>{user.username}</Text>
            </View>
            <View style={styles.metaBox}>
              <Text style={styles.metaLabel}>Role Tier</Text>
              <View style={styles.badgeRow}>
                <View style={styles.roleBadge}>
                  <Text style={styles.roleBadgeText}>{user.baseRole}</Text>
                </View>
                {user.adminTier ? (
                  <View style={styles.tierBadge}>
                    <Text style={styles.tierBadgeText}>{user.adminTier}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          {/* Scope / Department */}
          <View style={styles.scopeBox}>
            <Text style={styles.metaLabel}>Assigned Scope</Text>
            <Text style={styles.scopeValue}>
              {user.department
                ? `Department: ${user.department}`
                : user.sectionCode
                ? `Section: ${user.sectionCode}`
                : 'Global Institutional Scope'}
            </Text>
          </View>

          {/* PII Masked Fields */}
          <View style={styles.piiSection}>
            <MaskedField
              label="Full Name (AES-256 Decrypted)"
              value={user.fullName}
              mono={false}
            />
            <MaskedField
              label="Institutional Email"
              value={user.email}
              mono={false}
            />
            <MaskedField
              label="Contact Phone"
              value={user.phone}
              mono={true}
            />
          </View>

          {/* Route Matching */}
          <View style={styles.routeBox}>
            <Text style={styles.metaLabel}>Backend Computed redirectUrl</Text>
            <Text style={styles.routeText}>{redirectUrl || 'N/A'}</Text>
          </View>

          {/* Sub-Roles */}
          <View style={styles.subRolesContainer}>
            <Text style={styles.metaLabel}>Assigned Sub-Roles</Text>
            <View style={styles.chipRow}>
              {subRolesList.length > 0 ? (
                subRolesList.map((sr, idx) => (
                  <View key={idx} style={styles.chip}>
                    <Text style={styles.chipText}>{sr}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyText}>None</Text>
              )}
            </View>
          </View>

          {/* PostgreSQL Audit Receipt */}
          <DbReceiptCard receipt={auditReceipt} />

          {/* Under-Development Scope Notice */}
          <View style={styles.scopeNotice}>
            <Text style={styles.scopeNoticeTitle}>
              Phase 1 Verification Complete
            </Text>
            <Text style={styles.scopeNoticeText}>
              Your role scope has been verified against the live PostgreSQL database.
              Dashboard modules will unlock in Phase 2 as respective backend
              controllers are connected.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.canvasBg,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  noSessionText: {
    fontSize: 14,
    color: Colors.textMuted,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surfaceCard,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  appTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  liveBadge: {
    backgroundColor: Colors.statusEmeraldBg,
    borderColor: '#A7F3D0',
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  liveBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.statusEmerald,
  },
  subtitle: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  signOutBtn: {
    backgroundColor: Colors.surfaceDark,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  signOutText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textInverse,
  },
  card: {
    backgroundColor: Colors.surfaceCard,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    borderRadius: 20,
    padding: 18,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  cardHeader: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.hairlineBorder,
    paddingBottom: 12,
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  cardCaption: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  metaBox: {
    flex: 1,
    backgroundColor: '#FBFBFC',
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    borderRadius: 12,
    padding: 12,
  },
  metaLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  metaValueMono: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 4,
    flexWrap: 'wrap',
  },
  roleBadge: {
    backgroundColor: Colors.surfaceDark,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textInverse,
  },
  tierBadge: {
    backgroundColor: Colors.brandOrangeLight,
    borderWidth: 1,
    borderColor: '#FED7AA',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  tierBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.brandOrange,
  },
  scopeBox: {
    backgroundColor: '#FBFBFC',
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  scopeValue: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  piiSection: {
    marginBottom: 10,
  },
  routeBox: {
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  routeText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.statusEmerald,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  subRolesContainer: {
    backgroundColor: '#FBFBFC',
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  chip: {
    backgroundColor: '#F4F4F6',
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textBody,
  },
  emptyText: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  scopeNotice: {
    backgroundColor: Colors.brandOrangeLight,
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 14,
    padding: 14,
    marginTop: 8,
  },
  scopeNoticeTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9A3412',
    marginBottom: 2,
  },
  scopeNoticeText: {
    fontSize: 11,
    color: '#C2410C',
    lineHeight: 16,
  },
});

