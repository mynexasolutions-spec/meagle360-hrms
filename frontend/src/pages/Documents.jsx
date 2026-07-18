import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getEmployeeDocuments, addEmployeeDocument } from '../api/employees';
import { FileText, Plus, ExternalLink } from 'lucide-react';
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
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1>My Documents</h1>
          <p>Employment documents linked to your profile.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <Plus size={16} /> Upload Document
        </button>
      </div>

      <div className="section-card">
        {documents.length === 0 ? (
          <div className="empty-state">
            <FileText />
            <p>No documents uploaded yet</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>File</th>
                <th>E-Signed</th>
                <th>Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((d) => (
                <tr key={d.id}>
                  <td style={{ fontWeight: 500 }}>{d.doc_type}</td>
                  <td>
                    <a href={d.file_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      View <ExternalLink size={13} />
                    </a>
                  </td>
                  <td><span className={`badge ${d.e_signed ? 'badge-active' : 'badge-pending'}`}>{d.e_signed ? 'Signed' : 'Pending'}</span></td>
                  <td>{new Date(d.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && (
        <Modal title="Upload Document" onClose={() => setShowAdd(false)}>
          <form onSubmit={handleAdd}>
            <div className="input-group">
              <label className="input-label">Document Type</label>
              <input
                className="input-field"
                placeholder="e.g. Offer Letter, PAN Card"
                value={form.doc_type}
                onChange={(e) => setForm({ ...form, doc_type: e.target.value })}
                required
              />
            </div>
            <div className="input-group">
              <label className="input-label">File URL</label>
              <input
                className="input-field"
                placeholder="https://..."
                value={form.file_url}
                onChange={(e) => setForm({ ...form, file_url: e.target.value })}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
              Upload
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
