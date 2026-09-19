import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import { env } from './config/env.js';
import routes from './routes/index.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  // Behind nginx / a load balancer — makes req.ip honour X-Forwarded-For.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'same-site' },
  }));

  app.use(cors({
    origin: env.CLIENT_ORIGIN,
    credentials: true,          // required for the HttpOnly refresh cookie
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  app.use('/api', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}