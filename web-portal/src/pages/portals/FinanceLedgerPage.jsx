import React, { useEffect, useState } from 'react';
import api from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import DbReceiptCard from '../../components/DbReceiptCard';
import {
  CheckCircle2,
  CreditCard,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Wallet,
} from 'lucide-react';

const FEE_TYPES = [
  'TUITION_FEE',
  'EXAM_FEE',
  'HOSTEL_FEE',
  'TRANSPORT_FEE',
  'LIBRARY_FINE',
  'LAB_FINE',
  'MISC_FEE',
];

function formatInr(val) {
  return `₹${Number(val || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function normalizeReceipt(receipt) {
  if (!receipt) return null;
  return {
    ...receipt,
    storedInTables: receipt.storedInTables || receipt.storedInTable,
  };
}

export default function FinanceLedgerPage() {
  const { user } = useAuth();
  const isStudent = user?.baseRole === 'STUDENT';
  const isSuperAdmin = user?.adminTier === 'SUPER_ADMIN';
  const secCode = String(user?.sectionCode || '').toUpperCase();
  const isFinanceAdmin = isSuperAdmin || (user?.baseRole === 'ADMIN' && secCode === 'ACC');
  const isHod =
    user?.adminTier === 'HOD_ADMIN' ||
    (Array.isArray(user?.subRoles) && user.subRoles.includes('HOD'));
  const subRoles = Array.isArray(user?.subRoles) ? user.subRoles : [];
  const canCheckClearance =
    isStudent ||
    isSuperAdmin ||
    isHod ||
    ['ACC', 'EXM', 'PRN', 'PRINCIPAL', 'MGT', 'MANAGEMENT'].includes(secCode) ||
    subRoles.includes('MANAGEMENT') ||
    subRoles.includes('PRINCIPAL');

  const [usnFilter, setUsnFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState({
    total_due: 0,
    total_paid: 0,
    total_fine: 0,
    outstanding_balance: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [receipt, setReceipt] = useState(null);

  // Create charge form
  const [showChargeForm, setShowChargeForm] = useState(false);
  const [postingCharge, setPostingCharge] = useState(false);
  const [chargeForm, setChargeForm] = useState({
    usn: '',
    fee_type: 'TUITION_FEE',
    amount_due: '',
    amount_paid: '0',
    fine_amount: '0',
    due_date: '',
  });

  // Payment reconciliation modal/row state
  const [payingRecord, setPayingRecord] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [finePayment, setFinePayment] = useState('0');
  const [payingBusy, setPayingBusy] = useState(false);

  // 4-Pillar Examination Clearance state
  const [clearanceUsn, setClearanceUsn] = useState(isStudent ? user?.username || '' : '');
  const [clearanceData, setClearanceData] = useState(null);
  const [clearanceLoading, setClearanceLoading] = useState(false);
  const [clearanceError, setClearanceError] = useState('');

  const fetchClearance = async (targetOverride = null) => {
    const target = String(
      targetOverride ?? (isStudent ? user?.username || '' : clearanceUsn)
    )
      .trim()
      .toUpperCase();
    if (!target) {
      setClearanceError('Enter a Student USN to check 4-Pillar Examination Clearance.');
      return;
    }
    setClearanceLoading(true);
    setClearanceError('');
    try {
      const res = await api.get(`/api/v1/student/clearance-status/${encodeURIComponent(target)}`);
      setClearanceData(res.data || null);
    } catch (err) {
      setClearanceData(null);
      setClearanceError(
        err.response?.data?.error || err.message || 'Failed to compute examination clearance.'
      );
    } finally {
      setClearanceLoading(false);
    }
  };

  const loadFinance = async (nextUsn = usnFilter, nextStatus = statusFilter) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (!isStudent && nextUsn.trim()) params.set('usn', nextUsn.trim().toUpperCase());
      if (nextStatus) params.set('status', nextStatus);

      const qs = params.toString();
      const res = await api.get(`/api/v1/finance/records${qs ? `?${qs}` : ''}`);
      setRecords(res.data?.records || []);
      setSummary(
        res.data?.summary || {
          total_due: 0,
          total_paid: 0,
          total_fine: 0,
          outstanding_balance: 0,
        }
      );
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load finance ledger');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFinance();
    if (isStudent && user?.username) {
      fetchClearance(user.username);
    }
  }, [user?.username]);

  const handleCreateCharge = async (e) => {
    e.preventDefault();
    setPostingCharge(true);
    setError('');
    setSuccessMsg('');
    setReceipt(null);
    try {
      const res = await api.post('/api/v1/finance/records', {
        usn: chargeForm.usn.trim().toUpperCase(),
        fee_type: chargeForm.fee_type.trim().toUpperCase(),
        amount_due: Number(chargeForm.amount_due),
        amount_paid: Number(chargeForm.amount_paid || 0),
        fine_amount: Number(chargeForm.fine_amount || 0),
        due_date: chargeForm.due_date || null,
      });
      setSuccessMsg(res.data?.message || 'Finance charge posted successfully');
      setReceipt(normalizeReceipt(res.data?.dbReceipt));
      setShowChargeForm(false);
      setChargeForm({
        usn: '',
        fee_type: 'TUITION_FEE',
        amount_due: '',
        amount_paid: '0',
        fine_amount: '0',
        due_date: '',
      });
      await loadFinance();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to post finance charge');
    } finally {
      setPostingCharge(false);
    }
  };

  const openPaymentDrawer = (rec) => {
    const remaining = Math.max(
      0,
      Number(rec.amount_due || 0) + Number(rec.fine_amount || 0) - Number(rec.amount_paid || 0)
    );
    setPayingRecord(rec);
    setPaymentAmount(remaining.toFixed(2));
    setFinePayment('0');
    setError('');
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (!payingRecord) return;
    setPayingBusy(true);
    setError('');
    setSuccessMsg('');
    setReceipt(null);
    try {
      const res = await api.patch(`/api/v1/finance/records/${payingRecord.id}/pay`, {
        payment_amount: Number(paymentAmount || 0),
        fine_payment: Number(finePayment || 0),
      });
      setSuccessMsg(res.data?.message || 'Payment reconciled successfully');
      setReceipt(normalizeReceipt(res.data?.dbReceipt));
      setPayingRecord(null);
      await loadFinance();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to record payment');
    } finally {
      setPayingBusy(false);
    }
  };

  const totalBilled = Number(summary.total_due || 0) + Number(summary.total_fine || 0);

  return (
    <div className="space-y-6">
      {/* Header & Filter Bar */}
      <div className="bg-white border border-[#EBEBEF] rounded-2xl p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#EBEBEF] pb-4">
          <div>
            <h1 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
              <Wallet size={19} className="text-[#EA580C]" />
              <span>Student Finance & Fee Ledger</span>
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              {isStudent
                ? 'Your personal tuition, exam fee, and fine payment ledger.'
                : isHod && !isFinanceAdmin
                ? `Department-scoped student fee records (${user?.department})`
                : 'Institutional fee billing, fines, and payment reconciliation ledger.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isFinanceAdmin && (
              <button
                type="button"
                onClick={() => setShowChargeForm((v) => !v)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#EA580C] hover:bg-[#C2410C] text-white text-xs font-semibold transition shadow-sm"
              >
                <Plus size={14} />
                <span>{showChargeForm ? 'Close Charge Form' : 'Post Fee / Fine Charge'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => loadFinance()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#FBFBFC] hover:bg-zinc-100 border border-[#EBEBEF] text-zinc-700 text-xs font-semibold transition"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            loadFinance(usnFilter, statusFilter);
          }}
          className="flex flex-wrap items-center gap-3"
        >
          {!isStudent && (
            <input
              type="text"
              value={usnFilter}
              onChange={(e) => setUsnFilter(e.target.value)}
              placeholder="Filter by USN (e.g. 1RL26CSE001)"
              className="flex-1 min-w-[200px] px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 font-mono"
            />
          )}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              loadFinance(usnFilter, e.target.value);
            }}
            className="px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-800"
          >
            <option value="">All Statuses</option>
            <option value="PENDING">PENDING</option>
            <option value="PARTIAL">PARTIAL</option>
            <option value="PAID">PAID</option>
          </select>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#121214] hover:bg-black text-white text-xs font-semibold transition"
          >
            <Search size={13} />
            <span>Filter Ledger</span>
          </button>
        </form>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#EBEBEF] rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Total Billed
          </span>
          <p className="mt-2 text-2xl font-bold text-zinc-900 font-mono">{formatInr(totalBilled)}</p>
          <p className="mt-1 text-xs text-zinc-500">Base Fee: {formatInr(summary.total_due)}</p>
        </div>

        <div className="bg-white border border-[#EBEBEF] rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Total Paid
          </span>
          <p className="mt-2 text-2xl font-bold text-[#15803D] font-mono">
            {formatInr(summary.total_paid)}
          </p>
          <p className="mt-1 text-xs text-zinc-500">{records.length} ledger rows</p>
        </div>

        <div className="bg-white border border-[#EBEBEF] rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Total Fines
          </span>
          <p className="mt-2 text-2xl font-bold text-[#B45309] font-mono">
            {formatInr(summary.total_fine)}
          </p>
          <p className="mt-1 text-xs text-zinc-500">Late / disciplinary fines</p>
        </div>

        <div className="bg-white border border-[#EBEBEF] rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Outstanding Balance
          </span>
          <p className="mt-2 text-2xl font-bold text-rose-700 font-mono">
            {formatInr(summary.outstanding_balance)}
          </p>
          <p className="mt-1 text-xs text-zinc-500">Net payable balance</p>
        </div>
      </div>

      {/* Post Fee / Fine Charge Drawer */}
      {isFinanceAdmin && showChargeForm && (
        <section className="bg-white border border-[#EBEBEF] rounded-2xl p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] space-y-4">
          <h2 className="text-sm font-bold text-zinc-900 border-b border-[#EBEBEF] pb-3">
            Post Fee or Fine Charge
          </h2>
          <form onSubmit={handleCreateCharge} className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">Student USN</label>
              <input
                type="text"
                value={chargeForm.usn}
                onChange={(e) => setChargeForm({ ...chargeForm, usn: e.target.value })}
                placeholder="1RL26CSE001"
                className="w-full px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">Fee Type</label>
              <select
                value={chargeForm.fee_type}
                onChange={(e) => setChargeForm({ ...chargeForm, fee_type: e.target.value })}
                className="w-full px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs"
              >
                {FEE_TYPES.map((ft) => (
                  <option key={ft} value={ft}>
                    {ft}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">Amount Due (₹)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={chargeForm.amount_due}
                onChange={(e) => setChargeForm({ ...chargeForm, amount_due: e.target.value })}
                placeholder="25000"
                className="w-full px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">Fine (₹)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={chargeForm.fine_amount}
                onChange={(e) => setChargeForm({ ...chargeForm, fine_amount: e.target.value })}
                className="w-full px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">Due Date</label>
              <input
                type="date"
                value={chargeForm.due_date}
                onChange={(e) => setChargeForm({ ...chargeForm, due_date: e.target.value })}
                className="w-full px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={postingCharge}
              className="px-4 py-2 rounded-xl bg-[#121214] hover:bg-black text-white text-xs font-semibold transition disabled:opacity-50"
            >
              {postingCharge ? 'Posting...' : 'Post Charge'}
            </button>
          </form>
        </section>
      )}

      {/* Inline Record Payment Modal/Panel */}
      {isFinanceAdmin && payingRecord && (
        <section className="bg-white border-2 border-[#15803D]/40 rounded-2xl p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] space-y-4">
          <div className="flex items-start justify-between border-b border-[#EBEBEF] pb-3">
            <div>
              <h2 className="text-sm font-bold text-zinc-900">
                Record Payment · {payingRecord.usn} ({payingRecord.fee_type})
              </h2>
              <p className="text-xs text-zinc-500">
                Student: {payingRecord.student_name || payingRecord.usn} · Due:{' '}
                {formatInr(payingRecord.amount_due)} · Fine: {formatInr(payingRecord.fine_amount)} ·
                Paid: {formatInr(payingRecord.amount_paid)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPayingRecord(null)}
              className="text-xs font-semibold text-zinc-500 hover:text-zinc-900"
            >
              Cancel
            </button>
          </div>

          <form onSubmit={handleRecordPayment} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">
                Payment Amount (₹)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="w-full px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">
                Fine Payment (₹)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={finePayment}
                onChange={(e) => setFinePayment(e.target.value)}
                className="w-full px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={payingBusy}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#15803D] hover:bg-emerald-800 text-white text-xs font-semibold transition disabled:opacity-50"
            >
              <CreditCard size={14} />
              <span>{payingBusy ? 'Reconciling...' : 'Confirm Payment'}</span>
            </button>
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

      {receipt && <DbReceiptCard receipt={receipt} title="Finance Ledger Transaction Receipt" />}

      {/* Ledger Table */}
      <section className="bg-white border border-[#EBEBEF] rounded-2xl p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]">
        {loading ? (
          <p className="text-xs text-zinc-500">Loading finance ledger rows...</p>
        ) : records.length > 0 ? (
          <div className="overflow-x-auto border border-[#EBEBEF] rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAFAFA] border-b border-[#EBEBEF] text-zinc-500 font-semibold text-[11px]">
                <tr>
                  <th className="p-3">USN</th>
                  <th className="p-3">Student Name</th>
                  <th className="p-3">Department</th>
                  <th className="p-3">Fee Type</th>
                  <th className="p-3">Amount Due</th>
                  <th className="p-3">Amount Paid</th>
                  <th className="p-3">Fine</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Due Date</th>
                  {isFinanceAdmin && <th className="p-3 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EBEBEF]">
                {records.map((rec) => {
                  const canPay = isFinanceAdmin && (rec.status === 'PENDING' || rec.status === 'PARTIAL');
                  return (
                    <tr key={rec.id} className="hover:bg-[#FBFBFC]">
                      <td className="p-3 font-mono font-bold text-zinc-900 whitespace-nowrap">
                        {rec.usn}
                      </td>
                      <td className="p-3 font-medium text-zinc-800 whitespace-nowrap">
                        {rec.student_name || '—'}
                      </td>
                      <td className="p-3 text-zinc-600 whitespace-nowrap">
                        {rec.department || '—'}
                        {rec.semester ? ` · S${rec.semester}` : ''}
                      </td>
                      <td className="p-3 font-mono text-[11px] font-semibold text-[#1E293B] whitespace-nowrap">
                        {rec.fee_type}
                      </td>
                      <td className="p-3 font-mono text-zinc-900 whitespace-nowrap">
                        {formatInr(rec.amount_due)}
                      </td>
                      <td className="p-3 font-mono text-[#15803D] font-semibold whitespace-nowrap">
                        {formatInr(rec.amount_paid)}
                      </td>
                      <td className="p-3 font-mono text-[#B45309] whitespace-nowrap">
                        {formatInr(rec.fine_amount)}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            rec.status === 'PAID'
                              ? 'bg-emerald-50 text-[#15803D] border-emerald-200'
                              : rec.status === 'PARTIAL'
                              ? 'bg-amber-50 text-[#B45309] border-amber-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          {rec.status}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-zinc-500 whitespace-nowrap">
                        {rec.due_date ? String(rec.due_date).slice(0, 10) : '—'}
                      </td>
                      {isFinanceAdmin && (
                        <td className="p-3 text-right whitespace-nowrap">
                          {canPay ? (
                            <button
                              type="button"
                              onClick={() => openPaymentDrawer(rec)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#121214] hover:bg-black text-white text-[11px] font-semibold transition"
                            >
                              <CreditCard size={12} />
                              <span>Record Payment</span>
                            </button>
                          ) : (
                            <span className="text-[11px] text-zinc-400">Settled</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-zinc-500">
            No finance records returned for the current scope and filter.
          </p>
        )}
      </section>

      {/* 4-Pillar Examination Clearance Section */}
      {canCheckClearance && (
        <section className="bg-white border border-[#EBEBEF] rounded-2xl p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#EBEBEF] pb-4">
            <div>
              <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                <ShieldCheck size={17} className="text-[#EA580C]" />
                <span>4-Pillar Examination Clearance</span>
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Automated evaluation: Attendance ≥ 85%, CIE ≥ 12, Pending Dues ≤ ₹0, and Verified Vault Documents.
              </p>
            </div>

            {isStudent ? (
              <button
                type="button"
                onClick={() => fetchClearance(user?.username)}
                disabled={clearanceLoading}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#FBFBFC] hover:bg-zinc-100 border border-[#EBEBEF] text-xs font-semibold text-zinc-700"
              >
                <RefreshCw size={13} className={clearanceLoading ? 'animate-spin' : ''} />
                <span>Refresh Clearance</span>
              </button>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  fetchClearance(clearanceUsn);
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={clearanceUsn}
                  onChange={(e) => setClearanceUsn(e.target.value.toUpperCase())}
                  placeholder="Enter Student USN (e.g. 1RL26CSE001)"
                  className="px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 font-mono min-w-[220px]"
                />
                <button
                  type="submit"
                  disabled={clearanceLoading}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#121214] hover:bg-black text-white text-xs font-semibold transition disabled:opacity-50"
                >
                  <Search size={13} />
                  <span>{clearanceLoading ? 'Checking...' : 'Check Clearance'}</span>
                </button>
              </form>
            )}
          </div>

          {clearanceError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-800 text-xs">
              <ShieldAlert size={15} className="text-rose-600 shrink-0 mt-0.5" />
              <span>{clearanceError}</span>
            </div>
          )}

          {clearanceLoading && !clearanceData && (
            <p className="text-xs text-zinc-500">Evaluating 4-pillar examination clearance...</p>
          )}

          {clearanceData?.clearance && (
            <div className="space-y-4">
              <div
                className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs ${
                  clearanceData.clearance.overallHallTicketEligible
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}
              >
                <div>
                  <span className="font-bold uppercase tracking-wide block">
                    {clearanceData.studentUsn} · Overall Hall Ticket Eligibility:{' '}
                    {clearanceData.clearance.overallHallTicketEligible
                      ? 'ELIGIBLE'
                      : 'NOT ELIGIBLE'}
                  </span>
                  <span className="text-[11px] opacity-90">{clearanceData.statusSummary}</span>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-[11px] font-bold border shrink-0 ${
                    clearanceData.clearance.overallHallTicketEligible
                      ? 'bg-white text-[#15803D] border-emerald-300'
                      : 'bg-white text-rose-700 border-rose-300'
                  }`}
                >
                  {clearanceData.clearance.overallHallTicketEligible ? 'APPROVED' : 'BLOCKED'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className="p-4 rounded-xl bg-[#FBFBFC] border border-[#EBEBEF] space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase text-zinc-500">
                      1. Attendance (≥ 85%)
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        clearanceData.clearance.attendanceClear
                          ? 'bg-emerald-50 text-[#15803D] border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}
                    >
                      {clearanceData.clearance.attendanceClear ? 'CLEAR' : 'SHORT'}
                    </span>
                  </div>
                  <p className="font-mono text-lg font-bold text-zinc-900">
                    {clearanceData.clearance.attendancePercentage}%
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-[#FBFBFC] border border-[#EBEBEF] space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase text-zinc-500">
                      2. CIE Marks (≥ 12)
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        clearanceData.clearance.cieClear
                          ? 'bg-emerald-50 text-[#15803D] border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}
                    >
                      {clearanceData.clearance.cieClear ? 'CLEAR' : 'SHORT'}
                    </span>
                  </div>
                  <p className="font-mono text-lg font-bold text-zinc-900">
                    {clearanceData.clearance.avgCieMarks}
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-[#FBFBFC] border border-[#EBEBEF] space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase text-zinc-500">
                      3. Pending Dues (≤ ₹0)
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        clearanceData.clearance.financeClear
                          ? 'bg-emerald-50 text-[#15803D] border-emerald-200'
                          : 'bg-amber-50 text-[#B45309] border-amber-200'
                      }`}
                    >
                      {clearanceData.clearance.financeClear ? 'CLEAR' : 'PENDING'}
                    </span>
                  </div>
                  <p className="font-mono text-lg font-bold text-zinc-900">
                    {formatInr(clearanceData.clearance.outstandingDues)}
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-[#FBFBFC] border border-[#EBEBEF] space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase text-zinc-500">
                      4. Documents Verified
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        clearanceData.clearance.documentsClear
                          ? 'bg-emerald-50 text-[#15803D] border-emerald-200'
                          : 'bg-amber-50 text-[#B45309] border-amber-200'
                      }`}
                    >
                      {clearanceData.clearance.documentsClear ? 'VERIFIED' : 'PENDING'}
                    </span>
                  </div>
                  <p className="font-mono text-lg font-bold text-zinc-900">
                    {clearanceData.clearance.unverifiedDocumentsCount}{' '}
                    <span className="text-xs font-sans font-normal text-zinc-500">unverified</span>
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
