import pool, { ensureDatabaseExists } from '../config/db.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SWAP_DECISION_MAP = {
  APPROVE: 'APPROVED',
  APPROVED: 'APPROVED',
  REJECT: 'REJECTED',
  REJECTED: 'REJECTED',
};

const SLOT_FACULTY_JOINS = `
  LEFT JOIN users u_fac ON ts.faculty_id = u_fac.id
  LEFT JOIN faculty f_fac ON f_fac.user_id = u_fac.id
  LEFT JOIN users u_swap ON ts.swapped_faculty_id = u_swap.id
  LEFT JOIN faculty f_swap ON f_swap.user_id = u_swap.id
`;

function parseStrictInt(value) {
  if (value === undefined || value === null || String(value).trim() === '') return NaN;
  const num = Number(value);
  return Number.isInteger(num) ? num : NaN;
}

function getCallerContext(user = {}) {
  const userId = user.userId || user.id;
  const secCode = String(user.sectionCode || '').trim().toUpperCase();
  const isSuperAdmin = user.adminTier === 'SUPER_ADMIN';
  const isHod =
    user.adminTier === 'HOD_ADMIN' ||
    (Array.isArray(user.subRoles) && user.subRoles.includes('HOD'));
  const isAdmOrExmAdmin =
    (user.baseRole === 'ADMIN' || user.adminTier === 'REGULAR_ADMIN') &&
    (secCode === 'ADM' || secCode === 'EXM');
  const callerDept = String(user.department || '').trim().toUpperCase();

  return { userId, isSuperAdmin, isHod, isAdmOrExmAdmin, callerDept };
}

function normalizeOptionalText(val) {
  if (val === undefined || val === null) return null;
  const trimmed = String(val).trim();
  return trimmed === '' ? null : trimmed;
}

function isValidIsoDate(value) {
  const str = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const parsed = new Date(`${str}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === str;
}

async function findInvalidFacultyIds(ids) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return [];
  const res = await pool.query(
    `SELECT id FROM users WHERE id = ANY($1::uuid[]) AND base_role = 'FACULTY' AND is_active = TRUE`,
    [uniqueIds]
  );
  const activeSet = new Set(res.rows.map((r) => r.id));
  return uniqueIds.filter((id) => !activeSet.has(id));
}

/**
 * GET /api/v1/timetable
 * Fetch normalized timetable slots with optional filters and faculty/swap joins
 */
export async function getTimetableSlots(req, res) {
  try {
    await ensureDatabaseExists();

    const rawDept = req.query.department ?? req.query.dept;
    const rawSem = req.query.semester ?? req.query.sem;
    const rawSec = req.query.section ?? req.query.sec;
    const rawFacultyId = req.query.facultyId ?? req.query.faculty_id;
    const rawDay = req.query.day ?? req.query.day_of_week;

    const conditions = [];
    const params = [];

    if (rawDept !== undefined && String(rawDept).trim() !== '') {
      params.push(String(rawDept).trim().toUpperCase());
      conditions.push(`UPPER(ts.department) = $${params.length}`);
    }

    if (rawSem !== undefined && String(rawSem).trim() !== '') {
      const sem = parseStrictInt(rawSem);
      if (Number.isNaN(sem) || sem < 1) {
        return res.status(400).json({ success: false, error: 'semester must be a positive integer' });
      }
      params.push(sem);
      conditions.push(`ts.semester = $${params.length}`);
    }

    if (rawSec !== undefined && String(rawSec).trim() !== '') {
      params.push(String(rawSec).trim().toUpperCase());
      conditions.push(`UPPER(ts.section) = $${params.length}`);
    }

    if (rawFacultyId !== undefined && String(rawFacultyId).trim() !== '') {
      const facId = String(rawFacultyId).trim();
      if (!UUID_REGEX.test(facId)) {
        return res.status(400).json({ success: false, error: 'facultyId must be a valid UUID' });
      }
      params.push(facId);
      conditions.push(
        `(ts.faculty_id = $${params.length} OR (ts.swapped_faculty_id = $${params.length} AND ts.swap_status IN ('PENDING', 'APPROVED')))`
      );
    }

    if (rawDay !== undefined && String(rawDay).trim() !== '') {
      const day = parseStrictInt(rawDay);
      if (Number.isNaN(day) || day < 1 || day > 6) {
        return res.status(400).json({ success: false, error: 'day must be an integer between 1 and 6' });
      }
      params.push(day);
      conditions.push(`ts.day_of_week = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT ts.*,
             u_fac.username AS faculty_username,
             f_fac.full_name AS faculty_name,
             u_swap.username AS swapped_faculty_username,
             f_swap.full_name AS swapped_faculty_name
      FROM timetable_slots ts
      ${SLOT_FACULTY_JOINS}
      ${whereClause}
      ORDER BY ts.department ASC, ts.semester ASC, ts.section ASC, ts.day_of_week ASC, ts.period_no ASC;
    `;

    const result = await pool.query(query, params);
    return res.status(200).json({
      success: true,
      count: result.rows.length,
      slots: result.rows,
    });
  } catch (error) {
    console.error('getTimetableSlots error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to fetch timetable slots' });
  }
}

/**
 * POST /api/v1/timetable
 * Upsert one or more timetable slots into timetable_slots inside a transaction
 */
export async function upsertTimetableSlots(req, res) {
  let client = null;
  try {
    await ensureDatabaseExists();

    const { isSuperAdmin, isHod, isAdmOrExmAdmin, callerDept } = getCallerContext(req.user);
    if (!isSuperAdmin && !isHod && !isAdmOrExmAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: HOD, ADM/EXM Admin, or Super Admin privileges required',
      });
    }

    const body = req.body || {};
    const rawSlots = Array.isArray(body.slots) ? body.slots : [body];

    if (rawSlots.length === 0) {
      return res.status(400).json({ success: false, error: 'No timetable slots provided' });
    }

    const normalizedSlots = [];
    for (let i = 0; i < rawSlots.length; i += 1) {
      const item = rawSlots[i] || {};
      const dept = normalizeOptionalText(item.department ?? body.department)?.toUpperCase() || '';
      const sem = parseStrictInt(item.semester ?? body.semester);
      const sec = normalizeOptionalText(item.section ?? body.section)?.toUpperCase() || '';
      const dayOfWeek = parseStrictInt(item.day_of_week ?? item.dayOfWeek);
      const periodNo = parseStrictInt(item.period_no ?? item.periodNo);
      const subjectCode = normalizeOptionalText(item.subject_code ?? item.subjectCode)?.toUpperCase() || '';
      const subjectName = normalizeOptionalText(item.subject_name ?? item.subjectName);
      const startTime = normalizeOptionalText(item.start_time ?? item.startTime);
      const endTime = normalizeOptionalText(item.end_time ?? item.endTime);
      const roomNo = normalizeOptionalText(item.room_no ?? item.roomNo);
      const facultyId = normalizeOptionalText(item.faculty_id ?? item.facultyId);

      if (!dept || Number.isNaN(sem) || sem < 1 || !sec) {
        return res.status(400).json({
          success: false,
          error: `Slot[${i}]: department, positive integer semester, and section are required`,
        });
      }

      if ((isHod && !isSuperAdmin || (!isSuperAdmin && !isAdmOrExmAdmin)) && (!callerDept || callerDept !== dept)) {
        return res.status(403).json({
          success: false,
          error: `Department Scope Violation: Cannot manage timetable for department '${dept}'`,
        });
      }

      if (Number.isNaN(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 6) {
        return res.status(400).json({
          success: false,
          error: `Slot[${i}]: day_of_week must be an integer between 1 and 6`,
        });
      }

      if (Number.isNaN(periodNo) || periodNo < 1) {
        return res.status(400).json({
          success: false,
          error: `Slot[${i}]: period_no must be a positive integer`,
        });
      }

      if (!subjectCode) {
        return res.status(400).json({
          success: false,
          error: `Slot[${i}]: subject_code is required`,
        });
      }

      if (facultyId && !UUID_REGEX.test(facultyId)) {
        return res.status(400).json({
          success: false,
          error: `Slot[${i}]: faculty_id must be a valid UUID`,
        });
      }

      normalizedSlots.push({
        dept,
        sem,
        sec,
        dayOfWeek,
        periodNo,
        startTime,
        endTime,
        subjectCode,
        subjectName,
        facultyId,
        roomNo,
      });
    }

    const invalidFacultyIds = await findInvalidFacultyIds(normalizedSlots.map((s) => s.facultyId));
    if (invalidFacultyIds.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'faculty_id must reference an active faculty member',
      });
    }

    client = await pool.connect();
    await client.query('BEGIN');

    const upsertQuery = `
      INSERT INTO timetable_slots (
        department, semester, section, day_of_week, period_no,
        start_time, end_time, subject_code, subject_name, faculty_id, room_no,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      ON CONFLICT (department, semester, section, day_of_week, period_no)
      DO UPDATE SET
        start_time = EXCLUDED.start_time,
        end_time = EXCLUDED.end_time,
        subject_code = EXCLUDED.subject_code,
        subject_name = EXCLUDED.subject_name,
        faculty_id = EXCLUDED.faculty_id,
        room_no = EXCLUDED.room_no,
        swapped_faculty_id = NULL,
        swap_status = NULL,
        swap_requested_by = NULL,
        swap_date = NULL,
        updated_at = NOW()
      RETURNING *, xmin::text AS pg_xmin, ctid::text AS pg_ctid;
    `;

    const upserted = [];
    for (const s of normalizedSlots) {
      const result = await client.query(upsertQuery, [
        s.dept,
        s.sem,
        s.sec,
        s.dayOfWeek,
        s.periodNo,
        s.startTime,
        s.endTime,
        s.subjectCode,
        s.subjectName,
        s.facultyId,
        s.roomNo,
      ]);
      upserted.push(result.rows[0]);
    }

    await client.query('COMMIT');

    const firstRow = upserted[0];
    return res.status(201).json({
      success: true,
      message: `${upserted.length} timetable slot(s) saved successfully`,
      count: upserted.length,
      slot: firstRow,
      slots: upserted,
      dbReceipt: {
        persisted: true,
        pgTransactionId: firstRow.pg_xmin,
        physicalDiskTuple: firstRow.pg_ctid,
        storedInTable: 'timetable_slots',
        count: upserted.length,
        timestamp: firstRow.updated_at,
      },
    });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rbErr) {
        console.error('upsertTimetableSlots rollback error:', rbErr.message);
      }
    }
    if (error.code === '23503') {
      return res.status(400).json({
        success: false,
        error: 'Invalid faculty_id: referenced user does not exist',
      });
    }
    console.error('upsertTimetableSlots error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to save timetable slots' });
  } finally {
    if (client) {
      client.release();
    }
  }
}

/**
 * PATCH /api/v1/timetable/:id/swap
 * Request or respond to a faculty class exchange on timetable_slots
 */
export async function handleSlotSwap(req, res) {
  try {
    await ensureDatabaseExists();

    const { id } = req.params;
    if (!UUID_REGEX.test(String(id || ''))) {
      return res.status(400).json({ success: false, error: 'Invalid timetable slot id' });
    }

    const slotRes = await pool.query('SELECT * FROM timetable_slots WHERE id = $1', [id]);
    if (slotRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Timetable slot not found' });
    }

    const slot = slotRes.rows[0];
    const { userId, isSuperAdmin, isHod, callerDept } = getCallerContext(req.user);
    const slotDept = String(slot.department || '').trim().toUpperCase();
    const isSlotHod = isHod && Boolean(callerDept) && callerDept === slotDept;

    const body = req.body || {};
    const action = normalizeOptionalText(body.action)?.toUpperCase() || '';
    const decisionRaw = normalizeOptionalText(body.swap_status ?? body.decision ?? body.status)?.toUpperCase() || '';
    const resolvedDecision = SWAP_DECISION_MAP[action] || SWAP_DECISION_MAP[decisionRaw] || null;
    const swappedFacultyId = normalizeOptionalText(body.swapped_faculty_id ?? body.swappedFacultyId);
    const swapDateInput = normalizeOptionalText(body.swap_date ?? body.swapDate);

    let updateSql = '';
    let updateParams = [];
    let responseMessage = '';

    if (resolvedDecision) {
      if (slot.swapped_faculty_id !== userId && !isSlotHod && !isSuperAdmin) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden: Only the target swapped faculty, department HOD, or Super Admin can respond to this swap',
        });
      }

      if (!slot.swapped_faculty_id) {
        return res.status(400).json({
          success: false,
          error: 'No swap request exists on this timetable slot',
        });
      }

      if (['APPROVED', 'REJECTED'].includes(String(slot.swap_status || '').toUpperCase())) {
        return res.status(409).json({
          success: false,
          error: `Swap request has already been ${slot.swap_status}`,
        });
      }

      updateSql = `
        WITH updated AS (
          UPDATE timetable_slots
          SET swap_status = $1,
              updated_at = NOW()
          WHERE id = $2
          RETURNING *, xmin::text AS pg_xmin, ctid::text AS pg_ctid
        )
        SELECT ts.*,
               u_fac.username AS faculty_username,
               f_fac.full_name AS faculty_name,
               u_swap.username AS swapped_faculty_username,
               f_swap.full_name AS swapped_faculty_name
        FROM updated ts
        ${SLOT_FACULTY_JOINS};
      `;
      updateParams = [resolvedDecision, id];
      responseMessage = `Class swap ${resolvedDecision.toLowerCase()} successfully`;
    } else if (action === 'REQUEST' || swappedFacultyId) {
      if (slot.faculty_id !== userId && !isSlotHod && !isSuperAdmin) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden: Only the assigned faculty, department HOD, or Super Admin can request a swap',
        });
      }

      if (!swappedFacultyId || !UUID_REGEX.test(swappedFacultyId)) {
        return res.status(400).json({
          success: false,
          error: 'A valid UUID swapped_faculty_id is required to request a swap',
        });
      }

      if (slot.faculty_id && swappedFacultyId === slot.faculty_id) {
        return res.status(400).json({
          success: false,
          error: 'swapped_faculty_id must be different from the currently assigned faculty_id',
        });
      }

      if (swapDateInput && !isValidIsoDate(swapDateInput)) {
        return res.status(400).json({
          success: false,
          error: 'swap_date must be a valid YYYY-MM-DD date',
        });
      }

      const invalidFacultyIds = await findInvalidFacultyIds([swappedFacultyId]);
      if (invalidFacultyIds.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'swapped_faculty_id must reference an active faculty member',
        });
      }

      updateSql = `
        WITH updated AS (
          UPDATE timetable_slots
          SET swapped_faculty_id = $1,
              swap_status = 'PENDING',
              swap_requested_by = $2,
              swap_date = COALESCE($3::date, CURRENT_DATE),
              updated_at = NOW()
          WHERE id = $4
          RETURNING *, xmin::text AS pg_xmin, ctid::text AS pg_ctid
        )
        SELECT ts.*,
               u_fac.username AS faculty_username,
               f_fac.full_name AS faculty_name,
               u_swap.username AS swapped_faculty_username,
               f_swap.full_name AS swapped_faculty_name
        FROM updated ts
        ${SLOT_FACULTY_JOINS};
      `;
      updateParams = [swappedFacultyId, userId, swapDateInput, id];
      responseMessage = 'Class swap requested in PENDING status';
    } else {
      return res.status(400).json({
        success: false,
        error: "Invalid swap payload: provide swapped_faculty_id (or action: 'REQUEST') to request, or action/swap_status ('APPROVED'|'REJECTED') to respond",
      });
    }

    const updatedRes = await pool.query(updateSql, updateParams);
    const updatedSlot = updatedRes.rows[0];

    return res.status(200).json({
      success: true,
      message: responseMessage,
      slot: updatedSlot,
      dbReceipt: {
        persisted: true,
        pgTransactionId: updatedSlot.pg_xmin,
        physicalDiskTuple: updatedSlot.pg_ctid,
        storedInTable: 'timetable_slots',
        swapStatus: updatedSlot.swap_status,
        timestamp: updatedSlot.updated_at,
      },
    });
  } catch (error) {
    console.error('handleSlotSwap error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to process class swap' });
  }
}

/**
 * POST /api/v1/timetable/master-setup
 * HOD / Super Admin setup for weekly schedule slots
 */
export async function masterSetup(req, res) {
  try {
    await ensureDatabaseExists();
    const body = req.body || {};
    const { department, semester, section, slots } = body;

    const callerDept = req.user?.department ? String(req.user.department).trim().toUpperCase() : '';
    const isSuperAdmin = req.user?.adminTier === 'SUPER_ADMIN';
    const topDept = normalizeOptionalText(department)?.toUpperCase() || '';

    if (!isSuperAdmin && !callerDept) {
      return res.status(403).json({
        success: false,
        error: 'Department Scope Violation: HOD department assignment is required',
      });
    }

    // Verify top-level department restriction only when top-level department is supplied
    if (!isSuperAdmin && topDept && topDept !== callerDept) {
      return res.status(403).json({
        success: false,
        error: `Department Scope Violation: Cannot manage timetable for department '${department}'`,
      });
    }

    const slotList = Array.isArray(slots) ? slots : [body];
    if (slotList.length === 0) {
      return res.status(400).json({ success: false, error: 'No timetable slots provided' });
    }

    const normalizedSlots = [];
    for (let i = 0; i < slotList.length; i += 1) {
      const slot = slotList[i] || {};
      const dept = normalizeOptionalText(slot.department ?? department)?.toUpperCase() || '';
      const sem = parseStrictInt(slot.semester ?? semester);
      const sec = normalizeOptionalText(slot.section ?? section)?.toUpperCase() || '';
      const dayOfWeek = parseStrictInt(slot.day_of_week);
      const periodNo = parseStrictInt(slot.period_no);
      const subjectCode = normalizeOptionalText(slot.subject_code)?.toUpperCase() || '';
      const facultyId = normalizeOptionalText(slot.faculty_id);
      const roomNo = normalizeOptionalText(slot.room_no);

      if (!dept || Number.isNaN(sem) || sem < 1 || !sec || Number.isNaN(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 6 || Number.isNaN(periodNo) || periodNo < 1 || !subjectCode) {
        return res.status(400).json({
          success: false,
          error: `Slot[${i}]: valid department, semester, section, day_of_week (1-6), period_no, and subject_code are required`,
        });
      }

      if (!isSuperAdmin && (!callerDept || dept !== callerDept.toUpperCase())) {
        return res.status(403).json({
          success: false,
          error: `Department Scope Violation: Cannot manage timetable for department '${dept}'`,
        });
      }

      if (facultyId && !UUID_REGEX.test(facultyId)) {
        return res.status(400).json({
          success: false,
          error: `Slot[${i}]: faculty_id must be a valid UUID`,
        });
      }

      normalizedSlots.push({ dept, sem, sec, dayOfWeek, periodNo, subjectCode, facultyId, roomNo });
    }

    const invalidFacultyIds = await findInvalidFacultyIds(normalizedSlots.map((s) => s.facultyId));
    if (invalidFacultyIds.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'faculty_id must reference an active faculty member',
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const upserted = [];

      const query = `
        INSERT INTO timetables (department, semester, section, day_of_week, period_no, subject_code, faculty_id, room_no)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (department, semester, section, day_of_week, period_no)
        DO UPDATE SET
          subject_code = EXCLUDED.subject_code,
          faculty_id = EXCLUDED.faculty_id,
          room_no = EXCLUDED.room_no
        RETURNING *;
      `;

      for (const s of normalizedSlots) {
        const r = await client.query(query, [s.dept, s.sem, s.sec, s.dayOfWeek, s.periodNo, s.subjectCode, s.facultyId, s.roomNo]);
        upserted.push(r.rows[0]);
      }

      await client.query('COMMIT');
      return res.status(200).json({
        success: true,
        message: 'Timetable slots successfully established',
        count: upserted.length,
        slots: upserted,
      });
    } catch (txErr) {
      try {
        await client.query('ROLLBACK');
      } catch (rbErr) {
        console.error('masterSetup rollback error:', rbErr.message);
      }
      throw txErr;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('masterSetup error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Timetable setup failed' });
  }
}

/**
 * GET /api/v1/timetable/daily-view?dept=&sem=&sec=&date=
 * Fetches static timetable slots for the specified day with any APPROVED swaps overlaid
 */
export async function getDailyView(req, res) {
  try {
    await ensureDatabaseExists();
    const dept = (req.query.dept || req.user.department || 'CS').toUpperCase();
    const rawSem = req.query.sem ?? '1';
    const sem = parseStrictInt(rawSem);
    if (Number.isNaN(sem) || sem < 1) {
      return res.status(400).json({ success: false, error: 'sem must be a positive integer' });
    }
    const sec = (req.query.sec || 'A').toUpperCase();
    const targetDate = req.query.date ? String(req.query.date).trim() : new Date().toISOString().split('T')[0];
    if (!isValidIsoDate(targetDate)) {
      return res.status(400).json({ success: false, error: 'date must be a valid YYYY-MM-DD date' });
    }

    // 1. Fetch static slots for that day of week
    const staticQuery = `
      SELECT t.id AS timetable_id, t.department, t.semester, t.section, t.day_of_week,
             t.period_no, t.subject_code, t.room_no, t.faculty_id,
             u.username AS faculty_username
      FROM timetables t
      LEFT JOIN users u ON t.faculty_id = u.id
      WHERE t.department = $1 AND t.semester = $2 AND t.section = $3
        AND t.day_of_week = EXTRACT(ISODOW FROM $4::date)
      ORDER BY t.period_no ASC;
    `;
    const staticRes = await pool.query(staticQuery, [dept, sem, sec, targetDate]);

    // 2. Fetch approved swaps for that specific date
    const swapsQuery = `
      SELECT ts.id AS swap_id, ts.timetable_id, ts.new_subject_code, ts.target_faculty_id,
             u_target.username AS target_faculty_username, ts.status
      FROM timetable_swaps ts
      JOIN timetables t ON ts.timetable_id = t.id
      LEFT JOIN users u_target ON ts.target_faculty_id = u_target.id
      WHERE t.department = $1 AND t.semester = $2 AND t.section = $3
        AND ts.swap_date = $4::date
        AND ts.status = 'APPROVED';
    `;
    const swapsRes = await pool.query(swapsQuery, [dept, sem, sec, targetDate]);
    const swapMap = new Map();
    swapsRes.rows.forEach((s) => swapMap.set(s.timetable_id, s));

    // 3. Overlay swaps onto the schedule
    const schedule = staticRes.rows.map((slot) => {
      if (swapMap.has(slot.timetable_id)) {
        const swap = swapMap.get(slot.timetable_id);
        return {
          ...slot,
          isSwapped: true,
          originalFacultyUsername: slot.faculty_username,
          originalSubjectCode: slot.subject_code,
          faculty_id: swap.target_faculty_id,
          faculty_username: swap.target_faculty_username,
          subject_code: swap.new_subject_code || slot.subject_code,
          swapId: swap.swap_id,
        };
      }
      return {
        ...slot,
        isSwapped: false,
      };
    });

    return res.status(200).json({
      success: true,
      query: { department: dept, semester: sem, section: sec, date: targetDate },
      count: schedule.length,
      schedule,
    });
  } catch (error) {
    console.error('getDailyView error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to retrieve daily schedule' });
  }
}

/**
 * POST /api/v1/timetable/swap-request
 * Faculty initiates a class swap request
 */
export async function createSwapRequest(req, res) {
  try {
    await ensureDatabaseExists();
    const body = req.body || {};
    const { timetable_id, swap_date, target_faculty_id, new_subject_code } = body;
    const requestingFacultyId = req.user.userId || req.user.id;

    if (!timetable_id || !swap_date || !target_faculty_id) {
      return res.status(400).json({
        success: false,
        error: 'timetable_id, swap_date, and target_faculty_id are required',
      });
    }

    if (!UUID_REGEX.test(String(timetable_id).trim()) || !UUID_REGEX.test(String(target_faculty_id).trim())) {
      return res.status(400).json({
        success: false,
        error: 'timetable_id and target_faculty_id must be valid UUIDs',
      });
    }

    const ttRes = await pool.query('SELECT * FROM timetables WHERE id = $1', [timetable_id]);
    if (ttRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Target timetable slot not found' });
    }

    const tt = ttRes.rows[0];

    // Verify caller is assigned faculty or department HOD / Super Admin
    const { isSuperAdmin, isHod, callerDept } = getCallerContext(req.user);
    const ttDept = String(tt.department || '').trim().toUpperCase();
    const isSlotHod = isHod && Boolean(callerDept) && callerDept === ttDept;

    if (!isSuperAdmin && !isSlotHod && tt.faculty_id !== requestingFacultyId) {
      return res.status(403).json({
        success: false,
        error: isHod
          ? `Department Scope Violation: HOD of '${callerDept}' cannot request swaps for department '${ttDept}'`
          : 'Forbidden: Only the scheduled faculty member or department HOD can request a class swap',
      });
    }

    const invalidTarget = await findInvalidFacultyIds([String(target_faculty_id).trim()]);
    if (invalidTarget.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'target_faculty_id must reference an active faculty member',
      });
    }

    const insertQuery = `
      INSERT INTO timetable_swaps (timetable_id, swap_date, requesting_faculty_id, target_faculty_id, new_subject_code, status)
      VALUES ($1, $2, $3, $4, $5, 'PENDING')
      RETURNING *;
    `;
    const result = await pool.query(insertQuery, [
      timetable_id,
      swap_date,
      requestingFacultyId,
      target_faculty_id,
      new_subject_code || tt.subject_code,
    ]);

    return res.status(201).json({
      success: true,
      message: 'Class swap request created in PENDING status',
      swap: result.rows[0],
    });
  } catch (error) {
    console.error('createSwapRequest error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to request class swap' });
  }
}

/**
 * PATCH /api/v1/timetable/swap-approve/:swapId
 * Target Faculty or HOD approves or rejects a class swap
 */
export async function approveSwap(req, res) {
  try {
    await ensureDatabaseExists();
    const { swapId } = req.params;
    const body = req.body || {};
    const { decision } = body; // 'APPROVED' or 'REJECTED'
    const callerId = req.user.userId || req.user.id;

    if (!UUID_REGEX.test(String(swapId || '').trim())) {
      return res.status(400).json({ success: false, error: 'Invalid swapId' });
    }

    const normalizedDecision = String(decision || '').trim().toUpperCase();
    if (!['APPROVED', 'REJECTED'].includes(normalizedDecision)) {
      return res.status(400).json({ success: false, error: "decision must be 'APPROVED' or 'REJECTED'" });
    }

    const swapRes = await pool.query(
      `SELECT ts.*, t.department, t.semester, t.section, t.period_no, t.subject_code AS original_subject
       FROM timetable_swaps ts
       JOIN timetables t ON ts.timetable_id = t.id
       WHERE ts.id = $1`,
      [swapId]
    );

    if (swapRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Swap request not found' });
    }

    const swap = swapRes.rows[0];
    const isTargetFaculty = swap.target_faculty_id === callerId;
    const { isSuperAdmin, isHod, callerDept } = getCallerContext(req.user);
    const swapDept = String(swap.department || '').trim().toUpperCase();
    const isSlotHod = isHod && Boolean(callerDept) && callerDept === swapDept;

    if (!isTargetFaculty && !isSuperAdmin && !isSlotHod) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Only the target faculty or department HOD can review this swap request',
      });
    }

    if (['APPROVED', 'REJECTED'].includes(String(swap.status || '').toUpperCase())) {
      return res.status(409).json({
        success: false,
        error: `Swap request has already been ${swap.status}`,
      });
    }

    const updateRes = await pool.query(
      'UPDATE timetable_swaps SET status = $1 WHERE id = $2 RETURNING *;',
      [normalizedDecision, swapId]
    );

    return res.status(200).json({
      success: true,
      message: `Swap request marked as ${normalizedDecision}`,
      swap: updateRes.rows[0],
      notificationPayload: {
        affectedSection: `${swap.department}-${swap.semester}${swap.section}`,
        swapDate: swap.swap_date,
        periodNo: swap.period_no,
        subjectCode: swap.new_subject_code || swap.original_subject,
        status: normalizedDecision,
      },
    });
  } catch (error) {
    console.error('approveSwap error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to update swap request' });
  }
}

export default {
  masterSetup,
  getDailyView,
  createSwapRequest,
  approveSwap,
  getTimetableSlots,
  upsertTimetableSlots,
  handleSlotSwap,
};

