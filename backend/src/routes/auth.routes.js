import { Router } from 'express';
import {
  bootstrapSuperAdmin,
  provisionAuthority,
  provisionStudent,
  login,
  logout,
  searchUsers,
  verifyDbStorage,
} from '../controllers/auth.controller.js';
import { verifyJWT, requireSuperAdmin } from '../middlewares/auth.middleware.js';
import { authLimiter } from '../middlewares/security.middleware.js';

const router = Router();

// A. Step 1: First-Time Setup
router.post('/auth/bootstrap-super-admin', authLimiter, bootstrapSuperAdmin);

// B. Step 2: Super Admin creates Admission Admin, HODs, or Faculty
router.post(
  '/super-admin/provision-authority',
  verifyJWT,
  requireSuperAdmin,
  provisionAuthority
);

// C. Step 3: Student Creation via Admission Portal or HOD Admin Portal
router.post('/portals/provision-student', verifyJWT, provisionStudent);

// D. Authentication & User Search
router.post('/auth/login', authLimiter, login);
router.post('/auth/logout', verifyJWT, logout);
router.get('/users/search', verifyJWT, searchUsers);

// E. Postman DB Storage & Persistence Inspector (Super Admin JWT or x-bootstrap-key)
router.get('/db/verify-storage', verifyDbStorage);

export default router;
