import { Router } from 'express';
import {
  masterSetup,
  getDailyView,
  createSwapRequest,
  approveSwap,
  getTimetableSlots,
  createTimetableSlots,
  swapTimetableSlot,
} from '../controllers/timetable.controller.js';
import { verifyJWT, requireHOD, requireFaculty } from '../middlewares/auth.middleware.js';

const router = Router();

// Wave 2 Manual Timetable Endpoints
router.get('/timetable', verifyJWT, getTimetableSlots);
router.post('/timetable', verifyJWT, requireHOD, createTimetableSlots);
router.patch('/timetable/:id/swap', verifyJWT, requireFaculty, swapTimetableSlot);

// Legacy Timetable Setup & Views
router.post('/timetable/master-setup', verifyJWT, requireHOD, masterSetup);
router.get('/timetable/daily-view', verifyJWT, getDailyView);
router.post('/timetable/swap-request', verifyJWT, requireFaculty, createSwapRequest);
router.patch('/timetable/swap-approve/:swapId', verifyJWT, requireFaculty, approveSwap);

export default router;

