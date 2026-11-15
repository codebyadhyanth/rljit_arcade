import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import Colors from '../theme/colors';
import ProvisionAuthorityTool from '../components/services/ProvisionAuthorityTool';
import StudentProvisioningTool from '../components/services/StudentProvisioningTool';
import DbLedgerTool from '../components/services/DbLedgerTool';
import DbDiagnosticsTool from '../components/services/DbDiagnosticsTool';
import UnderDevelopmentView from '../components/UnderDevelopmentView';

export default function ServicesScreen({ initialTool = null }) {
  const { user } = useAuth();
  const [activeTool, setActiveTool] = useState(initialTool);

  const isSuperAdmin = user?.adminTier === 'SUPER_ADMIN';
  const isHod =
    user?.adminTier === 'HOD_ADMIN' ||
    (Array.isArray(user?.subRoles) && user?.subRoles.includes('HOD'));
  const isAdmissionAdmin =
    user?.baseRole === 'ADMIN' && (user?.sectionCode === 'ADM' || isSuperAdmin);
  const isFaculty = user?.baseRole === 'FACULTY' || isHod;
  const isStudent = user?.baseRole === 'STUDENT';

  // In-place execution
  if (activeTool === 'provision-authority') {
    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ProvisionAuthorityTool onBack={() => setActiveTool(null)} />
      </ScrollView>
    );
  }
  if (activeTool === 'provision-student') {
    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <StudentProvisioningTool onBack={() => setActiveTool(null)} />
      </ScrollView>
    );
  }
  if (activeTool === 'db-ledger') {
    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <DbLedgerTool onBack={() => setActiveTool(null)} />
      </ScrollView>
    );
  }
  if (activeTool === 'db-diagnostics') {
    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <DbDiagnosticsTool onBack={() => setActiveTool(null)} />
      </ScrollView>
    );
  }
  if (typeof activeTool === 'object' && activeTool !== null) {
    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <UnderDevelopmentView
          moduleName={activeTool.title}
          phase={activeTool.phase}
          description={activeTool.description}
          onBack={() => setActiveTool(null)}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.headerCard}>
        <Text style={styles.headerTitle}>Department Services Hub</Text>
        <Text style={styles.headerSubtitle}>
          Role-authorized institutional workflows and administrative toolkits.
        </Text>
      </View>

      {/* ACTIVE LIVE SERVICES */}
      <Text style={styles.sectionHeader}>Live Active Services</Text>

      {isSuperAdmin && (
        <TouchableOpacity
          style={styles.serviceCard}
          onPress={() => setActiveTool('provision-authority')}
          activeOpacity={0.85}
        >
          <View style={styles.cardTopRow}>
            <Text style={styles.serviceTitle}>Provision Authority</Text>
            <View style={styles.liveTag}>
              <Text style={styles.liveTagText}>Active</Text>
            </View>
          </View>
          <Text style={styles.serviceDesc}>
            Issue credentials for Section Admins, Department HODs, or Faculty with dual-table persistence.
          </Text>
        </TouchableOpacity>
      )}

      {(isSuperAdmin || isHod || isAdmissionAdmin) && (
        <TouchableOpacity
          style={styles.serviceCard}
          onPress={() => setActiveTool('provision-student')}
          activeOpacity={0.85}
        >
          <View style={styles.cardTopRow}>
            <Text style={styles.serviceTitle}>
              {isHod ? 'Department Student Enrollment' : 'Multi-Branch Student Enrollment'}
            </Text>
            <View style={styles.liveTag}>
              <Text style={styles.liveTagText}>Active</Text>
            </View>
          </View>
          <Text style={styles.serviceDesc}>
            {isHod
              ? `Enroll Regular and Lateral students strictly within Department of ${user?.department || 'CS'}.`
              : 'Enroll Regular and Lateral Diploma students across all engineering branches.'}
          </Text>
        </TouchableOpacity>
      )}

      {isSuperAdmin && (
        <TouchableOpacity
          style={styles.serviceCard}
          onPress={() => setActiveTool('db-ledger')}
          activeOpacity={0.85}
        >
          <View style={styles.cardTopRow}>
            <Text style={styles.serviceTitle}>Cryptographic DB Ledger</Text>
            <View style={styles.liveTag}>
              <Text style={styles.liveTagText}>Active</Text>
            </View>
          </View>
          <Text style={styles.serviceDesc}>
            Inspect raw PostgreSQL table records, encrypted columns, and disk tuple coordinates.
          </Text>
        </TouchableOpacity>
      )}

      {(isSuperAdmin || isHod || isAdmissionAdmin) && (
        <TouchableOpacity
          style={styles.serviceCard}
          onPress={() => setActiveTool('db-diagnostics')}
          activeOpacity={0.85}
        >
          <View style={styles.cardTopRow}>
            <Text style={styles.serviceTitle}>Schema & Table Diagnostics</Text>
            <View style={styles.liveTag}>
              <Text style={styles.liveTagText}>Active</Text>
            </View>
          </View>
          <Text style={styles.serviceDesc}>
            Validate student, faculty, and admin table existence and PostgreSQL column schemas.
          </Text>
        </TouchableOpacity>
      )}

      {/* UPCOMING PHASE SERVICES */}
      <Text style={styles.sectionHeader}>Upcoming Scheduled Services</Text>

      {(isFaculty || isSuperAdmin) && (
        <>
          <TouchableOpacity
            style={styles.upcomingCard}
            onPress={() =>
              setActiveTool({
                title: 'Mark Period Attendance & WhatsApp Alert',
                phase: 'Phase 2',
                description:
                  'Real-time classroom period attendance recording with automated WhatsApp alert dispatches for absent students.',
              })
            }
            activeOpacity={0.85}
          >
            <View style={styles.cardTopRow}>
              <Text style={styles.serviceTitle}>Period Attendance & WhatsApp</Text>
              <View style={styles.phaseTag}>
                <Text style={styles.phaseTagText}>Phase 2</Text>
              </View>
            </View>
            <Text style={styles.serviceDesc}>
              Real-time classroom attendance logging with locked 23:59:59 EOD edit windows.
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.upcomingCard}
            onPress={() =>
              setActiveTool({
                title: 'Camera Attendance Sheet Scanner (Mobile Exclusive)',
                phase: 'Phase 2',
                description:
                  'Mobile-exclusive hardware camera scanner for physical classroom attendance paper sheets.',
              })
            }
            activeOpacity={0.85}
          >
            <View style={styles.cardTopRow}>
              <Text style={styles.serviceTitle}>Camera Attendance Scanner</Text>
              <View style={styles.phaseTag}>
                <Text style={styles.phaseTagText}>Mobile Only</Text>
              </View>
            </View>
            <Text style={styles.serviceDesc}>
              Hardware camera attendance register capture and optical mark verification.
            </Text>
          </TouchableOpacity>
        </>
      )}

      {(isStudent || isSuperAdmin) && (
        <TouchableOpacity
          style={styles.upcomingCard}
          onPress={() =>
            setActiveTool({
              title: 'Submit Leave Application',
              phase: 'Phase 2',
              description:
                'Digital leave request routed directly to your assigned Local Guardian (LG) faculty mentor.',
            })
          }
          activeOpacity={0.85}
        >
          <View style={styles.cardTopRow}>
            <Text style={styles.serviceTitle}>Submit Leave Application</Text>
            <View style={styles.phaseTag}>
              <Text style={styles.phaseTagText}>Phase 2</Text>
            </View>
          </View>
          <Text style={styles.serviceDesc}>
            Formal digital leave requests routed to assigned Local Guardian mentor.
          </Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  headerCard: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    padding: 16,
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    marginTop: 10,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  serviceCard: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    padding: 14,
    marginBottom: 10,
  },
  upcomingCard: {
    backgroundColor: '#FBFBFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    padding: 14,
    marginBottom: 10,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  serviceTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  liveTag: {
    backgroundColor: Colors.statusEmeraldBg,
    borderColor: '#A7F3D0',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  liveTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.statusEmerald,
  },
  phaseTag: {
    backgroundColor: Colors.brandOrangeLight,
    borderColor: '#FED7AA',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  phaseTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.brandOrange,
  },
  serviceDesc: {
    fontSize: 12,
    color: Colors.textBody,
    lineHeight: 16,
  },
});

