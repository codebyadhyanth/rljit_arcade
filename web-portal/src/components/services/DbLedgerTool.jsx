import React, { useState, useEffect } from 'react';
import api from '../../config/api';
import MaskedField from '../MaskedField';
import { Database, ShieldCheck, RefreshCw, ArrowLeft, ShieldAlert } from 'lucide-react';

export default function DbLedgerTool({ onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchLedger = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/api/v1/db/verify-storage');
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to fetch DB storage verification');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLedger();
  }, []);

  return (
    <div className="bg-white border border-[#EBEBEF] rounded-2xl p-6 sm:p-8 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#EBEBEF] pb-4">
        <div>
          {onBack && (
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-900 transition mb-2"
            >
              <ArrowLeft size={13} />
              <span>Back to Services Catalog</span>
            </button>
          )}
          <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
            <Database size={18} className="text-[#EA580C]" />
            <span>Cryptographic DB Ledger & Tuple Verifier</span>
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Direct PostgreSQL physical inspection: Argon2id hashes, AES-256 ciphertexts, and disk tuple coordinates (xmin / ctid).
          </p>
        </div>

        <button
          onClick={fetchLedger}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#FBFBFC] hover:bg-zinc-100 border border-[#EBEBEF] text-zinc-700 text-xs font-semibold rounded-xl transition"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          <span>Refresh Ledger</span>
        </button>
      </div>

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-start gap-2.5">
          <ShieldAlert size={16} className="text-rose-600 shrink-0 mt-0.5" />
          <span className="font-medium leading-relaxed">{error}</span>
        </div>
      )}

      {data && (
        <div className="space-y-6">
          {/* Table Counts Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
            <div className="bg-[#FBFBFC] p-3 rounded-xl border border-[#EBEBEF]">
              <span className="text-zinc-400 block text-[10px] uppercase font-semibold">Users Table</span>
              <span className="font-bold text-zinc-900 text-base">{data.tableCounts?.users_count ?? 0}</span>
            </div>
            <div className="bg-[#FBFBFC] p-3 rounded-xl border border-[#EBEBEF]">
              <span className="text-zinc-400 block text-[10px] uppercase font-semibold">Student Table</span>
              <span className="font-bold text-zinc-900 text-base">{data.tableCounts?.student_count ?? 0}</span>
            </div>
            <div className="bg-[#FBFBFC] p-3 rounded-xl border border-[#EBEBEF]">
              <span className="text-zinc-400 block text-[10px] uppercase font-semibold">Faculty Table</span>
              <span className="font-bold text-zinc-900 text-base">{data.tableCounts?.faculty_count ?? 0}</span>
            </div>
            <div className="bg-[#FBFBFC] p-3 rounded-xl border border-[#EBEBEF]">
              <span className="text-zinc-400 block text-[10px] uppercase font-semibold">Admin Table</span>
              <span className="font-bold text-zinc-900 text-base">{data.tableCounts?.admin_count ?? 0}</span>
            </div>
            <div className="bg-[#FBFBFC] p-3 rounded-xl border border-[#EBEBEF]">
              <span className="text-zinc-400 block text-[10px] uppercase font-semibold">ID Sequences</span>
              <span className="font-bold text-[#EA580C] text-base">{data.tableCounts?.sequences_count ?? 0}</span>
            </div>
          </div>

          {/* Records Table */}
          <div className="border border-[#EBEBEF] rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAFAFA] border-b border-[#EBEBEF] text-zinc-500 font-semibold text-[11px]">
                <tr>
                  <th className="p-3">Username / USN</th>
                  <th className="p-3">Base / Admin Tier</th>
                  <th className="p-3">Scope</th>
                  <th className="p-3">Decrypted Name</th>
                  <th className="p-3">Argon2id Hash</th>
                  <th className="p-3">PG xmin</th>
                  <th className="p-3">Disk ctid</th>
                  <th className="p-3">Logins</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EBEBEF]">
                {data.records && data.records.length > 0 ? (
                  data.records.map((r, idx) => (
                    <tr key={idx} className="hover:bg-[#FBFBFC] transition font-mono text-[11px]">
                      <td className="p-3 font-bold text-zinc-900 font-mono">{r.username}</td>
                      <td className="p-3 font-sans">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-100 text-zinc-800 border border-zinc-200">
                          {r.baseRole} {r.adminTier ? `• ${r.adminTier}` : ''}
                        </span>
                      </td>
                      <td className="p-3 font-sans text-zinc-600">
                        {r.department ? `Dept: ${r.department}` : r.sectionCode ? `Sec: ${r.sectionCode}` : 'Global'}
                      </td>
                      <td className="p-3 font-sans font-medium text-zinc-800">
                        {r.fullNameDecrypted || '<Protected>'}
                      </td>
                      <td className="p-3 text-zinc-400 max-w-[120px] truncate">
                        {r.passwordHashMasked || '••••••••'}
                      </td>
                      <td className="p-3 text-emerald-700 font-semibold">{r.pg_xmin || '—'}</td>
                      <td className="p-3 text-zinc-700 font-semibold">{r.pg_ctid || '—'}</td>
                      <td className="p-3 text-zinc-700 font-sans font-bold">{r.loginCount ?? 0}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-zinc-500 font-sans text-xs">
                      No records found in users table.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

