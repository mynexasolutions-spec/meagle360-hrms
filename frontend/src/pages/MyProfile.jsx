import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePopup } from '../context/PopupContext';
import { getEmployee } from '../api/employees';
import { getFaceConfig, deleteMyFaceProfile } from '../api/face';
import PassportUploadModal from '../components/PassportUploadModal';
import {
  User, Mail, Briefcase, Calendar, Shield, MapPin, Building2, Phone, BadgeCheck,
  Camera, CheckCircle2, AlertCircle, Trash2,
} from 'lucide-react';

export default function MyProfile() {
  const { user } = useAuth();
  const { showConfirm, showToast } = usePopup();
  const [employee, setEmployee] = useState(null);
  const [faceConfig, setFaceConfig] = useState(null);
  const [showPassportModal, setShowPassportModal] = useState(false);

  const loadFaceConfig = () => {
    getFaceConfig().then((r) => setFaceConfig(r.data)).catch(() => {});
  };

  useEffect(() => {
    if (user?.employee_id) {
      getEmployee(user.employee_id).then((r) => setEmployee(r.data)).catch(() => {});
    }
    loadFaceConfig();
  }, [user?.employee_id]);

  const handleDeactivateFace = async () => {
    const ok = await showConfirm({
      title: 'Disable Verification & Remove Photo?',
      message: 'Your registered reference photo will be permanently removed, and your attendance clock-in status will be marked as "Unverified". Are you sure you want to proceed?',
      type: 'warning',
      confirmText: 'Yes, Disable & Remove',
      cancelText: 'Cancel',
    });
    if (!ok) return;
    try {
      await deleteMyFaceProfile();
      showToast({ message: 'Selfie verification disabled and photo removed.', type: 'success' });
      loadFaceConfig();
    } catch (err) {
      showToast({ message: err.response?.data?.detail || 'Failed to remove photo.', type: 'error' });
    }
  };

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

      {/* Selfie Attendance Verification Card */}
      <div className="section-card" style={{ marginBottom: 24, borderTop: '3px solid #0284c7' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Camera size={20} style={{ color: '#0284c7' }} />
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>Selfie Attendance Verification</h3>
              <p style={{ margin: '2px 0 0', fontSize: '0.8125rem', color: '#64748b' }}>Your facial recognition status for daily clock-in</p>
            </div>
          </div>

          <div>
            {faceConfig?.my_profile?.status === 'approved' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 9999, background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', fontSize: '0.8125rem', fontWeight: 700 }}>
                <CheckCircle2 size={14} /> Verified Profile
              </span>
            )}
            {faceConfig?.my_profile?.status === 'pending' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 9999, background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', fontSize: '0.8125rem', fontWeight: 700 }}>
                <AlertCircle size={14} /> Under Review
              </span>
            )}
            {(!faceConfig?.my_profile || faceConfig?.my_profile?.status === 'rejected') && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 9999, background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', fontSize: '0.8125rem', fontWeight: 700 }}>
                <AlertCircle size={14} /> Unverified
              </span>
            )}
          </div>
        </div>

        <div style={{ background: '#f8fafc', borderRadius: 14, padding: '16px 20px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
          <div style={{ fontSize: '0.875rem', color: '#475569', maxWidth: 700 }}>
            {faceConfig?.my_profile?.status === 'approved' && (
              <span>Live selfie matching is active. Your reference photo has been verified. If you prefer not to use facial verification for daily clock-in, you can disable it and remove your photo below.</span>
            )}
            {faceConfig?.my_profile?.status === 'pending' && (
              <span>Your passport photo has been submitted for admin approval. You can clock in normally in the meantime (marked as <b>Unverified</b>).</span>
            )}
            {(!faceConfig?.my_profile || faceConfig?.my_profile?.status === 'rejected') && (
              <span>Selfie verification is inactive. Your clock-in attendance will be recorded as <b>Unverified</b>. To activate live selfie verification, please upload your passport photo.</span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {faceConfig?.my_profile && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ color: '#dc2626', borderColor: '#fca5a5', background: '#ffffff', display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, cursor: 'pointer' }}
                onClick={handleDeactivateFace}
              >
                <Trash2 size={14} /> Disable &amp; Remove Photo
              </button>
            )}
            {(!faceConfig?.my_profile || faceConfig?.my_profile?.status === 'rejected') && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, cursor: 'pointer' }}
                onClick={() => setShowPassportModal(true)}
              >
                <Camera size={14} /> Upload Passport Photo
              </button>
            )}
          </div>
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

      {showPassportModal && (
        <PassportUploadModal
          isOpen={showPassportModal}
          onClose={() => setShowPassportModal(false)}
          currentProfile={faceConfig?.my_profile}
          onUploaded={() => loadFaceConfig()}
        />
      )}
    </div>
  );
}
