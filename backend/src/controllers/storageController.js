import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import util from 'node:util';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/request.js';
import { AppError } from '../utils/AppError.js';

const execPromise = util.promisify(exec);
const SCAN_FOLDER = path.resolve(process.cwd(), 'uploads'); 

// 1. File System Stats (For the React page)
export const getStorageStats = asyncHandler(async (req, res) => {
  if (req.user.roleCode !== 'ADMIN') {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }

  if (!fs.existsSync(SCAN_FOLDER)) {
    fs.mkdirSync(SCAN_FOLDER, { recursive: true });
  }

  let total = 0;
  let free = 0;
  try {
    const stats = fs.statfsSync(SCAN_FOLDER);
    total = stats.blocks * stats.bsize;
    free = stats.bfree * stats.bsize;
  } catch (err) {
    total = 100 * 1024 * 1024 * 1024; // Fallback
    free = 60 * 1024 * 1024 * 1024;
  }
  const used = total - free;

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
  files.sort((a, b) => b.size - a.size);

  return ok(res, { total, free, used, app: appSize, files });
});

// 2. Live Terminal Stats (For Evidence 1 & 2)
export const getServerTerminalStats = asyncHandler(async (req, res) => {
  if (req.user.roleCode !== 'ADMIN') {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }

    try {
    const { stdout: dfOut } = await execPromise('df -h');
    const { stdout: dfiOut } = await execPromise('df -i');
    const { stdout: duOut } = await execPromise('du -sh * | sort -rh | head -n 5'); 
    
    // NEW: Prove this is Render!
    const { stdout: whoami } = await execPromise('whoami');
    const { stdout: envOut } = await execPromise('env | grep -i render | head -n 3');

    return ok(res, {
      df: dfOut,
      dfi: dfiOut,
      du: duOut,
      whoami: whoami.trim(),
      env: envOut.trim()
    });
  } catch (error) {
    throw new AppError('Failed to run server commands', 500, 'EXEC_ERROR', { error: error.message });
  }
});