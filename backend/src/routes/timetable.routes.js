import { Router } from 'express';
import {
  masterSetup,
  getDailyView,
  createSwapRequest,
  approveSwap,
} from '../controllers/timetable.controller.js';
import { verifyJWT, requireHOD, requireFaculty } from '../middlewares/auth.middleware.js';

const router = Router();

// Master schedule setup (HOD / Super Admin)
router.post('/timetable/master-setup', verifyJWT, requireHOD, masterSetup);

// View daily schedule overlaying approved swaps
router.get('/timetable/daily-view', verifyJWT, getDailyView);

// Class swap lifecycle
router.post('/timetable/swap-request', verifyJWT, requireFaculty, createSwapRequest);
router.patch('/timetable/swap-approve/:swapId', verifyJWT, requireFaculty, approveSwap);

export default router;

