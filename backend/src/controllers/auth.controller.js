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
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

/**
 * A. POST /api/v1/auth/bootstrap-super-admin
 * Step 1: First-time setup to bootstrap the initial Super Admin
 */
export async function bootstrapSuperAdmin(req, res) {
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

    const temporaryPassword = password || generateTempPassword(14);
    const passwordHash = await hashPassword(temporaryPassword);

    const fullNameEnc = encryptAES(fullName);
    const emailEnc = encryptAES(email);
    const phoneEnc = encryptAES(phone);

    const emailBidx = createBlindIndex(email);
    const phoneBidx = createBlindIndex(phone);

    // 4. Generate RLSUPER001
    const username = await generateUsername({ adminTier: 'SUPER_ADMIN' }, pool);

    // 5. Insert into users
    const insertQuery = `
      INSERT INTO users (
        username, password_hash, full_name_encrypted, email_encrypted, phone_encrypted,
        email_bidx, phone_bidx, base_role, admin_tier, sub_roles, permissions,
        must_change_password, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'ADMIN', 'SUPER_ADMIN', $8, $9, TRUE, TRUE)
      RETURNING id, username, base_role, admin_tier, permissions, created_at;
    `;

    await pool.query(insertQuery, [
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

    // Sync into admin table for diagnostic visibility
    await pool.query(
      `INSERT INTO admin (admin_code, full_name, email, section_role, is_mastermind)
       VALUES ($1, $2, $3, 'SUPER_ADMIN', TRUE)
       ON CONFLICT (admin_code) DO NOTHING;`,
      [username, fullName, email]
    );

    return res.status(201).json({
      success: true,
      message: 'Super Admin successfully bootstrapped',
      username,
      temporaryPassword,
      redirectUrl: '/portal/super-admin/mastermind-home',
    });
  } catch (error) {
    console.error('Bootstrap Super Admin error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to bootstrap Super Admin',
    });
  }
}

/**
 * B. POST /api/v1/super-admin/provision-authority
 * Step 2: Super Admin provisions Admission Admin, HODs, or Faculty
 */
export async function provisionAuthority(req, res) {
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
    } = req.body;

    if (!authorityType || !fullName || !email || !phone) {
      return res.status(400).json({
        success: false,
        error: 'authorityType, fullName, email, and phone are required',
      });
    }

    const authType = authorityType.toUpperCase();
    const dept = department ? department.trim().toUpperCase() : null;
    const sec = sectionCode ? sectionCode.trim().toUpperCase() : null;

    let baseRole = '';
    let adminTier = null;
    let permissions = [];
    let assignedSubRoles = Array.isArray(subRoles) ? [...subRoles] : [];
    let redirectUrl = '';

    // 1. REGULAR_ADMIN
    if (authType === 'REGULAR_ADMIN') {
      const validSections = ['ADM', 'ACC', 'PLC', 'SPT'];
      if (!sec || !validSections.includes(sec)) {
        return res.status(400).json({
          success: false,
          error: `sectionCode is required for REGULAR_ADMIN and must be one of: ${validSections.join(', ')}`,
        });
      }

      baseRole = 'ADMIN';
      adminTier = 'REGULAR_ADMIN';
      if (!assignedSubRoles.includes(sec)) assignedSubRoles.push(sec);

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

    // Generate atomic username
    const username = await generateUsername(
      {
        role: baseRole,
        adminTier,
        sectionCode: sec,
        department: dept,
      },
      pool
    );

    const temporaryPassword = generateTempPassword(12);
    const passwordHash = await hashPassword(temporaryPassword);

    const fullNameEnc = encryptAES(fullName);
    const emailEnc = encryptAES(email);
    const phoneEnc = encryptAES(phone);

    const insertQuery = `
      INSERT INTO users (
        username, password_hash, full_name_encrypted, email_encrypted, phone_encrypted,
        email_bidx, phone_bidx, base_role, admin_tier, sub_roles, permissions,
        department, section_code, created_by, must_change_password, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, TRUE, TRUE)
      RETURNING id, username, base_role, admin_tier, sub_roles, permissions, department, section_code;
    `;

    const creatorId = req.user?.userId || null;
    await pool.query(insertQuery, [
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

    // Sync into legacy faculty or admin table
    if (baseRole === 'FACULTY') {
      await pool.query(
        `INSERT INTO faculty (emp_id, full_name, email, department, designation, is_hod)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (emp_id) DO NOTHING;`,
        [username, fullName, email, dept, adminTier === 'HOD_ADMIN' ? 'HOD' : 'Assistant Professor', adminTier === 'HOD_ADMIN']
      );
    } else if (baseRole === 'ADMIN') {
      await pool.query(
        `INSERT INTO admin (admin_code, full_name, email, section_role, is_mastermind)
         VALUES ($1, $2, $3, $4, FALSE)
         ON CONFLICT (admin_code) DO NOTHING;`,
        [username, fullName, email, sec]
      );
    }

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
      redirectUrl,
    });
  } catch (error) {
    console.error('Provision Authority error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to provision authority',
    });
  }
}

/**
 * C. POST /api/v1/portals/provision-student
 * Step 3: Student creation via Admission Portal or HOD Admin Portal
 */
export async function provisionStudent(req, res) {
  try {
    await ensureDatabaseExists();

    const {
      fullName,
      email,
      phone,
      department,
      admissionYear,
      semester,
      entryType = 'REGULAR',
      subRoles = ['STUDENT'],
    } = req.body;

    if (!fullName || !email || !phone || !department) {
      return res.status(400).json({
        success: false,
        error: 'fullName, email, phone, and department are required',
      });
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

    // Format fields
    const entry = String(entryType).trim().toUpperCase() === 'LATERAL' ? 'LATERAL' : 'REGULAR';
    const year = admissionYear ? parseInt(admissionYear, 10) : new Date().getFullYear();
    const sem = semester ? parseInt(semester, 10) : (entry === 'LATERAL' ? 3 : 1);

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

    // Generate atomic student USN: 1RL${YY}${DEPT}001 or 1RL${YY}${DEPT}401
    const usn = await generateUsername(
      {
        role: 'STUDENT',
        department: targetDept,
        admissionYear: year,
        entryType: entry,
      },
      pool
    );

    const temporaryPassword = generateTempPassword(12);
    const passwordHash = await hashPassword(temporaryPassword);

    const fullNameEnc = encryptAES(fullName);
    const emailEnc = encryptAES(email);
    const phoneEnc = encryptAES(phone);

    const studentSubRoles = Array.isArray(subRoles) && subRoles.length > 0 ? subRoles : ['STUDENT'];

    const insertUserQuery = `
      INSERT INTO users (
        username, password_hash, full_name_encrypted, email_encrypted, phone_encrypted,
        email_bidx, phone_bidx, base_role, admin_tier, sub_roles, permissions,
        department, admission_year, semester, entry_type, created_by,
        must_change_password, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'STUDENT', NULL, $8, $9, $10, $11, $12, $13, $14, TRUE, TRUE)
      RETURNING id, username, created_at;
    `;

    const creatorId = currentUser?.userId || currentUser?.id || null;

    const userResult = await pool.query(insertUserQuery, [
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

    const createdStudent = userResult.rows[0];

    // Sync into student table
    await pool.query(
      `INSERT INTO student (usn, full_name, email, department, semester, entry_type, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')
       ON CONFLICT (usn) DO UPDATE SET
         full_name = EXCLUDED.full_name,
         email = EXCLUDED.email,
         department = EXCLUDED.department,
         semester = EXCLUDED.semester;`,
      [usn, fullName, email, targetDept, sem, entry]
    );

    return res.status(201).json({
      success: true,
      message: 'Student successfully provisioned',
      createdByPortal,
      credentials: {
        username: usn,
        temporaryPassword,
      },
      studentProfile: {
        id: createdStudent.id,
        usn,
        fullName,
        email,
        phone,
        department: targetDept,
        admissionYear: year,
        semester: sem,
        entryType: entry,
      },
      redirectUrl: '/portal/student/home',
    });
  } catch (error) {
    console.error('Provision Student error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to provision student',
    });
  }
}

/**
 * D. POST /api/v1/auth/login
 * Verifies credentials, computes exact portal redirectUrl, returns JWT
 */
export async function login(req, res) {
  try {
    await ensureDatabaseExists();

    const { username, identifier, password } = req.body;
    const inputIdentifier = (username || identifier || '').trim();

    if (!inputIdentifier || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username/email/phone and password are required',
      });
    }

    let user = null;

    // Lookup strategy: email, phone, or username
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

    const q = (req.query.q || '').trim();
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
      const result = await pool.query(
        `SELECT id, username, full_name_encrypted, email_encrypted, phone_encrypted,
                base_role, admin_tier, sub_roles, permissions, department, section_code,
                admission_year, semester, entry_type, is_active, created_at
         FROM users
         WHERE email_bidx = $1 OR phone_bidx = $1
         LIMIT 20`,
        [bidx]
      );
      rows = result.rows;
    }

    // 2. Trigram / GIN fast search on username / USN
    if (rows.length === 0) {
      const sanitizedQ = q.toUpperCase();
      const trigramQuery = `
        SELECT id, username, full_name_encrypted, email_encrypted, phone_encrypted,
               base_role, admin_tier, sub_roles, permissions, department, section_code,
               admission_year, semester, entry_type, is_active, created_at,
               similarity(username, $1) as score
        FROM users
        WHERE username ILIKE $2 OR username % $1
        ORDER BY score DESC, created_at DESC
        LIMIT 20;
      `;
      const result = await pool.query(trigramQuery, [sanitizedQ, `%${sanitizedQ}%`]);
      rows = result.rows;
    }

    // Decrypt PII for results
    const results = rows.map((row) => ({
      id: row.id,
      username: row.username,
      fullName: decryptAES(row.full_name_encrypted),
      email: decryptAES(row.email_encrypted),
      phone: decryptAES(row.phone_encrypted),
      baseRole: row.base_role,
      adminTier: row.admin_tier,
      subRoles: row.sub_roles,
      permissions: row.permissions,
      department: row.department,
      sectionCode: row.section_code,
      admissionYear: row.admission_year,
      semester: row.semester,
      entryType: row.entry_type,
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

export default {
  bootstrapSuperAdmin,
  provisionAuthority,
  provisionStudent,
  login,
  searchUsers,
};

