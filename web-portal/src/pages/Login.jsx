import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getBaseUrl, setBaseUrl } from '../config/api';
import {
  Lock,
  User,
  Key,
  Server,
  ShieldAlert,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Eye,
  EyeOff,
  GraduationCap,
} from 'lucide-react';
import DbReceiptCard from '../components/DbReceiptCard';

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionRevoked = searchParams.get('revoked') === 'true';

  const { login, bootstrapSuperAdmin, loading } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(
    sessionRevoked ? 'Your session was revoked. Please sign in again.' : ''
  );
  const [auditReceipt, setAuditReceipt] = useState(null);

  // Bootstrap modal state
  const [showBootstrap, setShowBootstrap] = useState(false);
  const [bootstrapKey, setBootstrapKey] = useState('RLJIT_SUPER_MASTERMIND_BOOTSTRAP_KEY_2026');
  const [bootFullName, setBootFullName] = useState('Super Admin Mastermind');
  const [bootEmail, setBootEmail] = useState('superadmin@rljit.ac.in');
  const [bootPhone, setBootPhone] = useState('+919888877777');
  const [bootPassword, setBootPassword] = useState('p$4K9!vQ2#xM');
  const [bootResult, setBootResult] = useState(null);
  const [bootError, setBootError] = useState('');

  // API base URL configuration toggle
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [serverUrl, setServerUrl] = useState(getBaseUrl());
  const [serverSaved, setServerSaved] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setAuditReceipt(null);

    if (!username.trim() || !password) {
      setError('Please provide your username / identifier and password');
      return;
    }

    const result = await login(username, password);
    if (result.success) {
      if (result.auditReceipt) {
        setAuditReceipt(result.auditReceipt);
      }
      setTimeout(() => {
        navigate(result.redirectUrl || '/portal/student/home');
      }, 350);
    } else {
      setError(result.error);
    }
  };

  const handleBootstrap = async (e) => {
    e.preventDefault();
    setBootError('');
    setBootResult(null);

    const payload = {
      fullName: bootFullName,
      email: bootEmail,
      phone: bootPhone,
      password: bootPassword,
    };

    const res = await bootstrapSuperAdmin(payload, bootstrapKey);
    if (res.success) {
      setBootResult(res.data);
      setUsername(res.data.username);
      setPassword(res.data.temporaryPassword || bootPassword);
    } else {
      setBootError(res.error);
    }
  };

  const handleSaveServer = (e) => {
    e.preventDefault();
    setBaseUrl(serverUrl);
    setServerSaved(true);
    setTimeout(() => setServerSaved(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#F4F4F6] flex flex-col justify-center items-center px-4 py-12">
      {/* Main Card Container */}
      <div className="w-full max-w-md bg-white border border-[#EBEBEF] rounded-3xl shadow-[0_4px_24px_-4px_rgba(0,0,0,0.06)] overflow-hidden">
        {/* Brand Header */}
        <div className="p-8 pb-6 text-center border-b border-[#EBEBEF]">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-orange-50 border border-orange-200/80 text-[#EA580C] mb-3.5 shadow-sm">
            <GraduationCap size={24} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">RLJIT Arcade</h1>
          <p className="text-xs text-zinc-500 mt-1 font-medium">
            R.L. Jalappa Institute of Technology • Unified Institutional Portal
          </p>
        </div>

        {/* Form Body */}
        <div className="p-8 space-y-5">
          {/* Real Backend Error Banner */}
          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl p-3.5 flex items-start gap-2.5">
              <ShieldAlert size={16} className="shrink-0 mt-0.5 text-rose-600" />
              <span className="font-medium leading-relaxed">{error}</span>
            </div>
          )}

          {/* Live DB Audit Receipt */}
          {auditReceipt && (
            <div>
              <DbReceiptCard receipt={auditReceipt} title="Login Persisted to PostgreSQL" />
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            {/* Username / Institutional ID Input */}
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                Institutional ID / USN / Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
                  <User size={16} />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. RLSUPER001, RLHOD26CS001, 1RL26CS001"
                  className="w-full pl-10 pr-3.5 py-3 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 placeholder:text-zinc-400 transition-all duration-200 outline-none focus:bg-white focus:border-[#EA580C] focus:ring-4 focus:ring-orange-500/10"
                  required
                />
              </div>
              <span className="text-[11px] text-zinc-400 mt-1 block">
                Accepts Super Admin, HOD, Faculty, or Student credentials.
              </span>
            </div>

            {/* Password Input with Mask/Reveal Toggle */}
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                Account Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
                  <Lock size={16} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-10 pr-10 py-3 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 placeholder:text-zinc-400 transition-all duration-200 outline-none focus:bg-white focus:border-[#EA580C] focus:ring-4 focus:ring-orange-500/10 font-mono"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-zinc-400 hover:text-zinc-700 transition"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Obsidian Primary Action Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-[#121214] hover:bg-black disabled:opacity-50 text-white font-semibold rounded-xl text-xs transition-all duration-150 flex items-center justify-center gap-2 shadow-sm active:scale-[0.99] mt-2"
            >
              {loading ? (
                <span>Verifying with Argon2id & PostgreSQL...</span>
              ) : (
                <>
                  <span>Sign In to Institutional Portal</span>
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          </form>

          {/* Setup / Bootstrap Accordion */}
          <div className="pt-4 border-t border-[#EBEBEF] flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => setShowBootstrap(!showBootstrap)}
              className="text-xs text-zinc-600 hover:text-zinc-900 flex items-center justify-between p-2.5 rounded-xl hover:bg-[#FBFBFC] transition border border-dashed border-[#EBEBEF]"
            >
              <span className="flex items-center gap-2 font-medium">
                <Key size={14} className="text-[#EA580C]" />
                <span>First-Time Setup: Bootstrap Super Admin</span>
              </span>
              <span className="text-[11px] text-zinc-400 font-medium">
                {showBootstrap ? 'Hide' : 'Open'}
              </span>
            </button>

            {/* Bootstrap Form Accordion */}
            {showBootstrap && (
              <div className="bg-[#FBFBFC] p-4 rounded-2xl border border-[#EBEBEF] text-xs space-y-3">
                <div className="font-semibold text-zinc-900 flex items-center gap-2">
                  <ShieldCheck size={15} className="text-emerald-600" />
                  <span>Bootstrap Initial Mastermind Super Admin</span>
                </div>

                {bootError && (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 text-[11px] rounded-lg">
                    {bootError}
                  </div>
                )}

                {bootResult && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 text-[11px] rounded-xl space-y-1">
                    <div className="font-semibold text-emerald-800 flex items-center gap-1.5">
                      <CheckCircle2 size={14} /> Super Admin Bootstrapped!
                    </div>
                    <div className="font-mono text-[11px]">
                      Username: <strong>{bootResult.username}</strong>
                    </div>
                    <div className="font-mono text-[11px]">
                      Password: <strong>{bootResult.temporaryPassword || bootPassword}</strong>
                    </div>
                    <div className="text-[10px] text-emerald-700 mt-1">
                      Credentials populated into the login form. Click Sign In to enter.
                    </div>
                  </div>
                )}

                <form onSubmit={handleBootstrap} className="space-y-2.5">
                  <div>
                    <label className="text-[10px] font-semibold text-zinc-600 block mb-1">
                      x-bootstrap-key Header
                    </label>
                    <input
                      type="text"
                      value={bootstrapKey}
                      onChange={(e) => setBootstrapKey(e.target.value)}
                      className="w-full text-xs font-mono p-2 bg-white border border-[#EBEBEF] rounded-lg text-zinc-900 outline-none focus:border-[#EA580C]"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-zinc-600 block mb-1">
                      Super Admin Full Name
                    </label>
                    <input
                      type="text"
                      value={bootFullName}
                      onChange={(e) => setBootFullName(e.target.value)}
                      className="w-full text-xs p-2 bg-white border border-[#EBEBEF] rounded-lg text-zinc-900 outline-none focus:border-[#EA580C]"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-semibold text-zinc-600 block mb-1">
                        Email
                      </label>
                      <input
                        type="email"
                        value={bootEmail}
                        onChange={(e) => setBootEmail(e.target.value)}
                        className="w-full text-xs p-2 bg-white border border-[#EBEBEF] rounded-lg text-zinc-900 outline-none focus:border-[#EA580C]"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-zinc-600 block mb-1">
                        Phone
                      </label>
                      <input
                        type="text"
                        value={bootPhone}
                        onChange={(e) => setBootPhone(e.target.value)}
                        className="w-full text-xs p-2 bg-white border border-[#EBEBEF] rounded-lg text-zinc-900 outline-none focus:border-[#EA580C]"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-zinc-600 block mb-1">
                      Password
                    </label>
                    <input
                      type="text"
                      value={bootPassword}
                      onChange={(e) => setBootPassword(e.target.value)}
                      className="w-full text-xs font-mono p-2 bg-white border border-[#EBEBEF] rounded-lg text-zinc-900 outline-none focus:border-[#EA580C]"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full mt-2 bg-[#121214] hover:bg-black text-white font-semibold py-2 px-3 rounded-lg text-xs transition"
                  >
                    Bootstrap Super Admin
                  </button>
                </form>
              </div>
            )}

            {/* Server Configuration Toggle */}
            <button
              type="button"
              onClick={() => setShowServerConfig(!showServerConfig)}
              className="text-xs text-zinc-500 hover:text-zinc-800 flex items-center justify-between p-2 rounded-xl hover:bg-[#FBFBFC] transition"
            >
              <span className="flex items-center gap-1.5">
                <Server size={13} className="text-zinc-400" />
                <span>Backend Server URL ({getBaseUrl()})</span>
              </span>
              <span className="text-[10px] text-zinc-400 font-medium">
                {showServerConfig ? 'Close' : 'Configure'}
              </span>
            </button>

            {showServerConfig && (
              <form
                onSubmit={handleSaveServer}
                className="bg-[#FBFBFC] p-2.5 rounded-xl border border-[#EBEBEF] mt-1 flex gap-2"
              >
                <input
                  type="text"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  className="flex-1 text-xs p-2 bg-white border border-[#EBEBEF] rounded-lg font-mono text-zinc-900"
                  placeholder="http://localhost:5000"
                />
                <button
                  type="submit"
                  className="bg-[#121214] hover:bg-black text-white px-3.5 py-2 rounded-lg text-xs font-medium"
                >
                  {serverSaved ? 'Saved!' : 'Save'}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-[#FAFAFA] px-6 py-3.5 border-t border-[#EBEBEF] text-center text-[11px] text-zinc-400">
          Argon2id Hashed • AES-256-GCM Encrypted PII • Dual-Table PostgreSQL Relational Sync
        </div>
      </div>
    </div>
  );
}
