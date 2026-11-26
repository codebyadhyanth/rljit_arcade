import pool, { ensureDatabaseExists } from '../config/db.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_RISK_TIERS = new Set(['EXCELLENT', 'ON_TRACK', 'WATCH', 'AT_RISK']);
const WEIGHTS = { attendance: 35, cie: 40, cgpaPlacement: 15, finance: 10 };

const round2 = (val) => {
  const num = Number(val);
  return Number.isFinite(num) ? Number(num.toFixed(2)) : 0;
};

const clamp = (val, min = 0, max = 100) => {
  const num = Number(val);
  if (!Number.isFinite(num)) return min;
  return Math.min(max, Math.max(min, num));
};

function cleanStr(val) {
  if (val === undefined || val === null) return null;
  const trimmed = String(val).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function cleanUpper(val) {
  const s = cleanStr(val);
  return s ? s.toUpperCase() : null;
}

function getCallerRoleMeta(user = {}) {
  const baseRole = cleanUpper(user.baseRole);
  const adminTier = cleanUpper(user.adminTier);
  const subRoles = Array.isArray(user.subRoles)
    ? user.subRoles.map((r) => String(r).trim().toUpperCase())
    : [];
  const isSuperAdmin = adminTier === 'SUPER_ADMIN';
  const isHod = adminTier === 'HOD_ADMIN' || subRoles.includes('HOD');
  const isFaculty = baseRole === 'FACULTY';
  const callerDept = cleanUpper(user.department);
  return { baseRole, adminTier, subRoles, isSuperAdmin, isHod, isFaculty, callerDept };
}

export function isAnalyzerAuthorized(user) {
  if (!user) return false;
  const { baseRole, adminTier, isSuperAdmin, isHod, isFaculty } = getCallerRoleMeta(user);
  if (baseRole === 'STUDENT' || adminTier === 'REGULAR_ADMIN') return false;
  return isSuperAdmin || isFaculty || isHod;
}

function parseOptionalIntParam(raw, label, { min = 1, max = 999 } = {}) {
  const s = cleanStr(raw);
  if (!s) return { value: null, error: null };
  if (!/^\d+$/.test(s)) {
    return { value: null, error: `${label} must be an integer` };
  }
  const num = parseInt(s, 10);
  if (num < min || num > max) {
    return { value: null, error: `${label} must be between ${min} and ${max}` };
  }
  return { value: num, error: null };
}

function resolveAnalyzerScope(req, res) {
  if (!isAnalyzerAuthorized(req.user)) {
    res.status(403).json({
      success: false,
      error: 'Forbidden: Academic Analyzer is restricted to Faculty, HOD, and Super Admin accounts',
    });
    return null;
  }

  const { isSuperAdmin, isHod, callerDept } = getCallerRoleMeta(req.user);
  const requestedDept = cleanUpper(req.query.department);
  const { value: semester, error: semErr } = parseOptionalIntParam(req.query.semester, 'semester', {
    min: 1,
    max: 8,
  });
  if (semErr) {
    res.status(400).json({ success: false, error: semErr });
    return null;
  }

  if (!isSuperAdmin) {
    if (!callerDept) {
      res.status(403).json({
        success: false,
        error: 'Forbidden: Department assignment is required on caller profile',
      });
      return null;
    }
    if (requestedDept && requestedDept !== callerDept) {
      res.status(403).json({
        success: false,
        error: `Department Scope Violation: Cannot query analyzer data for department '${requestedDept}'`,
      });
      return null;
    }
  }

  const conditions = ["u.base_role = 'STUDENT'"];
  const params = [];
  const addParam = (v) => {
    params.push(v);
    return `$${params.length}`;
  };

  if (isSuperAdmin) {
    if (requestedDept) {
      conditions.push(`UPPER(COALESCE(s.department, u.department)) = ${addParam(requestedDept)}`);
    }
  } else {
    const p = addParam(callerDept);
    if (callerDept === 'ALLIED_SCIENCE') {
      conditions.push(`UPPER(COALESCE(s.department, u.department)) = ${p}`);
    } else if (isHod) {
      conditions.push(
        `(UPPER(COALESCE(s.department, u.department)) = ${p} OR (UPPER(COALESCE(s.department, '')) = 'ALLIED_SCIENCE' AND UPPER(COALESCE(s.core_branch, '')) = ${p}))`
      );
    } else {
      conditions.push(`UPPER(COALESCE(s.department, u.department)) = ${p}`);
    }
  }

  if (semester !== null) {
    conditions.push(`COALESCE(s.semester, u.semester) = ${addParam(semester)}`);
  }

  return {
    conditions,
    params,
    addParam,
    scopeInfo: {
      level: isSuperAdmin ? 'GLOBAL' : 'DEPARTMENT',
      department: isSuperAdmin ? requestedDept : callerDept,
      semester,
    },
  };
}

function canAccessStudentRow(user, studentRow) {
  const { isSuperAdmin, isHod, callerDept } = getCallerRoleMeta(user);
  if (isSuperAdmin) return true;
  if (!callerDept) return false;

  const sDept = cleanUpper(studentRow.department);
  const sBranch = cleanUpper(studentRow.core_branch);
  if (callerDept === 'ALLIED_SCIENCE') {
    return sDept === 'ALLIED_SCIENCE';
  }
  if (isHod) {
    return sDept === callerDept || (sDept === 'ALLIED_SCIENCE' && sBranch === callerDept);
  }
  return sDept === callerDept;
}

function evaluateStudentMetrics(row) {
  const attTotal = Number(row.att_total || 0);
  const attAttended = Number(row.att_attended || 0);
  const hasAttendance = attTotal > 0 && row.attendance_pct !== null;
  const attendancePct = hasAttendance ? clamp(round2(row.attendance_pct)) : null;

  const cieCount = Number(row.cie_count || 0);
  const hasCie = cieCount > 0 && row.avg_cie_pct !== null;
  const ciePct = hasCie ? clamp(round2(row.avg_cie_pct)) : null;
  const avgTotalCie = hasCie ? round2(row.avg_total_cie) : null;

  const cgpa = round2(row.cgpa || 0);
  const appsCount = Number(row.apps_count || 0);
  const shortlistedCount = Number(row.shortlisted_count || 0);
  const selectedCount = Number(row.selected_count || 0);
  const hasCgpaPlacement = cgpa > 0 || appsCount > 0;

  let cgpaPlacementPct = null;
  if (hasCgpaPlacement) {
    const cgpaPct = clamp((cgpa / 10) * 100);
    if (appsCount > 0) {
      const bonus = selectedCount > 0 ? 15 : shortlistedCount > 0 ? 10 : 5;
      cgpaPlacementPct =
        cgpa > 0
          ? clamp(round2(cgpaPct * 0.85 + bonus))
          : selectedCount > 0
            ? 100
            : shortlistedCount > 0
              ? 75
              : 50;
    } else {
      cgpaPlacementPct = round2(cgpaPct);
    }
  }

  const financeCount = Number(row.finance_count || 0);
  const totalDue = round2(row.total_due || 0);
  const totalPaid = round2(row.total_paid || 0);
  const totalFines = round2(row.total_fines || 0);
  const outstandingDues = round2(row.outstanding_dues || 0);
  const hasFinance = financeCount > 0;

  let financePct = null;
  if (hasFinance) {
    const totalOwed = round2(totalDue + totalFines);
    financePct = totalOwed > 0 ? clamp(round2((totalPaid / totalOwed) * 100)) : 100;
  }

  const activeFlags = [hasAttendance, hasCie, hasCgpaPlacement, hasFinance];
  const activeCount = activeFlags.filter(Boolean).length;
  const dataCoverage = activeCount === 0 ? 'NO_RECORDS' : activeCount === 4 ? 'FULL' : 'PARTIAL';

  let weightedSum = 0;
  let activeWeight = 0;
  if (hasAttendance) {
    weightedSum += attendancePct * WEIGHTS.attendance;
    activeWeight += WEIGHTS.attendance;
  }
  if (hasCie) {
    weightedSum += ciePct * WEIGHTS.cie;
    activeWeight += WEIGHTS.cie;
  }
  if (hasCgpaPlacement) {
    weightedSum += cgpaPlacementPct * WEIGHTS.cgpaPlacement;
    activeWeight += WEIGHTS.cgpaPlacement;
  }
  if (hasFinance) {
    weightedSum += financePct * WEIGHTS.finance;
    activeWeight += WEIGHTS.finance;
  }

  const compositeScore = activeWeight > 0 ? clamp(round2(weightedSum / activeWeight)) : 0;
  const riskTier =
    compositeScore >= 80
      ? 'EXCELLENT'
      : compositeScore >= 65
        ? 'ON_TRACK'
        : compositeScore >= 45
          ? 'WATCH'
          : 'AT_RISK';

  const lackingAreas = [];
  const improvementSteps = [];

  if (dataCoverage === 'NO_RECORDS') {
    lackingAreas.push('No attendance, CIE, CGPA, or finance records available');
    improvementSteps.push('Record initial attendance sessions and CIE scores to compute academic risk');
  } else {
    if (!hasAttendance) {
      lackingAreas.push('Attendance logs missing');
      improvementSteps.push('Submit subject attendance sessions in the Attendance Register');
    } else if (attendancePct < 75) {
      lackingAreas.push('Critical attendance deficit (< 75%)');
      improvementSteps.push('Attend remaining classes consistently and schedule an LG mentor check-in');
    } else if (attendancePct < 85) {
      lackingAreas.push('Attendance below 85% clearance threshold');
      improvementSteps.push('Maintain >= 85% attendance across all subjects for hall ticket clearance');
    }

    if (!hasCie) {
      lackingAreas.push('CIE marks missing');
      improvementSteps.push('Enter CIE test and assignment scores for the current semester');
    } else if (ciePct < 40) {
      lackingAreas.push('CIE marks below 40% benchmark');
      improvementSteps.push('Schedule remedial sessions and focus on upcoming CIE/assignment components');
    } else if (ciePct < 65) {
      lackingAreas.push('Moderate CIE performance (< 65%)');
      improvementSteps.push('Target higher marks in remaining CIE tests and assignments');
    }

    if (cgpa > 0 && cgpa < 6.0) {
      lackingAreas.push('Low CGPA (< 6.0)');
      improvementSteps.push('Focus on core subject fundamentals to improve SGPA/CGPA above placement cutoffs');
    } else if (cgpa >= 6.0 && cgpa < 7.0) {
      lackingAreas.push('CGPA below 7.0 placement cutoff');
      improvementSteps.push('Aim for >= 7.0 CGPA to expand eligible campus placement opportunities');
    }

    if (hasFinance && outstandingDues > 0) {
      lackingAreas.push('Pending fee/fine dues');
      improvementSteps.push('Reconcile outstanding fee balance with Accounts before exam clearance');
    }
  }

  return {
    studentId: row.student_id,
    usn: row.usn,
    fullName: row.full_name,
    department: row.department,
    coreBranch: row.core_branch || null,
    semester: row.semester !== null && row.semester !== undefined ? Number(row.semester) : null,
    academicYear:
      row.academic_year !== null && row.academic_year !== undefined ? Number(row.academic_year) : null,
    section: row.section || null,
    entryType: row.entry_type || null,
    cgpa,
    compositeScore,
    riskTier,
    dataCoverage,
    metrics: {
      attendancePercentage: attendancePct,
      hasAttendanceData: hasAttendance,
      attendanceClasses: attTotal,
      attendedClasses: attAttended,
      ciePercentage: ciePct,
      avgTotalCie,
      hasCieData: hasCie,
      cieSubjectsCount: cieCount,
      cgpaPlacementPercentage: cgpaPlacementPct,
      hasCgpaPlacementData: hasCgpaPlacement,
      placementApplications: appsCount,
      placementShortlisted: shortlistedCount,
      placementSelected: selectedCount,
      financeCompletionPercentage: financePct,
      hasFinanceData: hasFinance,
      outstandingDues,
    },
    lackingAreas,
    improvementSteps,
  };
}

function buildMetricsSelectSql(whereSql) {
  return `
    SELECT
      u.id AS student_id,
      COALESCE(s.usn, u.username) AS usn,
      s.full_name,
      COALESCE(s.department, u.department) AS department,
      s.core_branch,
      COALESCE(s.semester, u.semester) AS semester,
      s.academic_year,
      s.section,
      COALESCE(s.entry_type, u.entry_type) AS entry_type,
      COALESCE(s.cgpa, 0.00) AS cgpa,
      COALESCE(att.total_classes, 0)::int AS att_total,
      COALESCE(att.attended_classes, 0)::int AS att_attended,
      COALESCE(att.present_classes, 0)::int AS att_present,
      COALESCE(att.absent_classes, 0)::int AS att_absent,
      COALESCE(att.late_classes, 0)::int AS att_late,
      att.attendance_pct,
      COALESCE(cie.subjects_count, 0)::int AS cie_count,
      cie.avg_total_cie,
      cie.avg_cie_pct,
      COALESCE(pl.applications_count, 0)::int AS apps_count,
      COALESCE(pl.shortlisted_count, 0)::int AS shortlisted_count,
      COALESCE(pl.selected_count, 0)::int AS selected_count,
      COALESCE(fin.records_count, 0)::int AS finance_count,
      COALESCE(fin.total_due, 0.00) AS total_due,
      COALESCE(fin.total_paid, 0.00) AS total_paid,
      COALESCE(fin.total_fines, 0.00) AS total_fines,
      COALESCE(fin.outstanding_dues, 0.00) AS outstanding_dues
    FROM users u
    LEFT JOIN student s ON s.user_id = u.id
    LEFT JOIN (
      SELECT
        student_id,
        COUNT(*)::int AS total_classes,
        COUNT(*) FILTER (WHERE status IN ('PRESENT', 'LATE'))::int AS attended_classes,
        COUNT(*) FILTER (WHERE status = 'PRESENT')::int AS present_classes,
        COUNT(*) FILTER (WHERE status = 'ABSENT')::int AS absent_classes,
        COUNT(*) FILTER (WHERE status = 'LATE')::int AS late_classes,
        ROUND(COUNT(*) FILTER (WHERE status IN ('PRESENT', 'LATE')) * 100.0 / NULLIF(COUNT(*), 0), 2) AS attendance_pct
      FROM attendance_records
      GROUP BY student_id
    ) att ON att.student_id = u.id
    LEFT JOIN (
      SELECT
        student_id,
        COUNT(*)::int AS subjects_count,
        ROUND(AVG(total_cie), 2) AS avg_total_cie,
        ROUND(AVG((total_cie / NULLIF(max_marks, 0)) * 100.0), 2) AS avg_cie_pct
      FROM cie_marks
      GROUP BY student_id
    ) cie ON cie.student_id = u.id
    LEFT JOIN (
      SELECT
        student_id,
        COUNT(*)::int AS applications_count,
        COUNT(*) FILTER (WHERE status = 'SHORTLISTED')::int AS shortlisted_count,
        COUNT(*) FILTER (WHERE status = 'SELECTED')::int AS selected_count
      FROM placement_applications
      GROUP BY student_id
    ) pl ON pl.student_id = u.id
    LEFT JOIN (
      SELECT
        student_id,
        COUNT(*)::int AS records_count,
        COALESCE(SUM(amount_due), 0.00) AS total_due,
        COALESCE(SUM(amount_paid), 0.00) AS total_paid,
        COALESCE(SUM(fine_amount), 0.00) AS total_fines,
        COALESCE(SUM(GREATEST(0, (amount_due + fine_amount) - amount_paid)), 0.00) AS outstanding_dues
      FROM finance_records
      GROUP BY student_id
    ) fin ON fin.student_id = u.id
    ${whereSql}
    ORDER BY COALESCE(s.usn, u.username) ASC;
  `;
}

/**
 * GET /api/v1/analyzer/summary?department=&semester=
 */
export async function getAnalyzerSummary(req, res) {
  try {
    await ensureDatabaseExists();
    const scope = resolveAnalyzerScope(req, res);
    if (!scope) return;

    const whereSql = scope.conditions.length > 0 ? `WHERE ${scope.conditions.join(' AND ')}` : '';
    const result = await pool.query(buildMetricsSelectSql(whereSql), scope.params);
    const evaluated = result.rows.map(evaluateStudentMetrics);

    const riskDistribution = { EXCELLENT: 0, ON_TRACK: 0, WATCH: 0, AT_RISK: 0 };
    const coverageDistribution = { FULL: 0, PARTIAL: 0, NO_RECORDS: 0 };
    const lackingCounts = new Map();
    const deptStats = new Map();

    let scoreSum = 0;
    let analyzedCount = 0;
    let attSum = 0;
    let attCount = 0;
    let cieSum = 0;
    let cieCount = 0;
    let cgpaSum = 0;
    let cgpaCount = 0;

    for (const st of evaluated) {
      riskDistribution[st.riskTier] += 1;
      coverageDistribution[st.dataCoverage] += 1;

      if (st.dataCoverage !== 'NO_RECORDS') {
        scoreSum += st.compositeScore;
        analyzedCount += 1;
      }
      if (st.metrics.hasAttendanceData && st.metrics.attendancePercentage !== null) {
        attSum += st.metrics.attendancePercentage;
        attCount += 1;
      }
      if (st.metrics.hasCieData && st.metrics.ciePercentage !== null) {
        cieSum += st.metrics.ciePercentage;
        cieCount += 1;
      }
      if (st.cgpa > 0) {
        cgpaSum += st.cgpa;
        cgpaCount += 1;
      }

      for (const area of st.lackingAreas) {
        lackingCounts.set(area, (lackingCounts.get(area) || 0) + 1);
      }

      const dKey = st.department || 'UNASSIGNED';
      if (!deptStats.has(dKey)) {
        deptStats.set(dKey, {
          department: dKey,
          totalStudents: 0,
          analyzedStudents: 0,
          scoreSum: 0,
          atRiskCount: 0,
        });
      }
      const ds = deptStats.get(dKey);
      ds.totalStudents += 1;
      if (st.dataCoverage !== 'NO_RECORDS') {
        ds.analyzedStudents += 1;
        ds.scoreSum += st.compositeScore;
      }
      if (st.riskTier === 'AT_RISK') ds.atRiskCount += 1;
    }

    const topLackingAreas = [...lackingCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([area, count]) => ({ area, studentCount: count }));

    const departmentBreakdown = [...deptStats.values()].map((d) => ({
      department: d.department,
      totalStudents: d.totalStudents,
      analyzedStudents: d.analyzedStudents,
      averageCompositeScore: d.analyzedStudents > 0 ? round2(d.scoreSum / d.analyzedStudents) : 0,
      atRiskCount: d.atRiskCount,
    }));

    return res.status(200).json({
      success: true,
      scope: scope.scopeInfo,
      weights: WEIGHTS,
      summary: {
        totalStudents: evaluated.length,
        analyzedStudents: analyzedCount,
        noRecordsCount: coverageDistribution.NO_RECORDS,
        averageCompositeScore: analyzedCount > 0 ? round2(scoreSum / analyzedCount) : 0,
        averageAttendancePct: attCount > 0 ? round2(attSum / attCount) : 0,
        averageCiePct: cieCount > 0 ? round2(cieSum / cieCount) : 0,
        averageCgpa: cgpaCount > 0 ? round2(cgpaSum / cgpaCount) : 0,
        riskDistribution,
        coverageDistribution,
        topLackingAreas,
      },
      departmentBreakdown,
    });
  } catch (error) {
    console.error('getAnalyzerSummary error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to compute academic analyzer summary',
    });
  }
}

/**
 * GET /api/v1/analyzer/students?department=&semester=&riskTier=&q=&limit=&offset=
 */
export async function getAnalyzerStudents(req, res) {
  try {
    await ensureDatabaseExists();
    const scope = resolveAnalyzerScope(req, res);
    if (!scope) return;

    const riskTierFilter = cleanUpper(req.query.riskTier ?? req.query.risk_tier);
    if (riskTierFilter && !VALID_RISK_TIERS.has(riskTierFilter)) {
      return res.status(400).json({
        success: false,
        error: `riskTier must be one of: ${[...VALID_RISK_TIERS].join(', ')}`,
      });
    }

    const limitParsed = parseOptionalIntParam(req.query.limit, 'limit', { min: 1, max: 200 });
    if (limitParsed.error) {
      return res.status(400).json({ success: false, error: limitParsed.error });
    }
    const offsetParsed = parseOptionalIntParam(req.query.offset, 'offset', { min: 0, max: 100000 });
    if (offsetParsed.error) {
      return res.status(400).json({ success: false, error: offsetParsed.error });
    }

    const limit = limitParsed.value ?? 50;
    const offset = offsetParsed.value ?? 0;

    const q = cleanStr(req.query.q);
    if (q) {
      const p = scope.addParam(`%${q}%`);
      scope.conditions.push(
        `(COALESCE(s.usn, u.username) ILIKE ${p} OR COALESCE(s.full_name, '') ILIKE ${p} OR COALESCE(s.core_branch, '') ILIKE ${p} OR COALESCE(s.section, '') ILIKE ${p})`
      );
    }

    const whereSql = scope.conditions.length > 0 ? `WHERE ${scope.conditions.join(' AND ')}` : '';
    const result = await pool.query(buildMetricsSelectSql(whereSql), scope.params);

    let evaluated = result.rows.map(evaluateStudentMetrics);
    if (riskTierFilter) {
      evaluated = evaluated.filter((s) => s.riskTier === riskTierFilter);
    }

    const totalCount = evaluated.length;
    const paged = evaluated.slice(offset, offset + limit);

    return res.status(200).json({
      success: true,
      scope: scope.scopeInfo,
      count: paged.length,
      totalCount,
      limit,
      offset,
      students: paged,
    });
  } catch (error) {
    console.error('getAnalyzerStudents error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch analyzer student list',
    });
  }
}

/**
 * GET /api/v1/analyzer/students/:studentId
 */
export async function getAnalyzerStudentDetail(req, res) {
  try {
    await ensureDatabaseExists();
    if (!isAnalyzerAuthorized(req.user)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Academic Analyzer is restricted to Faculty, HOD, and Super Admin accounts',
      });
    }

    const { isSuperAdmin, callerDept } = getCallerRoleMeta(req.user);
    if (!isSuperAdmin && !callerDept) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Department assignment is required on caller profile',
      });
    }

    const rawId = cleanStr(req.params.studentId);
    if (!rawId) {
      return res.status(400).json({ success: false, error: 'studentId is required' });
    }

    const isUuid = UUID_REGEX.test(rawId);
    const lookupWhere = isUuid
      ? "WHERE u.id = $1 AND (u.base_role = 'STUDENT' OR s.usn IS NOT NULL)"
      : "WHERE (UPPER(s.usn) = UPPER($1) OR UPPER(u.username) = UPPER($1)) AND (u.base_role = 'STUDENT' OR s.usn IS NOT NULL)";

    const studentRes = await pool.query(buildMetricsSelectSql(lookupWhere), [rawId]);
    if (studentRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }

    const row = studentRes.rows[0];
    if (!canAccessStudentRow(req.user, row)) {
      return res.status(403).json({
        success: false,
        error: 'Department Scope Violation: Student is outside your department scope',
      });
    }

    const evaluated = evaluateStudentMetrics(row);
    const studentUuid = row.student_id;

    const [attSubjectsRes, cieSubjectsRes, appsRes, financeRes] = await Promise.all([
      pool.query(
        `SELECT subject_code,
                COUNT(*)::int AS total_classes,
                COUNT(*) FILTER (WHERE status = 'PRESENT')::int AS present_count,
                COUNT(*) FILTER (WHERE status = 'ABSENT')::int AS absent_count,
                COUNT(*) FILTER (WHERE status = 'LATE')::int AS late_count,
                COALESCE(ROUND(COUNT(*) FILTER (WHERE status IN ('PRESENT', 'LATE')) * 100.0 / NULLIF(COUNT(*), 0), 2), 0) AS percentage
         FROM attendance_records
         WHERE student_id = $1
         GROUP BY subject_code
         ORDER BY subject_code ASC;`,
        [studentUuid]
      ),
      pool.query(
        `SELECT subject_code, subject_name, semester, cie1, cie2, cie3, assignment, total_cie, max_marks, updated_at
         FROM cie_marks
         WHERE student_id = $1
         ORDER BY semester DESC, subject_code ASC;`,
        [studentUuid]
      ),
      pool.query(
        `SELECT pa.id, pa.drive_id, pa.status, pa.applied_at,
                pd.company_name, pd.role_title, pd.package_lpa, pd.min_cgpa, pd.drive_date
         FROM placement_applications pa
         JOIN placement_drives pd ON pd.id = pa.drive_id
         WHERE pa.student_id = $1
         ORDER BY pa.applied_at DESC;`,
        [studentUuid]
      ),
      pool.query(
        `SELECT id, fee_type, amount_due, amount_paid, fine_amount, status, due_date, updated_at
         FROM finance_records
         WHERE student_id = $1
         ORDER BY created_at DESC;`,
        [studentUuid]
      ),
    ]);

    return res.status(200).json({
      success: true,
      weights: WEIGHTS,
      student: evaluated,
      breakdown: {
        attendance: {
          hasData: evaluated.metrics.hasAttendanceData,
          percentage: evaluated.metrics.attendancePercentage,
          totalClasses: Number(row.att_total || 0),
          attendedClasses: Number(row.att_attended || 0),
          presentCount: Number(row.att_present || 0),
          absentCount: Number(row.att_absent || 0),
          lateCount: Number(row.att_late || 0),
          subjectBreakdown: attSubjectsRes.rows.map((r) => ({
            ...r,
            percentage: round2(r.percentage),
          })),
        },
        cie: {
          hasData: evaluated.metrics.hasCieData,
          percentage: evaluated.metrics.ciePercentage,
          averageTotalCie: evaluated.metrics.avgTotalCie,
          subjectsCount: evaluated.metrics.cieSubjectsCount,
          subjects: cieSubjectsRes.rows.map((r) => ({
            ...r,
            cie1: round2(r.cie1),
            cie2: round2(r.cie2),
            cie3: round2(r.cie3),
            assignment: round2(r.assignment),
            total_cie: round2(r.total_cie),
            max_marks: round2(r.max_marks),
          })),
        },
        cgpaPlacement: {
          hasData: evaluated.metrics.hasCgpaPlacementData,
          cgpa: evaluated.cgpa,
          percentage: evaluated.metrics.cgpaPlacementPercentage,
          applicationsCount: evaluated.metrics.placementApplications,
          shortlistedCount: evaluated.metrics.placementShortlisted,
          selectedCount: evaluated.metrics.placementSelected,
          applications: appsRes.rows.map((r) => ({
            ...r,
            package_lpa: round2(r.package_lpa),
            min_cgpa: round2(r.min_cgpa),
          })),
        },
        finance: {
          hasData: evaluated.metrics.hasFinanceData,
          percentage: evaluated.metrics.financeCompletionPercentage,
          totalDue: round2(row.total_due),
          totalPaid: round2(row.total_paid),
          totalFines: round2(row.total_fines),
          outstandingDues: evaluated.metrics.outstandingDues,
          recordsCount: Number(row.finance_count || 0),
          records: financeRes.rows.map((r) => ({
            ...r,
            amount_due: round2(r.amount_due),
            amount_paid: round2(r.amount_paid),
            fine_amount: round2(r.fine_amount),
          })),
        },
      },
    });
  } catch (error) {
    console.error('getAnalyzerStudentDetail error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch student analyzer detail',
    });
  }
}

export default {
  getAnalyzerSummary,
  getAnalyzerStudents,
  getAnalyzerStudentDetail,
  isAnalyzerAuthorized,
};
