import jwt from 'jsonwebtoken';

const JWT_SECRET =
  process.env.JWT_SECRET ||
  'rljit_arcade_jwt_super_secure_secret_key_minimum_32_characters_2026';

/**
 * Middleware to verify JWT and attach decoded user payload to req.user
 */
export function verifyJWT(req, res, next) {
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

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    return next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid or expired token',
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

export default {
  verifyJWT,
  requireSuperAdmin,
};

