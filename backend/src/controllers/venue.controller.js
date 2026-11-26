import pool, { ensureDatabaseExists } from '../config/db.js';
import { decryptAES } from '../utils/crypto.util.js';
import { getNextSequence } from '../utils/username.util.js';

const VALID_VENUE_TYPES = [
  'AUDITORIUM',
  'SEMINAR_HALL',
  'CONFERENCE_ROOM',
  'LAB',
  'OPEN_AIR_THEATRE',
];

const ACTIVE_BOOKING_STATUSES = [
  'PENDING_HOD',
  'PENDING_MANAGEMENT',
  'PENDING_PRINCIPAL',
  'PARTIALLY_ACCEPTED',
  'APPROVED',
];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUuid = (val) => typeof val === 'string' && UUID_REGEX.test(val.trim());

function isValidIsoDate(val) {
  if (typeof val !== 'string') return false;
  const s = val.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

async function safeRollback(client) {
  if (!client) return;
  try {
    await client.query('ROLLBACK');
  } catch {
    // Ignore rollback errors if no active transaction or connection closed
  }
}

const getUserId = (user) => user?.userId || user?.id;
const getBaseRole = (user) => user?.baseRole || user?.base_role;
const getAdminTier = (user) => user?.adminTier || user?.admin_tier;
const getSectionCode = (user) => user?.sectionCode || user?.section_code;
const getSubRoles = (user) => (Array.isArray(user?.subRoles || user?.sub_roles) ? (user.subRoles || user.sub_roles) : []);

const isSuperAdminUser = (user) => getAdminTier(user) === 'SUPER_ADMIN';
const isManagementUser = (user) =>
  isSuperAdminUser(user) || getSectionCode(user) === 'MGT' || getSubRoles(user).includes('MANAGEMENT');
const isPrincipalUser = (user) => {
  const sec = getSectionCode(user);
  return isSuperAdminUser(user) || sec === 'PRN' || sec === 'PRINCIPAL' || getSubRoles(user).includes('PRINCIPAL');
};
const isHodUser = (user) =>
  isSuperAdminUser(user) || getAdminTier(user) === 'HOD_ADMIN' || getSubRoles(user).includes('HOD');

/**
 * Verifies role-scoped read visibility on a single booking record (mirrors listBookings)
 */
function canAccessBooking(user, bookingRow) {
  if (isSuperAdminUser(user) || isPrincipalUser(user) || isManagementUser(user)) {
    return true;
  }
  const userId = getUserId(user);
  const isOwner =
    bookingRow.initiator_id === userId ||
    bookingRow.requested_by === userId ||
    bookingRow.coordinator_id === userId;

  if (isHodUser(user)) {
    const userDept = (user?.department || '').toUpperCase();
    const isDeptMatch = Boolean(userDept) && userDept === (bookingRow.department || '').toUpperCase();
    return isDeptMatch || isOwner;
  }
  return isOwner;
}

/**
 * Strips pg_xmin/pg_ctid virtual columns from row and builds standardized dbReceipt
 */
function extractRowAndReceipt(row, storedInTable, includeTimestamp = false) {
  const { pg_xmin, pg_ctid, ...cleanRow } = row;
  const dbReceipt = {
    persisted: true,
    pgTransactionId: pg_xmin || null,
    physicalDiskTuple: pg_ctid || null,
    storedInTable,
  };
  if (includeTimestamp) {
    dbReceipt.timestamp = cleanRow.updated_at || cleanRow.created_at || new Date().toISOString();
  }
  return { row: cleanRow, dbReceipt };
}

/**
 * Maps category <-> type gracefully against the venues.type CHECK constraint
 */
function resolveVenueTypeAndCategory(rawType, rawCategory) {
  const normalizedType = rawType ? String(rawType).trim().toUpperCase().replace(/[\s-]+/g, '_') : null;
  const categoryStr = rawCategory ? String(rawCategory).trim() : null;

  if (normalizedType) {
    if (!VALID_VENUE_TYPES.includes(normalizedType)) {
      return { error: `Invalid venue type. Allowed: ${VALID_VENUE_TYPES.join(', ')}` };
    }
    return { type: normalizedType, category: categoryStr || normalizedType };
  }

  if (!categoryStr) {
    return { error: 'name, capacity, and type or category are required fields' };
  }

  const upperCat = categoryStr.toUpperCase().replace(/[\s-]+/g, '_');
  let derivedType = 'SEMINAR_HALL';
  if (VALID_VENUE_TYPES.includes(upperCat)) {
    derivedType = upperCat;
  } else if (/AUDITORIUM|\bAUDI\b/.test(upperCat)) {
    derivedType = 'AUDITORIUM';
  } else if (/CONFERENCE|BOARD|MEETING/.test(upperCat)) {
    derivedType = 'CONFERENCE_ROOM';
  } else if (/\bLAB\b|LABORATORY|WORKSHOP/.test(upperCat)) {
    derivedType = 'LAB';
  } else if (/OPEN_AIR|OAT|THEATRE|AMPHI|GROUND/.test(upperCat)) {
    derivedType = 'OPEN_AIR_THEATRE';
  }

  return { type: derivedType, category: categoryStr };
}

function toStringArray(val) {
  if (Array.isArray(val)) return val.map((v) => String(v).trim()).filter(Boolean);
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map((v) => String(v).trim()).filter(Boolean);
      } catch {
        // fallback to comma split
      }
    }
    return trimmed.split(',').map((v) => v.trim()).filter(Boolean);
  }
  if (val && typeof val === 'object') {
    return Object.entries(val)
      .filter(([, v]) => Boolean(v))
      .map(([k]) => String(k).trim());
  }
  return [];
}

/**
 * Syncs amenities TEXT[] and facilities JSONB consistently
 */
function normalizeAmenitiesAndFacilities(amenities, facilities) {
  const hasAmenities = amenities !== undefined;
  const hasFacilities = facilities !== undefined;
  const amenitiesList = hasAmenities ? toStringArray(amenities) : [];
  const facilitiesList = hasFacilities ? toStringArray(facilities) : [];

  const finalAmenities = amenitiesList.length > 0 ? amenitiesList : facilitiesList;
  let finalFacilities;
  if (hasFacilities && (facilitiesList.length > 0 || (facilities && typeof facilities === 'object' && !Array.isArray(facilities)))) {
    finalFacilities = facilities;
  } else {
    finalFacilities = finalAmenities;
  }

  return { amenitiesArr: finalAmenities, facilitiesJson: finalFacilities };
}

const IST_OFFSET_MS = 330 * 60 * 1000;
const formatIstDate = (d) => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
const formatIstTime = (d) => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(11, 16);

function parseTimeParts(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?$/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = match[3] ? parseInt(match[3], 10) : 0;
  const meridiem = match[4]?.toUpperCase();

  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === 'PM' && hours !== 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
  }
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) {
    return null;
  }

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return { hhmm: `${hh}:${mm}`, hhmmss: `${hh}:${mm}:${ss}` };
}

function parseTimeToMinutes(hhmm) {
  const parts = parseTimeParts(hhmm);
  if (!parts) return null;
  const [h, m] = parts.hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Derives AVAILABLE | PARTIALLY_BOOKED | OCCUPIED for a single calendar date
 */
function computeDayAvailabilityStatus(slots, targetDate) {
  if (!slots || slots.length === 0) return 'AVAILABLE';

  const dayStartMs = new Date(`${targetDate}T00:00:00+05:30`).getTime();
  const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;
  const intervals = [];

  for (const slot of slots) {
    const sMs = slot.event_start_time ? new Date(slot.event_start_time).getTime() : NaN;
    const eMs = slot.event_end_time ? new Date(slot.event_end_time).getTime() : NaN;

    if (!isNaN(sMs) && !isNaN(eMs) && eMs > sMs) {
      const clampedS = Math.max(sMs, dayStartMs);
      const clampedE = Math.min(eMs, dayEndMs);
      if (clampedE > clampedS) {
        intervals.push([(clampedS - dayStartMs) / 60000, (clampedE - dayStartMs) / 60000]);
        continue;
      }
    }

    const startMin = parseTimeToMinutes(slot.start_time);
    const endMin = parseTimeToMinutes(slot.end_time);
    if (startMin !== null && endMin !== null && endMin > startMin) {
      intervals.push([startMin, endMin]);
    } else if (!isNaN(sMs) && !isNaN(eMs) && eMs > sMs) {
      intervals.push([0, Math.min(1440, (eMs - sMs) / 60000)]);
    }
  }

  if (intervals.length === 0) return 'PARTIALLY_BOOKED';

  intervals.sort((a, b) => a[0] - b[0]);
  const merged = [intervals[0].slice()];
  for (let i = 1; i < intervals.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = intervals[i];
    if (curr[0] <= prev[1]) {
      prev[1] = Math.max(prev[1], curr[1]);
    } else {
      merged.push(curr.slice());
    }
  }

  let totalBookedMinutes = 0;
  let workdayCovered = false;
  for (const [s, e] of merged) {
    totalBookedMinutes += e - s;
    if (s <= 540 && e >= 1020) {
      workdayCovered = true;
    }
  }

  return totalBookedMinutes >= 360 || workdayCovered ? 'OCCUPIED' : 'PARTIALLY_BOOKED';
}

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
      AND b.status = ANY($4::varchar[])
    ORDER BY b.event_start_time ASC
    LIMIT 1;
  `;
  const res = await client.query(query, [venueId, startTime, endTime, ACTIVE_BOOKING_STATUSES]);
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
 * Create a new campus venue (Super Admin or Management)
 */
export async function createVenue(req, res) {
  try {
    await ensureDatabaseExists();
    const {
      name,
      code,
      type,
      category,
      department,
      building,
      floor,
      location_details,
      capacity,
      amenities,
      facilities,
      is_active,
    } = req.body || {};

    if (!name || !String(name).trim() || capacity === undefined || capacity === null || capacity === '') {
      return res.status(400).json({
        success: false,
        error: 'name, capacity, and type or category are required fields',
      });
    }

    const typeInfo = resolveVenueTypeAndCategory(type, category);
    if (typeInfo.error) {
      return res.status(400).json({ success: false, error: typeInfo.error });
    }

    const capNum = parseInt(capacity, 10);
    if (isNaN(capNum) || capNum <= 0) {
      return res.status(400).json({
        success: false,
        error: 'capacity must be a positive integer',
      });
    }

    let venueCode = code ? String(code).trim().toUpperCase() : null;
    if (!venueCode) {
      let seq = await getNextSequence('VEN', 1, pool);
      venueCode = `VEN-${String(seq).padStart(3, '0')}`;
      // Skip past any manually inserted VEN-* code
      while ((await pool.query('SELECT 1 FROM venues WHERE code = $1', [venueCode])).rowCount > 0) {
        seq = await getNextSequence('VEN', 1, pool);
        venueCode = `VEN-${String(seq).padStart(3, '0')}`;
      }
    }

    const { amenitiesArr, facilitiesJson } = normalizeAmenitiesAndFacilities(amenities, facilities);
    const activeBool = is_active === undefined ? true : !(is_active === false || is_active === 'false');
    const createdBy = getUserId(req.user);

    const query = `
      INSERT INTO venues (
        name, code, type, category, department, building, floor,
        location_details, capacity, facilities, amenities, is_active, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::text[], $12, $13)
      RETURNING *, xmin::text AS pg_xmin, ctid::text AS pg_ctid;
    `;
    const values = [
      String(name).trim(),
      venueCode,
      typeInfo.type,
      typeInfo.category,
      department ? String(department).trim().toUpperCase() : null,
      building ? String(building).trim() : null,
      floor !== undefined && floor !== null && String(floor).trim() !== '' ? String(floor).trim() : null,
      location_details ? String(location_details).trim() : null,
      capNum,
      JSON.stringify(facilitiesJson),
      amenitiesArr,
      activeBool,
      createdBy,
    ];

    const result = await pool.query(query, values);
    const { row: venue, dbReceipt } = extractRowAndReceipt(result.rows[0], 'venues');

    return res.status(201).json({
      success: true,
      message: 'Venue created successfully',
      venue,
      dbReceipt,
    });
  } catch (err) {
    if (err.code === '23505') {
      const conflictField = err.constraint?.includes('code') ? 'code' : 'name';
      return res.status(409).json({
        success: false,
        error: `A venue with this ${conflictField} already exists`,
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
 * List venues with optional filters (?type=&category=&min_capacity=&department=&is_active=&date=)
 * and date-scoped booked_slots & availability_status
 */
export async function listVenues(req, res) {
  try {
    await ensureDatabaseExists();
    const { type, category, min_capacity, department, is_active, date } = req.query;

    let targetDate;
    if (date !== undefined && String(date).trim() !== '') {
      const rawDate = String(date).trim();
      if (!isValidIsoDate(rawDate)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid date format. Expected YYYY-MM-DD',
        });
      }
      targetDate = rawDate;
    } else {
      targetDate = formatIstDate(new Date());
    }

    const conditions = [];
    const values = [];

    if (type) {
      values.push(String(type).trim().toUpperCase());
      conditions.push(`type = $${values.length}`);
    }

    if (category) {
      values.push(String(category).trim().toUpperCase());
      conditions.push(`(UPPER(COALESCE(category, type)) = $${values.length} OR UPPER(type) = $${values.length})`);
    }

    if (min_capacity) {
      const minCap = parseInt(min_capacity, 10);
      if (!isNaN(minCap)) {
        values.push(minCap);
        conditions.push(`capacity >= $${values.length}`);
      }
    }

    if (department) {
      values.push(String(department).trim().toUpperCase());
      conditions.push(`UPPER(department) = $${values.length}`);
    }

    if (is_active !== 'all') {
      const activeBool = is_active === 'false' || is_active === false ? false : true;
      values.push(activeBool);
      conditions.push(`is_active = $${values.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const venueQuery = `
      SELECT id, name, code, type, category, department, building, floor,
             location_details, capacity, facilities, amenities, is_active,
             created_at, updated_at
      FROM venues
      ${whereClause}
      ORDER BY name ASC;
    `;

    const result = await pool.query(venueQuery, values);
    const slotsByVenue = new Map();

    if (result.rows.length > 0) {
      const venueIds = result.rows.map((v) => v.id);
      const slotsQuery = `
        SELECT b.id, b.venue_id, b.booking_code, b.event_title, b.department,
               COALESCE(b.start_time, to_char(b.event_start_time AT TIME ZONE 'Asia/Kolkata', 'HH24:MI')) AS start_time,
               COALESCE(b.end_time, to_char(b.event_end_time AT TIME ZONE 'Asia/Kolkata', 'HH24:MI')) AS end_time,
               b.event_start_time, b.event_end_time, b.status,
               u_coord.username AS coordinator_username
        FROM venue_bookings b
        JOIN users u_coord ON b.coordinator_id = u_coord.id
        WHERE b.venue_id = ANY($1::uuid[])
          AND b.status = ANY($2::varchar[])
          AND (
            b.booking_date = $3::date
            OR (b.event_start_time < ($3::date + INTERVAL '1 day') AND b.event_end_time > $3::date)
          )
        ORDER BY b.event_start_time ASC;
      `;
      const slotsRes = await pool.query(slotsQuery, [venueIds, ACTIVE_BOOKING_STATUSES, targetDate]);

      for (const row of slotsRes.rows) {
        const { venue_id, ...slot } = row;
        if (!slotsByVenue.has(venue_id)) {
          slotsByVenue.set(venue_id, []);
        }
        slotsByVenue.get(venue_id).push(slot);
      }
    }

    const venues = result.rows.map((v) => {
      const bookedSlots = slotsByVenue.get(v.id) || [];
      return {
        ...v,
        booked_slots: bookedSlots,
        availability_status: computeDayAvailabilityStatus(bookedSlots, targetDate),
      };
    });

    return res.status(200).json({
      success: true,
      date: targetDate,
      count: venues.length,
      venues,
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
    await ensureDatabaseExists();
    const { venueId } = req.params;
    if (!isValidUuid(venueId)) {
      return res.status(400).json({ success: false, error: 'Invalid venueId UUID format' });
    }

    const {
      name,
      code,
      type,
      category,
      department,
      building,
      floor,
      location_details,
      capacity,
      amenities,
      facilities,
      is_active,
    } = req.body || {};

    const check = await pool.query('SELECT * FROM venues WHERE id = $1', [venueId]);
    if (check.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Venue not found' });
    }

    const updates = [];
    const values = [];

    if (name !== undefined) {
      values.push(String(name).trim());
      updates.push(`name = $${values.length}`);
    }
    if (code !== undefined) {
      values.push(code ? String(code).trim().toUpperCase() : null);
      updates.push(`code = $${values.length}`);
    }
    if (type !== undefined || category !== undefined) {
      const typeInfo = resolveVenueTypeAndCategory(type, category ?? check.rows[0].category ?? check.rows[0].type);
      if (typeInfo.error) {
        return res.status(400).json({ success: false, error: typeInfo.error });
      }
      values.push(typeInfo.type);
      updates.push(`type = $${values.length}`);
      if (category !== undefined) {
        values.push(typeInfo.category);
        updates.push(`category = $${values.length}`);
      }
    }
    if (department !== undefined) {
      values.push(department ? String(department).trim().toUpperCase() : null);
      updates.push(`department = $${values.length}`);
    }
    if (building !== undefined) {
      values.push(building ? String(building).trim() : null);
      updates.push(`building = $${values.length}`);
    }
    if (floor !== undefined) {
      values.push(floor !== null && String(floor).trim() !== '' ? String(floor).trim() : null);
      updates.push(`floor = $${values.length}`);
    }
    if (location_details !== undefined) {
      values.push(location_details ? String(location_details).trim() : null);
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
    if (amenities !== undefined || facilities !== undefined) {
      const { amenitiesArr, facilitiesJson } = normalizeAmenitiesAndFacilities(amenities, facilities);
      values.push(JSON.stringify(facilitiesJson));
      updates.push(`facilities = $${values.length}::jsonb`);
      values.push(amenitiesArr);
      updates.push(`amenities = $${values.length}::text[]`);
    }
    if (is_active !== undefined) {
      values.push(!(is_active === false || is_active === 'false'));
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
      RETURNING *, xmin::text AS pg_xmin, ctid::text AS pg_ctid;
    `;

    const result = await pool.query(query, values);
    const { row: venue, dbReceipt } = extractRowAndReceipt(result.rows[0], 'venues');

    return res.status(200).json({
      success: true,
      message: 'Venue updated successfully',
      venue,
      dbReceipt,
    });
  } catch (err) {
    if (err.code === '23505') {
      const conflictField = err.constraint?.includes('code') ? 'code' : 'name';
      return res.status(409).json({ success: false, error: `A venue with this ${conflictField} already exists` });
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
    await ensureDatabaseExists();
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
      if (!isValidUuid(venue_id)) {
        return res.status(400).json({ success: false, error: 'Invalid venue_id UUID format' });
      }
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
 * Initiate a venue booking request (supports full ISO & simplified date/time payloads,
 * enforces mandatory coordinator for students & 24h cancel cooldown)
 */
export async function initiateBooking(req, res) {
  let client = null;
  let resolvedEventStart = null;
  let resolvedEventEnd = null;

  try {
    await ensureDatabaseExists();
    const {
      venue_id,
      coordinator_id,
      event_title,
      purpose,
      expected_headcount,
      event_start_time,
      event_end_time,
      booking_date,
      start_time,
      end_time,
      department,
    } = req.body || {};

    if (!venue_id || !event_title || !String(event_title).trim()) {
      return res.status(400).json({
        success: false,
        error: 'venue_id and event_title are required',
      });
    }
    if (!isValidUuid(venue_id)) {
      return res.status(400).json({ success: false, error: 'Invalid venue_id UUID format' });
    }
    if (coordinator_id !== undefined && coordinator_id !== null && coordinator_id !== '' && !isValidUuid(coordinator_id)) {
      return res.status(400).json({ success: false, error: 'Invalid coordinator_id UUID format' });
    }

    const initiatorId = getUserId(req.user);
    const rawBaseRole = getBaseRole(req.user);
    const initiatorRole = ['STUDENT', 'FACULTY', 'ADMIN'].includes(rawBaseRole)
      ? rawBaseRole
      : (isSuperAdminUser(req.user) ? 'ADMIN' : null);

    if (!initiatorRole) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Only Student, Faculty, or Admin accounts can initiate venue bookings',
      });
    }

    let resolvedBookingDate = null;
    let resolvedStartTime = null;
    let resolvedEndTime = null;

    if (event_start_time && event_end_time) {
      resolvedEventStart = event_start_time;
      resolvedEventEnd = event_end_time;
    } else if (booking_date && start_time && end_time) {
      const dateStr = String(booking_date).trim();
      if (!isValidIsoDate(dateStr)) {
        return res.status(400).json({ success: false, error: 'booking_date must be a valid YYYY-MM-DD date' });
      }
      const startParts = parseTimeParts(String(start_time));
      const endParts = parseTimeParts(String(end_time));
      if (!startParts || !endParts) {
        return res.status(400).json({ success: false, error: 'start_time and end_time must be valid HH:MM times' });
      }
      resolvedBookingDate = dateStr;
      resolvedStartTime = startParts.hhmm;
      resolvedEndTime = endParts.hhmm;
      resolvedEventStart = `${dateStr}T${startParts.hhmmss}+05:30`;
      resolvedEventEnd = `${dateStr}T${endParts.hhmmss}+05:30`;
    } else {
      return res.status(400).json({
        success: false,
        error: 'Provide either (event_start_time, event_end_time) or (booking_date, start_time, end_time)',
      });
    }

    const startDate = new Date(resolvedEventStart);
    const endDate = new Date(resolvedEventEnd);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid event date/time format' });
    }
    if (startDate >= endDate) {
      return res.status(400).json({ success: false, error: 'event_start_time must be strictly earlier than event_end_time' });
    }
    if (startDate < new Date(Date.now() - 5 * 60 * 1000)) {
      return res.status(400).json({ success: false, error: 'Cannot book a venue for past timestamps' });
    }

    if (!resolvedBookingDate) resolvedBookingDate = booking_date ? String(booking_date).trim() : formatIstDate(startDate);
    if (!resolvedStartTime) resolvedStartTime = start_time ? String(start_time).trim() : formatIstTime(startDate);
    if (!resolvedEndTime) resolvedEndTime = end_time ? String(end_time).trim() : formatIstTime(endDate);

    const hasExplicitHeadcount =
      expected_headcount !== undefined && expected_headcount !== null && expected_headcount !== '';
    const headcount = hasExplicitHeadcount ? parseInt(expected_headcount, 10) : 10;
    if (isNaN(headcount) || headcount <= 0) {
      return res.status(400).json({ success: false, error: 'expected_headcount must be a positive integer' });
    }

    const finalPurpose = purpose && String(purpose).trim() ? String(purpose).trim() : String(event_title).trim();

    client = await pool.connect();

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

    // Coordinator Resolution (mandatory Faculty Coordinator ONLY for STUDENT)
    let finalCoordinatorId = coordinator_id;

    if (initiatorRole === 'STUDENT') {
      if (!coordinator_id) {
        return res.status(400).json({
          success: false,
          error: 'A mandatory Faculty Coordinator (coordinator_id) is required for student venue bookings',
        });
      }
      const coordCheck = await client.query(
        "SELECT id FROM users WHERE id = $1 AND base_role = 'FACULTY' AND is_active = true",
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
        finalCoordinatorId = initiatorId;
      } else {
        const coordCheck = await client.query(
          "SELECT id FROM users WHERE id = $1 AND base_role = 'FACULTY' AND is_active = true",
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
      // ADMIN (SUPER_ADMIN or section admins like PLC, SPT, MGT, HOD)
      if (!finalCoordinatorId) {
        finalCoordinatorId = initiatorId;
      } else {
        const coordCheck = await client.query(
          'SELECT id FROM users WHERE id = $1 AND is_active = true',
          [finalCoordinatorId]
        );
        if (coordCheck.rowCount === 0) {
          return res.status(400).json({
            success: false,
            error: 'Assigned coordinator must be an active user in the institution',
          });
        }
      }
    }

    // Determine booking department safely (lock/derive for non-privileged callers)
    const isPrivilegedDeptOverride =
      isSuperAdminUser(req.user) || isManagementUser(req.user) || isPrincipalUser(req.user);
    const reqDept = department && String(department).trim() ? String(department).trim().toUpperCase() : null;
    const callerDept = (req.user.department || getSectionCode(req.user) || '').trim().toUpperCase();

    let bookingDept;
    if (isPrivilegedDeptOverride) {
      bookingDept = reqDept || callerDept || venue.department || 'CENTRAL';
    } else {
      if (callerDept && reqDept && reqDept !== callerDept) {
        return res.status(403).json({
          success: false,
          error: `Department Scope Violation: Cannot initiate venue booking for department '${reqDept}'`,
        });
      }
      bookingDept = callerDept || venue.department || 'CENTRAL';
    }

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
        booking_code, venue_id, initiator_id, requested_by, initiator_role, coordinator_id,
        department, event_title, purpose, expected_headcount,
        booking_date, start_time, end_time,
        event_start_time, event_end_time, buffered_time_range, status
      ) VALUES (
        $1, $2, $3, $3, $4, $5, $6, $7, $8, $9,
        $10::date, $11, $12,
        $13::timestamptz, $14::timestamptz,
        tstzrange(($13::timestamptz - INTERVAL '30 minutes'), ($14::timestamptz + INTERVAL '30 minutes'), '[)'),
        'PENDING_HOD'
      )
      RETURNING *, xmin::text AS pg_xmin, ctid::text AS pg_ctid;
    `;

    const bookingRes = await client.query(insertBookingQuery, [
      bookingCode,
      venue_id,
      initiatorId,
      initiatorRole,
      finalCoordinatorId,
      bookingDept,
      String(event_title).trim(),
      finalPurpose,
      headcount,
      resolvedBookingDate,
      resolvedStartTime,
      resolvedEndTime,
      resolvedEventStart,
      resolvedEventEnd,
    ]);

    const { row: createdBooking, dbReceipt } = extractRowAndReceipt(
      bookingRes.rows[0],
      'venue_bookings',
      true
    );

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
        booking_date: resolvedBookingDate,
        start_time: resolvedStartTime,
        end_time: resolvedEndTime,
        event_start_time: resolvedEventStart,
        event_end_time: resolvedEventEnd,
      }),
    ]);

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: 'Venue booking request initiated successfully. Awaiting Department HOD review.',
      booking: createdBooking,
      dbReceipt,
    });
  } catch (err) {
    await safeRollback(client);

    // Handle PostgreSQL GIST Exclusion Constraint Conflict (Error Code: 23P01)
    if (err.code === '23P01') {
      const conflicting = resolvedEventStart && resolvedEventEnd
        ? await getConflictingBookingDetails(pool, req.body?.venue_id, resolvedEventStart, resolvedEventEnd)
        : null;

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
    if (client) client.release();
  }
}

/**
 * 6. GET /api/v1/venues/bookings
 * List bookings (role-scoped: Super Admin/Principal/Management see all; HOD sees dept + own; Student/Faculty/other admins see own)
 */
export async function listBookings(req, res) {
  try {
    await ensureDatabaseExists();
    const { status, venue_id, department, date, from_date, to_date } = req.query;
    const userId = getUserId(req.user);

    const conditions = [];
    const values = [];

    // Role-based visibility scoping
    if (isSuperAdminUser(req.user) || isPrincipalUser(req.user) || isManagementUser(req.user)) {
      // Sees all bookings across campus
    } else if (isHodUser(req.user)) {
      const userDept = (req.user.department || '').toUpperCase();
      values.push(userDept);
      values.push(userId);
      conditions.push(
        `(UPPER(b.department) = $${values.length - 1} OR b.initiator_id = $${values.length} OR b.requested_by = $${values.length} OR b.coordinator_id = $${values.length})`
      );
    } else {
      // Student / Faculty / other section admins see own initiated/requested/coordinated bookings
      values.push(userId);
      conditions.push(`(b.initiator_id = $${values.length} OR b.requested_by = $${values.length} OR b.coordinator_id = $${values.length})`);
    }

    if (status) {
      values.push(String(status).trim().toUpperCase());
      conditions.push(`b.status = $${values.length}`);
    }
    if (venue_id) {
      if (!isValidUuid(venue_id)) {
        return res.status(400).json({ success: false, error: 'Invalid venue_id UUID format' });
      }
      values.push(venue_id);
      conditions.push(`b.venue_id = $${values.length}`);
    }
    if (department) {
      values.push(String(department).trim().toUpperCase());
      conditions.push(`UPPER(b.department) = $${values.length}`);
    }
    if (date !== undefined && String(date).trim() !== '') {
      const cleanDate = String(date).trim();
      if (!isValidIsoDate(cleanDate)) {
        return res.status(400).json({ success: false, error: 'Invalid date format. Expected YYYY-MM-DD' });
      }
      values.push(cleanDate);
      conditions.push(
        `(b.booking_date = $${values.length}::date OR (b.event_start_time < ($${values.length}::date + INTERVAL '1 day') AND b.event_end_time > $${values.length}::date))`
      );
    }

    let fromD = null;
    if (from_date !== undefined && String(from_date).trim() !== '') {
      const cleanFrom = String(from_date).trim();
      fromD = new Date(cleanFrom);
      if (Number.isNaN(fromD.getTime())) {
        return res.status(400).json({ success: false, error: 'Invalid from_date timestamp/date format' });
      }
      values.push(cleanFrom);
      conditions.push(`b.event_start_time >= $${values.length}::timestamptz`);
    }

    let toD = null;
    if (to_date !== undefined && String(to_date).trim() !== '') {
      const cleanTo = String(to_date).trim();
      toD = new Date(cleanTo);
      if (Number.isNaN(toD.getTime())) {
        return res.status(400).json({ success: false, error: 'Invalid to_date timestamp/date format' });
      }
      values.push(cleanTo);
      conditions.push(`b.event_end_time <= $${values.length}::timestamptz`);
    }

    if (fromD && toD && fromD > toD) {
      return res.status(400).json({ success: false, error: 'from_date cannot be later than to_date' });
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT b.id, b.booking_code, b.venue_id,
             v.name AS venue_name, v.code AS venue_code, v.type AS venue_type,
             v.category AS venue_category, v.building AS venue_building, v.floor AS venue_floor,
             b.initiator_id, u_init.username AS initiator_username, b.initiator_role,
             b.requested_by, u_req.username AS requested_by_username,
             b.coordinator_id, u_coord.username AS coordinator_username,
             b.department, b.event_title, b.purpose, b.expected_headcount,
             COALESCE(b.booking_date, (b.event_start_time AT TIME ZONE 'Asia/Kolkata')::date) AS booking_date,
             COALESCE(b.start_time, to_char(b.event_start_time AT TIME ZONE 'Asia/Kolkata', 'HH24:MI')) AS start_time,
             COALESCE(b.end_time, to_char(b.event_end_time AT TIME ZONE 'Asia/Kolkata', 'HH24:MI')) AS end_time,
             b.event_start_time, b.event_end_time, b.status,
             b.remarks, b.reviewed_by, b.rejection_reason,
             b.active_terms_and_conditions,
             b.hod_approved_at, b.management_approved_at, b.principal_approved_at,
             b.cancelled_at, b.cancellation_reason,
             b.created_at, b.updated_at
      FROM venue_bookings b
      JOIN venues v ON b.venue_id = v.id
      JOIN users u_init ON b.initiator_id = u_init.id
      LEFT JOIN users u_req ON b.requested_by = u_req.id
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
    await ensureDatabaseExists();
    const { id } = req.params;
    if (!isValidUuid(id)) {
      return res.status(400).json({ success: false, error: 'Invalid booking id UUID format' });
    }

    const bookingQuery = `
      SELECT b.*,
             v.name AS venue_name, v.code AS venue_code, v.type AS venue_type,
             v.category AS venue_category, v.building AS venue_building, v.floor AS venue_floor,
             v.department AS venue_department, v.location_details AS venue_location,
             v.capacity AS venue_capacity, v.facilities AS venue_facilities, v.amenities AS venue_amenities,
             u_init.username AS initiator_username, u_init.full_name_encrypted AS init_name_enc,
             u_init.email_encrypted AS init_email_enc, u_init.phone_encrypted AS init_phone_enc,
             u_coord.username AS coordinator_username, u_coord.full_name_encrypted AS coord_name_enc,
             u_coord.email_encrypted AS coord_email_enc, u_coord.phone_encrypted AS coord_phone_enc,
             f_coord.designation AS coord_designation, f_coord.cabin_room AS coord_cabin,
             f_coord.full_name AS coord_faculty_name, f_coord.email AS coord_faculty_email,
             u_hod.username AS hod_approver_username,
             u_mgt.username AS management_approver_username,
             u_prn.username AS principal_approver_username,
             u_can.username AS cancelled_by_username
      FROM venue_bookings b
      JOIN venues v ON b.venue_id = v.id
      JOIN users u_init ON b.initiator_id = u_init.id
      JOIN users u_coord ON b.coordinator_id = u_coord.id
      LEFT JOIN faculty f_coord ON f_coord.user_id = u_coord.id
      LEFT JOIN users u_hod ON b.hod_approved_by = u_hod.id
      LEFT JOIN users u_mgt ON b.management_approved_by = u_mgt.id
      LEFT JOIN users u_prn ON b.principal_approved_by = u_prn.id
      LEFT JOIN users u_can ON b.cancelled_by = u_can.id
      WHERE b.id = $1;
    `;

    const bookingRes = await pool.query(bookingQuery, [id]);
    if (bookingRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    const row = bookingRes.rows[0];

    if (!canAccessBooking(req.user, row)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: You are not authorized to view this booking',
      });
    }

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
          code: row.venue_code,
          type: row.venue_type,
          category: row.venue_category,
          department: row.venue_department,
          building: row.venue_building,
          floor: row.venue_floor,
          location_details: row.venue_location,
          capacity: row.venue_capacity,
          facilities: row.venue_facilities,
          amenities: row.venue_amenities,
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
          booking_date: row.booking_date,
          slot_start_time: row.start_time,
          slot_end_time: row.end_time,
          start_time: row.event_start_time,
          end_time: row.event_end_time,
          duration_minutes: durationMinutes,
          buffered_time_range: row.buffered_time_range,
        },
        status: row.status,
        remarks: row.remarks,
        reviewed_by: row.reviewed_by,
        active_terms_and_conditions: row.active_terms_and_conditions,
        rejection_reason: row.rejection_reason,
        approvals: {
          hod: {
            approved_by: row.hod_approved_by,
            username: row.hod_approver_username,
            approved_at: row.hod_approved_at,
          },
          management: {
            approved_by: row.management_approved_by,
            username: row.management_approver_username,
            approved_at: row.management_approved_at,
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
 * Shared state-machine executor for /review, /hod-review, and /principal-review
 */
async function executeBookingReview(req, res, mode = 'UNIFIED') {
  let client = null;
  try {
    await ensureDatabaseExists();
    const { id } = req.params;
    if (!isValidUuid(id)) {
      return res.status(400).json({ success: false, error: 'Invalid booking id UUID format' });
    }
    const { action, decision, remarks, reason, terms_and_conditions } = req.body || {};

    const rawAction = String(action || decision || '').trim().toUpperCase();
    const actionMap = {
      APPROVE: 'APPROVE',
      APPROVED: 'APPROVE',
      REJECT: 'REJECT',
      REJECTED: 'REJECT',
      PARTIAL: 'PARTIAL',
      PARTIALLY_ACCEPTED: 'PARTIAL',
    };
    const normalizedAction = actionMap[rawAction];

    if (!normalizedAction) {
      return res.status(400).json({
        success: false,
        error: "Action/decision must be one of 'APPROVE', 'REJECT', or 'PARTIAL'",
      });
    }

    const finalRemarks = (remarks ?? reason ?? '').toString().trim() || null;

    if (normalizedAction === 'REJECT' && mode !== 'UNIFIED' && !finalRemarks) {
      return res.status(400).json({ success: false, error: 'Rejection reason is required' });
    }
    if (normalizedAction === 'PARTIAL' && !terms_and_conditions) {
      return res.status(400).json({ success: false, error: 'terms_and_conditions are required for partial acceptance' });
    }

    client = await pool.connect();
    await client.query('BEGIN');

    const bookingRes = await client.query('SELECT * FROM venue_bookings WHERE id = $1 FOR UPDATE', [id]);
    if (bookingRes.rowCount === 0) {
      await safeRollback(client);
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }
    const booking = bookingRes.rows[0];

    if (['APPROVED', 'REJECTED', 'CANCELLED'].includes(booking.status)) {
      await safeRollback(client);
      return res.status(400).json({
        success: false,
        error: `Cannot perform review on a booking in '${booking.status}' status`,
      });
    }

    // Determine stage, permissions, and next status on APPROVE
    let stage = '';
    let nextApproveStatus = '';

    if (mode === 'HOD') {
      const partialStage = booking.active_terms_and_conditions?.stage || 'HOD';
      const isHodStage =
        booking.status === 'PENDING_HOD' ||
        (booking.status === 'PARTIALLY_ACCEPTED' && partialStage === 'HOD');
      if (!isHodStage) {
        await safeRollback(client);
        return res.status(400).json({
          success: false,
          error: `Cannot perform HOD review on a booking in '${booking.status}' status${booking.status === 'PARTIALLY_ACCEPTED' ? ` (stage: ${partialStage})` : ''}`,
        });
      }
      if (
        !isSuperAdminUser(req.user) &&
        (!req.user.department || req.user.department.toUpperCase() !== booking.department.toUpperCase())
      ) {
        await safeRollback(client);
        return res.status(403).json({
          success: false,
          error: `Forbidden: HOD can only review bookings for Department of ${req.user.department || 'their department'}`,
        });
      }
      stage = 'HOD';
      nextApproveStatus = 'PENDING_MANAGEMENT';
    } else if (mode === 'PRINCIPAL') {
      if (booking.status !== 'PENDING_PRINCIPAL') {
        await safeRollback(client);
        return res.status(400).json({
          success: false,
          error: `Cannot perform Principal review on a booking in '${booking.status}' status. Prior approval is required first.`,
        });
      }
      if (!isPrincipalUser(req.user)) {
        await safeRollback(client);
        return res.status(403).json({ success: false, error: 'Forbidden: Principal privileges required' });
      }
      stage = 'PRINCIPAL';
      nextApproveStatus = 'APPROVED';
    } else {
      // UNIFIED multi-tier state machine: PENDING_HOD -> PENDING_MANAGEMENT -> PENDING_PRINCIPAL -> APPROVED
      const effectiveStage =
        booking.status === 'PARTIALLY_ACCEPTED'
          ? (booking.active_terms_and_conditions?.stage || 'HOD')
          : booking.status;

      if (effectiveStage === 'PENDING_HOD' || effectiveStage === 'HOD') {
        if (!isHodUser(req.user)) {
          await safeRollback(client);
          return res.status(403).json({ success: false, error: 'Forbidden: HOD privileges required for this stage' });
        }
        if (
          !isSuperAdminUser(req.user) &&
          (!req.user.department || req.user.department.toUpperCase() !== booking.department.toUpperCase())
        ) {
          await safeRollback(client);
          return res.status(403).json({
            success: false,
            error: `Forbidden: HOD can only review bookings for Department of ${req.user.department || 'their department'}`,
          });
        }
        stage = 'HOD';
        nextApproveStatus = 'PENDING_MANAGEMENT';
      } else if (effectiveStage === 'PENDING_MANAGEMENT' || effectiveStage === 'MANAGEMENT') {
        if (!isManagementUser(req.user)) {
          await safeRollback(client);
          return res.status(403).json({ success: false, error: 'Forbidden: Management privileges required for this stage' });
        }
        stage = 'MANAGEMENT';
        nextApproveStatus = 'PENDING_PRINCIPAL';
      } else if (effectiveStage === 'PENDING_PRINCIPAL' || effectiveStage === 'PRINCIPAL') {
        if (!isPrincipalUser(req.user)) {
          await safeRollback(client);
          return res.status(403).json({ success: false, error: 'Forbidden: Principal privileges required for this stage' });
        }
        stage = 'PRINCIPAL';
        nextApproveStatus = 'APPROVED';
      } else {
        await safeRollback(client);
        return res.status(400).json({
          success: false,
          error: `Cannot review booking in '${booking.status}' status`,
        });
      }
    }

    const reviewerId = getUserId(req.user);
    const stageApprovalCols = {
      HOD: ['hod_approved_by = $2', 'hod_approved_at = NOW()'],
      MANAGEMENT: ['management_approved_by = $2', 'management_approved_at = NOW()'],
      PRINCIPAL: ['principal_approved_by = $2', 'principal_approved_at = NOW()'],
    };

    let newStatus = '';
    let actionLog = '';
    let logMessage = '';
    let updateFields = [];
    let updateValues = [];

    if (normalizedAction === 'APPROVE') {
      newStatus = nextApproveStatus;
      actionLog = `${stage}_APPROVED`;
      logMessage = `${stage} approved the booking. Status transitioned to ${newStatus}.`;
      updateFields = [
        'status = $1',
        ...stageApprovalCols[stage],
        'reviewed_by = $2',
        'remarks = COALESCE($3, remarks)',
        'active_terms_and_conditions = NULL',
        'updated_at = NOW()',
      ];
      updateValues = [newStatus, reviewerId, finalRemarks, id];
    } else if (normalizedAction === 'REJECT') {
      const rejectionText = finalRemarks || `Rejected by ${stage}`;
      newStatus = 'REJECTED';
      actionLog = `${stage}_REJECTED`;
      logMessage = `${stage} rejected booking: ${rejectionText}`;
      updateFields = [
        'status = $1',
        'reviewed_by = $2',
        'remarks = $3',
        'rejection_reason = $3',
        'updated_at = NOW()',
      ];
      updateValues = [newStatus, reviewerId, rejectionText, id];
    } else {
      newStatus = 'PARTIALLY_ACCEPTED';
      actionLog = `${stage}_PARTIAL_TERMS`;
      logMessage = `${stage} issued conditional partial acceptance with specified terms`;
      const termsPayload = {
        stage,
        terms: Array.isArray(terms_and_conditions) ? terms_and_conditions : [terms_and_conditions],
        reason: finalRemarks || `Conditional acceptance by ${stage}`,
        imposed_by: reviewerId,
        imposed_at: new Date().toISOString(),
      };
      updateFields = [
        'status = $1',
        'reviewed_by = $2',
        'remarks = COALESCE($3, remarks)',
        'active_terms_and_conditions = $4::jsonb',
        'updated_at = NOW()',
      ];
      updateValues = [newStatus, reviewerId, finalRemarks, JSON.stringify(termsPayload), id];
    }

    const updateQuery = `
      UPDATE venue_bookings
      SET ${updateFields.join(', ')}
      WHERE id = $${updateValues.length}
      RETURNING *, xmin::text AS pg_xmin, ctid::text AS pg_ctid;
    `;
    const updatedRes = await client.query(updateQuery, updateValues);
    const { row: updatedBooking, dbReceipt } = extractRowAndReceipt(
      updatedRes.rows[0],
      'venue_bookings',
      true
    );

    await client.query(
      `INSERT INTO booking_timeline_logs (booking_id, actor_id, actor_role, action, previous_status, new_status, message, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        id,
        reviewerId,
        stage,
        actionLog,
        booking.status,
        newStatus,
        logMessage,
        JSON.stringify({ stage, terms: terms_and_conditions, remarks: finalRemarks }),
      ]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: `${stage} review action '${normalizedAction}' recorded successfully`,
      booking: updatedBooking,
      dbReceipt,
    });
  } catch (err) {
    await safeRollback(client);
    console.error('executeBookingReview error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Booking review failed' });
  } finally {
    if (client) client.release();
  }
}

/**
 * 8. PATCH /api/v1/venues/bookings/:id/review
 * Unified multi-tier review endpoint: PENDING_HOD -> PENDING_MANAGEMENT -> PENDING_PRINCIPAL -> APPROVED
 */
export async function reviewBooking(req, res) {
  return executeBookingReview(req, res, 'UNIFIED');
}

/**
 * 8b. PATCH /api/v1/venues/bookings/:id/hod-review
 * Legacy HOD Review endpoint preserved for backward compatibility
 */
export async function hodReview(req, res) {
  return executeBookingReview(req, res, 'HOD');
}

/**
 * 9. PATCH /api/v1/venues/bookings/:id/principal-review
 * Principal Review: Approve ('APPROVED'), Reject ('REJECTED'), or Partially Accept ('PARTIALLY_ACCEPTED')
 */
export async function principalReview(req, res) {
  return executeBookingReview(req, res, 'PRINCIPAL');
}

/**
 * 10. PATCH /api/v1/venues/bookings/:id/coordinator-response
 * Coordinator Terms Negotiation (Accessible ONLY by the booking's coordinator_id)
 */
export async function coordinatorResponse(req, res) {
  let client = null;
  try {
    await ensureDatabaseExists();
    const { id } = req.params;
    if (!isValidUuid(id)) {
      return res.status(400).json({ success: false, error: 'Invalid booking id UUID format' });
    }

    const {
      agree_to_terms,
      coordinator_message,
      updated_start_time,
      updated_end_time,
      updated_headcount,
    } = req.body || {};

    if (typeof agree_to_terms !== 'boolean') {
      return res.status(400).json({ success: false, error: 'agree_to_terms (boolean) is required' });
    }

    const hasUpdatedTimes = updated_start_time !== undefined || updated_end_time !== undefined;
    let resolvedUpStart = null;
    let resolvedUpEnd = null;
    let upStartObj = null;
    let upEndObj = null;

    if (updated_headcount !== undefined && updated_headcount !== null && updated_headcount !== '') {
      const testCount = Number(updated_headcount);
      if (!Number.isInteger(testCount) || testCount <= 0) {
        return res.status(400).json({ success: false, error: 'updated_headcount must be a positive integer' });
      }
    }

    client = await pool.connect();
    await client.query('BEGIN');

    const bookingRes = await client.query('SELECT * FROM venue_bookings WHERE id = $1 FOR UPDATE', [id]);
    if (bookingRes.rowCount === 0) {
      await safeRollback(client);
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }
    const booking = bookingRes.rows[0];

    // Authorization check: Only coordinator (or Super Admin) can respond
    const userId = getUserId(req.user);
    if (booking.coordinator_id !== userId && !isSuperAdminUser(req.user)) {
      await safeRollback(client);
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Only the assigned Venue Coordinator can respond to conditional terms',
      });
    }

    if (booking.status !== 'PARTIALLY_ACCEPTED') {
      await safeRollback(client);
      return res.status(400).json({
        success: false,
        error: `Coordinator response is only valid when status is 'PARTIALLY_ACCEPTED' (current: '${booking.status}')`,
      });
    }

    if (hasUpdatedTimes) {
      resolvedUpStart = updated_start_time ?? booking.event_start_time;
      resolvedUpEnd = updated_end_time ?? booking.event_end_time;
      upStartObj = new Date(resolvedUpStart);
      upEndObj = new Date(resolvedUpEnd);
      if (isNaN(upStartObj.getTime()) || isNaN(upEndObj.getTime())) {
        await safeRollback(client);
        return res.status(400).json({ success: false, error: 'Invalid updated_start_time or updated_end_time format' });
      }
      if (upStartObj >= upEndObj) {
        await safeRollback(client);
        return res.status(400).json({ success: false, error: 'updated_start_time must be strictly earlier than updated_end_time' });
      }
      if (updated_start_time !== undefined && upStartObj < new Date(Date.now() - 5 * 60 * 1000)) {
        await safeRollback(client);
        return res.status(400).json({ success: false, error: 'Cannot update venue booking to past timestamps' });
      }
    }

    let parsedHeadcount = null;
    if (updated_headcount !== undefined && updated_headcount !== null && updated_headcount !== '') {
      parsedHeadcount = Number(updated_headcount);
      const venueCapRes = await client.query('SELECT capacity FROM venues WHERE id = $1', [booking.venue_id]);
      if (venueCapRes.rowCount > 0 && parsedHeadcount > venueCapRes.rows[0].capacity) {
        await safeRollback(client);
        return res.status(400).json({
          success: false,
          error: `Updated headcount (${parsedHeadcount}) exceeds venue capacity (${venueCapRes.rows[0].capacity})`,
        });
      }
    }

    const currentTerms = booking.active_terms_and_conditions || {};
    const imposedStage = currentTerms.stage || 'HOD';

    let newStatus = '';
    let actionLog = '';
    let logMessage = '';

    if (agree_to_terms === true) {
      actionLog = 'COORDINATOR_AGREED_TERMS';
      logMessage = `Coordinator agreed to imposed terms: ${coordinator_message || 'Terms accepted'}`;

      // HOD partial terms escalate to Management; Management/Principal terms escalate to Principal
      newStatus = imposedStage === 'HOD' ? 'PENDING_MANAGEMENT' : 'PENDING_PRINCIPAL';
      const nextReviewLabel = imposedStage === 'HOD' ? 'Management' : 'Principal';

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

      if (imposedStage === 'MANAGEMENT') {
        const mgtActorId = currentTerms.imposed_by || booking.reviewed_by || null;
        if (mgtActorId) {
          updateValues.push(mgtActorId);
          updateFields.push(
            `management_approved_by = COALESCE(management_approved_by, $${updateValues.length})`
          );
        }
        if (currentTerms.imposed_at) {
          updateValues.push(currentTerms.imposed_at);
          updateFields.push(
            `management_approved_at = COALESCE(management_approved_at, $${updateValues.length}::timestamptz)`
          );
        } else {
          updateFields.push('management_approved_at = COALESCE(management_approved_at, NOW())');
        }
      } else if (imposedStage === 'HOD') {
        const hodActorId = currentTerms.imposed_by || booking.reviewed_by || null;
        if (hodActorId) {
          updateValues.push(hodActorId);
          updateFields.push(
            `hod_approved_by = COALESCE(hod_approved_by, $${updateValues.length})`
          );
        }
        if (currentTerms.imposed_at) {
          updateValues.push(currentTerms.imposed_at);
          updateFields.push(
            `hod_approved_at = COALESCE(hod_approved_at, $${updateValues.length}::timestamptz)`
          );
        } else {
          updateFields.push('hod_approved_at = COALESCE(hod_approved_at, NOW())');
        }
      }

      // Apply modified times if provided by coordinator
      if (hasUpdatedTimes) {
        updateValues.push(resolvedUpStart, resolvedUpEnd);
        const startParamIdx = updateValues.length - 1;
        const endParamIdx = updateValues.length;
        updateFields.push(`event_start_time = $${startParamIdx}`);
        updateFields.push(`event_end_time = $${endParamIdx}`);
        updateFields.push(
          `buffered_time_range = tstzrange(($${startParamIdx}::timestamptz - INTERVAL '30 minutes'), ($${endParamIdx}::timestamptz + INTERVAL '30 minutes'), '[)')`
        );
        updateValues.push(formatIstDate(upStartObj), formatIstTime(upStartObj), formatIstTime(upEndObj));
        updateFields.push(`booking_date = $${updateValues.length - 2}::date`);
        updateFields.push(`start_time = $${updateValues.length - 1}`);
        updateFields.push(`end_time = $${updateValues.length}`);
      }

      if (parsedHeadcount !== null) {
        updateValues.push(parsedHeadcount);
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
         VALUES ($1, $2, $3, $4, 'PARTIALLY_ACCEPTED', $5, $6, $7::jsonb)`,
        [
          id,
          userId,
          getBaseRole(req.user) || 'FACULTY',
          actionLog,
          newStatus,
          logMessage,
          JSON.stringify({ coordinator_message, updated_start_time, updated_end_time, updated_headcount }),
        ]
      );

      await client.query('COMMIT');
      return res.status(200).json({
        success: true,
        message: `Coordinator agreement recorded. Booking escalated to ${nextReviewLabel} review.`,
        booking: updatedBooking.rows[0],
      });
    } else {
      // Coordinator proposed a counter-requirement / declined terms
      actionLog = 'COORDINATOR_COUNTER_PROPOSAL';
      logMessage = `Coordinator posted counter-requirement: ${coordinator_message || 'Terms not agreed'}`;

      // Return to whichever authority imposed the partial terms
      newStatus =
        imposedStage === 'PRINCIPAL'
          ? 'PENDING_PRINCIPAL'
          : imposedStage === 'MANAGEMENT'
            ? 'PENDING_MANAGEMENT'
            : 'PENDING_HOD';

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
         VALUES ($1, $2, $3, $4, 'PARTIALLY_ACCEPTED', $5, $6, $7::jsonb)`,
        [id, userId, getBaseRole(req.user) || 'FACULTY', actionLog, newStatus, logMessage, JSON.stringify({ coordinator_message })]
      );

      await client.query('COMMIT');
      return res.status(200).json({
        success: true,
        message: `Counter-proposal submitted. Booking returned to ${imposedStage} review.`,
        booking: updatedBooking.rows[0],
      });
    }
  } catch (err) {
    await safeRollback(client);
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
    if (client) client.release();
  }
}

/**
 * 11. PATCH /api/v1/venues/bookings/:id/change-venue
 * Change of Place for Approved/Active Bookings (Resets approval hierarchy back to PENDING_HOD)
 */
export async function changeVenue(req, res) {
  let client = null;
  let resolvedStartTime = null;
  let resolvedEndTime = null;
  try {
    await ensureDatabaseExists();
    const { id } = req.params;
    if (!isValidUuid(id)) {
      return res.status(400).json({ success: false, error: 'Invalid booking id UUID format' });
    }

    const {
      new_venue_id,
      new_start_time,
      new_end_time,
      updated_start_time,
      updated_end_time,
      updated_headcount,
    } = req.body || {};

    if (!new_venue_id) {
      return res.status(400).json({ success: false, error: 'new_venue_id is required' });
    }
    if (!isValidUuid(new_venue_id)) {
      return res.status(400).json({ success: false, error: 'Invalid new_venue_id UUID format' });
    }

    if (updated_headcount !== undefined && updated_headcount !== null && updated_headcount !== '') {
      const testCount = Number(updated_headcount);
      if (!Number.isInteger(testCount) || testCount <= 0) {
        return res.status(400).json({ success: false, error: 'updated_headcount must be a positive integer' });
      }
    }

    client = await pool.connect();
    await client.query('BEGIN');

    const bookingRes = await client.query('SELECT * FROM venue_bookings WHERE id = $1 FOR UPDATE', [id]);
    if (bookingRes.rowCount === 0) {
      await safeRollback(client);
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }
    const booking = bookingRes.rows[0];

    const userId = getUserId(req.user);
    if (booking.coordinator_id !== userId && !isSuperAdminUser(req.user)) {
      await safeRollback(client);
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Only the assigned Venue Coordinator can request a change of venue',
      });
    }

    if (['CANCELLED', 'REJECTED'].includes(booking.status)) {
      await safeRollback(client);
      return res.status(400).json({
        success: false,
        error: `Cannot change venue for a booking in '${booking.status}' status`,
      });
    }

    let finalHeadcount = booking.expected_headcount;
    if (updated_headcount !== undefined && updated_headcount !== null && updated_headcount !== '') {
      finalHeadcount = Number(updated_headcount);
    }

    resolvedStartTime = new_start_time ?? updated_start_time ?? booking.event_start_time;
    resolvedEndTime = new_end_time ?? updated_end_time ?? booking.event_end_time;
    const startObj = new Date(resolvedStartTime);
    const endObj = new Date(resolvedEndTime);
    if (isNaN(startObj.getTime()) || isNaN(endObj.getTime())) {
      await safeRollback(client);
      return res.status(400).json({ success: false, error: 'Invalid start_time or end_time format' });
    }
    if (startObj >= endObj) {
      await safeRollback(client);
      return res.status(400).json({ success: false, error: 'start_time must be strictly earlier than end_time' });
    }
    if (
      (new_start_time !== undefined || updated_start_time !== undefined) &&
      startObj < new Date(Date.now() - 5 * 60 * 1000)
    ) {
      await safeRollback(client);
      return res.status(400).json({
        success: false,
        error: 'Cannot change venue booking to past timestamps',
      });
    }

    // Check new venue exists & capacity
    const venueRes = await client.query('SELECT * FROM venues WHERE id = $1 AND is_active = true', [new_venue_id]);
    if (venueRes.rowCount === 0) {
      await safeRollback(client);
      return res.status(404).json({ success: false, error: 'New venue not found or deactivated' });
    }
    const newVenue = venueRes.rows[0];

    if (finalHeadcount > newVenue.capacity) {
      await safeRollback(client);
      return res.status(400).json({
        success: false,
        error: `Expected headcount (${finalHeadcount}) exceeds new venue capacity (${newVenue.capacity})`,
      });
    }

    // Update venue and RESET approval hierarchy
    const updateQuery = `
      UPDATE venue_bookings
      SET venue_id = $1,
          expected_headcount = $2,
          booking_date = $3::date,
          start_time = $4,
          end_time = $5,
          event_start_time = $6,
          event_end_time = $7,
          buffered_time_range = tstzrange(($6::timestamptz - INTERVAL '30 minutes'), ($7::timestamptz + INTERVAL '30 minutes'), '[)'),
          status = 'PENDING_HOD',
          reviewed_by = NULL,
          remarks = NULL,
          hod_approved_by = NULL,
          hod_approved_at = NULL,
          management_approved_by = NULL,
          management_approved_at = NULL,
          principal_approved_by = NULL,
          principal_approved_at = NULL,
          active_terms_and_conditions = NULL,
          updated_at = NOW()
      WHERE id = $8
      RETURNING *;
    `;
    const updateRes = await client.query(updateQuery, [
      new_venue_id,
      finalHeadcount,
      formatIstDate(startObj),
      formatIstTime(startObj),
      formatIstTime(endObj),
      resolvedStartTime,
      resolvedEndTime,
      id,
    ]);

    // Audit log
    await client.query(
      `INSERT INTO booking_timeline_logs (booking_id, actor_id, actor_role, action, previous_status, new_status, message, metadata)
       VALUES ($1, $2, $3, 'VENUE_CHANGE_REQUESTED', $4, 'PENDING_HOD', $5, $6::jsonb)`,
      [
        id,
        userId,
        getBaseRole(req.user) || 'FACULTY',
        booking.status,
        `Coordinator requested venue change to ${newVenue.name}. Approval hierarchy reset to PENDING_HOD.`,
        JSON.stringify({
          old_venue_id: booking.venue_id,
          new_venue_id,
          new_venue_name: newVenue.name,
          expected_headcount: finalHeadcount,
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
    await safeRollback(client);
    if (err.code === '23P01') {
      const conflicting = resolvedStartTime && resolvedEndTime
        ? await getConflictingBookingDetails(pool, req.body?.new_venue_id, resolvedStartTime, resolvedEndTime)
        : null;
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
    if (client) client.release();
  }
}

/**
 * 12. POST /api/v1/venues/bookings/:id/cancel
 * Cancellation with 24-Hour Cooldown Lock (Natively in PostgreSQL)
 */
export async function cancelBooking(req, res) {
  let client = null;
  try {
    await ensureDatabaseExists();
    const { id } = req.params;
    if (!isValidUuid(id)) {
      return res.status(400).json({ success: false, error: 'Invalid booking id UUID format' });
    }
    const { cancellation_reason } = req.body || {};

    client = await pool.connect();
    await client.query('BEGIN');

    const bookingRes = await client.query('SELECT * FROM venue_bookings WHERE id = $1 FOR UPDATE', [id]);
    if (bookingRes.rowCount === 0) {
      await safeRollback(client);
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }
    const booking = bookingRes.rows[0];

    const userId = getUserId(req.user);

    // Must be initiator or coordinator (or Super Admin)
    if (booking.initiator_id !== userId && booking.coordinator_id !== userId && !isSuperAdminUser(req.user)) {
      await safeRollback(client);
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Only the booking initiator or coordinator can cancel this booking',
      });
    }

    if (['CANCELLED', 'REJECTED'].includes(booking.status)) {
      await safeRollback(client);
      return res.status(400).json({
        success: false,
        error: `Booking is already in '${booking.status}' state`,
      });
    }

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
        getBaseRole(req.user) || 'USER',
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
    await safeRollback(client);
    console.error('cancelBooking error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to cancel booking' });
  } finally {
    if (client) client.release();
  }
}

/**
 * 13. POST /api/v1/venues/bookings/:id/transfer-request
 * "Desperate User" Venue Handover Request to the Current Venue Coordinator
 */
export async function requestTransfer(req, res) {
  try {
    await ensureDatabaseExists();
    const { id } = req.params;
    if (!isValidUuid(id)) {
      return res.status(400).json({ success: false, error: 'Invalid booking id UUID format' });
    }

    const { urgency_reason, new_event_title, new_purpose, new_coordinator_id } = req.body || {};
    const trimmedUrgency = typeof urgency_reason === 'string' ? urgency_reason.trim() : '';
    const trimmedTitle = typeof new_event_title === 'string' ? new_event_title.trim() : '';
    const trimmedPurpose = typeof new_purpose === 'string' ? new_purpose.trim() : '';

    if (!trimmedUrgency || !trimmedTitle || !trimmedPurpose) {
      return res.status(400).json({
        success: false,
        error: 'urgency_reason, new_event_title, and new_purpose must be non-empty strings',
      });
    }

    if (new_coordinator_id !== undefined && new_coordinator_id !== null && new_coordinator_id !== '' && !isValidUuid(new_coordinator_id)) {
      return res.status(400).json({ success: false, error: 'Invalid new_coordinator_id UUID format' });
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

    const requesterId = getUserId(req.user);
    const requesterRole = getBaseRole(req.user) || 'STUDENT';

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
    } else if (new_coordinator_id) {
      const coordCheck = await pool.query(
        'SELECT id FROM users WHERE id = $1 AND is_active = true',
        [new_coordinator_id]
      );
      if (coordCheck.rowCount === 0) {
        return res.status(400).json({ success: false, error: 'new_coordinator_id must reference an active user' });
      }
    } else {
      finalNewCoordinatorId = requesterId;
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
      trimmedTitle,
      trimmedPurpose,
      trimmedUrgency,
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
          urgency_reason: trimmedUrgency,
          new_event_title: trimmedTitle,
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
  let client = null;
  try {
    await ensureDatabaseExists();
    const { transferId } = req.params;
    if (!isValidUuid(transferId)) {
      return res.status(400).json({ success: false, error: 'Invalid transferId UUID format' });
    }

    const { action, response_message } = req.body || {};
    const normalizedAction = String(action || '').trim().toUpperCase();

    if (!['APPROVE', 'REJECT'].includes(normalizedAction)) {
      return res.status(400).json({ success: false, error: "action must be 'APPROVE' or 'REJECT'" });
    }

    client = await pool.connect();
    await client.query('BEGIN');

    const transferRes = await client.query(
      'SELECT * FROM venue_transfer_requests WHERE id = $1 FOR UPDATE',
      [transferId]
    );
    if (transferRes.rowCount === 0) {
      await safeRollback(client);
      return res.status(404).json({ success: false, error: 'Transfer request not found' });
    }
    const transfer = transferRes.rows[0];

    if (transfer.status !== 'PENDING_COORDINATOR') {
      await safeRollback(client);
      return res.status(400).json({
        success: false,
        error: `Transfer request has already been ${transfer.status.toLowerCase()}`,
      });
    }

    const bookingRes = await client.query(
      'SELECT * FROM venue_bookings WHERE id = $1 FOR UPDATE',
      [transfer.booking_id]
    );
    if (bookingRes.rowCount === 0) {
      await safeRollback(client);
      return res.status(404).json({ success: false, error: 'Associated venue booking not found' });
    }
    const booking = bookingRes.rows[0];

    // Authorization: Only current booking's coordinator (or Super Admin) can respond
    const userId = getUserId(req.user);
    if (booking.coordinator_id !== userId && !isSuperAdminUser(req.user)) {
      await safeRollback(client);
      return res.status(403).json({
        success: false,
        error: "Forbidden: Only the current booking's Venue Coordinator can respond to this transfer request",
      });
    }

    if (normalizedAction === 'REJECT') {
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
         VALUES ($1, $2, $3, 'TRANSFER_REJECTED', $4, $4, $5, $6::jsonb)`,
        [
          booking.id,
          userId,
          getBaseRole(req.user) || 'FACULTY',
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
      if (requesterRes.rowCount === 0) {
        await safeRollback(client);
        return res.status(404).json({ success: false, error: 'Transfer requester user not found' });
      }
      const requester = requesterRes.rows[0];

      // Update venue_bookings with the new initiator, coordinator, event_title, and purpose
      const updateBookingQuery = `
        UPDATE venue_bookings
        SET initiator_id = $1,
            requested_by = $1,
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
         VALUES ($1, $2, $3, 'TRANSFER_APPROVED', $4, $4, $5, $6::jsonb)`,
        [
          booking.id,
          userId,
          getBaseRole(req.user) || 'FACULTY',
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
    await safeRollback(client);
    console.error('respondTransferRequest error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to respond to transfer request' });
  } finally {
    if (client) client.release();
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
  reviewBooking,
  hodReview,
  principalReview,
  coordinatorResponse,
  changeVenue,
  cancelBooking,
  requestTransfer,
  respondTransferRequest,
};
