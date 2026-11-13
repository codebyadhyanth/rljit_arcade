import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import DbReceiptCard from '../components/DbReceiptCard';
import MaskedField from '../components/MaskedField';
import {
  ShieldCheck,
  LogOut,
  UserCheck,
  KeyRound,
  Building2,
  Layers,
  MapPin,
  Clock,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';

export default function RbacVerificationShell() {
  const { user, auditReceipt, redirectUrl, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F4F4F6] flex items-center justify-center p-4">
        <div className="bg-white border border-[#EBEBEF] rounded-2xl p-6 text-center max-w-sm w-full">
          <p className="text-sm text-zinc-600 mb-4">No active session found.</p>
          <button
            onClick={() => navigate('/login')}
            className="px-4 py-2 bg-[#121214] text-white rounded-xl text-xs font-semibold"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  // Format subRoles and permissions
  const subRolesList = Array.isArray(user.subRoles) ? user.subRoles : [];
  const permissionsList = Array.isArray(user.permissions) ? user.permissions : [];

  return (
    <div className="min-h-screen bg-[#F4F4F6] py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Top Header Bar */}
        <header className="bg-white border border-[#EBEBEF] rounded-2xl p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 bg-orange-50 border border-orange-200/80 rounded-2xl flex items-center justify-center text-[#EA580C]">
              <ShieldCheck size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-zinc-900 tracking-tight">
                  RLJIT Arcade — RBAC Session Gateway
                </h1>
                <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border border-emerald-200">
                  <CheckCircle2 size={12} /> Live Session Active
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">
                Target Route Verification View • Zero Dummy Data Mode
              </p>
            </div>
          </div>

          <button
            onClick={handleSignOut}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#121214] hover:bg-black text-white text-xs font-semibold rounded-xl shadow-sm transition-all duration-150 active:scale-[0.99]"
          >
            <LogOut size={14} />
            <span>Sign Out</span>
          </button>
        </header>

        {/* Master RBAC Session Verification Card */}
        <main className="bg-white border border-[#EBEBEF] rounded-2xl p-6 sm:p-8 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] space-y-6">
          <div className="border-b border-[#EBEBEF] pb-4">
            <h2 className="text-base font-semibold text-zinc-900 flex items-center gap-2">
              <UserCheck size={18} className="text-[#EA580C]" />
              <span>Cryptographic Identity & Authority Scope</span>
            </h2>
            <p className="text-xs text-zinc-500 mt-1">
              Live token claims and Argon2id authenticated session details directly from PostgreSQL.
            </p>
          </div>

          {/* Primary Identity Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Authenticated Username */}
            <div className="bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl p-4">
              <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1">
                Institutional ID / Username
              </span>
              <span className="font-mono text-base font-bold text-zinc-900">
                {user.username}
              </span>
            </div>

            {/* Base Role & Admin Tier */}
            <div className="bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl p-4">
              <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1">
                Role Classification
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-900 text-white">
                  {user.baseRole}
                </span>
                {user.adminTier && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 border border-orange-200">
                    {user.adminTier}
                  </span>
                )}
              </div>
            </div>

            {/* Scope / Department / Section */}
            <div className="bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl p-4">
              <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1">
                Scope / Department / Section
              </span>
              <span className="text-sm font-semibold text-zinc-800">
                {user.department
                  ? `Department: ${user.department}`
                  : user.sectionCode
                  ? `Section: ${user.sectionCode}`
                  : 'Global Scope (Institutional)'}
              </span>
            </div>
          </div>

          {/* PII Masked Fields */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <MaskedField
              label="Full Name (AES-256 Decrypted)"
              value={user.fullName}
              mono={false}
            />
            <MaskedField
              label="Institutional Email (Blind Indexed)"
              value={user.email}
              mono={false}
            />
            <MaskedField
              label="Contact Phone"
              value={user.phone}
              mono={true}
            />
          </div>

          {/* Route Matching & Authorization Matrix */}
          <div className="bg-[#FAFAFA] border border-[#EBEBEF] rounded-xl p-4 space-y-3">
            <span className="text-xs font-semibold text-zinc-800 flex items-center gap-1.5">
              <MapPin size={15} className="text-[#EA580C]" />
              <span>RBAC Redirection Route Matching</span>
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="bg-white p-3 rounded-lg border border-[#EBEBEF]">
                <span className="text-zinc-400 block text-[10px] uppercase font-semibold">
                  Backend Computed `redirectUrl`
                </span>
                <span className="font-mono font-medium text-emerald-700 block mt-0.5">
                  {redirectUrl || 'N/A'}
                </span>
              </div>

              <div className="bg-white p-3 rounded-lg border border-[#EBEBEF]">
                <span className="text-zinc-400 block text-[10px] uppercase font-semibold">
                  Current Browser URL Path
                </span>
                <span className="font-mono font-medium text-zinc-900 block mt-0.5">
                  {location.pathname}
                </span>
              </div>
            </div>

            {/* Sub-Roles & Permissions Chips */}
            <div className="pt-2 border-t border-[#EBEBEF] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="text-zinc-500 font-medium">Assigned Sub-Roles:</span>
                {subRolesList.length > 0 ? (
                  subRolesList.map((sr, idx) => (
                    <span
                      key={idx}
                      className="bg-zinc-100 text-zinc-800 px-2 py-0.5 rounded text-[11px] font-mono border border-zinc-200"
                    >
                      {sr}
                    </span>
                  ))
                ) : (
                  <span className="text-zinc-400 text-xs font-mono">None</span>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="text-zinc-500 font-medium">Security Flag:</span>
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                    user.mustChangePassword
                      ? 'bg-amber-50 text-amber-800 border border-amber-200'
                      : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  }`}
                >
                  {user.mustChangePassword ? 'Password Reset Required' : 'Credentials Compliant'}
                </span>
              </div>
            </div>
          </div>

          {/* Database Persistence & Transactional Audit Receipt */}
          <div className="pt-2">
            <DbReceiptCard receipt={auditReceipt} />
          </div>

          {/* Notice: Under-Development Feature Placeholder */}
          <div className="p-4 bg-orange-50/60 border border-orange-200/80 rounded-xl flex items-start gap-3 text-xs text-orange-950">
            <Sparkles className="w-5 h-5 text-[#EA580C] shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-orange-900">
                Phase 1 RBAC Verification Complete
              </p>
              <p className="text-orange-800/90 mt-0.5 leading-relaxed">
                Your role credentials have been verified against the live PostgreSQL database. In
                accordance with the Incremental Scope Lock, portal dashboard views and specialized
                workspaces will be activated in Phase 2 as their respective backend controllers are
                connected.
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

