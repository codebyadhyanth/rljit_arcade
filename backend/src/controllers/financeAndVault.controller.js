import fs from 'fs';
import path from 'path';
import pool, { ensureDatabaseExists } from '../config/db.js';
import { encryptAES, decryptAES } from '../utils/crypto.util.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function safeUnlink(filePath) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // Ignore cleanup errors
  }
}

function sanitizeStudentDocument(row) {
  if (!row) return null;
  const { file_path, ...rest } = row;
  return {
    ...rest,
    fileName: file_path ? path.basename(file_path) : null,
  };
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
    return '[Protected Ref]';
  }
}

async function authorizeStudentUsnAccess(req, targetUsn, { allowedSections = [], allowFaculty = false } = {}) {
  const userId = req.user.userId || req.user.id;
  const baseRole = req.user.baseRole;
  const adminTier = req.user.adminTier;
  const sectionCode = String(req.user.sectionCode || '').trim().toUpperCase();
  const subRoles = Array.isArray(req.user.subRoles) ? req.user.subRoles : [];
  const callerDept = String(req.user.department || '').trim().toUpperCase();
  const callerUsn = String(req.user.username || '').trim().toUpperCase();

  const isSuperAdmin = adminTier === 'SUPER_ADMIN';
  const isHod = adminTier === 'HOD_ADMIN' || subRoles.includes('HOD');
  const isPrincipal = sectionCode === 'PRN' || sectionCode === 'PRINCIPAL' || subRoles.includes('PRINCIPAL');
  const isManagement = sectionCode === 'MGT' || subRoles.includes('MANAGEMENT');
  const hasGlobalAccess =
    isSuperAdmin ||
    isPrincipal ||
    isManagement ||
    (baseRole === 'ADMIN' && allowedSections.includes(sectionCode));
  const isFaculty = baseRole === 'FACULTY' && !isHod;

  if (baseRole !== 'STUDENT' && !hasGlobalAccess && !isHod && !(allowFaculty && isFaculty)) {
    return { ok: false, status: 403, error: 'Forbidden: Insufficient permissions to access student record' };
  }

  const studentRes = await pool.query(
    `SELECT user_id, usn, department, core_branch, lg_faculty_id
     FROM student
     WHERE UPPER(usn) = $1
     LIMIT 1;`,
    [targetUsn]
  );

  if (studentRes.rowCount === 0) {
    if (baseRole === 'STUDENT' && targetUsn !== callerUsn) {
      return { ok: false, status: 403, error: 'Forbidden: Students can only access their own records' };
    }
    return { ok: false, status: 404, error: `Student '${targetUsn}' not found` };
  }

  const student = studentRes.rows[0];

  if (baseRole === 'STUDENT') {
    if (student.user_id !== userId) {
      return { ok: false, status: 403, error: 'Forbidden: Students can only access their own records' };
    }
    return { ok: true, student };
  }

  if (hasGlobalAccess) {
    return { ok: true, student };
  }

  const sDept = String(student.department || '').trim().toUpperCase();
  const sBranch = String(student.core_branch || '').trim().toUpperCase();
  const sameDept = Boolean(callerDept && (sDept === callerDept || sBranch === callerDept));

  if (isHod) {
    if (sameDept) return { ok: true, student };
    return { ok: false, status: 403, error: 'Forbidden: HOD access is restricted to own department students' };
  }

  if (allowFaculty && isFaculty) {
    if (student.lg_faculty_id === userId || sameDept) return { ok: true, student };
    return {
      ok: false,
      status: 403,
      error: 'Forbidden: Faculty access is restricted to assigned LG mentees or same-department students',
    };
  }

  return { ok: false, status: 403, error: 'Forbidden: Insufficient permissions' };
}

/**
 * POST /api/v1/admissions/documents/upload
 * Admission Admin or Super Admin uploads a student academic document to the secure vault
 */
export async function uploadDocument(req, res) {
  const file = req.file;
  try {
    await ensureDatabaseExists();
    const { studentUsn, docType } = req.body || {};
    const uploaderId = req.user.userId || req.user.id;

    if (!file || !studentUsn || !docType) {
      safeUnlink(file?.path);
      return res.status(400).json({
        success: false,
        error: 'File (document), studentUsn, and docType are required',
      });
    }

    const cleanUsn = String(studentUsn).toUpperCase().trim();
    const type = String(docType).toUpperCase().trim();

    if (!cleanUsn || !type) {
      safeUnlink(file.path);
      return res.status(400).json({
        success: false,
        error: 'studentUsn and docType cannot be empty',
      });
    }

    const studentCheck = await pool.query(
      'SELECT usn FROM student WHERE UPPER(usn) = $1 LIMIT 1;',
      [cleanUsn]
    );
    if (studentCheck.rowCount === 0) {
      safeUnlink(file.path);
      return res.status(404).json({
        success: false,
        error: `Student '${cleanUsn}' not found`,
      });
    }

    const insertQuery = `
      INSERT INTO student_documents (
        student_usn, doc_type, file_path, verification_status, custody_status, verified_by
      )
      VALUES ($1, $2, $3, 'PENDING_REVIEW', 'SUBMITTED_TO_ADMISSION_DEPT', $4)
      RETURNING *;
    `;
    const result = await pool.query(insertQuery, [cleanUsn, type, file.path, uploaderId]);

    return res.status(201).json({
      success: true,
      message: 'Student document successfully secured in admission vault',
      document: sanitizeStudentDocument(result.rows[0]),
    });
  } catch (error) {
    safeUnlink(file?.path);
    console.error('uploadDocument error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to upload document' });
  }
}

/**
 * PATCH /api/v1/admissions/documents/:docId/verify
 * Admission Admin updates verification status and physical document custody status
 */
export async function verifyDocument(req, res) {
  try {
    await ensureDatabaseExists();
    const { docId } = req.params;
    if (!UUID_REGEX.test(String(docId || '').trim())) {
      return res.status(400).json({ success: false, error: 'Invalid docId UUID format' });
    }

    const { verificationStatus, custodyStatus } = req.body || {};
    const adminId = req.user.userId || req.user.id;

    const validVerifications = ['PENDING_REVIEW', 'VERIFIED', 'REJECTED'];
    const validCustody = ['WITH_STUDENT', 'SUBMITTED_TO_ADMISSION_DEPT', 'RETURNED_TO_STUDENT'];

    if (verificationStatus && !validVerifications.includes(String(verificationStatus).toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: `verificationStatus must be one of: ${validVerifications.join(', ')}`,
      });
    }

    if (custodyStatus && !validCustody.includes(String(custodyStatus).toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: `custodyStatus must be one of: ${validCustody.join(', ')}`,
      });
    }

    const updateQuery = `
      UPDATE student_documents
      SET verification_status = COALESCE($1, verification_status),
          custody_status = COALESCE($2, custody_status),
          verified_by = $3,
          updated_at = NOW()
      WHERE id = $4
      RETURNING *;
    `;
    const result = await pool.query(updateQuery, [
      verificationStatus ? String(verificationStatus).toUpperCase() : null,
      custodyStatus ? String(custodyStatus).toUpperCase() : null,
      adminId,
      docId.trim(),
    ]);

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Document record not found' });
    }

    return res.status(200).json({
      success: true,
      message: 'Document verification and custody updated',
      document: sanitizeStudentDocument(result.rows[0]),
    });
  } catch (error) {
    console.error('verifyDocument error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to verify document' });
  }
}

/**
 * GET /api/v1/admissions/vault/:usn
 * Returns student document inventory with verification and custody status (hides raw disk paths)
 */
export async function getStudentVault(req, res) {
  try {
    await ensureDatabaseExists();
    const targetUsn = String(req.params.usn || '').toUpperCase().trim();

    const authz = await authorizeStudentUsnAccess(req, targetUsn, { allowedSections: ['ADM'] });
    if (!authz.ok) {
      return res.status(authz.status).json({ success: false, error: authz.error });
    }

    const query = `
      SELECT id, student_usn, doc_type, file_path, verification_status, custody_status, verified_by, updated_at
      FROM student_documents
      WHERE UPPER(student_usn) = $1
      ORDER BY updated_at DESC;
    `;
    const result = await pool.query(query, [targetUsn]);

    return res.status(200).json({
      success: true,
      studentUsn: targetUsn,
      documentsCount: result.rowCount,
      documents: result.rows.map(sanitizeStudentDocument),
    });
  } catch (error) {
    console.error('getStudentVault error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to fetch student vault' });
  }
}

/**
 * POST /api/v1/finance/ledger/charge
 * Finance Section Admin imposes a tuition fee, exam fee, or disciplinary fine on a student
 */
export async function createLedgerCharge(req, res) {
  try {
    await ensureDatabaseExists();
    const { studentUsn, category, title, totalAmount, dueDate } = req.body || {};
    const adminId = req.user.userId || req.user.id;

    if (!studentUsn || !category || !title || totalAmount === undefined || totalAmount === null || totalAmount === '') {
      return res.status(400).json({
        success: false,
        error: 'studentUsn, category, title, and totalAmount are required',
      });
    }

    const cleanUsn = String(studentUsn).toUpperCase().trim();
    const cat = String(category).toUpperCase().trim();
    const validCats = ['TUITION_FEE', 'EXAM_FEE', 'MISC_FEE', 'FINE'];
    if (!validCats.includes(cat)) {
      return res.status(400).json({ success: false, error: `category must be one of: ${validCats.join(', ')}` });
    }

    const parsedAmount = Number(totalAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, error: 'totalAmount must be a positive number' });
    }

    const cleanDueDate = dueDate !== undefined && dueDate !== null && String(dueDate).trim() !== ''
      ? String(dueDate).trim()
      : null;
    if (cleanDueDate && !isValidIsoDate(cleanDueDate)) {
      return res.status(400).json({ success: false, error: 'dueDate must be a valid YYYY-MM-DD date' });
    }

    const studentCheck = await pool.query(
      'SELECT usn FROM student WHERE UPPER(usn) = $1 LIMIT 1;',
      [cleanUsn]
    );
    if (studentCheck.rowCount === 0) {
      return res.status(404).json({ success: false, error: `Student '${cleanUsn}' not found` });
    }

    const insertQuery = `
      INSERT INTO finance_ledgers (
        student_usn, category, title, total_amount, paid_amount, due_date, status, imposed_by
      )
      VALUES ($1, $2, $3, $4, 0.00, $5, 'PENDING', $6)
      RETURNING *;
    `;
    const result = await pool.query(insertQuery, [
      cleanUsn,
      cat,
      String(title).trim(),
      Number(parsedAmount.toFixed(2)),
      cleanDueDate,
      adminId,
    ]);

    return res.status(201).json({
      success: true,
      message: 'Financial obligation charged to student ledger',
      charge: result.rows[0],
    });
  } catch (error) {
    console.error('createLedgerCharge error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to create ledger charge' });
  }
}

/**
 * POST /api/v1/finance/ledger/pay
 * Records a student fee payment in finance_transactions and updates the ledger item status
 */
export async function recordLedgerPayment(req, res) {
  let client = null;
  try {
    await ensureDatabaseExists();
    const { ledgerId, amountPaid, paymentMode, referenceNo } = req.body || {};
    const adminId = req.user.userId || req.user.id;

    if (!ledgerId || amountPaid === undefined || amountPaid === null) {
      return res.status(400).json({ success: false, error: 'ledgerId and amountPaid are required' });
    }

    if (!UUID_REGEX.test(String(ledgerId).trim())) {
      return res.status(400).json({ success: false, error: 'Invalid ledgerId UUID format' });
    }

    const payAmount = Number(amountPaid);
    if (!Number.isFinite(payAmount) || payAmount <= 0) {
      return res.status(400).json({ success: false, error: 'amountPaid must be a positive number' });
    }

    client = await pool.connect();
    await client.query('BEGIN');

    const ledgerRes = await client.query('SELECT * FROM finance_ledgers WHERE id = $1 FOR UPDATE', [
      String(ledgerId).trim(),
    ]);
    if (ledgerRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Ledger charge not found' });
    }

    const ledger = ledgerRes.rows[0];
    const total = Number(ledger.total_amount);
    const alreadyPaid = Number(ledger.paid_amount);
    const remaining = Number(Math.max(0, total - alreadyPaid).toFixed(2));
    if (ledger.status === 'PAID' || remaining <= 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: 'Ledger charge is already fully PAID' });
    }
    if (payAmount > remaining) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: `amountPaid (${payAmount}) exceeds remaining balance (${remaining})`,
      });
    }

    const newPaid = Number((alreadyPaid + payAmount).toFixed(2));
    const newStatus = newPaid >= total ? 'PAID' : 'PARTIAL';

    // Encrypt payment reference number with AES-256-GCM
    const encryptedRef = referenceNo ? encryptAES(referenceNo) : null;

    // Record immutable transaction
    const txQuery = `
      INSERT INTO finance_transactions (
        ledger_id, student_usn, amount_paid, payment_mode, ref_no_encrypted, recorded_by
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    const txRes = await client.query(txQuery, [
      String(ledgerId).trim(),
      ledger.student_usn,
      payAmount,
      paymentMode ? String(paymentMode).toUpperCase() : 'ONLINE',
      encryptedRef,
      adminId,
    ]);

    // Update parent ledger item
    const updateLedgerQuery = `
      UPDATE finance_ledgers
      SET paid_amount = $1, status = $2
      WHERE id = $3
      RETURNING *;
    `;
    const updatedLedgerRes = await client.query(updateLedgerQuery, [
      newPaid,
      newStatus,
      String(ledgerId).trim(),
    ]);

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Payment committed and ledger reconciled',
      updatedLedger: updatedLedgerRes.rows[0],
      transactionReceipt: {
        id: txRes.rows[0].id,
        amountPaid: payAmount,
        paymentMode: txRes.rows[0].payment_mode,
        referenceNoPlain: referenceNo,
        timestamp: txRes.rows[0].created_at,
      },
    });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rbErr) {
        console.error('Rollback error on payment:', rbErr.message);
      }
    }
    console.error('recordLedgerPayment error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to record payment' });
  } finally {
    if (client) client.release();
  }
}

/**
 * GET /api/v1/finance/ledger/:usn
 * Returns itemized statement of student fees and transaction payment history
 */
export async function getStudentLedger(req, res) {
  try {
    await ensureDatabaseExists();
    const targetUsn = String(req.params.usn || '').toUpperCase().trim();

    const authz = await authorizeStudentUsnAccess(req, targetUsn, { allowedSections: ['ACC'] });
    if (!authz.ok) {
      return res.status(authz.status).json({ success: false, error: authz.error });
    }

    const ledgersRes = await pool.query(
      `SELECT * FROM finance_ledgers WHERE UPPER(student_usn) = $1 ORDER BY created_at DESC;`,
      [targetUsn]
    );

    const txRes = await pool.query(
      `SELECT id, ledger_id, amount_paid, payment_mode, ref_no_encrypted, created_at
       FROM finance_transactions WHERE UPPER(student_usn) = $1 ORDER BY created_at DESC;`,
      [targetUsn]
    );

    const transactions = txRes.rows.map((t) => ({
      id: t.id,
      ledgerId: t.ledger_id,
      amountPaid: parseFloat(t.amount_paid),
      paymentMode: t.payment_mode,
      referenceNo: safeDecrypt(t.ref_no_encrypted),
      createdAt: t.created_at,
    }));

    let totalBilled = 0;
    let totalPaid = 0;
    ledgersRes.rows.forEach((l) => {
      totalBilled += parseFloat(l.total_amount);
      totalPaid += parseFloat(l.paid_amount);
    });

    return res.status(200).json({
      success: true,
      studentUsn: targetUsn,
      summary: {
        totalBilled,
        totalPaid,
        outstandingDues: totalBilled - totalPaid,
        isFullySettled: totalBilled - totalPaid <= 0,
      },
      ledgerItems: ledgersRes.rows,
      transactions,
    });
  } catch (error) {
    console.error('getStudentLedger error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to fetch finance ledger' });
  }
}

/**
 * GET /api/v1/student/clearance-status/:usn
 * Automated No-Dues Engine evaluating the 4 Pillars over normalized Module 7 tables & document vault
 */
export async function getClearanceStatus(req, res) {
  try {
    await ensureDatabaseExists();
    const targetUsn = String(req.params.usn || '').toUpperCase().trim();

    const authz = await authorizeStudentUsnAccess(req, targetUsn, {
      allowedSections: ['ACC', 'EXM'],
      allowFaculty: true,
    });
    if (!authz.ok) {
      return res.status(authz.status).json({ success: false, error: authz.error });
    }

    const studentUserId = authz.student.user_id;

    const [attRes, cieRes, finRes, docRes] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)::int AS total_sessions,
           COUNT(*) FILTER (WHERE status IN ('PRESENT', 'LATE'))::int AS attended_sessions,
           ROUND(COUNT(*) FILTER (WHERE status IN ('PRESENT', 'LATE')) * 100.0 / NULLIF(COUNT(*), 0), 2) AS attendance_pct
         FROM attendance_records
         WHERE student_id = $1;`,
        [studentUserId]
      ),
      pool.query(
        `SELECT
           COUNT(*)::int AS cie_count,
           ROUND(AVG(total_cie), 2) AS avg_cie_marks,
           ROUND(AVG((total_cie / NULLIF(max_marks, 0)) * 100.0), 2) AS avg_cie_pct
         FROM cie_marks
         WHERE student_id = $1;`,
        [studentUserId]
      ),
      pool.query(
        `SELECT COALESCE(SUM(GREATEST(0, (amount_due + fine_amount) - amount_paid)), 0.00) AS pending_dues
         FROM finance_records
         WHERE student_id = $1;`,
        [studentUserId]
      ),
      pool.query(
        `SELECT
           COUNT(*)::int AS total_docs,
           COUNT(*) FILTER (WHERE verification_status = 'VERIFIED')::int AS verified_docs,
           COUNT(*) FILTER (WHERE verification_status != 'VERIFIED')::int AS unverified_docs
         FROM student_documents
         WHERE UPPER(student_usn) = $1;`,
        [targetUsn]
      ),
    ]);

    const attRow = attRes.rows[0] ?? {};
    const totalSessions = Number(attRow.total_sessions ?? 0);
    const hasAttendanceData =
      totalSessions > 0 && attRow.attendance_pct !== null && attRow.attendance_pct !== undefined;
    const attPct = hasAttendanceData ? Number(attRow.attendance_pct ?? 0) : 0;
    const attendanceClear = !hasAttendanceData || attPct >= 85.0;

    const cieRow = cieRes.rows[0] ?? {};
    const cieCount = Number(cieRow.cie_count ?? 0);
    const hasCieData =
      cieCount > 0 && cieRow.avg_cie_marks !== null && cieRow.avg_cie_marks !== undefined;
    const avgCie = hasCieData ? Number(cieRow.avg_cie_marks ?? 0) : 0;
    const avgCiePct = hasCieData ? Number(cieRow.avg_cie_pct ?? 0) : 0;
    const cieClear = !hasCieData || avgCiePct >= 40.0;

    const pendingDues = Number(finRes.rows[0]?.pending_dues ?? 0);
    const financeClear = pendingDues <= 0;

    const unverifiedCount = Number(docRes.rows[0]?.unverified_docs ?? 0);
    const documentsClear = unverifiedCount === 0;

    const overallHallTicketEligible =
      attendanceClear && cieClear && financeClear && documentsClear;

    return res.status(200).json({
      success: true,
      studentUsn: targetUsn,
      clearance: {
        hasAttendanceData,
        attendanceClear,
        attendancePercentage: attPct,
        hasCieData,
        cieClear,
        avgCieMarks: avgCie,
        financeClear,
        outstandingDues: pendingDues,
        documentsClear,
        unverifiedDocumentsCount: unverifiedCount,
        overallHallTicketEligible,
      },
      statusSummary: overallHallTicketEligible
        ? 'APPROVED: Student is 100% eligible for Semester End Examination Hall Ticket generation'
        : 'BLOCKED: Clearance barriers detected. Review individual pillar details.',
    });
  } catch (error) {
    console.error('getClearanceStatus error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to compute clearance status' });
  }
}

export default {
  uploadDocument,
  verifyDocument,
  getStudentVault,
  createLedgerCharge,
  recordLedgerPayment,
  getStudentLedger,
  getClearanceStatus,
};
