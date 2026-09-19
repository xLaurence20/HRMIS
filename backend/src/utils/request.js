/** Resolve the real client IP, honouring `trust proxy`. */
export const getClientIp = (req) =>
  (req.ip || req.socket?.remoteAddress || '0.0.0.0').replace('::ffff:', '').slice(0, 45);

export const getUserAgent = (req) =>
  (req.headers['user-agent'] ?? 'unknown').slice(0, 255);

export const ok = (res, data, status = 200, meta = undefined) =>
  res.status(status).json({ success: true, data, ...(meta ? { meta } : {}) });