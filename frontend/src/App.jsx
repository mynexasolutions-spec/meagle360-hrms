import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PlatformAuthProvider, usePlatformAuth } from './context/PlatformAuthContext';
import DashboardLayout from './layouts/DashboardLayout';
import AuthLayout from './layouts/AuthLayout';
import PlatformLayout from './layouts/PlatformLayout';
import Login from './pages/Login';
import SetPassword from './pages/SetPassword';
import PlatformLogin from './pages/PlatformLogin';
import PlatformDashboard from './pages/PlatformDashboard';
import Dashboard from './pages/Dashboard';
import EmployeeDirectory from './pages/EmployeeDirectory';
import EmployeeProfile from './pages/EmployeeProfile';
import Attendance from './pages/Attendance';
import LeaveManagement from './pages/LeaveManagement';
import ExpenseManagement from './pages/ExpenseManagement';
import PayrollManagement from './pages/PayrollManagement';
import MyPayslips from './pages/MyPayslips';
import ShiftManagement from './pages/ShiftManagement';
import OrgChart from './pages/OrgChart';
import Settings from './pages/Settings';
import Documents from './pages/Documents';
import ReportsAnalytics from './pages/ReportsAnalytics';
import MyProfile from './pages/MyProfile';
import ActionTracker from './pages/ActionTracker';

import LoadingScreen from './components/LoadingScreen';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen subtitle="Verifying authentication..." />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen subtitle="Checking session..." />;
  if (user) return <Navigate to="/" replace />;
  return children;
}

function ProtectedPlatformRoute({ children }) {
  const { admin, loading } = usePlatformAuth();
  if (loading) return <LoadingScreen title="Nexa Platform Console" subtitle="Loading admin workspace..." />;
  if (!admin) return <Navigate to="/platform/login" replace />;
  return children;
}

function PublicPlatformRoute({ children }) {
  const { admin, loading } = usePlatformAuth();
  if (loading) return null;
  if (admin) return <Navigate to="/platform" replace />;
  return children;
}

// Gate a route behind one or more permission keys (any-of). Complements the
// sidebar's nav filtering with real route-level enforcement.
function RequirePermission({ permission, children }) {
  const { user } = useAuth();
  const perms = user?.permissions || {};
  const required = Array.isArray(permission) ? permission : [permission];
  const allowed = required.some((p) => perms[p]);
  if (!allowed) return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Tenant Auth Routes */}
      <Route element={<PublicRoute><AuthLayout /></PublicRoute>}>
        <Route path="/login" element={<Login />} />
      </Route>
      <Route element={<AuthLayout />}>
        <Route path="/set-password" element={<SetPassword />} />
      </Route>

      {/* Platform (Nexa Solutions) Routes */}
      <Route element={<PublicPlatformRoute><AuthLayout /></PublicPlatformRoute>}>
        <Route path="/platform/login" element={<PlatformLogin />} />
      </Route>
      <Route element={<ProtectedPlatformRoute><PlatformLayout /></ProtectedPlatformRoute>}>
        <Route path="/platform" element={<PlatformDashboard />} />
      </Route>

      {/* Dashboard Routes */}
      <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/employees" element={<EmployeeDirectory />} />
        <Route path="/employees/:id" element={<EmployeeProfile />} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/leave" element={<LeaveManagement />} />
        <Route
          path="/expenses"
          element={
            <RequirePermission permission="expenses:read">
              <ExpenseManagement />
            </RequirePermission>
          }
        />
        <Route
          path="/shifts"
          element={
            <RequirePermission permission="shifts:read">
              <ShiftManagement />
            </RequirePermission>
          }
        />
        <Route path="/org-chart" element={<OrgChart />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/profile" element={<MyProfile />} />
        <Route path="/my-payslips" element={<MyPayslips />} />
        <Route path="/action-tracker" element={<ActionTracker />} />
        <Route
          path="/payroll"
          element={
            <RequirePermission permission="payroll:read">
              <PayrollManagement />
            </RequirePermission>
          }
        />
        <Route
          path="/reports"
          element={
            <RequirePermission permission={['leave:approve', 'settings:write']}>
              <ReportsAnalytics />
            </RequirePermission>
          }
        />
        <Route
          path="/settings"
          element={
            <RequirePermission permission="settings:write">
              <Settings />
            </RequirePermission>
          }
        />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PlatformAuthProvider>
          <AppRoutes />
        </PlatformAuthProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
