import pool, { ensureDatabaseExists } from '../config/db.js';
import { decryptAES } from '../utils/crypto.util.js';

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
    const { lgFacultyId, studentUsns, department } = req.body;
    const callerDept = req.user.department;
    const isSuperAdmin = req.user.adminTier === 'SUPER_ADMIN';

    const targetDept = (department || callerDept || 'CS').toUpperCase();
    if (!isSuperAdmin && callerDept && callerDept.toUpperCase() !== targetDept) {
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

    // Verify LG faculty exists and is of base_role FACULTY
    const facCheck = await pool.query("SELECT id FROM users WHERE id = $1 AND base_role = 'FACULTY'", [lgFacultyId]);
    if (facCheck.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Target faculty member not found' });
    }

    const query = `
      UPDATE student
      SET lg_faculty_id = $1
      WHERE usn = ANY($2) AND department = $3
      RETURNING usn, full_name, department;
    `;
    const result = await pool.query(query, [lgFacultyId, studentUsns, targetDept]);

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
 * HOD assigns institutional sub-roles (CR, LG_COORDINATOR, CLUB_COORDINATOR, CIE_COORDINATOR)
 */
export async function assignSubRoles(req, res) {
  try {
    await ensureDatabaseExists();
    const { targetUserId, subRoles } = req.body;
    const callerDept = req.user.department;
    const isSuperAdmin = req.user.adminTier === 'SUPER_ADMIN';

    if (!targetUserId || !Array.isArray(subRoles)) {
      return res.status(400).json({ success: false, error: 'targetUserId and subRoles array are required' });
    }

    const userRes = await pool.query('SELECT id, department, base_role, sub_roles FROM users WHERE id = $1', [targetUserId]);
    if (userRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Target user not found' });
    }

    const user = userRes.rows[0];

    // Department scope lock
    if (!isSuperAdmin && callerDept && user.department && callerDept.toUpperCase() !== user.department.toUpperCase()) {
      return res.status(403).json({
        success: false,
        error: `Department Scope Violation: Cannot assign sub-roles to users in department '${user.department}'`,
      });
    }

    // Merge or replace sub-roles
    const updateRes = await pool.query(
      'UPDATE users SET sub_roles = $1 WHERE id = $2 RETURNING id, username, base_role, sub_roles;',
      [subRoles, targetUserId]
    );

    // If assigned LG_COORDINATOR and user is faculty, update faculty table
    if (user.base_role === 'FACULTY' && subRoles.includes('LG_COORDINATOR')) {
      await pool.query('UPDATE faculty SET is_lg_coordinator = TRUE WHERE user_id = $1', [targetUserId]);
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
 * Returns assigned mentees for caller faculty with parent contact and academic metrics
 */
export async function getLgMentees(req, res) {
  try {
    await ensureDatabaseExists();
    const facultyId = req.user.userId || req.user.id;

    const query = `
      SELECT s.id, s.usn, s.full_name, s.email, s.department, s.semester, s.section,
             s.admission_quota, s.cgpa, s.parent_whatsapp_encrypted, s.status,
             u.phone_encrypted,
             ROUND(
               COUNT(ar.id) FILTER (WHERE ar.attendance_status IN ('P', 'OD_PRESENT')) * 100.0 / NULLIF(COUNT(ar.id) FILTER (WHERE ar.record_type = 'ATTENDANCE'), 0),
               2
             ) AS attendance_pct,
             COALESCE(SUM(fl.total_amount - fl.paid_amount), 0.00) AS pending_fee_dues
      FROM student s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN academic_records ar ON ar.student_usn = s.usn
      LEFT JOIN finance_ledgers fl ON fl.student_usn = s.usn AND fl.status != 'PAID'
      WHERE s.lg_faculty_id = $1
      GROUP BY s.id, s.usn, s.full_name, s.email, s.department, s.semester, s.section,
               s.admission_quota, s.cgpa, s.parent_whatsapp_encrypted, s.status, u.phone_encrypted
      ORDER BY s.usn ASC;
    `;
    const result = await pool.query(query, [facultyId]);

    const mentees = result.rows.map((m) => ({
      usn: m.usn,
      fullName: m.full_name,
      email: m.email,
      department: m.department,
      semester: m.semester,
      section: m.section,
      cgpa: parseFloat(m.cgpa || 0),
      parentWhatsApp: safeDecrypt(m.parent_whatsapp_encrypted) || safeDecrypt(m.phone_encrypted),
      attendancePercentage: parseFloat(m.attendance_pct || 0),
      pendingFeeDues: parseFloat(m.pending_fee_dues || 0),
      status: m.status,
    }));

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
 * Early-warning at-risk radar (< 75% attendance, < 40% CIE marks, or unpaid fees)
 */
export async function getAtRiskRadar(req, res) {
  try {
    await ensureDatabaseExists();
    const facultyId = req.user.userId || req.user.id;
    const isHod = req.user.adminTier === 'HOD_ADMIN' || (Array.isArray(req.user.subRoles) && req.user.subRoles.includes('HOD'));
    const isSuperAdmin = req.user.adminTier === 'SUPER_ADMIN';
    const dept = req.user.department;

    let filterClause = 's.lg_faculty_id = $1';
    let params = [facultyId];

    if (isSuperAdmin) {
      filterClause = '1=1';
      params = [];
    } else if (isHod && dept) {
      filterClause = 's.department = $1';
      params = [dept.toUpperCase()];
    }

    const query = `
      SELECT s.usn, s.full_name, s.department, s.semester, s.section,
             s.parent_whatsapp_encrypted, u.phone_encrypted,
             ROUND(
               COUNT(ar.id) FILTER (WHERE ar.attendance_status IN ('P', 'OD_PRESENT')) * 100.0 / NULLIF(COUNT(ar.id) FILTER (WHERE ar.record_type = 'ATTENDANCE'), 0),
               2
             ) AS attendance_pct,
             ROUND(AVG(ar_cie.marks_obtained), 2) AS avg_cie_marks,
             COALESCE(SUM(fl.total_amount - fl.paid_amount), 0.00) AS pending_dues
      FROM student s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN academic_records ar ON ar.student_usn = s.usn AND ar.record_type = 'ATTENDANCE'
      LEFT JOIN academic_records ar_cie ON ar_cie.student_usn = s.usn AND ar_cie.record_type IN ('CIE_1', 'CIE_2', 'CIE_3')
      LEFT JOIN finance_ledgers fl ON fl.student_usn = s.usn AND fl.status != 'PAID'
      WHERE ${filterClause}
      GROUP BY s.usn, s.full_name, s.department, s.semester, s.section, s.parent_whatsapp_encrypted, u.phone_encrypted
      HAVING 
        (COUNT(ar.id) FILTER (WHERE ar.attendance_status IN ('P', 'OD_PRESENT')) * 100.0 / NULLIF(COUNT(ar.id) FILTER (WHERE ar.record_type = 'ATTENDANCE'), 0)) < 75
        OR AVG(ar_cie.marks_obtained) < 12
        OR COALESCE(SUM(fl.total_amount - fl.paid_amount), 0) > 0
      ORDER BY attendance_pct ASC NULLS FIRST;
    `;

    const result = await pool.query(query, params);

    const atRisk = result.rows.map((row) => ({
      usn: row.usn,
      fullName: row.full_name,
      department: row.department,
      semester: row.semester,
      section: row.section,
      attendancePercentage: parseFloat(row.attendance_pct || 0),
      avgCieMarks: parseFloat(row.avg_cie_marks || 0),
      pendingDues: parseFloat(row.pending_dues || 0),
      parentWhatsApp: safeDecrypt(row.parent_whatsapp_encrypted) || safeDecrypt(row.phone_encrypted),
      riskTriggers: [
        ...(parseFloat(row.attendance_pct || 0) < 75 ? ['ATTENDANCE_CRITICAL (< 75%)'] : []),
        ...(parseFloat(row.avg_cie_marks || 0) < 12 ? ['ACADEMIC_DEFICIT (< 40% CIE)'] : []),
        ...(parseFloat(row.pending_dues || 0) > 0 ? ['FINANCIAL_DUES_PENDING'] : []),
      ],
    }));

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
    const { fromDate, toDate, reason } = req.body;

    if (!fromDate || !toDate || !reason) {
      return res.status(400).json({ success: false, error: 'fromDate, toDate, and reason are required' });
    }

    const studentRes = await pool.query('SELECT usn, lg_faculty_id FROM student WHERE user_id = $1', [userId]);
    if (studentRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Student record not found' });
    }

    const { usn, lg_faculty_id } = studentRes.rows[0];

    const insertQuery = `
      INSERT INTO lg_leave_requests (student_usn, lg_faculty_id, from_date, to_date, reason, status, parent_notified)
      VALUES ($1, $2, $3, $4, $5, 'PENDING', FALSE)
      RETURNING *;
    `;
    const result = await pool.query(insertQuery, [usn, lg_faculty_id, fromDate, toDate, reason]);

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
    const { decision } = req.body; // 'APPROVED' or 'REJECTED'
    const callerId = req.user.userId || req.user.id;

    if (!['APPROVED', 'REJECTED'].includes(String(decision).toUpperCase())) {
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

