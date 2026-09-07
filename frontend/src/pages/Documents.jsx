import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getEmployeeDocuments, addEmployeeDocument } from '../api/employees';
import { FileText, Plus, ExternalLink, ShieldCheck, Download, Clock } from 'lucide-react';
import Modal from '../components/Modal';

export default function Documents() {
  const { user } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ doc_type: '', file_url: '' });

  useEffect(() => {
    if (user?.employee_id) loadDocuments();
  }, [user?.employee_id]);

  const loadDocuments = () => {
    getEmployeeDocuments(user.employee_id)
      .then((r) => setDocuments(r.data))
      .catch(() => setDocuments([]));
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      await addEmployeeDocument(user.employee_id, form);
      setShowAdd(false);
      setForm({ doc_type: '', file_url: '' });
      loadDocuments();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to add document');
    }
  };

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
            <FileText size={22} style={{ color: '#2563eb' }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 'clamp(1.25rem, 4.5vw, 1.75rem)', fontWeight: 800, color: '#0f172a' }}>My Documents</h1>
            <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Secure repository of your employment records, ID proofs &amp; contracts</p>
          </div>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowAdd(true)}
          style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}
        >
          <Plus size={18} /> Upload Document
        </button>
      </div>

      {/* Executive Documents Table */}
      <div className="section-card" style={{ borderTop: '3px solid #2563eb', padding: documents.length === 0 ? '40px 20px' : 0, overflow: 'hidden' }}>
        {documents.length === 0 ? (
          <div
            className="empty-state"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              padding: '30px 20px',
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: 16,
                background: '#f1f5f9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#64748b',
                marginBottom: 14,
              }}
            >
              <FileText size={30} />
            </div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontWeight: 700, textAlign: 'center' }}>
              No Documents Uploaded
            </h3>
            <p style={{ margin: '6px 0 0 0', fontSize: '0.875rem', color: '#64748b', textAlign: 'center', maxWidth: 420 }}>
              Uploaded employee contracts and ID documents will appear here.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ whiteSpace: 'nowrap' }}>Document Type</th>
                  <th style={{ whiteSpace: 'nowrap' }}>E-Signed Status</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Date Uploaded</th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((d) => (
                  <tr key={d.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            background: '#eff6ff',
                            color: '#2563eb',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <FileText size={18} />
                        </div>
                        <span style={{ fontWeight: 700, fontSize: '0.925rem', color: '#0f172a' }}>{d.doc_type}</span>
                      </div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span
                        style={{
                          padding: '4px 12px',
                          borderRadius: 10,
                          fontWeight: 700,
                          fontSize: '0.78125rem',
                          background: d.e_signed ? '#dcfce7' : '#fef3c7',
                          color: d.e_signed ? '#15803d' : '#b45309',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        {d.e_signed ? <ShieldCheck size={13} /> : <Clock size={13} />}
                        {d.e_signed ? 'Signed' : 'Pending'}
                      </span>
                    </td>
                    <td style={{ color: '#64748b', fontSize: '0.875rem', whiteSpace: 'nowrap' }}>
                      {new Date(d.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <a
                        href={d.file_url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '6px 14px',
                          borderRadius: 8,
                          border: '1px solid #cbd5e1',
                          background: '#ffffff',
                          color: '#2563eb',
                          fontWeight: 600,
                          fontSize: '0.8125rem',
                          textDecoration: 'none',
                        }}
                      >
                        View <ExternalLink size={13} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Upload Document Modal */}
      {showAdd && (
        <Modal title="Upload Employee Document" onClose={() => setShowAdd(false)}>
          <form onSubmit={handleAdd}>
            <div className="input-group">
              <label className="input-label">Document Type / Name</label>
              <input
                className="input-field"
                placeholder="e.g., Employment Offer Letter, Passport Copy, PAN Card"
                value={form.doc_type}
                onChange={(e) => setForm({ ...form, doc_type: e.target.value })}
                required
              />
            </div>
            <div className="input-group">
              <label className="input-label">File Link / Document URL</label>
              <input
                className="input-field"
                placeholder="https://drive.google.com/..."
                value={form.file_url}
                onChange={(e) => setForm({ ...form, file_url: e.target.value })}
                required
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save Document</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
