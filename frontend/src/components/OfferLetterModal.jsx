import { useState, useEffect } from 'react';
import Modal from './Modal';
import {
  getDepartments,
  getDesignations,
  getSites,
  getDirectory,
  createOfferLetter,
  downloadOfferLetterPdf,
} from '../api/employees';
import { useAuth } from '../context/AuthContext';
import { FileText, Download, User, Briefcase, Calendar, DollarSign, MapPin, Mail } from 'lucide-react';

const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'Full-Time' },
  { value: 'fixed_term', label: 'Fixed-Term Contract' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'intern', label: 'Internship' },
];

const SALARY_FREQUENCIES = [
  { value: 'annual', label: 'Annual (Per Annum)' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'hourly', label: 'Hourly' },
];

export default function OfferLetterModal({ onClose, onSuccess }) {
  const { user } = useAuth();
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [sites, setSites] = useState([]);
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    candidate_name: '',
    candidate_address: '',
    department_id: '',
    designation_id: '',
    reporting_to_id: '',
    site_id: '',
    employment_type: 'full_time',
    start_date: '',
    end_date: '',
    salary_amount: '',
    salary_frequency: 'annual',
    bonus_details: '',
    other_benefits: '',
    acceptance_deadline: '',
    hr_contact_name: user?.name || '',
    hr_contact_email: user?.email || '',
  });

  useEffect(() => {
    getDepartments().then((res) => setDepartments(res.data || [])).catch(() => {});
    getDesignations().then((res) => setDesignations(res.data || [])).catch(() => {});
    getSites().then((res) => setSites(res.data || [])).catch(() => {});
    getDirectory().then((res) => setManagers(res.data || [])).catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const payload = {
        candidate_name: form.candidate_name.trim(),
        candidate_address: form.candidate_address?.trim() || null,
        department_id: form.department_id || null,
        designation_id: form.designation_id || null,
        reporting_to_id: form.reporting_to_id || null,
        site_id: form.site_id || null,
        employment_type: form.employment_type || 'full_time',
        start_date: form.start_date,
        end_date: form.end_date || null,
        salary_amount: form.salary_amount ? parseFloat(form.salary_amount) : null,
        salary_frequency: form.salary_frequency || null,
        bonus_details: form.bonus_details?.trim() || null,
        other_benefits: form.other_benefits?.trim() || null,
        acceptance_deadline: form.acceptance_deadline || null,
        hr_contact_name: form.hr_contact_name?.trim() || null,
        hr_contact_email: form.hr_contact_email?.trim() || null,
      };

      const res = await createOfferLetter(payload);
      const offerId = res.data?.id;

      if (offerId) {
        // Download generated PDF directly
        const pdfRes = await downloadOfferLetterPdf(offerId);
        const blob = new Blob([pdfRes.data], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const sanitized = form.candidate_name.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
        a.download = `Offer_Letter_${sanitized}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }

      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error('Failed to create offer letter:', err);
      setError(err.response?.data?.detail || 'Failed to create offer letter. Please check input fields.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Generate Candidate Offer Letter" onClose={onClose}>
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

        {/* Candidate Information */}
        <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.9rem', color: '#0f172a', marginBottom: 12 }}>
            <User size={16} style={{ color: '#2563eb' }} />
            Candidate Details
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            <div className="input-group">
              <label className="input-label">Candidate Full Name *</label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. Alex Morgan"
                value={form.candidate_name}
                onChange={(e) => setForm({ ...form, candidate_name: e.target.value })}
                required
              />
            </div>
            <div className="input-group">
              <label className="input-label">Candidate Address</label>
              <textarea
                className="input-field"
                rows={2}
                placeholder="123 Street Name, City, State, PIN"
                value={form.candidate_address}
                onChange={(e) => setForm({ ...form, candidate_address: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* Position & Work Location */}
        <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.9rem', color: '#0f172a', marginBottom: 12 }}>
            <Briefcase size={16} style={{ color: '#2563eb' }} />
            Position & Location
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="input-group">
              <label className="input-label">Department</label>
              <select
                className="input-field"
                value={form.department_id}
                onChange={(e) => setForm({ ...form, department_id: e.target.value })}
              >
                <option value="">Select Department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Designation</label>
              <select
                className="input-field"
                value={form.designation_id}
                onChange={(e) => setForm({ ...form, designation_id: e.target.value })}
              >
                <option value="">Select Designation</option>
                {designations.map((des) => (
                  <option key={des.id} value={des.id}>{des.title}</option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Reporting Manager</label>
              <select
                className="input-field"
                value={form.reporting_to_id}
                onChange={(e) => setForm({ ...form, reporting_to_id: e.target.value })}
              >
                <option value="">Select Reporting Manager</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>{m.full_name} ({m.employee_code})</option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Work Location / Site</label>
              <select
                className="input-field"
                value={form.site_id}
                onChange={(e) => setForm({ ...form, site_id: e.target.value })}
              >
                <option value="">Select Work Location</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.city || 'Headquarters'})</option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Employment Type</label>
              <select
                className="input-field"
                value={form.employment_type}
                onChange={(e) => setForm({ ...form, employment_type: e.target.value })}
              >
                {EMPLOYMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Dates & Compensation */}
        <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.9rem', color: '#0f172a', marginBottom: 12 }}>
            <DollarSign size={16} style={{ color: '#2563eb' }} />
            Dates & Compensation
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="input-group">
              <label className="input-label">Joining / Start Date *</label>
              <input
                type="date"
                className="input-field"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                required
              />
            </div>
            <div className="input-group">
              <label className="input-label">End Date (Optional / Fixed-term)</label>
              <input
                type="date"
                className="input-field"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label className="input-label">Salary / CTC Amount (₹)</label>
              <input
                type="number"
                step="0.01"
                className="input-field"
                placeholder="e.g. 600000"
                value={form.salary_amount}
                onChange={(e) => setForm({ ...form, salary_amount: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label className="input-label">Salary Frequency</label>
              <select
                className="input-field"
                value={form.salary_frequency}
                onChange={(e) => setForm({ ...form, salary_frequency: e.target.value })}
              >
                {SALARY_FREQUENCIES.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Acceptance Deadline</label>
              <input
                type="date"
                className="input-field"
                value={form.acceptance_deadline}
                onChange={(e) => setForm({ ...form, acceptance_deadline: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label className="input-label">Bonus Details</label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. Annual Performance Bonus up to 10%"
                value={form.bonus_details}
                onChange={(e) => setForm({ ...form, bonus_details: e.target.value })}
              />
            </div>
            <div className="input-group" style={{ gridColumn: '1 / -1' }}>
              <label className="input-label">Other Benefits & Perks</label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. Health Insurance (₹5L), Internet Reimbursement, Gym Membership"
                value={form.other_benefits}
                onChange={(e) => setForm({ ...form, other_benefits: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* HR Contact */}
        <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.9rem', color: '#0f172a', marginBottom: 12 }}>
            <Mail size={16} style={{ color: '#2563eb' }} />
            HR Contact Person
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="input-group">
              <label className="input-label">HR Contact Name</label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. HR Team / John Doe"
                value={form.hr_contact_name}
                onChange={(e) => setForm({ ...form, hr_contact_name: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label className="input-label">HR Contact Email</label>
              <input
                type="email"
                className="input-field"
                placeholder="hr@meagle360.com"
                value={form.hr_contact_email}
                onChange={(e) => setForm({ ...form, hr_contact_email: e.target.value })}
              />
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
            {loading ? 'Generating Offer Letter...' : 'Generate & Download PDF'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
