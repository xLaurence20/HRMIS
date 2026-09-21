import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import { env } from './config/env.js';
import routes from './routes/index.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { attachAuditContext } from './middleware/auditContext.js';

export function createApp() {
  const app = express();

  // Behind nginx / a load balancer — makes req.ip honour X-Forwarded-For.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // Helmet — allow cross-origin resource loading so images/uploads served
  // by the API are visible from the Vercel-hosted frontend.
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));

  // ---- CORS -----------------------------------------------------------
  // CLIENT_ORIGIN can be a single URL or a comma-separated list.
  // Example: "https://hrmis-tawny.vercel.app,https://hrmis-prod.vercel.app"
  const allowedOrigins = String(env.CLIENT_ORIGIN ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.use(cors({
    origin(origin, callback) {
      // Allow requests with no Origin header (curl, Postman, server-to-server)
      if (!origin) return callback(null, true);

      // In non-prod, be permissive so localhost variants all work.
      if (!env.IS_PROD) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.warn(`[cors] Rejected origin: ${origin}`);
      return callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  // Audit context: request ID + fallback HTTP logger for mutating requests.
  // Must come after the body parsers so req.body is populated.
  app.use(attachAuditContext);

  app.use('/api', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}