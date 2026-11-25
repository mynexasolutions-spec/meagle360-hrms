import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PlatformAuthProvider, usePlatformAuth } from './context/PlatformAuthContext';
import { PopupProvider } from './context/PopupContext';
import DashboardLayout from './layouts/DashboardLayout';
import AuthLayout from './layouts/AuthLayout';
import SplitAuthLayout from './components/SplitAuthLayout';
import PlatformLayout from './layouts/PlatformLayout';
import LoadingScreen from './components/LoadingScreen';
import { canViewEmployees } from './utils/access';

// Lazy-loaded routes for code-splitting
const Login = lazy(() => import('./pages/Login'));
const SetPassword = lazy(() => import('./pages/SetPassword'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const PlatformLogin = lazy(() => import('./pages/PlatformLogin'));
const PlatformDashboard = lazy(() => import('./pages/PlatformDashboard'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const EmployeeDirectory = lazy(() => import('./pages/EmployeeDirectory'));
const Policies = lazy(() => import('./pages/Policies'));
const Holidays = lazy(() => import('./pages/Holidays'));
const Announcements = lazy(() => import('./pages/Announcements'));
const MyTeam = lazy(() => import('./pages/MyTeam'));
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
const Helpdesk = lazy(() => import('./pages/Helpdesk'));
const EmployeeDocuments = lazy(() => import('./pages/EmployeeDocuments'));
const AiAssistant = lazy(() => import('./pages/AiAssistant'));
const PerformanceManagement = lazy(() => import('./pages/PerformanceManagement'));
const JobOpeningsPage = lazy(() => import('./pages/ats/JobOpeningsPage'));
const ApplicantsPage = lazy(() => import('./pages/ats/ApplicantsPage'));
const InterviewsPage = lazy(() => import('./pages/ats/InterviewsPage'));
const MyInterviewsPage = lazy(() => import('./pages/ats/MyInterviewsPage'));
const HiringTeamPage = lazy(() => import('./pages/ats/HiringTeamPage'));
const CareersPage = lazy(() => import('./pages/ats/CareersPage'));
const CareersBuilderPage = lazy(() => import('./pages/ats/CareersBuilderPage'));

function ProtectedRoute({ children }) {
  const { user, loading, isPlanExpired } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen subtitle="Verifying authentication..." />;
  if (!user) return <Navigate to="/login" replace />;
  if (isPlanExpired && location.pathname !== '/subscriptions') {
    return <Navigate to="/subscriptions" replace />;
  }
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
  const { user, loading } = useAuth();
  if (loading) return null;
  const isAdmin = user?.role_name === 'Admin' || user?.role?.name === 'Admin' || !!user?.permissions?.['settings:write'];
  if (isAdmin) return children;
  const perms = user?.permissions || {};
  const required = Array.isArray(permission) ? permission : [permission];
  const allowed = required.some((p) => perms[p]);
  if (!allowed) return <Navigate to="/" replace />;
  return children;
}

// The full directory is for HR, managers and other staff roles. A plain
// employee following an old link lands on My Team (or on their own profile).
function RequireDirectory({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (canViewEmployees(user)) return children;
  if (user?.employee_id && location.pathname === `/employees/${user.employee_id}`) {
    return <Navigate to="/profile" replace />;
  }
  const q = new URLSearchParams(location.search).get('q');
  return <Navigate to={q ? `/my-team?q=${encodeURIComponent(q)}` : '/my-team'} replace />;
}

function AppRoutes() {
  return (
    <Suspense fallback={<LoadingScreen subtitle="Loading workspace..." />}>
      <Routes>
        {/* Tenant Auth Routes */}
        <Route element={<PublicRoute><SplitAuthLayout /></PublicRoute>}>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
        </Route>
        <Route element={<SplitAuthLayout />}>
          <Route path="/reset-password" element={<ResetPassword />} />
        </Route>
        <Route element={<AuthLayout />}>
          <Route path="/set-password" element={<SetPassword />} />
        </Route>

        {/* Public Careers Page (No login required) */}
        <Route path="/careers" element={<CareersPage />} />
        <Route path="/careers/page" element={<CareersPage />} />

        {/* Platform (Nexa Solutions) Routes */}
        <Route element={<PublicPlatformRoute><AuthLayout /></PublicPlatformRoute>}>
          <Route path="/platform/login" element={<PlatformLogin />} />
        </Route>
        <Route element={<ProtectedPlatformRoute><PlatformLayout /></ProtectedPlatformRoute>}>
          <Route path="/platform" element={<PlatformDashboard />} />
        </Route>

        {/* Dashboard Routes */}
        <Route path="/" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
          <Route index element={<Dashboard />} />
          <Route
            path="employees"
            element={
              <RequireDirectory>
                <EmployeeDirectory />
              </RequireDirectory>
            }
          />
          <Route
            path="employees/:id"
            element={
              <RequireDirectory>
                <EmployeeProfile />
              </RequireDirectory>
            }
          />
          <Route path="offer-letter" element={<RequirePermission permission={['settings:write', 'ats:offer:create', 'employees:read', 'ats:application:read']}><OfferLetterStudio /></RequirePermission>} />
          <Route path="relieving-letter" element={<RequirePermission permission="settings:write"><RelievingLetterStudio /></RequirePermission>} />
          <Route path="policies" element={<Policies />} />
          <Route path="holidays" element={<Holidays />} />
          <Route path="announcements" element={<Announcements />} />
          <Route path="my-team" element={<MyTeam />} />
          <Route path="attendance" element={<Attendance />} />
          <Route path="leave" element={<LeaveManagement />} />
          <Route path="expenses" element={<ExpenseManagement />} />
          <Route
            path="shifts"
            element={
              <RequirePermission permission={['shifts:read', 'attendance:approve', 'settings:write']}>
                <ShiftManagement />
              </RequirePermission>
            }
          />
          <Route path="org-chart" element={<Navigate to="/employees?tab=organization" replace />} />
          <Route path="documents" element={<Documents />} />
          <Route
            path="employee-documents"
            element={
              <RequirePermission permission={['employees:write', 'settings:write']}>
                <EmployeeDocuments />
              </RequirePermission>
            }
          />
          <Route path="profile" element={<MyProfile />} />
          <Route path="my-payslips" element={<MyPayslips />} />
          <Route path="action-tracker" element={<ActionTracker />} />
          <Route
            path="payroll"
            element={
              <RequirePermission permission={['payroll:read', 'settings:write']}>
                <PayrollManagement />
              </RequirePermission>
            }
          />
          <Route
            path="reports"
            element={
              <RequirePermission permission={['leave:approve', 'attendance:approve', 'settings:write']}>
                <ReportsAnalytics />
              </RequirePermission>
            }
          />
          <Route
            path="settings"
            element={
              <RequirePermission permission="settings:write">
                <Settings />
              </RequirePermission>
            }
          />
          <Route path="subscriptions" element={<Subscriptions />} />
          <Route path="helpdesk" element={<Helpdesk />} />
          <Route path="performance" element={<PerformanceManagement />} />
          <Route path="ai-assistant" element={<AiAssistant />} />
          {/* ATS (Applicant Tracking System) Routes */}
          <Route
            path="ats/jobs"
            element={
              <RequirePermission permission="ats:job:manage">
                <JobOpeningsPage />
              </RequirePermission>
            }
          />
          <Route
            path="ats/applicants"
            element={
              <RequirePermission permission="ats:applicants:view">
                <ApplicantsPage />
              </RequirePermission>
            }
          />
          <Route
            path="ats/interviews"
            element={
              <RequirePermission permission={['ats:interview:assign', 'ats:feedback:view_all']}>
                <InterviewsPage />
              </RequirePermission>
            }
          />
          <Route
            path="ats/my-interviews"
            element={
              <RequirePermission permission="ats:interview:view_own">
                <MyInterviewsPage />
              </RequirePermission>
            }
          />
          <Route
            path="ats/hiring-team"
            element={
              <RequirePermission permission={['ats:settings:manage', 'settings:write']}>
                <HiringTeamPage />
              </RequirePermission>
            }
          />
        </Route>

        {/* Standalone Full-screen Careers Site Studio (No Sidebar / Distraction-free) */}
        <Route
          path="/ats/careers-builder"
          element={
            <ProtectedRoute>
              <RequirePermission permission="ats:job:manage">
                <CareersBuilderPage />
              </RequirePermission>
            </ProtectedRoute>
          }
        />

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
          <PopupProvider>
            <AppRoutes />
          </PopupProvider>
        </PlatformAuthProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
