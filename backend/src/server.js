import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import {
  helmetMiddleware,
  hppMiddleware,
  getCorsOptions,
  generalApiLimiter,
} from './middlewares/security.middleware.js';

import dbRoutes from './routes/db.routes.js';
import authRoutes from './routes/auth.routes.js';
import profileRoutes from './routes/profile.routes.js';
import timetableRoutes from './routes/timetable.routes.js';
import academicRoutes from './routes/academic.routes.js';
import lgRoutes from './routes/lg.routes.js';
import financeAndVaultRoutes from './routes/financeAndVault.routes.js';
import venueRoutes from './routes/venue.routes.js';
import portalsRoutes from './routes/portals.routes.js';
import documentRoutes from './routes/document.routes.js';
import analyzerRoutes from './routes/analyzer.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure .env is loaded
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Ensure guarded avatar-only public upload directory exists (vault & ocr remain private)
const AVATARS_DIR = path.resolve(__dirname, '../uploads/avatars');
fs.mkdirSync(AVATARS_DIR, { recursive: true });

// 1. Core Security & Header Hardening
app.use(helmetMiddleware);
app.use(hppMiddleware);
app.use(cors(getCorsOptions()));

// 2. Request Parsing with 2MB limits
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// 3. Guarded Avatar-Only Static Assets (NEVER expose /uploads/vault, /uploads/ocr, or private_vault)
app.use('/uploads/avatars', express.static(AVATARS_DIR, { dotfiles: 'deny', index: false }));

function applyGeneralLimiterOnce(req, res, next) {
  if (req._generalRateLimited) {
    return next();
  }
  req._generalRateLimited = true;
  return generalApiLimiter(req, res, next);
}

// Root health check endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    project: 'RLJIT Arcade Backend',
    status: 'online',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      documentation: '/postman_uri.md',
      dbDiagnostics: '/db:rljit_arcade/connect',
      dbStorageVerifier: '/api/v1/db/verify-storage',
      auth: '/api/v1/auth/login',
      venues: '/api/v1/venues',
      placements: '/api/v1/placements/drives',
      financeRecords: '/api/v1/finance/records',
      analytics: '/api/v1/analytics/overview',
      documents: '/api/v1/documents',
      collegeInfo: '/api/v1/college-info',
      analyzer: '/api/v1/analyzer/summary',
    },
  });
});

// 4. Postman diagnostic and database routes (backward-compatible)
app.use(dbRoutes);

// 5. Feature Routers mounted under /api/v1 and root alias with single-pass rate limiting
const apiRouter = express.Router();
const routers = [
  authRoutes,
  profileRoutes,
  timetableRoutes,
  academicRoutes,
  lgRoutes,
  financeAndVaultRoutes,
  venueRoutes,
  portalsRoutes,
  documentRoutes,
  analyzerRoutes,
];

routers.forEach((r) => {
  apiRouter.use(r);
});

app.use('/api/v1', applyGeneralLimiterOnce, apiRouter);
app.use(applyGeneralLimiterOnce, apiRouter);

// 6. 404 Catch-all handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route '${req.originalUrl}' not found on RLJIT Arcade server`,
  });
});

// 7. Global & Multer error handler
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        error: 'Uploaded file exceeds the maximum allowed size limit',
        code: err.code,
      });
    }
    return res.status(400).json({
      success: false,
      error: err.message || 'File upload error',
      code: err.code,
    });
  }

  if (
    err?.status === 400 ||
    err?.statusCode === 400 ||
    (typeof err?.message === 'string' && err.message.startsWith('Invalid file type.'))
  ) {
    return res.status(400).json({
      success: false,
      error: err.message || 'Bad Request',
    });
  }

  console.error('Unhandled server error:', err);
  return res.status(err.status || err.statusCode || 500).json({
    success: false,
    error: err.message || 'Internal Server Error',
  });
});

// 8. Start HTTP server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`RLJIT Arcade server running on http://0.0.0.0:${PORT}`);
});

export default app;
