import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getEmployee } from '../api/employees';
import { User, Mail, Briefcase, Calendar, Shield } from 'lucide-react';

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
    { icon: Mail, label: 'Email', value: user?.email },
    { icon: Briefcase, label: 'Employee Code', value: employee?.employee_code },
    { icon: Calendar, label: 'Date of Hire', value: employee?.date_of_hire },
    { icon: Shield, label: 'Role', value: user?.role_name },
  ];

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1>My Profile</h1>
          <p>Your personal and employment details.</p>
        </div>
      </div>

      <div className="section-card" style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <div className="avatar" style={{ width: 64, height: 64, fontSize: '1.5rem', background: 'var(--gradient-primary)' }}>
            {initials}
          </div>
          <div>
            <div style={{ fontSize: '1.125rem', fontWeight: 700 }}>{user?.full_name}</div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{employee?.employment_status || 'active'}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          {fields.map((f) => (
            <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 12, borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'var(--accent-blue-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <f.icon size={16} style={{ color: 'var(--accent-blue)' }} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{f.label}</div>
                <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{f.value || '—'}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
