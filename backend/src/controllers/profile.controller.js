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
 * GET /api/v1/profile/me
 * Returns decrypted profile of the authenticated user with role-specific profile details
 */
export async function getProfile(req, res) {
  try {
    await ensureDatabaseExists();
    const userId = req.user.userId || req.user.id;

    const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (userRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'User profile not found' });
    }

    const user = userRes.rows[0];

    const profile = {
      id: user.id,
      username: user.username,
      fullName: safeDecrypt(user.full_name_encrypted),
      email: safeDecrypt(user.email_encrypted),
      phone: safeDecrypt(user.phone_encrypted),
      baseRole: user.base_role,
      adminTier: user.admin_tier,
      subRoles: user.sub_roles || [],
      permissions: user.permissions || [],
      department: user.department,
      sectionCode: user.section_code,
      admissionYear: user.admission_year,
      semester: user.semester,
      entryType: user.entry_type,
      avatarUrl: user.avatar_url,
      loginCount: user.login_count,
      lastLoginAt: user.last_login_at,
      createdAt: user.created_at,
    };

    // Role-specific extensions
    if (user.base_role === 'STUDENT') {
      const studentRes = await pool.query(
        `SELECT s.usn, s.department, s.semester, s.section, s.entry_type,
                s.admission_quota, s.cgpa, s.status, s.lg_faculty_id,
                u_lg.username AS lg_username, u_lg.full_name_encrypted AS lg_name_enc
         FROM student s
         LEFT JOIN users u_lg ON s.lg_faculty_id = u_lg.id
         WHERE s.user_id = $1`,
        [userId]
      );
      if (studentRes.rowCount > 0) {
        const s = studentRes.rows[0];
        profile.studentDetails = {
          usn: s.usn,
          department: s.department,
          semester: s.semester,
          section: s.section,
          entryType: s.entry_type,
          admissionQuota: s.admission_quota,
          cgpa: parseFloat(s.cgpa || 0),
          status: s.status,
          lgFaculty: s.lg_faculty_id
            ? {
                id: s.lg_faculty_id,
                username: s.lg_username,
                fullName: safeDecrypt(s.lg_name_enc),
              }
            : null,
        };
      }
    } else if (user.base_role === 'FACULTY') {
      const facultyRes = await pool.query(
        `SELECT emp_id, department, designation, cabin_room, is_lg_coordinator, is_hod
         FROM faculty WHERE user_id = $1`,
        [userId]
      );
      if (facultyRes.rowCount > 0) {
        profile.facultyDetails = facultyRes.rows[0];
      }
    } else if (user.base_role === 'ADMIN') {
      const adminRes = await pool.query(
        `SELECT admin_code, section_role, is_mastermind
         FROM admin WHERE user_id = $1`,
        [userId]
      );
      if (adminRes.rowCount > 0) {
        profile.adminDetails = adminRes.rows[0];
      }
    }

    return res.status(200).json({
      success: true,
      profile,
    });
  } catch (error) {
    console.error('getProfile error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to fetch profile' });
  }
}

/**
 * GET /api/v1/dashboard/metrics
 * Returns live operational dashboard metrics tailored to the caller's role
 */
export async function getDashboardMetrics(req, res) {
  try {
    await ensureDatabaseExists();
    const { userId, baseRole, adminTier, department } = req.user;

    // 1. STUDENT Dashboard
    if (baseRole === 'STUDENT') {
      const studentRes = await pool.query('SELECT usn, department, semester, section FROM student WHERE user_id = $1', [userId]);
      const usn = studentRes.rowCount > 0 ? studentRes.rows[0].usn : req.user.username;
      const dept = studentRes.rowCount > 0 ? studentRes.rows[0].department : department;
      const sem = studentRes.rowCount > 0 ? studentRes.rows[0].semester : null;
      const sec = studentRes.rowCount > 0 ? studentRes.rows[0].section : null;

      // Attendance percentage
      const attRes = await pool.query(
        `SELECT 
           COUNT(*) AS total_sessions,
           COUNT(*) FILTER (WHERE attendance_status IN ('P', 'OD_PRESENT')) AS attended_sessions,
           ROUND(COUNT(*) FILTER (WHERE attendance_status IN ('P', 'OD_PRESENT')) * 100.0 / NULLIF(COUNT(*), 0), 2) AS attendance_pct
         FROM academic_records
         WHERE student_usn = $1 AND record_type = 'ATTENDANCE'`,
        [usn]
      );

      // Average CIE marks
      const cieRes = await pool.query(
        `SELECT 
           ROUND(AVG(marks_obtained), 2) AS avg_cie_marks,
           COUNT(*) AS tests_recorded
         FROM academic_records
         WHERE student_usn = $1 AND record_type IN ('CIE_1', 'CIE_2', 'CIE_3')`,
        [usn]
      );

      // Pending fees and fines
      const financeRes = await pool.query(
        `SELECT 
           COALESCE(SUM(total_amount - paid_amount), 0.00) AS pending_dues,
           COUNT(*) FILTER (WHERE status != 'PAID') AS pending_bills
         FROM finance_ledgers
         WHERE student_usn = $1`,
        [usn]
      );

      // Today's approved class swaps
      const swapRes = await pool.query(
        `SELECT COUNT(*) AS today_swaps
         FROM timetable_swaps ts
         JOIN timetables t ON ts.timetable_id = t.id
         WHERE ts.swap_date = CURRENT_DATE 
           AND ts.status = 'APPROVED'
           AND t.department = $1 AND t.semester = $2 AND t.section = $3`,
        [dept, sem, sec]
      );

      // Verified documents count
      const docsRes = await pool.query(
        `SELECT 
           COUNT(*) AS total_documents,
           COUNT(*) FILTER (WHERE verification_status = 'VERIFIED') AS verified_count
         FROM student_documents
         WHERE student_usn = $1`,
        [usn]
      );

      return res.status(200).json({
        success: true,
        role: 'STUDENT',
        metrics: {
          attendancePercentage: parseFloat(attRes.rows[0]?.attendance_pct || 0),
          totalSessions: parseInt(attRes.rows[0]?.total_sessions || 0, 10),
          attendedSessions: parseInt(attRes.rows[0]?.attended_sessions || 0, 10),
          avgCieMarks: parseFloat(cieRes.rows[0]?.avg_cie_marks || 0),
          pendingDues: parseFloat(financeRes.rows[0]?.pending_dues || 0),
          pendingBillsCount: parseInt(financeRes.rows[0]?.pending_bills || 0, 10),
          todayApprovedSwaps: parseInt(swapRes.rows[0]?.today_swaps || 0, 10),
          verifiedDocuments: parseInt(docsRes.rows[0]?.verified_count || 0, 10),
          totalDocuments: parseInt(docsRes.rows[0]?.total_documents || 0, 10),
        },
      });
    }

    // 2. FACULTY Dashboard
    if (baseRole === 'FACULTY' && adminTier !== 'HOD_ADMIN') {
      // Today's slots (ISODOW: 1=Mon, 6=Sat)
      const slotsRes = await pool.query(
        `SELECT t.id, t.department, t.semester, t.section, t.period_no, t.subject_code, t.room_no
         FROM timetables t
         WHERE t.faculty_id = $1 AND t.day_of_week = EXTRACT(ISODOW FROM CURRENT_DATE)
         ORDER BY t.period_no ASC`,
        [userId]
      );

      // LG Mentees count
      const menteesRes = await pool.query(
        'SELECT COUNT(*) AS mentees_count FROM student WHERE lg_faculty_id = $1',
        [userId]
      );

      // Pending leave requests for mentees
      const leavesRes = await pool.query(
        "SELECT COUNT(*) AS pending_leaves FROM lg_leave_requests WHERE lg_faculty_id = $1 AND status = 'PENDING'",
        [userId]
      );

      return res.status(200).json({
        success: true,
        role: 'FACULTY',
        metrics: {
          todaySlotsCount: slotsRes.rowCount,
          todaySchedule: slotsRes.rows,
          lgMenteesCount: parseInt(menteesRes.rows[0]?.mentees_count || 0, 10),
          pendingLeaveRequests: parseInt(leavesRes.rows[0]?.pending_leaves || 0, 10),
        },
      });
    }

    // 3. HOD_ADMIN Dashboard
    if (adminTier === 'HOD_ADMIN' || (Array.isArray(req.user.subRoles) && req.user.subRoles.includes('HOD'))) {
      const dept = department || 'CS';

      const countsRes = await pool.query(
        `SELECT 
           (SELECT COUNT(*) FROM student WHERE department = $1) AS student_count,
           (SELECT COUNT(*) FROM faculty WHERE department = $1) AS faculty_count,
           (SELECT COUNT(*) FROM record_unlock_requests WHERE department = $1 AND hod_status = 'PENDING') AS pending_unlocks;`,
        [dept]
      );

      const deptAttRes = await pool.query(
        `SELECT ROUND(COUNT(*) FILTER (WHERE attendance_status IN ('P', 'OD_PRESENT')) * 100.0 / NULLIF(COUNT(*), 0), 2) AS dept_att_avg
         FROM academic_records
         WHERE department = $1 AND record_type = 'ATTENDANCE'`,
        [dept]
      );

      return res.status(200).json({
        success: true,
        role: 'HOD_ADMIN',
        department: dept,
        metrics: {
          departmentStudents: parseInt(countsRes.rows[0]?.student_count || 0, 10),
          departmentFaculty: parseInt(countsRes.rows[0]?.faculty_count || 0, 10),
          pendingPostEodUnlockRequests: parseInt(countsRes.rows[0]?.pending_unlocks || 0, 10),
          departmentAttendanceAverage: parseFloat(deptAttRes.rows[0]?.dept_att_avg || 0),
        },
      });
    }

    // 4. SUPER_ADMIN / REGULAR_ADMIN Dashboard
    const userTotalsRes = await pool.query(
      `SELECT base_role, COUNT(*) AS count FROM users GROUP BY base_role`
    );

    const financeTotalsRes = await pool.query(
      `SELECT 
         COALESCE(SUM(paid_amount), 0.00) AS total_collected,
         COALESCE(SUM(total_amount - paid_amount), 0.00) AS total_dues
       FROM finance_ledgers`
    );

    const docVerificationRes = await pool.query(
      `SELECT 
         COUNT(*) FILTER (WHERE verification_status = 'PENDING_REVIEW') AS pending_review,
         COUNT(*) FILTER (WHERE verification_status = 'VERIFIED') AS verified
       FROM student_documents`
    );

    const userMap = {};
    userTotalsRes.rows.forEach((r) => {
      userMap[r.base_role] = parseInt(r.count, 10);
    });

    return res.status(200).json({
      success: true,
      role: adminTier || baseRole,
      metrics: {
        collegeUserTotals: {
          ADMIN: userMap.ADMIN || 0,
          FACULTY: userMap.FACULTY || 0,
          STUDENT: userMap.STUDENT || 0,
          TOTAL: (userMap.ADMIN || 0) + (userMap.FACULTY || 0) + (userMap.STUDENT || 0),
        },
        financialOverview: {
          totalCollected: parseFloat(financeTotalsRes.rows[0]?.total_collected || 0),
          totalOutstandingDues: parseFloat(financeTotalsRes.rows[0]?.total_dues || 0),
        },
        documentVerificationStatus: {
          pendingReview: parseInt(docVerificationRes.rows[0]?.pending_review || 0, 10),
          verified: parseInt(docVerificationRes.rows[0]?.verified || 0, 10),
        },
      },
    });
  } catch (error) {
    console.error('getDashboardMetrics error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to fetch dashboard metrics' });
  }
}

export default {
  getProfile,
  getDashboardMetrics,
};

