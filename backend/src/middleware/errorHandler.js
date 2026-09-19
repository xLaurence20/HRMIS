import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

export const notFoundHandler = (req, _res, next) => {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404, 'ROUTE_NOT_FOUND'));
};

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, _next) => {
  let statusCode = err.statusCode ?? 500;
  let code = err.code ?? 'INTERNAL_ERROR';
  let message = err.message ?? 'Something went wrong.';
  let details = err.details ?? null;

  // Translate MySQL driver errors into friendly API errors.
  if (err.code === 'ER_DUP_ENTRY') {
    statusCode = 409;
    code = 'DUPLICATE_ENTRY';
    const field = /for key '(.+?)'/.exec(err.sqlMessage)?.[1] ?? 'value';
    message = `That ${field} is already taken.`;
  } else if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    statusCode = 400;
    code = 'INVALID_REFERENCE';
    message = 'Referenced record does not exist.';
  } else if (err.code === 'ECONNREFUSED' || err.code === 'PROTOCOL_CONNECTION_LOST') {
    statusCode = 503;
    code = 'DB_UNAVAILABLE';
    message = 'Database temporarily unavailable.';
  }

  if (statusCode >= 500) {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, err);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
      ...(env.IS_PROD ? {} : { stack: err.stack }),
    },
  });
};