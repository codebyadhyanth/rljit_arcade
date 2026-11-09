import { Router } from 'express';
import {
  connectAndInitAll,
  connectAndInitRole,
  getRoleStatus,
} from '../controllers/db.controller.js';

const router = Router();

/**
 * Diagnostic route dispatcher:
 * Express 5 path-to-regexp interprets colons (:) as parameter indicators.
 * Using middleware with req.path/req.originalUrl pattern matching allows literal Postman
 * URLs containing single or double colons (e.g., /db:rljit_arcade/connect,
 * /db:rljit_arcade::role/connect, /db:rljit_arcade:role/connect) to work seamlessly.
 */
router.use((req, res, next) => {
  if (req.method !== 'GET') {
    return next();
  }

  const candidates = [
    req.path,
    req.originalUrl ? req.originalUrl.split('?')[0] : null,
    req.url ? req.url.split('?')[0] : null,
  ].filter(Boolean);

  for (const raw of candidates) {
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      decoded = raw;
    }

    // Strip trailing slashes for uniform matching
    const norm = decoded.replace(/\/+$/, '') || '/';

    // 1. GET /db:rljit_arcade/connect (and alias /db/rljit_arcade/connect)
    if (
      norm === '/db:rljit_arcade/connect' ||
      norm === '/db/rljit_arcade/connect'
    ) {
      return connectAndInitAll(req, res);
    }

    // 2. GET /db:rljit_arcade::role/connect (matches /db:rljit_arcade:student/connect, etc.)
    const connectMatch = norm.match(
      /^\/db(?::|\/)rljit_arcade(?:::|:|\/)([^/]+)\/connect$/i
    );
    if (connectMatch) {
      req.params = { ...req.params, role: connectMatch[1] };
      return connectAndInitRole(req, res);
    }

    // 3. GET /db:rljit_arcade::role/status (matches /db:rljit_arcade:student/status, etc.)
    const statusMatch = norm.match(
      /^\/db(?::|\/)rljit_arcade(?:::|:|\/)([^/]+)\/status$/i
    );
    if (statusMatch) {
      req.params = { ...req.params, role: statusMatch[1] };
      return getRoleStatus(req, res);
    }
  }

  return next();
});

export default router;

