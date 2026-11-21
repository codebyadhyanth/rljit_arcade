import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import DashboardView from '../views/DashboardView';
import ServicesView from '../views/ServicesView';
import DirectoryView from '../views/DirectoryView';
import RbacVerificationShell from './RbacVerificationShell';
import {
  LayoutDashboard,
  Layers,
  Search,
  ShieldCheck,
  LogOut,
  GraduationCap,
  ChevronDown,
  Menu,
  X,
} from 'lucide-react';

export default function PortalHome() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'services' | 'directory' | 'profile'
  const [initialTool, setInitialTool] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [topSearchQuery, setTopSearchQuery] = useState('');

  const handleSignOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const navigateToService = (tab, tool) => {
    setActiveTab(tab);
    setInitialTool(tool);
  };

  // Keyboard shortcut: Cmd+K / Ctrl+K opens Directory search
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setActiveTab('directory');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleTopSearchSubmit = (e) => {
    e.preventDefault();
    setActiveTab('directory');
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
    <div className="min-h-screen bg-[#F4F4F6] flex flex-col text-zinc-900 font-sans selection:bg-orange-100 selection:text-orange-900">
      {/* ─── TOP HEADER BAR (Replicating CampusHub Top Bar) ─── */}
      <header className="h-16 bg-white border-b border-[#EBEBEF] px-4 sm:px-6 lg:px-8 flex items-center justify-between sticky top-0 z-30">
        {/* Left: Brand Icon & Title */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab('dashboard')}
            className="flex items-center gap-2.5 group focus:outline-none"
          >
            <div className="w-9 h-9 rounded-xl bg-[#EA580C] text-white flex items-center justify-center font-bold text-sm shadow-sm group-hover:bg-orange-700 transition">
              <GraduationCap size={20} />
            </div>
            <div className="text-left">
              <h1 className="text-sm font-extrabold tracking-tight text-zinc-900 leading-none">
                RLJIT Arcade
              </h1>
              <span className="text-[10px] text-zinc-400 font-medium tracking-wide">
                CampusHub Edition
              </span>
            </div>
          </button>
        </div>

        {/* Center: Global Search Bar (CampusHub Pill with ⌘ K) */}
        <form
          onSubmit={handleTopSearchSubmit}
          className="hidden md:flex items-center w-full max-w-md mx-6"
        >
          <div className="relative w-full">
            <Search
              size={15}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
            />
            <input
              type="text"
              value={topSearchQuery}
              onChange={(e) => setTopSearchQuery(e.target.value)}
              placeholder="Search anything..."
              className="w-full bg-[#F4F4F6] hover:bg-zinc-100 focus:bg-white text-xs text-zinc-800 placeholder-zinc-400 pl-10 pr-14 py-2 rounded-2xl border border-transparent focus:border-[#EBEBEF] focus:outline-none transition shadow-none"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-0.5 pointer-events-none">
              <span className="text-[10px] font-mono text-zinc-400 bg-white border border-[#EBEBEF] px-1.5 py-0.5 rounded shadow-2xs">
                ⌘ K
              </span>
            </div>
          </div>
        </form>

        {/* Right: Notifications & User Avatar Profile Chip */}
        <div className="flex items-center gap-3 sm:gap-4">
          {/* User Profile Chip with Dropdown */}
          <div className="relative">
            <button
              onClick={() => setUserDropdownOpen(!userDropdownOpen)}
              className="flex items-center gap-2.5 p-1 sm:pr-2.5 rounded-full sm:rounded-2xl hover:bg-zinc-50 border border-transparent hover:border-[#EBEBEF] transition"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-zinc-800 to-zinc-950 text-white flex items-center justify-center text-xs font-bold border border-zinc-700 shadow-2xs">
                {userInitials}
              </div>
              <div className="hidden sm:block text-left">
                <div className="text-xs font-bold text-zinc-900 leading-tight truncate max-w-[120px]">
                  {userDisplayName}
                </div>
                <div className="text-[10px] font-medium text-zinc-400 capitalize">
                  {user?.baseRole ? user.baseRole.toLowerCase() : 'student'}
                </div>
              </div>
              <ChevronDown size={13} className="hidden sm:block text-zinc-400 ml-0.5" />
            </button>

            {/* Dropdown Menu */}
            {userDropdownOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white border border-[#EBEBEF] rounded-2xl p-2 shadow-lg z-40 space-y-1">
                <div className="px-3 py-2 border-b border-[#EBEBEF]">
                  <p className="text-xs font-bold text-zinc-900 truncate">{userDisplayName}</p>
                  <p className="text-[11px] font-mono text-zinc-400 truncate">{user?.username}</p>
                  <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[9px] font-semibold bg-orange-50 text-[#EA580C] border border-orange-200">
                    {user?.adminTier || user?.baseRole}
                  </span>
                </div>

                <button
                  onClick={() => {
                    setActiveTab('profile');
                    setUserDropdownOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-zinc-700 hover:text-zinc-900 hover:bg-zinc-50 rounded-xl transition text-left"
                >
                  <ShieldCheck size={14} className="text-zinc-400" />
                  <span>Institutional Profile</span>
                </button>

                <button
                  onClick={() => {
                    setUserDropdownOpen(false);
                    handleSignOut();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl transition text-left"
                >
                  <LogOut size={14} />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>

          {/* Mobile Menu Toggle Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-zinc-600 hover:text-zinc-900 rounded-xl hover:bg-zinc-100"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {/* ─── MOBILE DRAWER MENU ─── */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-[#141E2B] border-b border-white/10 p-4 space-y-2 z-20">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                  isActive ? 'bg-[#303a48] text-white' : 'text-slate-300 hover:bg-white/10'
                }`}
              >
                <Icon size={16} className={isActive ? 'text-[#EA580C]' : 'text-zinc-400'} />
                <span>{item.label}</span>
              </button>
            );
          })}
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50"
          >
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      )}

      {/* ─── BODY CONTAINER (SIDEBAR + MAIN BENTO CONTENT) ─── */}
      <div className="flex-1 flex flex-col md:flex-row max-w-[1600px] w-full mx-auto">
        {/* DESKTOP SIDEBAR */}
        <aside className="hidden md:flex flex-col w-60 p-5 shrink-0 justify-between bg-[#141E2B] text-white min-h-[calc(100vh-4rem)]">
          <div className="space-y-4">
            {/* Sidebar Navigation */}
            <nav className="space-y-1.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      if (item.id === 'services' && activeTab !== 'services') {
                        setInitialTool(null);
                      }
                    }}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-[#303a48] text-white shadow-sm'
                        : 'text-slate-300 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon size={17} className={isActive ? 'text-orange-300' : 'text-slate-400'} />
                      <span>{item.label}</span>
                    </div>
                  </button>
                );
              })}
            </nav>
          </div>

          <button onClick={handleSignOut} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white"><LogOut size={16}/><span>Sign Out</span></button>
        </aside>

        {/* MAIN BENTO CANVAS */}
        <main className="flex-1 p-4 sm:p-6 lg:p-7 overflow-y-auto w-full">
          {activeTab === 'dashboard' && <DashboardView onNavigateTab={navigateToService} />}
          {activeTab === 'services' && <ServicesView initialTool={initialTool} />}
          {activeTab === 'directory' && <DirectoryView />}
          {activeTab === 'profile' && <RbacVerificationShell />}
        </main>
      </div>
    </div>
  );
}
