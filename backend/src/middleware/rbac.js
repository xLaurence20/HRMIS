import { getPermissionsForRole } from '../services/permissionService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';

/**
 * checkPermission('a', 'b')  -> grants access if the user holds ANY of them.
 * checkPermission(['a','b']) -> same (array form is accepted).
 *
 * Always run `authenticate` before this middleware.
 */
export const checkPermission = (...required) => {
  const needed = required.flat().filter(Boolean);
  if (needed.length === 0) {
    throw new Error('checkPermission() requires at least one permission name');
  }

  return asyncHandler(async (req, _res, next) => {
    if (!req.user) throw new AppError('Authentication required', 401, 'NO_TOKEN');

    const perms = await getPermissionsForRole(req.user.roleId);
    const granted = needed.some((p) => perms.has(p));

    if (!granted) {
      throw new AppError(
        'You do not have permission to perform this action.',
        403,
        'FORBIDDEN',
        { required: needed }
      );
    }

    req.permissions = perms;
    next();
  });
};

/** Grants access only if the user holds EVERY listed permission. */
export const checkAllPermissions = (...required) => {
  const needed = required.flat().filter(Boolean);
  return asyncHandler(async (req, _res, next) => {
    if (!req.user) throw new AppError('Authentication required', 401, 'NO_TOKEN');

    const perms = await getPermissionsForRole(req.user.roleId);
    const missing = needed.filter((p) => !perms.has(p));

    if (missing.length) {
      throw new AppError(
        'You do not have permission to perform this action.',
        403,
        'FORBIDDEN',
        { missing }
      );
    }

    req.permissions = perms;
    next();
  });
};