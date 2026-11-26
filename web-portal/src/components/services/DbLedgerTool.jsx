import React, { useState, useEffect } from 'react';
import api from '../../config/api';
import MaskedField from '../MaskedField';
import { Database, ShieldCheck, RefreshCw, ArrowLeft, ShieldAlert, Table2 } from 'lucide-react';

const TABLE_CARDS = [
  { key: 'users', label: 'Users', highlight: false },
  { key: 'student', label: 'Students', highlight: false },
  { key: 'faculty', label: 'Faculty', highlight: false },
  { key: 'admin', label: 'Admins', highlight: false },
  { key: 'venues', label: 'Venues', highlight: false },
  { key: 'venue_bookings', label: 'Venue Bookings', highlight: false },
  { key: 'timetable_slots', label: 'Timetable Slots', highlight: false },
  { key: 'attendance_records', label: 'Attendance Records', highlight: false },
  { key: 'cie_marks', label: 'CIE Marks', highlight: false },
  { key: 'placement_drives', label: 'Placement Drives', highlight: false },
  { key: 'finance_records', label: 'Finance Records', highlight: false },
  { key: 'id_sequences', label: 'ID Sequences', highlight: true },
];

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

  const liveCounts = data?.liveTableCounts || {};
  const records = Array.isArray(data?.records) ? data.records : [];

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

        <div className="flex items-center gap-2">
          {data?.database && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full text-[11px] font-semibold">
              <ShieldCheck size={13} className="text-emerald-600" />
              <span>DB: {data.database}</span>
            </span>
          )}
          <button
            onClick={fetchLedger}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#FBFBFC] hover:bg-zinc-100 border border-[#EBEBEF] text-zinc-700 text-xs font-semibold rounded-xl transition"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>Refresh Ledger</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-start gap-2.5">
          <ShieldAlert size={16} className="text-rose-600 shrink-0 mt-0.5" />
          <span className="font-medium leading-relaxed">{error}</span>
        </div>
      )}

      {loading && !data && (
        <div className="p-6 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-500 text-center">
          Querying PostgreSQL storage metadata and disk tuples...
        </div>
      )}

      {data && (
        <div className="space-y-6">
          {/* Live Table Counts Banner */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700">
              <Table2 size={14} className="text-[#EA580C]" />
              <span>Live PostgreSQL Table Row Counts</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
              {TABLE_CARDS.map((tbl) => (
                <div
                  key={tbl.key}
                  className="bg-[#FBFBFC] p-3 rounded-xl border border-[#EBEBEF]"
                >
                  <span className="text-zinc-500 block text-[10px] uppercase font-semibold tracking-wide truncate">
                    {tbl.label}
                  </span>
                  <span
                    className={`font-bold text-base font-mono mt-0.5 block ${
                      tbl.highlight ? 'text-[#EA580C]' : 'text-zinc-900'
                    }`}
                  >
                    {Number(liveCounts[tbl.key] ?? 0).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Records Table */}
          <div className="border border-[#EBEBEF] rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAFAFA] border-b border-[#EBEBEF] text-zinc-500 font-semibold text-[11px]">
                <tr>
                  <th className="p-3">Username / USN</th>
                  <th className="p-3">Base / Admin Tier</th>
                  <th className="p-3">Scope & Linked Role</th>
                  <th className="p-3">Decrypted Name</th>
                  <th className="p-3">Email (Decrypted)</th>
                  <th className="p-3">Argon2id Hash</th>
                  <th className="p-3">PG xmin</th>
                  <th className="p-3">Disk ctid</th>
                  <th className="p-3">Logins</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EBEBEF]">
                {records.length > 0 ? (
                  records.map((r, idx) => {
                    const meta = r.metadata || r;
                    const proof = r.rawDatabaseProof || {};
                    const decrypted = r.decryptedPreview || {};
                    const linked = meta.linkedRoleRecord;

                    const username = meta.username || '—';
                    const baseRole = meta.base_role || meta.baseRole || '—';
                    const adminTier = meta.admin_tier || meta.adminTier || null;
                    const department = meta.department || null;
                    const sectionCode = meta.section_code || meta.sectionCode || null;
                    const fullName = decrypted.fullName || r.fullNameDecrypted || '<Protected>';
                    const email = decrypted.email || '—';
                    const hashPrefix = proof.passwordHashPrefix || r.passwordHashMasked || '••••••••';
                    const pgXmin = meta.pg_xmin ?? r.pg_xmin ?? '—';
                    const pgCtid = meta.pg_ctid ?? r.pg_ctid ?? '—';
                    const loginCount = meta.login_count ?? r.loginCount ?? 0;

                    return (
                      <tr key={meta.id || idx} className="hover:bg-[#FBFBFC] transition font-mono text-[11px]">
                        <td className="p-3 font-bold text-zinc-900 font-mono whitespace-nowrap">
                          {username}
                        </td>
                        <td className="p-3 font-sans whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-100 text-zinc-800 border border-zinc-200">
                            {baseRole}
                            {adminTier ? ` • ${adminTier}` : ''}
                          </span>
                        </td>
                        <td className="p-3 font-sans text-zinc-600 whitespace-nowrap">
                          <div>
                            {department
                              ? `Dept: ${department}`
                              : sectionCode
                              ? `Sec: ${sectionCode}`
                              : 'Global'}
                          </div>
                          {linked && (
                            <span className="text-[10px] font-mono text-zinc-400">
                              {linked.table} #{linked.id}
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-sans font-medium text-zinc-800 whitespace-nowrap">
                          {fullName}
                        </td>
                        <td className="p-3 font-sans text-zinc-600 max-w-[200px]">
                          <MaskedField label="Email" value={email} mono={false} />
                        </td>
                        <td className="p-3 text-zinc-400 max-w-[140px] truncate" title={hashPrefix}>
                          {hashPrefix}
                        </td>
                        <td className="p-3 text-emerald-700 font-semibold whitespace-nowrap">{pgXmin}</td>
                        <td className="p-3 text-zinc-700 font-semibold whitespace-nowrap">{pgCtid}</td>
                        <td className="p-3 text-zinc-700 font-sans font-bold">{loginCount}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={9} className="p-6 text-center text-zinc-500 font-sans text-xs">
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
