import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

const JWT_SECRET =
  process.env.JWT_SECRET ||
  'rljit_arcade_jwt_super_secure_secret_key_minimum_32_characters_2026';

/**
 * Middleware to verify JWT, fetch live token_version & is_active from users,
 * and attach decoded user payload to req.user.
 */
export async function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization || req.headers.Authorization;

  if (!authHeader) {
    return res.status(401).json({
      success: false,
      error: 'Authorization header missing',
    });
  }

  const parts = authHeader.split(' ');
  const token = parts.length === 2 && /^Bearer$/i.test(parts[0]) ? parts[1] : authHeader;

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Bearer token missing from Authorization header',
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid or expired token',
    });
  }

  const userId = decoded.userId || decoded.id;
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Malformed token payload',
    });
  }

  try {
    // Live database check for token version and active status
    const dbCheck = await pool.query(
      'SELECT token_version, is_active FROM users WHERE id = $1',
      [userId]
    );

    if (dbCheck.rowCount === 0) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: User account not found',
      });
    }

    const dbUser = dbCheck.rows[0];

    if (!dbUser.is_active) {
      return res.status(403).json({
        success: false,
        error: 'Account is deactivated. Please contact administration.',
      });
    }

    // Verify token version matches database (for immediate invalidation on logout/password change)
    if (
      decoded.tokenVersion !== undefined &&
      decoded.tokenVersion !== dbUser.token_version
    ) {
      return res.status(401).json({
        success: false,
        error: 'Session revoked: Token has been invalidated. Please log in again.',
      });
    }

    req.user = {
      ...decoded,
      userId,
      tokenVersion: dbUser.token_version,
    };

    return next();
  } catch (dbErr) {
    console.error('Error verifying token in database:', dbErr.message);
    return res.status(500).json({
      success: false,
      error: 'Authentication verification service error',
    });
  }
}

/**
 * Middleware requiring SUPER_ADMIN admin_tier
 */
export function requireSuperAdmin(req, res, next) {
  if (!req.user || req.user.adminTier !== 'SUPER_ADMIN') {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: Super Admin access required',
    });
  }
  return next();
}

/**
 * Middleware requiring HOD authority (HOD_ADMIN tier or 'HOD' in subRoles, or Super Admin override)
 */
export function requireHOD(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const isHod =
    req.user.adminTier === 'SUPER_ADMIN' ||
    req.user.adminTier === 'HOD_ADMIN' ||
    (Array.isArray(req.user.subRoles) && req.user.subRoles.includes('HOD'));

  if (!isHod) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: HOD or Principal privileges required',
    });
  }
  return next();
}

/**
 * Middleware requiring Faculty role (or Super Admin override)
 */
export function requireFaculty(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const isFaculty =
    req.user.baseRole === 'FACULTY' || req.user.adminTier === 'SUPER_ADMIN';

  if (!isFaculty) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: Faculty privileges required',
    });
  }
  return next();
}

/**
 * Middleware requiring Admission Admin sectionCode 'ADM' (or Super Admin)
 */
export function requireAdmissionAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const isAdm =
    req.user.adminTier === 'SUPER_ADMIN' ||
    (req.user.baseRole === 'ADMIN' && req.user.sectionCode === 'ADM');

  if (!isAdm) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: Admission Section Admin privileges required',
    });
  }
  return next();
}

/**
 * Middleware requiring Finance/Accounts Admin sectionCode 'ACC' (or Super Admin)
 */
export function requireFinanceAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const isAcc =
    req.user.adminTier === 'SUPER_ADMIN' ||
    (req.user.baseRole === 'ADMIN' && req.user.sectionCode === 'ACC');

  if (!isAcc) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: Finance & Accounts Admin privileges required',
    });
  }
  return next();
}

export default {
  verifyJWT,
  requireSuperAdmin,
  requireHOD,
  requireFaculty,
  requireAdmissionAdmin,
  requireFinanceAdmin,
};

