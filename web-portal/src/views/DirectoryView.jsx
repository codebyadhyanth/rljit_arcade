import React, { useState } from 'react';
import api from '../config/api';
import { useAuth } from '../context/AuthContext';
import MaskedField from '../components/MaskedField';
import { Search, ShieldAlert, Clock, User, CheckCircle2, Sparkles, Filter } from 'lucide-react';

export default function DirectoryView() {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [execTimeMs, setExecTimeMs] = useState(null);
  const [error, setError] = useState('');

  const handleSearch = async (e) => {
    e?.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError('');
    const startTime = performance.now();

    try {
      const res = await api.get(`/api/v1/users/search?q=${encodeURIComponent(query.trim())}`);
      const duration = Math.round(performance.now() - startTime);
      setExecTimeMs(duration);
      setResults(res.data.results || []);
      setSearched(true);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Search Bar */}
      <div className="bg-white border border-[#EBEBEF] rounded-2xl p-6 sm:p-8 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] space-y-4">
        <div>
          <h1 className="text-lg font-bold text-zinc-900 tracking-tight flex items-center gap-2">
            <Search size={20} className="text-[#EA580C]" />
            <span>Institutional User & Student Directory</span>
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Real-time search across live PostgreSQL using pg_trgm fuzzy USN matching and HMAC-SHA256 blind indexing for emails/phones.
          </p>
        </div>

        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
              <Search size={16} />
            </div>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by USN (e.g. 1RL26CS), Username, Email, or Phone..."
              className="w-full pl-10 pr-4 py-3 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 placeholder:text-zinc-400 outline-none focus:bg-white focus:border-[#EA580C] focus:ring-4 focus:ring-orange-500/10 transition"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#121214] hover:bg-black text-white text-xs font-semibold rounded-xl transition shadow-sm disabled:opacity-50"
          >
            {loading ? 'Executing SQL Query...' : 'Search Directory'}
          </button>
        </form>

        {searched && (
          <div className="flex items-center justify-between text-xs text-zinc-500 pt-2 border-t border-[#EBEBEF]">
            <span>
              Found <strong className="text-zinc-900">{results.length}</strong> record(s) matching "{query}"
            </span>
            {execTimeMs !== null && (
              <span className="inline-flex items-center gap-1 font-mono text-[11px] bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">
                <Clock size={11} /> {execTimeMs}ms execution
              </span>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-start gap-2.5">
          <ShieldAlert size={16} className="text-rose-600 shrink-0 mt-0.5" />
          <span className="font-medium leading-relaxed">{error}</span>
        </div>
      )}

      {/* Results Grid */}
      {searched && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {results.length > 0 ? (
            results.map((r) => (
              <div
                key={r.id}
                className="bg-white border border-[#EBEBEF] rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] space-y-3"
              >
                <div className="flex items-start justify-between border-b border-[#EBEBEF] pb-3">
                  <div>
                    <span className="font-mono text-sm font-bold text-zinc-900 block">
                      {r.username}
                    </span>
                    <span className="text-xs text-zinc-600 font-medium">
                      {r.fullName || '<Name Decrypted>'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    <span className="text-[10px] font-semibold bg-zinc-900 text-white px-2 py-0.5 rounded-full">
                      {r.baseRole}
                    </span>
                    {r.adminTier && (
                      <span className="text-[10px] font-semibold bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full border border-orange-200">
                        {r.adminTier}
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-[#FBFBFC] p-2.5 rounded-xl border border-[#EBEBEF]">
                    <span className="text-zinc-400 block text-[10px] uppercase font-semibold">Department</span>
                    <span className="font-semibold text-zinc-800">{r.department || 'N/A'}</span>
                  </div>

                  <div className="bg-[#FBFBFC] p-2.5 rounded-xl border border-[#EBEBEF]">
                    <span className="text-zinc-400 block text-[10px] uppercase font-semibold">Entry / Semester</span>
                    <span className="font-semibold text-zinc-800">
                      {r.entryType ? `${r.entryType} • Sem ${r.semester ?? 1}` : (r.sectionCode ? `Sec: ${r.sectionCode}` : 'Institutional')}
                    </span>
                  </div>
                </div>

                {/* Masked PII Fields with Interactive Reveal */}
                <div className="space-y-1.5 pt-1">
                  <MaskedField label="Institutional Email" value={r.email} mono={false} />
                  <MaskedField label="Contact Phone" value={r.phone} mono={true} />
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-2 bg-white border border-[#EBEBEF] rounded-2xl p-8 text-center text-zinc-500 text-xs">
              No matching records found in PostgreSQL database for "{query}".
            </div>
          )}
        </div>
      )}
    </div>
  );
}

