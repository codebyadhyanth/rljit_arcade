import React, { useEffect, useState } from 'react';
import api from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import DbReceiptCard from '../../components/DbReceiptCard';
import {
  Briefcase,
  Calendar,
  CheckCircle2,
  Plus,
  RefreshCw,
  ShieldAlert,
  Users,
} from 'lucide-react';

const BRANCH_OPTIONS = [
  'CSE',
  'AIML',
  'DS',
  'CYBER',
  'ECE',
  'ME',
  'CS',
  'IS',
  'EC',
  'CV',
  'AI',
];

function normalizeReceipt(receipt) {
  if (!receipt) return null;
  return {
    ...receipt,
    storedInTables: receipt.storedInTables || receipt.storedInTable,
  };
}

export default function PlacementsPage() {
  const { user } = useAuth();
  const isStudent = user?.baseRole === 'STUDENT';
  const isSuperAdmin = user?.adminTier === 'SUPER_ADMIN';
  const isPlacementAdmin = isSuperAdmin || String(user?.sectionCode || '').toUpperCase() === 'PLC';

  const [statusFilter, setStatusFilter] = useState('ALL');
  const [branchFilter, setBranchFilter] = useState('');
  const [drives, setDrives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [applyingId, setApplyingId] = useState(null);

  // Create placement drive form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    company_name: '',
    role_title: '',
    package_lpa: '',
    min_cgpa: '6.5',
    eligible_branches: ['CSE', 'AIML', 'DS', 'CYBER'],
    drive_date: new Date().toISOString().slice(0, 10),
    status: 'OPEN',
  });

  const loadDrives = async (nextStatus = statusFilter, nextBranch = branchFilter) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (nextStatus && nextStatus !== 'ALL') params.set('status', nextStatus);
      if (nextBranch) params.set('branch', nextBranch);

      const qs = params.toString();
      const res = await api.get(`/api/v1/placements/drives${qs ? `?${qs}` : ''}`);
      setDrives(res.data?.drives || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load placement drives');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDrives();
  }, []);

  const handleApply = async (driveId) => {
    setApplyingId(driveId);
    setError('');
    setSuccessMsg('');
    setReceipt(null);
    try {
      const res = await api.post(`/api/v1/placements/drives/${driveId}/apply`, {});
      setSuccessMsg(res.data?.message || 'Application submitted successfully');
      setReceipt(normalizeReceipt(res.data?.dbReceipt));
      await loadDrives();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to apply for placement drive');
    } finally {
      setApplyingId(null);
    }
  };

  const toggleBranchInForm = (branch) => {
    setForm((prev) => {
      const exists = prev.eligible_branches.includes(branch);
      return {
        ...prev,
        eligible_branches: exists
          ? prev.eligible_branches.filter((b) => b !== branch)
          : [...prev.eligible_branches, branch],
      };
    });
  };

  const handleCreateDrive = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    setSuccessMsg('');
    setReceipt(null);
    try {
      const res = await api.post('/api/v1/placements/drives', {
        company_name: form.company_name.trim(),
        role_title: form.role_title.trim(),
        package_lpa: Number(form.package_lpa),
        min_cgpa: Number(form.min_cgpa || 0),
        eligible_branches: form.eligible_branches,
        drive_date: form.drive_date,
        status: form.status,
      });
      setSuccessMsg(res.data?.message || 'Placement drive created successfully');
      setReceipt(normalizeReceipt(res.data?.dbReceipt));
      setShowCreateForm(false);
      setForm((prev) => ({
        ...prev,
        company_name: '',
        role_title: '',
        package_lpa: '',
      }));
      await loadDrives();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to create placement drive');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <div className="bg-white border border-[#EBEBEF] rounded-2xl p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#EBEBEF] pb-4">
          <div>
            <h1 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
              <Briefcase size={19} className="text-[#EA580C]" />
              <span>Placement Cell & Recruitment Drives</span>
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Live campus recruitment drives with CGPA and branch eligibility checks.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isPlacementAdmin && (
              <button
                type="button"
                onClick={() => setShowCreateForm((v) => !v)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#EA580C] hover:bg-[#C2410C] text-white text-xs font-semibold transition shadow-sm"
              >
                <Plus size={14} />
                <span>{showCreateForm ? 'Close Drive Form' : 'Create Placement Drive'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => loadDrives()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#FBFBFC] hover:bg-zinc-100 border border-[#EBEBEF] text-zinc-700 text-xs font-semibold transition"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {['ALL', 'OPEN', 'CLOSED', 'COMPLETED'].map((st) => {
              const active = statusFilter === st;
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => {
                    setStatusFilter(st);
                    loadDrives(st, branchFilter);
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                    active
                      ? 'bg-[#121214] text-white border-[#121214]'
                      : 'bg-[#FBFBFC] text-zinc-700 border-[#EBEBEF] hover:bg-zinc-100'
                  }`}
                >
                  {st}
                </button>
              );
            })}
          </div>

          <select
            value={branchFilter}
            onChange={(e) => {
              setBranchFilter(e.target.value);
              loadDrives(statusFilter, e.target.value);
            }}
            className="px-3 py-1.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-800"
          >
            <option value="">All Branches</option>
            {BRANCH_OPTIONS.map((b) => (
              <option key={b} value={b}>
                Branch: {b}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Placement Admin Drive Creator */}
      {isPlacementAdmin && showCreateForm && (
        <section className="bg-white border border-[#EBEBEF] rounded-2xl p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] space-y-4">
          <h2 className="text-sm font-bold text-zinc-900 border-b border-[#EBEBEF] pb-3">
            Create New Placement Drive
          </h2>
          <form onSubmit={handleCreateDrive} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Company Name</label>
                <input
                  type="text"
                  value={form.company_name}
                  onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                  placeholder="Acme Systems Pvt Ltd"
                  className="w-full px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Role Title</label>
                <input
                  type="text"
                  value={form.role_title}
                  onChange={(e) => setForm({ ...form, role_title: e.target.value })}
                  placeholder="Software Engineer"
                  className="w-full px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Package (LPA)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.package_lpa}
                  onChange={(e) => setForm({ ...form, package_lpa: e.target.value })}
                  placeholder="8.5"
                  className="w-full px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs font-mono"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Min CGPA</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="10"
                  value={form.min_cgpa}
                  onChange={(e) => setForm({ ...form, min_cgpa: e.target.value })}
                  className="w-full px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Drive Date</label>
                <input
                  type="date"
                  value={form.drive_date}
                  onChange={(e) => setForm({ ...form, drive_date: e.target.value })}
                  className="w-full px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-zinc-700">
                Eligible Branches (leave all unchecked to allow all branches)
              </label>
              <div className="flex flex-wrap gap-2">
                {BRANCH_OPTIONS.map((b) => {
                  const selected = form.eligible_branches.includes(b);
                  return (
                    <button
                      key={b}
                      type="button"
                      onClick={() => toggleBranchInForm(b)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition ${
                        selected
                          ? 'bg-[#1E293B] text-white border-[#1E293B]'
                          : 'bg-[#FBFBFC] text-zinc-700 border-[#EBEBEF]'
                      }`}
                    >
                      {b}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs font-semibold text-zinc-800"
              >
                <option value="OPEN">Status: OPEN</option>
                <option value="CLOSED">Status: CLOSED</option>
                <option value="COMPLETED">Status: COMPLETED</option>
              </select>

              <button
                type="submit"
                disabled={creating}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#121214] hover:bg-black text-white text-xs font-semibold transition disabled:opacity-50"
              >
                {creating ? 'Publishing Drive...' : 'Publish Placement Drive'}
              </button>
            </div>
          </form>
        </section>
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-800 text-xs">
          <ShieldAlert size={16} className="text-rose-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-emerald-800 text-xs font-semibold">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {receipt && <DbReceiptCard receipt={receipt} title="Placement Portal Atomic Receipt" />}

      {/* Placement Drive Cards */}
      {loading ? (
        <div className="bg-white border border-[#EBEBEF] rounded-2xl p-8 text-center text-xs text-zinc-500">
          Loading placement drives from PostgreSQL...
        </div>
      ) : drives.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {drives.map((drive) => {
            const branches = Array.isArray(drive.eligible_branches) ? drive.eligible_branches : [];
            const isOpen = drive.status === 'OPEN';

            return (
              <article
                key={drive.id}
                className="bg-white border border-[#EBEBEF] rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="text-base font-bold text-zinc-900">{drive.company_name}</h2>
                      <p className="text-xs font-medium text-zinc-600">{drive.role_title}</p>
                    </div>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                        isOpen
                          ? 'bg-emerald-50 text-[#15803D] border-emerald-200'
                          : drive.status === 'COMPLETED'
                          ? 'bg-slate-100 text-[#1E293B] border-slate-200'
                          : 'bg-zinc-100 text-zinc-600 border-zinc-200'
                      }`}
                    >
                      {drive.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 text-xs">
                    <div className="p-2.5 rounded-xl bg-[#FBFBFC] border border-[#EBEBEF]">
                      <span className="text-[10px] uppercase font-semibold text-zinc-400 block">
                        Compensation
                      </span>
                      <span className="font-mono font-bold text-zinc-900 text-sm">
                        {drive.package_lpa} LPA
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#FBFBFC] border border-[#EBEBEF]">
                      <span className="text-[10px] uppercase font-semibold text-zinc-400 block">
                        Min CGPA
                      </span>
                      <span className="font-mono font-bold text-[#1E293B] text-sm">
                        {Number(drive.min_cgpa || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[10px] uppercase font-semibold text-zinc-400 block">
                      Eligible Branches
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {branches.length > 0 ? (
                        branches.map((b) => (
                          <span
                            key={b}
                            className="px-2 py-0.5 rounded-md bg-orange-50 text-[#EA580C] border border-orange-200 text-[10px] font-bold"
                          >
                            {b}
                          </span>
                        ))
                      ) : (
                        <span className="px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-700 text-[10px] font-semibold">
                          All Engineering Branches
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-[#EBEBEF] space-y-3">
                  <div className="flex items-center justify-between text-xs text-zinc-500">
                    <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                      <Calendar size={12} />
                      {String(drive.drive_date).slice(0, 10)}
                    </span>
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-zinc-700">
                      <Users size={12} />
                      {drive.applications_count ?? 0} applied
                    </span>
                  </div>

                  {isStudent && (
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                            drive.is_eligible
                              ? 'bg-emerald-50 text-[#15803D] border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          {drive.is_eligible ? 'Eligible' : 'Ineligible'}
                        </span>
                        {drive.applied && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#1E293B] text-white">
                            {drive.application_status || 'APPLIED'}
                          </span>
                        )}
                      </div>

                      {!drive.applied && (
                        <button
                          type="button"
                          disabled={!isOpen || !drive.is_eligible || applyingId === drive.id}
                          onClick={() => handleApply(drive.id)}
                          className="px-3.5 py-2 rounded-xl bg-[#EA580C] hover:bg-[#C2410C] text-white text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {applyingId === drive.id ? 'Applying...' : 'Apply Now'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="bg-white border border-[#EBEBEF] rounded-2xl p-8 text-center text-xs text-zinc-500">
          No placement drives matched the active filter.
        </div>
      )}
    </div>
  );
}
