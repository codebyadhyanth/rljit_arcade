import { pool } from '../config/db.js';
import { decryptAES } from '../utils/crypto.util.js';
import { getNextSequence } from '../utils/username.util.js';

/**
 * Helper to decrypt user contact fields (name, email, phone)
 */
function decryptUserContact(userRow, fallbackFaculty = null) {
  let name = fallbackFaculty?.full_name || '';
  let email = fallbackFaculty?.email || '';
  let phone = '';

  try {
    if (!name && userRow?.full_name_encrypted) {
      name = decryptAES(userRow.full_name_encrypted);
    }
  } catch {
    name = userRow?.username || 'Authorized User';
  }

  try {
    if (!email && userRow?.email_encrypted) {
      email = decryptAES(userRow.email_encrypted);
    }
  } catch {
    email = '';
  }

  try {
    if (userRow?.phone_encrypted) {
      phone = decryptAES(userRow.phone_encrypted);
    }
  } catch {
    phone = '';
  }

  return { name, email, phone };
}

/**
 * Helper to fetch conflicting booking details for 409 Conflict responses
 */
async function getConflictingBookingDetails(client, venueId, startTime, endTime) {
  const query = `
    SELECT b.id AS booking_id, b.booking_code, b.event_title, b.purpose,
           b.event_start_time, b.event_end_time, b.status,
           u.id AS coordinator_user_id, u.username AS coordinator_username,
           u.full_name_encrypted, u.email_encrypted, u.phone_encrypted, u.department AS coordinator_user_dept,
           f.full_name AS faculty_name, f.email AS faculty_email, f.department AS faculty_dept,
           f.designation, f.cabin_room
    FROM venue_bookings b
    JOIN users u ON b.coordinator_id = u.id
    LEFT JOIN faculty f ON f.user_id = u.id
    WHERE b.venue_id = $1
      AND b.buffered_time_range && tstzrange(($2::timestamptz - INTERVAL '30 minutes'), ($3::timestamptz + INTERVAL '30 minutes'), '[)')
      AND b.status IN ('PENDING_HOD', 'PENDING_PRINCIPAL', 'PARTIALLY_ACCEPTED', 'APPROVED')
    ORDER BY b.event_start_time ASC
    LIMIT 1;
  `;
  const res = await client.query(query, [venueId, startTime, endTime]);
  if (res.rowCount === 0) return null;

  const row = res.rows[0];
  const contact = decryptUserContact(row, { full_name: row.faculty_name, email: row.faculty_email });

  return {
    booking_id: row.booking_id,
    booking_code: row.booking_code,
    event_title: row.event_title,
    purpose: row.purpose,
    event_start_time: row.event_start_time,
    event_end_time: row.event_end_time,
    status: row.status,
    coordinator: {
      id: row.coordinator_user_id,
      username: row.coordinator_username,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      department: row.faculty_dept || row.coordinator_user_dept,
      designation: row.designation || 'Faculty Coordinator',
      cabin_room: row.cabin_room || 'N/A',
    },
  };
}

/**
 * 1. POST /api/v1/venues
 * Create a new campus venue (Super Admin only)
 */
export async function createVenue(req, res) {
  try {
    const {
      name,
      type,
      department,
      location_details,
      capacity,
      facilities = [],
      is_active = true,
    } = req.body;

    if (!name || !type || !capacity) {
      return res.status(400).json({
        success: false,
        error: 'name, type, and capacity are required fields',
      });
    }

    const validTypes = ['AUDITORIUM', 'SEMINAR_HALL', 'CONFERENCE_ROOM', 'LAB', 'OPEN_AIR_THEATRE'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid venue type. Allowed: ${validTypes.join(', ')}`,
      });
    }

    const capNum = parseInt(capacity, 10);
    if (isNaN(capNum) || capNum <= 0) {
      return res.status(400).json({
        success: false,
        error: 'capacity must be a positive integer',
      });
    }

    const createdBy = req.user.userId || req.user.id;

    const query = `
      INSERT INTO venues (name, type, department, location_details, capacity, facilities, is_active, created_by)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
      RETURNING *;
    `;
    const values = [
      name.trim(),
      type,
      department ? department.trim() : null,
      location_details ? location_details.trim() : null,
      capNum,
      JSON.stringify(facilities),
      Boolean(is_active),
      createdBy,
    ];

    const result = await pool.query(query, values);
    return res.status(201).json({
      success: true,
      message: 'Venue created successfully',
      venue: result.rows[0],
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'A venue with this name already exists',
      });
    }
    console.error('createVenue error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to create venue',
    });
  }
}

/**
 * 2. GET /api/v1/venues
 * List all active venues with optional filters (?type=&min_capacity=&department=)
 */
export async function listVenues(req, res) {
  try {
    const { type, min_capacity, department, is_active } = req.query;

    const conditions = [];
    const values = [];

    if (type) {
      values.push(type.toUpperCase());
      conditions.push(`type = $${values.length}`);
    }

    if (min_capacity) {
      const minCap = parseInt(min_capacity, 10);
      if (!isNaN(minCap)) {
        values.push(minCap);
        conditions.push(`capacity >= $${values.length}`);
      }
    }

    if (department) {
      values.push(department.toUpperCase());
      conditions.push(`department = $${values.length}`);
    }

    if (is_active !== 'all') {
      const activeBool = is_active === 'false' ? false : true;
      values.push(activeBool);
      conditions.push(`is_active = $${values.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const query = `
      SELECT id, name, type, department, location_details, capacity, facilities, is_active, created_at, updated_at
      FROM venues
      ${whereClause}
      ORDER BY name ASC;
    `;

    const result = await pool.query(query, values);
    return res.status(200).json({
      success: true,
      count: result.rowCount,
      venues: result.rows,
    });
  } catch (err) {
    console.error('listVenues error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to retrieve venues',
    });
  }
}

/**
 * 3. PATCH /api/v1/venues/:venueId
 * Update venue details or active status (Super Admin only)
 */
export async function updateVenue(req, res) {
  try {
    const { venueId } = req.params;
    const { name, type, department, location_details, capacity, facilities, is_active } = req.body;

    const check = await pool.query('SELECT * FROM venues WHERE id = $1', [venueId]);
    if (check.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Venue not found' });
    }

    const updates = [];
    const values = [];

    if (name !== undefined) {
      values.push(name.trim());
      updates.push(`name = $${values.length}`);
    }
    if (type !== undefined) {
      const validTypes = ['AUDITORIUM', 'SEMINAR_HALL', 'CONFERENCE_ROOM', 'LAB', 'OPEN_AIR_THEATRE'];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ success: false, error: `Invalid venue type. Allowed: ${validTypes.join(', ')}` });
      }
      values.push(type);
      updates.push(`type = $${values.length}`);
    }
    if (department !== undefined) {
      values.push(department ? department.trim() : null);
      updates.push(`department = $${values.length}`);
    }
    if (location_details !== undefined) {
      values.push(location_details ? location_details.trim() : null);
      updates.push(`location_details = $${values.length}`);
    }
    if (capacity !== undefined) {
      const cap = parseInt(capacity, 10);
      if (isNaN(cap) || cap <= 0) {
        return res.status(400).json({ success: false, error: 'capacity must be positive integer' });
      }
      values.push(cap);
      updates.push(`capacity = $${values.length}`);
    }
    if (facilities !== undefined) {
      values.push(JSON.stringify(facilities));
      updates.push(`facilities = $${values.length}::jsonb`);
    }
    if (is_active !== undefined) {
      values.push(Boolean(is_active));
      updates.push(`is_active = $${values.length}`);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields provided for update' });
    }

    updates.push('updated_at = NOW()');
    values.push(venueId);

    const query = `
      UPDATE venues
      SET ${updates.join(', ')}
      WHERE id = $${values.length}
      RETURNING *;
    `;

    const result = await pool.query(query, values);
    return res.status(200).json({
      success: true,
      message: 'Venue updated successfully',
      venue: result.rows[0],
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: 'A venue with this name already exists' });
    }
    console.error('updateVenue error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to update venue' });
  }
}

/**
 * 4. GET /api/v1/venues/availability
 * Check slot availability; if occupied, returns "Place already occupied... kindly look for another one." + Coordinator contact details
 */
export async function checkAvailability(req, res) {
  try {
    const { venue_id, start_time, end_time } = req.query;

    if (!start_time || !end_time) {
      return res.status(400).json({
        success: false,
        error: 'start_time and end_time query parameters are required',
      });
    }

    const startDate = new Date(start_time);
    const endDate = new Date(end_time);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid date/time format' });
    }
    if (startDate >= endDate) {
      return res.status(400).json({ success: false, error: 'start_time must be earlier than end_time' });
    }

    // Specific venue availability check
    if (venue_id) {
      const venueCheck = await pool.query('SELECT * FROM venues WHERE id = $1', [venue_id]);
      if (venueCheck.rowCount === 0) {
        return res.status(404).json({ success: false, error: 'Venue not found' });
      }
      if (!venueCheck.rows[0].is_active) {
        return res.status(400).json({ success: false, error: 'Venue is currently deactivated' });
      }

      const conflicting = await getConflictingBookingDetails(pool, venue_id, start_time, end_time);

      if (conflicting) {
        return res.status(200).json({
          success: true,
          is_available: false,
          message: 'Place already occupied... kindly look for another one.',
          venue: {
            id: venueCheck.rows[0].id,
            name: venueCheck.rows[0].name,
            capacity: venueCheck.rows[0].capacity,
          },
          current_booking: conflicting,
        });
      }

      return res.status(200).json({
        success: true,
        is_available: true,
        message: 'Venue is available for booking.',
        venue: {
          id: venueCheck.rows[0].id,
          name: venueCheck.rows[0].name,
          capacity: venueCheck.rows[0].capacity,
        },
      });
    }

    // If venue_id not specified, return availability summary across all active venues
    const allVenues = await pool.query('SELECT id, name, type, capacity FROM venues WHERE is_active = true ORDER BY name');
    const results = [];

    for (const v of allVenues.rows) {
      const conflicting = await getConflictingBookingDetails(pool, v.id, start_time, end_time);
      results.push({
        venue_id: v.id,
        venue_name: v.name,
        capacity: v.capacity,
        is_available: !conflicting,
        current_booking: conflicting,
      });
    }

    return res.status(200).json({
      success: true,
      time_window: { start_time, end_time },
      venues: results,
    });
  } catch (err) {
    console.error('checkAvailability error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Availability check failed' });
  }
}

/**
 * 5. POST /api/v1/venues/bookings
 * Initiate a venue booking request (enforces mandatory coordinator & 24h cancel cooldown)
 */
export async function initiateBooking(req, res) {
  const client = await pool.connect();
  try {
    const {
      venue_id,
      coordinator_id,
      event_title,
      purpose,
      expected_headcount,
      event_start_time,
      event_end_time,
      department,
    } = req.body;

    if (!venue_id || !event_title || !purpose || !expected_headcount || !event_start_time || !event_end_time) {
      return res.status(400).json({
        success: false,
        error: 'venue_id, event_title, purpose, expected_headcount, event_start_time, and event_end_time are required',
      });
    }

    const startDate = new Date(event_start_time);
    const endDate = new Date(event_end_time);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid event date/time format' });
    }
    if (startDate >= endDate) {
      return res.status(400).json({ success: false, error: 'event_start_time must be strictly earlier than event_end_time' });
    }
    if (startDate < new Date(Date.now() - 5 * 60 * 1000)) {
      return res.status(400).json({ success: false, error: 'Cannot book a venue for past timestamps' });
    }

    const headcount = parseInt(expected_headcount, 10);
    if (isNaN(headcount) || headcount <= 0) {
      return res.status(400).json({ success: false, error: 'expected_headcount must be a positive integer' });
    }

    const initiatorId = req.user.userId || req.user.id;
    const initiatorRole = req.user.baseRole || req.user.base_role || 'STUDENT';

    // Verify Venue & Capacity
    const venueRes = await client.query('SELECT * FROM venues WHERE id = $1', [venue_id]);
    if (venueRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Target venue not found' });
    }
    const venue = venueRes.rows[0];
    if (!venue.is_active) {
      return res.status(400).json({ success: false, error: 'Venue is currently deactivated' });
    }
    if (headcount > venue.capacity) {
      return res.status(400).json({
        success: false,
        error: `Expected headcount (${headcount}) exceeds venue capacity (${venue.capacity})`,
      });
    }

    // Mandatory Faculty Coordinator Resolution
    let finalCoordinatorId = coordinator_id;

    if (initiatorRole === 'STUDENT') {
      if (!coordinator_id) {
        return res.status(400).json({
          success: false,
          error: 'A mandatory Faculty Coordinator (coordinator_id) is required for student venue bookings',
        });
      }
      const coordCheck = await client.query(
        "SELECT id, base_role, is_active FROM users WHERE id = $1 AND base_role = 'FACULTY' AND is_active = true",
        [coordinator_id]
      );
      if (coordCheck.rowCount === 0) {
        return res.status(400).json({
          success: false,
          error: 'Assigned coordinator must be an active Faculty member in the institution',
        });
      }
    } else if (initiatorRole === 'FACULTY') {
      if (!finalCoordinatorId) {
        finalCoordinatorId = initiatorId; // Faculty defaults to self
      } else {
        const coordCheck = await client.query(
          "SELECT id, base_role, is_active FROM users WHERE id = $1 AND base_role = 'FACULTY' AND is_active = true",
          [finalCoordinatorId]
        );
        if (coordCheck.rowCount === 0) {
          return res.status(400).json({
            success: false,
            error: 'Assigned coordinator must be an active Faculty member',
          });
        }
      }
    } else {
      // Super Admin or Section Admin
      finalCoordinatorId = coordinator_id || initiatorId;
    }

    // Determine booking department (for routing to respective HOD)
    const bookingDept = department ? department.trim().toUpperCase() : (req.user.department || venue.department || 'CENTRAL');

    // ─── PostgreSQL 24-Hour Cancellation Cooldown Check (No Redis) ───
    const cooldownQuery = `
      SELECT id, cancelled_at FROM venue_bookings
      WHERE venue_id = $1
        AND (initiator_id = $2 OR coordinator_id = $2)
        AND status = 'CANCELLED'
        AND cancelled_at > NOW() - INTERVAL '24 hours'
      LIMIT 1;
    `;
    const cooldownRes = await client.query(cooldownQuery, [venue_id, initiatorId]);
    if (cooldownRes.rowCount > 0) {
      return res.status(403).json({
        success: false,
        error: 'You recently cancelled a booking for this venue. You cannot immediately initiate a request for the same place again until the 24-hour cooldown expires.',
        cancelled_at: cooldownRes.rows[0].cancelled_at,
      });
    }

    // Begin Transaction for Atomic Sequence & Booking Insertion
    await client.query('BEGIN');

    // Generate Human-Readable Booking Code: VB-YYYY-XXXX
    const currentYear = new Date().getFullYear();
    const seq = await getNextSequence(`VB-${currentYear}`, 1, client);
    const bookingCode = `VB-${currentYear}-${String(seq).padStart(4, '0')}`;

    // Insert Venue Booking with GIST exclusion constraint check
    const insertBookingQuery = `
      INSERT INTO venue_bookings (
        booking_code, venue_id, initiator_id, initiator_role, coordinator_id,
        department, event_title, purpose, expected_headcount,
        event_start_time, event_end_time, buffered_time_range, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
        tstzrange(($10::timestamptz - INTERVAL '30 minutes'), ($11::timestamptz + INTERVAL '30 minutes'), '[)'),
        'PENDING_HOD'
      )
      RETURNING *;
    `;

    const bookingRes = await client.query(insertBookingQuery, [
      bookingCode,
      venue_id,
      initiatorId,
      initiatorRole,
      finalCoordinatorId,
      bookingDept,
      event_title.trim(),
      purpose.trim(),
      headcount,
      event_start_time,
      event_end_time,
    ]);

    const createdBooking = bookingRes.rows[0];

    // Log in booking_timeline_logs
    const logQuery = `
      INSERT INTO booking_timeline_logs (
        booking_id, actor_id, actor_role, action,
        previous_status, new_status, message, metadata
      ) VALUES ($1, $2, $3, 'INITIATED', NULL, 'PENDING_HOD', $4, $5::jsonb);
    `;
    await client.query(logQuery, [
      createdBooking.id,
      initiatorId,
      initiatorRole,
      `Venue booking request initiated by ${req.user.username} for ${venue.name}`,
      JSON.stringify({
        venue_name: venue.name,
        expected_headcount: headcount,
        event_start_time,
        event_end_time,
      }),
    ]);

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: 'Venue booking request initiated successfully. Awaiting Department HOD review.',
      booking: createdBooking,
    });
  } catch (err) {
    await client.query('ROLLBACK');

    // Handle PostgreSQL GIST Exclusion Constraint Conflict (Error Code: 23P01)
    if (err.code === '23P01') {
      const conflicting = await getConflictingBookingDetails(
        pool,
        req.body.venue_id,
        req.body.event_start_time,
        req.body.event_end_time
      );

      return res.status(409).json({
        success: false,
        is_available: false,
        message: 'Place already occupied... kindly look for another one.',
        current_booking: conflicting,
      });
    }

    console.error('initiateBooking error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to initiate booking' });
  } finally {
    client.release();
  }
}

/**
 * 6. GET /api/v1/venues/bookings
 * List bookings (filtered by role: Student/Faculty sees own, HOD sees dept, Principal/Admin sees all)
 */
export async function listBookings(req, res) {
  try {
    const { status, venue_id, department, from_date, to_date } = req.query;
    const userId = req.user.userId || req.user.id;
    const baseRole = req.user.baseRole || req.user.base_role;
    const adminTier = req.user.adminTier || req.user.admin_tier;
    const subRoles = req.user.subRoles || req.user.sub_roles || [];

    const isSuperAdmin = adminTier === 'SUPER_ADMIN';
    const isPrincipal =
      isSuperAdmin ||
      (Array.isArray(subRoles) && subRoles.includes('PRINCIPAL')) ||
      req.user.sectionCode === 'PRN' ||
      req.user.section_code === 'PRN';
    const isHod =
      adminTier === 'HOD_ADMIN' ||
      (Array.isArray(subRoles) && subRoles.includes('HOD'));

    const conditions = [];
    const values = [];

    // Role-based visibility scoping
    if (isSuperAdmin || isPrincipal) {
      // Sees all bookings
    } else if (isHod) {
      // HOD sees department bookings + own initiated/coordinated
      const userDept = req.user.department || '';
      values.push(userDept);
      values.push(userId);
      conditions.push(`(b.department = $${values.length - 1} OR b.initiator_id = $${values.length} OR b.coordinator_id = $${values.length})`);
    } else {
      // Student / Faculty sees only bookings they initiated or coordinate
      values.push(userId);
      conditions.push(`(b.initiator_id = $${values.length} OR b.coordinator_id = $${values.length})`);
    }

    if (status) {
      values.push(status.toUpperCase());
      conditions.push(`b.status = $${values.length}`);
    }
    if (venue_id) {
      values.push(venue_id);
      conditions.push(`b.venue_id = $${values.length}`);
    }
    if (department) {
      values.push(department.toUpperCase());
      conditions.push(`b.department = $${values.length}`);
    }
    if (from_date) {
      values.push(from_date);
      conditions.push(`b.event_start_time >= $${values.length}::timestamptz`);
    }
    if (to_date) {
      values.push(to_date);
      conditions.push(`b.event_end_time <= $${values.length}::timestamptz`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT b.id, b.booking_code, b.venue_id, v.name AS venue_name, v.type AS venue_type,
             b.initiator_id, u_init.username AS initiator_username, b.initiator_role,
             b.coordinator_id, u_coord.username AS coordinator_username,
             b.department, b.event_title, b.purpose, b.expected_headcount,
             b.event_start_time, b.event_end_time, b.status,
             b.active_terms_and_conditions,
             b.hod_approved_at, b.principal_approved_at,
             b.cancelled_at, b.cancellation_reason,
             b.created_at, b.updated_at
      FROM venue_bookings b
      JOIN venues v ON b.venue_id = v.id
      JOIN users u_init ON b.initiator_id = u_init.id
      JOIN users u_coord ON b.coordinator_id = u_coord.id
      ${whereClause}
      ORDER BY b.event_start_time DESC;
    `;

    const result = await pool.query(query, values);
    return res.status(200).json({
      success: true,
      count: result.rowCount,
      bookings: result.rows,
    });
  } catch (err) {
    console.error('listBookings error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to list bookings' });
  }
}

/**
 * 7. GET /api/v1/venues/bookings/:id
 * Full audit payload: initiator, coordinator contact, approvers, timestamps, duration, terms, and timeline logs
 */
export async function getBookingDetails(req, res) {
  try {
    const { id } = req.params;

    const bookingQuery = `
      SELECT b.*,
             v.name AS venue_name, v.type AS venue_type, v.department AS venue_department,
             v.location_details AS venue_location, v.capacity AS venue_capacity, v.facilities AS venue_facilities,
             u_init.username AS initiator_username, u_init.full_name_encrypted AS init_name_enc,
             u_init.email_encrypted AS init_email_enc, u_init.phone_encrypted AS init_phone_enc,
             u_coord.username AS coordinator_username, u_coord.full_name_encrypted AS coord_name_enc,
             u_coord.email_encrypted AS coord_email_enc, u_coord.phone_encrypted AS coord_phone_enc,
             f_coord.designation AS coord_designation, f_coord.cabin_room AS coord_cabin,
             f_coord.full_name AS coord_faculty_name, f_coord.email AS coord_faculty_email,
             u_hod.username AS hod_approver_username,
             u_prn.username AS principal_approver_username,
             u_can.username AS cancelled_by_username
      FROM venue_bookings b
      JOIN venues v ON b.venue_id = v.id
      JOIN users u_init ON b.initiator_id = u_init.id
      JOIN users u_coord ON b.coordinator_id = u_coord.id
      LEFT JOIN faculty f_coord ON f_coord.user_id = u_coord.id
      LEFT JOIN users u_hod ON b.hod_approved_by = u_hod.id
      LEFT JOIN users u_prn ON b.principal_approved_by = u_prn.id
      LEFT JOIN users u_can ON b.cancelled_by = u_can.id
      WHERE b.id = $1;
    `;

    const bookingRes = await pool.query(bookingQuery, [id]);
    if (bookingRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    const row = bookingRes.rows[0];

    // Decrypt contacts
    const initContact = decryptUserContact({
      username: row.initiator_username,
      full_name_encrypted: row.init_name_enc,
      email_encrypted: row.init_email_enc,
      phone_encrypted: row.init_phone_enc,
    });

    const coordContact = decryptUserContact(
      {
        username: row.coordinator_username,
        full_name_encrypted: row.coord_name_enc,
        email_encrypted: row.coord_email_enc,
        phone_encrypted: row.coord_phone_enc,
      },
      { full_name: row.coord_faculty_name, email: row.coord_faculty_email }
    );

    // Timeline logs
    const logsQuery = `
      SELECT l.id, l.actor_id, u.username AS actor_username, l.actor_role,
             l.action, l.previous_status, l.new_status, l.message, l.metadata, l.created_at
      FROM booking_timeline_logs l
      LEFT JOIN users u ON l.actor_id = u.id
      WHERE l.booking_id = $1
      ORDER BY l.created_at ASC;
    `;
    const logsRes = await pool.query(logsQuery, [id]);

    // Transfer requests
    const transfersQuery = `
      SELECT t.id, t.requester_id, u_req.username AS requester_username,
             t.new_coordinator_id, u_nc.username AS new_coordinator_username,
             t.new_event_title, t.new_purpose, t.urgency_reason,
             t.status, t.response_message, t.created_at, t.responded_at
      FROM venue_transfer_requests t
      JOIN users u_req ON t.requester_id = u_req.id
      JOIN users u_nc ON t.new_coordinator_id = u_nc.id
      WHERE t.booking_id = $1
      ORDER BY t.created_at DESC;
    `;
    const transfersRes = await pool.query(transfersQuery, [id]);

    const durationMinutes = Math.round(
      (new Date(row.event_end_time).getTime() - new Date(row.event_start_time).getTime()) / (60 * 1000)
    );

    return res.status(200).json({
      success: true,
      booking: {
        id: row.id,
        booking_code: row.booking_code,
        venue: {
          id: row.venue_id,
          name: row.venue_name,
          type: row.venue_type,
          department: row.venue_department,
          location_details: row.venue_location,
          capacity: row.venue_capacity,
          facilities: row.venue_facilities,
        },
        initiator: {
          id: row.initiator_id,
          username: row.initiator_username,
          name: initContact.name,
          email: initContact.email,
          phone: initContact.phone,
          role: row.initiator_role,
          department: row.department,
        },
        initiated_at: row.created_at,
        coordinator: {
          id: row.coordinator_id,
          username: row.coordinator_username,
          name: coordContact.name,
          email: coordContact.email,
          phone: coordContact.phone,
          department: row.department,
          designation: row.coord_designation || 'Faculty Coordinator',
          cabin_room: row.coord_cabin || 'N/A',
        },
        event: {
          title: row.event_title,
          purpose: row.purpose,
          expected_headcount: row.expected_headcount,
          start_time: row.event_start_time,
          end_time: row.event_end_time,
          duration_minutes: durationMinutes,
          buffered_time_range: row.buffered_time_range,
        },
        status: row.status,
        active_terms_and_conditions: row.active_terms_and_conditions,
        rejection_reason: row.rejection_reason,
        approvals: {
          hod: {
            approved_by: row.hod_approved_by,
            username: row.hod_approver_username,
            approved_at: row.hod_approved_at,
          },
          principal: {
            approved_by: row.principal_approved_by,
            username: row.principal_approver_username,
            approved_at: row.principal_approved_at,
          },
        },
        cancellation: row.cancelled_at
          ? {
              cancelled_by: row.cancelled_by,
              username: row.cancelled_by_username,
              cancelled_at: row.cancelled_at,
              reason: row.cancellation_reason,
            }
          : null,
        timeline_logs: logsRes.rows,
        transfer_requests: transfersRes.rows,
        updated_at: row.updated_at,
      },
    });
  } catch (err) {
    console.error('getBookingDetails error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to fetch booking details' });
  }
}

/**
 * 8. PATCH /api/v1/venues/bookings/:id/hod-review
 * HOD Review: Approve ('PENDING_PRINCIPAL'), Reject ('REJECTED'), or Partially Accept ('PARTIALLY_ACCEPTED')
 */
export async function hodReview(req, res) {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { action, reason, terms_and_conditions } = req.body;

    if (!['APPROVE', 'REJECT', 'PARTIAL'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: "Action must be one of 'APPROVE', 'REJECT', or 'PARTIAL'",
      });
    }

    const bookingRes = await client.query('SELECT * FROM venue_bookings WHERE id = $1', [id]);
    if (bookingRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }
    const booking = bookingRes.rows[0];

    // Department verification (unless Super Admin)
    const isSuperAdmin = req.user.adminTier === 'SUPER_ADMIN' || req.user.admin_tier === 'SUPER_ADMIN';
    if (!isSuperAdmin && req.user.department && req.user.department !== booking.department) {
      return res.status(403).json({
        success: false,
        error: `Forbidden: HOD can only review bookings for Department of ${req.user.department}`,
      });
    }

    // Must be in PENDING_HOD or PARTIALLY_ACCEPTED (if returned to HOD)
    if (!['PENDING_HOD', 'PARTIALLY_ACCEPTED'].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        error: `Cannot perform HOD review on a booking in '${booking.status}' status`,
      });
    }

    const reviewerId = req.user.userId || req.user.id;
    let newStatus = '';
    let actionLog = '';
    let logMessage = '';
    let updateFields = [];
    let updateValues = [];

    await client.query('BEGIN');

    if (action === 'APPROVE') {
      newStatus = 'PENDING_PRINCIPAL';
      actionLog = 'HOD_APPROVED';
      logMessage = `HOD approved the booking. Transferred to Principal for final clearance.`;
      updateFields = [
        'status = $1',
        'hod_approved_by = $2',
        'hod_approved_at = NOW()',
        'active_terms_and_conditions = NULL',
        'updated_at = NOW()',
      ];
      updateValues = [newStatus, reviewerId, id];
    } else if (action === 'REJECT') {
      if (!reason) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: 'Rejection reason is required' });
      }
      newStatus = 'REJECTED';
      actionLog = 'HOD_REJECTED';
      logMessage = `HOD rejected booking: ${reason}`;
      updateFields = [
        'status = $1',
        'rejection_reason = $2',
        'updated_at = NOW()',
      ];
      updateValues = [newStatus, reason, id];
    } else if (action === 'PARTIAL') {
      if (!terms_and_conditions) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: 'terms_and_conditions are required for partial acceptance' });
      }
      newStatus = 'PARTIALLY_ACCEPTED';
      actionLog = 'HOD_PARTIAL_TERMS';
      logMessage = `HOD issued conditional partial acceptance with specified terms`;
      const termsPayload = {
        stage: 'HOD',
        terms: Array.isArray(terms_and_conditions) ? terms_and_conditions : [terms_and_conditions],
        reason: reason || 'Conditional acceptance by HOD',
        imposed_by: reviewerId,
        imposed_at: new Date().toISOString(),
      };
      updateFields = [
        'status = $1',
        'active_terms_and_conditions = $2::jsonb',
        'updated_at = NOW()',
      ];
      updateValues = [newStatus, JSON.stringify(termsPayload), id];
    }

    const updateQuery = `
      UPDATE venue_bookings
      SET ${updateFields.join(', ')}
      WHERE id = $${updateValues.length}
      RETURNING *;
    `;
    const updatedRes = await client.query(updateQuery, updateValues);

    // Audit log
    await client.query(
      `INSERT INTO booking_timeline_logs (booking_id, actor_id, actor_role, action, previous_status, new_status, message, metadata)
       VALUES ($1, $2, 'HOD', $3, $4, $5, $6, $7::jsonb)`,
      [
        id,
        reviewerId,
        actionLog,
        booking.status,
        newStatus,
        logMessage,
        JSON.stringify({ terms: terms_and_conditions, reason }),
      ]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: `HOD review action '${action}' recorded successfully`,
      booking: updatedRes.rows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('hodReview error:', err);
    return res.status(500).json({ success: false, error: err.message || 'HOD review failed' });
  } finally {
    client.release();
  }
}

/**
 * 9. PATCH /api/v1/venues/bookings/:id/principal-review
 * Principal Review: Approve ('APPROVED'), Reject ('REJECTED'), or Partially Accept ('PARTIALLY_ACCEPTED')
 */
export async function principalReview(req, res) {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { action, reason, terms_and_conditions } = req.body;

    if (!['APPROVE', 'REJECT', 'PARTIAL'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: "Action must be one of 'APPROVE', 'REJECT', or 'PARTIAL'",
      });
    }

    const bookingRes = await client.query('SELECT * FROM venue_bookings WHERE id = $1', [id]);
    if (bookingRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }
    const booking = bookingRes.rows[0];

    // Must be in PENDING_PRINCIPAL
    if (booking.status !== 'PENDING_PRINCIPAL') {
      return res.status(400).json({
        success: false,
        error: `Cannot perform Principal review on a booking in '${booking.status}' status. HOD approval is required first.`,
      });
    }

    const reviewerId = req.user.userId || req.user.id;
    let newStatus = '';
    let actionLog = '';
    let logMessage = '';
    let updateFields = [];
    let updateValues = [];

    await client.query('BEGIN');

    if (action === 'APPROVE') {
      newStatus = 'APPROVED';
      actionLog = 'PRINCIPAL_APPROVED';
      logMessage = `Principal granted final sign-off. Venue officially allotted.`;
      updateFields = [
        'status = $1',
        'principal_approved_by = $2',
        'principal_approved_at = NOW()',
        'active_terms_and_conditions = NULL',
        'updated_at = NOW()',
      ];
      updateValues = [newStatus, reviewerId, id];
    } else if (action === 'REJECT') {
      if (!reason) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: 'Rejection reason is required' });
      }
      newStatus = 'REJECTED';
      actionLog = 'PRINCIPAL_REJECTED';
      logMessage = `Principal rejected booking: ${reason}`;
      updateFields = [
        'status = $1',
        'rejection_reason = $2',
        'updated_at = NOW()',
      ];
      updateValues = [newStatus, reason, id];
    } else if (action === 'PARTIAL') {
      if (!terms_and_conditions) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: 'terms_and_conditions are required for partial acceptance' });
      }
      newStatus = 'PARTIALLY_ACCEPTED';
      actionLog = 'PRINCIPAL_PARTIAL_TERMS';
      logMessage = `Principal issued conditional partial acceptance with specified terms`;
      const termsPayload = {
        stage: 'PRINCIPAL',
        terms: Array.isArray(terms_and_conditions) ? terms_and_conditions : [terms_and_conditions],
        reason: reason || 'Conditional acceptance by Principal',
        imposed_by: reviewerId,
        imposed_at: new Date().toISOString(),
      };
      updateFields = [
        'status = $1',
        'active_terms_and_conditions = $2::jsonb',
        'updated_at = NOW()',
      ];
      updateValues = [newStatus, JSON.stringify(termsPayload), id];
    }

    const updateQuery = `
      UPDATE venue_bookings
      SET ${updateFields.join(', ')}
      WHERE id = $${updateValues.length}
      RETURNING *;
    `;
    const updatedRes = await client.query(updateQuery, updateValues);

    // Audit log
    await client.query(
      `INSERT INTO booking_timeline_logs (booking_id, actor_id, actor_role, action, previous_status, new_status, message, metadata)
       VALUES ($1, $2, 'PRINCIPAL', $3, $4, $5, $6, $7::jsonb)`,
      [
        id,
        reviewerId,
        actionLog,
        booking.status,
        newStatus,
        logMessage,
        JSON.stringify({ terms: terms_and_conditions, reason }),
      ]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: `Principal review action '${action}' recorded successfully`,
      booking: updatedRes.rows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('principalReview error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Principal review failed' });
  } finally {
    client.release();
  }
}

/**
 * 10. PATCH /api/v1/venues/bookings/:id/coordinator-response
 * Coordinator Terms Negotiation (Accessible ONLY by the booking's coordinator_id)
 */
export async function coordinatorResponse(req, res) {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const {
      agree_to_terms,
      coordinator_message,
      updated_start_time,
      updated_end_time,
      updated_headcount,
    } = req.body;

    if (agree_to_terms === undefined) {
      return res.status(400).json({ success: false, error: 'agree_to_terms (boolean) is required' });
    }

    const bookingRes = await client.query('SELECT * FROM venue_bookings WHERE id = $1', [id]);
    if (bookingRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }
    const booking = bookingRes.rows[0];

    // Authorization check: Only coordinator (or Super Admin) can respond
    const userId = req.user.userId || req.user.id;
    const isSuperAdmin = req.user.adminTier === 'SUPER_ADMIN' || req.user.admin_tier === 'SUPER_ADMIN';
    if (booking.coordinator_id !== userId && !isSuperAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Only the assigned Faculty Venue Coordinator can respond to conditional terms',
      });
    }

    if (booking.status !== 'PARTIALLY_ACCEPTED') {
      return res.status(400).json({
        success: false,
        error: `Coordinator response is only valid when status is 'PARTIALLY_ACCEPTED' (current: '${booking.status}')`,
      });
    }

    const currentTerms = booking.active_terms_and_conditions || {};
    const imposedStage = currentTerms.stage || 'HOD';

    await client.query('BEGIN');

    let newStatus = '';
    let actionLog = '';
    let logMessage = '';

    if (agree_to_terms === true) {
      actionLog = 'COORDINATOR_AGREED_TERMS';
      logMessage = `Coordinator agreed to imposed terms: ${coordinator_message || 'Terms accepted'}`;

      // If agreed, transition to PENDING_PRINCIPAL for final clearance
      newStatus = 'PENDING_PRINCIPAL';

      const updatedTerms = {
        ...currentTerms,
        coordinator_agreed: true,
        coordinator_agreed_at: new Date().toISOString(),
        coordinator_message: coordinator_message || 'Agreed to terms',
      };

      const updateFields = [
        'status = $1',
        'active_terms_and_conditions = $2::jsonb',
        'updated_at = NOW()',
      ];
      const updateValues = [newStatus, JSON.stringify(updatedTerms)];

      // Apply modified times if provided by coordinator
      if (updated_start_time && updated_end_time) {
        updateValues.push(updated_start_time, updated_end_time);
        updateFields.push(`event_start_time = $${updateValues.length - 1}`);
        updateFields.push(`event_end_time = $${updateValues.length}`);
        updateFields.push(
          `buffered_time_range = tstzrange(($${updateValues.length - 1}::timestamptz - INTERVAL '30 minutes'), ($${updateValues.length}::timestamptz + INTERVAL '30 minutes'), '[)')`
        );
      }

      if (updated_headcount) {
        updateValues.push(parseInt(updated_headcount, 10));
        updateFields.push(`expected_headcount = $${updateValues.length}`);
      }

      updateValues.push(id);
      const updateQuery = `
        UPDATE venue_bookings
        SET ${updateFields.join(', ')}
        WHERE id = $${updateValues.length}
        RETURNING *;
      `;
      const updatedBooking = await client.query(updateQuery, updateValues);

      // Audit log
      await client.query(
        `INSERT INTO booking_timeline_logs (booking_id, actor_id, actor_role, action, previous_status, new_status, message, metadata)
         VALUES ($1, $2, 'FACULTY', $3, 'PARTIALLY_ACCEPTED', $4, $5, $6::jsonb)`,
        [id, userId, actionLog, newStatus, logMessage, JSON.stringify({ coordinator_message, updated_start_time, updated_end_time })]
      );

      await client.query('COMMIT');
      return res.status(200).json({
        success: true,
        message: 'Coordinator agreement recorded. Booking escalated to Principal review.',
        booking: updatedBooking.rows[0],
      });
    } else {
      // Coordinator proposed a counter-requirement / declined terms
      actionLog = 'COORDINATOR_COUNTER_PROPOSAL';
      logMessage = `Coordinator posted counter-requirement: ${coordinator_message || 'Terms not agreed'}`;

      // Return to whichever authority imposed the partial terms
      newStatus = imposedStage === 'PRINCIPAL' ? 'PENDING_PRINCIPAL' : 'PENDING_HOD';

      const updatedTerms = {
        ...currentTerms,
        coordinator_agreed: false,
        coordinator_counter_message: coordinator_message || 'Counter-requirement proposed',
        counter_proposed_at: new Date().toISOString(),
      };

      const updateQuery = `
        UPDATE venue_bookings
        SET status = $1,
            active_terms_and_conditions = $2::jsonb,
            updated_at = NOW()
        WHERE id = $3
        RETURNING *;
      `;
      const updatedBooking = await client.query(updateQuery, [newStatus, JSON.stringify(updatedTerms), id]);

      await client.query(
        `INSERT INTO booking_timeline_logs (booking_id, actor_id, actor_role, action, previous_status, new_status, message, metadata)
         VALUES ($1, $2, 'FACULTY', $3, 'PARTIALLY_ACCEPTED', $4, $5, $6::jsonb)`,
        [id, userId, actionLog, newStatus, logMessage, JSON.stringify({ coordinator_message })]
      );

      await client.query('COMMIT');
      return res.status(200).json({
        success: true,
        message: `Counter-proposal submitted. Booking returned to ${imposedStage} review.`,
        booking: updatedBooking.rows[0],
      });
    }
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23P01') {
      return res.status(409).json({
        success: false,
        is_available: false,
        message: 'Place already occupied during the updated time window... kindly look for another slot.',
      });
    }
    console.error('coordinatorResponse error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Coordinator response failed' });
  } finally {
    client.release();
  }
}

/**
 * 11. PATCH /api/v1/venues/bookings/:id/change-venue
 * Change of Place for Approved/Active Bookings (Resets approval hierarchy back to PENDING_HOD)
 */
export async function changeVenue(req, res) {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { new_venue_id, new_start_time, new_end_time } = req.body;

    if (!new_venue_id) {
      return res.status(400).json({ success: false, error: 'new_venue_id is required' });
    }

    const bookingRes = await client.query('SELECT * FROM venue_bookings WHERE id = $1', [id]);
    if (bookingRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }
    const booking = bookingRes.rows[0];

    const userId = req.user.userId || req.user.id;
    const isSuperAdmin = req.user.adminTier === 'SUPER_ADMIN' || req.user.admin_tier === 'SUPER_ADMIN';
    if (booking.coordinator_id !== userId && !isSuperAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Only the assigned Faculty Venue Coordinator can request a change of venue',
      });
    }

    if (['CANCELLED', 'REJECTED'].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        error: `Cannot change venue for a booking in '${booking.status}' status`,
      });
    }

    // Check new venue exists & capacity
    const venueRes = await client.query('SELECT * FROM venues WHERE id = $1 AND is_active = true', [new_venue_id]);
    if (venueRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'New venue not found or deactivated' });
    }
    const newVenue = venueRes.rows[0];

    if (booking.expected_headcount > newVenue.capacity) {
      return res.status(400).json({
        success: false,
        error: `Expected headcount (${booking.expected_headcount}) exceeds new venue capacity (${newVenue.capacity})`,
      });
    }

    const startTime = new_start_time || booking.event_start_time;
    const endTime = new_end_time || booking.event_end_time;

    await client.query('BEGIN');

    // Update venue and RESET approval hierarchy
    const updateQuery = `
      UPDATE venue_bookings
      SET venue_id = $1,
          event_start_time = $2,
          event_end_time = $3,
          buffered_time_range = tstzrange(($2::timestamptz - INTERVAL '30 minutes'), ($3::timestamptz + INTERVAL '30 minutes'), '[)'),
          status = 'PENDING_HOD',
          hod_approved_by = NULL,
          hod_approved_at = NULL,
          principal_approved_by = NULL,
          principal_approved_at = NULL,
          active_terms_and_conditions = NULL,
          updated_at = NOW()
      WHERE id = $4
      RETURNING *;
    `;
    const updateRes = await client.query(updateQuery, [new_venue_id, startTime, endTime, id]);

    // Audit log
    await client.query(
      `INSERT INTO booking_timeline_logs (booking_id, actor_id, actor_role, action, previous_status, new_status, message, metadata)
       VALUES ($1, $2, 'FACULTY', 'VENUE_CHANGE_REQUESTED', $3, 'PENDING_HOD', $4, $5::jsonb)`,
      [
        id,
        userId,
        booking.status,
        `Coordinator requested venue change to ${newVenue.name}. Approval hierarchy reset to PENDING_HOD.`,
        JSON.stringify({
          old_venue_id: booking.venue_id,
          new_venue_id,
          new_venue_name: newVenue.name,
        }),
      ]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: `Venue changed to '${newVenue.name}'. Approval hierarchy has been reset to PENDING_HOD for fresh department review.`,
      booking: updateRes.rows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23P01') {
      const conflicting = await getConflictingBookingDetails(
        pool,
        req.body.new_venue_id,
        req.body.new_start_time || new Date(),
        req.body.new_end_time || new Date()
      );
      return res.status(409).json({
        success: false,
        is_available: false,
        message: 'Place already occupied... kindly look for another one.',
        current_booking: conflicting,
      });
    }
    console.error('changeVenue error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to change venue' });
  } finally {
    client.release();
  }
}

/**
 * 12. POST /api/v1/venues/bookings/:id/cancel
 * Cancellation with 24-Hour Cooldown Lock (Natively in PostgreSQL)
 */
export async function cancelBooking(req, res) {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { cancellation_reason } = req.body;

    const bookingRes = await client.query('SELECT * FROM venue_bookings WHERE id = $1', [id]);
    if (bookingRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }
    const booking = bookingRes.rows[0];

    const userId = req.user.userId || req.user.id;
    const isSuperAdmin = req.user.adminTier === 'SUPER_ADMIN' || req.user.admin_tier === 'SUPER_ADMIN';

    // Must be initiator or coordinator (or Super Admin)
    if (booking.initiator_id !== userId && booking.coordinator_id !== userId && !isSuperAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Only the booking initiator or coordinator can cancel this booking',
      });
    }

    if (['CANCELLED', 'REJECTED'].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        error: `Booking is already in '${booking.status}' state`,
      });
    }

    await client.query('BEGIN');

    const updateQuery = `
      UPDATE venue_bookings
      SET status = 'CANCELLED',
          cancelled_by = $1,
          cancelled_at = NOW(),
          cancellation_reason = $2,
          updated_at = NOW()
      WHERE id = $3
      RETURNING *;
    `;
    const updateRes = await client.query(updateQuery, [
      userId,
      cancellation_reason || 'Cancelled by initiator/coordinator',
      id,
    ]);

    // Timeline log
    await client.query(
      `INSERT INTO booking_timeline_logs (booking_id, actor_id, actor_role, action, previous_status, new_status, message, metadata)
       VALUES ($1, $2, $3, 'CANCELLED', $4, 'CANCELLED', $5, $6::jsonb)`,
      [
        id,
        userId,
        req.user.baseRole || req.user.base_role || 'USER',
        booking.status,
        `Booking cancelled: ${cancellation_reason || 'No specific reason provided'}. 24-hour cooldown activated for this venue.`,
        JSON.stringify({ cancellation_reason, cancelled_at: new Date().toISOString() }),
      ]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Booking cancelled successfully. Slot immediately released. 24-hour cooldown is now active for this venue.',
      booking: updateRes.rows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('cancelBooking error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to cancel booking' });
  } finally {
    client.release();
  }
}

/**
 * 13. POST /api/v1/venues/bookings/:id/transfer-request
 * "Desperate User" Venue Handover Request to the Current Venue Coordinator
 */
export async function requestTransfer(req, res) {
  try {
    const { id } = req.params;
    const { urgency_reason, new_event_title, new_purpose, new_coordinator_id } = req.body;

    if (!urgency_reason || !new_event_title || !new_purpose) {
      return res.status(400).json({
        success: false,
        error: 'urgency_reason, new_event_title, and new_purpose are required',
      });
    }

    const bookingRes = await pool.query('SELECT * FROM venue_bookings WHERE id = $1', [id]);
    if (bookingRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Target booking not found' });
    }
    const booking = bookingRes.rows[0];

    if (['CANCELLED', 'REJECTED'].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        error: `Cannot request transfer on a booking with '${booking.status}' status`,
      });
    }

    const requesterId = req.user.userId || req.user.id;
    const requesterRole = req.user.baseRole || req.user.base_role || 'STUDENT';

    if (booking.initiator_id === requesterId) {
      return res.status(400).json({
        success: false,
        error: 'You are already the initiator of this booking',
      });
    }

    // Resolve coordinator for the new requester
    let finalNewCoordinatorId = new_coordinator_id;
    if (requesterRole === 'STUDENT') {
      if (!new_coordinator_id) {
        return res.status(400).json({
          success: false,
          error: 'A faculty coordinator (new_coordinator_id) is required for student transfer requests',
        });
      }
      const coordCheck = await pool.query(
        "SELECT id FROM users WHERE id = $1 AND base_role = 'FACULTY' AND is_active = true",
        [new_coordinator_id]
      );
      if (coordCheck.rowCount === 0) {
        return res.status(400).json({ success: false, error: 'new_coordinator_id must reference an active Faculty member' });
      }
    } else {
      finalNewCoordinatorId = new_coordinator_id || requesterId;
    }

    const insertQuery = `
      INSERT INTO venue_transfer_requests (
        booking_id, requester_id, new_coordinator_id,
        new_event_title, new_purpose, urgency_reason, status
      ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING_COORDINATOR')
      RETURNING *;
    `;
    const insertRes = await pool.query(insertQuery, [
      id,
      requesterId,
      finalNewCoordinatorId,
      new_event_title.trim(),
      new_purpose.trim(),
      urgency_reason.trim(),
    ]);

    // Timeline log
    await pool.query(
      `INSERT INTO booking_timeline_logs (booking_id, actor_id, actor_role, action, previous_status, new_status, message, metadata)
       VALUES ($1, $2, $3, 'TRANSFER_REQUESTED', $4, $4, $5, $6::jsonb)`,
      [
        id,
        requesterId,
        requesterRole,
        booking.status,
        `User ${req.user.username} submitted an urgent venue transfer request to coordinator`,
        JSON.stringify({
          transfer_id: insertRes.rows[0].id,
          urgency_reason,
          new_event_title,
        }),
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Venue transfer request submitted to the active Venue Coordinator',
      transfer_request: insertRes.rows[0],
    });
  } catch (err) {
    console.error('requestTransfer error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to submit transfer request' });
  }
}

/**
 * 14. PATCH /api/v1/venues/transfer-requests/:transferId/respond
 * Coordinator Responds to Transfer Request (Approve / Reject)
 */
export async function respondTransferRequest(req, res) {
  const client = await pool.connect();
  try {
    const { transferId } = req.params;
    const { action, response_message } = req.body;

    if (!['APPROVE', 'REJECT'].includes(action)) {
      return res.status(400).json({ success: false, error: "action must be 'APPROVE' or 'REJECT'" });
    }

    const transferRes = await client.query('SELECT * FROM venue_transfer_requests WHERE id = $1', [transferId]);
    if (transferRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Transfer request not found' });
    }
    const transfer = transferRes.rows[0];

    if (transfer.status !== 'PENDING_COORDINATOR') {
      return res.status(400).json({
        success: false,
        error: `Transfer request has already been ${transfer.status.toLowerCase()}`,
      });
    }

    const bookingRes = await client.query('SELECT * FROM venue_bookings WHERE id = $1', [transfer.booking_id]);
    if (bookingRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Associated venue booking not found' });
    }
    const booking = bookingRes.rows[0];

    // Authorization: Only current booking's coordinator (or Super Admin) can respond
    const userId = req.user.userId || req.user.id;
    const isSuperAdmin = req.user.adminTier === 'SUPER_ADMIN' || req.user.admin_tier === 'SUPER_ADMIN';
    if (booking.coordinator_id !== userId && !isSuperAdmin) {
      return res.status(403).json({
        success: false,
        error: "Forbidden: Only the current booking's Faculty Coordinator can respond to this transfer request",
      });
    }

    await client.query('BEGIN');

    if (action === 'REJECT') {
      const updateTransferQuery = `
        UPDATE venue_transfer_requests
        SET status = 'REJECTED',
            response_message = $1,
            responded_at = NOW()
        WHERE id = $2
        RETURNING *;
      `;
      const updatedTransfer = await client.query(updateTransferQuery, [
        response_message || 'Transfer request declined by coordinator',
        transferId,
      ]);

      await client.query(
        `INSERT INTO booking_timeline_logs (booking_id, actor_id, actor_role, action, previous_status, new_status, message, metadata)
         VALUES ($1, $2, 'FACULTY', 'TRANSFER_REJECTED', $3, $3, $4, $5::jsonb)`,
        [
          booking.id,
          userId,
          booking.status,
          `Coordinator declined transfer request: ${response_message || 'No reason provided'}`,
          JSON.stringify({ transfer_id: transferId, requester_id: transfer.requester_id }),
        ]
      );

      await client.query('COMMIT');
      return res.status(200).json({
        success: true,
        message: 'Transfer request rejected successfully',
        transfer: updatedTransfer.rows[0],
      });
    } else {
      // APPROVE Handover inside Transaction
      const updateTransferQuery = `
        UPDATE venue_transfer_requests
        SET status = 'APPROVED',
            response_message = $1,
            responded_at = NOW()
        WHERE id = $2
        RETURNING *;
      `;
      const updatedTransfer = await client.query(updateTransferQuery, [
        response_message || 'Transfer request approved by coordinator',
        transferId,
      ]);

      // Fetch requester profile info
      const requesterRes = await client.query(
        'SELECT base_role, department FROM users WHERE id = $1',
        [transfer.requester_id]
      );
      const requester = requesterRes.rows[0];

      // Update venue_bookings with the new initiator, coordinator, event_title, and purpose
      const updateBookingQuery = `
        UPDATE venue_bookings
        SET initiator_id = $1,
            initiator_role = $2,
            coordinator_id = $3,
            event_title = $4,
            purpose = $5,
            department = $6,
            updated_at = NOW()
        WHERE id = $7
        RETURNING *;
      `;
      const updatedBooking = await client.query(updateBookingQuery, [
        transfer.requester_id,
        requester.base_role,
        transfer.new_coordinator_id,
        transfer.new_event_title,
        transfer.new_purpose,
        requester.department || booking.department,
        booking.id,
      ]);

      // Audit Log for Handover
      await client.query(
        `INSERT INTO booking_timeline_logs (booking_id, actor_id, actor_role, action, previous_status, new_status, message, metadata)
         VALUES ($1, $2, 'FACULTY', 'TRANSFER_APPROVED', $3, $3, $4, $5::jsonb)`,
        [
          booking.id,
          userId,
          booking.status,
          `Coordinator approved handover of venue to new initiator`,
          JSON.stringify({
            transfer_id: transferId,
            previous_initiator_id: booking.initiator_id,
            previous_coordinator_id: booking.coordinator_id,
            new_initiator_id: transfer.requester_id,
            new_coordinator_id: transfer.new_coordinator_id,
            new_event_title: transfer.new_event_title,
          }),
        ]
      );

      await client.query('COMMIT');
      return res.status(200).json({
        success: true,
        message: 'Venue booking successfully transferred to the new initiator and coordinator.',
        transfer: updatedTransfer.rows[0],
        booking: updatedBooking.rows[0],
      });
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('respondTransferRequest error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to respond to transfer request' });
  } finally {
    client.release();
  }
}

/**
 * 15. PATCH /api/v1/venues/bookings/:id/review
 * Unified Multi-Tier Approval Workflow:
 * HOD -> Management -> Principal, returning PostgreSQL dbReceipt
 */
export async function reviewBooking(req, res) {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { action, remarks, reason } = req.body;
    const reviewRemarks = remarks || reason || '';

    const reviewAction = (action || '').toUpperCase();
    if (!['APPROVE', 'REJECT'].includes(reviewAction)) {
      return res.status(400).json({
        success: false,
        error: "action must be either 'APPROVE' or 'REJECT'",
      });
    }

    const bookingRes = await client.query('SELECT * FROM venue_bookings WHERE id = $1', [id]);
    if (bookingRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }
    const booking = bookingRes.rows[0];

    const userId = req.user.userId || req.user.id;
    const userRole = req.user.baseRole || req.user.base_role;
    const adminTier = req.user.adminTier || req.user.admin_tier;
    const sectionCode = req.user.sectionCode || req.user.section_code;
    const subRoles = req.user.subRoles || req.user.sub_roles || [];

    const isSuperAdmin = adminTier === 'SUPER_ADMIN';
    const isHod = adminTier === 'HOD_ADMIN' || (Array.isArray(subRoles) && subRoles.includes('HOD'));
    const isManagement = isSuperAdmin || sectionCode === 'MGT' || (Array.isArray(subRoles) && subRoles.includes('MGT'));
    const isPrincipal = isSuperAdmin || sectionCode === 'PRN' || (Array.isArray(subRoles) && subRoles.includes('PRINCIPAL'));

    if (!isSuperAdmin && !isHod && !isManagement && !isPrincipal) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Insufficient privileges to review venue bookings',
      });
    }

    await client.query('BEGIN');

    let newStatus = booking.status;
    let updateFields = ['updated_at = NOW()'];
    let updateValues = [];

    if (reviewAction === 'REJECT') {
      newStatus = 'REJECTED';
      updateValues.push(newStatus, reviewRemarks, id);
      updateFields.push(`status = $${updateValues.length - 2}`);
      updateFields.push(`rejection_reason = $${updateValues.length - 1}`);
      updateFields.push(`remarks = $${updateValues.length - 1}`);
    } else {
      // APPROVE flow
      if (isSuperAdmin) {
        newStatus = 'APPROVED';
        updateValues.push(newStatus, userId, userId, userId, reviewRemarks, id);
        updateFields.push(`status = $${updateValues.length - 5}`);
        updateFields.push(`approved_by_hod = $${updateValues.length - 4}`);
        updateFields.push(`approved_by_mgt = $${updateValues.length - 3}`);
        updateFields.push(`approved_by_principal = $${updateValues.length - 2}`);
        updateFields.push(`remarks = $${updateValues.length - 1}`);
        updateFields.push(`principal_approved_at = NOW()`);
      } else if (isPrincipal) {
        newStatus = 'APPROVED';
        updateValues.push(newStatus, userId, reviewRemarks, id);
        updateFields.push(`status = $${updateValues.length - 3}`);
        updateFields.push(`approved_by_principal = $${updateValues.length - 2}`);
        updateFields.push(`remarks = $${updateValues.length - 1}`);
        updateFields.push(`principal_approved_at = NOW()`);
      } else if (isManagement) {
        newStatus = 'PENDING_PRINCIPAL';
        updateValues.push(newStatus, userId, reviewRemarks, id);
        updateFields.push(`status = $${updateValues.length - 3}`);
        updateFields.push(`approved_by_mgt = $${updateValues.length - 2}`);
        updateFields.push(`remarks = $${updateValues.length - 1}`);
      } else if (isHod) {
        newStatus = 'PENDING_MANAGEMENT';
        updateValues.push(newStatus, userId, reviewRemarks, id);
        updateFields.push(`status = $${updateValues.length - 3}`);
        updateFields.push(`approved_by_hod = $${updateValues.length - 2}`);
        updateFields.push(`remarks = $${updateValues.length - 1}`);
        updateFields.push(`hod_approved_at = NOW()`);
      }
    }

    const updateQuery = `
      UPDATE venue_bookings
      SET ${updateFields.join(', ')}
      WHERE id = $${updateValues.length}
      RETURNING *;
    `;
    const updatedRes = await client.query(updateQuery, updateValues);
    const updatedBooking = updatedRes.rows[0];

    const dbReceipt = {
      receiptId: `RCPT-VB-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
      transactionId: `tx_vb_${id.substring(0, 8)}_${Date.now()}`,
      table: 'venue_bookings',
      recordId: id,
      previousStatus: booking.status,
      newStatus,
      action: reviewAction,
      reviewedBy: userId,
      reviewerRole: isSuperAdmin ? 'SUPER_ADMIN' : (isPrincipal ? 'PRINCIPAL' : (isManagement ? 'MANAGEMENT' : 'HOD')),
      remarks: reviewRemarks,
      timestamp: new Date().toISOString(),
    };

    await client.query(
      `INSERT INTO booking_timeline_logs (booking_id, actor_id, actor_role, action, previous_status, new_status, message, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        id,
        userId,
        dbReceipt.reviewerRole,
        `REVIEW_${reviewAction}`,
        booking.status,
        newStatus,
        `Booking ${reviewAction}ED by ${dbReceipt.reviewerRole}: ${reviewRemarks}`,
        JSON.stringify({ dbReceipt, remarks: reviewRemarks }),
      ]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: `Booking review (${reviewAction}) processed successfully`,
      status: newStatus,
      dbReceipt,
      booking: updatedBooking,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('reviewBooking error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to review venue booking' });
  } finally {
    client.release();
  }
}

export default {
  createVenue,
  listVenues,
  updateVenue,
  checkAvailability,
  initiateBooking,
  listBookings,
  getBookingDetails,
  hodReview,
  principalReview,
  coordinatorResponse,
  changeVenue,
  cancelBooking,
  requestTransfer,
  respondTransferRequest,
  reviewBooking,
};
