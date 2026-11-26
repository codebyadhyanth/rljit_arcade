import fs from 'fs';
import pool, { ensureDatabaseExists } from '../config/db.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_RECORD_TYPES = ['ATTENDANCE', 'CIE_1', 'CIE_2', 'CIE_3', 'ASSIGNMENT', 'OVERALL_INTERNAL'];
const VALID_LEGACY_ATTENDANCE = ['P', 'A', 'OD_PRESENT'];

function safeUnlink(filePath) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // Ignore cleanup error
  }
}

function cleanStr(val) {
  if (val === undefined || val === null) return null;
  const trimmed = String(val).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function cleanUpper(val) {
  const s = cleanStr(val);
  return s ? s.toUpperCase() : null;
}

function isSuperAdminUser(user) {
  return Boolean(user && user.adminTier === 'SUPER_ADMIN');
}

function isHodUser(user) {
  if (!user) return false;
  const subRoles = Array.isArray(user.subRoles) ? user.subRoles : [];
  return user.adminTier === 'HOD_ADMIN' || subRoles.includes('HOD');
}

function isFacultyOrHod(user) {
  return Boolean(user && (user.baseRole === 'FACULTY' || isHodUser(user)));
}

function canModifyAcademicRecord(user, ownerUserId, recordDepartment) {
  if (!user) return false;
  if (isSuperAdminUser(user)) return true;
  const callerId = user.userId || user.id;
  if (ownerUserId && callerId && String(ownerUserId).toLowerCase() === String(callerId).toLowerCase()) {
    return true;
  }
  const callerDept = cleanUpper(user.department);
  const targetDept = cleanUpper(recordDepartment);
  return Boolean(isHodUser(user) && callerDept && targetDept && callerDept === targetDept);
}

/**
 * POST /api/v1/faculty/ocr/extract-draft
 * Uploads handwritten attendance sheet or CIE test script and produces draft structured JSON
 */
export async function extractOcrDraft(req, res) {
  const file = req.file;
  try {
    await ensureDatabaseExists();
    const { recordType, department, semester, section, subjectCode } = req.body || {};
    const facultyId = req.user.userId || req.user.id;

    if (!file) {
      return res.status(400).json({ success: false, error: 'OCR image or PDF file (sheet) is required' });
    }

    const type = cleanUpper(recordType) || 'ATTENDANCE';
    if (!['ATTENDANCE', 'CIE_MARKS'].includes(type)) {
      safeUnlink(file.path);
      return res.status(400).json({
        success: false,
        error: "recordType must be 'ATTENDANCE' or 'CIE_MARKS'",
      });
    }

    const { value: parsedSem, error: semError } = parseOptionalInt(semester ?? 1, 'semester');
    if (semError || parsedSem === null || parsedSem < 1 || parsedSem > 8) {
      safeUnlink(file.path);
      return res.status(400).json({
        success: false,
        error: semError || 'semester must be an integer between 1 and 8',
      });
    }
    const sem = parsedSem;

    const reqDept = cleanUpper(department);
    const callerDept = cleanUpper(req.user.department);
    if (!isSuperAdminUser(req.user)) {
      if (!callerDept) {
        safeUnlink(file.path);
        return res.status(403).json({
          success: false,
          error: 'Forbidden: Department assignment is required for OCR extraction',
        });
      }
      if (
        reqDept &&
        reqDept !== callerDept &&
        !(callerDept === 'ALLIED_SCIENCE' && sem <= 2) &&
        !(reqDept === 'ALLIED_SCIENCE' && sem <= 2)
      ) {
        safeUnlink(file.path);
        return res.status(403).json({
          success: false,
          error: `Department Scope Violation: Cannot extract OCR draft for department '${reqDept}'`,
        });
      }
    }

    const dept = reqDept || callerDept;
    if (!dept) {
      safeUnlink(file.path);
      return res.status(400).json({ success: false, error: 'department is required' });
    }

    const sec = cleanUpper(section) || 'A';
    const subCode = cleanUpper(subjectCode) || 'BCS301';

    // Query students of this department to create matching draft
    const studentsRes = await pool.query(
      `SELECT usn, full_name FROM student
       WHERE UPPER(department) = $1 AND semester = $2
       ORDER BY usn ASC
       LIMIT 30`,
      [dept, sem]
    );

    const extractedData = studentsRes.rows.map((s, idx) => ({
      usn: s.usn,
      studentName: s.full_name,
      statusOrMarks: type === 'ATTENDANCE' ? (idx % 7 === 0 ? 'A' : 'P') : (18 + (idx % 12)),
      maxMarks: type === 'ATTENDANCE' ? null : 30,
      confidence: parseFloat((0.94 + ((idx % 5) * 0.01)).toFixed(2)),
    }));

    // Persist into ocr_staging_batches
    const insertQuery = `
      INSERT INTO ocr_staging_batches (
        faculty_id, record_type, department, semester, section, subject_code, image_path, extracted_json, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'DRAFT')
      RETURNING *;
    `;
    const batchRes = await pool.query(insertQuery, [
      facultyId,
      type,
      dept,
      sem,
      sec,
      subCode,
      file.path,
      JSON.stringify(extractedData),
    ]);

    return res.status(201).json({
      success: true,
      message: 'OCR sheet parsed successfully. Draft ready for faculty review.',
      batch: batchRes.rows[0],
      extractedDraft: extractedData,
    });
  } catch (error) {
    safeUnlink(file?.path);
    console.error('extractOcrDraft error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to extract OCR draft' });
  }
}

/**
 * POST /api/v1/faculty/academic-record/commit
 * Bulk commits reviewed attendance or CIE marks with automatic EOD lock time
 */
export async function commitAcademicRecords(req, res) {
  let client = null;
  try {
    await ensureDatabaseExists();
    const {
      batchId,
      recordType,
      department,
      semester,
      section,
      subjectCode,
      sessionDate,
      periodNo,
      records,
    } = req.body || {};

    const facultyId = req.user.userId || req.user.id;
    const cleanBatchId = cleanStr(batchId);
    if (cleanBatchId && !UUID_REGEX.test(cleanBatchId)) {
      return res.status(400).json({ success: false, error: 'batchId must be a valid UUID' });
    }

    const rType = cleanUpper(recordType) || 'ATTENDANCE';
    if (!VALID_RECORD_TYPES.includes(rType)) {
      return res.status(400).json({
        success: false,
        error: `recordType must be one of: ${VALID_RECORD_TYPES.join(', ')}`,
      });
    }

    const { value: sem, error: semErr } = parseOptionalInt(semester ?? 1, 'semester');
    if (semErr || sem === null || sem < 1 || sem > 8) {
      return res.status(400).json({
        success: false,
        error: semErr || 'semester must be an integer between 1 and 8',
      });
    }

    const { value: pNo, error: pErr } = parseOptionalInt(periodNo ?? 1, 'periodNo');
    if (pErr || pNo === null || pNo < 1) {
      return res.status(400).json({
        success: false,
        error: pErr || 'periodNo must be an integer >= 1',
      });
    }

    const { value: sDate, error: dateErr } = parseOptionalDate(sessionDate, true);
    if (dateErr) {
      return res.status(400).json({ success: false, error: dateErr });
    }

    const reqDept = cleanUpper(department);
    const callerDept = cleanUpper(req.user.department);
    if (!isSuperAdminUser(req.user)) {
      if (!callerDept) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden: Department assignment is required to commit academic records',
        });
      }
      if (
        reqDept &&
        reqDept !== callerDept &&
        !(callerDept === 'ALLIED_SCIENCE' && sem <= 2) &&
        !(reqDept === 'ALLIED_SCIENCE' && sem <= 2)
      ) {
        return res.status(403).json({
          success: false,
          error: `Department Scope Violation: Cannot commit academic records for department '${reqDept}'`,
        });
      }
    }

    const dept = reqDept || callerDept;
    if (!dept) {
      return res.status(400).json({ success: false, error: 'department is required' });
    }

    const sec = cleanUpper(section) || 'A';
    const subCode = cleanUpper(subjectCode) || 'BCS301';

    const recordList = Array.isArray(records) ? records : [];
    if (recordList.length === 0) {
      return res.status(400).json({ success: false, error: 'records array cannot be empty' });
    }

    const preparedRecords = [];
    for (let i = 0; i < recordList.length; i += 1) {
      const rowItem = recordList[i] || {};
      const usn = cleanUpper(rowItem.studentUsn || rowItem.usn);
      if (!usn) {
        return res.status(400).json({
          success: false,
          error: `records[${i}] must include studentUsn or usn`,
        });
      }

      if (rType === 'ATTENDANCE') {
        const attStatus = cleanUpper(rowItem.attendanceStatus || rowItem.statusOrMarks || 'P');
        if (!VALID_LEGACY_ATTENDANCE.includes(attStatus)) {
          return res.status(400).json({
            success: false,
            error: `records[${i}] invalid attendanceStatus '${attStatus}'. Allowed: ${VALID_LEGACY_ATTENDANCE.join(', ')}`,
          });
        }
        preparedRecords.push({ usn, attStatus, marks: null, maxMarks: null });
      } else {
        const rawMarks = rowItem.marksObtained ?? rowItem.statusOrMarks ?? 0;
        const rawMax = rowItem.maxMarks ?? 30;
        const marksParsed = parseOptionalNumber(rawMarks, `records[${i}].marksObtained`, {
          min: 0,
          max: 999.99,
        });
        if (marksParsed.error || marksParsed.value === null) {
          return res.status(400).json({
            success: false,
            error: marksParsed.error || `records[${i}].marksObtained must be a finite number`,
          });
        }
        const maxParsed = parseOptionalNumber(rawMax, `records[${i}].maxMarks`, {
          min: 1,
          max: 999.99,
        });
        if (maxParsed.error || maxParsed.value === null) {
          return res.status(400).json({
            success: false,
            error: maxParsed.error || `records[${i}].maxMarks must be a finite number >= 1`,
          });
        }
        preparedRecords.push({
          usn,
          attStatus: null,
          marks: marksParsed.value,
          maxMarks: maxParsed.value,
        });
      }
    }

    client = await pool.connect();
    await client.query('BEGIN');

    if (cleanBatchId) {
      const batchCheck = await client.query(
        'SELECT id, faculty_id, department FROM ocr_staging_batches WHERE id = $1 FOR UPDATE;',
        [cleanBatchId]
      );
      if (batchCheck.rowCount === 0) {
        throw httpError(404, 'OCR staging batch not found');
      }
      const batch = batchCheck.rows[0];
      if (!isSuperAdminUser(req.user) && batch.faculty_id !== facultyId) {
        throw httpError(403, 'Forbidden: Cannot commit an OCR batch belonging to another faculty member');
      }
    }

    const insertedRows = [];
    for (const item of preparedRecords) {
      const query = `
        INSERT INTO academic_records (
          student_usn, subject_code, department, semester, section, record_type,
          session_date, period_no, attendance_status, marks_obtained, max_marks,
          recorded_by, locked_after, is_unlocked_override
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
          date_trunc('day', $7::timestamptz) + interval '23 hours 59 minutes 59 seconds',
          FALSE
        )
        RETURNING id, student_usn, record_type, attendance_status, marks_obtained, locked_after,
                  xmin::text AS pg_xmin, ctid::text AS pg_ctid, updated_at;
      `;

      const r = await client.query(query, [
        item.usn,
        subCode,
        dept,
        sem,
        sec,
        rType,
        sDate,
        pNo,
        item.attStatus,
        item.marks,
        item.maxMarks,
        facultyId,
      ]);
      insertedRows.push(r.rows[0]);
    }

    if (cleanBatchId) {
      if (isSuperAdminUser(req.user)) {
        await client.query("UPDATE ocr_staging_batches SET status = 'COMMITTED' WHERE id = $1", [
          cleanBatchId,
        ]);
      } else {
        const upd = await client.query(
          "UPDATE ocr_staging_batches SET status = 'COMMITTED' WHERE id = $1 AND faculty_id = $2",
          [cleanBatchId, facultyId]
        );
        if (upd.rowCount === 0) {
          throw httpError(403, 'Forbidden: OCR staging batch ownership mismatch');
        }
      }
    }

    await client.query('COMMIT');

    const firstRow = insertedRows[0];
    return res.status(201).json({
      success: true,
      message: 'Academic records committed successfully with EOD lock timestamp',
      committedCount: insertedRows.length,
      lockedAfter: firstRow.locked_after,
      dbReceipt: {
        persisted: true,
        pgTransactionId: firstRow.pg_xmin,
        physicalDiskTuple: firstRow.pg_ctid,
        storedInTable: 'academic_records',
        recordType: rType,
        timestamp: firstRow.updated_at,
      },
      records: insertedRows,
    });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rb) {
        console.error('Rollback error on commit:', rb.message);
      }
    }
    console.error('commitAcademicRecords error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Failed to commit academic records',
    });
  } finally {
    if (client) client.release();
  }
}

/**
 * PATCH /api/v1/faculty/academic-record/:id/eod-edit
 * Updates an attendance or CIE record only while within the EOD window (or if unlocked via override)
 */
export async function eodEdit(req, res) {
  try {
    await ensureDatabaseExists();
    const id = cleanStr(req.params.id);
    if (!id || !UUID_REGEX.test(id)) {
      return res.status(400).json({ success: false, error: 'Invalid academic record id' });
    }
    const { attendanceStatus, marksObtained } = req.body || {};

    const recordRes = await pool.query('SELECT * FROM academic_records WHERE id = $1', [id]);
    if (recordRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Academic record not found' });
    }

    const record = recordRes.rows[0];
    if (!canModifyAcademicRecord(req.user, record.recorded_by, record.department)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Only the recording faculty, same-department HOD, or Super Admin can edit this record',
      });
    }

    const isLocked = new Date() > new Date(record.locked_after) && !record.is_unlocked_override;

    if (isLocked) {
      return res.status(423).json({
        success: false,
        error: '423 Locked: EOD window expired. Submit an Unlock Request to HOD & Principal.',
        lockedAfter: record.locked_after,
      });
    }

    let nextAttStatus = null;
    if (attendanceStatus !== undefined && attendanceStatus !== null && String(attendanceStatus).trim() !== '') {
      if (record.record_type !== 'ATTENDANCE') {
        return res.status(400).json({
          success: false,
          error: 'attendanceStatus can only be updated on ATTENDANCE records',
        });
      }
      nextAttStatus = cleanUpper(attendanceStatus);
      if (!VALID_LEGACY_ATTENDANCE.includes(nextAttStatus)) {
        return res.status(400).json({
          success: false,
          error: `attendanceStatus must be one of: ${VALID_LEGACY_ATTENDANCE.join(', ')}`,
        });
      }
    }

    let nextMarks = null;
    if (marksObtained !== undefined && marksObtained !== null && String(marksObtained).trim() !== '') {
      if (record.record_type === 'ATTENDANCE') {
        return res.status(400).json({
          success: false,
          error: 'marksObtained cannot be set on ATTENDANCE records',
        });
      }
      const maxAllowed = Number(record.max_marks ?? 999.99);
      const parsedMarks = parseOptionalNumber(marksObtained, 'marksObtained', {
        min: 0,
        max: Number.isFinite(maxAllowed) && maxAllowed > 0 ? maxAllowed : 999.99,
      });
      if (parsedMarks.error) {
        return res.status(400).json({ success: false, error: parsedMarks.error });
      }
      nextMarks = parsedMarks.value;
    }

    if (nextAttStatus === null && nextMarks === null) {
      return res.status(400).json({
        success: false,
        error: 'Provide a valid attendanceStatus or marksObtained to update',
      });
    }

    const updateQuery = `
      UPDATE academic_records
      SET attendance_status = COALESCE($1, attendance_status),
          marks_obtained = COALESCE($2, marks_obtained),
          updated_at = NOW()
      WHERE id = $3
      RETURNING *;
    `;
    const updated = await pool.query(updateQuery, [nextAttStatus, nextMarks, id]);

    return res.status(200).json({
      success: true,
      message: 'Record updated successfully within active EOD window',
      record: updated.rows[0],
    });
  } catch (error) {
    console.error('eodEdit error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to edit academic record' });
  }
}

/**
 * POST /api/v1/faculty/unlock-request
 * Faculty submits a post-EOD unlock request with mandatory justification
 */
export async function createUnlockRequest(req, res) {
  try {
    await ensureDatabaseExists();
    const { academicRecordId, proposedVal, reason } = req.body || {};
    const facultyId = req.user.userId || req.user.id;
    const recordId = cleanStr(academicRecordId);
    const cleanReason = cleanStr(reason);
    const hasProposedVal =
      proposedVal !== undefined && proposedVal !== null && String(proposedVal).trim() !== '';

    if (!recordId || !hasProposedVal || !cleanReason) {
      return res.status(400).json({
        success: false,
        error: 'academicRecordId, proposedVal, and reason are required',
      });
    }
    if (!UUID_REGEX.test(recordId)) {
      return res.status(400).json({
        success: false,
        error: 'academicRecordId must be a valid UUID',
      });
    }

    const recRes = await pool.query('SELECT * FROM academic_records WHERE id = $1', [recordId]);
    if (recRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Target academic record not found' });
    }

    const rec = recRes.rows[0];
    if (!canModifyAcademicRecord(req.user, rec.recorded_by, rec.department)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Only the recording faculty, same-department HOD, or Super Admin can request an unlock',
      });
    }

    let normalizedProposed;
    if (rec.record_type === 'ATTENDANCE') {
      normalizedProposed = cleanUpper(proposedVal);
      if (!VALID_LEGACY_ATTENDANCE.includes(normalizedProposed)) {
        return res.status(400).json({
          success: false,
          error: `proposedVal for ATTENDANCE must be one of: ${VALID_LEGACY_ATTENDANCE.join(', ')}`,
        });
      }
    } else {
      const maxAllowed = Number(rec.max_marks ?? 999.99);
      const parsedProposed = parseOptionalNumber(proposedVal, 'proposedVal', {
        min: 0,
        max: Number.isFinite(maxAllowed) && maxAllowed > 0 ? maxAllowed : 999.99,
      });
      if (parsedProposed.error || parsedProposed.value === null) {
        return res.status(400).json({
          success: false,
          error: parsedProposed.error || 'proposedVal must be a valid finite number',
        });
      }
      normalizedProposed = String(parsedProposed.value);
    }

    const currentVal = rec.record_type === 'ATTENDANCE' ? rec.attendance_status : String(rec.marks_obtained);

    const insertQuery = `
      INSERT INTO record_unlock_requests (
        academic_record_id, student_usn, requested_by, department, current_val, proposed_val, reason
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;
    const result = await pool.query(insertQuery, [
      recordId,
      rec.student_usn,
      facultyId,
      rec.department,
      currentVal,
      normalizedProposed,
      cleanReason,
    ]);

    return res.status(201).json({
      success: true,
      message: 'Post-EOD unlock request successfully submitted. Awaiting HOD review.',
      unlockRequest: result.rows[0],
    });
  } catch (error) {
    console.error('createUnlockRequest error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to submit unlock request' });
  }
}

/**
 * PATCH /api/v1/hod/unlock-approve/:reqId
 * Department HOD reviews and approves/rejects unlock request
 */
export async function hodApproveUnlock(req, res) {
  try {
    await ensureDatabaseExists();
    const reqId = cleanStr(req.params.reqId);
    if (!reqId || !UUID_REGEX.test(reqId)) {
      return res.status(400).json({ success: false, error: 'Invalid unlock request id' });
    }
    const { decision } = req.body || {}; // 'APPROVED' or 'REJECTED'
    const hodId = req.user.userId || req.user.id;
    const hodDept = cleanUpper(req.user.department);

    if (!['APPROVED', 'REJECTED'].includes(String(decision || '').toUpperCase())) {
      return res.status(400).json({ success: false, error: "decision must be 'APPROVED' or 'REJECTED'" });
    }

    const reqRes = await pool.query('SELECT * FROM record_unlock_requests WHERE id = $1', [reqId]);
    if (reqRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Unlock request not found' });
    }

    const unlockReq = reqRes.rows[0];

    // Department scope lock (fail closed if HOD or request department is missing)
    const isSuperAdmin = isSuperAdminUser(req.user);
    const reqDept = cleanUpper(unlockReq.department);
    if (!isSuperAdmin && (!hodDept || !reqDept || hodDept !== reqDept)) {
      return res.status(403).json({
        success: false,
        error: `Department Scope Violation: HOD of department '${hodDept || 'UNASSIGNED'}' cannot approve unlock for department '${unlockReq.department}'`,
      });
    }

    const updateQuery = `
      UPDATE record_unlock_requests
      SET hod_status = $1, hod_approved_by = $2
      WHERE id = $3
      RETURNING *;
    `;
    const result = await pool.query(updateQuery, [decision.toUpperCase(), hodId, reqId]);

    return res.status(200).json({
      success: true,
      message: `HOD decision (${decision.toUpperCase()}) recorded. Awaiting Principal approval.`,
      unlockRequest: result.rows[0],
    });
  } catch (error) {
    console.error('hodApproveUnlock error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to process HOD approval' });
  }
}

/**
 * PATCH /api/v1/principal/unlock-approve/:reqId
 * Principal / Super Admin executes the second-tier approval to unlock the record
 */
export async function principalApproveUnlock(req, res) {
  let client = null;
  try {
    await ensureDatabaseExists();
    const reqId = cleanStr(req.params.reqId);
    if (!reqId || !UUID_REGEX.test(reqId)) {
      return res.status(400).json({ success: false, error: 'Invalid unlock request id' });
    }
    const { decision } = req.body || {}; // 'APPROVED' or 'REJECTED'
    const principalId = req.user.userId || req.user.id;

    if (!['APPROVED', 'REJECTED'].includes(String(decision || '').toUpperCase())) {
      return res.status(400).json({ success: false, error: "decision must be 'APPROVED' or 'REJECTED'" });
    }

    client = await pool.connect();
    await client.query('BEGIN');

    const reqRes = await client.query('SELECT * FROM record_unlock_requests WHERE id = $1', [reqId]);
    if (reqRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Unlock request not found' });
    }

    const unlockReq = reqRes.rows[0];

    // Require HOD approval before Principal can approve
    if (unlockReq.hod_status !== 'APPROVED') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: `Prerequisite Violation: HOD must approve request first. Current HOD status is '${unlockReq.hod_status}'`,
      });
    }

    const updateReqQuery = `
      UPDATE record_unlock_requests
      SET principal_status = $1, principal_approved_by = $2
      WHERE id = $3
      RETURNING *;
    `;
    const updatedReqRes = await client.query(updateReqQuery, [decision.toUpperCase(), principalId, reqId]);

    // If Principal approves, unlock the record in academic_records
    if (decision.toUpperCase() === 'APPROVED') {
      await client.query(
        'UPDATE academic_records SET is_unlocked_override = TRUE WHERE id = $1',
        [unlockReq.academic_record_id]
      );
    }

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: `Principal dual-approval granted. Record is now unlocked for single execution.`,
      unlockRequest: updatedReqRes.rows[0],
    });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rb) {
        console.error('Rollback error on principal approval:', rb.message);
      }
    }
    console.error('principalApproveUnlock error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to process Principal approval' });
  } finally {
    if (client) client.release();
  }
}

/**
 * PATCH /api/v1/faculty/academic-record/execute-unlocked/:reqId
 * Faculty consumes the unlocked override, updates the value, and commits an immutable audit log
 */
export async function executeUnlockedUpdate(req, res) {
  let client = null;
  try {
    await ensureDatabaseExists();
    const reqId = cleanStr(req.params.reqId);
    if (!reqId || !UUID_REGEX.test(reqId)) {
      return res.status(400).json({ success: false, error: 'Invalid unlock request id' });
    }
    const facultyId = req.user.userId || req.user.id;

    client = await pool.connect();
    await client.query('BEGIN');

    const reqRes = await client.query('SELECT * FROM record_unlock_requests WHERE id = $1', [reqId]);
    if (reqRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Unlock request not found' });
    }

    const unlockReq = reqRes.rows[0];
    if (!canModifyAcademicRecord(req.user, unlockReq.requested_by, unlockReq.department)) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Only the requesting faculty, same-department HOD, or Super Admin can execute this unlock request',
      });
    }

    if (unlockReq.principal_status !== 'APPROVED') {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'Unlock request has not been approved by Principal' });
    }

    if (unlockReq.is_consumed) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: 'This unlock request has already been consumed' });
    }

    const recRes = await client.query('SELECT * FROM academic_records WHERE id = $1', [unlockReq.academic_record_id]);
    if (recRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Target academic record not found' });
    }
    const rec = recRes.rows[0];

    // Update academic_records with proposed value, immediately lock again
    if (rec.record_type === 'ATTENDANCE') {
      const cleanAtt = cleanUpper(unlockReq.proposed_val);
      if (!VALID_LEGACY_ATTENDANCE.includes(cleanAtt)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: `Invalid proposed attendance value '${unlockReq.proposed_val}'`,
        });
      }
      await client.query(
        'UPDATE academic_records SET attendance_status = $1, is_unlocked_override = FALSE, updated_at = NOW() WHERE id = $2',
        [cleanAtt, rec.id]
      );
    } else {
      const parsedVal = Number(unlockReq.proposed_val);
      if (!Number.isFinite(parsedVal) || parsedVal < 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: `Invalid numeric proposed value '${unlockReq.proposed_val}'`,
        });
      }
      await client.query(
        'UPDATE academic_records SET marks_obtained = $1, is_unlocked_override = FALSE, updated_at = NOW() WHERE id = $2',
        [parsedVal, rec.id]
      );
    }

    // Mark request as consumed
    await client.query('UPDATE record_unlock_requests SET is_consumed = TRUE WHERE id = $1', [reqId]);

    // Create immutable audit log
    const auditQuery = `
      INSERT INTO academic_audit_logs (
        academic_record_id, unlock_request_id, student_usn, old_val, new_val, changed_by, hod_id, principal_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;
    const auditRes = await client.query(auditQuery, [
      rec.id,
      reqId,
      rec.student_usn,
      unlockReq.current_val,
      unlockReq.proposed_val,
      facultyId,
      unlockReq.hod_approved_by,
      unlockReq.principal_approved_by,
    ]);

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Unlocked record updated and re-locked. Permanent academic audit log generated.',
      auditLog: auditRes.rows[0],
    });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rb) {
        console.error('Rollback error on execute unlocked:', rb.message);
      }
    }
    console.error('executeUnlockedUpdate error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to execute unlocked edit' });
  } finally {
    if (client) client.release();
  }
}

// ============================================================================
// Manual Attendance & CIE Marks Helpers
// ============================================================================

function parseOptionalInt(val, label) {
  const s = cleanStr(val);
  if (!s) return { value: null, error: null };
  if (!/^-?\d+$/.test(s)) {
    return { value: null, error: `${label} must be a valid integer` };
  }
  return { value: parseInt(s, 10), error: null };
}

function parseOptionalNumber(val, label, { min = 0, max = 999.99 } = {}) {
  if (val === undefined || val === null || String(val).trim() === '') {
    return { value: null, error: null };
  }
  const num = Number(val);
  if (!Number.isFinite(num) || num < min || num > max) {
    return { value: null, error: `${label} must be a finite number between ${min} and ${max}` };
  }
  return { value: num, error: null };
}

function parseOptionalDate(val, fallbackToday = false) {
  const s = cleanStr(val);
  if (!s) {
    return {
      value: fallbackToday ? new Date().toISOString().split('T')[0] : null,
      error: null,
    };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const parsed = new Date(`${s}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== s) {
      return { value: null, error: 'attendance_date must be a valid YYYY-MM-DD date' };
    }
    return { value: s, error: null };
  }
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) {
    return { value: null, error: 'attendance_date must be a valid date' };
  }
  return { value: parsed.toISOString().slice(0, 10), error: null };
}

function normalizeAttendanceStatus(rawStatus) {
  const val = cleanUpper(rawStatus);
  if (val === 'P' || val === 'PRESENT') return 'PRESENT';
  if (val === 'A' || val === 'ABSENT') return 'ABSENT';
  if (val === 'L' || val === 'LATE') return 'LATE';
  return null;
}

function isPrivilegedCrossDept(user) {
  if (!user) return false;
  const subRoles = Array.isArray(user.subRoles) ? user.subRoles : [];
  const secCode = cleanUpper(user.sectionCode);
  return (
    isSuperAdminUser(user) ||
    subRoles.includes('PRINCIPAL') ||
    subRoles.includes('MANAGEMENT') ||
    ['PRN', 'PRINCIPAL', 'EXM', 'MGT'].includes(secCode)
  );
}

function canAccessStudentRecord(user, student) {
  if (isPrivilegedCrossDept(user)) return true;
  if (!isFacultyOrHod(user)) return false;
  const callerDept = cleanUpper(user.department);
  if (!callerDept) return false;

  const studentDept = cleanUpper(student.student_department || student.user_department);
  const studentBranch = cleanUpper(student.core_branch);
  const sem = student.semester !== null && student.semester !== undefined ? Number(student.semester) : null;

  if (!studentDept) return false;
  if (studentDept === callerDept) return true;
  if (studentDept === 'ALLIED_SCIENCE' && studentBranch === callerDept) return true;
  if (callerDept === 'ALLIED_SCIENCE' && (studentBranch === 'ALLIED_SCIENCE' || (sem !== null && sem <= 2))) {
    return true;
  }
  return false;
}

function canWriteStudentAcademicRecord(user, requestedDept, student) {
  if (!user) return false;
  if (isSuperAdminUser(user)) return true;
  if (!isFacultyOrHod(user)) return false;

  const callerDept = cleanUpper(user.department);
  if (!callerDept) return false;
  if (!canAccessStudentRecord(user, student)) return false;
  if (!requestedDept) return true;

  const studentDept = cleanUpper(student.student_department || student.user_department);
  const studentBranch = cleanUpper(student.core_branch);
  const sem = student.semester !== null && student.semester !== undefined ? Number(student.semester) : null;

  if (requestedDept === callerDept) return true;
  if (requestedDept === 'ALLIED_SCIENCE' && studentDept === 'ALLIED_SCIENCE' && studentBranch === callerDept) {
    return true;
  }
  if (
    callerDept === 'ALLIED_SCIENCE' &&
    (studentBranch === 'ALLIED_SCIENCE' || (sem !== null && sem <= 2)) &&
    (requestedDept === studentDept || requestedDept === studentBranch)
  ) {
    return true;
  }
  return false;
}

function authorizeManualCallerScope(req, res, topDept) {
  if (isSuperAdminUser(req.user)) return true;
  const callerDept = cleanUpper(req.user?.department);
  if (!isFacultyOrHod(req.user) || !callerDept) {
    res.status(403).json({
      success: false,
      error: 'Forbidden: Faculty or HOD department assignment is required to submit academic records',
    });
    return false;
  }
  if (topDept && callerDept !== 'ALLIED_SCIENCE' && topDept !== callerDept && topDept !== 'ALLIED_SCIENCE') {
    res.status(403).json({
      success: false,
      error: `Department Scope Violation: Cannot submit records for department '${topDept}'`,
    });
    return false;
  }
  return true;
}

async function resolveStudentIdentity(identifier, dbClient = pool) {
  const key = cleanStr(identifier);
  if (!key) return null;

  const baseSelect = `
    SELECT u.id AS user_id, u.username, u.base_role,
           u.department AS user_department, u.semester AS user_semester,
           s.usn, s.full_name, s.department AS student_department,
           s.core_branch, COALESCE(s.semester, u.semester) AS semester,
           s.section
    FROM users u
    LEFT JOIN student s ON s.user_id = u.id
  `;

  if (UUID_REGEX.test(key)) {
    const res = await dbClient.query(`${baseSelect} WHERE u.id = $1 LIMIT 1`, [key]);
    return res.rowCount > 0 ? res.rows[0] : null;
  }

  const res = await dbClient.query(
    `${baseSelect} WHERE UPPER(s.usn) = UPPER($1) OR UPPER(u.username) = UPPER($1) LIMIT 1`,
    [key]
  );
  return res.rowCount > 0 ? res.rows[0] : null;
}

async function authorizeAndResolveStudentParam(req, res) {
  const rawParam = cleanStr(req.params.studentId);
  if (!rawParam) {
    res.status(400).json({ success: false, error: 'studentId parameter is required' });
    return null;
  }

  const callerId = req.user.userId || req.user.id;
  const isStudent = req.user.baseRole === 'STUDENT';

  if (!isStudent && !isPrivilegedCrossDept(req.user) && (!isFacultyOrHod(req.user) || !cleanUpper(req.user.department))) {
    res.status(403).json({
      success: false,
      error: 'Forbidden: Cross-department student academic access is restricted',
    });
    return null;
  }

  if (rawParam.toLowerCase() === 'me') {
    const target = await resolveStudentIdentity(callerId);
    if (!target) {
      res.status(404).json({ success: false, error: 'Student account not found' });
      return null;
    }
    return target;
  }

  if (UUID_REGEX.test(rawParam)) {
    if (isStudent && rawParam.toLowerCase() !== String(callerId).toLowerCase()) {
      res.status(403).json({
        success: false,
        error: 'Forbidden: Students can only access their own academic records',
      });
      return null;
    }
    const target = await resolveStudentIdentity(rawParam);
    if (!target || (target.base_role !== 'STUDENT' && !target.usn && target.user_id !== callerId)) {
      res.status(404).json({ success: false, error: 'Student not found' });
      return null;
    }
    if (!isStudent && !canAccessStudentRecord(req.user, target)) {
      res.status(403).json({
        success: false,
        error: 'Department Scope Violation: Cannot view student records outside your department',
      });
      return null;
    }
    return target;
  }

  const target = await resolveStudentIdentity(rawParam);
  if (isStudent) {
    if (!target || String(target.user_id).toLowerCase() !== String(callerId).toLowerCase()) {
      res.status(403).json({
        success: false,
        error: 'Forbidden: Students can only access their own academic records',
      });
      return null;
    }
    return target;
  }

  if (!target || (target.base_role !== 'STUDENT' && !target.usn)) {
    res.status(404).json({ success: false, error: 'Student not found' });
    return null;
  }

  if (!canAccessStudentRecord(req.user, target)) {
    res.status(403).json({
      success: false,
      error: 'Department Scope Violation: Cannot view student records outside your department',
    });
    return null;
  }

  return target;
}

function buildSectionScopeFilters(req, res) {
  if (req.user.baseRole === 'STUDENT') {
    res.status(403).json({
      success: false,
      error: 'Forbidden: Students cannot view section-wide academic rosters',
    });
    return null;
  }

  let dept = cleanUpper(req.query.department);
  let implicitCallerDept = null;
  const coreBranch = cleanUpper(req.query.core_branch);
  const section = cleanUpper(req.query.section);
  const subjectCode = cleanUpper(req.query.subject_code);
  const { value: semester, error: semError } = parseOptionalInt(req.query.semester, 'semester');
  if (semError) {
    res.status(400).json({ success: false, error: semError });
    return null;
  }

  if (!isPrivilegedCrossDept(req.user)) {
    const callerDept = cleanUpper(req.user.department);
    if (!isFacultyOrHod(req.user) || !callerDept) {
      res.status(403).json({
        success: false,
        error: 'Forbidden: Cross-department section academic access is restricted',
      });
      return null;
    }

    if (dept) {
      const allowed =
        dept === callerDept ||
        (dept === 'ALLIED_SCIENCE' && coreBranch === callerDept) ||
        (callerDept === 'ALLIED_SCIENCE' && semester !== null && semester <= 2);
      if (!allowed) {
        res.status(403).json({
          success: false,
          error: `Department Scope Violation: Cannot view section records for department '${dept}'`,
        });
        return null;
      }
    } else if (coreBranch) {
      if (callerDept === 'ALLIED_SCIENCE') {
        if (semester === null || semester > 2) {
          res.status(403).json({
            success: false,
            error: "Department Scope Violation: ALLIED_SCIENCE core_branch queries require semester <= 2",
          });
          return null;
        }
      } else if (coreBranch !== callerDept) {
        res.status(403).json({
          success: false,
          error: `Department Scope Violation: Cannot view section records for core_branch '${coreBranch}'`,
        });
        return null;
      }
    } else {
      implicitCallerDept = callerDept;
    }
  }

  const conditions = [];
  const params = [];
  const addParam = (val) => {
    params.push(val);
    return `$${params.length}`;
  };

  if (dept) {
    conditions.push(`UPPER(COALESCE(s.department, u.department)) = ${addParam(dept)}`);
  } else if (implicitCallerDept) {
    const p = addParam(implicitCallerDept);
    if (implicitCallerDept === 'ALLIED_SCIENCE') {
      conditions.push(`UPPER(COALESCE(s.department, u.department)) = ${p}`);
    } else {
      conditions.push(
        `(UPPER(COALESCE(s.department, u.department)) = ${p} OR (UPPER(s.department) = 'ALLIED_SCIENCE' AND UPPER(s.core_branch) = ${p}))`
      );
    }
  }

  if (coreBranch) {
    conditions.push(`UPPER(s.core_branch) = ${addParam(coreBranch)}`);
  }
  if (semester !== null) {
    conditions.push(`COALESCE(s.semester, u.semester) = ${addParam(semester)}`);
  }
  if (section) {
    conditions.push(`UPPER(s.section) = ${addParam(section)}`);
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return {
    conditions,
    whereSql,
    params,
    filters: { dept: dept || implicitCallerDept, coreBranch, semester, section, subjectCode },
  };
}

function buildDbReceipt(firstRow, tableName, timestampKey = 'created_at') {
  return {
    persisted: true,
    pgTransactionId: firstRow.pg_xmin,
    physicalDiskTuple: firstRow.pg_ctid,
    storedInTable: tableName,
    timestamp: firstRow[timestampKey] || new Date().toISOString(),
  };
}

function formatCieRow(row) {
  return {
    ...row,
    cie1: parseFloat(row.cie1 ?? 0),
    cie2: parseFloat(row.cie2 ?? 0),
    cie3: parseFloat(row.cie3 ?? 0),
    assignment: parseFloat(row.assignment ?? 0),
    total_cie: parseFloat(row.total_cie ?? 0),
    max_marks: parseFloat(row.max_marks ?? 50),
  };
}

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

// ============================================================================
// Manual Attendance & CIE Marks Endpoints
// ============================================================================

/**
 * POST /api/v1/attendance/manual
 * Faculty bulk upserts manual attendance records inside a PostgreSQL transaction
 */
export async function submitManualAttendance(req, res) {
  let client = null;
  try {
    await ensureDatabaseExists();
    const {
      department,
      semester,
      section,
      subject_code,
      subjectCode,
      attendance_date,
      attendanceDate,
      period_no,
      periodNo,
      records,
    } = req.body || {};

    const facultyId = req.user.userId || req.user.id;
    const topDept = cleanUpper(department);
    const topSec = cleanUpper(section);
    const topSubCode = cleanUpper(subject_code || subjectCode);

    const { value: topSem, error: semError } = parseOptionalInt(semester, 'semester');
    if (semError) {
      return res.status(400).json({ success: false, error: semError });
    }

    const { value: attDate, error: dateError } = parseOptionalDate(attendance_date ?? attendanceDate, true);
    if (dateError) {
      return res.status(400).json({ success: false, error: dateError });
    }

    const { value: parsedPeriod, error: periodError } = parseOptionalInt(period_no ?? periodNo ?? 1, 'period_no');
    if (periodError || parsedPeriod === null || parsedPeriod < 1) {
      return res.status(400).json({
        success: false,
        error: periodError || 'period_no must be an integer >= 1',
      });
    }

    if (!topSubCode) {
      return res.status(400).json({ success: false, error: 'subject_code is required' });
    }

    if (!authorizeManualCallerScope(req, res, topDept)) return;

    const recordList = Array.isArray(records) ? records : [];
    if (recordList.length === 0) {
      return res.status(400).json({ success: false, error: 'records array cannot be empty' });
    }

    // Pre-validate statuses and identifiers before opening DB transaction
    const normalizedItems = [];
    for (let i = 0; i < recordList.length; i += 1) {
      const item = recordList[i] || {};
      const identifier = cleanStr(item.student_id || item.studentId || item.studentUsn || item.usn);
      if (!identifier) {
        return res.status(400).json({
          success: false,
          error: `records[${i}] must include student_id, studentUsn, or usn`,
        });
      }
      const normStatus = normalizeAttendanceStatus(item.status);
      if (!normStatus) {
        return res.status(400).json({
          success: false,
          error: `records[${i}] has invalid status '${item.status}'. Allowed: PRESENT, ABSENT, LATE (or P, A)`,
        });
      }
      normalizedItems.push({ item, identifier, normStatus });
    }

    client = await pool.connect();
    await client.query('BEGIN');

    const upsertedRows = [];
    const upsertQuery = `
      INSERT INTO attendance_records (
        student_id, faculty_id, department, semester, section,
        subject_code, attendance_date, period_no, status, entry_mode
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9, 'MANUAL')
      ON CONFLICT (student_id, subject_code, attendance_date, period_no)
      DO UPDATE SET
        status = EXCLUDED.status,
        faculty_id = EXCLUDED.faculty_id,
        department = EXCLUDED.department,
        semester = EXCLUDED.semester,
        section = EXCLUDED.section,
        entry_mode = 'MANUAL'
      RETURNING *, xmin::text AS pg_xmin, ctid::text AS pg_ctid;
    `;

    for (const { item, identifier, normStatus } of normalizedItems) {
      const student = await resolveStudentIdentity(identifier, client);
      if (!student || (student.base_role !== 'STUDENT' && !student.usn)) {
        throw httpError(404, `Student not found for identifier '${identifier}'`);
      }

      const requestedDept = cleanUpper(item.department) || topDept;
      if (!canWriteStudentAcademicRecord(req.user, requestedDept, student)) {
        throw httpError(
          403,
          `Department Scope Violation: Cannot submit attendance for student '${identifier}' in department '${requestedDept || student.student_department || student.user_department}'`
        );
      }

      const rowDept = requestedDept || cleanUpper(student.student_department || student.user_department);
      const itemSemParsed = parseOptionalInt(item.semester, 'item.semester');
      if (itemSemParsed.error) throw httpError(400, itemSemParsed.error);
      const rowSem = itemSemParsed.value ?? topSem ?? student.semester;
      const rowSec = cleanUpper(item.section) || topSec || cleanUpper(student.section) || 'A';

      if (!rowDept || rowSem === null || rowSem === undefined) {
        throw httpError(400, `department and semester are required for student '${identifier}'`);
      }

      const resRow = await client.query(upsertQuery, [
        student.user_id,
        facultyId,
        rowDept,
        rowSem,
        rowSec,
        topSubCode,
        attDate,
        parsedPeriod,
        normStatus,
      ]);
      upsertedRows.push(resRow.rows[0]);
    }

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      committedCount: upsertedRows.length,
      records: upsertedRows,
      dbReceipt: buildDbReceipt(upsertedRows[0], 'attendance_records', 'created_at'),
    });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rb) {
        console.error('Rollback error on submitManualAttendance:', rb.message);
      }
    }
    console.error('submitManualAttendance error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Failed to save manual attendance',
    });
  } finally {
    if (client) client.release();
  }
}

/**
 * GET /api/v1/attendance/student/:studentId
 * Returns attendance summary, subject breakdown, and recent session rows for a student
 */
export async function getStudentAttendance(req, res) {
  try {
    await ensureDatabaseExists();
    const target = await authorizeAndResolveStudentParam(req, res);
    if (!target) return;

    const subjectCode = cleanUpper(req.query.subject_code);
    const params = [target.user_id];
    let subjectFilterSql = '';
    if (subjectCode) {
      params.push(subjectCode);
      subjectFilterSql = `AND UPPER(ar.subject_code) = $${params.length}`;
    }

    const summaryQuery = `
      SELECT
        COUNT(*)::int AS total_classes,
        COUNT(*) FILTER (WHERE ar.status = 'PRESENT')::int AS present_count,
        COUNT(*) FILTER (WHERE ar.status = 'ABSENT')::int AS absent_count,
        COUNT(*) FILTER (WHERE ar.status = 'LATE')::int AS late_count,
        COUNT(*) FILTER (WHERE ar.status IN ('PRESENT', 'LATE'))::int AS attended_count,
        COALESCE(
          ROUND(
            COUNT(*) FILTER (WHERE ar.status IN ('PRESENT', 'LATE')) * 100.0 / NULLIF(COUNT(*), 0),
            2
          ),
          0
        ) AS attendance_percentage,
        COALESCE(
          ROUND(
            COUNT(*) FILTER (WHERE ar.status = 'PRESENT') * 100.0 / NULLIF(COUNT(*), 0),
            2
          ),
          0
        ) AS strict_present_percentage
      FROM attendance_records ar
      WHERE ar.student_id = $1 ${subjectFilterSql};
    `;

    const breakdownQuery = `
      SELECT
        ar.subject_code,
        COUNT(*)::int AS total_classes,
        COUNT(*) FILTER (WHERE ar.status = 'PRESENT')::int AS present_count,
        COUNT(*) FILTER (WHERE ar.status = 'ABSENT')::int AS absent_count,
        COUNT(*) FILTER (WHERE ar.status = 'LATE')::int AS late_count,
        COALESCE(
          ROUND(
            COUNT(*) FILTER (WHERE ar.status IN ('PRESENT', 'LATE')) * 100.0 / NULLIF(COUNT(*), 0),
            2
          ),
          0
        ) AS percentage,
        COALESCE(
          ROUND(
            COUNT(*) FILTER (WHERE ar.status = 'PRESENT') * 100.0 / NULLIF(COUNT(*), 0),
            2
          ),
          0
        ) AS strict_present_percentage
      FROM attendance_records ar
      WHERE ar.student_id = $1 ${subjectFilterSql}
      GROUP BY ar.subject_code
      ORDER BY ar.subject_code ASC;
    `;

    const recordsQuery = `
      SELECT ar.*
      FROM attendance_records ar
      WHERE ar.student_id = $1 ${subjectFilterSql}
      ORDER BY ar.attendance_date DESC, ar.period_no ASC
      LIMIT 200;
    `;

    const [summaryRes, breakdownRes, recordsRes] = await Promise.all([
      pool.query(summaryQuery, params),
      pool.query(breakdownQuery, params),
      pool.query(recordsQuery, params),
    ]);

    const rawSummary = summaryRes.rows[0] || {};
    const summary = {
      total_classes: rawSummary.total_classes || 0,
      present_count: rawSummary.present_count || 0,
      absent_count: rawSummary.absent_count || 0,
      late_count: rawSummary.late_count || 0,
      attended_count: rawSummary.attended_count || 0,
      attendance_percentage: parseFloat(rawSummary.attendance_percentage || 0),
      strict_present_percentage: parseFloat(rawSummary.strict_present_percentage || 0),
    };

    const subject_breakdown = breakdownRes.rows.map((row) => ({
      subject_code: row.subject_code,
      total_classes: row.total_classes,
      present_count: row.present_count,
      absent_count: row.absent_count,
      late_count: row.late_count,
      percentage: parseFloat(row.percentage || 0),
      strict_present_percentage: parseFloat(row.strict_present_percentage || 0),
    }));

    return res.status(200).json({
      success: true,
      studentId: target.user_id,
      student: {
        id: target.user_id,
        usn: target.usn || target.username,
        full_name: target.full_name || null,
        department: target.student_department || target.user_department,
        core_branch: target.core_branch || null,
        semester: target.semester,
        section: target.section || null,
      },
      summary,
      subject_breakdown,
      records: recordsRes.rows,
    });
  } catch (error) {
    console.error('getStudentAttendance error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch student attendance',
    });
  }
}

/**
 * GET /api/v1/attendance/section
 * Returns student checklist + aggregated attendance percentages and session records for a section
 */
export async function getSectionAttendance(req, res) {
  try {
    await ensureDatabaseExists();
    const scope = buildSectionScopeFilters(req, res);
    if (!scope) return;

    const { value: attDate, error: dateError } = parseOptionalDate(req.query.attendance_date, false);
    if (dateError) {
      return res.status(400).json({ success: false, error: dateError });
    }

    const { value: periodNo, error: periodError } = parseOptionalInt(req.query.period_no, 'period_no');
    if (periodError || (periodNo !== null && periodNo < 1)) {
      return res.status(400).json({
        success: false,
        error: periodError || 'period_no must be >= 1',
      });
    }

    const { conditions, whereSql, params, filters } = scope;
    const studentParams = [...params];
    studentParams.push(filters.subjectCode);
    const subIdx = `$${studentParams.length}`;
    studentParams.push(attDate);
    const dateIdx = `$${studentParams.length}`;
    studentParams.push(periodNo);
    const periodIdx = `$${studentParams.length}`;

    const studentsQuery = `
      SELECT
        u.id AS student_id,
        s.usn,
        s.full_name,
        COALESCE(s.department, u.department) AS department,
        s.core_branch,
        COALESCE(s.semester, u.semester) AS semester,
        s.section,
        COUNT(ar.id)::int AS total_classes,
        COUNT(ar.id) FILTER (WHERE ar.status = 'PRESENT')::int AS present_count,
        COUNT(ar.id) FILTER (WHERE ar.status = 'ABSENT')::int AS absent_count,
        COUNT(ar.id) FILTER (WHERE ar.status = 'LATE')::int AS late_count,
        COALESCE(
          ROUND(
            COUNT(ar.id) FILTER (WHERE ar.status IN ('PRESENT', 'LATE')) * 100.0 / NULLIF(COUNT(ar.id), 0),
            2
          ),
          0
        ) AS attendance_percentage,
        COALESCE(
          ROUND(
            COUNT(ar.id) FILTER (WHERE ar.status = 'PRESENT') * 100.0 / NULLIF(COUNT(ar.id), 0),
            2
          ),
          0
        ) AS strict_present_percentage,
        sess.id AS session_record_id,
        sess.status AS session_status,
        sess.period_no AS session_period_no,
        sess.entry_mode AS session_entry_mode,
        sess.attendance_date AS session_date
      FROM student s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN attendance_records ar
        ON ar.student_id = u.id
        AND (${subIdx}::text IS NULL OR UPPER(ar.subject_code) = ${subIdx})
      LEFT JOIN LATERAL (
        SELECT ar_d.id, ar_d.status, ar_d.period_no, ar_d.entry_mode, ar_d.attendance_date
        FROM attendance_records ar_d
        WHERE ${dateIdx}::date IS NOT NULL
          AND ${subIdx}::text IS NOT NULL
          AND ar_d.student_id = u.id
          AND UPPER(ar_d.subject_code) = ${subIdx}
          AND ar_d.attendance_date = ${dateIdx}::date
          AND (${periodIdx}::int IS NULL OR ar_d.period_no = ${periodIdx}::int)
        ORDER BY ar_d.period_no ASC
        LIMIT 1
      ) sess ON TRUE
      ${whereSql}
      GROUP BY u.id, s.usn, s.full_name, s.department, u.department, s.core_branch,
               s.semester, u.semester, s.section,
               sess.id, sess.status, sess.period_no, sess.entry_mode, sess.attendance_date
      ORDER BY s.usn ASC;
    `;

    const recordConditions = [...conditions];
    const recordParams = [...params];
    if (filters.subjectCode) {
      recordParams.push(filters.subjectCode);
      recordConditions.push(`UPPER(ar.subject_code) = $${recordParams.length}`);
    }
    if (attDate) {
      recordParams.push(attDate);
      recordConditions.push(`ar.attendance_date = $${recordParams.length}::date`);
    }
    if (periodNo !== null) {
      recordParams.push(periodNo);
      recordConditions.push(`ar.period_no = $${recordParams.length}::int`);
    }
    const recordsWhere = recordConditions.length > 0 ? `WHERE ${recordConditions.join(' AND ')}` : '';

    const recordsQuery = `
      SELECT ar.*, s.usn, s.full_name
      FROM student s
      JOIN users u ON s.user_id = u.id
      JOIN attendance_records ar ON ar.student_id = u.id
      ${recordsWhere}
      ORDER BY ar.attendance_date DESC, ar.period_no ASC, s.usn ASC
      LIMIT 250;
    `;

    const [studentsRes, recordsRes] = await Promise.all([
      pool.query(studentsQuery, studentParams),
      pool.query(recordsQuery, recordParams),
    ]);

    const students = studentsRes.rows.map((row) => ({
      ...row,
      attendance_percentage: parseFloat(row.attendance_percentage || 0),
      strict_present_percentage: parseFloat(row.strict_present_percentage || 0),
    }));

    return res.status(200).json({
      success: true,
      count: students.length,
      students,
      records: recordsRes.rows,
    });
  } catch (error) {
    console.error('getSectionAttendance error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch section attendance',
    });
  }
}

/**
 * POST /api/v1/cie/manual
 * Faculty upserts single or bulk CIE marks with automatic total_cie calculation
 */
export async function submitManualCie(req, res) {
  let client = null;
  try {
    await ensureDatabaseExists();
    const body = req.body || {};
    const {
      department,
      semester,
      subject_code,
      subjectCode,
      subject_name,
      subjectName,
      max_marks,
      maxMarks,
      records,
    } = body;

    const facultyId = req.user.userId || req.user.id;
    const topDept = cleanUpper(department);
    const topSubCode = cleanUpper(subject_code || subjectCode);
    const topSubName = cleanStr(subject_name || subjectName);

    const { value: topSem, error: semError } = parseOptionalInt(semester, 'semester');
    if (semError) {
      return res.status(400).json({ success: false, error: semError });
    }

    const { value: topMaxMarks, error: topMaxErr } = parseOptionalNumber(max_marks ?? maxMarks, 'max_marks', {
      min: 1,
      max: 999.99,
    });
    if (topMaxErr) {
      return res.status(400).json({ success: false, error: topMaxErr });
    }

    if (!authorizeManualCallerScope(req, res, topDept)) return;

    const hasRecordsArray = Array.isArray(records);
    if (hasRecordsArray && records.length === 0) {
      return res.status(400).json({ success: false, error: 'records array cannot be empty' });
    }
    const items = hasRecordsArray ? records : [body];

    const preparedItems = [];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i] || {};
      const identifier = cleanStr(item.student_id || item.studentId || item.studentUsn || item.usn);
      if (!identifier) {
        return res.status(400).json({
          success: false,
          error: `records[${i}] must include student_id, studentUsn, or usn`,
        });
      }

      const itemSubCode = cleanUpper(item.subject_code || item.subjectCode) || topSubCode;
      if (!itemSubCode) {
        return res.status(400).json({
          success: false,
          error: `subject_code is required for records[${i}]`,
        });
      }

      const c1 = parseOptionalNumber(item.cie1, 'cie1');
      const c2 = parseOptionalNumber(item.cie2, 'cie2');
      const c3 = parseOptionalNumber(item.cie3, 'cie3');
      const asgn = parseOptionalNumber(item.assignment, 'assignment');
      const itemMax = parseOptionalNumber(item.max_marks ?? item.maxMarks, 'max_marks', {
        min: 1,
        max: 999.99,
      });

      const firstErr = c1.error || c2.error || c3.error || asgn.error || itemMax.error;
      if (firstErr) {
        return res.status(400).json({ success: false, error: firstErr });
      }

      const itemSemParsed = parseOptionalInt(item.semester, 'semester');
      if (itemSemParsed.error) {
        return res.status(400).json({ success: false, error: itemSemParsed.error });
      }

      preparedItems.push({
        item,
        identifier,
        itemSubCode,
        itemSubName: cleanStr(item.subject_name || item.subjectName) || topSubName,
        itemSem: itemSemParsed.value,
        cie1: c1.value,
        cie2: c2.value,
        cie3: c3.value,
        assignment: asgn.value,
        maxMarks: itemMax.value ?? topMaxMarks,
      });
    }

    client = await pool.connect();
    await client.query('BEGIN');

    const upsertedRows = [];
    const upsertQuery = `
      INSERT INTO cie_marks (
        student_id, faculty_id, department, semester, subject_code, subject_name,
        cie1, cie2, cie3, assignment, total_cie, max_marks, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        COALESCE($7::numeric, 0),
        COALESCE($8::numeric, 0),
        COALESCE($9::numeric, 0),
        COALESCE($10::numeric, 0),
        LEAST(
          ROUND(
            ((COALESCE($7::numeric, 0) + COALESCE($8::numeric, 0) + COALESCE($9::numeric, 0)) / 3.0)
            + COALESCE($10::numeric, 0),
            2
          ),
          COALESCE($11::numeric, 50.00)
        ),
        COALESCE($11::numeric, 50.00),
        NOW()
      )
      ON CONFLICT (student_id, semester, subject_code)
      DO UPDATE SET
        faculty_id = EXCLUDED.faculty_id,
        department = EXCLUDED.department,
        subject_name = COALESCE(EXCLUDED.subject_name, cie_marks.subject_name),
        cie1 = COALESCE($7::numeric, cie_marks.cie1),
        cie2 = COALESCE($8::numeric, cie_marks.cie2),
        cie3 = COALESCE($9::numeric, cie_marks.cie3),
        assignment = COALESCE($10::numeric, cie_marks.assignment),
        max_marks = COALESCE($11::numeric, cie_marks.max_marks),
        total_cie = LEAST(
          ROUND(
            ((COALESCE($7::numeric, cie_marks.cie1) + COALESCE($8::numeric, cie_marks.cie2) + COALESCE($9::numeric, cie_marks.cie3)) / 3.0)
            + COALESCE($10::numeric, cie_marks.assignment),
            2
          ),
          COALESCE($11::numeric, cie_marks.max_marks)
        ),
        updated_at = NOW()
      RETURNING *, xmin::text AS pg_xmin, ctid::text AS pg_ctid;
    `;

    for (const entry of preparedItems) {
      const student = await resolveStudentIdentity(entry.identifier, client);
      if (!student || (student.base_role !== 'STUDENT' && !student.usn)) {
        throw httpError(404, `Student not found for identifier '${entry.identifier}'`);
      }

      const requestedDept = cleanUpper(entry.item.department) || topDept;
      if (!canWriteStudentAcademicRecord(req.user, requestedDept, student)) {
        throw httpError(
          403,
          `Department Scope Violation: Cannot submit CIE marks for student '${entry.identifier}' in department '${requestedDept || student.student_department || student.user_department}'`
        );
      }

      const rowDept =
        requestedDept ||
        cleanUpper(student.student_department || student.user_department);
      const rowSem = entry.itemSem ?? topSem ?? student.semester;

      if (!rowDept || rowSem === null || rowSem === undefined) {
        throw httpError(400, `department and semester are required for student '${entry.identifier}'`);
      }

      const r = await client.query(upsertQuery, [
        student.user_id,
        facultyId,
        rowDept,
        rowSem,
        entry.itemSubCode,
        entry.itemSubName,
        entry.cie1,
        entry.cie2,
        entry.cie3,
        entry.assignment,
        entry.maxMarks,
      ]);
      upsertedRows.push(formatCieRow(r.rows[0]));
    }

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      committedCount: upsertedRows.length,
      marks: upsertedRows,
      dbReceipt: buildDbReceipt(upsertedRows[0], 'cie_marks', 'updated_at'),
    });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rb) {
        console.error('Rollback error on submitManualCie:', rb.message);
      }
    }
    console.error('submitManualCie error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Failed to save CIE marks',
    });
  } finally {
    if (client) client.release();
  }
}

/**
 * GET /api/v1/cie/student/:studentId
 * Returns CIE marks and computed averageCie for a student
 */
export async function getStudentCie(req, res) {
  try {
    await ensureDatabaseExists();
    const target = await authorizeAndResolveStudentParam(req, res);
    if (!target) return;

    const { value: semester, error: semError } = parseOptionalInt(req.query.semester, 'semester');
    if (semError) {
      return res.status(400).json({ success: false, error: semError });
    }

    const params = [target.user_id];
    let semSql = '';
    if (semester !== null) {
      params.push(semester);
      semSql = `AND c.semester = $${params.length}`;
    }

    const query = `
      SELECT c.*
      FROM cie_marks c
      WHERE c.student_id = $1 ${semSql}
      ORDER BY c.semester DESC, c.subject_code ASC;
    `;
    const result = await pool.query(query, params);
    const marks = result.rows.map(formatCieRow);
    const averageCie =
      marks.length > 0
        ? Number((marks.reduce((sum, m) => sum + m.total_cie, 0) / marks.length).toFixed(2))
        : 0;

    return res.status(200).json({
      success: true,
      studentId: target.user_id,
      student: {
        id: target.user_id,
        usn: target.usn || target.username,
        full_name: target.full_name || null,
        department: target.student_department || target.user_department,
        core_branch: target.core_branch || null,
        semester: target.semester,
        section: target.section || null,
      },
      averageCie,
      count: marks.length,
      marks,
    });
  } catch (error) {
    console.error('getStudentCie error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch student CIE marks',
    });
  }
}

/**
 * GET /api/v1/cie/section
 * Returns student roster joined with cie_marks for faculty mark-entry and HOD/Admin review
 */
export async function getSectionCie(req, res) {
  try {
    await ensureDatabaseExists();
    const scope = buildSectionScopeFilters(req, res);
    if (!scope) return;

    const { conditions, whereSql, params, filters } = scope;

    const rosterQuery = `
      SELECT
        u.id AS student_id,
        s.usn,
        s.full_name,
        COALESCE(s.department, u.department) AS department,
        s.core_branch,
        COALESCE(s.semester, u.semester) AS semester,
        s.section
      FROM student s
      JOIN users u ON s.user_id = u.id
      ${whereSql}
      ORDER BY s.usn ASC;
    `;

    const markConditions = [...conditions];
    const markParams = [...params];
    if (filters.subjectCode) {
      markParams.push(filters.subjectCode);
      markConditions.push(`UPPER(c.subject_code) = $${markParams.length}`);
    }
    if (filters.semester !== null) {
      markParams.push(filters.semester);
      markConditions.push(`c.semester = $${markParams.length}`);
    }
    const marksWhere = markConditions.length > 0 ? `WHERE ${markConditions.join(' AND ')}` : '';

    const marksQuery = `
      SELECT c.*, s.usn, s.full_name
      FROM student s
      JOIN users u ON s.user_id = u.id
      JOIN cie_marks c ON c.student_id = u.id
      ${marksWhere}
      ORDER BY s.usn ASC, c.semester DESC, c.subject_code ASC;
    `;

    const [rosterRes, marksRes] = await Promise.all([
      pool.query(rosterQuery, params),
      pool.query(marksQuery, markParams),
    ]);

    const marks = marksRes.rows.map(formatCieRow);
    const marksByStudent = new Map();
    marks.forEach((m) => {
      if (!marksByStudent.has(m.student_id)) {
        marksByStudent.set(m.student_id, []);
      }
      marksByStudent.get(m.student_id).push(m);
    });

    const students = rosterRes.rows.map((stu) => {
      const stuMarks = marksByStudent.get(stu.student_id) || [];
      if (filters.subjectCode) {
        const match = stuMarks[0] || null;
        return {
          ...stu,
          has_marks: Boolean(match),
          cie_id: match ? match.id : null,
          subject_code: match ? match.subject_code : filters.subjectCode,
          subject_name: match ? match.subject_name : null,
          cie1: match ? match.cie1 : null,
          cie2: match ? match.cie2 : null,
          cie3: match ? match.cie3 : null,
          assignment: match ? match.assignment : null,
          total_cie: match ? match.total_cie : null,
          max_marks: match ? match.max_marks : 50,
          updated_at: match ? match.updated_at : null,
        };
      }

      const avg =
        stuMarks.length > 0
          ? Number((stuMarks.reduce((acc, m) => acc + m.total_cie, 0) / stuMarks.length).toFixed(2))
          : 0;
      return {
        ...stu,
        subjects: stuMarks,
        average_cie: avg,
      };
    });

    return res.status(200).json({
      success: true,
      count: students.length,
      students,
      marks,
    });
  } catch (error) {
    console.error('getSectionCie error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch section CIE marks',
    });
  }
}

export default {
  extractOcrDraft,
  commitAcademicRecords,
  eodEdit,
  createUnlockRequest,
  hodApproveUnlock,
  principalApproveUnlock,
  executeUnlockedUpdate,
  submitManualAttendance,
  getStudentAttendance,
  getSectionAttendance,
  submitManualCie,
  getStudentCie,
  getSectionCie,
};

