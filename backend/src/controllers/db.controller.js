import pool, { ensureDatabaseExists } from '../config/db.js';
import { ROLE_SCHEMAS, VALID_ROLES } from '../models/schemas.sql.js';

/**
 * Ensures database exists and initializes all 3 role tables (student, faculty, admin)
 * GET /db:rljit_arcade/connect (and alias /db/rljit_arcade/connect)
 */
export async function connectAndInitAll(req, res) {
  try {
    await ensureDatabaseExists();

    for (const role of VALID_ROLES) {
      await pool.query(ROLE_SCHEMAS[role]);
    }

    return res.status(200).json({
      success: true,
      database: 'rljit_arcade',
      status: 'Connected & Initialized',
      tablesCreated: ['student', 'faculty', 'admin'],
    });
  } catch (error) {
    console.error('Error connecting and initializing all tables:', error);
    return res.status(500).json({
      success: false,
      database: 'rljit_arcade',
      error: error.message || 'Database initialization failed',
    });
  }
}

/**
 * Validates role and creates/verifies that specific role table
 * GET /db:rljit_arcade::role/connect
 */
export async function connectAndInitRole(req, res) {
  try {
    const rawRole = req.params.role;
    const role = (rawRole || '').trim().toLowerCase();

    if (!role || !VALID_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        database: 'rljit_arcade',
        error: `Invalid role scope: '${rawRole}'. Valid roles are: ${VALID_ROLES.join(', ')}.`,
      });
    }

    await ensureDatabaseExists();
    await pool.query(ROLE_SCHEMAS[role]);

    return res.status(200).json({
      success: true,
      database: 'rljit_arcade',
      targetTable: role,
      message: 'Table verified/created and connected',
    });
  } catch (error) {
    console.error(`Error connecting and initializing role table:`, error);
    return res.status(500).json({
      success: false,
      database: 'rljit_arcade',
      error: error.message || 'Role table initialization failed',
    });
  }
}

/**
 * Queries information_schema.columns and COUNT(*) for the specified role table
 * GET /db:rljit_arcade::role/status
 */
export async function getRoleStatus(req, res) {
  try {
    const rawRole = req.params.role;
    const role = (rawRole || '').trim().toLowerCase();

    if (!role || !VALID_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        database: 'rljit_arcade',
        error: `Invalid role scope: '${rawRole}'. Valid roles are: ${VALID_ROLES.join(', ')}.`,
      });
    }

    await ensureDatabaseExists();

    const columnsResult = await pool.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [role]
    );

    const exists = columnsResult.rowCount > 0;
    let rowCount = 0;
    const columns = columnsResult.rows.map((row) => row.column_name);

    if (exists) {
      const countResult = await pool.query(`SELECT COUNT(*) FROM "${role}"`);
      rowCount = parseInt(countResult.rows[0].count, 10);
    }

    return res.status(200).json({
      success: true,
      database: 'rljit_arcade',
      roleTable: role,
      exists,
      rowCount,
      columns,
    });
  } catch (error) {
    console.error(`Error fetching status for role:`, error);
    return res.status(500).json({
      success: false,
      database: 'rljit_arcade',
      error: error.message || 'Failed to retrieve role status',
    });
  }
}

export default {
  connectAndInitAll,
  connectAndInitRole,
  getRoleStatus,
};

