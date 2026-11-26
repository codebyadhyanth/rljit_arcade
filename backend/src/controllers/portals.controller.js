import pool, { ensureDatabaseExists } from '../config/db.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_DRIVE_STATUSES = ['OPEN', 'CLOSED', 'COMPLETED'];
const BOOKING_STATUSES = [
  'PENDING_HOD',
  'PENDING_MANAGEMENT',
  'PENDING_PRINCIPAL',
  'PARTIALLY_ACCEPTED',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
];

const isValidUuid = (val) => typeof val === 'string' && UUID_REGEX.test(val.trim());
const normUpper = (val) => String(val ?? '').trim().toUpperCase();
const round2 = (val) => Number(Number(val || 0).toFixed(2));
const isHodUser = (user) =>
  user?.adminTier === 'HOD_ADMIN' ||
  (Array.isArray(user?.subRoles) && user.subRoles.includes('HOD'));

function isValidIsoDate(val) {
  if (typeof val !== 'string') return false;
  const s = val.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function computeFinanceStatus(amountDue, fineAmount, amountPaid) {
  const totalOwed = round2(Number(amountDue) + Number(fineAmount));
  const paid = round2(Number(amountPaid));
  if (paid >= totalOwed) return 'PAID';
  if (paid > 0) return 'PARTIAL';
  return 'PENDING';
}

function buildDbReceipt(row, tableName, timestampOverride = null) {
  return {
    persisted: true,
    pgTransactionId: row.pg_xmin,
    physicalDiskTuple: row.pg_ctid,
    storedInTable: tableName,
    timestamp: timestampOverride || row.updated_at || row.created_at || row.applied_at,
  };
}

function parseBranches(raw) {
  if (Array.isArray(raw)) {
    return raw.map(normUpper).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw.split(',').map(normUpper).filter(Boolean);
  }
  return [];
}

/**
 * GET /api/v1/placements/drives
 * List placement drives with application counts and student-specific eligibility/status.
 */
export async function getPlacementDrives(req, res) {
  try {
    await ensureDatabaseExists();
    const { status, branch } = req.query;
    const isStudent = req.user.baseRole === 'STUDENT';

    const params = [isStudent ? req.user.userId : null];
    const conditions = [];

    if (status && String(status).trim()) {
      params.push(normUpper(status));
      conditions.push(`pd.status = $${params.length}`);
    }

    if (branch && String(branch).trim()) {
      params.push(normUpper(branch));
      conditions.push(
        `(COALESCE(array_length(pd.eligible_branches, 1), 0) = 0 OR EXISTS (SELECT 1 FROM unnest(pd.eligible_branches) b WHERE UPPER(b) = $${params.length}))`
      );
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const drivesQuery = `
      SELECT
        pd.id, pd.company_name, pd.role_title, pd.package_lpa, pd.min_cgpa,
        pd.eligible_branches, pd.drive_date, pd.status, pd.created_by, pd.created_at,
        COUNT(pa.id)::int AS applications_count,
        COALESCE(BOOL_OR(pa.student_id = $1::uuid), FALSE) AS applied,
        MAX(CASE WHEN pa.student_id = $1::uuid THEN pa.status ELSE NULL END) AS application_status
      FROM placement_drives pd
      LEFT JOIN placement_applications pa ON pa.drive_id = pd.id
      ${whereClause}
      GROUP BY pd.id
      ORDER BY pd.drive_date ASC, pd.created_at DESC;
    `;

    const [drivesRes, studentRes] = await Promise.all([
      pool.query(drivesQuery, params),
      isStudent
        ? pool.query('SELECT cgpa, department, core_branch FROM student WHERE user_id = $1', [
            req.user.userId,
          ])
        : Promise.resolve({ rowCount: 0, rows: [] }),
    ]);

    const studentRow =
      studentRes.rowCount > 0
        ? studentRes.rows[0]
        : { cgpa: 0, department: req.user.department, core_branch: null };
    const studentCgpa = Number(studentRow.cgpa || 0);
    const studentBranch = normUpper(studentRow.core_branch || studentRow.department);

    const drives = drivesRes.rows.map((row) => {
      const minCgpa = Number(row.min_cgpa || 0);
      const eligibleBranches = (row.eligible_branches || []).map(normUpper).filter(Boolean);

      const base = {
        id: row.id,
        company_name: row.company_name,
        role_title: row.role_title,
        package_lpa: Number(row.package_lpa),
        min_cgpa: minCgpa,
        eligible_branches: row.eligible_branches || [],
        drive_date: row.drive_date,
        status: row.status,
        created_by: row.created_by,
        created_at: row.created_at,
        applications_count: row.applications_count,
      };

      if (isStudent) {
        const branchOk =
          eligibleBranches.length === 0 || (studentBranch && eligibleBranches.includes(studentBranch));
        base.applied = Boolean(row.applied);
        base.application_status = row.application_status || null;
        base.is_eligible = studentCgpa >= minCgpa && Boolean(branchOk);
      }

      return base;
    });

    return res.status(200).json({
      success: true,
      count: drives.length,
      drives,
    });
  } catch (error) {
    console.error('getPlacementDrives error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch placement drives',
    });
  }
}

/**
 * POST /api/v1/placements/drives
 * Create a new placement drive (PLC Admin or SUPER_ADMIN).
 */
export async function createPlacementDrive(req, res) {
  try {
    await ensureDatabaseExists();
    const {
      company_name,
      role_title,
      package_lpa,
      min_cgpa = 0,
      eligible_branches = [],
      drive_date,
      status = 'OPEN',
    } = req.body || {};

    if (!company_name || !role_title || package_lpa === undefined || package_lpa === null || !drive_date) {
      return res.status(400).json({
        success: false,
        error: 'company_name, role_title, package_lpa, and drive_date are required',
      });
    }

    const packageLpa = Number(package_lpa);
    const minCgpa = Number(min_cgpa ?? 0);
    if (!Number.isFinite(packageLpa) || packageLpa < 0) {
      return res.status(400).json({ success: false, error: 'package_lpa must be a non-negative number' });
    }
    if (!Number.isFinite(minCgpa) || minCgpa < 0 || minCgpa > 10) {
      return res.status(400).json({ success: false, error: 'min_cgpa must be between 0 and 10' });
    }
    if (!isValidIsoDate(String(drive_date))) {
      return res.status(400).json({ success: false, error: 'drive_date must be a valid YYYY-MM-DD date' });
    }

    const driveStatus = normUpper(status || 'OPEN');
    if (!VALID_DRIVE_STATUSES.includes(driveStatus)) {
      return res.status(400).json({
        success: false,
        error: `status must be one of: ${VALID_DRIVE_STATUSES.join(', ')}`,
      });
    }

    const branches = parseBranches(eligible_branches);
    const result = await pool.query(
      `INSERT INTO placement_drives (
         company_name, role_title, package_lpa, min_cgpa, eligible_branches, drive_date, status, created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *, xmin::text AS pg_xmin, ctid::text AS pg_ctid;`,
      [
        String(company_name).trim(),
        String(role_title).trim(),
        packageLpa,
        minCgpa,
        branches,
        drive_date,
        driveStatus,
        req.user.userId,
      ]
    );

    const row = result.rows[0];
    return res.status(201).json({
      success: true,
      message: 'Placement drive created successfully',
      drive: {
        ...row,
        package_lpa: Number(row.package_lpa),
        min_cgpa: Number(row.min_cgpa),
      },
      dbReceipt: buildDbReceipt(row, 'placement_drives'),
    });
  } catch (error) {
    console.error('createPlacementDrive error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to create placement drive',
    });
  }
}

/**
 * POST /api/v1/placements/drives/:id/apply
 * Student (or Super Admin with student_id) applies to an OPEN placement drive after eligibility checks.
 */
export async function applyToPlacementDrive(req, res) {
  try {
    await ensureDatabaseExists();
    const { id: driveId } = req.params;

    if (!isValidUuid(driveId)) {
      return res.status(400).json({ success: false, error: 'Invalid placement drive ID' });
    }

    let targetStudentId;
    if (req.user.baseRole === 'STUDENT') {
      targetStudentId = req.user.userId;
    } else if (req.user.adminTier === 'SUPER_ADMIN') {
      targetStudentId = req.body?.student_id;
      if (!isValidUuid(targetStudentId)) {
        return res.status(400).json({
          success: false,
          error: 'Valid student_id is required when applying as SUPER_ADMIN',
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Only students can apply to placement drives',
      });
    }

    const [driveRes, studentRes] = await Promise.all([
      pool.query('SELECT * FROM placement_drives WHERE id = $1', [driveId]),
      pool.query(
        'SELECT user_id, usn, cgpa, department, core_branch FROM student WHERE user_id = $1',
        [targetStudentId]
      ),
    ]);

    if (driveRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Placement drive not found' });
    }
    const drive = driveRes.rows[0];

    if (drive.status !== 'OPEN') {
      return res.status(400).json({
        success: false,
        error: `Placement drive is '${drive.status}' and not accepting applications`,
      });
    }

    if (studentRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Student profile not found' });
    }
    const student = studentRes.rows[0];

    const studentCgpa = Number(student.cgpa || 0);
    const minCgpa = Number(drive.min_cgpa || 0);
    if (studentCgpa < minCgpa) {
      return res.status(400).json({
        success: false,
        error: `Ineligible for drive: minimum CGPA ${minCgpa} required (student CGPA: ${studentCgpa})`,
      });
    }

    const eligibleBranches = (drive.eligible_branches || []).map(normUpper).filter(Boolean);
    const studentBranch = normUpper(student.core_branch || student.department);
    if (eligibleBranches.length > 0 && !eligibleBranches.includes(studentBranch)) {
      return res.status(400).json({
        success: false,
        error: `Ineligible for drive: branch '${studentBranch}' is not in eligible branches [${eligibleBranches.join(', ')}]`,
      });
    }

    const insertRes = await pool.query(
      `INSERT INTO placement_applications (drive_id, student_id, status)
       VALUES ($1, $2, 'APPLIED')
       RETURNING *, xmin::text AS pg_xmin, ctid::text AS pg_ctid;`,
      [driveId, targetStudentId]
    );

    const row = insertRes.rows[0];
    return res.status(201).json({
      success: true,
      message: 'Application submitted successfully',
      application: row,
      dbReceipt: buildDbReceipt(row, 'placement_applications', row.applied_at),
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'Already applied to this placement drive',
      });
    }
    console.error('applyToPlacementDrive error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to apply to placement drive',
    });
  }
}

/**
 * GET /api/v1/finance/records
 * Fetch normalized finance records with strict role/department/self scoping and summary totals.
 */
export async function getFinanceRecords(req, res) {
  try {
    await ensureDatabaseExists();
    const isStudent = req.user.baseRole === 'STUDENT';
    const isSuperAdmin = req.user.adminTier === 'SUPER_ADMIN';
    const subRoles = Array.isArray(req.user.subRoles) ? req.user.subRoles : [];
    const section = normUpper(req.user.sectionCode);
    const isGlobalViewer =
      isSuperAdmin ||
      (req.user.baseRole === 'ADMIN' && ['ACC', 'MGT', 'PRN'].includes(section)) ||
      subRoles.includes('MANAGEMENT') ||
      subRoles.includes('PRINCIPAL');
    const isHod = isHodUser(req.user);

    if (!isStudent && !isGlobalViewer && !isHod) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Insufficient privileges to access finance records',
      });
    }

    const params = [];
    const conditions = [];

    if (isStudent) {
      params.push(req.user.userId);
      conditions.push(`fr.student_id = $${params.length}`);
    } else {
      const { student_id, usn, department } = req.query;

      if (isHod && !isGlobalViewer) {
        const hodDept = normUpper(req.user.department);
        if (!hodDept) {
          return res.status(403).json({
            success: false,
            error: 'Department scope missing on HOD profile',
          });
        }
        if (department && normUpper(department) !== hodDept) {
          return res.status(403).json({
            success: false,
            error: `Department Scope Violation: Cannot view finance records for '${department}'`,
          });
        }
        params.push(hodDept);
        conditions.push(
          `(UPPER(COALESCE(s.department, u.department)) = $${params.length} OR UPPER(COALESCE(s.core_branch, '')) = $${params.length})`
        );
      } else if (department && String(department).trim()) {
        params.push(normUpper(department));
        conditions.push(`UPPER(COALESCE(s.department, u.department)) = $${params.length}`);
      }

      if (student_id && String(student_id).trim()) {
        if (!isValidUuid(student_id)) {
          return res.status(400).json({ success: false, error: 'Invalid student_id filter' });
        }
        params.push(student_id.trim());
        conditions.push(`fr.student_id = $${params.length}`);
      }

      if (usn && String(usn).trim()) {
        params.push(normUpper(usn));
        conditions.push(`UPPER(COALESCE(s.usn, u.username)) = $${params.length}`);
      }
    }

    if (req.query.status && String(req.query.status).trim()) {
      params.push(normUpper(req.query.status));
      conditions.push(`UPPER(fr.status) = $${params.length}`);
    }
    if (req.query.fee_type && String(req.query.fee_type).trim()) {
      params.push(normUpper(req.query.fee_type));
      conditions.push(`UPPER(fr.fee_type) = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const query = `
      SELECT
        fr.id, fr.student_id, fr.fee_type, fr.amount_due, fr.amount_paid, fr.fine_amount,
        fr.status, fr.due_date, fr.updated_by, fr.created_at, fr.updated_at,
        COALESCE(s.usn, u.username) AS usn,
        s.full_name AS student_name,
        COALESCE(s.department, u.department) AS department,
        COALESCE(s.semester, u.semester) AS semester
      FROM finance_records fr
      JOIN users u ON u.id = fr.student_id
      LEFT JOIN student s ON s.user_id = fr.student_id
      ${whereClause}
      ORDER BY fr.created_at DESC;
    `;

    const result = await pool.query(query, params);

    let totalDue = 0;
    let totalPaid = 0;
    let totalFine = 0;
    const records = result.rows.map((r) => {
      const amountDue = Number(r.amount_due || 0);
      const amountPaid = Number(r.amount_paid || 0);
      const fineAmount = Number(r.fine_amount || 0);
      totalDue += amountDue;
      totalPaid += amountPaid;
      totalFine += fineAmount;
      return {
        ...r,
        amount_due: amountDue,
        amount_paid: amountPaid,
        fine_amount: fineAmount,
      };
    });

    const summary = {
      total_due: round2(totalDue),
      total_paid: round2(totalPaid),
      total_fine: round2(totalFine),
      outstanding_balance: round2(Math.max(0, totalDue + totalFine - totalPaid)),
    };

    return res.status(200).json({
      success: true,
      count: records.length,
      summary,
      records,
    });
  } catch (error) {
    console.error('getFinanceRecords error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch finance records',
    });
  }
}

/**
 * POST /api/v1/finance/records
 * Create a normalized finance record (ACC Admin or SUPER_ADMIN).
 */
export async function createFinanceRecord(req, res) {
  try {
    await ensureDatabaseExists();
    const {
      student_id,
      usn,
      fee_type,
      amount_due,
      amount_paid = 0,
      fine_amount = 0,
      due_date = null,
    } = req.body || {};

    if (!fee_type || amount_due === undefined || amount_due === null || amount_due === '') {
      return res.status(400).json({
        success: false,
        error: 'fee_type and amount_due are required',
      });
    }

    const amountDue = Number(amount_due);
    const amountPaid = Number(amount_paid ?? 0);
    const fineAmount = Number(fine_amount ?? 0);
    if (
      !Number.isFinite(amountDue) ||
      !Number.isFinite(amountPaid) ||
      !Number.isFinite(fineAmount) ||
      amountDue < 0 ||
      amountPaid < 0 ||
      fineAmount < 0
    ) {
      return res.status(400).json({
        success: false,
        error: 'amount_due, amount_paid, and fine_amount must be valid non-negative numbers',
      });
    }

    if (round2(amountPaid) > round2(amountDue + fineAmount)) {
      return res.status(400).json({
        success: false,
        error: 'amount_paid cannot exceed total amount_due + fine_amount',
      });
    }

    const cleanDueDate =
      due_date !== undefined && due_date !== null && String(due_date).trim() !== ''
        ? String(due_date).trim()
        : null;
    if (cleanDueDate && !isValidIsoDate(cleanDueDate)) {
      return res.status(400).json({ success: false, error: 'due_date must be a valid YYYY-MM-DD date' });
    }

    let resolvedStudentId = null;
    if (student_id) {
      if (!isValidUuid(student_id)) {
        return res.status(400).json({ success: false, error: 'Invalid student_id' });
      }
      const userCheck = await pool.query(
        "SELECT id FROM users WHERE id = $1 AND base_role = 'STUDENT'",
        [student_id]
      );
      if (userCheck.rowCount === 0) {
        return res.status(404).json({ success: false, error: 'Student not found for student_id' });
      }
      resolvedStudentId = userCheck.rows[0].id;
    } else if (usn && String(usn).trim()) {
      const lookup = await pool.query(
        `SELECT u.id AS user_id
         FROM users u
         LEFT JOIN student s ON s.user_id = u.id
         WHERE u.base_role = 'STUDENT'
           AND (UPPER(s.usn) = $1 OR UPPER(u.username) = $1)
         LIMIT 1;`,
        [normUpper(usn)]
      );
      if (lookup.rowCount === 0) {
        return res.status(404).json({ success: false, error: `Student not found for USN '${usn}'` });
      }
      resolvedStudentId = lookup.rows[0].user_id;
    } else {
      return res.status(400).json({
        success: false,
        error: 'Either student_id or usn is required',
      });
    }

    const status = computeFinanceStatus(amountDue, fineAmount, amountPaid);
    const result = await pool.query(
      `INSERT INTO finance_records (
         student_id, fee_type, amount_due, amount_paid, fine_amount, status, due_date, updated_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *, xmin::text AS pg_xmin, ctid::text AS pg_ctid;`,
      [
        resolvedStudentId,
        normUpper(fee_type).slice(0, 64),
        round2(amountDue),
        round2(amountPaid),
        round2(fineAmount),
        status,
        cleanDueDate,
        req.user.userId,
      ]
    );

    const row = result.rows[0];
    return res.status(201).json({
      success: true,
      message: 'Finance record created successfully',
      record: {
        ...row,
        amount_due: Number(row.amount_due),
        amount_paid: Number(row.amount_paid),
        fine_amount: Number(row.fine_amount),
      },
      dbReceipt: buildDbReceipt(row, 'finance_records'),
    });
  } catch (error) {
    console.error('createFinanceRecord error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to create finance record',
    });
  }
}

/**
 * PATCH /api/v1/finance/records/:id/pay
 * Transactional payment reconciliation on finance_records (ACC Admin or SUPER_ADMIN).
 */
export async function payFinanceRecord(req, res) {
  let client = null;
  try {
    await ensureDatabaseExists();
    const { id } = req.params;
    if (!isValidUuid(id)) {
      return res.status(400).json({ success: false, error: 'Invalid finance record ID' });
    }

    const { payment_amount, fine_payment = 0, amount_paid } = req.body || {};
    const rawPay = payment_amount !== undefined ? payment_amount : amount_paid;
    const basePay = Number(rawPay ?? 0);
    const finePay = Number(fine_payment ?? 0);

    if (
      !Number.isFinite(basePay) ||
      !Number.isFinite(finePay) ||
      basePay < 0 ||
      finePay < 0 ||
      basePay + finePay <= 0
    ) {
      return res.status(400).json({
        success: false,
        error: 'A positive payment_amount (or amount_paid) / fine_payment is required',
      });
    }

    client = await pool.connect();
    await client.query('BEGIN');

    const existingRes = await client.query(
      'SELECT * FROM finance_records WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (existingRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Finance record not found' });
    }

    const existing = existingRes.rows[0];
    const totalOwed = round2(Number(existing.amount_due || 0) + Number(existing.fine_amount || 0));
    const alreadyPaid = round2(Number(existing.amount_paid || 0));
    const remainingBalance = round2(Math.max(0, totalOwed - alreadyPaid));

    if (existing.status === 'PAID' || remainingBalance <= 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        error: 'Finance record is already fully PAID',
      });
    }

    const totalPayment = round2(basePay + finePay);
    if (totalPayment > remainingBalance) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: `Payment (${totalPayment}) exceeds remaining balance (${remainingBalance})`,
      });
    }

    const newAmountPaid = round2(alreadyPaid + totalPayment);
    const newStatus = computeFinanceStatus(existing.amount_due, existing.fine_amount, newAmountPaid);

    const updateRes = await client.query(
      `UPDATE finance_records
       SET amount_paid = $1,
           status = $2,
           updated_by = $3,
           updated_at = NOW()
       WHERE id = $4
       RETURNING *, xmin::text AS pg_xmin, ctid::text AS pg_ctid;`,
      [newAmountPaid, newStatus, req.user.userId, id]
    );

    await client.query('COMMIT');
    const row = updateRes.rows[0];

    return res.status(200).json({
      success: true,
      message: 'Finance payment recorded successfully',
      record: {
        ...row,
        amount_due: Number(row.amount_due),
        amount_paid: Number(row.amount_paid),
        fine_amount: Number(row.fine_amount),
      },
      dbReceipt: buildDbReceipt(row, 'finance_records'),
    });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rbErr) {
        console.error('Rollback error on payFinanceRecord:', rbErr.message);
      }
    }
    console.error('payFinanceRecord error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to record finance payment',
    });
  } finally {
    if (client) client.release();
  }
}

/**
 * GET /api/v1/analytics/overview
 * High-speed role-scoped aggregated analytics (<50ms via parallel SQL aggregations).
 */
export async function getAnalyticsOverview(req, res) {
  try {
    await ensureDatabaseExists();
    const t0 = performance.now();

    const { userId, baseRole, adminTier, department, sectionCode } = req.user;
    const isSuperAdmin = adminTier === 'SUPER_ADMIN';
    const isAdmin = isSuperAdmin || baseRole === 'ADMIN';
    const isHod = isHodUser(req.user);
    const isStudent = baseRole === 'STUDENT';
    const isPlainFaculty = !isAdmin && !isHod && baseRole === 'FACULTY';
    const isDeptScoped = !isAdmin && (isHod || baseRole === 'FACULTY');
    const dept = normUpper(department) || '__NONE__';

    const scopeLevel = isAdmin ? 'GLOBAL' : isDeptScoped ? 'DEPARTMENT' : 'SELF';

    if (isStudent) {
      const studentSql = `
        SELECT
          (SELECT COUNT(*)::int FROM placement_drives) AS total_drives,
          (SELECT COUNT(*) FILTER (WHERE status = 'OPEN')::int FROM placement_drives) AS open_drives,
          (SELECT COUNT(*)::int FROM placement_applications WHERE student_id = $1::uuid) AS my_applications,
          (SELECT json_build_object(
            'total_billed', COALESCE(SUM(fr.amount_due + fr.fine_amount), 0)::float8,
            'total_collected', COALESCE(SUM(fr.amount_paid), 0)::float8,
            'total_fines', COALESCE(SUM(fr.fine_amount), 0)::float8,
            'total_outstanding', COALESCE(SUM(GREATEST(0, (fr.amount_due + fr.fine_amount) - fr.amount_paid)), 0)::float8,
            'pending_count', COUNT(*) FILTER (WHERE fr.status = 'PENDING')::int,
            'partial_count', COUNT(*) FILTER (WHERE fr.status = 'PARTIAL')::int,
            'paid_count', COUNT(*) FILTER (WHERE fr.status = 'PAID')::int
          ) FROM finance_records fr WHERE fr.student_id = $1::uuid) AS finance_row,
          (SELECT json_build_object(
            'attendance_records_count', (SELECT COUNT(*)::int FROM attendance_records WHERE student_id = $1::uuid),
            'attendance_present_pct', (
              SELECT COALESCE(
                ROUND(COUNT(*) FILTER (WHERE status IN ('PRESENT', 'LATE')) * 100.0 / NULLIF(COUNT(*), 0), 2),
                0
              )::float8
              FROM attendance_records WHERE student_id = $1::uuid
            ),
            'avg_cie_marks', (
              SELECT COALESCE(ROUND(AVG(total_cie), 2), 0)::float8
              FROM cie_marks WHERE student_id = $1::uuid
            ),
            'cie_records_count', (SELECT COUNT(*)::int FROM cie_marks WHERE student_id = $1::uuid)
          )) AS academic_row;
      `;

      const studentRes = await pool.query(studentSql, [userId]);
      const execTimeMs = round2(performance.now() - t0);
      const sRow = studentRes.rows[0] || {};
      const fRow = sRow.finance_row || {};
      const aRow = sRow.academic_row || {};

      return res.status(200).json({
        success: true,
        execTimeMs,
        scope: {
          level: scopeLevel,
          role: 'STUDENT',
          department: department || null,
          section: sectionCode || null,
        },
        totals: {
          total_drives: sRow.total_drives || 0,
          open_drives: sRow.open_drives || 0,
          my_applications: sRow.my_applications || 0,
        },
        financeSummary: {
          total_billed: round2(fRow.total_billed),
          total_collected: round2(fRow.total_collected),
          total_fines: round2(fRow.total_fines),
          total_outstanding: round2(fRow.total_outstanding),
          pending_count: fRow.pending_count || 0,
          partial_count: fRow.partial_count || 0,
          paid_count: fRow.paid_count || 0,
        },
        academicSummary: {
          attendance_records_count: aRow.attendance_records_count || 0,
          attendance_present_pct: Number(aRow.attendance_present_pct || 0),
          avg_cie_marks: Number(aRow.avg_cie_marks || 0),
          cie_records_count: aRow.cie_records_count || 0,
        },
        placementSummary: {
          total_drives: sRow.total_drives || 0,
          open_drives: sRow.open_drives || 0,
          my_applications: sRow.my_applications || 0,
        },
      });
    }

    const queryParams = isDeptScoped ? [dept] : [];

    const studentWhere = isDeptScoped ? 'WHERE UPPER(department) = $1::text' : '';
    const alliedWhere = isDeptScoped
      ? "WHERE UPPER(department) = 'ALLIED_SCIENCE' AND ($1::text = 'ALLIED_SCIENCE' OR UPPER(core_branch) = $1::text)"
      : "WHERE UPPER(department) = 'ALLIED_SCIENCE'";
    const facultyWhere = isDeptScoped ? 'WHERE UPPER(department) = $1::text' : '';
    const bookingWhere = isDeptScoped ? 'WHERE UPPER(department) = $1::text' : '';
    const financeWhere = isDeptScoped
      ? "JOIN users u ON u.id = fr.student_id LEFT JOIN student s ON s.user_id = fr.student_id WHERE (UPPER(COALESCE(s.department, u.department)) = $1::text OR UPPER(COALESCE(s.core_branch, '')) = $1::text)"
      : '';
    const acadWhere = isDeptScoped ? 'WHERE UPPER(department) = $1::text' : '';

    const financeSelect = isPlainFaculty
      ? 'NULL::json AS finance_row'
      : `(SELECT json_build_object(
          'total_billed', COALESCE(SUM(fr.amount_due + fr.fine_amount), 0)::float8,
          'total_collected', COALESCE(SUM(fr.amount_paid), 0)::float8,
          'total_fines', COALESCE(SUM(fr.fine_amount), 0)::float8,
          'total_outstanding', COALESCE(SUM(GREATEST(0, (fr.amount_due + fr.fine_amount) - fr.amount_paid)), 0)::float8,
          'pending_count', COUNT(*) FILTER (WHERE fr.status = 'PENDING')::int,
          'partial_count', COUNT(*) FILTER (WHERE fr.status = 'PARTIAL')::int,
          'paid_count', COUNT(*) FILTER (WHERE fr.status = 'PAID')::int
        ) FROM finance_records fr ${financeWhere}) AS finance_row`;

    const analyticsSql = `
      SELECT
        (SELECT json_build_object(
          'users', (SELECT COUNT(*)::int FROM users ${isDeptScoped ? 'WHERE UPPER(department) = $1::text' : ''}),
          'students', (SELECT COUNT(*)::int FROM student ${studentWhere}),
          'faculty', (SELECT COUNT(*)::int FROM faculty ${facultyWhere}),
          'admins', ${isDeptScoped ? '0' : "(SELECT COUNT(*)::int FROM users WHERE base_role = 'ADMIN')"},
          'venues', (SELECT COUNT(*)::int FROM venues),
          'total_drives', (SELECT COUNT(*)::int FROM placement_drives),
          'open_drives', (SELECT COUNT(*) FILTER (WHERE status = 'OPEN')::int FROM placement_drives),
          'total_applications', (
            SELECT COUNT(*)::int
            FROM placement_applications pa
            ${isDeptScoped ? 'LEFT JOIN student s ON s.user_id = pa.student_id LEFT JOIN users u ON u.id = pa.student_id WHERE UPPER(COALESCE(s.department, u.department)) = $1::text' : ''}
          )
        )) AS totals_row,

        COALESCE((
          SELECT json_agg(row_to_json(t) ORDER BY t.count DESC, t.department ASC)
          FROM (
            SELECT
              COALESCE(NULLIF(department, ''), 'UNASSIGNED') AS department,
              COUNT(*)::int AS count,
              COUNT(*) FILTER (WHERE UPPER(COALESCE(entry_type, 'REGULAR')) = 'REGULAR')::int AS regular_count,
              COUNT(*) FILTER (WHERE UPPER(COALESCE(entry_type, '')) = 'LATERAL')::int AS lateral_count
            FROM student
            ${studentWhere}
            GROUP BY 1
          ) t
        ), '[]'::json) AS students_by_department,

        COALESCE((
          SELECT json_agg(row_to_json(t) ORDER BY t.count DESC, t.core_branch ASC)
          FROM (
            SELECT
              COALESCE(NULLIF(core_branch, ''), 'UNSPECIFIED') AS core_branch,
              COUNT(*)::int AS count
            FROM student
            ${alliedWhere}
            GROUP BY 1
          ) t
        ), '[]'::json) AS allied_science_by_branch,

        COALESCE((
          SELECT json_agg(row_to_json(t) ORDER BY t.academic_year ASC NULLS LAST)
          FROM (
            SELECT
              COALESCE(
                academic_year,
                CASE
                  WHEN semester BETWEEN 1 AND 2 THEN 1
                  WHEN semester BETWEEN 3 AND 4 THEN 2
                  WHEN semester BETWEEN 5 AND 6 THEN 3
                  WHEN semester BETWEEN 7 AND 8 THEN 4
                  ELSE NULL
                END
              )::int AS academic_year,
              COUNT(*)::int AS count
            FROM student
            ${studentWhere}
            GROUP BY 1
          ) t
        ), '[]'::json) AS students_by_year,

        COALESCE((
          SELECT json_agg(row_to_json(t) ORDER BY t.count DESC, t.classification ASC)
          FROM (
            SELECT
              COALESCE(NULLIF(classification, ''), NULLIF(designation, ''), 'UNSPECIFIED') AS classification,
              COUNT(*)::int AS count
            FROM faculty
            ${facultyWhere}
            GROUP BY 1
          ) t
        ), '[]'::json) AS faculty_by_classification,

        COALESCE((
          SELECT json_agg(row_to_json(t) ORDER BY t.count DESC, t.department ASC)
          FROM (
            SELECT
              COALESCE(NULLIF(department, ''), 'UNASSIGNED') AS department,
              COUNT(*)::int AS count
            FROM faculty
            ${facultyWhere}
            GROUP BY 1
          ) t
        ), '[]'::json) AS faculty_by_department,

        COALESCE((
          SELECT json_agg(row_to_json(t))
          FROM (
            SELECT status, COUNT(*)::int AS count
            FROM venue_bookings
            ${bookingWhere}
            GROUP BY status
          ) t
        ), '[]'::json) AS booking_counts,

        ${financeSelect},

        (SELECT json_build_object(
          'attendance_records_count', (SELECT COUNT(*)::int FROM attendance_records ${acadWhere}),
          'attendance_present_pct', (
            SELECT COALESCE(
              ROUND(COUNT(*) FILTER (WHERE status IN ('PRESENT', 'LATE')) * 100.0 / NULLIF(COUNT(*), 0), 2),
              0
            )::float8
            FROM attendance_records ${acadWhere}
          ),
          'avg_cie_marks', (
            SELECT COALESCE(ROUND(AVG(total_cie), 2), 0)::float8
            FROM cie_marks ${acadWhere}
          ),
          'cie_records_count', (SELECT COUNT(*)::int FROM cie_marks ${acadWhere})
        )) AS academic_row;
    `;

    const result = await pool.query(analyticsSql, queryParams);
    const execTimeMs = round2(performance.now() - t0);

    const data = result.rows[0] || {};
    const tRow = data.totals_row || {};
    const fRow = data.finance_row || null;
    const aRow = data.academic_row || {};

    const bookingsByStatus = Object.fromEntries(BOOKING_STATUSES.map((s) => [s, 0]));
    for (const b of data.booking_counts || []) {
      bookingsByStatus[b.status] = b.count;
    }

    const pendingBookings =
      bookingsByStatus.PENDING_HOD +
      bookingsByStatus.PENDING_MANAGEMENT +
      bookingsByStatus.PENDING_PRINCIPAL +
      bookingsByStatus.PARTIALLY_ACCEPTED;

    const financeSummary = isPlainFaculty || !fRow
      ? null
      : {
          total_billed: round2(fRow.total_billed),
          total_collected: round2(fRow.total_collected),
          total_fines: round2(fRow.total_fines),
          total_outstanding: round2(fRow.total_outstanding),
          pending_count: fRow.pending_count || 0,
          partial_count: fRow.partial_count || 0,
          paid_count: fRow.paid_count || 0,
        };

    return res.status(200).json({
      success: true,
      execTimeMs,
      scope: {
        level: scopeLevel,
        role: isHod ? 'HOD' : adminTier || baseRole,
        department: department || null,
        section: sectionCode || null,
      },
      totals: {
        users: tRow.users || 0,
        students: tRow.students || 0,
        faculty: tRow.faculty || 0,
        admins: tRow.admins || 0,
        venues: tRow.venues || 0,
        pendingBookings,
        approvedBookings: bookingsByStatus.APPROVED || 0,
        openDrives: tRow.open_drives || 0,
      },
      studentsByDepartment: data.students_by_department || [],
      alliedScienceByBranch: data.allied_science_by_branch || [],
      studentsByYear: data.students_by_year || [],
      facultyByClassification: data.faculty_by_classification || [],
      facultyByDepartment: data.faculty_by_department || [],
      venueStats: {
        total_venues: tRow.venues || 0,
        bookings_by_status: bookingsByStatus,
      },
      financeSummary,
      academicSummary: {
        attendance_records_count: aRow.attendance_records_count || 0,
        attendance_present_pct: Number(aRow.attendance_present_pct || 0),
        avg_cie_marks: Number(aRow.avg_cie_marks || 0),
        cie_records_count: aRow.cie_records_count || 0,
      },
      placementSummary: {
        total_drives: tRow.total_drives || 0,
        open_drives: tRow.open_drives || 0,
        total_applications: tRow.total_applications || 0,
      },
    });
  } catch (error) {
    console.error('getAnalyticsOverview error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to compute analytics overview',
    });
  }
}

export default {
  getPlacementDrives,
  createPlacementDrive,
  applyToPlacementDrive,
  getFinanceRecords,
  createFinanceRecord,
  payFinanceRecord,
  getAnalyticsOverview,
};
