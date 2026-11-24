import pool, { ensureDatabaseExists } from '../config/db.js';

/**
 * Helper to resolve student UUID if USN is provided
 */
async function resolveStudentId(idOrUsn, client = pool) {
  if (!idOrUsn) return null;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrUsn);
  if (isUuid) return idOrUsn;

  const res = await client.query('SELECT id FROM users WHERE username = $1', [String(idOrUsn).toUpperCase()]);
  if (res.rowCount > 0) return res.rows[0].id;

  const resStudent = await client.query('SELECT user_id FROM student WHERE usn = $1', [String(idOrUsn).toUpperCase()]);
  if (resStudent.rowCount > 0) return resStudent.rows[0].user_id;

  return null;
}

// ─────────────────────────────────────────────────────────────
// PLACEMENT MODULE
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/v1/placements/drives
 * Lists placement drives with optional status and branch filters
 */
export async function listPlacementDrives(req, res) {
  try {
    await ensureDatabaseExists();
    const { status, branch } = req.query;

    const conditions = [];
    const values = [];

    if (status) {
      values.push(status.toUpperCase());
      conditions.push(`pd.status = $${values.length}`);
    }
    if (branch) {
      values.push(branch.toUpperCase());
      conditions.push(`$${values.length} = ANY(pd.eligible_branches)`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT pd.id, pd.company_name, pd.role_title, pd.package_lpa,
             pd.min_cgpa, pd.eligible_branches, pd.drive_date, pd.status,
             pd.created_at,
             COUNT(pa.id) AS applications_count
      FROM placement_drives pd
      LEFT JOIN placement_applications pa ON pd.id = pa.drive_id
      ${whereClause}
      GROUP BY pd.id
      ORDER BY pd.drive_date ASC;
    `;

    const result = await pool.query(query, values);
    return res.status(200).json({
      success: true,
      count: result.rowCount,
      drives: result.rows,
    });
  } catch (error) {
    console.error('listPlacementDrives error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to list placement drives' });
  }
}

/**
 * POST /api/v1/placements/drives
 * Admin (PLC / Super Admin) creates a placement drive
 */
export async function createPlacementDrive(req, res) {
  try {
    await ensureDatabaseExists();
    const {
      company_name,
      companyName,
      role_title,
      roleTitle,
      package_lpa,
      packageLpa,
      min_cgpa = 6.0,
      minCgpa = 6.0,
      eligible_branches = [],
      eligibleBranches = [],
      drive_date,
      driveDate,
      status = 'UPCOMING',
    } = req.body;

    const company = company_name || companyName;
    const title = role_title || roleTitle;
    const lpa = parseFloat(package_lpa || packageLpa || 0);
    const date = drive_date || driveDate;
    const branches = eligible_branches.length ? eligible_branches : eligibleBranches;
    const cgpa = parseFloat(min_cgpa || minCgpa || 6.0);

    if (!company || !title || !lpa || !date) {
      return res.status(400).json({
        success: false,
        error: 'company_name, role_title, package_lpa, and drive_date are required',
      });
    }

    const userId = req.user.userId || req.user.id;

    const insertQuery = `
      INSERT INTO placement_drives (
        company_name, role_title, package_lpa, min_cgpa, eligible_branches, drive_date, status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;

    const result = await pool.query(insertQuery, [
      company.trim(),
      title.trim(),
      lpa,
      cgpa,
      branches,
      date,
      status.toUpperCase(),
      userId,
    ]);

    const createdDrive = result.rows[0];

    const dbReceipt = {
      receiptId: `RCPT-PLC-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
      transactionId: `tx_plc_${createdDrive.id.substring(0, 8)}_${Date.now()}`,
      table: 'placement_drives',
      recordId: createdDrive.id,
      companyName: company,
      packageLpa: lpa,
      createdBy: userId,
      timestamp: new Date().toISOString(),
    };

    return res.status(201).json({
      success: true,
      message: 'Placement drive created successfully',
      dbReceipt,
      drive: createdDrive,
    });
  } catch (error) {
    console.error('createPlacementDrive error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to create placement drive' });
  }
}

/**
 * POST /api/v1/placements/drives/:id/apply
 * Student applies for a placement drive
 */
export async function applyPlacementDrive(req, res) {
  try {
    await ensureDatabaseExists();
    const driveId = req.params.id;
    const studentRawId = req.body.student_id || req.body.studentId || req.user.userId || req.user.id;
    const studentId = await resolveStudentId(studentRawId);
    const resumeUrl = req.body.resume_url || req.body.resumeUrl || null;

    if (!studentId) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }

    const driveRes = await pool.query('SELECT * FROM placement_drives WHERE id = $1', [driveId]);
    if (driveRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Placement drive not found' });
    }
    const drive = driveRes.rows[0];

    if (drive.status === 'CANCELLED' || drive.status === 'COMPLETED') {
      return res.status(400).json({ success: false, error: `Drive is ${drive.status} and no longer accepting applications` });
    }

    const insertQuery = `
      INSERT INTO placement_applications (drive_id, student_id, resume_url, status)
      VALUES ($1, $2, $3, 'APPLIED')
      ON CONFLICT (drive_id, student_id)
      DO UPDATE SET applied_at = NOW(), resume_url = COALESCE(EXCLUDED.resume_url, placement_applications.resume_url)
      RETURNING *;
    `;

    const appRes = await pool.query(insertQuery, [driveId, studentId, resumeUrl]);

    const dbReceipt = {
      receiptId: `RCPT-PLCAPPLY-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
      transactionId: `tx_plcapp_${appRes.rows[0].id.substring(0, 8)}_${Date.now()}`,
      table: 'placement_applications',
      recordId: appRes.rows[0].id,
      driveId,
      studentId,
      status: 'APPLIED',
      timestamp: new Date().toISOString(),
    };

    return res.status(200).json({
      success: true,
      message: 'Placement application submitted successfully',
      dbReceipt,
      application: appRes.rows[0],
    });
  } catch (error) {
    console.error('applyPlacementDrive error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to submit placement application' });
  }
}

// ─────────────────────────────────────────────────────────────
// FINANCE MODULE
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/v1/finance/records
 * Lists finance records (fee obligations & payments)
 */
export async function listFinanceRecords(req, res) {
  try {
    await ensureDatabaseExists();
    const { student_id, studentId, fee_type, status } = req.query;

    const conditions = [];
    const values = [];

    const rawStudent = student_id || studentId;
    if (rawStudent) {
      const resolved = await resolveStudentId(rawStudent);
      if (resolved) {
        values.push(resolved);
        conditions.push(`fr.student_id = $${values.length}`);
      }
    } else if (req.user.baseRole === 'STUDENT') {
      values.push(req.user.userId || req.user.id);
      conditions.push(`fr.student_id = $${values.length}`);
    }

    if (fee_type) {
      values.push(fee_type.toUpperCase());
      conditions.push(`fr.fee_type = $${values.length}`);
    }
    if (status) {
      values.push(status.toUpperCase());
      conditions.push(`fr.status = $${values.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT fr.id, fr.student_id, u_stu.username AS student_usn,
             fr.fee_type, fr.amount_due, fr.amount_paid, fr.fine_amount,
             (fr.amount_due + fr.fine_amount - fr.amount_paid) AS balance_remaining,
             fr.status, fr.due_date, fr.created_at, fr.updated_at
      FROM finance_records fr
      JOIN users u_stu ON fr.student_id = u_stu.id
      ${whereClause}
      ORDER BY fr.due_date ASC, fr.created_at DESC;
    `;

    const result = await pool.query(query, values);
    return res.status(200).json({
      success: true,
      count: result.rowCount,
      records: result.rows,
    });
  } catch (error) {
    console.error('listFinanceRecords error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to list finance records' });
  }
}

/**
 * POST /api/v1/finance/records
 * ACC Admin or Super Admin creates a fee record obligation
 */
export async function createFinanceRecord(req, res) {
  try {
    await ensureDatabaseExists();
    const {
      student_id,
      studentId,
      usn,
      fee_type,
      feeType,
      amount_due,
      amountDue,
      due_date,
      dueDate,
    } = req.body;

    const rawStudent = student_id || studentId || usn;
    const targetStudentId = await resolveStudentId(rawStudent);

    if (!targetStudentId) {
      return res.status(404).json({ success: false, error: 'Target student not found' });
    }

    const type = (fee_type || feeType || 'TUITION').toUpperCase();
    const due = parseFloat(amount_due || amountDue || 0);
    const date = due_date || dueDate || null;

    if (isNaN(due) || due <= 0) {
      return res.status(400).json({ success: false, error: 'amount_due must be a positive number' });
    }

    const userId = req.user.userId || req.user.id;

    const insertQuery = `
      INSERT INTO finance_records (
        student_id, fee_type, amount_due, amount_paid, fine_amount, status, due_date, updated_by
      ) VALUES ($1, $2, $3, 0.00, 0.00, 'PENDING', $4, $5)
      RETURNING *;
    `;

    const result = await pool.query(insertQuery, [targetStudentId, type, due, date, userId]);
    const createdRecord = result.rows[0];

    const dbReceipt = {
      receiptId: `RCPT-FIN-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
      transactionId: `tx_fin_${createdRecord.id.substring(0, 8)}_${Date.now()}`,
      table: 'finance_records',
      recordId: createdRecord.id,
      studentId: targetStudentId,
      feeType: type,
      amountDue: due,
      status: 'PENDING',
      timestamp: new Date().toISOString(),
    };

    return res.status(201).json({
      success: true,
      message: 'Finance fee record created successfully',
      dbReceipt,
      record: createdRecord,
    });
  } catch (error) {
    console.error('createFinanceRecord error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to create finance record' });
  }
}

/**
 * PATCH /api/v1/finance/records/:id/pay
 * Payment recorded against finance fee record
 */
export async function payFinanceRecord(req, res) {
  try {
    await ensureDatabaseExists();
    const { id } = req.params;
    const { amount_paid, amountPaid } = req.body;

    const payment = parseFloat(amount_paid || amountPaid || 0);
    if (isNaN(payment) || payment <= 0) {
      return res.status(400).json({ success: false, error: 'amount_paid must be a positive number' });
    }

    const checkRes = await pool.query('SELECT * FROM finance_records WHERE id = $1', [id]);
    if (checkRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Finance record not found' });
    }
    const record = checkRes.rows[0];

    const newAmountPaid = parseFloat(record.amount_paid) + payment;
    const totalDueWithFine = parseFloat(record.amount_due) + parseFloat(record.fine_amount);
    const newStatus = newAmountPaid >= totalDueWithFine ? 'PAID' : 'PARTIAL';
    const userId = req.user.userId || req.user.id;

    const updateQuery = `
      UPDATE finance_records
      SET amount_paid = $1, status = $2, updated_by = $3, updated_at = NOW()
      WHERE id = $4
      RETURNING *;
    `;

    const result = await pool.query(updateQuery, [newAmountPaid, newStatus, userId, id]);
    const updated = result.rows[0];

    const dbReceipt = {
      receiptId: `RCPT-FINPAY-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
      transactionId: `tx_finpay_${id.substring(0, 8)}_${Date.now()}`,
      table: 'finance_records',
      recordId: id,
      amountPaidJustNow: payment,
      totalAmountPaid: newAmountPaid,
      totalDue: totalDueWithFine,
      status: newStatus,
      paidAt: new Date().toISOString(),
    };

    return res.status(200).json({
      success: true,
      message: `Payment of ₹${payment} successfully recorded. Record status: ${newStatus}`,
      dbReceipt,
      record: updated,
    });
  } catch (error) {
    console.error('payFinanceRecord error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to record payment' });
  }
}

export default {
  listPlacementDrives,
  createPlacementDrive,
  applyPlacementDrive,
  listFinanceRecords,
  createFinanceRecord,
  payFinanceRecord,
};
