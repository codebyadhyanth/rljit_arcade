import { Router } from 'express';
import {
  assignLgMapping,
  assignSubRoles,
  getLgMentees,
  getAtRiskRadar,
  createLeaveRequest,
  approveLeaveRequest,
} from '../controllers/lg.controller.js';
import { verifyJWT, requireHOD, requireFaculty } from '../middlewares/auth.middleware.js';

const router = Router();

// HOD LG mentee & coordinator allocation
router.post('/hod/lg-mapping/assign', verifyJWT, requireHOD, assignLgMapping);
router.patch('/hod/assign-subroles', verifyJWT, requireHOD, assignSubRoles);

// Faculty mentee inspection & Early warning radar
router.get('/faculty/lg-mentees', verifyJWT, requireFaculty, getLgMentees);
router.get('/faculty/lg-radar', verifyJWT, requireFaculty, getAtRiskRadar);

// Student leave lifecycle
router.post('/student/leave-request', verifyJWT, createLeaveRequest);
router.patch('/faculty/leave-approve/:leaveId', verifyJWT, requireFaculty, approveLeaveRequest);

export default router;

