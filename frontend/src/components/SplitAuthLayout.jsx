import { Outlet, useLocation } from 'react-router-dom';

import logoMark from '../assets/logo-mark.png';
import loginIllustration from '../assets/login-illustration.jpg';
import '../pages/Login.css';

/**
 * Shared split layout for Login, Forgot Password and Reset Password.
 * The left showcase panel stays mounted; only the right panel content
 * (the <Outlet />) changes between routes.
 */
export default function SplitAuthLayout() {
  const location = useLocation();
  return (
    <div className="login-split-page animate-fade-in">
      {/* Left Showcase Panel */}
      <section className="login-left-panel" aria-label="Meagle360 HRMS Overview">
        <div className="login-left-content">
          <div className="login-brand-row">
            <div className="login-brand-mark">
              <img src={logoMark} alt="Meagle360 Logo" />
            </div>
            <span className="login-brand-name">
              Meagle<span>360</span>
            </span>
          </div>

          <div>
            <span className="login-pill-badge">All-in-One HRMS</span>
          </div>

          <h1 className="login-hero-title">
            Manage Your People,
            <span className="login-hero-title-accent">All in One Place</span>
          </h1>

          <p className="login-hero-subtitle">
            Attendance, leaves, payroll, recruitment and more — everything you need to run a modern, efficient HR operation.
          </p>
        </div>

        <div className="login-illustration-wrap">
          <img
            src={loginIllustration}
            alt="Meagle360 HRMS Modules — Employee, Attendance, Leave, Payroll, Reports, Documents, Recruitment, and Shift Management"
            className="login-illustration-img"
          />
        </div>
      </section>

      {/* Right Panel — swaps per route */}
      <section className="login-right-panel">
        <div key={location.pathname} className="login-form-container login-form-fade">
          <Outlet />
        </div>
      </section>
    </div>
  );
}
