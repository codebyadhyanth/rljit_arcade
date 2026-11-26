import { Router } from 'express';
import {
  getAnalyzerSummary,
  getAnalyzerStudents,
  getAnalyzerStudentDetail,
  isAnalyzerAuthorized,
} from '../controllers/analyzer.controller.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';

const router = Router();

function requireAnalyzerAccess(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  if (!isAnalyzerAuthorized(req.user)) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: Academic Analyzer is restricted to Faculty, HOD, and Super Admin accounts',
    });
  }
  return next();
}

router.get('/analyzer/summary', verifyJWT, requireAnalyzerAccess, getAnalyzerSummary);
router.get('/analyzer/students', verifyJWT, requireAnalyzerAccess, getAnalyzerStudents);
router.get('/analyzer/students/:studentId', verifyJWT, requireAnalyzerAccess, getAnalyzerStudentDetail);

export default router;
