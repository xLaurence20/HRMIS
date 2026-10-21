import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import util from 'node:util';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/request.js';

const execPromise = util.promisify(exec);
const SCAN_FOLDER = path.resolve(process.cwd(), 'uploads');

export const getPublicStorageStats = asyncHandler(async (req, res) => {
  if (!fs.existsSync(SCAN_FOLDER)) {
    fs.mkdirSync(SCAN_FOLDER, { recursive: true });
  }

  let total = 0, free = 0;
  try {
    const stats = fs.statfsSync(SCAN_FOLDER);
    total = stats.blocks * stats.bsize;
    free = stats.bfree * stats.bsize;
  } catch (err) {
    total = 100 * 1024 * 1024 * 1024;
    free = 60 * 1024 * 1024 * 1024;
  }
  const used = total - free;

  const files = [];
  let appSize = 0;

  const scanDir = (dir) => {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) scanDir(fullPath);
      else {
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

export const getPublicServerTerminalStats = asyncHandler(async (req, res) => {
  try {
    const { stdout: dfOut } = await execPromise('df -h');
    const { stdout: dfiOut } = await execPromise('df -i');
    const { stdout: duBasic } = await execPromise('du -sh * | sort -rh');
    const { stdout: duTop15 } = await execPromise('du -ah . | sort -rh | head -n 15');
    
    return ok(res, { df: dfOut, dfi: dfiOut, duBasic, duTop15 });
  } catch (error) {
    return ok(res, { df: 'Error running command', dfi: '', duBasic: '', duTop15: '' });
  }
});