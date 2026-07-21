import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getEmployee } from '../api/employees';
import { User, Mail, Briefcase, Calendar, Shield, MapPin, Building2, Phone, BadgeCheck } from 'lucide-react';

export default function MyProfile() {
  const { user } = useAuth();
  const [employee, setEmployee] = useState(null);

  useEffect(() => {
    if (user?.employee_id) {
      getEmployee(user.employee_id).then((r) => setEmployee(r.data)).catch(() => {});
    }
  }, [user?.employee_id]);

  const initials = user?.full_name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase() || 'U';

  const fields = [
    { icon: Mail, label: 'Work Email Address', value: user?.email, color: '#2563eb', bg: '#eff6ff' },
    { icon: Briefcase, label: 'Employee Code', value: employee?.employee_code, color: '#059669', bg: '#ecfdf5' },
    { icon: Shield, label: 'Assigned Role', value: user?.role_name || 'Employee', color: '#7c3aed', bg: '#f5f3ff' },
    { icon: Building2, label: 'Department', value: employee?.department_name || 'General Management', color: '#d97706', bg: '#fffbeb' },
    { icon: MapPin, label: 'Office Location / Site', value: employee?.site_name || 'Main Corporate HQ', color: '#dc2626', bg: '#fee2e2' },
    { icon: Calendar, label: 'Date of Hire', value: employee?.date_of_hire, color: '#0284c7', bg: '#e0f2fe' },
  ];

  return (
    <div className="animate-fade-in" style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 48, height: 48, borderRadius: 16, flexShrink: 0,
              background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.13)',
            }}
          >
            <User size={22} style={{ color: '#2563eb' }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 'clamp(1.25rem, 4.5vw, 1.75rem)', fontWeight: 800, color: '#0f172a' }}>My Profile</h1>
            <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Personal profile credentials, organization role &amp; employment details</p>
          </div>
        </div>
      </div>

      {/* Profile Hero */}
      <div className="profile-hero profile-hero--avatar-lg">
        <div className="profile-hero-cover" style={{ height: 120, background: 'linear-gradient(135deg, #0f172a, #1e293b, #2563eb)' }} />
        <div className="profile-hero-body">
          {employee?.photo_url ? (
            <img
              className="profile-hero-avatar"
              src={employee.photo_url}
              alt={user?.full_name}
              style={{
                width: 96, height: 96, borderRadius: 24, objectFit: 'cover',
                border: '4px solid #ffffff', boxShadow: '0 6px 16px rgba(0,0,0,0.12)', flexShrink: 0,
              }}
            />
          ) : (
            <div
              className="profile-hero-avatar"
              style={{
                width: 96, height: 96, borderRadius: 24, flexShrink: 0,
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: '#ffffff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: '2rem',
                border: '4px solid #ffffff', boxShadow: '0 6px 16px rgba(0,0,0,0.12)',
              }}
            >
              {initials}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: 'clamp(1.15rem, 4vw, 1.5rem)', fontWeight: 800, color: '#0f172a' }}>{user?.full_name}</h2>
              <BadgeCheck size={20} style={{ color: '#2563eb', flexShrink: 0 }} />
            </div>
            <div style={{ fontSize: '0.875rem', color: '#64748b', marginTop: 2 }}>
              {user?.role_name || 'Employee'} · MEAGLE360 HRMS
            </div>
          </div>
          <span
            style={{
              padding: '6px 16px',
              borderRadius: 12,
              fontWeight: 700,
              fontSize: '0.8125rem',
              background: '#dcfce7',
              color: '#15803d',
              whiteSpace: 'nowrap',
            }}
          >
            Active Employee
          </span>
        </div>
      </div>

      {/* Profile Details */}
      <div className="section-card" style={{ borderTop: '3px solid #2563eb' }}>
        <h3><User size={17} style={{ color: 'var(--accent-blue)' }} /> Profile Details</h3>
        <div className="profile-fields-grid">
          {fields.map((f) => (
            <div
              key={f.label}
              className="profile-field-card"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '14px 18px',
                borderRadius: 16,
                background: '#f8fafc',
                border: '1px solid #f1f5f9',
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  background: f.bg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <f.icon size={18} style={{ color: f.color }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{f.label}</div>
                <div style={{ fontSize: '0.925rem', fontWeight: 700, color: '#0f172a', marginTop: 2 }}>{f.value || '—'}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
