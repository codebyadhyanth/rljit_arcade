import { Router } from 'express';
import { getProfile, getDashboardMetrics } from '../controllers/profile.controller.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';

const router = Router();

// Profile inspection
router.get('/profile/me', verifyJWT, getProfile);

// Dynamic role-based dashboard metrics
router.get('/dashboard/metrics', verifyJWT, getDashboardMetrics);

export default router;

