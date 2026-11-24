import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool, { ensureDatabaseExists } from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEED_DATA_DIR = path.resolve(__dirname, '../../seed_data');
const CREDENTIALS_DIR = path.resolve(__dirname, '../../../credentials');

// In-memory job tracker for asynchronous bulk provisioning
export const jobStore = new Map();

/**
 * Ensures seed data and credentials directory trees exist
 */
function ensureDirectories() {
  if (!fs.existsSync(SEED_DATA_DIR)) {
    fs.mkdirSync(SEED_DATA_DIR, { recursive: true });
  }
  const deptFolders = [
    'AIML',
    'DS',
    'CYBER',
    'CSE',
    'ME',
    'ECE',
    'ALLIED_SCIENCE',
    'ADMIN_PORTALS',
  ];
  for (const dept of deptFolders) {
    const p = path.join(CREDENTIALS_DIR, dept);
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p, { recursive: true });
    }
  }
}

/**
 * Concurrency runner for processing arrays with maximum N concurrent workers
 */
async function runConcurrent(items, limit, workerFn) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index++;
      try {
        const res = await workerFn(items[currentIndex], currentIndex);
        results[currentIndex] = { success: true, data: res };
      } catch (err) {
        results[currentIndex] = { success: false, error: err.message };
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Helper to perform HTTP loopback JSON requests
 */
async function httpLoopback(port, method, pathUrl, body = null, headers = {}) {
  const url = `http://127.0.0.1:${port}${pathUrl}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const resp = await fetch(url, options);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok && resp.status !== 200 && resp.status !== 201) {
    throw new Error(data.error || `HTTP ${resp.status} on ${pathUrl}`);
  }
  return data;
}

/**
 * Step A: Generate Master CSVs in backend/seed_data/
 */
export async function generateMasterCsvFiles() {
  ensureDirectories();

  // 1. HODs (11 HODs across departments)
  const hods = [
    { authorityType: 'HOD', fullName: 'Dr. Ramesh Sharma', email: 'hod.cse@rljit.ac.in', phone: '+919845033441', department: 'CSE', subRoles: 'HOD;DEPT_HEAD' },
    { authorityType: 'HOD', fullName: 'Dr. Ananya Verma', email: 'hod.aiml@rljit.ac.in', phone: '+919845033442', department: 'AIML', subRoles: 'HOD;DEPT_HEAD' },
    { authorityType: 'HOD', fullName: 'Dr. Suresh Babu', email: 'hod.ds@rljit.ac.in', phone: '+919845033443', department: 'DS', subRoles: 'HOD;DEPT_HEAD' },
    { authorityType: 'HOD', fullName: 'Dr. Vikramaditya Rao', email: 'hod.cyber@rljit.ac.in', phone: '+919845033444', department: 'CYBER', subRoles: 'HOD;DEPT_HEAD' },
    { authorityType: 'HOD', fullName: 'Dr. Manjunath Swamy', email: 'hod.me@rljit.ac.in', phone: '+919845033445', department: 'ME', subRoles: 'HOD;DEPT_HEAD' },
    { authorityType: 'HOD', fullName: 'Dr. Priya Raghavan', email: 'hod.ece@rljit.ac.in', phone: '+919845033446', department: 'ECE', subRoles: 'HOD;DEPT_HEAD' },
    { authorityType: 'HOD', fullName: 'Dr. Girish K', email: 'hod.allied@rljit.ac.in', phone: '+919845033447', department: 'ALLIED_SCIENCE', subRoles: 'HOD;DEPT_HEAD' },
    { authorityType: 'HOD', fullName: 'Dr. Lakshmi Narayana', email: 'hod.math@rljit.ac.in', phone: '+919845033448', department: 'MATH_SCI', subRoles: 'HOD;DEPT_HEAD' },
    { authorityType: 'HOD', fullName: 'Dr. Harish Kumar', email: 'hod.chem@rljit.ac.in', phone: '+919845033449', department: 'PHY_CHEM', subRoles: 'HOD;DEPT_HEAD' },
    { authorityType: 'HOD', fullName: 'Dr. Sunita Deshpande', email: 'hod.hum@rljit.ac.in', phone: '+919845033450', department: 'HUMANITIES', subRoles: 'HOD;DEPT_HEAD' },
    { authorityType: 'HOD', fullName: 'Dr. B. R. Srinivas', email: 'hod.rnd@rljit.ac.in', phone: '+919845033451', department: 'RND_ACADEMICS', subRoles: 'HOD;DEPT_HEAD' },
  ];

  const hodCsvLines = ['authorityType,fullName,email,phone,department,subRoles'];
  for (const h of hods) {
    hodCsvLines.push(`${h.authorityType},"${h.fullName}",${h.email},${h.phone},${h.department},"${h.subRoles}"`);
  }
  fs.writeFileSync(path.join(SEED_DATA_DIR, 'hods.csv'), hodCsvLines.join('\n'), 'utf-8');

  // 2. Portal Admins (7 Section Admins)
  const portalAdmins = [
    { authorityType: 'REGULAR_ADMIN', fullName: 'Kiran Kumar (Admissions)', email: 'admin.admission@rljit.ac.in', phone: '+919845011001', sectionCode: 'ADM', subRoles: 'ADMISSION_OFFICER' },
    { authorityType: 'REGULAR_ADMIN', fullName: 'Mahesh Gowda (Finance)', email: 'admin.finance@rljit.ac.in', phone: '+919845011002', sectionCode: 'ACC', subRoles: 'FINANCE_OFFICER' },
    { authorityType: 'REGULAR_ADMIN', fullName: 'Deepak Chawla (Placements)', email: 'admin.placements@rljit.ac.in', phone: '+919845011003', sectionCode: 'PLC', subRoles: 'PLACEMENT_OFFICER' },
    { authorityType: 'REGULAR_ADMIN', fullName: 'Santosh Naik (Sports)', email: 'admin.sports@rljit.ac.in', phone: '+919845011004', sectionCode: 'SPT', subRoles: 'SPORTS_DIRECTOR' },
    { authorityType: 'REGULAR_ADMIN', fullName: 'Rajendra Prasad (Management)', email: 'admin.management@rljit.ac.in', phone: '+919845011005', sectionCode: 'MGT', subRoles: 'MANAGEMENT_OFFICER' },
    { authorityType: 'REGULAR_ADMIN', fullName: 'Dr. B. K. Sridhar (Principal)', email: 'admin.principal@rljit.ac.in', phone: '+919845011006', sectionCode: 'PRN', subRoles: 'PRINCIPAL' },
    { authorityType: 'REGULAR_ADMIN', fullName: 'Geetha Nataraj (Exam Cell)', email: 'admin.examcell@rljit.ac.in', phone: '+919845011007', sectionCode: 'EXM', subRoles: 'CONTROLLER_OF_EXAMS' },
  ];

  const adminCsvLines = ['authorityType,fullName,email,phone,sectionCode,subRoles'];
  for (const a of portalAdmins) {
    adminCsvLines.push(`${a.authorityType},"${a.fullName}",${a.email},${a.phone},${a.sectionCode},"${a.subRoles}"`);
  }
  fs.writeFileSync(path.join(SEED_DATA_DIR, 'portal_admins.csv'), adminCsvLines.join('\n'), 'utf-8');

  // 3. Faculty (310+ distributed across departments with classifications)
  const departments = ['CSE', 'AIML', 'DS', 'CYBER', 'ME', 'ECE', 'ALLIED_SCIENCE', 'MATH_SCI', 'PHY_CHEM', 'HUMANITIES', 'RND_ACADEMICS'];
  const classifications = ['Assistant Professor', 'Professor', 'Associate Professor', 'Programmer', 'Lab Assistant'];
  const faculty = [];

  let facPhoneCounter = 1000;
  for (let d = 0; d < departments.length; d++) {
    const dept = departments[d];
    // Allocate ~28-30 faculty per department to total 315+
    const count = d === 0 ? 35 : 28;
    for (let i = 1; i <= count; i++) {
      const cls = classifications[i % classifications.length];
      const fname = `Faculty ${dept} ${i}`;
      const email = `faculty.${dept.toLowerCase()}.${i}@rljit.ac.in`;
      const phone = `+919845${String(facPhoneCounter++).padStart(6, '0')}`;
      faculty.push({
        authorityType: 'FACULTY',
        fullName: fname,
        email,
        phone,
        department: dept,
        classification: cls,
        subRoles: i % 5 === 0 ? 'MENTOR;CLASS_ADVISOR' : 'TEACHER',
      });
    }
  }

  const facultyCsvLines = ['authorityType,fullName,email,phone,department,classification,subRoles'];
  for (const f of faculty) {
    facultyCsvLines.push(`${f.authorityType},"${f.fullName}",${f.email},${f.phone},${f.department},"${f.classification}","${f.subRoles}"`);
  }
  fs.writeFileSync(path.join(SEED_DATA_DIR, 'faculty.csv'), facultyCsvLines.join('\n'), 'utf-8');

  // 4. Students (Exact Intake: 2,064 students total)
  // Year 1 (480 regular in ALLIED_SCIENCE with coreBranch):
  // 60 AIML, 60 DS, 60 CYBER, 180 CSE, 60 ME, 60 ECE
  // Years 2, 3, 4: 480 regular + 48 lateral each year = 528 * 3 = 1,584
  // Total = 480 + 1,584 = 2,064
  const students = [];
  const branchConfig = [
    { branch: 'AIML', regular: 60, lateral: 6 },
    { branch: 'DS', regular: 60, lateral: 6 },
    { branch: 'CYBER', regular: 60, lateral: 6 },
    { branch: 'CSE', regular: 180, lateral: 18 },
    { branch: 'ME', regular: 60, lateral: 6 },
    { branch: 'ECE', regular: 60, lateral: 6 },
  ];

  let stuPhoneCounter = 10000;

  // Year 1 (Sem 1)
  for (const cfg of branchConfig) {
    for (let i = 1; i <= cfg.regular; i++) {
      students.push({
        fullName: `Student Year1 ${cfg.branch} ${i}`,
        email: `stu.y1.${cfg.branch.toLowerCase()}.${i}@student.rljit.ac.in`,
        phone: `+919876${String(stuPhoneCounter++).padStart(6, '0')}`,
        department: 'ALLIED_SCIENCE',
        coreBranch: cfg.branch,
        admissionYear: 2026,
        semester: 1,
        academicYear: 1,
        entryType: 'REGULAR',
      });
    }
  }

  // Years 2, 3, 4
  const yearSemMap = [
    { year: 2, sem: 3, admYear: 2025 },
    { year: 3, sem: 5, admYear: 2024 },
    { year: 4, sem: 7, admYear: 2023 },
  ];

  for (const ym of yearSemMap) {
    for (const cfg of branchConfig) {
      // Regular intake
      for (let i = 1; i <= cfg.regular; i++) {
        students.push({
          fullName: `Student Year${ym.year} ${cfg.branch} ${i}`,
          email: `stu.y${ym.year}.${cfg.branch.toLowerCase()}.${i}@student.rljit.ac.in`,
          phone: `+919876${String(stuPhoneCounter++).padStart(6, '0')}`,
          department: cfg.branch,
          coreBranch: cfg.branch,
          admissionYear: ym.admYear,
          semester: ym.sem,
          academicYear: ym.year,
          entryType: 'REGULAR',
        });
      }
      // Lateral intake (~10%)
      for (let i = 1; i <= cfg.lateral; i++) {
        students.push({
          fullName: `Student Year${ym.year} Lateral ${cfg.branch} ${i}`,
          email: `stu.y${ym.year}.lat.${cfg.branch.toLowerCase()}.${i}@student.rljit.ac.in`,
          phone: `+919876${String(stuPhoneCounter++).padStart(6, '0')}`,
          department: cfg.branch,
          coreBranch: cfg.branch,
          admissionYear: ym.admYear + 1, // joined 1 year later directly in 2nd year
          semester: ym.sem,
          academicYear: ym.year,
          entryType: 'LATERAL',
        });
      }
    }
  }

  const studentCsvLines = ['fullName,email,phone,department,coreBranch,admissionYear,semester,academicYear,entryType'];
  for (const s of students) {
    studentCsvLines.push(`"${s.fullName}",${s.email},${s.phone},${s.department},${s.coreBranch},${s.admissionYear},${s.semester},${s.academicYear},${s.entryType}`);
  }
  fs.writeFileSync(path.join(SEED_DATA_DIR, 'students.csv'), studentCsvLines.join('\n'), 'utf-8');

  // 5. Venues and dummy bookings CSV
  const venuesCsv = [
    'name,type,department,capacity,location_details',
    '"Sir M. Visvesvaraya Auditorium",AUDITORIUM,CENTRAL,600,"Main Block, 2nd Floor"',
    '"Aryabhata Seminar Hall",SEMINAR_HALL,CSE,200,"CSE Block, Ground Floor"',
    '"Turing Computing Lab",LAB,AIML,120,"Tech Park, 3rd Floor"',
    '"Kalam Conference Hall",CONFERENCE_ROOM,CENTRAL,80,"Administrative Block, 1st Floor"',
    '"Open Air Amphitheatre",OPEN_AIR_THEATRE,CENTRAL,1200,"Campus Quadrangle"',
  ].join('\n');
  fs.writeFileSync(path.join(SEED_DATA_DIR, 'venues_and_bookings.csv'), venuesCsv, 'utf-8');

  // 6. Placements CSV
  const placementsCsv = [
    'company_name,role_title,package_lpa,min_cgpa,eligible_branches,drive_date,status',
    '"Google India","Software Development Engineer",32.50,8.0,"CSE,AIML,DS,CYBER",2026-12-15,ACTIVE',
    '"Microsoft Corporation","Cloud Solutions Architect",28.00,7.5,"CSE,AIML,DS,CYBER,ECE",2026-12-20,UPCOMING',
    '"Bosch Global","Embedded Systems Engineer",12.00,7.0,"ECE,ME",2027-01-10,UPCOMING',
    '"TCS Digital","Systems Engineer",7.50,6.5,"CSE,AIML,DS,CYBER,ME,ECE",2027-01-25,UPCOMING',
  ].join('\n');
  fs.writeFileSync(path.join(SEED_DATA_DIR, 'placements.csv'), placementsCsv, 'utf-8');

  // 7. Finance dummy records CSV
  const financeCsv = [
    'fee_type,amount_due,due_date',
    'TUITION,95000.00,2026-12-31',
    'EXAMINATION,3500.00,2026-12-15',
    'HOSTEL_MESS,65000.00,2027-01-15',
    'LIBRARY_DEPOSIT,2000.00,2026-11-30',
  ].join('\n');
  fs.writeFileSync(path.join(SEED_DATA_DIR, 'finance.csv'), financeCsv, 'utf-8');

  return {
    hodsCount: hods.length,
    portalAdminsCount: portalAdmins.length,
    facultyCount: faculty.length,
    studentsCount: students.length,
    totalRecords: hods.length + portalAdmins.length + faculty.length + students.length,
    seedDataDir: SEED_DATA_DIR,
  };
}

/**
 * Step B & C: Execute Internal Bulk Provisioning via Live API Loopback
 */
export async function executeBulkProvisioning(jobId, port = 5000) {
  const job = {
    id: jobId,
    status: 'PROCESSING',
    progress: 0,
    currentStage: 'GENERATING_CSVS',
    counts: { hods: 0, portalAdmins: 0, faculty: 0, students: 0, venues: 0 },
    errors: [],
    startTime: new Date().toISOString(),
    endTime: null,
    credentialsExportPath: CREDENTIALS_DIR,
  };
  jobStore.set(jobId, job);

  // Run asynchronously
  (async () => {
    try {
      await ensureDatabaseExists();

      // 1. Generate Master CSVs
      job.currentStage = 'GENERATING_CSVS';
      const csvMeta = await generateMasterCsvFiles();
      job.progress = 5;

      // 2. Ensure Super Admin and Obtain Live JWT Token
      job.currentStage = 'AUTHENTICATING_SUPER_ADMIN';
      let superAdminToken = '';
      try {
        const loginRes = await httpLoopback(port, 'POST', '/api/v1/auth/login', {
          username: 'RLSUPER001',
          password: 'p$4K9!vQ2#xM',
        });
        superAdminToken = loginRes.token;
      } catch {
        // If not bootstrapped, bootstrap now
        await httpLoopback(port, 'POST', '/api/v1/auth/bootstrap-super-admin', {
          fullName: 'Mastermind Super Admin',
          email: 'superadmin@rljit.ac.in',
          phone: '+919888877777',
          password: 'p$4K9!vQ2#xM',
        }).catch(() => {});

        const loginRes = await httpLoopback(port, 'POST', '/api/v1/auth/login', {
          username: 'RLSUPER001',
          password: 'p$4K9!vQ2#xM',
        });
        superAdminToken = loginRes.token;
      }

      job.progress = 10;
      const superAdminHeaders = {
        Authorization: `Bearer ${superAdminToken}`,
        'x-idempotent': 'true',
      };

      // Credential collection maps by department
      const credentialsByDept = {
        AIML: { hods: [], faculty: [], students: [] },
        DS: { hods: [], faculty: [], students: [] },
        CYBER: { hods: [], faculty: [], students: [] },
        CSE: { hods: [], faculty: [], students: [] },
        ME: { hods: [], faculty: [], students: [] },
        ECE: { hods: [], faculty: [], students: [] },
        ALLIED_SCIENCE: { hods: [], faculty: [], students: [] },
        ADMIN_PORTALS: { hods: [], faculty: [], students: [] },
      };

      // 3. Provision Portal Admins (Concurrency 5)
      job.currentStage = 'PROVISIONING_PORTAL_ADMINS';
      const adminLines = fs.readFileSync(path.join(SEED_DATA_DIR, 'portal_admins.csv'), 'utf-8').trim().split('\n').slice(1);
      const adminItems = adminLines.map((l) => {
        const parts = l.split(',');
        return {
          authorityType: parts[0],
          fullName: parts[1].replace(/"/g, ''),
          email: parts[2],
          phone: parts[3],
          sectionCode: parts[4],
          subRoles: parts[5].replace(/"/g, '').split(';'),
          idempotent: true,
        };
      });

      const adminResults = await runConcurrent(adminItems, 5, async (item) => {
        return httpLoopback(port, 'POST', '/api/v1/super-admin/provision-authority', item, superAdminHeaders);
      });
      job.counts.portalAdmins = adminResults.filter((r) => r.success).length;
      job.progress = 15;

      // 4. Provision HODs (Concurrency 5)
      job.currentStage = 'PROVISIONING_HODS';
      const hodLines = fs.readFileSync(path.join(SEED_DATA_DIR, 'hods.csv'), 'utf-8').trim().split('\n').slice(1);
      const hodItems = hodLines.map((l) => {
        const parts = l.split(',');
        return {
          authorityType: parts[0],
          fullName: parts[1].replace(/"/g, ''),
          email: parts[2],
          phone: parts[3],
          department: parts[4],
          subRoles: parts[5].replace(/"/g, '').split(';'),
          idempotent: true,
        };
      });

      const hodResults = await runConcurrent(hodItems, 5, async (item) => {
        const res = await httpLoopback(port, 'POST', '/api/v1/super-admin/provision-authority', item, superAdminHeaders);
        const deptKey = credentialsByDept[item.department] ? item.department : 'ALLIED_SCIENCE';
        credentialsByDept[deptKey].hods.push({
          username: res.user?.username || 'N/A',
          temporaryPassword: res.credentials?.temporaryPassword || 'p$4K9!vQ2#xM',
          fullName: item.fullName,
          email: item.email,
          role: 'HOD',
          department: item.department,
        });
        return res;
      });
      job.counts.hods = hodResults.filter((r) => r.success).length;
      job.progress = 25;

      // 5. Provision Faculty (310+ in Batches of 10)
      job.currentStage = 'PROVISIONING_FACULTY';
      const facLines = fs.readFileSync(path.join(SEED_DATA_DIR, 'faculty.csv'), 'utf-8').trim().split('\n').slice(1);
      const facItems = facLines.map((l) => {
        const parts = l.split(',');
        return {
          authorityType: parts[0],
          fullName: parts[1].replace(/"/g, ''),
          email: parts[2],
          phone: parts[3],
          department: parts[4],
          classification: parts[5].replace(/"/g, ''),
          subRoles: parts[6].replace(/"/g, '').split(';'),
          idempotent: true,
        };
      });

      const facResults = await runConcurrent(facItems, 10, async (item) => {
        const res = await httpLoopback(port, 'POST', '/api/v1/super-admin/provision-authority', item, superAdminHeaders);
        const deptKey = credentialsByDept[item.department] ? item.department : 'ALLIED_SCIENCE';
        credentialsByDept[deptKey].faculty.push({
          username: res.user?.username || 'N/A',
          temporaryPassword: res.credentials?.temporaryPassword || 'p$4K9!vQ2#xM',
          fullName: item.fullName,
          email: item.email,
          classification: item.classification,
          department: item.department,
        });
        return res;
      });
      job.counts.faculty = facResults.filter((r) => r.success).length;
      job.progress = 45;

      // 6. Provision Students (2,064 in Batches of 10)
      job.currentStage = 'PROVISIONING_STUDENTS';
      const stuLines = fs.readFileSync(path.join(SEED_DATA_DIR, 'students.csv'), 'utf-8').trim().split('\n').slice(1);
      const stuItems = stuLines.map((l) => {
        const parts = l.split(',');
        return {
          fullName: parts[0].replace(/"/g, ''),
          email: parts[1],
          phone: parts[2],
          department: parts[3],
          coreBranch: parts[4],
          admissionYear: parseInt(parts[5], 10),
          semester: parseInt(parts[6], 10),
          academicYear: parseInt(parts[7], 10),
          entryType: parts[8],
          idempotent: true,
        };
      });

      let completedStudents = 0;
      const stuResults = await runConcurrent(stuItems, 10, async (item) => {
        const res = await httpLoopback(port, 'POST', '/api/v1/portals/provision-student', item, superAdminHeaders);
        const deptKey = credentialsByDept[item.coreBranch] ? item.coreBranch : (credentialsByDept[item.department] ? item.department : 'ALLIED_SCIENCE');
        credentialsByDept[deptKey].students.push({
          username: res.user?.username || 'N/A',
          temporaryPassword: res.credentials?.temporaryPassword || 'p$4K9!vQ2#xM',
          fullName: item.fullName,
          email: item.email,
          year: item.academicYear,
          semester: item.semester,
          entryType: item.entryType,
          coreBranch: item.coreBranch,
        });
        completedStudents++;
        if (completedStudents % 200 === 0) {
          job.progress = 45 + Math.floor((completedStudents / stuItems.length) * 40);
        }
        return res;
      });
      job.counts.students = stuResults.filter((r) => r.success).length;
      job.progress = 85;

      // 7. Seed Venues & Academic Records
      job.currentStage = 'SEEDING_CAMPUS_DOMAINS';
      const venueRes = await pool.query(`
        INSERT INTO venues (name, type, department, capacity, location_details, is_active)
        VALUES
          ('Sir M. Visvesvaraya Auditorium', 'AUDITORIUM', 'CENTRAL', 600, 'Main Block, 2nd Floor', TRUE),
          ('Aryabhata Seminar Hall', 'SEMINAR_HALL', 'CSE', 200, 'CSE Block, Ground Floor', TRUE),
          ('Turing Computing Lab', 'LAB', 'AIML', 120, 'Tech Park, 3rd Floor', TRUE),
          ('Kalam Conference Hall', 'CONFERENCE_ROOM', 'CENTRAL', 80, 'Admin Block, 1st Floor', TRUE)
        ON CONFLICT DO NOTHING
        RETURNING id;
      `);
      job.counts.venues = venueRes.rowCount;

      // 8. Export Credentials by Department to Root /credentials/
      job.currentStage = 'EXPORTING_CREDENTIALS';
      for (const [dept, data] of Object.entries(credentialsByDept)) {
        const deptDir = path.join(CREDENTIALS_DIR, dept);
        if (!fs.existsSync(deptDir)) fs.mkdirSync(deptDir, { recursive: true });

        // HODs
        const hodLines = ['username,temporaryPassword,fullName,email,role,department'];
        for (const h of data.hods) {
          hodLines.push(`${h.username},${h.temporaryPassword},"${h.fullName}",${h.email},${h.role},${h.department}`);
        }
        fs.writeFileSync(path.join(deptDir, 'hod_credentials.csv'), hodLines.join('\n'), 'utf-8');

        // Faculty
        const facLines = ['username,temporaryPassword,fullName,email,classification,department'];
        for (const f of data.faculty) {
          facLines.push(`${f.username},${f.temporaryPassword},"${f.fullName}",${f.email},"${f.classification}",${f.department}`);
        }
        fs.writeFileSync(path.join(deptDir, 'faculty_credentials.csv'), facLines.join('\n'), 'utf-8');

        // Students
        const stuLines = ['username,temporaryPassword,fullName,email,academicYear,semester,entryType,coreBranch'];
        for (const s of data.students) {
          stuLines.push(`${s.username},${s.temporaryPassword},"${s.fullName}",${s.email},${s.academicYear || s.year},${s.semester},${s.entryType},${s.coreBranch}`);
        }
        fs.writeFileSync(path.join(deptDir, 'student_credentials.csv'), stuLines.join('\n'), 'utf-8');
      }

      job.status = 'COMPLETED';
      job.progress = 100;
      job.currentStage = 'DONE';
      job.endTime = new Date().toISOString();
    } catch (err) {
      console.error('executeBulkProvisioning error:', err);
      job.status = 'FAILED';
      job.errors.push(err.message);
      job.endTime = new Date().toISOString();
    }
  })();

  return job;
}

export default {
  jobStore,
  generateMasterCsvFiles,
  executeBulkProvisioning,
};
