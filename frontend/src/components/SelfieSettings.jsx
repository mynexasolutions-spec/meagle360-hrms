import { useEffect, useState, useCallback } from 'react';
import { Camera, Check, X, ShieldAlert, UserCheck, AlertTriangle } from 'lucide-react';
import Modal from './Modal';
import { usePopup } from '../context/PopupContext';
import {
  getFaceConfig,
  updateFaceConfig,
  getFaceProfiles,
  reviewFaceProfile,
  getFlaggedFaceAttendance,
  reviewFlaggedFaceAttendance,
} from '../api/face';

const errMsg = (e, fallback) => e?.response?.data?.detail || fallback;
const fmtDate = (d) => (d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

export default function SelfieSettings() {
  const { showToast } = usePopup();
  const [cfg, setCfg] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [flagged, setFlagged] = useState([]);
  const [saving, setSaving] = useState(false);
  const [reviewModal, setReviewModal] = useState(null); // { type: 'profile'|'flagged', id, approve: bool, name, note }

  const load = useCallback(async () => {
    try {
      const { data } = await getFaceConfig();
      setCfg(data);
      if (data.enabled) {
        const [pRes, fRes] = await Promise.all([
          getFaceProfiles({ status: 'pending' }),
          getFlaggedFaceAttendance({ status: 'pending' }),
        ]);
        setProfiles(pRes.data);
        setFlagged(fRes.data);
      }
    } catch (e) {
      showToast({ message: errMsg(e, 'Failed to load selfie verification settings'), type: 'error' });
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  if (!cfg) return <div className="section-card">Loading...</div>;

  const toggleEnabled = async (enabled) => {
    setSaving(true);
    try {
      await updateFaceConfig({ enabled });
      showToast({
        message: enabled ? 'Selfie verification enabled' : 'Selfie verification disabled',
        type: 'success',
      });
      await load();
    } catch (e) {
      showToast({ message: errMsg(e, 'Failed to update setting'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    if (!reviewModal) return;
    setSaving(true);
    try {
      if (reviewModal.type === 'profile') {
        await reviewFaceProfile(reviewModal.id, {
          approve: reviewModal.approve,
          note: reviewModal.note || undefined,
        });
        showToast({
          message: reviewModal.approve ? 'Passport photo approved' : 'Passport photo rejected',
          type: 'success',
        });
      } else {
        await reviewFlaggedFaceAttendance(reviewModal.id, {
          approve: reviewModal.approve,
          note: reviewModal.note || undefined,
        });
        showToast({
          message: reviewModal.approve ? 'Flagged entry approved' : 'Flagged entry rejected',
          type: 'success',
        });
      }
      setReviewModal(null);
      await load();
    } catch (e) {
      showToast({ message: errMsg(e, 'Action failed'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="section-card" style={{ borderTop: '3px solid #0284c7' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
        <h3 style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Camera size={20} style={{ color: '#0284c7' }} /> Selfie Verification at Clock-In
        </h3>
        {cfg.enabled ? (
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => toggleEnabled(false)}
            disabled={saving}
          >
            Turn off
          </button>
        ) : (
          <button
            className="btn btn-primary btn-sm"
            onClick={() => toggleEnabled(true)}
            disabled={saving}
          >
            Enable
          </button>
        )}
      </div>

      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
        Requires employees to take a live selfie during clock-in and matches it with their approved passport photo.
        Live selfies are discarded immediately after verification (never stored) for privacy and zero storage overhead.
        Currently <b>{cfg.enabled ? 'ON' : 'OFF'}</b>.
      </p>

      {cfg.enabled && (
        <div style={{ display: 'grid', gap: 24, marginTop: 20 }}>
          {/* Section: Pending Passport Photos */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h4 style={{ margin: 0, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                <UserCheck size={18} style={{ color: '#0284c7' }} /> Pending Passport Photos ({profiles.length})
              </h4>
            </div>
            {profiles.length === 0 ? (
              <div style={{ padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                No passport photos waiting for review.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                {profiles.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      border: '1px solid var(--border-color)',
                      borderRadius: 8,
                      padding: 14,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      background: 'var(--bg-primary)',
                    }}
                  >
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <img
                        src={p.photo_url}
                        alt={p.employee_name}
                        style={{
                          width: 64,
                          height: 64,
                          borderRadius: 8,
                          objectFit: 'cover',
                          border: '1px solid var(--border-color)',
                        }}
                      />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{p.employee_name || 'Employee'}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          Submitted: {fmtDate(p.created_at)}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                      <button
                        className="btn btn-primary btn-sm"
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                        onClick={() =>
                          setReviewModal({
                            type: 'profile',
                            id: p.id,
                            approve: true,
                            name: p.employee_name,
                            note: '',
                          })
                        }
                      >
                        <Check size={14} /> Approve
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, color: '#dc2626' }}
                        onClick={() =>
                          setReviewModal({
                            type: 'profile',
                            id: p.id,
                            approve: false,
                            name: p.employee_name,
                            note: '',
                          })
                        }
                      >
                        <X size={14} /> Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section: Flagged Attendance Records */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h4 style={{ margin: 0, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShieldAlert size={18} style={{ color: '#f59e0b' }} /> Flagged Clock-Ins Pending Review ({flagged.length})
              </h4>
            </div>
            {flagged.length === 0 ? (
              <div style={{ padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                No flagged clock-in records pending review.
              </div>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 8 }}>
                <table className="table" style={{ width: '100%', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Clock-In Time</th>
                      <th>Flag Reason</th>
                      <th>Match Score</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flagged.map((r) => (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 600 }}>{r.employee_name || 'Employee'}</td>
                        <td>{fmtDate(r.clock_in)}</td>
                        <td>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 600,
                              background: '#fef3c7',
                              color: '#b45309',
                              textTransform: 'capitalize',
                            }}
                          >
                            {r.reason ? r.reason.replace('_', ' ') : 'Flagged'}
                          </span>
                        </td>
                        <td>{r.face_score !== null && r.face_score !== undefined ? `${(r.face_score * 100).toFixed(1)}%` : '—'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              className="btn btn-primary btn-sm"
                              style={{ padding: '2px 8px', fontSize: 12 }}
                              onClick={() =>
                                setReviewModal({
                                  type: 'flagged',
                                  id: r.id,
                                  approve: true,
                                  name: r.employee_name,
                                  note: '',
                                })
                              }
                            >
                              Approve
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '2px 8px', fontSize: 12, color: '#dc2626' }}
                              onClick={() =>
                                setReviewModal({
                                  type: 'flagged',
                                  id: r.id,
                                  approve: false,
                                  name: r.employee_name,
                                  note: '',
                                })
                              }
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Review Modal for note & confirmation */}
      {reviewModal && (
        <Modal
          isOpen={true}
          onClose={() => setReviewModal(null)}
          title={`${reviewModal.approve ? 'Approve' : 'Reject'} ${
            reviewModal.type === 'profile' ? 'Passport Photo' : 'Flagged Clock-In'
          }`}
        >
          <form onSubmit={handleReviewSubmit} style={{ display: 'grid', gap: 14 }}>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>
              Are you sure you want to <b>{reviewModal.approve ? 'approve' : 'reject'}</b> the{' '}
              {reviewModal.type === 'profile' ? 'passport photo' : 'clock-in entry'} for{' '}
              <b>{reviewModal.name || 'this employee'}</b>?
            </p>
            {!reviewModal.approve && (
              <div className="input-group">
                <label className="input-label">Reason / Feedback Note (Optional)</label>
                <textarea
                  className="input-field"
                  rows={3}
                  placeholder="e.g., Photo too blurry / Selfie mismatch confirmed..."
                  value={reviewModal.note}
                  onChange={(e) => setReviewModal({ ...reviewModal, note: e.target.value })}
                />
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setReviewModal(null)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`btn ${reviewModal.approve ? 'btn-primary' : 'btn-danger'}`}
                disabled={saving}
              >
                {saving ? 'Processing...' : reviewModal.approve ? 'Confirm Approval' : 'Confirm Rejection'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
