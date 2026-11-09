import helmet from 'helmet';
import hpp from 'hpp';
import rateLimit from 'express-rate-limit';

/**
 * Configure strict CORS options
 */
export function getCorsOptions() {
  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:8081';
  const allowedOrigins = allowedOriginsEnv.split(',').map((o) => o.trim()).filter(Boolean);

  return {
    origin: (origin, callback) => {
      // Allow requests with no origin (such as mobile apps, Postman, curl, or server-to-server)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Check localhost patterns for dev environments
      if (/^https?:\/\/localhost(:\d+)?$/.test(origin) || /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked: Origin ${origin} not allowed`));
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-bootstrap-key'],
    exposedHeaders: ['Authorization'],
    maxAge: 86400,
  };
}

/**
 * General API rate limiter: 200 requests per 15 minutes
 */
export const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again after 15 minutes.',
  },
});

/**
 * Strict authentication limiter for login and bootstrapping: 25 requests per 15 minutes
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again after 15 minutes.',
  },
});

/**
 * Security middleware bundle: Helmet & HPP
 */
export const helmetMiddleware = helmet({
  contentSecurityPolicy: false, // Keep flexible for API-only backend
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});

export const hppMiddleware = hpp();

export default {
  getCorsOptions,
  generalApiLimiter,
  authLimiter,
  helmetMiddleware,
  hppMiddleware,
};

