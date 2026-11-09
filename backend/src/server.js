import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import dbRoutes from './routes/db.routes.js';
import authRoutes from './routes/auth.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure .env is loaded
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Global middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root health check endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    project: 'RLJIT Arcade Backend',
    status: 'online',
    timestamp: new Date().toISOString(),
  });
});

// Postman diagnostic and database routes
app.use(dbRoutes);

// Hierarchical RBAC Provisioning, Authentication & Search routes
app.use('/api/v1', authRoutes);
app.use(authRoutes);

// 404 Catch-all handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route '${req.originalUrl}' not found`,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error',
  });
});

// Start HTTP server
app.listen(PORT, () => {
  console.log(`RLJIT Arcade server running on port ${PORT}`);
});

export default app;
