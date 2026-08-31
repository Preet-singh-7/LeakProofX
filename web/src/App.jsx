import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import Layout from './components/Layout';

import LoginPage from './pages/LoginPage';
import ForbiddenPage from './pages/ForbiddenPage';
import NotFoundPage from './pages/NotFoundPage';
import DashboardHome from './pages/DashboardHome';
import TrackingPage from './pages/TrackingPage';
import TrackingDetailPage from './pages/TrackingDetailPage';
import AlertsPage from './pages/AlertsPage';
import AlertDetailPage from './pages/AlertDetailPage';
import ReportsPage from './pages/ReportsPage';
import AdminUsersPage from './pages/AdminUsersPage';
import AdminPapersPage from './pages/AdminPapersPage';
import { ROLES } from './utils/constants';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forbidden" element={<ForbiddenPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route index element={<DashboardHome />} />
              <Route path="tracking" element={<TrackingPage />} />
              <Route path="tracking/:id" element={<TrackingDetailPage />} />

              <Route element={<ProtectedRoute allowedRoles={[ROLES.ADMIN, ROLES.BOARD, ROLES.AUDITOR, ROLES.CENTER]} />}>
                <Route path="alerts" element={<AlertsPage />} />
                <Route path="alerts/:id" element={<AlertDetailPage />} />
              </Route>

              <Route element={<ProtectedRoute allowedRoles={[ROLES.ADMIN, ROLES.BOARD, ROLES.AUDITOR]} />}>
                <Route path="reports" element={<ReportsPage />} />
              </Route>

              <Route element={<ProtectedRoute allowedRoles={[ROLES.ADMIN, ROLES.BOARD]} />}>
                <Route path="admin/papers" element={<AdminPapersPage />} />
              </Route>

              <Route element={<ProtectedRoute allowedRoles={[ROLES.ADMIN]} />}>
                <Route path="admin/users" element={<AdminUsersPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
