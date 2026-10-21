import fs from 'node:fs';
import path from 'node:path';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/request.js';
import { AppError } from '../utils/AppError.js';

// We will scan the 'src' folder or a dedicated 'uploads' folder.
// Make sure to create an 'uploads' folder in your backend root if you don't have one.
const SCAN_FOLDER = path.resolve(process.cwd(), 'uploads'); 

export const getStorageStats = asyncHandler(async (req, res) => {
  // R1: Ensure only admins can access this
  if (req.user.roleCode !== 'ADMIN') {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }

  // R6: Ensure the folder exists
  if (!fs.existsSync(SCAN_FOLDER)) {
    fs.mkdirSync(SCAN_FOLDER, { recursive: true });
  }

  // Get Disk Stats (Linux/VPS Equivalent of df)
  let total = 0;
  let free = 0;
  try {
    const stats = fs.statfsSync(SCAN_FOLDER);
    total = stats.blocks * stats.bsize;
    free = stats.bfree * stats.bsize;
  } catch (err) {
    // Fallback if statfs isn't supported (e.g. on some Windows setups)
    total = 100 * 1024 * 1024 * 1024; // Mock 100GB for visual
    free = 60 * 1024 * 1024 * 1024;   // Mock 60GB free
  }
  const used = total - free;

  // List Files
  const files = [];
  let appSize = 0;

  const scanDir = (dir) => {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        scanDir(fullPath);
      } else {
        const stat = fs.statSync(fullPath);
        appSize += stat.size;
        files.push({
          name: item.name,
          path: path.relative(SCAN_FOLDER, fullPath),
          size: stat.size,
          modified: stat.mtime.toISOString(),
        });
      }
    }
  };
  
  scanDir(SCAN_FOLDER);

  // Sort largest first
  files.sort((a, b) => b.size - a.size);

  return ok(res, {
    total,
    free,
    used,
    app: appSize,
    files,
  });
});