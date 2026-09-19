import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import FullPageSpinner from './FullPageSpinner';

/**
 * <ProtectedRoute permission="roles.manage_permissions">
 *   <RoleManagement />
 * </ProtectedRoute>
 *
 * Props
 *  - permission           : string | string[]  (ANY match grants access)
 *  - requireAllPermissions: boolean             (ALL must match instead)
 *  - requireProfileComplete: boolean            (redirect to /profile/setup)
 */
export default function ProtectedRoute({
  children,
  permission = null,
  requireAllPermissions = false,
  requireProfileComplete = true,
}) {
  const { status, user, hasPermission } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageSpinner label="Restoring session…" />;

  if (status !== 'authenticated') {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requireProfileComplete && user && !user.profileCompleted) {
    return <Navigate to="/profile/setup" replace />;
  }

  if (permission && !hasPermission(permission, requireAllPermissions)) {
    return <Navigate to="/forbidden" replace />;
  }

  return children;
}