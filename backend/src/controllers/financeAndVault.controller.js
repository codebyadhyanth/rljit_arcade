import pool, { ensureDatabaseExists } from '../config/db.js';
import { encryptAES, decryptAES } from '../utils/crypto.util.js';

function safeDecrypt(ciphertext) {
  if (!ciphertext) return null;
  try {
    return decryptAES(ciphertext);
  } catch {
    return '[Protected Ref]';
  }
}

/**
 * POST /api/v1/admissions/documents/upload
 * Admission Admin or Super Admin uploads a student academic document to the secure vault
 */
export async function uploadDocument(req, res) {
  try {
    await ensureDatabaseExists();
    const file = req.file;
    const { studentUsn, docType } = req.body;
    const uploaderId = req.user.userId || req.user.id;

    if (!file || !studentUsn || !docType) {
      return res.status(400).json({
        success: false,
        error: 'File (document), studentUsn, and docType are required',
      });
    }

    const type = String(docType).toUpperCase().trim();

    const insertQuery = `
      INSERT INTO student_documents (
        student_usn, doc_type, file_path, verification_status, custody_status, verified_by
      )
      VALUES ($1, $2, $3, 'PENDING_REVIEW', 'SUBMITTED_TO_ADMISSION_DEPT', $4)
      RETURNING *;
    `;
    const result = await pool.query(insertQuery, [studentUsn.toUpperCase().trim(), type, file.path, uploaderId]);

    return res.status(201).json({
      success: true,
      message: 'Student document successfully secured in admission vault',
      document: result.rows[0],
    });
  } catch (error) {
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
    const { verificationStatus, custodyStatus } = req.body;
    const adminId = req.user.userId || req.user.id;

    const validVerifications = ['PENDING_REVIEW', 'VERIFIED', 'REJECTED'];
    const validCustody = ['WITH_STUDENT', 'SUBMITTED_TO_ADMISSION_DEPT', 'RETURNED_TO_STUDENT'];

    if (verificationStatus && !validVerifications.includes(verificationStatus.toUpperCase())) {
      return res.status(400).json({ success: false, error: `verificationStatus must be one of: ${validVerifications.join(', ')}` });
    }

    if (custodyStatus && !validCustody.includes(custodyStatus.toUpperCase())) {
      return res.status(400).json({ success: false, error: `custodyStatus must be one of: ${validCustody.join(', ')}` });
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
      verificationStatus ? verificationStatus.toUpperCase() : null,
      custodyStatus ? custodyStatus.toUpperCase() : null,
      adminId,
      docId,
    ]);

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Document record not found' });
    }

    return res.status(200).json({
      success: true,
      message: 'Document verification and custody updated',
      document: result.rows[0],
    });
  } catch (error) {
    console.error('verifyDocument error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to verify document' });
  }
}

/**
 * GET /api/v1/admissions/vault/:usn
 * Returns student document inventory with verification and custody status
 */
export async function getStudentVault(req, res) {
  try {
    await ensureDatabaseExists();
    const targetUsn = req.params.usn.toUpperCase().trim();

    const query = `
      SELECT id, student_usn, doc_type, file_path, verification_status, custody_status, verified_by, updated_at
      FROM student_documents
      WHERE student_usn = $1
      ORDER BY updated_at DESC;
    `;
    const result = await pool.query(query, [targetUsn]);

    return res.status(200).json({
      success: true,
      studentUsn: targetUsn,
      documentsCount: result.rowCount,
      documents: result.rows,
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
    const { studentUsn, category, title, totalAmount, dueDate } = req.body;
    const adminId = req.user.userId || req.user.id;

    if (!studentUsn || !category || !title || totalAmount === undefined) {
      return res.status(400).json({
        success: false,
        error: 'studentUsn, category, title, and totalAmount are required',
      });
    }

    const cat = category.toUpperCase().trim();
    const validCats = ['TUITION_FEE', 'EXAM_FEE', 'MISC_FEE', 'FINE'];
    if (!validCats.includes(cat)) {
      return res.status(400).json({ success: false, error: `category must be one of: ${validCats.join(', ')}` });
    }

    const insertQuery = `
      INSERT INTO finance_ledgers (
        student_usn, category, title, total_amount, paid_amount, due_date, status, imposed_by
      )
      VALUES ($1, $2, $3, $4, 0.00, $5, 'PENDING', $6)
      RETURNING *;
    `;
    const result = await pool.query(insertQuery, [
      studentUsn.toUpperCase().trim(),
      cat,
      title,
      parseFloat(totalAmount),
      dueDate || null,
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
    const { ledgerId, amountPaid, paymentMode, referenceNo } = req.body;
    const adminId = req.user.userId || req.user.id;

    if (!ledgerId || !amountPaid) {
      return res.status(400).json({ success: false, error: 'ledgerId and amountPaid are required' });
    }

    const payAmount = parseFloat(amountPaid);
    if (isNaN(payAmount) || payAmount <= 0) {
      return res.status(400).json({ success: false, error: 'amountPaid must be a positive number' });
    }

    client = await pool.connect();
    await client.query('BEGIN');

    const ledgerRes = await client.query('SELECT * FROM finance_ledgers WHERE id = $1 FOR UPDATE', [ledgerId]);
    if (ledgerRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Ledger charge not found' });
    }

    const ledger = ledgerRes.rows[0];
    const newPaid = parseFloat(ledger.paid_amount) + payAmount;
    const total = parseFloat(ledger.total_amount);
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
      ledgerId,
      ledger.student_usn,
      payAmount,
      paymentMode ? paymentMode.toUpperCase() : 'ONLINE',
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
    const updatedLedgerRes = await client.query(updateLedgerQuery, [newPaid, newStatus, ledgerId]);

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
      } catch (rb) {
        console.error('Rollback error on payment:', rb.message);
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
    const targetUsn = req.params.usn.toUpperCase().trim();

    const ledgersRes = await pool.query(
      `SELECT * FROM finance_ledgers WHERE student_usn = $1 ORDER BY created_at DESC;`,
      [targetUsn]
    );

    const txRes = await pool.query(
      `SELECT id, ledger_id, amount_paid, payment_mode, ref_no_encrypted, created_at
       FROM finance_transactions WHERE student_usn = $1 ORDER BY created_at DESC;`,
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
 * Automated No-Dues Engine evaluating the 4 Pillars of Institutional Clearance
 */
export async function getClearanceStatus(req, res) {
  try {
    await ensureDatabaseExists();
    const targetUsn = req.params.usn.toUpperCase().trim();

    // 1. Pillar 1: Attendance Clearance (>= 85%)
    const attRes = await pool.query(
      `SELECT 
         COUNT(*) AS total_sessions,
         COUNT(*) FILTER (WHERE attendance_status IN ('P', 'OD_PRESENT')) AS attended_sessions,
         ROUND(COUNT(*) FILTER (WHERE attendance_status IN ('P', 'OD_PRESENT')) * 100.0 / NULLIF(COUNT(*), 0), 2) AS attendance_pct
       FROM academic_records
       WHERE student_usn = $1 AND record_type = 'ATTENDANCE'`,
      [targetUsn]
    );
    const attPct = parseFloat(attRes.rows[0]?.attendance_pct || 100); // Default 100 if no sessions logged yet
    const attendanceClear = attPct >= 85.0;

    // 2. Pillar 2: Academic CIE Clearance (>= 40% avg marks, i.e., >= 12 out of 30)
    const cieRes = await pool.query(
      `SELECT ROUND(AVG(marks_obtained), 2) AS avg_cie_marks
       FROM academic_records
       WHERE student_usn = $1 AND record_type IN ('CIE_1', 'CIE_2', 'CIE_3')`,
      [targetUsn]
    );
    const avgCie = parseFloat(cieRes.rows[0]?.avg_cie_marks || 25);
    const cieClear = avgCie >= 12.0;

    // 3. Pillar 3: Financial Clearance (pending fees & fines == 0)
    const finRes = await pool.query(
      `SELECT COALESCE(SUM(total_amount - paid_amount), 0.00) AS pending_dues
       FROM finance_ledgers
       WHERE student_usn = $1`,
      [targetUsn]
    );
    const pendingDues = parseFloat(finRes.rows[0]?.pending_dues || 0);
    const financeClear = pendingDues <= 0;

    // 4. Pillar 4: Admission Document Vault Clearance (all uploaded documents must be VERIFIED)
    const docRes = await pool.query(
      `SELECT 
         COUNT(*) AS total_docs,
         COUNT(*) FILTER (WHERE verification_status = 'VERIFIED') AS verified_docs,
         COUNT(*) FILTER (WHERE verification_status != 'VERIFIED') AS unverified_docs
       FROM student_documents
       WHERE student_usn = $1`,
      [targetUsn]
    );
    const unverifiedCount = parseInt(docRes.rows[0]?.unverified_docs || 0, 10);
    const documentsClear = unverifiedCount === 0;

    const overallHallTicketEligible = attendanceClear && cieClear && financeClear && documentsClear;

    return res.status(200).json({
      success: true,
      studentUsn: targetUsn,
      clearance: {
        attendanceClear,
        attendancePercentage: attPct,
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

