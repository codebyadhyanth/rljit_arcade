import React, { useState } from 'react';
import api from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import DbReceiptCard from '../DbReceiptCard';
import { ShieldAlert, CheckCircle2, GraduationCap, ArrowLeft, Lock } from 'lucide-react';

const STUDENT_DEPARTMENTS = [
  { value: 'ALLIED_SCIENCE', label: 'Allied Science — First Year BE (ALLIED_SCIENCE)' },
  { value: 'CSE', label: 'Computer Science & Engineering (CSE)' },
  { value: 'AIML', label: 'AI & Machine Learning (AIML)' },
  { value: 'DS', label: 'Computer Science & Data Science (DS)' },
  { value: 'CYBER', label: 'Computer Science & Cyber Security (CYBER)' },
  { value: 'ECE', label: 'Electronics & Communication (ECE)' },
  { value: 'ME', label: 'Mechanical Engineering (ME)' },
  { value: 'CS', label: 'Computer Science — Legacy (CS)' },
  { value: 'IS', label: 'Information Science — Legacy (IS)' },
  { value: 'EC', label: 'Electronics & Comm — Legacy (EC)' },
  { value: 'CV', label: 'Civil Engineering — Legacy (CV)' },
  { value: 'AI', label: 'AI & Machine Learning — Legacy (AI)' },
];

const CORE_BRANCHES = [
  { value: 'CSE', label: 'CSE — Computer Science & Engineering' },
  { value: 'AIML', label: 'AIML — AI & Machine Learning' },
  { value: 'DS', label: 'DS — Data Science' },
  { value: 'CYBER', label: 'CYBER — Cyber Security' },
  { value: 'ECE', label: 'ECE — Electronics & Communication' },
  { value: 'ME', label: 'ME — Mechanical Engineering' },
  { value: 'CS', label: 'CS — Computer Science (Legacy)' },
  { value: 'IS', label: 'IS — Information Science (Legacy)' },
  { value: 'EC', label: 'EC — Electronics (Legacy)' },
  { value: 'CV', label: 'CV — Civil Engineering (Legacy)' },
];

export default function StudentProvisioningTool({ onBack }) {
  const { user } = useAuth();

  // If HOD, department is strictly locked to their assigned department
  const isHod =
    user?.adminTier === 'HOD_ADMIN' ||
    (Array.isArray(user?.subRoles) && user?.subRoles.includes('HOD'));
  const lockedDepartment = isHod ? (user?.department || '') : '';

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState(lockedDepartment || 'CSE');
  const [coreBranch, setCoreBranch] = useState('CSE');
  const [entryType, setEntryType] = useState('REGULAR');
  const [admissionYear, setAdmissionYear] = useState(new Date().getFullYear());
  const [semester, setSemester] = useState(lockedDepartment === 'ALLIED_SCIENCE' ? 1 : 1);
  const [academicYear, setAcademicYear] = useState(1);
  const [section, setSection] = useState('A');
  const [admissionQuota, setAdmissionQuota] = useState('KEA_CET');
  const [cgpa, setCgpa] = useState('0.00');
  const [isCr, setIsCr] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const effectiveDept = (isHod ? lockedDepartment : department).toUpperCase();
  const isAlliedScience = effectiveDept === 'ALLIED_SCIENCE';

  const handleSemesterChange = (rawSem) => {
    setSemester(rawSem);
    const num = parseInt(rawSem, 10);
    if (!Number.isNaN(num) && num >= 1 && num <= 8) {
      setAcademicYear(Math.ceil(num / 2));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);

    try {
      const subRoles = ['STUDENT'];
      if (isCr) subRoles.push('CR');

      const payload = {
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        department: effectiveDept,
        coreBranch: isAlliedScience ? coreBranch : effectiveDept,
        entryType,
        admissionYear: Number(admissionYear),
        academicYear: Number(academicYear),
        semester: Number(semester),
        section: section.trim().toUpperCase() || 'A',
        admissionQuota,
        cgpa: Number(cgpa || 0),
        subRoles,
      };

      const res = await api.post('/api/v1/portals/provision-student', payload);
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Student provisioning failed');
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
            <GraduationCap size={18} className="text-[#EA580C]" />
            <span>Student Admission & USN Provisioning</span>
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Generates compliant VTU USNs (e.g. 1RL26CSE001) with dual-table synchronization into users & student tables.
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
            <span>Student Successfully Provisioned!</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-white p-3 rounded-lg border border-emerald-100 font-mono">
            <div>
              <span className="text-zinc-400 block text-[10px] font-sans">Institutional USN</span>
              <span className="font-bold text-zinc-900 text-sm">
                {result.credentials?.username || result.username}
              </span>
            </div>
            <div>
              <span className="text-zinc-400 block text-[10px] font-sans">Temporary Password</span>
              <span className="font-bold text-emerald-700 text-sm">
                {result.credentials?.temporaryPassword || result.temporaryPassword}
              </span>
            </div>
          </div>

          {result.dbReceipt && (
            <DbReceiptCard receipt={result.dbReceipt} title="PostgreSQL Student Persistence Receipt" />
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Candidate Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Ananya Rao"
              className="w-full px-3 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 outline-none focus:border-[#EA580C]"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Institutional / Personal Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ananya.student@rljit.ac.in"
              className="w-full px-3 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 outline-none focus:border-[#EA580C]"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Mobile Phone</label>
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1.5 flex items-center justify-between">
              <span>Department</span>
              {isHod && (
                <span className="text-[10px] text-amber-700 font-normal flex items-center gap-0.5">
                  <Lock size={10} /> Locked
                </span>
              )}
            </label>
            {isHod ? (
              <div className="px-3 py-2.5 bg-zinc-100 border border-[#EBEBEF] rounded-xl text-xs text-zinc-700 font-semibold">
                {lockedDepartment} (HOD Scope)
              </div>
            ) : (
              <select
                value={department}
                onChange={(e) => {
                  const val = e.target.value;
                  setDepartment(val);
                  if (val === 'ALLIED_SCIENCE') {
                    setSemester(1);
                    setAcademicYear(1);
                  }
                }}
                className="w-full px-3 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 outline-none focus:border-[#EA580C]"
              >
                {STUDENT_DEPARTMENTS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          {isAlliedScience && (
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                Core Branch (for USN & Sem 3 Transition)
              </label>
              <select
                value={coreBranch}
                onChange={(e) => setCoreBranch(e.target.value)}
                className="w-full px-3 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 outline-none focus:border-[#EA580C]"
                required
              >
                {CORE_BRANCHES.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Entry Type</label>
            <select
              value={entryType}
              onChange={(e) => {
                const val = e.target.value;
                setEntryType(val);
                if (val === 'LATERAL') {
                  setSemester(3);
                  setAcademicYear(2);
                } else {
                  setSemester(1);
                  setAcademicYear(1);
                }
              }}
              className="w-full px-3 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 outline-none focus:border-[#EA580C]"
            >
              <option value="REGULAR">Regular (1st Year - Sem 1)</option>
              <option value="LATERAL">Lateral Entry Diploma (2nd Year - Sem 3)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Academic Year</label>
            <select
              value={academicYear}
              onChange={(e) => setAcademicYear(Number(e.target.value))}
              className="w-full px-3 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 outline-none focus:border-[#EA580C]"
            >
              <option value={1}>Year 1 (First Year)</option>
              <option value={2}>Year 2 (Second Year)</option>
              <option value={3}>Year 3 (Third Year)</option>
              <option value={4}>Year 4 (Final Year)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Semester</label>
            <input
              type="number"
              value={semester}
              onChange={(e) => handleSemesterChange(e.target.value)}
              className="w-full px-3 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 outline-none focus:border-[#EA580C]"
              min="1"
              max="8"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Section</label>
            <select
              value={section}
              onChange={(e) => setSection(e.target.value)}
              className="w-full px-3 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 outline-none focus:border-[#EA580C]"
            >
              {['A', 'B', 'C', 'D', 'E', 'F'].map((sec) => (
                <option key={sec} value={sec}>
                  Section {sec}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Admission Year</label>
            <input
              type="number"
              value={admissionYear}
              onChange={(e) => setAdmissionYear(e.target.value)}
              className="w-full px-3 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 outline-none focus:border-[#EA580C]"
              min="2020"
              max="2030"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Admission Quota</label>
            <select
              value={admissionQuota}
              onChange={(e) => setAdmissionQuota(e.target.value)}
              className="w-full px-3 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 outline-none focus:border-[#EA580C]"
            >
              <option value="KEA_CET">KEA_CET — Government CET</option>
              <option value="COMEDK">COMEDK — Consortium</option>
              <option value="MANAGEMENT">MANAGEMENT — Institutional</option>
              <option value="SNQ">SNQ — Supernumerary Quota</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Initial CGPA (0.00 – 10.00)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="10"
              value={cgpa}
              onChange={(e) => setCgpa(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 font-mono outline-none focus:border-[#EA580C]"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <input
            type="checkbox"
            id="isCr"
            checked={isCr}
            onChange={(e) => setIsCr(e.target.checked)}
            className="rounded border-[#EBEBEF] text-[#EA580C] focus:ring-orange-500"
          />
          <label htmlFor="isCr" className="text-xs text-zinc-700 font-medium">
            Designate as Class Representative (CR sub-role)
          </label>
        </div>

        <button
          type="submit"
          disabled={loading || !effectiveDept}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-[#121214] hover:bg-black text-white text-xs font-semibold rounded-xl transition shadow-sm disabled:opacity-50"
        >
          {loading ? 'Provisioning USN & Generating Credentials...' : 'Enroll & Generate VTU USN'}
        </button>
      </form>
    </div>
  );
}
