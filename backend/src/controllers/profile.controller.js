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
        `SELECT s.usn, s.department, s.core_branch, s.semester, s.academic_year,
                s.section, s.entry_type, s.admission_quota, s.cgpa, s.status, s.lg_faculty_id,
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
          coreBranch: s.core_branch,
          semester: s.semester,
          academicYear: s.academic_year,
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
        `SELECT emp_id, department, designation, classification, cabin_room, is_lg_coordinator, is_hod
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
 * Returns live operational dashboard metrics tailored to the caller's role over Module 7 normalized tables
 */
export async function getDashboardMetrics(req, res) {
  try {
    await ensureDatabaseExists();
    const { userId, baseRole, adminTier, department } = req.user;
    const subRoles = Array.isArray(req.user.subRoles) ? req.user.subRoles : [];
    const isHod = adminTier === 'HOD_ADMIN' || subRoles.includes('HOD');

    // 1. STUDENT Dashboard
    if (baseRole === 'STUDENT') {
      const studentRes = await pool.query(
        'SELECT usn, department, semester, section FROM student WHERE user_id = $1',
        [userId]
      );
      const usn = studentRes.rowCount > 0 ? studentRes.rows[0].usn : req.user.username;
      const dept = studentRes.rowCount > 0 ? studentRes.rows[0].department : department;
      const sem = studentRes.rowCount > 0 ? studentRes.rows[0].semester : null;
      const sec = studentRes.rowCount > 0 ? studentRes.rows[0].section : null;

      const [attRes, cieRes, financeRes, swapRes, docsRes] = await Promise.all([
        pool.query(
          `SELECT
             COUNT(*)::int AS total_sessions,
             COUNT(*) FILTER (WHERE status IN ('PRESENT', 'LATE'))::int AS attended_sessions,
             COALESCE(
               ROUND(COUNT(*) FILTER (WHERE status IN ('PRESENT', 'LATE')) * 100.0 / NULLIF(COUNT(*), 0), 2),
               0
             ) AS attendance_pct
           FROM attendance_records
           WHERE student_id = $1`,
          [userId]
        ),
        pool.query(
          `SELECT
             COALESCE(ROUND(AVG(total_cie), 2), 0) AS avg_cie_marks,
             COUNT(*)::int AS tests_recorded
           FROM cie_marks
           WHERE student_id = $1`,
          [userId]
        ),
        pool.query(
          `SELECT
             COALESCE(SUM(GREATEST(0, (amount_due + fine_amount) - amount_paid)), 0.00) AS pending_dues,
             COUNT(*) FILTER (WHERE status != 'PAID')::int AS pending_bills
           FROM finance_records
           WHERE student_id = $1`,
          [userId]
        ),
        pool.query(
          `SELECT COUNT(*)::int AS today_swaps
           FROM timetable_slots
           WHERE swap_status = 'APPROVED'
             AND swap_date = CURRENT_DATE
             AND UPPER(department) = UPPER($1)
             AND semester = $2
             AND UPPER(section) = UPPER($3)`,
          [dept || '', sem, sec || '']
        ),
        pool.query(
          `SELECT
             COUNT(*)::int AS total_documents,
             COUNT(*) FILTER (WHERE verification_status = 'VERIFIED')::int AS verified_count
           FROM student_documents
           WHERE UPPER(student_usn) = UPPER($1)`,
          [usn || '']
        ),
      ]);

      return res.status(200).json({
        success: true,
        role: 'STUDENT',
        metrics: {
          attendancePercentage: parseFloat(attRes.rows[0]?.attendance_pct ?? 0),
          totalSessions: parseInt(attRes.rows[0]?.total_sessions ?? 0, 10),
          attendedSessions: parseInt(attRes.rows[0]?.attended_sessions ?? 0, 10),
          avgCieMarks: parseFloat(cieRes.rows[0]?.avg_cie_marks ?? 0),
          testsRecorded: parseInt(cieRes.rows[0]?.tests_recorded ?? 0, 10),
          pendingDues: parseFloat(financeRes.rows[0]?.pending_dues ?? 0),
          pendingBillsCount: parseInt(financeRes.rows[0]?.pending_bills ?? 0, 10),
          todayApprovedSwaps: parseInt(swapRes.rows[0]?.today_swaps ?? 0, 10),
          verifiedDocuments: parseInt(docsRes.rows[0]?.verified_count ?? 0, 10),
          totalDocuments: parseInt(docsRes.rows[0]?.total_documents ?? 0, 10),
        },
      });
    }

    // 2. HOD_ADMIN / Promoted HOD Dashboard (checked before non-HOD FACULTY)
    if (isHod && adminTier !== 'SUPER_ADMIN') {
      const dept = String(department || '').trim().toUpperCase();
      if (!dept) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden: Department scope missing on HOD profile',
        });
      }

      const [countsRes, deptAttRes] = await Promise.all([
        pool.query(
          `SELECT
             (SELECT COUNT(*)::int FROM student WHERE UPPER(department) = $1 OR (UPPER(department) = 'ALLIED_SCIENCE' AND UPPER(core_branch) = $1)) AS student_count,
             (SELECT COUNT(*)::int FROM faculty WHERE UPPER(department) = $1) AS faculty_count,
             (SELECT COUNT(*)::int FROM record_unlock_requests WHERE UPPER(department) = $1 AND hod_status = 'PENDING') AS pending_unlocks,
             (SELECT COUNT(*)::int FROM timetable_slots WHERE UPPER(department) = $1 AND swap_status = 'PENDING') AS pending_swaps;`,
          [dept]
        ),
        pool.query(
          `SELECT COALESCE(
             ROUND(COUNT(*) FILTER (WHERE status IN ('PRESENT', 'LATE')) * 100.0 / NULLIF(COUNT(*), 0), 2),
             0
           ) AS dept_att_avg
           FROM attendance_records
           WHERE UPPER(department) = $1`,
          [dept]
        ),
      ]);

      return res.status(200).json({
        success: true,
        role: 'HOD_ADMIN',
        department: dept,
        metrics: {
          departmentStudents: parseInt(countsRes.rows[0]?.student_count ?? 0, 10),
          departmentFaculty: parseInt(countsRes.rows[0]?.faculty_count ?? 0, 10),
          pendingPostEodUnlockRequests: parseInt(countsRes.rows[0]?.pending_unlocks ?? 0, 10),
          pendingClassSwaps: parseInt(countsRes.rows[0]?.pending_swaps ?? 0, 10),
          departmentAttendanceAverage: parseFloat(deptAttRes.rows[0]?.dept_att_avg ?? 0),
        },
      });
    }

    // 3. Non-HOD FACULTY Dashboard
    if (baseRole === 'FACULTY' && !isHod) {
      const [slotsRes, menteesRes, leavesRes, swapsRes] = await Promise.all([
        pool.query(
          `SELECT id, department, semester, section, period_no, start_time, end_time,
                  subject_code, subject_name, room_no, swap_status
           FROM timetable_slots
           WHERE (faculty_id = $1 OR (swapped_faculty_id = $1 AND swap_status = 'APPROVED' AND swap_date = CURRENT_DATE))
             AND day_of_week = EXTRACT(ISODOW FROM CURRENT_DATE)
           ORDER BY period_no ASC`,
          [userId]
        ),
        pool.query('SELECT COUNT(*)::int AS mentees_count FROM student WHERE lg_faculty_id = $1', [
          userId,
        ]),
        pool.query(
          "SELECT COUNT(*)::int AS pending_leaves FROM lg_leave_requests WHERE lg_faculty_id = $1 AND status = 'PENDING'",
          [userId]
        ),
        pool.query(
          "SELECT COUNT(*)::int AS pending_swaps FROM timetable_slots WHERE swapped_faculty_id = $1 AND swap_status = 'PENDING'",
          [userId]
        ),
      ]);

      return res.status(200).json({
        success: true,
        role: 'FACULTY',
        metrics: {
          todaySlotsCount: slotsRes.rowCount,
          todaySchedule: slotsRes.rows,
          lgMenteesCount: parseInt(menteesRes.rows[0]?.mentees_count ?? 0, 10),
          pendingLeaveRequests: parseInt(leavesRes.rows[0]?.pending_leaves ?? 0, 10),
          pendingSwapRequests: parseInt(swapsRes.rows[0]?.pending_swaps ?? 0, 10),
        },
      });
    }

    // 4. SUPER_ADMIN / REGULAR_ADMIN Dashboard
    const [userTotalsRes, financeTotalsRes, docVerificationRes, instDocRes] = await Promise.all([
      pool.query('SELECT base_role, COUNT(*)::int AS count FROM users GROUP BY base_role'),
      pool.query(
        `SELECT
           COALESCE(SUM(amount_paid), 0.00) AS total_collected,
           COALESCE(SUM(GREATEST(0, (amount_due + fine_amount) - amount_paid)), 0.00) AS total_dues
         FROM finance_records`
      ),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE verification_status = 'PENDING_REVIEW')::int AS pending_review,
           COUNT(*) FILTER (WHERE verification_status = 'VERIFIED')::int AS verified
         FROM student_documents`
      ),
      pool.query('SELECT COUNT(*)::int AS total FROM institutional_documents WHERE is_active = TRUE'),
    ]);

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
          totalCollected: parseFloat(financeTotalsRes.rows[0]?.total_collected ?? 0),
          totalOutstandingDues: parseFloat(financeTotalsRes.rows[0]?.total_dues ?? 0),
        },
        documentVerificationStatus: {
          pendingReview: parseInt(docVerificationRes.rows[0]?.pending_review ?? 0, 10),
          verified: parseInt(docVerificationRes.rows[0]?.verified ?? 0, 10),
        },
        institutionalDocumentsCount: parseInt(instDocRes.rows[0]?.total ?? 0, 10),
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
