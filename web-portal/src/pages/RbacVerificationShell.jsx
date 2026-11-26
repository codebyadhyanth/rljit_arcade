import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../config/api';
import { useAuth } from '../context/AuthContext';
import DbReceiptCard from '../components/DbReceiptCard';
import MaskedField from '../components/MaskedField';
import {
  ShieldCheck,
  LogOut,
  UserCheck,
  MapPin,
  CheckCircle2,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';

export default function RbacVerificationShell() {
  const { user, auditReceipt, redirectUrl, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [liveProfile, setLiveProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');

  const fetchLiveProfile = useCallback(async () => {
    if (!user) return;
    setProfileLoading(true);
    setProfileError('');
    try {
      const res = await api.get('/api/v1/profile/me');
      setLiveProfile(res.data?.profile || null);
    } catch (err) {
      setProfileError(
        err.response?.data?.error || err.message || 'Unable to refresh live profile from PostgreSQL.'
      );
    } finally {
      setProfileLoading(false);
    }
  }, [user]);

  useEffect(() => {
    let active = true;
    if (!user) return undefined;
    (async () => {
      setProfileLoading(true);
      setProfileError('');
      try {
        const res = await api.get('/api/v1/profile/me');
        if (active) setLiveProfile(res.data?.profile || null);
      } catch (err) {
        if (active) {
          setProfileError(
            err.response?.data?.error || err.message || 'Unable to refresh live profile from PostgreSQL.'
          );
        }
      } finally {
        if (active) setProfileLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user]);

  const handleSignOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  if (!user) {
    return (
      <div className="py-12 flex items-center justify-center p-4">
        <div className="bg-white border border-[#EBEBEF] rounded-2xl p-6 text-center max-w-sm w-full shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]">
          <p className="text-sm text-zinc-600 mb-4">No active session found.</p>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="px-4 py-2 bg-[#121214] text-white rounded-xl text-xs font-semibold"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  const profile = liveProfile || user;
  const subRolesList = Array.isArray(profile.subRoles) ? profile.subRoles : [];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Top Header Bar */}
      <header className="bg-white border border-[#EBEBEF] rounded-2xl p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 bg-orange-50 border border-orange-200/80 rounded-2xl flex items-center justify-center text-[#EA580C]">
            <ShieldCheck size={24} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold text-zinc-900 tracking-tight">
                My Institutional Profile &amp; Session Security
              </h1>
              <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border border-emerald-200">
                <CheckCircle2 size={12} />{' '}
                {liveProfile ? 'Live PostgreSQL Profile Synced' : 'Live Session Active'}
              </span>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              Argon2id authenticated identity, AES-256-GCM decrypted PII, and active RBAC authority scope.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchLiveProfile}
            disabled={profileLoading}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-[#FBFBFC] hover:bg-zinc-100 border border-[#EBEBEF] text-zinc-700 text-xs font-semibold rounded-xl transition disabled:opacity-50"
          >
            <RefreshCw size={13} className={profileLoading ? 'animate-spin' : ''} />
            <span>{profileLoading ? 'Syncing...' : 'Refresh Profile'}</span>
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#121214] hover:bg-black text-white text-xs font-semibold rounded-xl shadow-sm transition-all duration-150 active:scale-[0.99]"
          >
            <LogOut size={14} />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {profileError && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-800 text-xs">
          <ShieldAlert size={16} className="text-rose-600 shrink-0 mt-0.5" />
          <span className="font-medium">{profileError}</span>
        </div>
      )}

      {/* Master RBAC Session Profile Card */}
      <section className="bg-white border border-[#EBEBEF] rounded-2xl p-6 sm:p-8 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] space-y-6">
        <div className="border-b border-[#EBEBEF] pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-zinc-900 flex items-center gap-2">
              <UserCheck size={18} className="text-[#EA580C]" />
              <span>Cryptographic Identity &amp; Authority Scope</span>
            </h2>
            <p className="text-xs text-zinc-500 mt-1">
              Fetched directly from <code className="font-mono text-zinc-700">/api/v1/profile/me</code> with live token-version revocation.
            </p>
          </div>
          {liveProfile?.loginCount !== undefined && (
            <span className="text-[11px] font-mono bg-[#FBFBFC] border border-[#EBEBEF] px-3 py-1 rounded-full text-zinc-700">
              Logins: {liveProfile.loginCount}
            </span>
          )}
        </div>

        {/* Primary Identity Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Authenticated Username */}
          <div className="bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl p-4">
            <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1">
              Institutional ID / Username
            </span>
            <span className="font-mono text-base font-bold text-zinc-900">
              {profile.username}
            </span>
          </div>

          {/* Base Role & Admin Tier */}
          <div className="bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl p-4">
            <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1">
              Role Classification
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-900 text-white">
                {profile.baseRole}
              </span>
              {profile.adminTier && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 border border-orange-200">
                  {profile.adminTier}
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
              {profile.department
                ? `Department: ${profile.department}`
                : profile.sectionCode
                ? `Section: ${profile.sectionCode}`
                : 'Global Scope (Institutional)'}
            </span>
          </div>
        </div>

        {/* PII Masked Fields */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <MaskedField
            label="Full Name (AES-256 Decrypted)"
            value={profile.fullName}
            mono={false}
          />
          <MaskedField
            label="Institutional Email (Blind Indexed)"
            value={profile.email}
            mono={false}
          />
          <MaskedField
            label="Contact Phone"
            value={profile.phone}
            mono={true}
          />
        </div>

        {/* Role-Specific Live Registry Metadata */}
        {liveProfile?.studentDetails && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl p-4 text-xs">
            <div>
              <span className="text-[10px] uppercase font-semibold text-zinc-400 block">Core Branch</span>
              <span className="font-semibold text-zinc-900">
                {liveProfile.studentDetails.coreBranch || liveProfile.studentDetails.department || '—'}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-semibold text-zinc-400 block">Semester / Section</span>
              <span className="font-semibold text-zinc-900">
                Sem {liveProfile.studentDetails.semester ?? '—'} · Sec {liveProfile.studentDetails.section || '—'}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-semibold text-zinc-400 block">CGPA</span>
              <span className="font-mono font-semibold text-zinc-900">
                {Number.isFinite(Number(liveProfile.studentDetails.cgpa))
                  ? Number(liveProfile.studentDetails.cgpa).toFixed(2)
                  : '—'}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-semibold text-zinc-400 block">LG Mentor</span>
              <span className="font-semibold text-zinc-900">
                {liveProfile.studentDetails.lgFaculty?.fullName || 'Unassigned'}
              </span>
            </div>
          </div>
        )}

        {liveProfile?.facultyDetails && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl p-4 text-xs">
            <div>
              <span className="text-[10px] uppercase font-semibold text-zinc-400 block">Employee ID</span>
              <span className="font-mono font-semibold text-zinc-900">
                {liveProfile.facultyDetails.emp_id || profile.username}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-semibold text-zinc-400 block">Designation</span>
              <span className="font-semibold text-zinc-900">
                {liveProfile.facultyDetails.designation || '—'}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-semibold text-zinc-400 block">Classification</span>
              <span className="font-semibold text-zinc-900">
                {liveProfile.facultyDetails.classification || '—'}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-semibold text-zinc-400 block">Cabin Room</span>
              <span className="font-mono font-semibold text-zinc-900">
                {liveProfile.facultyDetails.cabin_room || '—'}
              </span>
            </div>
          </div>
        )}

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

        {/* Active PostgreSQL Session & Encryption Status */}
        <div className="p-4 bg-emerald-50/70 border border-emerald-200/80 rounded-xl flex items-start gap-3 text-xs text-emerald-950">
          <ShieldCheck className="w-5 h-5 text-[#15803D] shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-emerald-900">
              Active PostgreSQL Session &amp; Encryption Verified
            </p>
            <p className="text-emerald-800/90 mt-0.5 leading-relaxed">
              Authenticated via Argon2id with live PostgreSQL token-version revocation,
              AES-256-GCM PII encryption, and HMAC-SHA256 blind indexing.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

