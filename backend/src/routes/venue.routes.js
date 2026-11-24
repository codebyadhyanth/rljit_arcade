import { Router } from 'express';
import {
  createVenue,
  listVenues,
  updateVenue,
  checkAvailability,
  initiateBooking,
  listBookings,
  getBookingDetails,
  hodReview,
  principalReview,
  coordinatorResponse,
  changeVenue,
  cancelBooking,
  requestTransfer,
  respondTransferRequest,
  reviewBooking,
} from '../controllers/venue.controller.js';

import {
  verifyJWT,
  requireSuperAdmin,
  requireHOD,
  requirePrincipal,
  requireFaculty,
  requireBookingInitiator,
} from '../middlewares/auth.middleware.js';

const router = Router();

// 1. Master Venue Directory Management (Super Admin only)
router.post('/venues', verifyJWT, requireSuperAdmin, createVenue);
router.get('/venues', verifyJWT, listVenues);
router.patch('/venues/:venueId', verifyJWT, requireSuperAdmin, updateVenue);

// 2. Real-time Slot Availability Check
router.get('/venues/availability', verifyJWT, checkAvailability);

// 3. Venue Booking Lifecycle & Multi-Stage Approval State Machine
router.post('/venues/bookings', verifyJWT, requireBookingInitiator, initiateBooking);
router.get('/venues/bookings', verifyJWT, listBookings);
router.get('/venues/bookings/:id', verifyJWT, getBookingDetails);

// 4. Multi-Stage Approval Reviews
router.patch('/venues/bookings/:id/review', verifyJWT, reviewBooking);
router.patch('/venues/bookings/:id/hod-review', verifyJWT, requireHOD, hodReview);
router.patch('/venues/bookings/:id/principal-review', verifyJWT, requirePrincipal, principalReview);
router.patch('/venues/bookings/:id/coordinator-response', verifyJWT, requireFaculty, coordinatorResponse);

// 5. Change of Venue & Cancellation (with 24h cooldown)
router.patch('/venues/bookings/:id/change-venue', verifyJWT, requireFaculty, changeVenue);
router.post('/venues/bookings/:id/cancel', verifyJWT, cancelBooking);

// 6. "Desperate User" Venue Handover / Transfer
router.post('/venues/bookings/:id/transfer-request', verifyJWT, requestTransfer);
router.patch('/venues/transfer-requests/:transferId/respond', verifyJWT, requireFaculty, respondTransferRequest);

export default router;
