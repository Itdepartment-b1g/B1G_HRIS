import { Navigate, useLocation } from 'react-router-dom';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { UserRole } from '@/lib/edgeFunctions';

interface RequireRoleProps {
  roles: UserRole[];
  children: React.ReactNode;
  /** Where to redirect if user lacks required role. Default: /dashboard */
  redirectTo?: string;
}

/**
 * Route guard: renders children only if the current user has one of the required roles.
 * Redirects to / (login) if not authenticated, or to redirectTo if authenticated but missing role.
 */
export function RequireRole({ roles, children, redirectTo = '/dashboard' }: RequireRoleProps) {
  const { user, loading } = useCurrentUser();
  const location = useLocation();

  if (loading) return null;
  if (!user) return <Navigate to="/" state={{ from: location }} replace />;

  const hasRole = user.roles?.some((r) => roles.includes(r)) ?? false;
  if (!hasRole) return <Navigate to={redirectTo} replace />;

  return <>{children}</>;
}
