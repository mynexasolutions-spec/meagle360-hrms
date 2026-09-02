import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PlatformAuthProvider, usePlatformAuth } from './context/PlatformAuthContext';
import DashboardLayout from './layouts/DashboardLayout';
import AuthLayout from './layouts/AuthLayout';
import PlatformLayout from './layouts/PlatformLayout';
import LoadingScreen from './components/LoadingScreen';

// Lazy-loaded routes for code-splitting
const Login = lazy(() => import('./pages/Login'));
const SetPassword = lazy(() => import('./pages/SetPassword'));
const PlatformLogin = lazy(() => import('./pages/PlatformLogin'));
const PlatformDashboard = lazy(() => import('./pages/PlatformDashboard'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const EmployeeDirectory = lazy(() => import('./pages/EmployeeDirectory'));
const EmployeeProfile = lazy(() => import('./pages/EmployeeProfile'));
const Attendance = lazy(() => import('./pages/Attendance'));
const LeaveManagement = lazy(() => import('./pages/LeaveManagement'));
const ExpenseManagement = lazy(() => import('./pages/ExpenseManagement'));
const PayrollManagement = lazy(() => import('./pages/PayrollManagement'));
const MyPayslips = lazy(() => import('./pages/MyPayslips'));
const ShiftManagement = lazy(() => import('./pages/ShiftManagement'));
const OrgChart = lazy(() => import('./pages/OrgChart'));
const Settings = lazy(() => import('./pages/Settings'));
const Documents = lazy(() => import('./pages/Documents'));
const ReportsAnalytics = lazy(() => import('./pages/ReportsAnalytics'));
const MyProfile = lazy(() => import('./pages/MyProfile'));
const ActionTracker = lazy(() => import('./pages/ActionTracker'));
const OfferLetterStudio = lazy(() => import('./pages/OfferLetterStudio'));
const RelievingLetterStudio = lazy(() => import('./pages/RelievingLetterStudio'));
const Subscriptions = lazy(() => import('./pages/Subscriptions'));

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
    <Suspense fallback={<LoadingScreen subtitle="Loading workspace..." />}>
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
          <Route
            path="/employees"
            element={
              <RequirePermission permission="settings:write">
                <EmployeeDirectory />
              </RequirePermission>
            }
          />
          <Route path="/employees/:id" element={<EmployeeProfile />} />
          <Route path="/offer-letter" element={<OfferLetterStudio />} />
          <Route path="/relieving-letter" element={<RelievingLetterStudio />} />
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
          <Route path="/org-chart" element={<Navigate to="/employees?tab=organization" replace />} />
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
          <Route
            path="/subscriptions"
            element={
              <RequirePermission permission="settings:write">
                <Subscriptions />
              </RequirePermission>
            }
          />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
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
