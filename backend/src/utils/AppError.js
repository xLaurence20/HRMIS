export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export const badRequest = (m, d) => new AppError(m, 400, 'BAD_REQUEST', d);
export const unauthorized = (m = 'Authentication required', c = 'UNAUTHORIZED') =>
  new AppError(m, 401, c);
export const forbidden = (m = 'You do not have permission to perform this action') =>
  new AppError(m, 403, 'FORBIDDEN');
export const notFound = (m = 'Resource not found') => new AppError(m, 404, 'NOT_FOUND');
export const conflict = (m, d) => new AppError(m, 409, 'CONFLICT', d);