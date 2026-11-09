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

export default {
  masterSetup,
  getDailyView,
  createSwapRequest,
  approveSwap,
};

