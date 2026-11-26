import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKEND_DIR = path.resolve(__dirname, '..');
const ROOT_DIR = path.resolve(BACKEND_DIR, '..');
const SEED_DATA_DIR = path.join(BACKEND_DIR, 'seed_data');
const CREDENTIALS_DIR = path.join(ROOT_DIR, 'credentials');

const BASE_URL = 'http://127.0.0.1:5000';
const API_BASE = `${BASE_URL}/api/v1`;
const BOOTSTRAP_KEY =
  process.env.BOOTSTRAP_SECRET || 'RLJIT_SUPER_MASTERMIND_BOOTSTRAP_KEY_2026';

const SUPER_ADMIN = {
  username: 'RLSUPER001',
  temporaryPassword: 'p$4K9!vQ2#xM',
  fullName: 'Lovely Admin',
  email: 'superadmin@rljit.in',
  phone: '+919888877777',
  baseRole: 'ADMIN',
  adminTier: 'SUPER_ADMIN',
  classificationOrEntryType: 'SUPER_ADMIN',
  department: '',
  coreBranch: '',
  year: '',
  semester: '',
};

const PREEXISTING_RECORDS = {
  admAdmin: {
    username: 'RLADM_ADM_001',
    temporaryPassword: '#W8f6DeD4ip5',
    fullName: 'Kiran Kumar',
    email: 'admission.admin@rljit.in',
    phone: '+919845011223',
    baseRole: 'ADMIN',
    adminTier: 'REGULAR_ADMIN',
    classificationOrEntryType: 'ADM',
    department: '',
    coreBranch: '',
    year: '',
    semester: '',
  },
  dsHod: {
    username: 'RLHOD26DS001',
    temporaryPassword: '+s89bVP&3Tj4',
    fullName: 'Dr. Manju',
    email: 'hod.ds@rljit.in',
    phone: '+919845033445',
    baseRole: 'FACULTY',
    adminTier: 'HOD_ADMIN',
    classificationOrEntryType: 'HOD',
    department: 'DS',
    coreBranch: '',
    year: '',
    semester: '',
  },
  dsFaculty: {
    username: 'RLFAC26DS001',
    temporaryPassword: '-(t2$NJKxZ_4',
    fullName: 'Prof. Jeevan Rao',
    email: 'jeevan.ds@rljit.in',
    phone: '+919845077889',
    baseRole: 'FACULTY',
    adminTier: '',
    classificationOrEntryType: 'Assistant Professor',
    department: 'DS',
    coreBranch: '',
    year: '',
    semester: '',
  },
  dsStudents: [
    {
      username: '1RL25DS001',
      temporaryPassword: 'x8%k_bUv4QNw',
      fullName: 'Nikhilendra GM',
      email: 'nikhilendra.gm@student.rljit.in',
      phone: '+919811223344',
      baseRole: 'STUDENT',
      adminTier: '',
      classificationOrEntryType: 'REGULAR',
      department: 'DS',
      coreBranch: 'DS',
      year: '2',
      semester: '3',
    },
    {
      username: '1RL26DS401',
      temporaryPassword: 'Rh_V+#$32S$n',
      fullName: 'Pavan K',
      email: 'pavan.k@student.rljit.in',
      phone: '+919822334455',
      baseRole: 'STUDENT',
      adminTier: '',
      classificationOrEntryType: 'LATERAL',
      department: 'DS',
      coreBranch: 'DS',
      year: '2',
      semester: '3',
    },
    {
      username: '1RL26DS402',
      temporaryPassword: 'gDbRv&A+Y8e9',
      fullName: 'Prajval',
      email: 'prajval@student.rljit.in',
      phone: '+919822334454',
      baseRole: 'STUDENT',
      adminTier: '',
      classificationOrEntryType: 'LATERAL',
      department: 'DS',
      coreBranch: 'DS',
      year: '2',
      semester: '3',
    },
  ],
};

const ALL_DEPARTMENTS = [
  'AIML',
  'DS',
  'CYBER',
  'CSE',
  'ME',
  'ECE',
  'ALLIED_SCIENCE',
  'MATH_SCI',
  'PHY_CHEM',
  'HUMANITIES',
  'RND_ACADEMICS',
];

const STUDENT_BRANCHES = ['AIML', 'DS', 'CYBER', 'CSE', 'ME', 'ECE'];
const STUDENT_FOLDERS = ['ALLIED_SCIENCE', ...STUDENT_BRANCHES];

const DEPT_SHORT = {
  AIML: 'AI',
  DS: 'DS',
  CYBER: 'CY',
  CSE: 'CS',
  ME: 'ME',
  ECE: 'EC',
  ALLIED_SCIENCE: 'AS',
  MATH_SCI: 'MS',
  PHY_CHEM: 'PC',
  HUMANITIES: 'HM',
  RND_ACADEMICS: 'RD',
};

const PORTAL_SECTIONS = [
  { sectionCode: 'ADM', subRoles: 'ADMISSION_OFFICER', fullName: 'Raghavendra Kulkarni' },
  { sectionCode: 'ACC', subRoles: 'ACCOUNTS_OFFICER', fullName: 'Meenakshi Deshpande' },
  { sectionCode: 'PLC', subRoles: 'PLACEMENT_OFFICER', fullName: 'Siddharth Nair' },
  { sectionCode: 'SPT', subRoles: 'SPORTS_DIRECTOR', fullName: 'Vikramaditya Gowda' },
  { sectionCode: 'MGT', subRoles: 'MANAGEMENT', fullName: 'Prakash Narayan Murthy' },
  { sectionCode: 'PRN', subRoles: 'PRINCIPAL', fullName: 'Dr. Anand Kumar Joshi' },
  { sectionCode: 'EXM', subRoles: 'EXAM_CONTROLLER', fullName: 'Dr. Kavitha Subramanian' },
];

const HOD_NAMES = {
  AIML: 'Dr. Nagesh Bhat',
  DS: 'Dr. Manju',
  CYBER: 'Dr. Shashidhar Hegde',
  CSE: 'Dr. Ramesh Sharma',
  ME: 'Dr. Venkatesh Patil',
  ECE: 'Dr. Suma Kamath',
  ALLIED_SCIENCE: 'Dr. Madhukar Acharya',
  MATH_SCI: 'Dr. Padmavathi Iyer',
  PHY_CHEM: 'Dr. Girish Shenoy',
  HUMANITIES: 'Dr. Anuradha Menon',
  RND_ACADEMICS: 'Dr. Hariprasad Rao',
};

const FACULTY_DISTRIBUTION = [
  {
    dept: 'CSE',
    counts: { Professor: 9, 'Associate Professor': 13, 'Assistant Professor': 31, Programmer: 6, 'Lab Assistant': 6 },
  },
  {
    dept: 'AIML',
    counts: { Professor: 4, 'Associate Professor': 6, 'Assistant Professor': 13, Programmer: 3, 'Lab Assistant': 2 },
  },
  {
    dept: 'DS',
    counts: { Professor: 4, 'Associate Professor': 6, 'Assistant Professor': 13, Programmer: 3, 'Lab Assistant': 2 },
  },
  {
    dept: 'CYBER',
    counts: { Professor: 4, 'Associate Professor': 6, 'Assistant Professor': 13, Programmer: 3, 'Lab Assistant': 2 },
  },
  {
    dept: 'ECE',
    counts: { Professor: 5, 'Associate Professor': 7, 'Assistant Professor': 14, Programmer: 2, 'Lab Assistant': 4 },
  },
  {
    dept: 'ME',
    counts: { Professor: 5, 'Associate Professor': 7, 'Assistant Professor': 14, Programmer: 2, 'Lab Assistant': 4 },
  },
  {
    dept: 'ALLIED_SCIENCE',
    counts: { Professor: 4, 'Associate Professor': 5, 'Assistant Professor': 11, Programmer: 2, 'Lab Assistant': 3 },
  },
  {
    dept: 'MATH_SCI',
    counts: { Professor: 3, 'Associate Professor': 4, 'Assistant Professor': 10, Programmer: 1, 'Lab Assistant': 2 },
  },
  {
    dept: 'PHY_CHEM',
    counts: { Professor: 3, 'Associate Professor': 4, 'Assistant Professor': 9, Programmer: 1, 'Lab Assistant': 3 },
  },
  {
    dept: 'HUMANITIES',
    counts: { Professor: 2, 'Associate Professor': 3, 'Assistant Professor': 9, Programmer: 1, 'Lab Assistant': 1 },
  },
  {
    dept: 'RND_ACADEMICS',
    counts: { Professor: 4, 'Associate Professor': 4, 'Assistant Professor': 5, Programmer: 2, 'Lab Assistant': 1 },
  },
];

const FIRST_NAMES = [
  'Aarav', 'Aditi', 'Aditya', 'Aishwarya', 'Akash', 'Akshata', 'Amogh', 'Amulya',
  'Ananya', 'Anirudh', 'Anjali', 'Ankith', 'Anusha', 'Apoorva', 'Arjun', 'Arpitha',
  'Ashish', 'Ashwini', 'Atharva', 'Avinash', 'Bhargav', 'Bhavana', 'Bharath', 'Bindu',
  'Chaitanya', 'Chandan', 'Chetan', 'Chinmay', 'Darshan', 'Deepak', 'Deepika', 'Deeksha',
  'Devika', 'Dhanush', 'Divya', 'Disha', 'Eshwar', 'Farhan', 'Gagan', 'Ganesh',
  'Gaurav', 'Gayathri', 'Girija', 'Gowtham', 'Harish', 'Harshitha', 'Hemant', 'Hitesh',
  'Indira', 'Ishaan', 'Jayanth', 'Jeevitha', 'Karthik', 'Kavya', 'Kavyashree', 'Keerthana',
  'Kishan', 'Komal', 'Krishna', 'Kruthi', 'Lakshmi', 'Lavanya', 'Likith', 'Lohith',
  'Madhuri', 'Mahesh', 'Manasa', 'Manish', 'Manoj', 'Mayur', 'Meghana', 'Mithun',
  'Monika', 'Nagaraj', 'Namratha', 'Nandan', 'Navya', 'Neha', 'Nikhil', 'Niharika',
  'Niranjan', 'Nishanth', 'Nithya', 'Omkar', 'Pallavi', 'Pavan', 'Pavithra', 'Pooja',
  'Pradeep', 'Pragathi', 'Pranav', 'Prashanth', 'Prateek', 'Preethi', 'Priya', 'Puneeth',
  'Rachana', 'Raghav', 'Rahul', 'Rajesh', 'Rakshitha', 'Ramesh', 'Rashmi', 'Rathan',
  'Ravi', 'Revathi', 'Rishabh', 'Riya', 'Rohan', 'Rohit', 'Sagar', 'Sahana',
  'Sai', 'Sakshi', 'Samarth', 'Sandeep', 'Sanjana', 'Sanjay', 'Santhosh', 'Sathvik',
  'Shalini', 'Shankar', 'Sharath', 'Shashank', 'Shilpa', 'Shivani', 'Shreya', 'Shruthi',
  'Siddharth', 'Sindhu', 'Sneha', 'Spoorthi', 'Srinivas', 'Srishti', 'Suhas', 'Suman',
  'Sumanth', 'Sunil', 'Supriya', 'Suraj', 'Surya', 'Swapna', 'Swathi', 'Tanmay',
  'Tanvi', 'Tarun', 'Tejas', 'Tejaswini', 'Uday', 'Vaibhav', 'Vaishnavi', 'Varsha',
  'Varun', 'Vedanth', 'Vidya', 'Vignesh', 'Vijay', 'Vikram', 'Vinay', 'Vinod',
  'Vishal', 'Vishnu', 'Vivek', 'Yashas', 'Yashwanth', 'Yogesh', 'Zain', 'Zoya',
  'Liam', 'Noah', 'Oliver', 'Ethan', 'Lucas', 'Sophia', 'Emma', 'Maya',
];

const LAST_NAMES = [
  'Sharma', 'Rao', 'Kulkarni', 'Gowda', 'Patil', 'Naidu', 'Reddy', 'Deshpande',
  'Hegde', 'Joshi', 'Murthy', 'Bhat', 'Shetty', 'Kamath', 'Acharya', 'Iyengar',
  'Iyer', 'Nair', 'Menon', 'Verma', 'Gupta', 'Singh', 'Kumar', 'Patel',
  'Shah', 'Mehta', 'Agarwal', 'Bansal', 'Chauhan', 'Mishra', 'Tiwari', 'Pandey',
  'Das', 'Bose', 'Sen', 'Mukherjee', 'Chatterjee', 'Kaur', 'Gill', 'Malhotra',
  'Kapoor', 'Khan', 'Siddiqui', 'Qureshi', 'Thomas', 'Mathew', 'George', 'Fernandes',
  'DSouza', 'Rodrigues', 'Mallya', 'Pai', 'Shenoy', 'Prabhu', 'Nayak', 'Raju',
  'Prasad', 'Sastry', 'Shastri', 'Urs', 'Wodeyar', 'Pawar', 'More', 'Jadhav',
  'Shinde', 'Kamble', 'Chavan', 'Rane', 'Sawant', 'Kadam', 'Salunkhe', 'Nambiar',
  'Pillai', 'Kurian', 'Varghese', 'Subramanian', 'Venkatesh', 'Krishnan', 'Sundaram', 'Rajan',
  'Natarajan', 'Balasubramanian', 'Choudhary', 'Yadav', 'Thakur', 'Sinha', 'Rathore', 'Solanki',
  'Goyal', 'Jain', 'Kothari', 'Parekh', 'Trivedi', 'Vyas', 'Bhattacharya', 'Roy',
  'Dutta', 'Banerjee', 'Sarkar', 'Ahluwalia', 'Bedi', 'Sethi', 'Khanna', 'Tandon',
  'Arora', 'Bhatia', 'Chopra', 'Dhawan', 'Grewal', 'Sandhu', 'Virk', 'Walia',
  'Zaveri', 'Mistry', 'Alvarez', 'Chen', 'Kim', 'Tanaka', 'Nguyen', 'Silva',
];

const PHONE_PREFIXES = [
  '9845', '9880', '9886', '9900', '9980', '9448', '9449', '9740',
  '9611', '9535', '8861', '8197', '7892', '7411', '6361',
];

const QUOTAS = ['KEA_CET', 'KEA_CET', 'KEA_CET', 'COMEDK', 'COMEDK', 'MANAGEMENT', 'SNQ'];

const CRED_HEADERS = [
  'username',
  'temporaryPassword',
  'fullName',
  'email',
  'baseRole',
  'adminTier',
  'classification_or_entryType',
  'department',
  'coreBranch',
  'year',
  'semester',
];

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(headers, rows) {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r') {
      if (content[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  if (rows.length === 0) return [];
  const headers = rows[0];
  const records = [];
  for (let r = 1; r < rows.length; r++) {
    const vals = rows[r];
    if (vals.length === 1 && vals[0] === '') continue;
    const obj = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = vals[c] ?? '';
    }
    records.push(obj);
  }
  return records;
}

function buildPersonName(seedIdx) {
  const first = FIRST_NAMES[(seedIdx * 37 + 11) % FIRST_NAMES.length];
  const last = LAST_NAMES[(seedIdx * 53 + Math.floor(seedIdx / FIRST_NAMES.length) * 19 + 7) % LAST_NAMES.length];
  return { first, last, fullName: `${first} ${last}` };
}

function slugify(str) {
  return String(str).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function generateDeterministicSeedRows() {
  const usedEmails = new Set([
    SUPER_ADMIN.email.toLowerCase(),
    PREEXISTING_RECORDS.admAdmin.email.toLowerCase(),
    PREEXISTING_RECORDS.dsHod.email.toLowerCase(),
    PREEXISTING_RECORDS.dsFaculty.email.toLowerCase(),
    ...PREEXISTING_RECORDS.dsStudents.map((s) => s.email.toLowerCase()),
  ]);
  const usedPhones = new Set([
    SUPER_ADMIN.phone,
    PREEXISTING_RECORDS.admAdmin.phone,
    PREEXISTING_RECORDS.dsHod.phone,
    PREEXISTING_RECORDS.dsFaculty.phone,
    ...PREEXISTING_RECORDS.dsStudents.map((s) => s.phone),
  ]);

  let phoneCounter = 100001;
  function nextPhone() {
    while (true) {
      const prefix = PHONE_PREFIXES[phoneCounter % PHONE_PREFIXES.length];
      const phone = `+91${prefix}${String(phoneCounter).padStart(6, '0')}`;
      phoneCounter++;
      if (!usedPhones.has(phone)) {
        usedPhones.add(phone);
        return phone;
      }
    }
  }

  function claimEmail(candidate) {
    const lower = candidate.toLowerCase();
    if (usedEmails.has(lower)) {
      throw new Error(`Email collision detected in deterministic generator: ${lower}`);
    }
    usedEmails.add(lower);
    return lower;
  }

  // 1. Portal Admins (7)
  const portalAdmins = PORTAL_SECTIONS.map((sec) => ({
    authorityType: 'REGULAR_ADMIN',
    fullName: sec.fullName,
    email: claimEmail(`portal.${sec.sectionCode.toLowerCase()}@rljit.edu.in`),
    phone: nextPhone(),
    sectionCode: sec.sectionCode,
    subRoles: sec.subRoles,
  }));

  // 2. HODs (11)
  const hods = ALL_DEPARTMENTS.map((dept) => ({
    authorityType: 'HOD',
    fullName: HOD_NAMES[dept],
    email: claimEmail(`hod.${dept.toLowerCase()}@rljit.edu.in`),
    phone: nextPhone(),
    department: dept,
    classification: 'Professor & HOD',
    designation: 'Professor & Head of Department',
    cabinRoom: `${DEPT_SHORT[dept]}-100`,
    subRoles: 'HOD',
  }));

  // 3. Faculty (310)
  const faculty = [];
  let facGlobalIdx = 1;
  for (const dist of FACULTY_DISTRIBUTION) {
    const dept = dist.dept;
    const deptSlug = dept.toLowerCase().replace(/_/g, '');
    const shortCode = DEPT_SHORT[dept];
    let deptSeq = 1;

    for (const [classification, count] of Object.entries(dist.counts)) {
      for (let i = 0; i < count; i++) {
        const { first, last, fullName } = buildPersonName(facGlobalIdx + 100);
        let displayTitle = '';
        let designation = classification;
        let subRoles = 'TEACHER|MENTOR';

        if (classification === 'Professor') {
          displayTitle = 'Dr. ';
        } else if (classification === 'Associate Professor') {
          displayTitle = 'Prof. ';
        } else if (classification === 'Assistant Professor') {
          displayTitle = 'Prof. ';
        } else if (classification === 'Programmer') {
          designation = 'System Programmer';
          subRoles = 'LAB_STAFF';
        } else if (classification === 'Lab Assistant') {
          designation = 'Senior Lab Assistant';
          subRoles = 'LAB_STAFF';
        }

        const seqStr = String(deptSeq).padStart(2, '0');
        const email = claimEmail(
          `${slugify(first)}.${slugify(last)}.${deptSlug}${seqStr}@rljit.edu.in`
        );
        const floor = 1 + Math.floor((deptSeq - 1) / 25);
        const room = String(1 + ((deptSeq - 1) % 25)).padStart(2, '0');

        faculty.push({
          authorityType: 'FACULTY',
          fullName: `${displayTitle}${fullName}`,
          email,
          phone: nextPhone(),
          department: dept,
          classification,
          designation,
          cabinRoom: `${shortCode}-${floor}${room}`,
          subRoles,
        });

        deptSeq++;
        facGlobalIdx++;
      }
    }
  }

  // 4. Students (2,061 new + 3 existing DS = 2,064 exact)
  const students = [];
  let stuGlobalIdx = 1;

  function addStudentCohort({
    department,
    coreBranch,
    admissionYear,
    academicYear,
    semester,
    section,
    entryType,
    count,
    startRoll,
  }) {
    const yy = String(admissionYear).slice(-2);
    const branchSlug = coreBranch.toLowerCase();
    for (let i = 0; i < count; i++) {
      const roll = startRoll + i;
      const rollStr = String(roll).padStart(3, '0');
      const { first, last, fullName } = buildPersonName(stuGlobalIdx + 5000);
      const email = claimEmail(
        `${slugify(first)}.${slugify(last)}.${yy}${branchSlug}${rollStr}@student.rljit.edu.in`
      );
      const quota = QUOTAS[(stuGlobalIdx + i) % QUOTAS.length];
      // Deterministic realistic CGPA spread between 6.20 and 9.65
      const cgpaRaw = 6.2 + ((stuGlobalIdx * 73 + i * 19) % 346) / 100;
      const cgpa = cgpaRaw.toFixed(2);

      students.push({
        fullName,
        email,
        phone: nextPhone(),
        department,
        coreBranch,
        admissionYear: String(admissionYear),
        academicYear: String(academicYear),
        semester: String(semester),
        section,
        entryType,
        admissionQuota: quota,
        cgpa,
      });
      stuGlobalIdx++;
    }
  }

  // Year 1: 480 Regular students in ALLIED_SCIENCE (admissionYear: 2026, academicYear: 1, semester: 1)
  for (const branch of STUDENT_BRANCHES) {
    if (branch === 'CSE') {
      addStudentCohort({
        department: 'ALLIED_SCIENCE', coreBranch: 'CSE', admissionYear: 2026,
        academicYear: 1, semester: 1, section: 'A', entryType: 'REGULAR', count: 60, startRoll: 1,
      });
      addStudentCohort({
        department: 'ALLIED_SCIENCE', coreBranch: 'CSE', admissionYear: 2026,
        academicYear: 1, semester: 1, section: 'B', entryType: 'REGULAR', count: 60, startRoll: 61,
      });
      addStudentCohort({
        department: 'ALLIED_SCIENCE', coreBranch: 'CSE', admissionYear: 2026,
        academicYear: 1, semester: 1, section: 'C', entryType: 'REGULAR', count: 60, startRoll: 121,
      });
    } else {
      addStudentCohort({
        department: 'ALLIED_SCIENCE', coreBranch: branch, admissionYear: 2026,
        academicYear: 1, semester: 1, section: 'A', entryType: 'REGULAR', count: 60, startRoll: 1,
      });
    }
  }

  // Years 2, 3, 4: Regular (1,440 target -> 1,439 new + 1 existing 1RL25DS001) + Lateral (144 target -> 142 new + 2 existing 1RL26DS401/402)
  const upperYears = [
    { academicYear: 2, semester: 3, regAdmissionYear: 2025, latAdmissionYear: 2026 },
    { academicYear: 3, semester: 5, regAdmissionYear: 2024, latAdmissionYear: 2025 },
    { academicYear: 4, semester: 7, regAdmissionYear: 2023, latAdmissionYear: 2024 },
  ];

  for (const yr of upperYears) {
    for (const branch of STUDENT_BRANCHES) {
      if (branch === 'CSE') {
        // 180 Regular (60 A, 60 B, 60 C) + 18 Lateral (6 A, 6 B, 6 C)
        addStudentCohort({
          department: 'CSE', coreBranch: 'CSE', admissionYear: yr.regAdmissionYear,
          academicYear: yr.academicYear, semester: yr.semester, section: 'A', entryType: 'REGULAR', count: 60, startRoll: 1,
        });
        addStudentCohort({
          department: 'CSE', coreBranch: 'CSE', admissionYear: yr.regAdmissionYear,
          academicYear: yr.academicYear, semester: yr.semester, section: 'B', entryType: 'REGULAR', count: 60, startRoll: 61,
        });
        addStudentCohort({
          department: 'CSE', coreBranch: 'CSE', admissionYear: yr.regAdmissionYear,
          academicYear: yr.academicYear, semester: yr.semester, section: 'C', entryType: 'REGULAR', count: 60, startRoll: 121,
        });

        addStudentCohort({
          department: 'CSE', coreBranch: 'CSE', admissionYear: yr.latAdmissionYear,
          academicYear: yr.academicYear, semester: yr.semester, section: 'A', entryType: 'LATERAL', count: 6, startRoll: 401,
        });
        addStudentCohort({
          department: 'CSE', coreBranch: 'CSE', admissionYear: yr.latAdmissionYear,
          academicYear: yr.academicYear, semester: yr.semester, section: 'B', entryType: 'LATERAL', count: 6, startRoll: 407,
        });
        addStudentCohort({
          department: 'CSE', coreBranch: 'CSE', admissionYear: yr.latAdmissionYear,
          academicYear: yr.academicYear, semester: yr.semester, section: 'C', entryType: 'LATERAL', count: 6, startRoll: 413,
        });
      } else if (branch === 'DS' && yr.academicYear === 2) {
        // 59 new Regular (1RL25DS001 already exists) + 4 new Lateral (1RL26DS401 & 1RL26DS402 already exist)
        addStudentCohort({
          department: 'DS', coreBranch: 'DS', admissionYear: yr.regAdmissionYear,
          academicYear: 2, semester: 3, section: 'A', entryType: 'REGULAR', count: 59, startRoll: 2,
        });
        addStudentCohort({
          department: 'DS', coreBranch: 'DS', admissionYear: yr.latAdmissionYear,
          academicYear: 2, semester: 3, section: 'A', entryType: 'LATERAL', count: 4, startRoll: 403,
        });
      } else {
        addStudentCohort({
          department: branch, coreBranch: branch, admissionYear: yr.regAdmissionYear,
          academicYear: yr.academicYear, semester: yr.semester, section: 'A', entryType: 'REGULAR', count: 60, startRoll: 1,
        });
        addStudentCohort({
          department: branch, coreBranch: branch, admissionYear: yr.latAdmissionYear,
          academicYear: yr.academicYear, semester: yr.semester, section: 'A', entryType: 'LATERAL', count: 6, startRoll: 401,
        });
      }
    }
  }

  return { portalAdmins, hods, faculty, students };
}

async function writeSourceCsvs() {
  await fs.mkdir(SEED_DATA_DIR, { recursive: true });
  const { portalAdmins, hods, faculty, students } = generateDeterministicSeedRows();

  if (hods.length !== 11) throw new Error(`Expected 11 HODs, got ${hods.length}`);
  if (portalAdmins.length !== 7) throw new Error(`Expected 7 Portal Admins, got ${portalAdmins.length}`);
  if (faculty.length !== 310) throw new Error(`Expected 310 Faculty, got ${faculty.length}`);
  if (students.length !== 2061) throw new Error(`Expected 2061 Students, got ${students.length}`);

  await fs.writeFile(
    path.join(SEED_DATA_DIR, 'hods.csv'),
    toCsv(
      ['authorityType', 'fullName', 'email', 'phone', 'department', 'classification', 'designation', 'cabinRoom', 'subRoles'],
      hods
    ),
    'utf8'
  );
  await fs.writeFile(
    path.join(SEED_DATA_DIR, 'portal_admins.csv'),
    toCsv(['authorityType', 'fullName', 'email', 'phone', 'sectionCode', 'subRoles'], portalAdmins),
    'utf8'
  );
  await fs.writeFile(
    path.join(SEED_DATA_DIR, 'faculty.csv'),
    toCsv(
      ['authorityType', 'fullName', 'email', 'phone', 'department', 'classification', 'designation', 'cabinRoom', 'subRoles'],
      faculty
    ),
    'utf8'
  );
  await fs.writeFile(
    path.join(SEED_DATA_DIR, 'students.csv'),
    toCsv(
      ['fullName', 'email', 'phone', 'department', 'coreBranch', 'admissionYear', 'academicYear', 'semester', 'section', 'entryType', 'admissionQuota', 'cgpa'],
      students
    ),
    'utf8'
  );

  console.log(
    `[1/5] Source CSVs written to backend/seed_data/: hods=${hods.length}, portal_admins=${portalAdmins.length}, faculty=${faculty.length}, students=${students.length}`
  );
}

async function isServerListening() {
  try {
    const res = await fetch(`${BASE_URL}/`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureServerRunning() {
  if (await isServerListening()) {
    console.log('[2/5] Express server already listening at http://127.0.0.1:5000');
    return null;
  }

  console.log('[2/5] Starting temporary Express server (node src/server.js)...');
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: BACKEND_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderrBuf = '';
  child.stderr.on('data', (chunk) => {
    stderrBuf += chunk.toString();
  });

  let exited = false;
  child.on('exit', (code) => {
    exited = true;
    if (code !== null && code !== 0) {
      console.error(`Spawned server exited unexpectedly with code ${code}: ${stderrBuf}`);
    }
  });

  for (let i = 0; i < 80; i++) {
    if (exited) {
      throw new Error(`Express server exited prematurely: ${stderrBuf}`);
    }
    if (await isServerListening()) {
      console.log('[2/5] Express server healthy (GET / -> 200)');
      return child;
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  child.kill('SIGTERM');
  throw new Error('Timed out waiting for Express server at http://127.0.0.1:5000/');
}

async function stopSpawnedServer(child) {
  if (!child) return;
  if (child.exitCode !== null || child.killed) return;
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {}
      resolve();
    }, 3000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    try {
      child.kill('SIGTERM');
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });
  console.log('[Cleanup] Temporary Express server stopped cleanly.');
}

async function httpJson(url, options = {}, retries = 1) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(60000),
      });
      const text = await res.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text };
      }
      if (res.status >= 500 && attempt < retries) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      return { status: res.status, ok: res.ok, data };
    } catch (err) {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      throw err;
    }
  }
}

async function getSuperAdminToken() {
  // Ensure DB and schemas are initialized
  const connectRes = await httpJson(`${BASE_URL}/db:rljit_arcade/connect`, { method: 'GET' }, 1);
  if (!connectRes.ok) {
    throw new Error(`DB connect check failed (${connectRes.status}): ${JSON.stringify(connectRes.data)}`);
  }

  // Try login first
  let loginRes = await httpJson(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: SUPER_ADMIN.username,
      password: SUPER_ADMIN.temporaryPassword,
    }),
  });

  if (loginRes.status === 401) {
    // Bootstrap only if 0 Super Admins exist
    const bootRes = await httpJson(`${API_BASE}/auth/bootstrap-super-admin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-bootstrap-key': BOOTSTRAP_KEY,
      },
      body: JSON.stringify({
        fullName: SUPER_ADMIN.fullName,
        email: SUPER_ADMIN.email,
        phone: SUPER_ADMIN.phone,
        password: SUPER_ADMIN.temporaryPassword,
      }),
    });
    if (!bootRes.ok && bootRes.status !== 403) {
      throw new Error(`Bootstrap failed (${bootRes.status}): ${JSON.stringify(bootRes.data)}`);
    }
    loginRes = await httpJson(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: SUPER_ADMIN.username,
        password: SUPER_ADMIN.temporaryPassword,
      }),
    });
  }

  if (!loginRes.ok || !loginRes.data?.token) {
    throw new Error(`Super Admin login failed (${loginRes.status}): ${JSON.stringify(loginRes.data)}`);
  }

  console.log(`[3/5] Authenticated as ${loginRes.data.user?.username} (${loginRes.data.user?.adminTier})`);
  return loginRes.data.token;
}

async function loadExistingCredentialCache() {
  const byEmail = new Map();

  // Seed pre-existing 7 users first
  const preList = [
    SUPER_ADMIN,
    PREEXISTING_RECORDS.admAdmin,
    PREEXISTING_RECORDS.dsHod,
    PREEXISTING_RECORDS.dsFaculty,
    ...PREEXISTING_RECORDS.dsStudents,
  ];
  for (const rec of preList) {
    byEmail.set(rec.email.toLowerCase(), rec);
  }

  // Read any existing exported CSVs in credentials/ for full idempotency across re-runs
  try {
    const subDirs = await fs.readdir(CREDENTIALS_DIR, { withFileTypes: true });
    for (const dirent of subDirs) {
      if (!dirent.isDirectory()) continue;
      const folderPath = path.join(CREDENTIALS_DIR, dirent.name);
      const files = await fs.readdir(folderPath, { withFileTypes: true });
      for (const f of files) {
        if (!f.isFile() || !f.name.endsWith('.csv')) continue;
        const content = await fs.readFile(path.join(folderPath, f.name), 'utf8');
        const rows = parseCsv(content);
        for (const r of rows) {
          if (!r.email || !r.username) continue;
          const lowerEmail = r.email.toLowerCase();
          if (!byEmail.has(lowerEmail)) {
            byEmail.set(lowerEmail, {
              username: r.username,
              temporaryPassword: r.temporaryPassword,
              fullName: r.fullName,
              email: r.email,
              baseRole: r.baseRole,
              adminTier: r.adminTier,
              classificationOrEntryType: r.classification_or_entryType,
              department: r.department,
              coreBranch: r.coreBranch,
              year: r.year,
              semester: r.semester,
            });
          }
        }
      }
    }
  } catch {
    // credentials/ does not exist yet
  }

  return byEmail;
}

async function runInBatches(items, batchSize, worker, label = '', onBatchComplete = null) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    const chunkResults = await Promise.all(chunk.map((item, idx) => worker(item, i + idx)));
    results.push(...chunkResults);
    if (onBatchComplete) {
      await onBatchComplete(i + chunk.length, items.length, chunkResults);
    }
    if (label && ((i + chunk.length) % 100 === 0 || i + chunk.length === items.length)) {
      console.log(`  ${label}: ${i + chunk.length}/${items.length} processed`);
    }
  }
  return results;
}

async function lookupUsernameByEmail(email, token) {
  const res = await httpJson(`${API_BASE}/users/search?q=${encodeURIComponent(email)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.ok && Array.isArray(res.data?.results) && res.data.results.length > 0) {
    return res.data.results[0].username;
  }
  return null;
}

function toExportRow(rec) {
  return {
    username: rec.username,
    temporaryPassword: rec.temporaryPassword,
    fullName: rec.fullName,
    email: rec.email,
    baseRole: rec.baseRole,
    adminTier: rec.adminTier ?? '',
    classification_or_entryType: rec.classificationOrEntryType ?? '',
    department: rec.department ?? '',
    coreBranch: rec.coreBranch ?? '',
    year: rec.year ?? '',
    semester: rec.semester ?? '',
  };
}

async function exportCredentials(records) {
  await fs.mkdir(CREDENTIALS_DIR, { recursive: true });
  const folders = ['ADMIN_PORTALS', ...ALL_DEPARTMENTS];
  for (const folder of folders) {
    await fs.mkdir(path.join(CREDENTIALS_DIR, folder), { recursive: true });
  }

  const fileRowCounts = {};

  // 1. ADMIN_PORTALS/admin_credentials.csv & ADMIN_PORTALS/all_hods.csv
  const adminRows = records.admins.map(toExportRow);
  await fs.writeFile(
    path.join(CREDENTIALS_DIR, 'ADMIN_PORTALS', 'admin_credentials.csv'),
    toCsv(CRED_HEADERS, adminRows),
    'utf8'
  );
  fileRowCounts['ADMIN_PORTALS/admin_credentials.csv'] = adminRows.length;

  const allHodRows = records.hods.map(toExportRow);
  await fs.writeFile(
    path.join(CREDENTIALS_DIR, 'ADMIN_PORTALS', 'all_hods.csv'),
    toCsv(CRED_HEADERS, allHodRows),
    'utf8'
  );
  fileRowCounts['ADMIN_PORTALS/all_hods.csv'] = allHodRows.length;

  // 2. Per-department HOD & Faculty CSVs across all 11 departments
  for (const dept of ALL_DEPARTMENTS) {
    const deptHods = records.hods.filter((h) => h.department === dept).map(toExportRow);
    const deptFaculty = records.faculty.filter((f) => f.department === dept).map(toExportRow);

    await fs.writeFile(
      path.join(CREDENTIALS_DIR, dept, 'hod_credentials.csv'),
      toCsv(CRED_HEADERS, deptHods),
      'utf8'
    );
    fileRowCounts[`${dept}/hod_credentials.csv`] = deptHods.length;

    await fs.writeFile(
      path.join(CREDENTIALS_DIR, dept, 'faculty_credentials.csv'),
      toCsv(CRED_HEADERS, deptFaculty),
      'utf8'
    );
    fileRowCounts[`${dept}/faculty_credentials.csv`] = deptFaculty.length;
  }

  // 3. Per-folder Student CSVs (ALLIED_SCIENCE for Year-1, Core Branch for Years 2-4)
  for (const folder of STUDENT_FOLDERS) {
    const deptStudents = records.students.filter((s) => s.department === folder).map(toExportRow);
    await fs.writeFile(
      path.join(CREDENTIALS_DIR, folder, 'student_credentials.csv'),
      toCsv(CRED_HEADERS, deptStudents),
      'utf8'
    );
    fileRowCounts[`${folder}/student_credentials.csv`] = deptStudents.length;
  }

  return fileRowCounts;
}

async function main() {
  let spawnedServer = null;
  const partialRecords = {
    admins: [SUPER_ADMIN, PREEXISTING_RECORDS.admAdmin],
    hods: [PREEXISTING_RECORDS.dsHod],
    faculty: [PREEXISTING_RECORDS.dsFaculty],
    students: [...PREEXISTING_RECORDS.dsStudents],
  };

  const handleSignal = async (sig) => {
    console.warn(`Received ${sig}, flushing partial credentials & shutting down cleanly...`);
    try {
      await exportCredentials(partialRecords);
    } catch {}
    await stopSpawnedServer(spawnedServer);
    process.exit(1);
  };
  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);

  try {
    // Step 1: Write deterministic collision-free source CSVs
    await writeSourceCsvs();

    // Step 2: Start Express server if port 5000 is not already listening
    spawnedServer = await ensureServerRunning();

    // Step 3: Authenticate as Super Admin
    const token = await getSuperAdminToken();

    // Pre-check overview before seeding
    const initialOverview = await httpJson(`${API_BASE}/analytics/overview`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (initialOverview.ok) {
      console.log('  Initial DB totals:', JSON.stringify(initialOverview.data.totals));
    }

    // Load cached credentials for idempotency
    const existingByEmail = await loadExistingCredentialCache();

    // Read source CSVs back from backend/seed_data/
    const [portalAdminCsv, hodCsv, facultyCsv, studentCsv] = await Promise.all([
      fs.readFile(path.join(SEED_DATA_DIR, 'portal_admins.csv'), 'utf8').then(parseCsv),
      fs.readFile(path.join(SEED_DATA_DIR, 'hods.csv'), 'utf8').then(parseCsv),
      fs.readFile(path.join(SEED_DATA_DIR, 'faculty.csv'), 'utf8').then(parseCsv),
      fs.readFile(path.join(SEED_DATA_DIR, 'students.csv'), 'utf8').then(parseCsv),
    ]);

    const stats = {
      created: { admins: 0, hods: 0, faculty: 0, students: 0 },
      skipped409: { admins: 0, hods: 0, faculty: 0, students: 0 },
    };

    // Step 4A: Provision 7 Portal Admins
    console.log('[4/5] Provisioning Portal Admins, HODs, Faculty, and Students in batches of 10...');
    const provisionedAdmins = await runInBatches(
      portalAdminCsv,
      10,
      async (row) => {
        const res = await httpJson(`${API_BASE}/super-admin/provision-authority`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            authorityType: 'REGULAR_ADMIN',
            fullName: row.fullName,
            email: row.email,
            phone: row.phone,
            sectionCode: row.sectionCode,
            subRoles: row.subRoles ? row.subRoles.split('|').filter(Boolean) : [],
          }),
        });

        let rec;
        if (res.status === 201 && res.data?.username) {
          stats.created.admins++;
          rec = {
            username: res.data.username,
            temporaryPassword: res.data.temporaryPassword,
            fullName: row.fullName,
            email: row.email,
            baseRole: 'ADMIN',
            adminTier: 'REGULAR_ADMIN',
            classificationOrEntryType: row.sectionCode,
            department: '',
            coreBranch: '',
            year: '',
            semester: '',
          };
        } else if (res.status === 409) {
          stats.skipped409.admins++;
          const cached = existingByEmail.get(row.email.toLowerCase());
          if (cached) {
            rec = cached;
          } else {
            const foundUsername = await lookupUsernameByEmail(row.email, token);
            rec = {
              username: foundUsername || `RLADM_${row.sectionCode}_EXISTING`,
              temporaryPassword: '<ALREADY_PROVISIONED>',
              fullName: row.fullName,
              email: row.email,
              baseRole: 'ADMIN',
              adminTier: 'REGULAR_ADMIN',
              classificationOrEntryType: row.sectionCode,
              department: '',
              coreBranch: '',
              year: '',
              semester: '',
            };
          }
        } else {
          throw new Error(
            `Portal Admin provisioning failed (${res.status}) for ${row.email}: ${JSON.stringify(res.data)}`
          );
        }
        partialRecords.admins.push(rec);
        return rec;
      },
      'Portal Admins'
    );

    // Step 4B: Provision 11 HODs (DS HOD returns 409 and preserves RLHOD26DS001)
    partialRecords.hods = [];
    const provisionedHods = await runInBatches(
      hodCsv,
      10,
      async (row) => {
        const res = await httpJson(`${API_BASE}/super-admin/provision-authority`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            authorityType: 'HOD',
            fullName: row.fullName,
            email: row.email,
            phone: row.phone,
            department: row.department,
            classification: row.classification,
            designation: row.designation,
            cabinRoom: row.cabinRoom,
            subRoles: row.subRoles ? row.subRoles.split('|').filter(Boolean) : ['HOD'],
          }),
        });

        let rec;
        if (res.status === 201 && res.data?.username) {
          stats.created.hods++;
          rec = {
            username: res.data.username,
            temporaryPassword: res.data.temporaryPassword,
            fullName: row.fullName,
            email: row.email,
            baseRole: 'FACULTY',
            adminTier: 'HOD_ADMIN',
            classificationOrEntryType: row.classification,
            department: row.department,
            coreBranch: '',
            year: '',
            semester: '',
          };
        } else if (res.status === 409) {
          stats.skipped409.hods++;
          if (row.department === 'DS') {
            console.log(`  [409 Skip] DS HOD already exists -> preserving ${PREEXISTING_RECORDS.dsHod.username}`);
            rec = PREEXISTING_RECORDS.dsHod;
          } else {
            const cached = existingByEmail.get(row.email.toLowerCase());
            if (cached) {
              rec = cached;
            } else {
              const foundUsername = await lookupUsernameByEmail(row.email, token);
              rec = {
                username: foundUsername || `RLHOD26${row.department}001`,
                temporaryPassword: '<ALREADY_PROVISIONED>',
                fullName: row.fullName,
                email: row.email,
                baseRole: 'FACULTY',
                adminTier: 'HOD_ADMIN',
                classificationOrEntryType: row.classification,
                department: row.department,
                coreBranch: '',
                year: '',
                semester: '',
              };
            }
          }
        } else {
          throw new Error(
            `HOD provisioning failed (${res.status}) for ${row.department}: ${JSON.stringify(res.data)}`
          );
        }
        partialRecords.hods.push(rec);
        return rec;
      },
      'HODs'
    );

    // Step 4C: Provision 310 Faculty in batches of 10
    const provisionedFaculty = await runInBatches(
      facultyCsv,
      10,
      async (row) => {
        const res = await httpJson(`${API_BASE}/super-admin/provision-authority`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            authorityType: 'FACULTY',
            fullName: row.fullName,
            email: row.email,
            phone: row.phone,
            department: row.department,
            classification: row.classification,
            designation: row.designation,
            cabinRoom: row.cabinRoom,
            subRoles: row.subRoles ? row.subRoles.split('|').filter(Boolean) : ['TEACHER'],
          }),
        });

        let rec;
        if (res.status === 201 && res.data?.username) {
          stats.created.faculty++;
          rec = {
            username: res.data.username,
            temporaryPassword: res.data.temporaryPassword,
            fullName: row.fullName,
            email: row.email,
            baseRole: 'FACULTY',
            adminTier: '',
            classificationOrEntryType: row.classification,
            department: row.department,
            coreBranch: '',
            year: '',
            semester: '',
          };
        } else if (res.status === 409) {
          stats.skipped409.faculty++;
          const cached = existingByEmail.get(row.email.toLowerCase());
          if (cached) {
            rec = cached;
          } else {
            const foundUsername = await lookupUsernameByEmail(row.email, token);
            rec = {
              username: foundUsername || `RLFAC_EXISTING`,
              temporaryPassword: '<ALREADY_PROVISIONED>',
              fullName: row.fullName,
              email: row.email,
              baseRole: 'FACULTY',
              adminTier: '',
              classificationOrEntryType: row.classification,
              department: row.department,
              coreBranch: '',
              year: '',
              semester: '',
            };
          }
        } else {
          throw new Error(
            `Faculty provisioning failed (${res.status}) for ${row.email}: ${JSON.stringify(res.data)}`
          );
        }
        partialRecords.faculty.push(rec);
        return rec;
      },
      'Faculty'
    );

    // Flush Admins, HODs, Faculty before starting the 2,061-student loop
    await exportCredentials(partialRecords);

    // Step 4D: Provision 2,061 Students in batches of 10
    const provisionedStudents = await runInBatches(
      studentCsv,
      10,
      async (row) => {
        const res = await httpJson(`${API_BASE}/portals/provision-student`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            fullName: row.fullName,
            email: row.email,
            phone: row.phone,
            department: row.department,
            coreBranch: row.coreBranch,
            admissionYear: parseInt(row.admissionYear, 10),
            academicYear: parseInt(row.academicYear, 10),
            semester: parseInt(row.semester, 10),
            section: row.section,
            entryType: row.entryType,
            admissionQuota: row.admissionQuota,
            cgpa: parseFloat(row.cgpa),
            subRoles: ['STUDENT'],
          }),
        });

        let rec;
        if (res.status === 201 && res.data?.credentials?.username) {
          stats.created.students++;
          rec = {
            username: res.data.credentials.username,
            temporaryPassword: res.data.credentials.temporaryPassword,
            fullName: row.fullName,
            email: row.email,
            baseRole: 'STUDENT',
            adminTier: '',
            classificationOrEntryType: row.entryType,
            department: row.department,
            coreBranch: row.coreBranch,
            year: row.academicYear,
            semester: row.semester,
          };
        } else if (res.status === 409) {
          stats.skipped409.students++;
          const cached = existingByEmail.get(row.email.toLowerCase());
          if (cached) {
            rec = cached;
          } else {
            const foundUsername = await lookupUsernameByEmail(row.email, token);
            rec = {
              username: foundUsername || `1RL_EXISTING`,
              temporaryPassword: '<ALREADY_PROVISIONED>',
              fullName: row.fullName,
              email: row.email,
              baseRole: 'STUDENT',
              adminTier: '',
              classificationOrEntryType: row.entryType,
              department: row.department,
              coreBranch: row.coreBranch,
              year: row.academicYear,
              semester: row.semester,
            };
          }
        } else {
          throw new Error(
            `Student provisioning failed (${res.status}) for ${row.email}: ${JSON.stringify(res.data)}`
          );
        }
        partialRecords.students.push(rec);
        return rec;
      },
      'Students',
      async (processedCount) => {
        if (processedCount % 300 === 0) {
          await exportCredentials(partialRecords);
        }
      }
    );

    // Combine with preserved pre-existing accounts (deduped cleanly)
    const allAdmins = [SUPER_ADMIN, PREEXISTING_RECORDS.admAdmin, ...provisionedAdmins];
    const allHods = provisionedHods; // DS slot already maps to PREEXISTING_RECORDS.dsHod
    const allFaculty = [PREEXISTING_RECORDS.dsFaculty, ...provisionedFaculty];
    const allStudents = [...PREEXISTING_RECORDS.dsStudents, ...provisionedStudents];

    // Sort cleanly for readable CSVs
    allFaculty.sort((a, b) => a.username.localeCompare(b.username));
    allStudents.sort(
      (a, b) =>
        Number(a.year) - Number(b.year) ||
        a.coreBranch.localeCompare(b.coreBranch) ||
        a.username.localeCompare(b.username)
    );

    const fileRowCounts = await exportCredentials({
      admins: allAdmins,
      hods: allHods,
      faculty: allFaculty,
      students: allStudents,
    });

    console.log('\n[5/5] Verifying live PostgreSQL storage & analytics via Express HTTP API...');
    const [overviewRes, verifyRes] = await Promise.all([
      httpJson(`${API_BASE}/analytics/overview`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      }),
      httpJson(`${API_BASE}/db/verify-storage`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);

    if (!overviewRes.ok || !verifyRes.ok) {
      throw new Error('Verification endpoints failed after provisioning');
    }

    const totalExported =
      allAdmins.length + allHods.length + allFaculty.length + allStudents.length;

    console.log('\n=== PROVISIONING RUN SUMMARY ===');
    console.log('API Created:', JSON.stringify(stats.created));
    console.log('409 Skipped (Idempotent):', JSON.stringify(stats.skipped409));
    console.log('Total Credentials Exported (unique):', totalExported);
    console.log('  Admins (Super + Portal):', allAdmins.length);
    console.log('  HODs:', allHods.length);
    console.log('  Faculty (non-HOD):', allFaculty.length);
    console.log('  Students:', allStudents.length);

    console.log('\n=== LIVE DB COUNTS (GET /api/v1/db/verify-storage) ===');
    console.log(JSON.stringify(verifyRes.data.liveTableCounts, null, 2));

    console.log('\n=== LIVE ANALYTICS OVERVIEW (GET /api/v1/analytics/overview) ===');
    console.log('totals:', JSON.stringify(overviewRes.data.totals));
    console.log('studentsByDepartment:', JSON.stringify(overviewRes.data.studentsByDepartment));
    console.log('alliedScienceByBranch:', JSON.stringify(overviewRes.data.alliedScienceByBranch));
    console.log('studentsByYear:', JSON.stringify(overviewRes.data.studentsByYear));
    console.log('facultyByClassification:', JSON.stringify(overviewRes.data.facultyByClassification));
    console.log('facultyByDepartment:', JSON.stringify(overviewRes.data.facultyByDepartment));

    console.log('\n=== EXPORTED CREDENTIAL CSV ROW COUNTS ===');
    for (const [relPath, count] of Object.entries(fileRowCounts)) {
      console.log(`  credentials/${relPath}: ${count}`);
    }

    if (verifyRes.data.liveTableCounts.student !== 2064) {
      throw new Error(
        `Student count mismatch: expected 2064, got ${verifyRes.data.liveTableCounts.student}`
      );
    }
    if (verifyRes.data.liveTableCounts.faculty !== 322) {
      throw new Error(
        `Faculty table count mismatch (311 Faculty + 11 HODs): expected 322, got ${verifyRes.data.liveTableCounts.faculty}`
      );
    }
    if (verifyRes.data.liveTableCounts.users < 2380) {
      throw new Error(
        `Total users below threshold 2380: got ${verifyRes.data.liveTableCounts.users}`
      );
    }
  } catch (err) {
    try {
      if (partialRecords.students.length > 3 || partialRecords.faculty.length > 1) {
        await exportCredentials(partialRecords);
      }
    } catch {}
    throw err;
  } finally {
    await stopSpawnedServer(spawnedServer);
  }
}

main().catch((err) => {
  console.error('Fatal error in seed_identities.mjs:', err);
  process.exit(1);
});
