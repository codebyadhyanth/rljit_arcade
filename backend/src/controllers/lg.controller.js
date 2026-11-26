import pool, { ensureDatabaseExists } from '../config/db.js';
import { decryptAES } from '../utils/crypto.util.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_SUB_ROLES = new Set([
  'CR',
  'LG_COORDINATOR',
  'CLUB_COORDINATOR',
  'CIE_COORDINATOR',
  'CLASS_ADVISOR',
  'MENTOR',
]);

const PRIVILEGED_ROLE_NAMES = new Set([
  'HOD',
  'HOD_ADMIN',
  'PRINCIPAL',
  'MANAGEMENT',
  'SUPER_ADMIN',
  'MASTERMIND',
  'ADMIN',
  'REGULAR_ADMIN',
]);

function isValidUuid(val) {
  return typeof val === 'string' && UUID_REGEX.test(val.trim());
}

function isValidIsoDate(val) {
  if (typeof val !== 'string') return false;
  const s = val.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function safeDecrypt(ciphertext) {
  if (!ciphertext) return null;
  try {
    return decryptAES(ciphertext);
  } catch {
    return '[Protected Data]';
  }
}

/**
 * POST /api/v1/hod/lg-mapping/assign
 * HOD bulk assigns a list of student USNs to an LG faculty member
 */
export async function assignLgMapping(req, res) {
  try {
    await ensureDatabaseExists();
    const { lgFacultyId, studentUsns, department } = req.body || {};
    const callerDept = req.user.department;
    const isSuperAdmin = req.user.adminTier === 'SUPER_ADMIN';

    const targetDept = (department || callerDept || '').trim().toUpperCase();
    if (!targetDept) {
      return res.status(400).json({ success: false, error: 'department is required' });
    }
    if (!isSuperAdmin && (!callerDept || callerDept.toUpperCase() !== targetDept)) {
      return res.status(403).json({
        success: false,
        error: `Department Scope Violation: Cannot assign LG mappings for department '${targetDept}'`,
      });
    }

    if (!lgFacultyId || !Array.isArray(studentUsns) || studentUsns.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'lgFacultyId and a non-empty studentUsns array are required',
      });
    }

    if (!isValidUuid(lgFacultyId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid lgFacultyId UUID format',
      });
    }

    // Verify LG faculty exists and is of base_role FACULTY
    const facCheck = await pool.query(
      "SELECT id FROM users WHERE id = $1 AND base_role = 'FACULTY'",
      [lgFacultyId]
    );
    if (facCheck.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Target faculty member not found' });
    }

    const normalizedUsns = studentUsns.map((u) => String(u).trim().toUpperCase()).filter(Boolean);
    const query = `
      UPDATE student
      SET lg_faculty_id = $1
      WHERE UPPER(usn) = ANY($2) AND UPPER(department) = $3
      RETURNING usn, full_name, department;
    `;
    const result = await pool.query(query, [lgFacultyId, normalizedUsns, targetDept]);

    return res.status(200).json({
      success: true,
      message: `Successfully mapped ${result.rowCount} students to LG faculty`,
      mappedCount: result.rowCount,
      mappedStudents: result.rows,
    });
  } catch (error) {
    console.error('assignLgMapping error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to map LG mentees' });
  }
}

/**
 * PATCH /api/v1/hod/assign-subroles
 * HOD assigns institutional sub-roles strictly from ALLOWED_SUB_ROLES
 */
export async function assignSubRoles(req, res) {
  try {
    await ensureDatabaseExists();
    const { targetUserId, subRoles } = req.body || {};
    const callerDept = req.user.department;
    const isSuperAdmin = req.user.adminTier === 'SUPER_ADMIN';

    if (!targetUserId || !Array.isArray(subRoles)) {
      return res.status(400).json({
        success: false,
        error: 'targetUserId and subRoles array are required',
      });
    }

    if (!isValidUuid(targetUserId)) {
      return res.status(400).json({ success: false, error: 'Invalid targetUserId UUID format' });
    }

    const normalizedRoles = [];
    for (const rawRole of subRoles) {
      if (typeof rawRole !== 'string' || !rawRole.trim()) {
        return res.status(400).json({
          success: false,
          error: 'Each sub-role must be a non-empty string',
        });
      }
      const role = rawRole.trim().toUpperCase();
      if (PRIVILEGED_ROLE_NAMES.has(role)) {
        return res.status(403).json({
          success: false,
          error: `Forbidden: Cannot assign privileged role '${role}' via assign-subroles`,
        });
      }
      if (!ALLOWED_SUB_ROLES.has(role)) {
        return res.status(400).json({
          success: false,
          error: `Invalid sub-role '${role}'. Allowed: ${[...ALLOWED_SUB_ROLES].join(', ')}`,
        });
      }
      normalizedRoles.push(role);
    }

    const cleanSubRoles = [...new Set(normalizedRoles)];

    const userRes = await pool.query(
      'SELECT id, department, base_role, admin_tier, sub_roles FROM users WHERE id = $1',
      [targetUserId]
    );
    if (userRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Target user not found' });
    }

    const user = userRes.rows[0];

    if (!isSuperAdmin && (user.base_role === 'ADMIN' || user.admin_tier === 'SUPER_ADMIN')) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Cannot modify sub-roles for Administrative accounts',
      });
    }

    // Department scope lock (fail closed if either department is missing)
    if (
      !isSuperAdmin &&
      (!callerDept || !user.department || callerDept.toUpperCase() !== user.department.toUpperCase())
    ) {
      return res.status(403).json({
        success: false,
        error: `Department Scope Violation: Cannot assign sub-roles to users in department '${user.department || 'UNKNOWN'}'`,
      });
    }

    const finalSubRoles =
      user.admin_tier === 'HOD_ADMIN'
        ? [...new Set(['HOD', ...cleanSubRoles])]
        : cleanSubRoles;

    const updateRes = await pool.query(
      'UPDATE users SET sub_roles = $1 WHERE id = $2 RETURNING id, username, base_role, sub_roles;',
      [finalSubRoles, targetUserId]
    );

    if (user.base_role === 'FACULTY') {
      await pool.query('UPDATE faculty SET is_lg_coordinator = $1 WHERE user_id = $2', [
        finalSubRoles.includes('LG_COORDINATOR'),
        targetUserId,
      ]);
    }

    return res.status(200).json({
      success: true,
      message: 'Sub-roles successfully assigned',
      user: updateRes.rows[0],
    });
  } catch (error) {
    console.error('assignSubRoles error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to assign sub-roles' });
  }
}

/**
 * GET /api/v1/faculty/lg-mentees
 * Returns assigned mentees using non-Cartesian subqueries over attendance_records, cie_marks, finance_records
 */
export async function getLgMentees(req, res) {
  try {
    await ensureDatabaseExists();
    const facultyId = req.user.userId || req.user.id;

    const query = `
      SELECT s.id, s.usn, s.full_name, s.email, s.department, s.semester, s.section,
             s.admission_quota, s.cgpa, s.parent_whatsapp_encrypted, s.status,
             u.phone_encrypted,
             COALESCE(att.total_classes, 0)::int AS att_total,
             att.attendance_pct,
             COALESCE(cie.cie_count, 0)::int AS cie_count,
             cie.avg_cie_marks,
             COALESCE(fin.pending_dues, 0.00) AS pending_fee_dues
      FROM student s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN (
        SELECT
          student_id,
          COUNT(*)::int AS total_classes,
          ROUND(COUNT(*) FILTER (WHERE status IN ('PRESENT', 'LATE')) * 100.0 / NULLIF(COUNT(*), 0), 2) AS attendance_pct
        FROM attendance_records
        GROUP BY student_id
      ) att ON att.student_id = s.user_id
      LEFT JOIN (
        SELECT
          student_id,
          COUNT(*)::int AS cie_count,
          ROUND(AVG(total_cie), 2) AS avg_cie_marks
        FROM cie_marks
        GROUP BY student_id
      ) cie ON cie.student_id = s.user_id
      LEFT JOIN (
        SELECT
          student_id,
          COALESCE(SUM(GREATEST(0, (amount_due + fine_amount) - amount_paid)), 0.00) AS pending_dues
        FROM finance_records
        WHERE status != 'PAID'
        GROUP BY student_id
      ) fin ON fin.student_id = s.user_id
      WHERE s.lg_faculty_id = $1
      ORDER BY s.usn ASC;
    `;
    const result = await pool.query(query, [facultyId]);

    const mentees = result.rows.map((m) => {
      const hasAttendanceData = Number(m.att_total || 0) > 0 && m.attendance_pct !== null;
      const hasCieData = Number(m.cie_count || 0) > 0 && m.avg_cie_marks !== null;
      return {
        usn: m.usn,
        fullName: m.full_name,
        email: m.email,
        department: m.department,
        semester: m.semester,
        section: m.section,
        cgpa: parseFloat(m.cgpa ?? 0),
        parentWhatsApp: safeDecrypt(m.parent_whatsapp_encrypted) || safeDecrypt(m.phone_encrypted),
        hasAttendanceData,
        attendancePercentage: hasAttendanceData ? parseFloat(m.attendance_pct) : 0,
        hasCieData,
        avgCieMarks: hasCieData ? parseFloat(m.avg_cie_marks) : 0,
        pendingFeeDues: parseFloat(m.pending_fee_dues ?? 0),
        status: m.status,
      };
    });

    return res.status(200).json({
      success: true,
      count: mentees.length,
      mentees,
    });
  } catch (error) {
    console.error('getLgMentees error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to fetch LG mentees' });
  }
}

/**
 * GET /api/v1/faculty/lg-radar
 * Early-warning at-risk radar (< 75% attendance, < 40% CIE marks, or unpaid fees) without null-data false positives
 */
export async function getAtRiskRadar(req, res) {
  try {
    await ensureDatabaseExists();
    const facultyId = req.user.userId || req.user.id;
    const isHod =
      req.user.adminTier === 'HOD_ADMIN' ||
      (Array.isArray(req.user.subRoles) && req.user.subRoles.includes('HOD'));
    const isSuperAdmin = req.user.adminTier === 'SUPER_ADMIN';
    const dept = (req.user.department || '').trim().toUpperCase();

    if (!isSuperAdmin && isHod && !dept) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Department scope missing on HOD profile',
      });
    }

    let filterClause = 's.lg_faculty_id = $1';
    let params = [facultyId];

    if (isSuperAdmin) {
      filterClause = '1=1';
      params = [];
    } else if (isHod) {
      filterClause =
        "(UPPER(s.department) = $1 OR (UPPER(s.department) = 'ALLIED_SCIENCE' AND UPPER(COALESCE(s.core_branch, '')) = $1))";
      params = [dept];
    }

    const query = `
      SELECT s.usn, s.full_name, s.department, s.semester, s.section,
             s.parent_whatsapp_encrypted, u.phone_encrypted,
             COALESCE(att.total_classes, 0)::int AS att_total,
             att.attendance_pct,
             COALESCE(cie.cie_count, 0)::int AS cie_count,
             cie.avg_cie_marks,
             cie.avg_cie_pct,
             COALESCE(fin.pending_dues, 0.00) AS pending_dues
      FROM student s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN (
        SELECT
          student_id,
          COUNT(*)::int AS total_classes,
          ROUND(COUNT(*) FILTER (WHERE status IN ('PRESENT', 'LATE')) * 100.0 / NULLIF(COUNT(*), 0), 2) AS attendance_pct
        FROM attendance_records
        GROUP BY student_id
      ) att ON att.student_id = s.user_id
      LEFT JOIN (
        SELECT
          student_id,
          COUNT(*)::int AS cie_count,
          ROUND(AVG(total_cie), 2) AS avg_cie_marks,
          ROUND(AVG((total_cie / NULLIF(max_marks, 0)) * 100.0), 2) AS avg_cie_pct
        FROM cie_marks
        GROUP BY student_id
      ) cie ON cie.student_id = s.user_id
      LEFT JOIN (
        SELECT
          student_id,
          COALESCE(SUM(GREATEST(0, (amount_due + fine_amount) - amount_paid)), 0.00) AS pending_dues
        FROM finance_records
        WHERE status != 'PAID'
        GROUP BY student_id
      ) fin ON fin.student_id = s.user_id
      WHERE ${filterClause}
        AND (
          (COALESCE(att.total_classes, 0) > 0 AND att.attendance_pct < 75)
          OR (COALESCE(cie.cie_count, 0) > 0 AND cie.avg_cie_pct < 40)
          OR COALESCE(fin.pending_dues, 0) > 0
        )
      ORDER BY att.attendance_pct ASC NULLS LAST, cie.avg_cie_pct ASC NULLS LAST;
    `;

    const result = await pool.query(query, params);

    const atRisk = result.rows.map((row) => {
      const hasAttendanceData = Number(row.att_total || 0) > 0 && row.attendance_pct !== null;
      const hasCieData = Number(row.cie_count || 0) > 0 && row.avg_cie_pct !== null;
      const attPct = hasAttendanceData ? parseFloat(row.attendance_pct) : null;
      const avgCieMarks = hasCieData ? parseFloat(row.avg_cie_marks) : null;
      const avgCiePct = hasCieData ? parseFloat(row.avg_cie_pct) : null;
      const pendingDues = parseFloat(row.pending_dues ?? 0);

      const riskTriggers = [
        ...(hasAttendanceData && attPct < 75 ? ['ATTENDANCE_CRITICAL (< 75%)'] : []),
        ...(hasCieData && avgCiePct < 40 ? ['ACADEMIC_DEFICIT (< 40% CIE)'] : []),
        ...(pendingDues > 0 ? ['FINANCIAL_DUES_PENDING'] : []),
      ];

      return {
        usn: row.usn,
        fullName: row.full_name,
        department: row.department,
        semester: row.semester,
        section: row.section,
        hasAttendanceData,
        attendancePercentage: attPct ?? 0,
        hasCieData,
        avgCieMarks: avgCieMarks ?? 0,
        pendingDues,
        parentWhatsApp: safeDecrypt(row.parent_whatsapp_encrypted) || safeDecrypt(row.phone_encrypted),
        riskTriggers,
      };
    });

    return res.status(200).json({
      success: true,
      count: atRisk.length,
      atRiskMentees: atRisk,
    });
  } catch (error) {
    console.error('getAtRiskRadar error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to fetch at-risk radar' });
  }
}

/**
 * POST /api/v1/student/leave-request
 * Student submits a leave application directed to their designated LG faculty
 */
export async function createLeaveRequest(req, res) {
  try {
    await ensureDatabaseExists();
    const userId = req.user.userId || req.user.id;
    const { fromDate, toDate, reason } = req.body || {};

    if (!fromDate || !toDate || !reason || !String(reason).trim()) {
      return res.status(400).json({
        success: false,
        error: 'fromDate, toDate, and reason are required',
      });
    }

    if (!isValidIsoDate(String(fromDate)) || !isValidIsoDate(String(toDate))) {
      return res.status(400).json({
        success: false,
        error: 'fromDate and toDate must be valid YYYY-MM-DD dates',
      });
    }
    if (String(fromDate).trim() > String(toDate).trim()) {
      return res.status(400).json({
        success: false,
        error: 'fromDate cannot be later than toDate',
      });
    }

    const studentRes = await pool.query(
      'SELECT usn, lg_faculty_id FROM student WHERE user_id = $1',
      [userId]
    );
    if (studentRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Student record not found' });
    }

    const { usn, lg_faculty_id } = studentRes.rows[0];

    const insertQuery = `
      INSERT INTO lg_leave_requests (student_usn, lg_faculty_id, from_date, to_date, reason, status, parent_notified)
      VALUES ($1, $2, $3, $4, $5, 'PENDING', FALSE)
      RETURNING *;
    `;
    const result = await pool.query(insertQuery, [
      usn,
      lg_faculty_id,
      String(fromDate).trim(),
      String(toDate).trim(),
      String(reason).trim(),
    ]);

    return res.status(201).json({
      success: true,
      message: 'Leave application submitted to assigned LG mentor',
      leaveRequest: result.rows[0],
    });
  } catch (error) {
    console.error('createLeaveRequest error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to submit leave request' });
  }
}

/**
 * PATCH /api/v1/faculty/leave-approve/:leaveId
 * LG Faculty approves or rejects a student leave request and notifies parents
 */
export async function approveLeaveRequest(req, res) {
  try {
    await ensureDatabaseExists();
    const { leaveId } = req.params;
    const { decision } = req.body || {}; // 'APPROVED' or 'REJECTED'
    const callerId = req.user.userId || req.user.id;

    if (!isValidUuid(leaveId)) {
      return res.status(400).json({ success: false, error: 'Invalid leaveId UUID format' });
    }

    if (!['APPROVED', 'REJECTED'].includes(String(decision || '').toUpperCase())) {
      return res.status(400).json({ success: false, error: "decision must be 'APPROVED' or 'REJECTED'" });
    }

    const leaveRes = await pool.query('SELECT * FROM lg_leave_requests WHERE id = $1', [leaveId]);
    if (leaveRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Leave request not found' });
    }

    const leave = leaveRes.rows[0];
    const isSuperAdmin = req.user.adminTier === 'SUPER_ADMIN';
    const isAssignedLg = leave.lg_faculty_id === callerId;

    if (!isAssignedLg && !isSuperAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Only the assigned Local Guardian faculty can approve this leave',
      });
    }

    const updateQuery = `
      UPDATE lg_leave_requests
      SET status = $1, parent_notified = TRUE
      WHERE id = $2
      RETURNING *;
    `;
    const result = await pool.query(updateQuery, [decision.toUpperCase(), leaveId]);

    return res.status(200).json({
      success: true,
      message: `Leave application ${decision.toUpperCase()} and parent notification dispatched via WhatsApp gateway`,
      leaveRequest: result.rows[0],
    });
  } catch (error) {
    console.error('approveLeaveRequest error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to process leave approval' });
  }
}

export default {
  assignLgMapping,
  assignSubRoles,
  getLgMentees,
  getAtRiskRadar,
  createLeaveRequest,
  approveLeaveRequest,
};
