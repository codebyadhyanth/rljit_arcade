import { Router } from 'express';
import {
  masterSetup,
  getDailyView,
  createSwapRequest,
  approveSwap,
  getTimetableSlots,
  upsertTimetableSlots,
  handleSlotSwap,
} from '../controllers/timetable.controller.js';
import { verifyJWT, requireHOD, requireFaculty } from '../middlewares/auth.middleware.js';

const router = Router();

function requireTimetableManager(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const secCode = String(req.user.sectionCode || '').trim().toUpperCase();
  const isSuperAdmin = req.user.adminTier === 'SUPER_ADMIN';
  const isHod =
    req.user.adminTier === 'HOD_ADMIN' ||
    (Array.isArray(req.user.subRoles) && req.user.subRoles.includes('HOD'));
  const isAdmOrExmAdmin =
    (req.user.baseRole === 'ADMIN' || req.user.adminTier === 'REGULAR_ADMIN') &&
    (secCode === 'ADM' || secCode === 'EXM');

  if (!isSuperAdmin && !isHod && !isAdmOrExmAdmin) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: HOD, ADM/EXM Admin, or Super Admin privileges required',
    });
  }
  return next();
}

// Normalized timetable_slots REST endpoints
router.get('/timetable', verifyJWT, getTimetableSlots);
router.post('/timetable', verifyJWT, requireTimetableManager, upsertTimetableSlots);
router.patch('/timetable/:id/swap', verifyJWT, requireFaculty, handleSlotSwap);

// Master schedule setup (HOD / Super Admin)
router.post('/timetable/master-setup', verifyJWT, requireHOD, masterSetup);

// View daily schedule overlaying approved swaps
router.get('/timetable/daily-view', verifyJWT, getDailyView);

// Class swap lifecycle
router.post('/timetable/swap-request', verifyJWT, requireFaculty, createSwapRequest);
router.patch('/timetable/swap-approve/:swapId', verifyJWT, requireFaculty, approveSwap);

export default router;

