import { exec } from 'node:child_process';
import util from 'node:util';
const execPromise = util.promisify(exec);

// Add this at the bottom of the file
export const getServerTerminalStats = asyncHandler(async (req, res) => {
  if (req.user.roleCode !== 'ADMIN') throw new AppError('Forbidden', 403);

  try {
    // Run Linux commands on the live Render server
    const { stdout: dfOut } = await execPromise('df -h');
    const { stdout: dfiOut } = await execPromise('df -i');
    // Find largest files in the backend directory
    const { stdout: duOut } = await execPromise('du -sh * | sort -rh | head -n 5'); 

    return ok(res, {
      df: dfOut,
      dfi: dfiOut,
      du: duOut,
    });
  } catch (error) {
    throw new AppError('Failed to run server commands', 500, 'EXEC_ERROR', { error: error.message });
  }
});