import multer from 'multer';

/**
 * In-memory CSV upload. Limit 5 MB — larger files should be split by the user.
 * The buffer is available on `req.file.buffer`.
 */
export const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const okMime = [
      'text/csv',
      'text/plain',
      'application/csv',
      'application/vnd.ms-excel',
    ].includes(file.mimetype);
    const okExt = file.originalname.toLowerCase().endsWith('.csv');

    if (okMime || okExt) cb(null, true);
    else cb(new Error('Only CSV files are allowed.'));
  },
});