import jwt from 'jsonwebtoken';
import pool, { ensureDatabaseExists } from '../config/db.js';
import {
  hashPassword,
  verifyPassword,
  verifyDummyPassword,
  encryptAES,
  decryptAES,
  createBlindIndex,
  generateTempPassword,
} from '../utils/crypto.util.js';
import { generateUsername } from '../utils/username.util.js';

const JWT_SECRET =
  process.env.JWT_SECRET ||
  'rljit_arcade_jwt_super_secure_secret_key_minimum_32_characters_2026';

// Safe decryption helper to prevent inspector crashes
function safeDecrypt(ciphertext) {
  if (!ciphertext) return null;
  try {
    return decryptAES(ciphertext);
  } catch {
    return '[Protected / Decryption Error]';
  }
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

/**
 * A. POST /api/v1/auth/bootstrap-super-admin
 * Step 1: First-time setup to bootstrap the initial Super Admin with atomic dual-table persistence
 */
export async function bootstrapSuperAdmin(req, res) {
  let client = null;
  try {
    await ensureDatabaseExists();

    // 1. Verify header x-bootstrap-key
    const bootstrapKey = req.headers['x-bootstrap-key'];
    const expectedKey =
      process.env.BOOTSTRAP_SECRET || 'RLJIT_SUPER_MASTERMIND_BOOTSTRAP_KEY_2026';

    if (!bootstrapKey || bootstrapKey !== expectedKey) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Invalid or missing x-bootstrap-key header',
      });
    }

    // 2. Check if Super Admin already exists
    const countRes = await pool.query(
      "SELECT COUNT(*) FROM users WHERE admin_tier = 'SUPER_ADMIN'"
    );
    if (parseInt(countRes.rows[0].count, 10) > 0) {
      return res.status(403).json({
        success: false,
        error: 'Locked: Super Admin already exists',
      });
    }

    // 3. Prepare payload and credentials
    const {
      fullName = 'Super Admin Mastermind',
      email = 'superadmin@rljit.ac.in',
      phone = '+919999999999',
      password,
    } = req.body || {};

    if (password !== undefined && password !== null) {
      if (typeof password !== 'string' || password.trim().length === 0 || password.length < 8) {
        return res.status(400).json({
          success: false,
          error: 'Custom password must be at least 8 characters long',
        });
      }
    }

    const temporaryPassword = password || generateTempPassword(14);
    const passwordHash = await hashPassword(temporaryPassword);

    const fullNameEnc = encryptAES(fullName);
    const emailEnc = encryptAES(email);
    const phoneEnc = encryptAES(phone);

    const emailBidx = createBlindIndex(email);
    const phoneBidx = createBlindIndex(phone);

    // 4. Begin atomic transaction for dual-table persistence
    client = await pool.connect();
    await client.query('BEGIN');

    // Generate atomic username RLSUPER001 using the transactional client
    const username = await generateUsername({ adminTier: 'SUPER_ADMIN' }, client);

    // Insert into users table
    const insertUserQuery = `
      INSERT INTO users (
        username, password_hash, full_name_encrypted, email_encrypted, phone_encrypted,
        email_bidx, phone_bidx, base_role, admin_tier, sub_roles, permissions,
        must_change_password, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'ADMIN', 'SUPER_ADMIN', $8, $9, TRUE, TRUE)
      RETURNING id, username, xmin::text AS xmin, ctid::text AS ctid, created_at;
    `;

    const userResult = await client.query(insertUserQuery, [
      username,
      passwordHash,
      fullNameEnc,
      emailEnc,
      phoneEnc,
      emailBidx,
      phoneBidx,
      ['SUPER_ADMIN', 'MASTERMIND'],
      ['*'],
    ]);

    const userRow = userResult.rows[0];

    // Dual-table sync into admin table linked via user_id
    await client.query(
      `INSERT INTO admin (user_id, admin_code, full_name, email, section_role, is_mastermind)
       VALUES ($1, $2, $3, $4, 'SUPER_ADMIN', TRUE)
       ON CONFLICT (admin_code) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         full_name = EXCLUDED.full_name,
         email = EXCLUDED.email,
         section_role = EXCLUDED.section_role;`,
      [userRow.id, username, fullName, email]
    );

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: 'Super Admin successfully bootstrapped',
      username,
      temporaryPassword,
      dbReceipt: {
        persisted: true,
        userId: userRow.id,
        pgTransactionId: userRow.xmin,
        physicalDiskTuple: userRow.ctid,
        storedInTables: ['users', 'admin'],
        timestamp: userRow.created_at,
      },
      redirectUrl: '/portal/super-admin/mastermind-home',
    });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rbErr) {
        console.error('Rollback error on bootstrap:', rbErr.message);
      }
    }
    console.error('Bootstrap Super Admin error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to bootstrap Super Admin',
    });
  } finally {
    if (client) {
      client.release();
    }
  }
}

/**
 * B. POST /api/v1/super-admin/provision-authority
 * Step 2: Super Admin provisions Admission Admin, HODs, or Faculty with atomic dual-table persistence
 */
export async function provisionAuthority(req, res) {
  let client = null;
  try {
    await ensureDatabaseExists();

    const {
      authorityType,
      fullName,
      email,
      phone,
      department,
      sectionCode,
      subRoles = [],
      classification,
      cabinRoom,
      designation,
      password,
    } = req.body || {};

    if (!authorityType || !fullName || !email || !phone) {
      return res.status(400).json({
        success: false,
        error: 'authorityType, fullName, email, and phone are required',
      });
    }

    if (password !== undefined && password !== null) {
      if (typeof password !== 'string' || password.trim().length === 0 || password.length < 8) {
        return res.status(400).json({
          success: false,
          error: 'Custom password must be at least 8 characters long',
        });
      }
    }

    const authType = authorityType.toUpperCase();
    const dept = department ? department.trim().toUpperCase() : null;
    const sec = sectionCode ? sectionCode.trim().toUpperCase() : null;

    let baseRole = '';
    let adminTier = null;
    let permissions = [];
    let assignedSubRoles = Array.isArray(subRoles) ? [...subRoles] : [];
    let redirectUrl = '';
    let targetRoleTable = '';

    // 1. REGULAR_ADMIN
    if (authType === 'REGULAR_ADMIN') {
      const validSections = ['ADM', 'ACC', 'PLC', 'SPT', 'MGT', 'PRN', 'EXM'];
      if (!sec || !validSections.includes(sec)) {
        return res.status(400).json({
          success: false,
          error: `sectionCode is required for REGULAR_ADMIN and must be one of: ${validSections.join(', ')}`,
        });
      }

      baseRole = 'ADMIN';
      adminTier = 'REGULAR_ADMIN';
      targetRoleTable = 'admin';
      if (!assignedSubRoles.includes(sec)) assignedSubRoles.push(sec);
      if (sec === 'PRN' && !assignedSubRoles.includes('PRINCIPAL')) {
        assignedSubRoles.push('PRINCIPAL');
      }
      if (sec === 'MGT' && !assignedSubRoles.includes('MANAGEMENT')) {
        assignedSubRoles.push('MANAGEMENT');
      }

      if (sec === 'ADM') {
        permissions = ['student:create:all', 'student:read:all', 'portal:admission:access'];
      } else {
        permissions = [`portal:${sec.toLowerCase()}:access`];
      }

      redirectUrl = `/portal/admin/${sec.toLowerCase()}/home`;
    }
    // 2. HOD
    else if (authType === 'HOD' || authType === 'HOD_ADMIN') {
      if (!dept) {
        return res.status(400).json({
          success: false,
          error: 'department is required for HOD provisioning',
        });
      }

      // Enforce only 1 active HOD per department
      const hodCheck = await pool.query(
        `SELECT username FROM users
         WHERE base_role = 'FACULTY'
           AND (admin_tier = 'HOD_ADMIN' OR 'HOD' = ANY(sub_roles))
           AND department = $1
           AND is_active = TRUE`,
        [dept]
      );

      if (hodCheck.rowCount > 0) {
        return res.status(409).json({
          success: false,
          error: `An active HOD already exists for department ${dept} (${hodCheck.rows[0].username})`,
        });
      }

      baseRole = 'FACULTY';
      adminTier = 'HOD_ADMIN';
      targetRoleTable = 'faculty';
      if (!assignedSubRoles.includes('HOD')) assignedSubRoles.push('HOD');
      permissions = [
        'student:create:dept',
        'student:read:dept',
        'faculty:manage:dept',
        'portal:hod:access',
      ];
      redirectUrl = `/portal/hod-admin/${dept.toLowerCase()}/home`;
    }
    // 3. Normal FACULTY
    else if (authType === 'FACULTY') {
      if (!dept) {
        return res.status(400).json({
          success: false,
          error: 'department is required for Faculty provisioning',
        });
      }

      baseRole = 'FACULTY';
      adminTier = null;
      targetRoleTable = 'faculty';
      if (assignedSubRoles.length === 0) assignedSubRoles.push('TEACHER');
      permissions = ['student:read:dept', 'attendance:mark', 'portal:faculty:access'];
      redirectUrl = '/portal/faculty/home';
    } else {
      return res.status(400).json({
        success: false,
        error: `Invalid authorityType: '${authorityType}'. Allowed types: REGULAR_ADMIN, HOD, FACULTY`,
      });
    }

    // Check email and phone uniqueness via blind index
    const emailBidx = createBlindIndex(email);
    const phoneBidx = createBlindIndex(phone);

    const conflictCheck = await pool.query(
      'SELECT username FROM users WHERE email_bidx = $1 OR phone_bidx = $2',
      [emailBidx, phoneBidx]
    );

    if (conflictCheck.rowCount > 0) {
      return res.status(409).json({
        success: false,
        error: 'Email or phone number is already registered in the system',
      });
    }

    const temporaryPassword = password || generateTempPassword(12);
    const passwordHash = await hashPassword(temporaryPassword);

    const fullNameEnc = encryptAES(fullName);
    const emailEnc = encryptAES(email);
    const phoneEnc = encryptAES(phone);

    // Begin atomic transaction
    client = await pool.connect();
    await client.query('BEGIN');

    // Generate atomic username inside transaction
    const username = await generateUsername(
      {
        role: baseRole,
        adminTier,
        sectionCode: sec,
        department: dept,
      },
      client
    );

    const insertUserQuery = `
      INSERT INTO users (
        username, password_hash, full_name_encrypted, email_encrypted, phone_encrypted,
        email_bidx, phone_bidx, base_role, admin_tier, sub_roles, permissions,
        department, section_code, created_by, must_change_password, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, TRUE, TRUE)
      RETURNING id, username, xmin::text AS xmin, ctid::text AS ctid, created_at;
    `;

    const creatorId = req.user?.userId || req.user?.id || null;
    const userResult = await client.query(insertUserQuery, [
      username,
      passwordHash,
      fullNameEnc,
      emailEnc,
      phoneEnc,
      emailBidx,
      phoneBidx,
      baseRole,
      adminTier,
      assignedSubRoles,
      permissions,
      dept,
      sec,
      creatorId,
    ]);

    const userRow = userResult.rows[0];

    // Dual-table sync into corresponding role table linked via user_id
    if (baseRole === 'FACULTY') {
      const defaultDesignation = adminTier === 'HOD_ADMIN' ? 'HOD' : 'Assistant Professor';
      const cleanClassification = classification
        ? String(classification).trim().slice(0, 32)
        : adminTier === 'HOD_ADMIN'
        ? 'HOD'
        : designation
        ? String(designation).trim().slice(0, 32)
        : defaultDesignation;
      const cleanDesignation = designation
        ? String(designation).trim().slice(0, 100)
        : classification
        ? String(classification).trim().slice(0, 100)
        : defaultDesignation;
      const cleanCabinRoom = cabinRoom ? String(cabinRoom).trim().slice(0, 32) : null;

      await client.query(
        `INSERT INTO faculty (user_id, emp_id, full_name, email, department, designation, cabin_room, classification, is_hod)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (emp_id) DO UPDATE SET
           user_id = EXCLUDED.user_id,
           full_name = EXCLUDED.full_name,
           email = EXCLUDED.email,
           department = EXCLUDED.department,
           designation = EXCLUDED.designation,
           cabin_room = COALESCE(EXCLUDED.cabin_room, faculty.cabin_room),
           classification = COALESCE(EXCLUDED.classification, faculty.classification),
           is_hod = EXCLUDED.is_hod;`,
        [
          userRow.id,
          username,
          fullName,
          email,
          dept,
          cleanDesignation,
          cleanCabinRoom,
          cleanClassification,
          adminTier === 'HOD_ADMIN',
        ]
      );
    } else if (baseRole === 'ADMIN') {
      await client.query(
        `INSERT INTO admin (user_id, admin_code, full_name, email, section_role, is_mastermind)
         VALUES ($1, $2, $3, $4, $5, FALSE)
         ON CONFLICT (admin_code) DO UPDATE SET
           user_id = EXCLUDED.user_id,
           full_name = EXCLUDED.full_name,
           email = EXCLUDED.email,
           section_role = EXCLUDED.section_role;`,
        [userRow.id, username, fullName, email, sec]
      );
    }

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: 'Authority successfully provisioned',
      username,
      temporaryPassword,
      roleAssigned: {
        baseRole,
        adminTier,
        subRoles: assignedSubRoles,
        permissions,
        department: dept,
        sectionCode: sec,
      },
      dbReceipt: {
        persisted: true,
        userId: userRow.id,
        pgTransactionId: userRow.xmin,
        physicalDiskTuple: userRow.ctid,
        storedInTables: ['users', targetRoleTable],
        timestamp: userRow.created_at,
      },
      redirectUrl,
    });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rbErr) {
        console.error('Rollback error on authority provisioning:', rbErr.message);
      }
    }
    console.error('Provision Authority error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to provision authority',
    });
  } finally {
    if (client) {
      client.release();
    }
  }
}

/**
 * C. POST /api/v1/portals/provision-student
 * Step 3: Student creation via Admission Portal or HOD Admin Portal with atomic dual-table persistence
 */
export async function provisionStudent(req, res) {
  let client = null;
  try {
    await ensureDatabaseExists();

    const {
      fullName,
      email,
      phone,
      department,
      coreBranch,
      admissionYear,
      academicYear,
      semester,
      section = 'A',
      entryType = 'REGULAR',
      admissionQuota = 'KEA_CET',
      cgpa = 0.00,
      subRoles = ['STUDENT'],
      password,
    } = req.body || {};

    if (!fullName || !email || !phone || !department) {
      return res.status(400).json({
        success: false,
        error: 'fullName, email, phone, and department are required',
      });
    }

    if (password !== undefined && password !== null) {
      if (typeof password !== 'string' || password.trim().length === 0 || password.length < 8) {
        return res.status(400).json({
          success: false,
          error: 'Custom password must be at least 8 characters long',
        });
      }
    }

    const targetDept = department.trim().toUpperCase();
    const currentUser = req.user;
    let createdByPortal = '';

    // Strict Authorization Check:
    // Actor 1: Admission Section Admin (base_role === 'ADMIN' && section_code === 'ADM') -> ANY department
    if (currentUser.baseRole === 'ADMIN' && currentUser.sectionCode === 'ADM') {
      createdByPortal = 'ADMISSION_PORTAL';
    }
    // Actor 2: HOD Admin (FACULTY + (HOD_ADMIN or sub_roles includes 'HOD')) -> ONLY own department
    else if (
      currentUser.baseRole === 'FACULTY' &&
      (currentUser.adminTier === 'HOD_ADMIN' ||
        (Array.isArray(currentUser.subRoles) && currentUser.subRoles.includes('HOD')))
    ) {
      const userDept = (currentUser.department || '').trim().toUpperCase();
      if (userDept !== targetDept) {
        return res.status(403).json({
          success: false,
          error: `Department Scope Violation: HOD of department '${userDept}' cannot provision students for department '${targetDept}'`,
        });
      }
      createdByPortal = 'HOD_ADMIN_PORTAL';
    }
    // Actor 3: Super Admin override
    else if (currentUser.adminTier === 'SUPER_ADMIN') {
      createdByPortal = 'SUPER_ADMIN_PORTAL';
    }
    // Unauthorized
    else {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Only Admission Section or Department HOD can create students',
      });
    }

    // Format and validate fields
    const entry = String(entryType).trim().toUpperCase() === 'LATERAL' ? 'LATERAL' : 'REGULAR';

    let year = new Date().getFullYear();
    if (admissionYear !== undefined && admissionYear !== null && String(admissionYear).trim() !== '') {
      const yearStr = String(admissionYear).trim();
      const parsedYear = Number(yearStr);
      if (!/^\d{4}$/.test(yearStr) || !Number.isInteger(parsedYear) || parsedYear < 2000 || parsedYear > 2100) {
        return res.status(400).json({
          success: false,
          error: 'admissionYear must be an integer between 2000 and 2100',
        });
      }
      year = parsedYear;
    }

    let sem = entry === 'LATERAL' ? 3 : 1;
    if (semester !== undefined && semester !== null && String(semester).trim() !== '') {
      const semStr = String(semester).trim();
      const parsedSem = Number(semStr);
      if (!/^\d+$/.test(semStr) || !Number.isInteger(parsedSem) || parsedSem < 1 || parsedSem > 8) {
        return res.status(400).json({
          success: false,
          error: 'semester must be an integer between 1 and 8',
        });
      }
      sem = parsedSem;
    }
    const branch = coreBranch ? String(coreBranch).trim().toUpperCase() : null;
    let acadYear = sem <= 2 ? 1 : sem <= 4 ? 2 : sem <= 6 ? 3 : 4;
    if (academicYear !== undefined && academicYear !== null && String(academicYear).trim() !== '') {
      const acadStr = String(academicYear).trim();
      const parsedAcadYear = Number(acadStr);
      if (
        !/^\d+$/.test(acadStr) ||
        !Number.isInteger(parsedAcadYear) ||
        parsedAcadYear < 1 ||
        parsedAcadYear > 6
      ) {
        return res.status(400).json({
          success: false,
          error: 'academicYear must be an integer between 1 and 6',
        });
      }
      acadYear = parsedAcadYear;
    }
    const studentSection = section ? String(section).trim().toUpperCase() : 'A';
    const quota = admissionQuota ? String(admissionQuota).trim().toUpperCase() : 'KEA_CET';
    let parsedCgpa = 0.00;
    if (cgpa !== undefined && cgpa !== null && String(cgpa).trim() !== '') {
      const numCgpa = Number(cgpa);
      if (!Number.isFinite(numCgpa) || numCgpa < 0 || numCgpa > 10) {
        return res.status(400).json({
          success: false,
          error: 'cgpa must be a finite number between 0 and 10',
        });
      }
      parsedCgpa = Number(numCgpa.toFixed(2));
    }

    // Check email and phone uniqueness via blind index
    const emailBidx = createBlindIndex(email);
    const phoneBidx = createBlindIndex(phone);

    const conflictCheck = await pool.query(
      'SELECT username FROM users WHERE email_bidx = $1 OR phone_bidx = $2',
      [emailBidx, phoneBidx]
    );

    if (conflictCheck.rowCount > 0) {
      return res.status(409).json({
        success: false,
        error: 'Email or phone number is already registered for a student or user',
      });
    }

    const temporaryPassword = password || generateTempPassword(12);
    const passwordHash = await hashPassword(temporaryPassword);

    const fullNameEnc = encryptAES(fullName);
    const emailEnc = encryptAES(email);
    const phoneEnc = encryptAES(phone);

    const studentSubRoles = Array.isArray(subRoles) && subRoles.length > 0 ? subRoles : ['STUDENT'];

    // Begin atomic transaction
    client = await pool.connect();
    await client.query('BEGIN');

    // Generate atomic student USN: 1RL${YY}${DEPT}001 or 1RL${YY}${DEPT}401 inside transaction
    const usn = await generateUsername(
      {
        role: 'STUDENT',
        department: targetDept,
        coreBranch: branch,
        admissionYear: year,
        entryType: entry,
      },
      client
    );

    const creatorId = currentUser?.userId || currentUser?.id || null;

    const insertUserQuery = `
      INSERT INTO users (
        username, password_hash, full_name_encrypted, email_encrypted, phone_encrypted,
        email_bidx, phone_bidx, base_role, admin_tier, sub_roles, permissions,
        department, admission_year, semester, entry_type, created_by,
        must_change_password, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'STUDENT', NULL, $8, $9, $10, $11, $12, $13, $14, TRUE, TRUE)
      RETURNING id, username, xmin::text AS xmin, ctid::text AS ctid, created_at;
    `;

    const userResult = await client.query(insertUserQuery, [
      usn,
      passwordHash,
      fullNameEnc,
      emailEnc,
      phoneEnc,
      emailBidx,
      phoneBidx,
      studentSubRoles,
      ['portal:student:access'],
      targetDept,
      year,
      sem,
      entry,
      creatorId,
    ]);

    const userRow = userResult.rows[0];

    // Dual-table sync into student table linked via user_id
    await client.query(
      `INSERT INTO student (
         user_id, usn, full_name, email, department, core_branch,
         semester, academic_year, section, entry_type, admission_quota, cgpa, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'ACTIVE')
       ON CONFLICT (usn) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         full_name = EXCLUDED.full_name,
         email = EXCLUDED.email,
         department = EXCLUDED.department,
         core_branch = EXCLUDED.core_branch,
         semester = EXCLUDED.semester,
         academic_year = EXCLUDED.academic_year,
         section = EXCLUDED.section,
         entry_type = EXCLUDED.entry_type,
         admission_quota = EXCLUDED.admission_quota,
         cgpa = EXCLUDED.cgpa;`,
      [
        userRow.id,
        usn,
        fullName,
        email,
        targetDept,
        branch,
        sem,
        acadYear,
        studentSection,
        entry,
        quota,
        parsedCgpa,
      ]
    );

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: 'Student successfully provisioned',
      createdByPortal,
      credentials: {
        username: usn,
        temporaryPassword,
      },
      studentProfile: {
        id: userRow.id,
        usn,
        fullName,
        email,
        phone,
        department: targetDept,
        coreBranch: branch,
        admissionYear: year,
        academicYear: acadYear,
        semester: sem,
        section: studentSection,
        entryType: entry,
        admissionQuota: quota,
        cgpa: parsedCgpa,
      },
      dbReceipt: {
        persisted: true,
        userId: userRow.id,
        pgTransactionId: userRow.xmin,
        physicalDiskTuple: userRow.ctid,
        storedInTables: ['users', 'student'],
        timestamp: userRow.created_at,
      },
      redirectUrl: '/portal/student/home',
    });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rbErr) {
        console.error('Rollback error on student provisioning:', rbErr.message);
      }
    }
    console.error('Provision Student error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to provision student',
    });
  } finally {
    if (client) {
      client.release();
    }
  }
}

/**
 * D. POST /api/v1/auth/login
 * Verifies credentials against live PostgreSQL, updates login audit stats, returns JWT + auditReceipt
 */
export async function login(req, res) {
  try {
    await ensureDatabaseExists();

    const { username, identifier, password } = req.body || {};
    const inputIdentifier = (username || identifier || '').trim();

    if (!inputIdentifier || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username/email/phone and password are required',
      });
    }

    let user = null;

    // Lookup strategy: email, phone, or username directly against PostgreSQL
    if (inputIdentifier.includes('@')) {
      const emailBidx = createBlindIndex(inputIdentifier);
      const result = await pool.query('SELECT * FROM users WHERE email_bidx = $1', [emailBidx]);
      user = result.rows[0];
    } else if (/^\+?[0-9]{10,15}$/.test(inputIdentifier.replace(/[\s-]/g, ''))) {
      const phoneBidx = createBlindIndex(inputIdentifier.replace(/[\s-]/g, ''));
      const result = await pool.query('SELECT * FROM users WHERE phone_bidx = $1', [phoneBidx]);
      user = result.rows[0];
    } else {
      const result = await pool.query('SELECT * FROM users WHERE UPPER(username) = UPPER($1)', [
        inputIdentifier,
      ]);
      user = result.rows[0];
    }

    // Constant-time check if user does not exist
    if (!user) {
      await verifyDummyPassword(password);
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
      });
    }

    // Verify Argon2id password
    const isPasswordValid = await verifyPassword(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        error: 'Account is deactivated. Please contact administration.',
      });
    }

    // Live PostgreSQL update to prove persistent DB read/write
    const updateAuditQuery = `
      UPDATE users
      SET login_count = COALESCE(login_count, 0) + 1,
          last_login_at = NOW()
      WHERE id = $1
      RETURNING login_count, last_login_at, xmin::text AS xmin, ctid::text AS ctid;
    `;
    const auditRes = await pool.query(updateAuditQuery, [user.id]);
    const auditRow = auditRes.rows[0];

    // Compute exact portal redirectUrl based on role tier
    let redirectUrl = '/portal/student/home';
    if (user.admin_tier === 'SUPER_ADMIN') {
      redirectUrl = '/portal/super-admin/mastermind-home';
    } else if (user.admin_tier === 'REGULAR_ADMIN') {
      const sec = (user.section_code || 'admin').toLowerCase();
      redirectUrl = `/portal/admin/${sec}/home`;
    } else if (
      user.admin_tier === 'HOD_ADMIN' ||
      (Array.isArray(user.sub_roles) && user.sub_roles.includes('HOD'))
    ) {
      const dept = (user.department || 'dept').toLowerCase();
      redirectUrl = `/portal/hod-admin/${dept}/home`;
    } else if (user.base_role === 'FACULTY') {
      redirectUrl = '/portal/faculty/home';
    } else if (user.base_role === 'STUDENT') {
      redirectUrl = '/portal/student/home';
    }

    // Decrypt PII
    const fullName = decryptAES(user.full_name_encrypted);
    const email = decryptAES(user.email_encrypted);
    const phone = decryptAES(user.phone_encrypted);

    // Sign JWT
    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        baseRole: user.base_role,
        adminTier: user.admin_tier,
        subRoles: user.sub_roles || [],
        permissions: user.permissions || [],
        department: user.department,
        sectionCode: user.section_code,
        tokenVersion: user.token_version || 1,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      accessToken: token,
      user: {
        id: user.id,
        username: user.username,
        fullName,
        email,
        phone,
        baseRole: user.base_role,
        adminTier: user.admin_tier,
        subRoles: user.sub_roles,
        permissions: user.permissions,
        department: user.department,
        sectionCode: user.section_code,
        mustChangePassword: user.must_change_password,
      },
      auditReceipt: {
        loginCount: auditRow.login_count,
        lastLoginAt: auditRow.last_login_at,
        pgTransactionId: auditRow.xmin,
        physicalDiskTuple: auditRow.ctid,
        persistedToDatabase: true,
      },
      redirectUrl,
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Login failed',
    });
  }
}

/**
 * E. GET /api/v1/users/search?q=
 * Uses HMAC-SHA256 blind index for exact match or pg_trgm similarity for fast USN/ID search
 */
export async function searchUsers(req, res) {
  try {
    await ensureDatabaseExists();

    if (req.user?.baseRole === 'STUDENT') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Students cannot access the institutional user directory search',
      });
    }

    const isSuperAdmin = req.user?.adminTier === 'SUPER_ADMIN';
    const q = (req.query.q || '').trim();
    const deptFilter = (req.query.department || '').trim().toUpperCase();
    if (!q) {
      return res.status(200).json({
        success: true,
        query: '',
        count: 0,
        results: [],
      });
    }

    let rows = [];

    // 1. Exact Blind Index Search for email or phone query
    if (q.includes('@') || /^\+?[0-9]{7,15}$/.test(q.replace(/[\s-]/g, ''))) {
      const bidx = createBlindIndex(q.replace(/[\s-]/g, ''));
      const params = deptFilter ? [bidx, deptFilter] : [bidx];
      const deptClause = deptFilter ? ' AND UPPER(department) = $2' : '';
      const result = await pool.query(
        `SELECT id, username, full_name_encrypted, email_encrypted, phone_encrypted,
                base_role, admin_tier, sub_roles, permissions, department, section_code,
                admission_year, semester, entry_type, login_count, last_login_at, is_active, created_at
         FROM users
         WHERE (email_bidx = $1 OR phone_bidx = $1)${deptClause}
         LIMIT 20`,
        params
      );
      rows = result.rows;
    }

    // 2. Trigram / GIN fast search on username / USN
    if (rows.length === 0) {
      const sanitizedQ = q.toUpperCase();
      const params = deptFilter ? [sanitizedQ, `%${sanitizedQ}%`, deptFilter] : [sanitizedQ, `%${sanitizedQ}%`];
      const deptClause = deptFilter ? ' AND UPPER(department) = $3' : '';
      const trigramQuery = `
        SELECT id, username, full_name_encrypted, email_encrypted, phone_encrypted,
               base_role, admin_tier, sub_roles, permissions, department, section_code,
               admission_year, semester, entry_type, login_count, last_login_at, is_active, created_at,
               similarity(username, $1) as score
        FROM users
        WHERE (username ILIKE $2 OR username % $1)${deptClause}
        ORDER BY score DESC, created_at DESC
        LIMIT 20;
      `;
      const result = await pool.query(trigramQuery, params);
      rows = result.rows;
    }

    // Decrypt PII for results
    const results = rows.map((row) => ({
      id: row.id,
      username: row.username,
      fullName: safeDecrypt(row.full_name_encrypted),
      email: safeDecrypt(row.email_encrypted),
      phone: safeDecrypt(row.phone_encrypted),
      baseRole: row.base_role,
      adminTier: row.admin_tier,
      subRoles: row.sub_roles,
      ...(isSuperAdmin ? { permissions: row.permissions } : {}),
      department: row.department,
      sectionCode: row.section_code,
      admissionYear: row.admission_year,
      semester: row.semester,
      entryType: row.entry_type,
      loginCount: row.login_count,
      lastLoginAt: row.last_login_at,
      isActive: row.is_active,
      createdAt: row.created_at,
    }));

    return res.status(200).json({
      success: true,
      query: q,
      count: results.length,
      results,
    });
  } catch (error) {
    console.error('Search Users error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to search users',
    });
  }
}

/**
 * F. POST /api/v1/auth/logout
 * Terminates user session and revokes JWT by incrementing token_version in PostgreSQL
 */
export async function logout(req, res) {
  try {
    await ensureDatabaseExists();
    const userId = req.user?.userId || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Session identification missing',
      });
    }

    const result = await pool.query(
      `UPDATE users
       SET token_version = COALESCE(token_version, 1) + 1
       WHERE id = $1
       RETURNING token_version;`,
      [userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'User account not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Session terminated and token invalidated',
      revokedTokenVersion: result.rows[0].token_version,
    });
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Logout failed',
    });
  }
}

/**
 * G. GET /api/v1/db/verify-storage
 * Postman DB Storage Inspector: returns live table row counts, raw DB proof, and decrypted previews
 * Accessible via Super Admin JWT or x-bootstrap-key header
 */
export async function verifyDbStorage(req, res) {
  try {
    await ensureDatabaseExists();

    // Verification check: requires either x-bootstrap-key or Super Admin Bearer JWT
    const bootstrapKey = req.headers['x-bootstrap-key'];
    const expectedKey =
      process.env.BOOTSTRAP_SECRET || 'RLJIT_SUPER_MASTERMIND_BOOTSTRAP_KEY_2026';
    const isBootstrapValid = bootstrapKey && bootstrapKey === expectedKey;

    let isSuperAdminJwt = false;
    if (!isBootstrapValid) {
      const authHeader = req.headers.authorization || req.headers.Authorization;
      if (authHeader) {
        const parts = authHeader.split(' ');
        const token = parts.length === 2 && /^Bearer$/i.test(parts[0]) ? parts[1] : authHeader;
        try {
          const decoded = jwt.verify(token, JWT_SECRET);
          const tokenUserId = decoded?.userId || decoded?.id;
          if (decoded && decoded.adminTier === 'SUPER_ADMIN' && tokenUserId) {
            const dbCheck = await pool.query(
              'SELECT id, is_active, token_version, admin_tier FROM users WHERE id = $1',
              [tokenUserId]
            );
            const dbUser = dbCheck.rows[0];
            const tokenVersionValid =
              decoded.tokenVersion === undefined || decoded.tokenVersion === dbUser?.token_version;
            if (
              dbUser &&
              dbUser.is_active === true &&
              dbUser.admin_tier === 'SUPER_ADMIN' &&
              tokenVersionValid
            ) {
              isSuperAdminJwt = true;
            }
          }
        } catch {
          // Continue to check fallback
        }
      }
    }

    if (!isBootstrapValid && !isSuperAdminJwt) {
      return res.status(403).json({
        success: false,
        error:
          'Forbidden: Access requires either a Super Admin Bearer token or valid x-bootstrap-key header',
      });
    }

    // 1. Live row counts from all persistence and domain tables
    const countQuery = `
      SELECT
        (SELECT COUNT(*) FROM users) AS users_count,
        (SELECT COUNT(*) FROM student) AS student_count,
        (SELECT COUNT(*) FROM faculty) AS faculty_count,
        (SELECT COUNT(*) FROM admin) AS admin_count,
        (SELECT COUNT(*) FROM id_sequences) AS sequences_count,
        (SELECT COUNT(*) FROM timetables) AS timetables_count,
        (SELECT COUNT(*) FROM timetable_swaps) AS timetable_swaps_count,
        (SELECT COUNT(*) FROM ocr_staging_batches) AS ocr_staging_batches_count,
        (SELECT COUNT(*) FROM academic_records) AS academic_records_count,
        (SELECT COUNT(*) FROM academic_audit_logs) AS academic_audit_logs_count,
        (SELECT COUNT(*) FROM finance_ledgers) AS finance_ledgers_count,
        (SELECT COUNT(*) FROM finance_transactions) AS finance_transactions_count,
        (SELECT COUNT(*) FROM student_documents) AS student_documents_count,
        (SELECT COUNT(*) FROM record_unlock_requests) AS unlock_requests_count,
        (SELECT COUNT(*) FROM lg_leave_requests) AS leave_requests_count,
        (SELECT COUNT(*) FROM venues) AS venues_count,
        (SELECT COUNT(*) FROM venue_bookings) AS venue_bookings_count,
        (SELECT COUNT(*) FROM booking_timeline_logs) AS booking_timeline_logs_count,
        (SELECT COUNT(*) FROM venue_transfer_requests) AS venue_transfer_requests_count,
        (SELECT COUNT(*) FROM timetable_slots) AS timetable_slots_count,
        (SELECT COUNT(*) FROM attendance_records) AS attendance_records_count,
        (SELECT COUNT(*) FROM cie_marks) AS cie_marks_count,
        (SELECT COUNT(*) FROM placement_drives) AS placement_drives_count,
        (SELECT COUNT(*) FROM placement_applications) AS placement_applications_count,
        (SELECT COUNT(*) FROM finance_records) AS finance_records_count,
        (SELECT COUNT(*) FROM institutional_documents) AS institutional_documents_count,
        (SELECT COUNT(*) FROM college_metadata) AS college_metadata_count;
    `;
    const countsRes = await pool.query(countQuery);
    const countsRow = countsRes.rows[0];

    // 2. Fetch latest 20 users with dual-table relational LEFT JOINs and explicit column qualifications
    const recordsQuery = `
      SELECT 
        u.id, u.username, u.password_hash, u.full_name_encrypted, u.email_encrypted, u.phone_encrypted,
        u.email_bidx, u.phone_bidx, u.base_role, u.admin_tier, u.sub_roles, u.permissions,
        u.department, u.section_code, u.admission_year, u.semester, u.entry_type,
        u.login_count, u.last_login_at, u.token_version, u.is_active, u.created_at,
        u.xmin::text AS pg_xmin, u.ctid::text AS pg_ctid,
        a.id AS admin_id, a.admin_code, a.section_role, a.is_mastermind,
        f.id AS faculty_id, f.emp_id, f.designation, f.is_hod,
        s.id AS student_id, s.usn, s.status AS student_status
      FROM users u
      LEFT JOIN admin a ON a.user_id = u.id
      LEFT JOIN faculty f ON f.user_id = u.id
      LEFT JOIN student s ON s.user_id = u.id
      ORDER BY u.created_at DESC
      LIMIT 20;
    `;

    const recordsRes = await pool.query(recordsQuery);

    const records = recordsRes.rows.map((row) => ({
      metadata: {
        id: row.id,
        username: row.username,
        base_role: row.base_role,
        admin_tier: row.admin_tier,
        department: row.department,
        section_code: row.section_code,
        admission_year: row.admission_year,
        semester: row.semester,
        entry_type: row.entry_type,
        login_count: row.login_count,
        last_login_at: row.last_login_at,
        token_version: row.token_version,
        is_active: row.is_active,
        pg_xmin: row.pg_xmin,
        pg_ctid: row.pg_ctid,
        created_at: row.created_at,
        linkedRoleRecord: row.admin_id
          ? {
              table: 'admin',
              id: row.admin_id,
              adminCode: row.admin_code,
              sectionRole: row.section_role,
              isMastermind: row.is_mastermind,
            }
          : row.faculty_id
          ? {
              table: 'faculty',
              id: row.faculty_id,
              empId: row.emp_id,
              designation: row.designation,
              isHod: row.is_hod,
            }
          : row.student_id
          ? {
              table: 'student',
              id: row.student_id,
              usn: row.usn,
              status: row.student_status,
            }
          : null,
      },
      rawDatabaseProof: {
        passwordHashPrefix: row.password_hash ? `${row.password_hash.slice(0, 28)}...` : null,
        emailCiphertext: row.email_encrypted,
        emailBlindIndex: row.email_bidx,
        phoneBlindIndex: row.phone_bidx,
      },
      decryptedPreview: {
        fullName: safeDecrypt(row.full_name_encrypted),
        email: safeDecrypt(row.email_encrypted),
        phone: safeDecrypt(row.phone_encrypted),
      },
    }));

    return res.status(200).json({
      success: true,
      database: 'rljit_arcade',
      liveTableCounts: {
        users: parseInt(countsRow.users_count || '0', 10),
        student: parseInt(countsRow.student_count || '0', 10),
        faculty: parseInt(countsRow.faculty_count || '0', 10),
        admin: parseInt(countsRow.admin_count || '0', 10),
        id_sequences: parseInt(countsRow.sequences_count || '0', 10),
        timetables: parseInt(countsRow.timetables_count || '0', 10),
        timetable_swaps: parseInt(countsRow.timetable_swaps_count || '0', 10),
        ocr_staging_batches: parseInt(countsRow.ocr_staging_batches_count || '0', 10),
        academic_records: parseInt(countsRow.academic_records_count || '0', 10),
        academic_audit_logs: parseInt(countsRow.academic_audit_logs_count || '0', 10),
        finance_ledgers: parseInt(countsRow.finance_ledgers_count || '0', 10),
        finance_transactions: parseInt(countsRow.finance_transactions_count || '0', 10),
        student_documents: parseInt(countsRow.student_documents_count || '0', 10),
        record_unlock_requests: parseInt(countsRow.unlock_requests_count || '0', 10),
        lg_leave_requests: parseInt(countsRow.leave_requests_count || '0', 10),
        venues: parseInt(countsRow.venues_count || '0', 10),
        venue_bookings: parseInt(countsRow.venue_bookings_count || '0', 10),
        booking_timeline_logs: parseInt(countsRow.booking_timeline_logs_count || '0', 10),
        venue_transfer_requests: parseInt(countsRow.venue_transfer_requests_count || '0', 10),
        timetable_slots: parseInt(countsRow.timetable_slots_count || '0', 10),
        attendance_records: parseInt(countsRow.attendance_records_count || '0', 10),
        cie_marks: parseInt(countsRow.cie_marks_count || '0', 10),
        placement_drives: parseInt(countsRow.placement_drives_count || '0', 10),
        placement_applications: parseInt(countsRow.placement_applications_count || '0', 10),
        finance_records: parseInt(countsRow.finance_records_count || '0', 10),
        institutional_documents: parseInt(countsRow.institutional_documents_count || '0', 10),
        college_metadata: parseInt(countsRow.college_metadata_count || '0', 10),
      },
      recordsCount: records.length,
      records,
    });
  } catch (error) {
    console.error('Verify DB Storage error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to inspect database storage',
    });
  }
}

export default {
  bootstrapSuperAdmin,
  provisionAuthority,
  provisionStudent,
  login,
  logout,
  searchUsers,
  verifyDbStorage,
};
