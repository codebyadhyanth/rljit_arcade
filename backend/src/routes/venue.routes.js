import { Router } from 'express';
import {
  createVenue,
  listVenues,
  updateVenue,
  checkAvailability,
  initiateBooking,
  listBookings,
  getBookingDetails,
  reviewBooking,
  hodReview,
  principalReview,
  coordinatorResponse,
  changeVenue,
  cancelBooking,
  requestTransfer,
  respondTransferRequest,
} from '../controllers/venue.controller.js';

import {
  verifyJWT,
  requireSuperAdmin,
  requireManagement,
  requireHOD,
  requirePrincipal,
} from '../middlewares/auth.middleware.js';

const router = Router();

function requireAllowedRoles(allowedRoles, errorMessage) {
  return function roleGuard(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    const baseRole = req.user.baseRole || req.user.base_role;
    const adminTier = req.user.adminTier || req.user.admin_tier;
    if (allowedRoles.includes(baseRole) || adminTier === 'SUPER_ADMIN') {
      return next();
    }
    return res.status(403).json({ success: false, error: errorMessage });
  };
}

/**
 * Allows STUDENT, FACULTY, and ADMIN (SUPER_ADMIN + section admins e.g. PLC/SPT/MGT/HOD)
 * to initiate venue bookings.
 */
const allowBookingInitiators = requireAllowedRoles(
  ['STUDENT', 'FACULTY', 'ADMIN'],
  'Forbidden: Only Student, Faculty, or Admin accounts can initiate venue bookings'
);

/**
 * Allows active FACULTY or ADMIN (including SUPER_ADMIN), blocking STUDENT.
 * Controllers enforce booking.coordinator_id === userId (or SUPER_ADMIN).
 */
const allowCoordinatorActors = requireAllowedRoles(
  ['FACULTY', 'ADMIN'],
  'Forbidden: Only Faculty or Admin coordinators can perform this action'
);

// 1. Master Venue Directory Management
router.post('/venues', verifyJWT, requireManagement, createVenue);
router.get('/venues', verifyJWT, listVenues);
router.patch('/venues/:venueId', verifyJWT, requireSuperAdmin, updateVenue);

// 2. Real-time Slot Availability Check
router.get('/venues/availability', verifyJWT, checkAvailability);

// 3. Venue Booking Lifecycle & Multi-Stage Approval State Machine
router.post('/venues/bookings', verifyJWT, allowBookingInitiators, initiateBooking);
router.get('/venues/bookings', verifyJWT, listBookings);
router.get('/venues/bookings/:id', verifyJWT, getBookingDetails);

// 4. Multi-Stage Approval Reviews
router.patch('/venues/bookings/:id/review', verifyJWT, reviewBooking);
router.patch('/venues/bookings/:id/hod-review', verifyJWT, requireHOD, hodReview);
router.patch('/venues/bookings/:id/principal-review', verifyJWT, requirePrincipal, principalReview);
router.patch('/venues/bookings/:id/coordinator-response', verifyJWT, allowCoordinatorActors, coordinatorResponse);

// 5. Change of Venue & Cancellation (with 24h cooldown)
router.patch('/venues/bookings/:id/change-venue', verifyJWT, allowCoordinatorActors, changeVenue);
router.post('/venues/bookings/:id/cancel', verifyJWT, cancelBooking);

// 6. "Desperate User" Venue Handover / Transfer
router.post('/venues/bookings/:id/transfer-request', verifyJWT, requestTransfer);
router.patch('/venues/transfer-requests/:transferId/respond', verifyJWT, allowCoordinatorActors, respondTransferRequest);

export default router;
