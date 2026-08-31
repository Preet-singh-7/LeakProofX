import { useAuth } from '../context/AuthContext';

/** Renders children only if the current user's role is in `roles`. Used for
 * in-page conditional UI (e.g. hiding an Acknowledge button), as distinct
 * from ProtectedRoute which gates entire pages/routes. */
export function RoleGate({ roles, children }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) return null;
  return children;
}
