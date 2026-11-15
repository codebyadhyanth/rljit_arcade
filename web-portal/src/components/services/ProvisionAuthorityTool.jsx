import React, { useState } from 'react';
import api from '../../config/api';
import DbReceiptCard from '../DbReceiptCard';
import { ShieldAlert, CheckCircle2, UserPlus, ArrowLeft, Key } from 'lucide-react';

export default function ProvisionAuthorityTool({ onBack }) {
  const [authorityType, setAuthorityType] = useState('REGULAR_ADMIN');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState('CS');
  const [sectionCode, setSectionCode] = useState('ADM');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);

    try {
      const payload = {
        authorityType,
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        department: authorityType !== 'REGULAR_ADMIN' ? department : undefined,
        sectionCode: authorityType === 'REGULAR_ADMIN' ? sectionCode : undefined,
        subRoles: authorityType === 'HOD_ADMIN' ? ['HOD'] : [],
      };

      const res = await api.post('/api/v1/super-admin/provision-authority', payload);
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Provisioning failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-[#EBEBEF] rounded-2xl p-6 sm:p-8 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] space-y-6">
      <div className="flex items-center justify-between border-b border-[#EBEBEF] pb-4">
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
            <UserPlus size={18} className="text-[#EA580C]" />
            <span>Provision Institutional Authority</span>
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Create Section Admins, Department HODs, or Faculty with atomic dual-table persistence.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-start gap-2.5">
          <ShieldAlert size={16} className="text-rose-600 shrink-0 mt-0.5" />
          <span className="font-medium leading-relaxed">{error}</span>
        </div>
      )}

      {result && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-3">
          <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm">
            <CheckCircle2 size={16} className="text-emerald-600" />
            <span>Authority Successfully Provisioned!</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-white p-3 rounded-lg border border-emerald-100 font-mono">
            <div>
              <span className="text-zinc-400 block text-[10px] font-sans">Assigned Username</span>
              <span className="font-bold text-zinc-900 text-sm">{result.username}</span>
            </div>
            <div>
              <span className="text-zinc-400 block text-[10px] font-sans">Temporary Password</span>
              <span className="font-bold text-emerald-700 text-sm">{result.temporaryPassword}</span>
            </div>
          </div>

          {result.dbReceipt && (
            <DbReceiptCard receipt={result.dbReceipt} title="Live PostgreSQL Authority Receipt" />
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Authority Tier</label>
            <select
              value={authorityType}
              onChange={(e) => setAuthorityType(e.target.value)}
              className="w-full px-3 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 outline-none focus:border-[#EA580C]"
            >
              <option value="REGULAR_ADMIN">Regular Admin (Section)</option>
              <option value="HOD_ADMIN">Department HOD (Head of Dept)</option>
              <option value="FACULTY">Faculty Member</option>
            </select>
          </div>

          {authorityType === 'REGULAR_ADMIN' ? (
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Section Code</label>
              <select
                value={sectionCode}
                onChange={(e) => setSectionCode(e.target.value)}
                className="w-full px-3 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 outline-none focus:border-[#EA580C]"
              >
                <option value="ADM">ADM — Admission Section</option>
                <option value="ACC">ACC — Accounts / Finance</option>
                <option value="PLC">PLC — Placement Cell</option>
                <option value="SPT">SPT — Sports & Athletics</option>
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Department</label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full px-3 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 outline-none focus:border-[#EA580C]"
              >
                <option value="CS">Computer Science & Engineering (CS)</option>
                <option value="IS">Information Science (IS)</option>
                <option value="EC">Electronics & Communication (EC)</option>
                <option value="ME">Mechanical Engineering (ME)</option>
                <option value="CV">Civil Engineering (CV)</option>
                <option value="AI">AI & Machine Learning (AI)</option>
              </select>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Dr. Rajesh Sharma"
              className="w-full px-3 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 outline-none focus:border-[#EA580C]"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Institutional Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="rajesh.cs@rljit.ac.in"
              className="w-full px-3 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 outline-none focus:border-[#EA580C]"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Contact Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+919876543210"
              className="w-full px-3 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 outline-none focus:border-[#EA580C]"
              required
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-[#121214] hover:bg-black text-white text-xs font-semibold rounded-xl transition shadow-sm disabled:opacity-50"
        >
          {loading ? 'Creating Authority & Syncing Dual Tables...' : 'Provision Authority in PostgreSQL'}
        </button>
      </form>
    </div>
  );
}

