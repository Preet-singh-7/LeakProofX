import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ROLES } from '../utils/constants';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true, roles: null },
  { to: '/tracking', label: 'Tracking', roles: null },
  { to: '/alerts', label: 'Alerts', roles: [ROLES.ADMIN, ROLES.BOARD, ROLES.AUDITOR, ROLES.CENTER] },
  { to: '/reports', label: 'Reports', roles: [ROLES.ADMIN, ROLES.BOARD, ROLES.AUDITOR] },
  { to: '/admin/papers', label: 'Paper Scheduling', roles: [ROLES.ADMIN, ROLES.BOARD] },
  { to: '/admin/users', label: 'User Management', roles: [ROLES.ADMIN] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  const visibleItems = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(user.role));

  return (
    <div className="flex min-h-screen bg-slate-100">
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <span className="text-lg font-bold text-slate-900">LeakProofX</span>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm font-medium ${
                  isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 px-5 py-4">
          <p className="truncate text-sm font-medium text-slate-900">{user.name}</p>
          <p className="text-xs text-slate-500">{user.role}</p>
          <button
            onClick={handleLogout}
            className="mt-3 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Log out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
}
