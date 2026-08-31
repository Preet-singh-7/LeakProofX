import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/** Gate for any route that requires a logged-in user. Optionally also gates by role. */
export function ProtectedRoute({ allowedRoles }) {
  const { isAuthenticated, isBootstrapping, user } = useAuth();
  const location = useLocation();

  if (isBootstrapping) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-500">
        Loading…
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/forbidden" replace />;
  }

  return <Outlet />;
}
