import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import DashboardView from '../views/DashboardView';
import VenueCatalogPage from './venues/VenueCatalogPage';
import MyBookingsPage from './venues/MyBookingsPage';
import ApprovalQueuePage from './venues/ApprovalQueuePage';
import TimetablePage from './academics/TimetablePage';
import ClassSwapsPage from './academics/ClassSwapsPage';
import ManualAttendancePage from './academics/ManualAttendancePage';
import CieMarksPage from './academics/CieMarksPage';
import StudentAnalyzerPage from './academics/StudentAnalyzerPage';
import PlacementsPage from './portals/PlacementsPage';
import FinanceLedgerPage from './portals/FinanceLedgerPage';
import DocsVaultPage from './documents/DocsVaultPage';
import ChatbotPage from './ChatbotPage';
import ProvisionAuthorityTool from '../components/services/ProvisionAuthorityTool';
import StudentProvisioningTool from '../components/services/StudentProvisioningTool';
import DirectoryView from '../views/DirectoryView';
import DbLedgerTool from '../components/services/DbLedgerTool';
import DbDiagnosticsTool from '../components/services/DbDiagnosticsTool';
import RbacVerificationShell from './RbacVerificationShell';
import {
  LayoutDashboard,
  Building2,
  GraduationCap,
  Briefcase,
  Shield,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Search,
  LogOut,
  Menu,
  X,
  Calendar,
  FileText,
  ClipboardCheck,
  Clock,
  ArrowRightLeft,
  CheckSquare,
  Award,
  BarChart3,
  Bot,
  FolderOpen,
  Landmark,
  UserPlus,
  Users,
  Database,
  Activity,
} from 'lucide-react';

export default function PortalHome() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [activeView, setActiveView] = useState('dashboard');
  const [expandedGroups, setExpandedGroups] = useState({
    venues: true,
    academics: true,
    portals: true,
    administration: false,
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const baseRole = user?.baseRole || '';
  const adminTier = user?.adminTier || '';
  const sectionCode = String(user?.sectionCode || '').trim().toUpperCase();
  const subRoles = Array.isArray(user?.subRoles) ? user.subRoles : [];

  const isSuperAdmin = adminTier === 'SUPER_ADMIN';
  const isHod = isSuperAdmin || adminTier === 'HOD_ADMIN' || subRoles.includes('HOD');
  const isManagement = isSuperAdmin || sectionCode === 'MGT' || subRoles.includes('MANAGEMENT');
  const isPrincipal =
    isSuperAdmin ||
    sectionCode === 'PRN' ||
    sectionCode === 'PRINCIPAL' ||
    subRoles.includes('PRINCIPAL');
  const isAdmission = sectionCode === 'ADM';
  const isFaculty = baseRole === 'FACULTY';
  const isAdmin = baseRole === 'ADMIN';
  const isStudent = baseRole === 'STUDENT';

  const canApproveVenues = isSuperAdmin || isHod || isManagement || isPrincipal;
  const canClassSwaps = isSuperAdmin || isFaculty || isHod;
  const canAccessAttendanceAndCie =
    isStudent ||
    isSuperAdmin ||
    isHod ||
    isFaculty ||
    isPrincipal ||
    isManagement ||
    sectionCode === 'EXM';
  const canAccessAnalyzer = isSuperAdmin || isHod || isFaculty;
  const canSeeAdministration = isSuperAdmin || isHod || isFaculty || isAdmin;

  const navConfig = useMemo(() => {
    const groups = [
      {
        id: 'dashboard',
        type: 'single',
        label: 'Dashboard',
        view: 'dashboard',
        icon: LayoutDashboard,
      },
      {
        id: 'venues',
        type: 'group',
        label: 'Venues',
        icon: Building2,
        children: [
          {
            label: 'Venue Catalog',
            view: 'venue-catalog',
            icon: Calendar,
            visible: true,
          },
          {
            label: 'My Bookings',
            view: 'venue-bookings',
            icon: FileText,
            visible: true,
          },
          {
            label: 'Approval Queue',
            view: 'venue-approvals',
            icon: ClipboardCheck,
            visible: canApproveVenues,
          },
        ].filter((item) => item.visible),
      },
      {
        id: 'academics',
        type: 'group',
        label: 'Academics',
        icon: GraduationCap,
        children: [
          {
            label: 'Timetable',
            view: 'timetable',
            icon: Clock,
            visible: true,
          },
          {
            label: 'Class Swaps',
            view: 'class-swaps',
            icon: ArrowRightLeft,
            visible: canClassSwaps,
          },
          {
            label: 'Manual Attendance',
            view: 'attendance',
            icon: CheckSquare,
            visible: canAccessAttendanceAndCie,
          },
          {
            label: 'CIE Marks',
            view: 'cie-marks',
            icon: Award,
            visible: canAccessAttendanceAndCie,
          },
          {
            label: 'Student Analyzer',
            view: 'student-analyzer',
            icon: BarChart3,
            visible: canAccessAnalyzer,
          },
        ].filter((item) => item.visible),
      },
      {
        id: 'portals',
        type: 'group',
        label: 'Portals',
        icon: Briefcase,
        children: [
          {
            label: 'Placements',
            view: 'placements',
            icon: Briefcase,
            visible: true,
          },
          {
            label: 'Finance Ledger',
            view: 'finance',
            icon: Landmark,
            visible:
              isStudent ||
              isSuperAdmin ||
              isHod ||
              isManagement ||
              isPrincipal ||
              sectionCode === 'ACC' ||
              sectionCode === 'EXM',
          },
          {
            label: 'Docs & Notes',
            view: 'docs-vault',
            icon: FolderOpen,
            visible: true,
          },
        ].filter((item) => item.visible),
      },
    ];

    if (canSeeAdministration) {
      groups.push({
        id: 'administration',
        type: 'group',
        label: 'Administration',
        icon: Shield,
        children: [
          {
            label: 'Provision Authority',
            view: 'admin-authority',
            icon: UserPlus,
            visible: isSuperAdmin,
          },
          {
            label: 'Provision Student',
            view: 'admin-student',
            icon: GraduationCap,
            visible: isSuperAdmin || isHod || isAdmission,
          },
          {
            label: 'User Directory',
            view: 'admin-directory',
            icon: Users,
            visible: isSuperAdmin || isHod || isFaculty || isAdmin,
          },
          {
            label: 'DB Ledger',
            view: 'admin-db-ledger',
            icon: Database,
            visible: isSuperAdmin,
          },
          {
            label: 'DB Diagnostics',
            view: 'admin-db-diag',
            icon: Activity,
            visible: isSuperAdmin,
          },
        ].filter((item) => item.visible),
      });
    }

    groups.push({
      id: 'chatbot',
      type: 'single',
      label: 'AI Chatbot',
      view: 'chatbot',
      icon: Bot,
    });

    groups.push({
      id: 'profile',
      type: 'single',
      label: 'My Profile',
      view: 'profile',
      icon: ShieldCheck,
    });

    return groups;
  }, [
    canApproveVenues,
    canClassSwaps,
    canAccessAttendanceAndCie,
    canAccessAnalyzer,
    canSeeAdministration,
    isSuperAdmin,
    isHod,
    isAdmission,
    isFaculty,
    isAdmin,
    isStudent,
    isManagement,
    isPrincipal,
    sectionCode,
  ]);

  const selectView = useCallback((viewId) => {
    setActiveView(viewId);
    setMobileMenuOpen(false);
    if (['venue-catalog', 'venue-bookings', 'venue-approvals'].includes(viewId)) {
      setExpandedGroups((prev) => ({ ...prev, venues: true }));
    } else if (
      ['timetable', 'class-swaps', 'attendance', 'cie-marks', 'student-analyzer'].includes(viewId)
    ) {
      setExpandedGroups((prev) => ({ ...prev, academics: true }));
    } else if (['placements', 'finance', 'docs-vault'].includes(viewId)) {
      setExpandedGroups((prev) => ({ ...prev, portals: true }));
    } else if (
      [
        'admin-authority',
        'admin-student',
        'admin-directory',
        'admin-db-ledger',
        'admin-db-diag',
      ].includes(viewId)
    ) {
      setExpandedGroups((prev) => ({ ...prev, administration: true }));
    }
  }, []);

  const toggleGroup = (groupId) => {
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  // Keyboard shortcut: Cmd+K / Ctrl+K opens Directory for non-students
  useEffect(() => {
    if (isStudent) return undefined;
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        selectView('admin-directory');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isStudent, selectView]);

  const handleSignOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const handleDashboardNavigateTab = (tab, tool) => {
    if (tool === 'provision-authority') selectView('admin-authority');
    else if (tool === 'provision-student') selectView('admin-student');
    else if (tool === 'db-ledger') selectView('admin-db-ledger');
    else if (tool === 'db-diagnostics') selectView('admin-db-diag');
    else if (tab === 'services') selectView('venue-catalog');
    else if (tab === 'directory') selectView('admin-directory');
    else if (tab) selectView(tab);
  };

  const userDisplayName = user?.fullName || user?.username || 'Authorized User';
  const userInitials = (user?.fullName || user?.username || 'U')
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const roleScopeMeta = [
    user?.adminTier || user?.baseRole || 'USER',
    user?.department || null,
    user?.sectionCode || null,
  ]
    .filter(Boolean)
    .join(' / ');

  const renderSidebarNav = (isMobile = false) => (
    <nav className="space-y-1.5" aria-label={isMobile ? 'Mobile navigation' : 'Sidebar navigation'}>
      {navConfig.map((entry) => {
        const Icon = entry.icon;

        if (entry.type === 'single') {
          const isActive = activeView === entry.view;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => selectView(entry.view)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition ${
                isActive
                  ? 'bg-[#EA580C] text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <Icon
                size={16}
                className={isActive ? 'text-white shrink-0' : 'text-slate-400 shrink-0'}
              />
              <span>{entry.label}</span>
            </button>
          );
        }

        const isExpanded = Boolean(expandedGroups[entry.id]);
        const hasActiveChild = entry.children.some((c) => c.view === activeView);

        return (
          <div key={entry.id} className="space-y-1">
            <button
              type="button"
              onClick={() => toggleGroup(entry.id)}
              aria-expanded={isExpanded}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition ${
                hasActiveChild
                  ? 'bg-white/10 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon
                  size={16}
                  className={
                    hasActiveChild ? 'text-[#EA580C] shrink-0' : 'text-slate-400 shrink-0'
                  }
                />
                <span>{entry.label}</span>
              </div>
              {isExpanded ? (
                <ChevronDown size={14} className="text-slate-400" />
              ) : (
                <ChevronRight size={14} className="text-slate-400" />
              )}
            </button>

            {isExpanded && (
              <div className="ml-4 pl-3 border-l border-white/15 space-y-1 py-0.5">
                {entry.children.map((sub) => {
                  const SubIcon = sub.icon;
                  const isSubActive = activeView === sub.view;
                  return (
                    <button
                      key={sub.view}
                      type="button"
                      onClick={() => selectView(sub.view)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition text-left ${
                        isSubActive
                          ? 'bg-[#EA580C] text-white font-semibold shadow-sm'
                          : 'text-slate-300 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      <SubIcon
                        size={14}
                        className={
                          isSubActive ? 'text-white shrink-0' : 'text-slate-400 shrink-0'
                        }
                      />
                      <span className="truncate">{sub.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-[#F4F4F6] flex flex-col text-zinc-900 font-sans selection:bg-orange-100 selection:text-orange-900">
      {/* ─── TOP HEADER BAR ─── */}
      <header className="h-16 bg-white border-b border-[#EBEBEF] px-4 sm:px-6 lg:px-8 flex items-center justify-between sticky top-0 z-30">
        {/* Left: Brand & Mobile Hamburger */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-zinc-600 hover:text-zinc-900 rounded-xl hover:bg-zinc-100 transition"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          <button
            type="button"
            onClick={() => selectView('dashboard')}
            className="flex items-center gap-2.5 group focus:outline-none"
          >
            <div className="w-9 h-9 rounded-xl bg-[#EA580C] text-white flex items-center justify-center font-bold text-sm shadow-sm group-hover:bg-[#C2410C] transition">
              <GraduationCap size={20} />
            </div>
            <div className="text-left">
              <h1 className="text-sm font-extrabold tracking-tight text-zinc-900 leading-none">
                RLJIT Arcade
              </h1>
              <span className="text-[10px] text-zinc-400 font-medium tracking-wide">
                Institutional Portal
              </span>
            </div>
          </button>
        </div>

        {/* Center: Quick Search Shortcut to Directory (Ctrl+K for non-students) */}
        {!isStudent && (
          <div className="hidden md:flex items-center w-full max-w-md mx-6">
            <button
              type="button"
              onClick={() => selectView('admin-directory')}
              className="w-full flex items-center justify-between bg-[#F4F4F6] hover:bg-zinc-100 text-xs text-zinc-500 px-3.5 py-2 rounded-xl border border-[#EBEBEF] transition"
            >
              <span className="flex items-center gap-2.5">
                <Search size={14} className="text-zinc-400" />
                <span>Quick search institutional directory (USN, email, phone)...</span>
              </span>
              <span className="text-[10px] font-mono text-zinc-500 bg-white border border-[#EBEBEF] px-1.5 py-0.5 rounded">
                Ctrl+K
              </span>
            </button>
          </div>
        )}

        {/* Right: User Chip & Sign Out */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="relative">
            <button
              type="button"
              onClick={() => setUserDropdownOpen(!userDropdownOpen)}
              className="flex items-center gap-2.5 p-1 sm:pr-3 rounded-full sm:rounded-2xl hover:bg-zinc-50 border border-transparent hover:border-[#EBEBEF] transition"
            >
              <div className="w-8 h-8 rounded-full bg-[#1E293B] text-white flex items-center justify-center text-xs font-bold border border-slate-700">
                {userInitials}
              </div>
              <div className="hidden sm:block text-left">
                <div className="text-xs font-bold text-zinc-900 leading-tight truncate max-w-[160px]">
                  {userDisplayName}
                </div>
                <div className="text-[10px] font-semibold text-zinc-500 font-mono truncate max-w-[180px]">
                  {roleScopeMeta}
                </div>
              </div>
              <ChevronDown size={13} className="hidden sm:block text-zinc-400" />
            </button>

            {userDropdownOpen && (
              <div className="absolute right-0 mt-2 w-60 bg-white border border-[#EBEBEF] rounded-2xl p-2 shadow-lg z-40 space-y-1">
                <div className="px-3 py-2 border-b border-[#EBEBEF]">
                  <p className="text-xs font-bold text-zinc-900 truncate">
                    {userDisplayName}
                  </p>
                  <p className="text-[11px] font-mono text-zinc-500 truncate">
                    {user?.username}
                  </p>
                  <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[9px] font-semibold bg-orange-50 text-[#EA580C] border border-orange-200">
                    {roleScopeMeta}
                  </span>
                </div>

                {!isStudent && (
                  <button
                    type="button"
                    onClick={() => {
                      selectView('admin-directory');
                      setUserDropdownOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-zinc-700 hover:text-zinc-900 hover:bg-zinc-50 rounded-xl transition text-left"
                  >
                    <Search size={14} className="text-zinc-400" />
                    <span>User Directory</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    selectView('profile');
                    setUserDropdownOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-zinc-700 hover:text-zinc-900 hover:bg-zinc-50 rounded-xl transition text-left"
                >
                  <ShieldCheck size={14} className="text-zinc-400" />
                  <span>My Profile</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setUserDropdownOpen(false);
                    handleSignOut();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 rounded-xl transition text-left"
                >
                  <LogOut size={14} />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            className="hidden lg:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#EBEBEF] bg-white hover:bg-zinc-50 text-xs font-semibold text-zinc-700 transition"
          >
            <LogOut size={14} className="text-zinc-500" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* ─── MOBILE DRAWER NAVIGATION ─── */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-[#141E2B] border-b border-slate-700 p-4 space-y-4 z-20 text-white">
          {!isStudent && (
            <button
              type="button"
              onClick={() => selectView('admin-directory')}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/10 text-slate-200 text-xs font-medium"
            >
              <Search size={14} />
              <span>Directory Search</span>
            </button>
          )}
          {renderSidebarNav(true)}
          <div className="pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-rose-300 hover:bg-white/10 transition"
            >
              <LogOut size={15} />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}

      {/* ─── BODY CONTAINER (OXFORD NAVY SIDEBAR + MAIN CANVAS) ─── */}
      <div className="flex-1 flex flex-col md:flex-row max-w-[1600px] w-full mx-auto">
        {/* DESKTOP SIDEBAR */}
        <aside className="hidden md:flex flex-col w-64 p-4 shrink-0 justify-between bg-[#141E2B] text-white min-h-[calc(100vh-4rem)] border-r border-slate-800">
          <div className="space-y-4">
            <div className="px-2 pt-1 pb-2 border-b border-white/10">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                Institutional Navigation
              </p>
            </div>
            {renderSidebarNav(false)}
          </div>

          <div className="pt-4 border-t border-white/10 space-y-2">
            <div className="px-3 py-2 rounded-xl bg-white/5 text-[11px] text-slate-300">
              <p className="font-semibold text-white truncate">{userDisplayName}</p>
              <p className="font-mono text-[10px] text-slate-400 truncate mt-0.5">
                {roleScopeMeta}
              </p>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition"
            >
              <LogOut size={15} />
              <span>Sign Out</span>
            </button>
          </div>
        </aside>

        {/* MAIN WORKSPACE CANVAS */}
        <main className="flex-1 p-4 sm:p-6 lg:p-7 overflow-y-auto w-full min-w-0">
          {activeView === 'dashboard' && (
            <DashboardView
              onNavigate={(viewId) => selectView(viewId)}
              onNavigateTab={handleDashboardNavigateTab}
            />
          )}

          {/* Venues */}
          {activeView === 'venue-catalog' && (
            <VenueCatalogPage onNavigate={(viewId) => selectView(viewId)} />
          )}
          {activeView === 'venue-bookings' && (
            <MyBookingsPage onNavigate={(viewId) => selectView(viewId)} />
          )}
          {activeView === 'venue-approvals' && <ApprovalQueuePage />}

          {/* Academics */}
          {activeView === 'timetable' && <TimetablePage />}
          {activeView === 'class-swaps' && <ClassSwapsPage />}
          {activeView === 'attendance' && <ManualAttendancePage />}
          {activeView === 'cie-marks' && <CieMarksPage />}
          {activeView === 'student-analyzer' && <StudentAnalyzerPage />}

          {/* Portals */}
          {activeView === 'placements' && <PlacementsPage />}
          {activeView === 'finance' && <FinanceLedgerPage />}
          {activeView === 'docs-vault' && <DocsVaultPage />}

          {/* AI Chatbot */}
          {activeView === 'chatbot' && <ChatbotPage />}

          {/* Administration */}
          {activeView === 'admin-authority' && <ProvisionAuthorityTool />}
          {activeView === 'admin-student' && <StudentProvisioningTool />}
          {activeView === 'admin-directory' && <DirectoryView />}
          {activeView === 'admin-db-ledger' && <DbLedgerTool />}
          {activeView === 'admin-db-diag' && <DbDiagnosticsTool />}

          {/* Profile */}
          {activeView === 'profile' && <RbacVerificationShell />}
        </main>
      </div>
    </div>
  );
}
