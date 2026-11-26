import Colors from '../../theme/colors';

export const DEPARTMENTS = [
  { code: 'CSE', label: 'CSE — Computer Science & Engg' },
  { code: 'AIML', label: 'AIML — AI & Machine Learning' },
  { code: 'DS', label: 'DS — Data Science' },
  { code: 'CYBER', label: 'CYBER — Cyber Security' },
  { code: 'ECE', label: 'ECE — Electronics & Comm' },
  { code: 'ME', label: 'ME — Mechanical Engineering' },
  { code: 'ALLIED_SCIENCE', label: 'ALLIED_SCIENCE — Allied Science (1st Yr)' },
  { code: 'MATH_SCI', label: 'MATH_SCI — Mathematics & Sciences' },
  { code: 'PHY_CHEM', label: 'PHY_CHEM — Physics & Chemistry' },
  { code: 'HUMANITIES', label: 'HUMANITIES — Humanities & Languages' },
  { code: 'RND_ACADEMICS', label: 'RND_ACADEMICS — R&D and Academics' },
];

export const CORE_BRANCHES = ['CSE', 'AIML', 'DS', 'CYBER', 'ECE', 'ME'];

export const SECTION_CODES = [
  { code: 'ADM', label: 'ADM — Admission Section' },
  { code: 'ACC', label: 'ACC — Accounts / Finance' },
  { code: 'PLC', label: 'PLC — Placement Cell' },
  { code: 'SPT', label: 'SPT — Sports & Athletics' },
  { code: 'MGT', label: 'MGT — Management' },
  { code: 'PRN', label: 'PRN — Principal Office' },
  { code: 'EXM', label: 'EXM — Examination Section' },
];

export const FACULTY_CLASSIFICATIONS = [
  'Assistant Professor',
  'Associate Professor',
  'Professor',
  'HOD',
  'Visiting Faculty',
  'Lab Instructor',
];

export const ADMISSION_QUOTAS = ['KEA_CET', 'COMEDK', 'MANAGEMENT', 'SNQ'];
export const ACADEMIC_YEARS = [1, 2, 3, 4];

export const VENUE_TYPES = [
  'ALL',
  'AUDITORIUM',
  'SEMINAR_HALL',
  'CONFERENCE_ROOM',
  'LAB',
  'OPEN_AIR_THEATRE',
];

export const VENUE_HOURS = [9, 10, 11, 12, 13, 14, 15, 16];

export const WEEKDAYS = [
  { day: 1, short: 'Mon', label: 'Monday' },
  { day: 2, short: 'Tue', label: 'Tuesday' },
  { day: 3, short: 'Wed', label: 'Wednesday' },
  { day: 4, short: 'Thu', label: 'Thursday' },
  { day: 5, short: 'Fri', label: 'Friday' },
  { day: 6, short: 'Sat', label: 'Saturday' },
];

export function getTodayIsoDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function shiftIsoDate(dateStr, deltaDays) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || '').trim());
  const base = match
    ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
    : new Date();
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return base.toISOString().slice(0, 10);
}

export function formatCurrency(amount) {
  const num = Number(amount || 0);
  if (!Number.isFinite(num)) return '₹0';
  return `₹${num.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export function getStatusTone(status) {
  const s = String(status || '').toUpperCase();
  if (['AVAILABLE', 'APPROVED', 'PAID', 'PRESENT', 'OPEN', 'VERIFIED', 'SELECTED', 'APPLIED'].includes(s)) {
    return { bg: Colors.statusEmeraldBg, text: Colors.statusEmerald, border: '#A7F3D0' };
  }
  if (['PARTIALLY_BOOKED', 'PARTIALLY_ACCEPTED', 'PARTIAL', 'LATE', 'SHORTLISTED', 'PENDING_REVIEW'].includes(s)) {
    return { bg: Colors.statusAmberBg, text: Colors.statusAmber, border: '#FDE68A' };
  }
  if (['OCCUPIED', 'REJECTED', 'CANCELLED', 'ABSENT', 'CLOSED'].includes(s)) {
    return { bg: Colors.statusRoseBg, text: Colors.statusRose, border: '#FECACA' };
  }
  if (s.startsWith('PENDING')) {
    return { bg: Colors.brandOrangeLight, text: Colors.brandOrange, border: '#FED7AA' };
  }
  return { bg: Colors.canvasBg, text: Colors.textBody, border: Colors.hairlineBorder };
}

export function getUserRoles(user) {
  const subRoles = Array.isArray(user?.subRoles) ? user.subRoles : [];
  const sec = String(user?.sectionCode || '').trim().toUpperCase();
  const baseRole = String(user?.baseRole || '').trim().toUpperCase();
  const adminTier = String(user?.adminTier || '').trim().toUpperCase();

  const isSuper = adminTier === 'SUPER_ADMIN';
  const isHod = adminTier === 'HOD_ADMIN' || subRoles.includes('HOD');
  const isPrincipal = isSuper || sec === 'PRN' || sec === 'PRINCIPAL' || subRoles.includes('PRINCIPAL');
  const isManagement = isSuper || sec === 'MGT' || subRoles.includes('MANAGEMENT');
  const isAdmission = isSuper || (baseRole === 'ADMIN' && sec === 'ADM');
  const isFinance = isSuper || (baseRole === 'ADMIN' && sec === 'ACC');
  const isPlacement = isSuper || sec === 'PLC';
  const isExam = isSuper || sec === 'EXM';
  const isFaculty = baseRole === 'FACULTY';
  const isStudent = baseRole === 'STUDENT';
  const isAdmin = isSuper || baseRole === 'ADMIN';

  return {
    isSuper,
    isHod,
    isPrincipal,
    isManagement,
    isAdmission,
    isFinance,
    isPlacement,
    isExam,
    isFaculty,
    isStudent,
    isAdmin,
    sectionCode: sec,
  };
}
