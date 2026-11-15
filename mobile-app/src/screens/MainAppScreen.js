import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Platform,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import Colors from '../theme/colors';
import DashboardScreen from './DashboardScreen';
import ServicesScreen from './ServicesScreen';
import DirectoryScreen from './DirectoryScreen';
import RbacVerificationShell from './RbacVerificationShell';
import {
  LayoutDashboard,
  Layers,
  Search,
  ShieldCheck,
  Bell,
  GraduationCap,
} from 'lucide-react-native';

export default function MainAppScreen({ navigation }) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'services' | 'directory' | 'profile'
  const [initialTool, setInitialTool] = useState(null);

  const navigateToService = (tab, tool) => {
    setActiveTab(tab);
    setInitialTool(tool);
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'services', label: 'Services', icon: Layers },
    { id: 'directory', label: 'Directory', icon: Search },
    { id: 'profile', label: 'Profile', icon: ShieldCheck },
  ];

  const userDisplayName = user?.fullName || user?.username || 'Authorized User';
  const userInitials = (user?.fullName || user?.username || 'U')
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* ─── TOP APP BAR (Replicating CampusHub Header) ─── */}
      <View style={styles.topBar}>
        {/* Brand Left */}
        <TouchableOpacity
          style={styles.topBarBrand}
          onPress={() => setActiveTab('dashboard')}
          activeOpacity={0.8}
        >
          <View style={styles.brandIcon}>
            <GraduationCap size={18} color="#FFFFFF" />
          </View>
          <View>
            <Text style={styles.brandTitle}>RLJIT Arcade</Text>
            <Text style={styles.brandSubTitle}>CampusHub Edition</Text>
          </View>
        </TouchableOpacity>

        {/* Right Controls: Bell & Avatar */}
        <View style={styles.topBarActions}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => setActiveTab('profile')}
            activeOpacity={0.7}
          >
            <Bell size={18} color={Colors.textBody} />
            <View style={styles.unreadDot} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.avatarBtn}
            onPress={() => setActiveTab('profile')}
            activeOpacity={0.8}
          >
            <Text style={styles.avatarText}>{userInitials}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── SCREEN CONTAINER ─── */}
      <View style={styles.screenContainer}>
        {activeTab === 'dashboard' && <DashboardScreen onNavigateTab={navigateToService} />}
        {activeTab === 'services' && <ServicesScreen initialTool={initialTool} />}
        {activeTab === 'directory' && <DirectoryScreen />}
        {activeTab === 'profile' && <RbacVerificationShell navigation={navigation} />}
      </View>

      {/* ─── BOTTOM TAB BAR (Pill active styling) ─── */}
      <View style={styles.bottomTabBar}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.tabButton, isActive && styles.tabButtonActive]}
              onPress={() => {
                setActiveTab(item.id);
                if (item.id === 'services' && activeTab !== 'services') {
                  setInitialTool(null);
                }
              }}
              activeOpacity={0.8}
            >
              <Icon
                size={18}
                color={isActive ? '#FFFFFF' : Colors.textMuted}
                strokeWidth={isActive ? 2.2 : 1.8}
              />
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.canvasBg,
  },
  topBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.surfaceCard,
    borderBottomWidth: 1,
    borderBottomColor: Colors.hairlineBorder,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'between',
  },
  topBarBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  brandIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.brandOrange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.2,
  },
  brandSubTitle: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#F4F4F6',
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.brandOrange,
    position: 'absolute',
    top: 7,
    right: 7,
  },
  avatarBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.surfaceDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  screenContainer: {
    flex: 1,
  },
  bottomTabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceCard,
    borderTopWidth: 1,
    borderTopColor: Colors.hairlineBorder,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 6,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tabButtonActive: {
    backgroundColor: Colors.surfaceDark,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  tabLabelActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
