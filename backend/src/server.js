import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure .env is loaded
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Ensure upload directories exist for static asset serving
const UPLOADS_DIR = path.resolve(__dirname, '../uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// 1. Core Security & Header Hardening
app.use(helmetMiddleware);
app.use(hppMiddleware);
app.use(cors(getCorsOptions()));

// 2. Request Parsing with 2MB limits
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// 3. Static Uploads File Server
app.use('/uploads', express.static(UPLOADS_DIR));

// 4. General Rate Limiter for all API routes
app.use('/api', generalApiLimiter);

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
    },
  });
});

// 5. Postman diagnostic and database routes
app.use(dbRoutes);

// 6. Feature Routers mounted under /api/v1 and root alias for flexible routing
const routers = [
  authRoutes,
  profileRoutes,
  timetableRoutes,
  academicRoutes,
  lgRoutes,
  financeAndVaultRoutes,
];

routers.forEach((r) => {
  app.use('/api/v1', r);
  app.use(r);
});

// 7. 404 Catch-all handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route '${req.originalUrl}' not found on RLJIT Arcade server`,
  });
});

// 8. Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error',
  });
});

// 9. Start HTTP server
app.listen(PORT, () => {
  console.log(`RLJIT Arcade server running on port ${PORT}`);
});

export default app;
