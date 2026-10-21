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
    
    // 1. Basic folder sizes (like the first line in your sample)
    const { stdout: duBasic } = await execPromise('du -sh * | sort -rh');
    
    // 2. Top 15 largest files/folders (like the middle of your sample)
    const { stdout: duTop15 } = await execPromise('du -ah . | sort -rh | head -n 15');
    
    // 3. Files over 10MB (like the bottom of your sample)
    const { stdout: findLarge } = await execPromise('find . -type f -size +10M -exec ls -lh {} +');

    return ok(res, {
      df: dfOut,
      dfi: dfiOut,
      duBasic: duBasic,
      duTop15: duTop15,
      findLarge: findLarge,
    });
  } catch (error) {
    throw new AppError('Failed to run server commands', 500, 'EXEC_ERROR', { error: error.message });
  }
});

// Generates dummy files for testing/evidence
export const seedDummyFiles = asyncHandler(async (req, res) => {
  if (req.user.roleCode !== 'ADMIN') throw new AppError('Forbidden', 403);

  const dirs = [
    'backups', 'videos', 'exports', 'images', 'documents'
  ];
  
  // Create folders
  dirs.forEach(d => {
    const p = path.join(SCAN_FOLDER, d);
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  });

  // Helper to create file of specific size (in MB)
  const createFile = (relativePath, sizeMB) => {
    const fullPath = path.join(SCAN_FOLDER, relativePath);
    const buffer = Buffer.alloc(sizeMB * 1024 * 1024, '0'); // Fill with zeros
    fs.writeFileSync(fullPath, buffer);
  };

  // Generate files matching the sample image (but smaller so we don't crash Render)
  createFile('backups/db_backup_2026-10-12.sql.gz', 10); // 10 MB
  createFile('backups/db_backup_2026-10-05.sql.gz', 8);  // 8 MB
  createFile('videos/orientation_walkthrough.mp4', 15);  // 15 MB
  createFile('exports/residents_export_2026-09.xlsx', 2); // 2 MB
  createFile('documents/annual_report_2025.pdf', 1);      // 1 MB
  createFile('images/event_banner_hires.png', 5);         // 5 MB
  createFile('documents/minutes_2026-09.docx', 0.5);      // 0.5 MB (approx 500KB)

  return ok(res, { message: 'Dummy files generated successfully' });
});