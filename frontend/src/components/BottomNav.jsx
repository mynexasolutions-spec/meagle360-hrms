import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, Clock, CalendarDays, Wallet, UserCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function BottomNav() {
  const { user, isPlanExpired } = useAuth();
  const perms = user?.permissions || {};
  const isAdmin = user?.role_name === 'Admin' || !!perms['settings:write'];

  const navItems = isPlanExpired
    ? [
        { path: '/subscriptions', label: 'Subscription', icon: Wallet },
        { path: '/profile', label: 'Profile', icon: UserCircle },
      ]
    : [
        { path: '/', label: 'Home', icon: LayoutDashboard },
        { path: '/attendance', label: 'Attendance', icon: Clock },
        { path: '/leave', label: 'Leave', icon: CalendarDays },
        isAdmin
          ? { path: '/employees', label: 'Directory', icon: Users }
          : { path: '/my-payslips', label: 'Payslips', icon: Wallet },
        { path: '/profile', label: 'Profile', icon: UserCircle },
      ];

  return (
    <nav className="mobile-bottom-nav">
      {navItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === '/'}
          className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}
        >
          <div className="bottom-nav-icon-wrap">
            <item.icon size={20} />
          </div>
          <span className="bottom-nav-label">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
