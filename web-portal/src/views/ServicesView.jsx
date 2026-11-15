import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import ProvisionAuthorityTool from '../components/services/ProvisionAuthorityTool';
import StudentProvisioningTool from '../components/services/StudentProvisioningTool';
import DbLedgerTool from '../components/services/DbLedgerTool';
import DbDiagnosticsTool from '../components/services/DbDiagnosticsTool';
import UnderDevelopmentView from '../components/UnderDevelopmentView';
import {
  UserPlus,
  GraduationCap,
  Database,
  Activity,
  CalendarCheck,
  Camera,
  Repeat,
  FileCheck2,
  FileText,
  Building,
  Megaphone,
  CreditCard,
  Briefcase,
  Trophy,
  ArrowRight,
  Shield,
  Layers,
  Sparkles,
} from 'lucide-react';

export default function ServicesView({ initialTool = null }) {
  const { user } = useAuth();
  const [activeTool, setActiveTool] = useState(initialTool);

  const isSuperAdmin = user?.adminTier === 'SUPER_ADMIN';
  const isHod =
    user?.adminTier === 'HOD_ADMIN' ||
    (Array.isArray(user?.subRoles) && user?.subRoles.includes('HOD'));
  const isAdmissionAdmin =
    user?.baseRole === 'ADMIN' && (user?.sectionCode === 'ADM' || isSuperAdmin);
  const isFaculty = user?.baseRole === 'FACULTY' || isHod;
  const isStudent = user?.baseRole === 'STUDENT';
  const isAccountsAdmin = user?.baseRole === 'ADMIN' && user?.sectionCode === 'ACC';
  const isPlacementAdmin = user?.baseRole === 'ADMIN' && user?.sectionCode === 'PLC';
  const isSportsAdmin = user?.baseRole === 'ADMIN' && user?.sectionCode === 'SPT';

  // Render active in-place tool
  if (activeTool === 'provision-authority') {
    return <ProvisionAuthorityTool onBack={() => setActiveTool(null)} />;
  }
  if (activeTool === 'provision-student') {
    return <StudentProvisioningTool onBack={() => setActiveTool(null)} />;
  }
  if (activeTool === 'db-ledger') {
    return <DbLedgerTool onBack={() => setActiveTool(null)} />;
  }
  if (activeTool === 'db-diagnostics') {
    return <DbDiagnosticsTool onBack={() => setActiveTool(null)} />;
  }
  if (typeof activeTool === 'object' && activeTool !== null) {
    return (
      <UnderDevelopmentView
        moduleName={activeTool.title}
        phase={activeTool.phase}
        description={activeTool.description}
        onBack={() => setActiveTool(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Services Header */}
      <div className="bg-white border border-[#EBEBEF] rounded-2xl p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200/80 text-[#EA580C] flex items-center justify-center">
            <Layers size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-zinc-900 tracking-tight">
              Department Services & Action Catalog
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Role-authorized institutional workflows and administrative toolkits.
            </p>
          </div>
        </div>
      </div>

      {/* SECTION 1: ACTIVE LIVE SERVICES */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-emerald-600" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            Active Live Services (Connected to PostgreSQL Backend)
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Super Admin: Provision Authority */}
          {isSuperAdmin && (
            <div
              onClick={() => setActiveTool('provision-authority')}
              className="bg-white border border-[#EBEBEF] hover:border-zinc-300 rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] cursor-pointer transition-all duration-150 hover:-translate-y-0.5 group"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-xl bg-zinc-900 text-white flex items-center justify-center">
                  <UserPlus size={18} />
                </div>
                <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  Live Active
                </span>
              </div>
              <h3 className="text-sm font-bold text-zinc-900 group-hover:text-[#EA580C] transition">
                Provision Authority
              </h3>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                Issue credentials for Admission Admin, HODs, or Faculty members with atomic dual-table persistence.
              </p>
              <div className="mt-4 pt-3 border-t border-[#EBEBEF] flex items-center justify-between text-xs font-semibold text-zinc-800">
                <span>Launch Tool</span>
                <ArrowRight size={14} className="text-[#EA580C] group-hover:translate-x-1 transition" />
              </div>
            </div>
          )}

          {/* Super Admin / HOD / Admission Admin: Student Provisioning */}
          {(isSuperAdmin || isHod || isAdmissionAdmin) && (
            <div
              onClick={() => setActiveTool('provision-student')}
              className="bg-white border border-[#EBEBEF] hover:border-zinc-300 rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] cursor-pointer transition-all duration-150 hover:-translate-y-0.5 group"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-xl bg-[#EA580C] text-white flex items-center justify-center">
                  <GraduationCap size={18} />
                </div>
                <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  Live Active
                </span>
              </div>
              <h3 className="text-sm font-bold text-zinc-900 group-hover:text-[#EA580C] transition">
                {isHod ? 'Department Student Enrollment' : 'Multi-Branch Student Enrollment'}
              </h3>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                {isHod
                  ? `Enroll Regular and Lateral students strictly within Department of ${user?.department || 'CS'}.`
                  : 'Enroll Regular and Lateral Diploma students across all college engineering branches.'}
              </p>
              <div className="mt-4 pt-3 border-t border-[#EBEBEF] flex items-center justify-between text-xs font-semibold text-zinc-800">
                <span>Enroll Student</span>
                <ArrowRight size={14} className="text-[#EA580C] group-hover:translate-x-1 transition" />
              </div>
            </div>
          )}

          {/* Super Admin: Cryptographic DB Ledger */}
          {isSuperAdmin && (
            <div
              onClick={() => setActiveTool('db-ledger')}
              className="bg-white border border-[#EBEBEF] hover:border-zinc-300 rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] cursor-pointer transition-all duration-150 hover:-translate-y-0.5 group"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-xl bg-zinc-900 text-white flex items-center justify-center">
                  <Database size={18} />
                </div>
                <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  Live Active
                </span>
              </div>
              <h3 className="text-sm font-bold text-zinc-900 group-hover:text-[#EA580C] transition">
                Cryptographic DB Ledger
              </h3>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                Inspect raw PostgreSQL table records, encrypted columns, Argon2id hashes, and disk tuple coords.
              </p>
              <div className="mt-4 pt-3 border-t border-[#EBEBEF] flex items-center justify-between text-xs font-semibold text-zinc-800">
                <span>View Ledger</span>
                <ArrowRight size={14} className="text-[#EA580C] group-hover:translate-x-1 transition" />
              </div>
            </div>
          )}

          {/* Super Admin / HOD / Admission Admin: DB Schema & Table Diagnostics */}
          {(isSuperAdmin || isHod || isAdmissionAdmin) && (
            <div
              onClick={() => setActiveTool('db-diagnostics')}
              className="bg-white border border-[#EBEBEF] hover:border-zinc-300 rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] cursor-pointer transition-all duration-150 hover:-translate-y-0.5 group"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-xl bg-zinc-800 text-white flex items-center justify-center">
                  <Activity size={18} />
                </div>
                <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  Live Active
                </span>
              </div>
              <h3 className="text-sm font-bold text-zinc-900 group-hover:text-[#EA580C] transition">
                Schema & Table Diagnostics
              </h3>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                Live verification of relational student, faculty, and admin table presence and column definitions.
              </p>
              <div className="mt-4 pt-3 border-t border-[#EBEBEF] flex items-center justify-between text-xs font-semibold text-zinc-800">
                <span>Run Diagnostics</span>
                <ArrowRight size={14} className="text-[#EA580C] group-hover:translate-x-1 transition" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SECTION 2: UPCOMING PHASE SERVICES (IN-PLACE PREVIEW) */}
      <div className="space-y-3 pt-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
          Upcoming Scheduled Services (Click to View Architectural Blueprint)
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Faculty / HOD Services */}
          {(isFaculty || isSuperAdmin) && (
            <>
              <div
                onClick={() =>
                  setActiveTool({
                    title: 'Mark Period Attendance & WhatsApp Alert',
                    phase: 'Phase 2',
                    description:
                      'Facilitates live classroom period attendance recording with automated WhatsApp alert dispatches to parents for absent students.',
                  })
                }
                className="bg-[#FBFBFC] border border-[#EBEBEF] hover:border-zinc-300 rounded-2xl p-5 cursor-pointer transition group"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-xl bg-zinc-200 text-zinc-700 flex items-center justify-center">
                    <CalendarCheck size={18} />
                  </div>
                  <span className="text-[10px] font-semibold bg-orange-50 text-[#EA580C] px-2.5 py-0.5 rounded-full border border-orange-200">
                    Phase 2
                  </span>
                </div>
                <h3 className="text-sm font-bold text-zinc-900 group-hover:text-[#EA580C] transition">
                  Period Attendance & WhatsApp Alerts
                </h3>
                <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                  Real-time classroom attendance logging with locked 23:59:59 EOD edit windows.
                </p>
              </div>

              <div
                onClick={() =>
                  setActiveTool({
                    title: 'Camera Attendance Sheet Scanner (Mobile Exclusive)',
                    phase: 'Phase 2',
                    description:
                      'Mobile-exclusive camera capture and optical attendance mark verification for physical classroom attendance registers.',
                  })
                }
                className="bg-[#FBFBFC] border border-[#EBEBEF] hover:border-zinc-300 rounded-2xl p-5 cursor-pointer transition group"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-xl bg-zinc-200 text-zinc-700 flex items-center justify-center">
                    <Camera size={18} />
                  </div>
                  <span className="text-[10px] font-semibold bg-orange-50 text-[#EA580C] px-2.5 py-0.5 rounded-full border border-orange-200">
                    Mobile Only
                  </span>
                </div>
                <h3 className="text-sm font-bold text-zinc-900 group-hover:text-[#EA580C] transition">
                  Camera Attendance Sheet Scanner
                </h3>
                <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                  Hardware camera attendance register capture and optical verification.
                </p>
              </div>

              <div
                onClick={() =>
                  setActiveTool({
                    title: 'Faculty Class Exchange Request',
                    phase: 'Phase 2',
                    description:
                      'Peer-to-peer timetable swapping and substitute period dispatch with mutual faculty confirmation.',
                  })
                }
                className="bg-[#FBFBFC] border border-[#EBEBEF] hover:border-zinc-300 rounded-2xl p-5 cursor-pointer transition group"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-xl bg-zinc-200 text-zinc-700 flex items-center justify-center">
                    <Repeat size={18} />
                  </div>
                  <span className="text-[10px] font-semibold bg-zinc-100 text-zinc-600 px-2.5 py-0.5 rounded-full border border-zinc-200">
                    Phase 2
                  </span>
                </div>
                <h3 className="text-sm font-bold text-zinc-900 group-hover:text-[#EA580C] transition">
                  Class Exchange Requests
                </h3>
                <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                  Mutual period swapping between department colleagues.
                </p>
              </div>

              <div
                onClick={() =>
                  setActiveTool({
                    title: 'LG Mentee Leave Approvals',
                    phase: 'Phase 2',
                    description:
                      'Local Guardian (LG) mentor interface to review, approve, or deny student leave and on-duty requests.',
                  })
                }
                className="bg-[#FBFBFC] border border-[#EBEBEF] hover:border-zinc-300 rounded-2xl p-5 cursor-pointer transition group"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-xl bg-zinc-200 text-zinc-700 flex items-center justify-center">
                    <FileCheck2 size={18} />
                  </div>
                  <span className="text-[10px] font-semibold bg-zinc-100 text-zinc-600 px-2.5 py-0.5 rounded-full border border-zinc-200">
                    Phase 2
                  </span>
                </div>
                <h3 className="text-sm font-bold text-zinc-900 group-hover:text-[#EA580C] transition">
                  LG Mentee Leave Approvals
                </h3>
                <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                  Review and sign off on mentored student leave applications.
                </p>
              </div>
            </>
          )}

          {/* Student & CR Services */}
          {(isStudent || isSuperAdmin) && (
            <>
              <div
                onClick={() =>
                  setActiveTool({
                    title: 'Submit Leave Application',
                    phase: 'Phase 2',
                    description:
                      'Submit formal digital leave applications directly to your assigned Local Guardian (LG) faculty mentor.',
                  })
                }
                className="bg-[#FBFBFC] border border-[#EBEBEF] hover:border-zinc-300 rounded-2xl p-5 cursor-pointer transition group"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-xl bg-zinc-200 text-zinc-700 flex items-center justify-center">
                    <FileText size={18} />
                  </div>
                  <span className="text-[10px] font-semibold bg-zinc-100 text-zinc-600 px-2.5 py-0.5 rounded-full border border-zinc-200">
                    Phase 2
                  </span>
                </div>
                <h3 className="text-sm font-bold text-zinc-900 group-hover:text-[#EA580C] transition">
                  Submit Leave Application
                </h3>
                <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                  Digital leave requests routed to assigned Local Guardian mentor.
                </p>
              </div>

              <div
                onClick={() =>
                  setActiveTool({
                    title: 'Seminar Hall & Auditorium Booking',
                    phase: 'Phase 3',
                    description:
                      'Reserve college venues (Sir M.V. Auditorium, Seminar Halls) for department seminars and club symposiums.',
                  })
                }
                className="bg-[#FBFBFC] border border-[#EBEBEF] hover:border-zinc-300 rounded-2xl p-5 cursor-pointer transition group"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-xl bg-zinc-200 text-zinc-700 flex items-center justify-center">
                    <Building size={18} />
                  </div>
                  <span className="text-[10px] font-semibold bg-zinc-100 text-zinc-600 px-2.5 py-0.5 rounded-full border border-zinc-200">
                    Phase 3
                  </span>
                </div>
                <h3 className="text-sm font-bold text-zinc-900 group-hover:text-[#EA580C] transition">
                  Auditorium & Hall Booking
                </h3>
                <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                  Department event and club symposium hall reservations.
                </p>
              </div>

              <div
                onClick={() =>
                  setActiveTool({
                    title: 'CR Section Announcement Dispatch',
                    phase: 'Phase 2',
                    description:
                      'Authorized broadcast channel for Class Representatives (CR) to send verified alerts to section peers.',
                  })
                }
                className="bg-[#FBFBFC] border border-[#EBEBEF] hover:border-zinc-300 rounded-2xl p-5 cursor-pointer transition group"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-xl bg-zinc-200 text-zinc-700 flex items-center justify-center">
                    <Megaphone size={18} />
                  </div>
                  <span className="text-[10px] font-semibold bg-zinc-100 text-zinc-600 px-2.5 py-0.5 rounded-full border border-zinc-200">
                    Phase 2
                  </span>
                </div>
                <h3 className="text-sm font-bold text-zinc-900 group-hover:text-[#EA580C] transition">
                  CR Section Announcements
                </h3>
                <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                  Verified section broadcasts for class schedule and venue changes.
                </p>
              </div>
            </>
          )}

          {/* Accounts / Placement / Sports Sections */}
          {(isAccountsAdmin || isSuperAdmin) && (
            <div
              onClick={() =>
                setActiveTool({
                  title: 'Student Fee & Ledger Vault',
                  phase: 'Phase 3',
                  description:
                    'Audit student college tuition, bus, and hostel fee clearance receipts.',
                })
              }
              className="bg-[#FBFBFC] border border-[#EBEBEF] hover:border-zinc-300 rounded-2xl p-5 cursor-pointer transition group"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-xl bg-zinc-200 text-zinc-700 flex items-center justify-center">
                  <CreditCard size={18} />
                </div>
                <span className="text-[10px] font-semibold bg-zinc-100 text-zinc-600 px-2.5 py-0.5 rounded-full border border-zinc-200">
                  Phase 3
                </span>
              </div>
              <h3 className="text-sm font-bold text-zinc-900 group-hover:text-[#EA580C] transition">
                Student Fee Ledger Vault
              </h3>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                Accounts section fee clearance verification and receipts.
              </p>
            </div>
          )}

          {(isPlacementAdmin || isSuperAdmin) && (
            <div
              onClick={() =>
                setActiveTool({
                  title: 'Placement Drive Broadcast',
                  phase: 'Phase 3',
                  description:
                    'Publish campus recruitment drives, eligibility filters, and company interview schedules.',
                })
              }
              className="bg-[#FBFBFC] border border-[#EBEBEF] hover:border-zinc-300 rounded-2xl p-5 cursor-pointer transition group"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-xl bg-zinc-200 text-zinc-700 flex items-center justify-center">
                  <Briefcase size={18} />
                </div>
                <span className="text-[10px] font-semibold bg-zinc-100 text-zinc-600 px-2.5 py-0.5 rounded-full border border-zinc-200">
                  Phase 3
                </span>
              </div>
              <h3 className="text-sm font-bold text-zinc-900 group-hover:text-[#EA580C] transition">
                Placement Drive Broadcast
              </h3>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                Campus recruitment broadcasts and eligibility tracking.
              </p>
            </div>
          )}

          {(isSportsAdmin || isSuperAdmin) && (
            <div
              onClick={() =>
                setActiveTool({
                  title: 'Sports Equipment & Tournament Portal',
                  phase: 'Phase 3',
                  description:
                    'Issue sports equipment and manage VTU inter-collegiate tournament selections.',
                })
              }
              className="bg-[#FBFBFC] border border-[#EBEBEF] hover:border-zinc-300 rounded-2xl p-5 cursor-pointer transition group"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-xl bg-zinc-200 text-zinc-700 flex items-center justify-center">
                  <Trophy size={18} />
                </div>
                <span className="text-[10px] font-semibold bg-zinc-100 text-zinc-600 px-2.5 py-0.5 rounded-full border border-zinc-200">
                  Phase 3
                </span>
              </div>
              <h3 className="text-sm font-bold text-zinc-900 group-hover:text-[#EA580C] transition">
                Sports & Tournament Hub
              </h3>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                Sports section equipment management and tournament schedules.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

