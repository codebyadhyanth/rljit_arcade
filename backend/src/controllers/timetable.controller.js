import pool, { ensureDatabaseExists } from '../config/db.js';

/**
 * POST /api/v1/timetable/master-setup
 * HOD / Super Admin setup for weekly schedule slots
 */
export async function masterSetup(req, res) {
  try {
    await ensureDatabaseExists();
    const { department, semester, section, slots } = req.body;

    const callerDept = req.user.department;
    const isSuperAdmin = req.user.adminTier === 'SUPER_ADMIN';

    // Verify HOD department restriction
    if (!isSuperAdmin && callerDept && callerDept.toUpperCase() !== String(department || '').toUpperCase()) {
      return res.status(403).json({
        success: false,
        error: `Department Scope Violation: Cannot manage timetable for department '${department}'`,
      });
    }

    const slotList = Array.isArray(slots) ? slots : [req.body];
    if (slotList.length === 0) {
      return res.status(400).json({ success: false, error: 'No timetable slots provided' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const upserted = [];

      for (const slot of slotList) {
        const dept = (slot.department || department).toUpperCase();
        const sem = parseInt(slot.semester || semester, 10);
        const sec = (slot.section || section).toUpperCase();
        const dayOfWeek = parseInt(slot.day_of_week, 10);
        const periodNo = parseInt(slot.period_no, 10);
        const subjectCode = slot.subject_code.toUpperCase();
        const facultyId = slot.faculty_id || null;
        const roomNo = slot.room_no || null;

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

        const r = await client.query(query, [dept, sem, sec, dayOfWeek, periodNo, subjectCode, facultyId, roomNo]);
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
      await client.query('ROLLBACK');
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
    const sem = parseInt(req.query.sem || '1', 10);
    const sec = (req.query.sec || 'A').toUpperCase();
    const targetDate = req.query.date || new Date().toISOString().split('T')[0];

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
    const { timetable_id, swap_date, target_faculty_id, new_subject_code } = req.body;
    const requestingFacultyId = req.user.userId || req.user.id;

    if (!timetable_id || !swap_date || !target_faculty_id) {
      return res.status(400).json({
        success: false,
        error: 'timetable_id, swap_date, and target_faculty_id are required',
      });
    }

    const ttRes = await pool.query('SELECT * FROM timetables WHERE id = $1', [timetable_id]);
    if (ttRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Target timetable slot not found' });
    }

    const tt = ttRes.rows[0];

    // Verify caller is assigned faculty or HOD/Super Admin
    const isSuperAdmin = req.user.adminTier === 'SUPER_ADMIN';
    const isHod = req.user.adminTier === 'HOD_ADMIN' || (Array.isArray(req.user.subRoles) && req.user.subRoles.includes('HOD'));
    if (!isSuperAdmin && !isHod && tt.faculty_id !== requestingFacultyId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Only the scheduled faculty member or HOD can request a class swap',
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
    const { decision } = req.body; // 'APPROVED' or 'REJECTED'
    const callerId = req.user.userId || req.user.id;

    if (!['APPROVED', 'REJECTED'].includes(String(decision).toUpperCase())) {
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
    const isSuperAdmin = req.user.adminTier === 'SUPER_ADMIN';
    const isHod = req.user.adminTier === 'HOD_ADMIN' || (Array.isArray(req.user.subRoles) && req.user.subRoles.includes('HOD'));

    if (!isTargetFaculty && !isSuperAdmin && !isHod) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Only the target faculty or HOD can review this swap request',
      });
    }

    const updateRes = await pool.query(
      'UPDATE timetable_swaps SET status = $1 WHERE id = $2 RETURNING *;',
      [decision.toUpperCase(), swapId]
    );

    return res.status(200).json({
      success: true,
      message: `Swap request marked as ${decision.toUpperCase()}`,
      swap: updateRes.rows[0],
      notificationPayload: {
        affectedSection: `${swap.department}-${swap.semester}${swap.section}`,
        swapDate: swap.swap_date,
        periodNo: swap.period_no,
        subjectCode: swap.new_subject_code || swap.original_subject,
        status: decision.toUpperCase(),
      },
    });
  } catch (error) {
    console.error('approveSwap error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to update swap request' });
  }
}

/**
 * GET /api/v1/timetable
 * Filtered by department, semester, section, or facultyId
 */
export async function getTimetableSlots(req, res) {
  try {
    await ensureDatabaseExists();
    const { department, semester, section, facultyId, faculty_id, day_of_week } = req.query;

    const conditions = [];
    const values = [];

    if (department) {
      values.push(department.toUpperCase());
      conditions.push(`ts.department = $${values.length}`);
    }
    if (semester) {
      const sem = parseInt(semester, 10);
      if (!isNaN(sem)) {
        values.push(sem);
        conditions.push(`ts.semester = $${values.length}`);
      }
    }
    if (section) {
      values.push(section.toUpperCase());
      conditions.push(`ts.section = $${values.length}`);
    }
    const targetFacultyId = facultyId || faculty_id;
    if (targetFacultyId) {
      values.push(targetFacultyId);
      conditions.push(`(ts.faculty_id = $${values.length} OR ts.swapped_faculty_id = $${values.length})`);
    }
    if (day_of_week) {
      const day = parseInt(day_of_week, 10);
      if (!isNaN(day)) {
        values.push(day);
        conditions.push(`ts.day_of_week = $${values.length}`);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT ts.id, ts.department, ts.semester, ts.section, ts.day_of_week, ts.period_no,
             ts.start_time, ts.end_time, ts.subject_code, ts.subject_name,
             ts.faculty_id, u_fac.username AS faculty_username,
             ts.room_no, ts.swapped_faculty_id, u_swp.username AS swapped_faculty_username,
             ts.swap_status, ts.created_at
      FROM timetable_slots ts
      LEFT JOIN users u_fac ON ts.faculty_id = u_fac.id
      LEFT JOIN users u_swp ON ts.swapped_faculty_id = u_swp.id
      ${whereClause}
      ORDER BY ts.day_of_week ASC, ts.period_no ASC;
    `;

    const result = await pool.query(query, values);
    return res.status(200).json({
      success: true,
      count: result.rowCount,
      slots: result.rows,
    });
  } catch (error) {
    console.error('getTimetableSlots error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to fetch timetable slots' });
  }
}

/**
 * POST /api/v1/timetable
 * Manual slot creation / bulk upsert by HOD or Super Admin
 */
export async function createTimetableSlots(req, res) {
  const client = await pool.connect();
  try {
    await ensureDatabaseExists();

    const isSuperAdmin = req.user.adminTier === 'SUPER_ADMIN';
    const callerDept = req.user.department;

    let slotList = [];
    if (Array.isArray(req.body)) {
      slotList = req.body;
    } else if (Array.isArray(req.body.slots)) {
      slotList = req.body.slots;
    } else if (req.body.department && req.body.semester) {
      slotList = [req.body];
    }

    if (slotList.length === 0) {
      return res.status(400).json({ success: false, error: 'No timetable slot data provided' });
    }

    await client.query('BEGIN');
    const upserted = [];

    for (const slot of slotList) {
      const dept = (slot.department || req.body.department || callerDept || 'CSE').toUpperCase();
      const sem = parseInt(slot.semester || req.body.semester, 10);
      const sec = (slot.section || req.body.section || 'A').toUpperCase();
      const day = parseInt(slot.day_of_week, 10);
      const period = parseInt(slot.period_no, 10);
      const subCode = String(slot.subject_code || '').trim().toUpperCase();
      const subName = slot.subject_name || slot.subjectName || null;
      const startTime = slot.start_time || slot.startTime || null;
      const endTime = slot.end_time || slot.endTime || null;
      const facultyId = slot.faculty_id || slot.facultyId || null;
      const roomNo = slot.room_no || slot.roomNo || null;

      if (!dept || isNaN(sem) || !sec || isNaN(day) || isNaN(period) || !subCode) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: 'department, semester, section, day_of_week, period_no, and subject_code are required for each slot',
        });
      }

      // Check department scope
      if (!isSuperAdmin && callerDept && callerDept.toUpperCase() !== dept) {
        await client.query('ROLLBACK');
        return res.status(403).json({
          success: false,
          error: `Forbidden: Cannot create timetable slot for department '${dept}' outside your scope`,
        });
      }

      const upsertQuery = `
        INSERT INTO timetable_slots (
          department, semester, section, day_of_week, period_no,
          start_time, end_time, subject_code, subject_name,
          faculty_id, room_no, swap_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'NONE')
        ON CONFLICT (department, semester, section, day_of_week, period_no)
        DO UPDATE SET
          subject_code = EXCLUDED.subject_code,
          subject_name = EXCLUDED.subject_name,
          start_time = EXCLUDED.start_time,
          end_time = EXCLUDED.end_time,
          faculty_id = EXCLUDED.faculty_id,
          room_no = EXCLUDED.room_no
        RETURNING *;
      `;

      const r = await client.query(upsertQuery, [
        dept,
        sem,
        sec,
        day,
        period,
        startTime,
        endTime,
        subCode,
        subName,
        facultyId,
        roomNo,
      ]);
      upserted.push(r.rows[0]);
    }

    await client.query('COMMIT');

    const dbReceipt = {
      receiptId: `RCPT-TT-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
      transactionId: `tx_tt_${Date.now()}`,
      table: 'timetable_slots',
      count: upserted.length,
      createdBy: req.user.userId || req.user.id,
      timestamp: new Date().toISOString(),
    };

    return res.status(201).json({
      success: true,
      message: `${upserted.length} timetable slot(s) successfully recorded`,
      dbReceipt,
      count: upserted.length,
      slots: upserted,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('createTimetableSlots error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to create timetable slots' });
  } finally {
    client.release();
  }
}

/**
 * PATCH /api/v1/timetable/:id/swap
 * Faculty class exchange request or acceptance updating slot live
 */
export async function swapTimetableSlot(req, res) {
  try {
    await ensureDatabaseExists();
    const { id } = req.params;
    const { swapped_faculty_id, swappedFacultyId, swap_status, swapStatus, action } = req.body;

    const slotRes = await pool.query('SELECT * FROM timetable_slots WHERE id = $1', [id]);
    if (slotRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Timetable slot not found' });
    }
    const slot = slotRes.rows[0];

    const targetSwappedFaculty = swapped_faculty_id || swappedFacultyId || null;
    let newSwapStatus = (action || swap_status || swapStatus || 'PENDING').toUpperCase();

    if (!['PENDING', 'APPROVED', 'REJECTED', 'NONE'].includes(newSwapStatus)) {
      return res.status(400).json({
        success: false,
        error: "swap_status must be one of 'PENDING', 'APPROVED', 'REJECTED', or 'NONE'",
      });
    }

    const updates = [];
    const values = [];

    if (targetSwappedFaculty) {
      values.push(targetSwappedFaculty);
      updates.push(`swapped_faculty_id = $${values.length}`);
    }

    values.push(newSwapStatus);
    updates.push(`swap_status = $${values.length}`);

    values.push(id);
    const updateQuery = `
      UPDATE timetable_slots
      SET ${updates.join(', ')}
      WHERE id = $${values.length}
      RETURNING *;
    `;

    const result = await pool.query(updateQuery, values);
    const updatedSlot = result.rows[0];

    const dbReceipt = {
      receiptId: `RCPT-TTSWAP-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
      transactionId: `tx_ttswap_${id.substring(0, 8)}_${Date.now()}`,
      table: 'timetable_slots',
      recordId: id,
      swapStatus: newSwapStatus,
      updatedBy: req.user.userId || req.user.id,
      timestamp: new Date().toISOString(),
    };

    return res.status(200).json({
      success: true,
      message: `Timetable slot swap status updated to '${newSwapStatus}'`,
      dbReceipt,
      slot: updatedSlot,
    });
  } catch (error) {
    console.error('swapTimetableSlot error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to update slot swap' });
  }
}

export default {
  masterSetup,
  getDailyView,
  createSwapRequest,
  approveSwap,
  getTimetableSlots,
  createTimetableSlots,
  swapTimetableSlot,
};

