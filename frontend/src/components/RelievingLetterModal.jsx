import { useState, useEffect } from 'react';
import Modal from './Modal';
import {
  getDirectory,
  createRelievingLetter,
  downloadRelievingLetterPdf,
} from '../api/employees';
import { Award, Download, Calendar, User, FileText } from 'lucide-react';

export default function RelievingLetterModal({ employee, onClose, onSuccess }) {
  const [employees, setEmployees] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(employee?.id || '');
  const [lastWorkingDate, setLastWorkingDate] = useState(new Date().toISOString().split('T')[0]);
  const [customParagraph, setCustomParagraph] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!employee) {
      getDirectory().then((res) => setEmployees(res.data || [])).catch(() => {});
    }
  }, [employee]);

  const selectedEmp = employee || employees.find((e) => e.id === selectedEmployeeId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedEmployeeId) {
      setError('Please select an employee');
      return;
    }
    if (!lastWorkingDate) {
      setError('Please enter the last working date');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const payload = {
        employee_id: selectedEmployeeId,
        last_working_date: lastWorkingDate,
        custom_paragraph: customParagraph?.trim() || null,
      };

      const res = await createRelievingLetter(payload);
      const relievingId = res.data?.id;

      if (relievingId) {
        // Download generated PDF directly
        const pdfRes = await downloadRelievingLetterPdf(relievingId);
        const blob = new Blob([pdfRes.data], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const name = (selectedEmp?.full_name || 'Employee').replace(/[^a-zA-Z0-9_-]/g, '_');
        a.download = `Relieving_Letter_${name}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }

      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error('Failed to create relieving letter:', err);
      setError(err.response?.data?.detail || 'Failed to generate relieving letter.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Generate Official Relieving Letter" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              background: '#fef2f2',
              color: '#dc2626',
              fontSize: '0.85rem',
              border: '1px solid #fecaca',
            }}
          >
            {error}
          </div>
        )}

        {/* Employee Selection */}
        <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.9rem', color: '#0f172a', marginBottom: 12 }}>
            <User size={16} style={{ color: '#2563eb' }} />
            Employee Details
          </div>

          {employee ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 12px', background: '#ffffff', borderRadius: 8, border: '1px solid #cbd5e1' }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: '#eff6ff',
                  color: '#2563eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '1rem',
                }}
              >
                {employee.full_name?.charAt(0) || 'E'}
              </div>
              <div>
                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.95rem' }}>{employee.full_name}</div>
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  {employee.employee_code} • {employee.designation_name || employee.department_name || 'Team Member'}
                </div>
              </div>
            </div>
          ) : (
            <div className="input-group">
              <label className="input-label">Select Employee *</label>
              <select
                className="input-field"
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                required
              >
                <option value="">Choose Employee</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.full_name} ({emp.employee_code}) - {emp.department_name || 'General'}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Dates & Custom Paragraph */}
        <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.9rem', color: '#0f172a', marginBottom: 12 }}>
            <Calendar size={16} style={{ color: '#2563eb' }} />
            Relieving Formalities
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            <div className="input-group">
              <label className="input-label">Last Working Date *</label>
              <input
                type="date"
                className="input-field"
                value={lastWorkingDate}
                onChange={(e) => setLastWorkingDate(e.target.value)}
                required
              />
            </div>

            <div className="input-group">
              <label className="input-label">Custom Paragraph / Appreciation Note (Optional)</label>
              <textarea
                className="input-field"
                rows={3}
                placeholder="e.g. During their tenure, they demonstrated exceptional dedication, leadership, and exemplary professionalism. We wish them the very best in all future endeavors."
                value={customParagraph}
                onChange={(e) => setCustomParagraph(e.target.value)}
              />
              <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 4 }}>
                This custom text will be included in the official letterhead body before the signatory block.
              </p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{
              background: 'linear-gradient(135deg, #0056d6, #0041a3)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 4px 12px rgba(0, 86, 214, 0.25)',
            }}
          >
            <Download size={16} />
            {loading ? 'Generating Letter...' : 'Generate & Download PDF'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
