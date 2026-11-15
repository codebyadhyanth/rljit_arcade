import React, { useState, useEffect } from 'react';
import api from '../../config/api';
import { Database, ShieldCheck, RefreshCw, ArrowLeft, CheckCircle2, ShieldAlert } from 'lucide-react';

export default function DbDiagnosticsTool({ onBack }) {
  const [roleStatuses, setRoleStatuses] = useState({});
  const [initResult, setInitResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const roles = ['student', 'faculty', 'admin'];

  const fetchStatuses = async () => {
    setLoading(true);
    setError('');
    try {
      const results = {};
      for (const r of roles) {
        try {
          const res = await api.get(`/db:rljit_arcade:${r}/status`);
          results[r] = res.data;
        } catch (err) {
          results[r] = { exists: false, error: err.message };
        }
      }
      setRoleStatuses(results);
    } catch (err) {
      setError('Failed to fetch role status');
    } finally {
      setLoading(false);
    }
  };

  const handleInitAll = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/db:rljit_arcade/connect');
      setInitResult(res.data);
      await fetchStatuses();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Initialization failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatuses();
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
            <span>Database Schema & Role Table Diagnostics</span>
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            PostgreSQL information schema validation and table structure inspector.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchStatuses}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#FBFBFC] hover:bg-zinc-100 border border-[#EBEBEF] text-zinc-700 text-xs font-semibold rounded-xl transition"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>Check Tables</span>
          </button>
          <button
            onClick={handleInitAll}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#121214] hover:bg-black text-white text-xs font-semibold rounded-xl transition shadow-sm"
          >
            <span>Verify & Connect All</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-start gap-2.5">
          <ShieldAlert size={16} className="text-rose-600 shrink-0 mt-0.5" />
          <span className="font-medium leading-relaxed">{error}</span>
        </div>
      )}

      {initResult && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs rounded-xl flex items-center gap-2">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{initResult.status}: Tables [{initResult.tablesCreated?.join(', ')}] verified against PostgreSQL schema.</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {roles.map((r) => {
          const st = roleStatuses[r];
          return (
            <div key={r} className="bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-[#EBEBEF] pb-2">
                <span className="font-bold text-zinc-900 capitalize text-sm">{r} Table</span>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    st?.exists
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}
                >
                  {st?.exists ? 'Verified Active' : 'Not Found'}
                </span>
              </div>

              <div className="text-xs space-y-1.5">
                <div className="flex justify-between text-zinc-500">
                  <span>Row Count:</span>
                  <span className="font-bold text-zinc-900 font-mono">{st?.rowCount ?? 0}</span>
                </div>
                <div className="flex justify-between text-zinc-500">
                  <span>Columns Count:</span>
                  <span className="font-bold text-zinc-900 font-mono">{st?.columns?.length ?? 0}</span>
                </div>
              </div>

              {st?.columns && (
                <div className="pt-2 border-t border-[#EBEBEF]">
                  <span className="text-[10px] font-semibold text-zinc-400 uppercase block mb-1">
                    Columns Defined
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {st.columns.map((c, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] font-mono bg-white px-1.5 py-0.5 rounded border border-[#EBEBEF] text-zinc-700"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

