import { useState, useEffect, Fragment } from 'react';
import {
  getSalaryComponents, createSalaryComponent, updateSalaryComponent, deleteSalaryComponent,
  getSalaryStructures, createSalaryStructure, updateSalaryStructure, deleteSalaryStructure,
  getAssignmentHistory, assignEmployee,
  getPayrollRuns, createPayrollRun, getRunPayslips, finalizeRun, deleteRun,
  addPayslipAdjustment,
  getPayrollPolicy, updatePayrollPolicy,
  getTaxSlabs, createTaxSlab, deleteTaxSlab,
  getPtSlabs, createPtSlab, deletePtSlab,
  getEmployeeLoans, createLoan, closeLoan,
} from '../api/payroll';
import { getDirectory } from '../api/employees';
import {
  Wallet, Plus, Pencil, Trash2, Play, Lock, Users, Receipt, Settings2, Landmark, HandCoins,
} from 'lucide-react';
import Modal from '../components/Modal';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const CALC_LABELS = {
  fixed: 'Fixed amount',
  percent_of_basic: '% of Basic',
  percent_of_gross: '% of Gross',
};

function money(n) {
  return Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PayrollManagement() {
  const [tab, setTab] = useState('components');

  const tabsList = [
    { key: 'components', label: 'Salary Components' },
    { key: 'structures', label: 'Salary Structures' },
    { key: 'assignments', label: 'Employee Assignments' },
    { key: 'runs', label: 'Payroll Runs' },
    { key: 'tax-slabs', label: 'Tax Slabs' },
    { key: 'pt-slabs', label: 'PT Slabs' },
    { key: 'loans', label: 'Loans' },
    { key: 'policy', label: 'Policy' },
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
            <Wallet size={22} style={{ color: '#2563eb' }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 'clamp(1.25rem, 4.5vw, 1.75rem)', fontWeight: 800, color: '#0f172a' }}>Payroll Management</h1>
            <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Configure salary structures, assign employee CTC, and run monthly payroll</p>
          </div>
        </div>
      </div>

      {/* Modern Pill Tabs */}
      <div className="pill-tabs" style={{ marginBottom: 24 }}>
        {tabsList.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            style={{
              padding: '9px 18px',
              borderRadius: 12,
              fontSize: '0.85rem',
              fontWeight: 700,
              border: tab === item.key ? 'none' : '1px solid #cbd5e1',
              background: tab === item.key ? '#0f172a' : '#ffffff',
              color: tab === item.key ? '#ffffff' : '#64748b',
              cursor: 'pointer',
              boxShadow: tab === item.key ? '0 4px 12px rgba(15, 23, 42, 0.15)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'components' && <ComponentsTab />}
      {tab === 'structures' && <StructuresTab />}
      {tab === 'assignments' && <AssignmentsTab />}
      {tab === 'runs' && <RunsTab />}
      {tab === 'tax-slabs' && <TaxSlabsTab />}
      {tab === 'pt-slabs' && <PtSlabsTab />}
      {tab === 'loans' && <LoansTab />}
      {tab === 'policy' && <PolicyTab />}
    </div>
  );
}

// ── Salary Components ──────────────────────────────────────
function ComponentsTab() {
  const [components, setComponents] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => { load(); }, []);
  const load = () => getSalaryComponents().then((r) => setComponents(r.data)).catch(() => {});

  const openCreate = () => { setEditing(null); setShowModal(true); };
  const openEdit = (c) => { setEditing(c); setShowModal(true); };

  const handleToggleActive = async (c) => {
    await updateSalaryComponent(c.id, { is_active: !c.is_active });
    load();
  };

  const handleDelete = async (c) => {
    if (!confirm(`Delete "${c.name}"? This cannot be undone.`)) return;
    try {
      await deleteSalaryComponent(c.id);
      load();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to delete — it may be in use by a salary structure');
    }
  };

  const earnings = components.filter((c) => c.component_type === 'earning');
  const deductions = components.filter((c) => c.component_type === 'deduction');

  const renderTable = (list, title) => (
    <div className="section-card" style={{ marginBottom: 20 }}>
      <h3 style={{ marginBottom: 16 }}>{title}</h3>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ whiteSpace: 'nowrap' }}>Name</th>
              <th style={{ whiteSpace: 'nowrap' }}>Calculation</th>
              <th style={{ whiteSpace: 'nowrap' }}>Value</th>
              <th style={{ whiteSpace: 'nowrap' }}>Rulebook</th>
              <th style={{ whiteSpace: 'nowrap' }}>Flags</th>
              <th style={{ whiteSpace: 'nowrap' }}>Status</th>
              <th style={{ whiteSpace: 'nowrap' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id}>
                <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{c.name}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{CALC_LABELS[c.calculation_type] || c.calculation_type}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{c.calculation_type === 'fixed' ? money(c.value) : `${c.value}%`}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{c.statutory_type ? <span className="badge badge-info">{c.statutory_type.toUpperCase()}</span> : '—'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {c.is_employer_contribution && <span className="badge badge-pending" style={{ marginRight: 4 }}>Employer Cost</span>}
                  {c.is_balancing_figure && <span className="badge badge-active">Balancing</span>}
                  {!c.is_employer_contribution && !c.is_balancing_figure && '—'}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <span className={`badge ${c.is_active ? 'badge-active' : 'badge-inactive'}`}>
                    {c.is_active ? 'Active' : 'Disabled'}
                  </span>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <div className="table-row-actions">
                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(c)}><Pencil size={13} /></button>
                    <button className="btn btn-secondary btn-sm" onClick={() => handleToggleActive(c)}>
                      {c.is_active ? 'Disable' : 'Enable'}
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(c)}><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.length === 0 && <div className="empty-state"><p>None configured</p></div>}
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Add Component</button>
      </div>
      {renderTable(earnings, 'Earnings')}
      {renderTable(deductions, 'Deductions')}

      {showModal && (
        <ComponentModal
          component={editing}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); load(); }}
        />
      )}
    </div>
  );
}

function ComponentModal({ component, onClose, onSuccess }) {
  const [form, setForm] = useState(component ? {
    name: component.name,
    component_type: component.component_type,
    calculation_type: component.calculation_type,
    value: component.value,
    is_statutory: component.is_statutory,
    is_taxable: component.is_taxable,
    display_order: component.display_order,
    is_employer_contribution: component.is_employer_contribution,
    is_balancing_figure: component.is_balancing_figure,
    statutory_type: component.statutory_type || '',
  } : {
    name: '', component_type: 'earning', calculation_type: 'fixed', value: 0,
    is_statutory: false, is_taxable: true, display_order: 0,
    is_employer_contribution: false, is_balancing_figure: false, statutory_type: '',
  });
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const payload = { ...form, statutory_type: form.statutory_type || null };
      if (component) {
        await updateSalaryComponent(component.id, payload);
      } else {
        await createSalaryComponent(payload);
      }
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save component');
    }
  };

  return (
    <Modal title={component ? 'Edit Salary Component' : 'Add Salary Component'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div style={{ marginBottom: 12, color: 'var(--accent-rose)', fontSize: '0.875rem' }}>{error}</div>}
        <div className="input-group">
          <label className="input-label">Name</label>
          <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div className="input-group">
          <label className="input-label">Type</label>
          <select className="input-field" value={form.component_type} onChange={(e) => setForm({ ...form, component_type: e.target.value })}>
            <option value="earning">Earning</option>
            <option value="deduction">Deduction</option>
          </select>
        </div>
        <div className="input-group">
          <label className="input-label">Calculation</label>
          <select className="input-field" value={form.calculation_type} onChange={(e) => setForm({ ...form, calculation_type: e.target.value })}>
            <option value="fixed">Fixed amount</option>
            <option value="percent_of_basic">% of Basic Pay</option>
            {form.component_type === 'deduction' && <option value="percent_of_gross">% of Gross Pay</option>}
          </select>
        </div>
        <div className="input-group">
          <label className="input-label">{form.calculation_type === 'fixed' ? 'Amount' : 'Percentage'}</label>
          <input type="number" step="0.01" className="input-field" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} required />
        </div>
        <div className="input-group">
          <label className="input-label">Display Order</label>
          <input type="number" className="input-field" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: e.target.value })} />
        </div>
        <div className="input-group">
          <label className="input-label">Statutory Rulebook</label>
          <select className="input-field" value={form.statutory_type} onChange={(e) => setForm({ ...form, statutory_type: e.target.value })}>
            <option value="">None — plain fixed/percent component</option>
            <option value="epf">EPF — gated by headcount threshold + admin override</option>
            <option value="esi">ESI — gated by headcount + wage ceiling + coverage cycle</option>
            <option value="pt">Professional Tax — looked up from PT Slabs by employee's state</option>
            <option value="tds">TDS — computed from Tax Slabs + employee's regime/declarations</option>
          </select>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
            When set, this component's amount is computed by the matching rulebook instead of its own Value above (except EPF/ESI, which still use Value as the % or fixed rate — just gated by eligibility).
          </p>
        </div>
        <div className="input-group" style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem' }}>
            <input type="checkbox" checked={form.is_statutory} onChange={(e) => setForm({ ...form, is_statutory: e.target.checked })} /> Statutory
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem' }}>
            <input type="checkbox" checked={form.is_taxable} onChange={(e) => setForm({ ...form, is_taxable: e.target.checked })} /> Taxable
          </label>
        </div>
        {form.component_type === 'earning' && (
          <div className="input-group" style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem' }}>
              <input type="checkbox" checked={form.is_employer_contribution} onChange={(e) => setForm({ ...form, is_employer_contribution: e.target.checked })} />
              Employer cost (not paid to employee, e.g. Employer PF)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem' }}>
              <input type="checkbox" checked={form.is_balancing_figure} onChange={(e) => setForm({ ...form, is_balancing_figure: e.target.checked })} />
              Balancing figure (absorbs remaining CTC, e.g. Special Allowance)
            </label>
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">Save</button>
        </div>
      </form>
    </Modal>
  );
}

// ── Salary Structures ───────────────────────────────────────
function StructuresTab() {
  const [structures, setStructures] = useState([]);
  const [components, setComponents] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => { load(); }, []);
  const load = () => {
    getSalaryStructures().then((r) => setStructures(r.data)).catch(() => {});
    getSalaryComponents().then((r) => setComponents(r.data)).catch(() => {});
  };

  const handleDelete = async (s) => {
    if (!confirm(`Delete structure "${s.name}"?`)) return;
    try {
      await deleteSalaryStructure(s.id);
      load();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to delete — employees may still be assigned to it');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true); }}>
          <Plus size={16} /> Add Structure
        </button>
      </div>

      <div style={{ display: 'grid', gap: 16 }}>
        {structures.map((s) => (
          <div key={s.id} className="section-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <h3 style={{ marginBottom: 4 }}>{s.name}</h3>
                {s.description && <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{s.description}</p>}
              </div>
              <div className="table-row-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(s); setShowModal(true); }}><Pencil size={13} /> Edit</button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(s)}><Trash2 size={13} /></button>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {s.components.map((c) => (
                <span key={c.id} className={`badge ${c.component_type === 'earning' ? 'badge-active' : 'badge-rejected'}`}>
                  {c.name}
                </span>
              ))}
              {s.components.length === 0 && <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>No components added yet</span>}
            </div>
          </div>
        ))}
        {structures.length === 0 && (
          <div className="section-card">
            <div className="empty-state"><Wallet size={48} /><p>No salary structures yet</p></div>
          </div>
        )}
      </div>

      {showModal && (
        <StructureModal
          structure={editing}
          components={components}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); load(); }}
        />
      )}
    </div>
  );
}

function StructureModal({ structure, components, onClose, onSuccess }) {
  const [name, setName] = useState(structure?.name || '');
  const [description, setDescription] = useState(structure?.description || '');
  const [selectedIds, setSelectedIds] = useState(structure ? structure.components.map((c) => c.id) : []);
  const [error, setError] = useState('');

  const toggle = (id) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const payload = { name, description: description || null, component_ids: selectedIds };
      if (structure) {
        await updateSalaryStructure(structure.id, payload);
      } else {
        await createSalaryStructure(payload);
      }
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save structure');
    }
  };

  const earnings = components.filter((c) => c.component_type === 'earning');
  const deductions = components.filter((c) => c.component_type === 'deduction');

  return (
    <Modal title={structure ? 'Edit Salary Structure' : 'Add Salary Structure'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div style={{ marginBottom: 12, color: 'var(--accent-rose)', fontSize: '0.875rem' }}>{error}</div>}
        <div className="input-group">
          <label className="input-label">Name</label>
          <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="input-group">
          <label className="input-label">Description</label>
          <input className="input-field" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="input-group">
          <label className="input-label">Earnings</label>
          <div style={{ display: 'grid', gap: 6, maxHeight: 140, overflowY: 'auto' }}>
            {earnings.map((c) => (
              <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8125rem' }}>
                <input type="checkbox" checked={selectedIds.includes(c.id)} onChange={() => toggle(c.id)} /> {c.name}
              </label>
            ))}
          </div>
        </div>
        <div className="input-group">
          <label className="input-label">Deductions</label>
          <div style={{ display: 'grid', gap: 6, maxHeight: 140, overflowY: 'auto' }}>
            {deductions.map((c) => (
              <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8125rem' }}>
                <input type="checkbox" checked={selectedIds.includes(c.id)} onChange={() => toggle(c.id)} /> {c.name}
              </label>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">Save</button>
        </div>
      </form>
    </Modal>
  );
}

// ── Employee Assignments ───────────────────────────────────
function AssignmentsTab() {
  const [employees, setEmployees] = useState([]);
  const [structures, setStructures] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [history, setHistory] = useState([]);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    getDirectory().then((r) => setEmployees(r.data)).catch(() => {});
    getSalaryStructures().then((r) => setStructures(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedEmployeeId) loadHistory();
  }, [selectedEmployeeId]);

  const loadHistory = () => getAssignmentHistory(selectedEmployeeId).then((r) => setHistory(r.data)).catch(() => setHistory([]));

  return (
    <div>
      <div className="section-card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 16 }}><Users size={18} style={{ color: 'var(--accent-violet)' }} /> Employee Salary Assignment</h3>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 240px' }}>
            <select className="input-field" value={selectedEmployeeId} onChange={(e) => setSelectedEmployeeId(e.target.value)}>
              <option value="">Select an employee...</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</option>
              ))}
            </select>
          </div>
          {selectedEmployeeId && (
            <button className="btn btn-primary" onClick={() => setShowModal(true)}>
              <Plus size={16} /> New Assignment
            </button>
          )}
        </div>
      </div>

      {selectedEmployeeId && (
        <div className="section-card">
          <h3 style={{ marginBottom: 16 }}>Assignment History</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th style={{ whiteSpace: 'nowrap' }}>Effective From</th><th style={{ whiteSpace: 'nowrap' }}>Salary Structure</th><th style={{ whiteSpace: 'nowrap' }}>Annual CTC</th><th style={{ whiteSpace: 'nowrap' }}>Basic Pay</th></tr></thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{h.effective_from}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{h.salary_structure_name || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{h.annual_ctc ? money(h.annual_ctc) : '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{money(h.basic_pay)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {history.length === 0 && <div className="empty-state"><p>No salary assignment yet</p></div>}
        </div>
      )}

      {showModal && (
        <AssignmentModal
          employeeId={selectedEmployeeId}
          structures={structures}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); loadHistory(); }}
        />
      )}
    </div>
  );
}

function AssignmentModal({ employeeId, structures, onClose, onSuccess }) {
  const [form, setForm] = useState({ salary_structure_id: '', annual_ctc: '', basic_pay: '', effective_from: '' });
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await assignEmployee({
        employee_id: employeeId,
        salary_structure_id: form.salary_structure_id || null,
        annual_ctc: form.annual_ctc ? Number(form.annual_ctc) : null,
        basic_pay: Number(form.basic_pay),
        effective_from: form.effective_from,
      });
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to assign salary');
    }
  };

  return (
    <Modal title="New Salary Assignment" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div style={{ marginBottom: 12, color: 'var(--accent-rose)', fontSize: '0.875rem' }}>{error}</div>}
        <div className="input-group">
          <label className="input-label">Salary Structure</label>
          <select className="input-field" value={form.salary_structure_id} onChange={(e) => setForm({ ...form, salary_structure_id: e.target.value })}>
            <option value="">No structure (Basic only)</option>
            {structures.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div className="input-group">
          <label className="input-label">Annual CTC (optional)</label>
          <input type="number" step="0.01" className="input-field" value={form.annual_ctc} onChange={(e) => setForm({ ...form, annual_ctc: e.target.value })} />
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
            When set, Basic Pay is validated against the company's minimum Basic-%-of-CTC floor, and any "balancing figure" component (e.g. Special Allowance) absorbs whatever's left of CTC after Basic, employer contributions, and other earnings.
          </p>
        </div>
        <div className="input-group">
          <label className="input-label">Basic Pay (monthly)</label>
          <input type="number" step="0.01" className="input-field" value={form.basic_pay} onChange={(e) => setForm({ ...form, basic_pay: e.target.value })} required />
        </div>
        <div className="input-group">
          <label className="input-label">Effective From</label>
          <input type="date" className="input-field" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} required />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">Save</button>
        </div>
      </form>
    </Modal>
  );
}

// ── Payroll Runs ─────────────────────────────────────────────
function RunsTab() {
  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [payslips, setPayslips] = useState([]);
  const [showRunModal, setShowRunModal] = useState(false);
  const [expandedPayslip, setExpandedPayslip] = useState(null);
  const [showAdjustModal, setShowAdjustModal] = useState(null);

  useEffect(() => { loadRuns(); }, []);
  const loadRuns = () => getPayrollRuns().then((r) => setRuns(r.data)).catch(() => {});

  const openRun = async (run) => {
    setSelectedRun(run);
    const res = await getRunPayslips(run.id);
    setPayslips(res.data);
  };

  const handleCreateRun = async (year, month) => {
    try {
      await createPayrollRun({ year, month });
      setShowRunModal(false);
      loadRuns();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to run payroll');
    }
  };

  const handleFinalize = async () => {
    if (!confirm(`Finalize payroll for ${MONTH_NAMES[selectedRun.month - 1]} ${selectedRun.year}? This locks every payslip and cannot be undone.`)) return;
    try {
      const res = await finalizeRun(selectedRun.id);
      setSelectedRun(res.data);
      loadRuns();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to finalize');
    }
  };

  const handleDeleteRun = async (run) => {
    if (!confirm('Delete this draft payroll run?')) return;
    try {
      await deleteRun(run.id);
      if (selectedRun?.id === run.id) setSelectedRun(null);
      loadRuns();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to delete');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={() => setShowRunModal(true)}><Play size={16} /> Run Payroll</button>
      </div>

      <div className="section-card" style={{ marginBottom: 20 }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th style={{ whiteSpace: 'nowrap' }}>Period</th><th style={{ whiteSpace: 'nowrap' }}>Status</th><th style={{ whiteSpace: 'nowrap' }}>Employees</th><th style={{ whiteSpace: 'nowrap' }}>Total Net Pay</th><th style={{ whiteSpace: 'nowrap' }}>Actions</th></tr></thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} style={{ cursor: 'pointer' }} onClick={() => openRun(run)}>
                  <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{MONTH_NAMES[run.month - 1]} {run.year}</td>
                  <td style={{ whiteSpace: 'nowrap' }}><span className={`badge ${run.status === 'finalized' ? 'badge-active' : 'badge-pending'}`}>{run.status}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>{run.payslip_count}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{money(run.total_net_pay)}</td>
                  <td style={{ whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                    {run.status === 'draft' && (
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteRun(run)}><Trash2 size={13} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {runs.length === 0 && <div className="empty-state"><Wallet size={48} /><p>No payroll runs yet</p></div>}
      </div>

      {selectedRun && (
        <div className="section-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <h3 style={{ marginBottom: 0 }}>
              <Receipt size={18} style={{ color: 'var(--accent-blue)' }} /> {MONTH_NAMES[selectedRun.month - 1]} {selectedRun.year} Payslips
            </h3>
            {selectedRun.status === 'draft' && (
              <button className="btn btn-success btn-sm" onClick={handleFinalize}><Lock size={13} /> Finalize Run</button>
            )}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ whiteSpace: 'nowrap' }}>Employee</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Basic</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Earnings</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Deductions</th>
                  <th style={{ whiteSpace: 'nowrap' }}>LOP Days</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Net Pay</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payslips.map((p) => (
                  <Fragment key={p.id}>
                    <tr>
                      <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{p.employee_name} ({p.employee_code})</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{money(p.basic_pay)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{money(p.gross_earnings)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{money(p.gross_deductions)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{p.lop_days}</td>
                      <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{money(p.net_pay)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div className="table-row-actions">
                          <button className="btn btn-secondary btn-sm" onClick={() => setExpandedPayslip(expandedPayslip === p.id ? null : p.id)}>
                            {expandedPayslip === p.id ? 'Hide' : 'Details'}
                          </button>
                          {selectedRun.status === 'draft' && (
                            <button className="btn btn-secondary btn-sm" onClick={() => setShowAdjustModal(p)}>Adjust</button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedPayslip === p.id && (
                      <tr>
                        <td colSpan={7} style={{ background: 'var(--bg-input)' }}>
                          <div style={{ padding: '10px 4px', display: 'grid', gap: 4, fontSize: '0.8125rem' }}>
                            {p.lines.map((line) => (
                              <div key={line.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, maxWidth: 420 }}>
                                <span>
                                  {line.component_name}
                                  {line.is_manual_adjustment && <span className="badge badge-info" style={{ marginLeft: 6 }}>Adjustment</span>}
                                  {line.component_type === 'employer_cost' && <span className="badge badge-pending" style={{ marginLeft: 6 }}>Employer Cost (not paid to employee)</span>}
                                </span>
                                <span style={{
                                  flexShrink: 0,
                                  color: line.component_type === 'earning' ? 'var(--accent-emerald)'
                                    : line.component_type === 'employer_cost' ? 'var(--text-muted)'
                                    : 'var(--accent-rose)',
                                }}>
                                  {line.component_type === 'deduction' ? '-' : line.component_type === 'earning' ? '+' : ''}{money(line.amount)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {payslips.length === 0 && <div className="empty-state"><p>No payslips in this run</p></div>}
        </div>
      )}

      {showRunModal && (
        <RunPayrollModal onClose={() => setShowRunModal(false)} onSubmit={handleCreateRun} />
      )}
      {showAdjustModal && (
        <AdjustmentModal
          payslip={showAdjustModal}
          onClose={() => setShowAdjustModal(null)}
          onSuccess={async () => { setShowAdjustModal(null); const res = await getRunPayslips(selectedRun.id); setPayslips(res.data); }}
        />
      )}
    </div>
  );
}

function RunPayrollModal({ onClose, onSubmit }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  return (
    <Modal title="Run Payroll" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSubmit(Number(year), Number(month)); }}>
        <div className="input-group">
          <label className="input-label">Month</label>
          <select className="input-field" value={month} onChange={(e) => setMonth(e.target.value)}>
            {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div className="input-group">
          <label className="input-label">Year</label>
          <input type="number" className="input-field" value={year} onChange={(e) => setYear(e.target.value)} required />
        </div>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 12 }}>
          This generates a draft payslip for every employee with an active salary assignment. You can review and adjust before finalizing.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary"><Play size={14} /> Run Payroll</button>
        </div>
      </form>
    </Modal>
  );
}

function AdjustmentModal({ payslip, onClose, onSuccess }) {
  const [form, setForm] = useState({ component_name: '', component_type: 'earning', amount: '', description: '' });
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await addPayslipAdjustment(payslip.id, { ...form, amount: Number(form.amount) });
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add adjustment');
    }
  };

  return (
    <Modal title={`Adjustment — ${payslip.employee_name}`} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div style={{ marginBottom: 12, color: 'var(--accent-rose)', fontSize: '0.875rem' }}>{error}</div>}
        <div className="input-group">
          <label className="input-label">Label</label>
          <input className="input-field" placeholder="e.g. Festival Bonus" value={form.component_name} onChange={(e) => setForm({ ...form, component_name: e.target.value })} required />
        </div>
        <div className="input-group">
          <label className="input-label">Type</label>
          <select className="input-field" value={form.component_type} onChange={(e) => setForm({ ...form, component_type: e.target.value })}>
            <option value="earning">Earning (adds to pay)</option>
            <option value="deduction">Deduction (subtracts from pay)</option>
          </select>
        </div>
        <div className="input-group">
          <label className="input-label">Amount</label>
          <input type="number" step="0.01" className="input-field" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
        </div>
        <div className="input-group">
          <label className="input-label">Note (optional)</label>
          <input className="input-field" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">Add Adjustment</button>
        </div>
      </form>
    </Modal>
  );
}

// ── Tax Slabs ────────────────────────────────────────────────
function TaxSlabsTab() {
  const [slabs, setSlabs] = useState([]);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => { load(); }, []);
  const load = () => getTaxSlabs().then((r) => setSlabs(r.data)).catch(() => {});

  const handleDelete = async (s) => {
    if (!confirm('Delete this tax slab?')) return;
    await deleteTaxSlab(s.id);
    load();
  };

  const renderRegime = (regime, title) => {
    const rows = slabs.filter((s) => s.regime === regime).sort((a, b) => a.min_income - b.min_income);
    return (
      <div className="section-card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 16 }}>{title}</h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th style={{ whiteSpace: 'nowrap' }}>Income From</th><th style={{ whiteSpace: 'nowrap' }}>Income To</th><th style={{ whiteSpace: 'nowrap' }}>Rate</th><th style={{ whiteSpace: 'nowrap' }}>Actions</th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>₹{money(s.min_income)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{s.max_income ? `₹${money(s.max_income)}` : 'and above'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{s.rate_percent}%</td>
                  <td style={{ whiteSpace: 'nowrap' }}><button className="btn btn-danger btn-sm" onClick={() => handleDelete(s)}><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <div className="empty-state"><p>No slabs configured for this regime</p></div>}
      </div>
    );
  };

  return (
    <div>
      <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 16 }}>
        These slabs drive the TDS calculation on every payslip. They're illustrative starting values — review and update them for the current assessment year and any government changes.
      </p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} /> Add Slab</button>
      </div>
      {renderRegime('new', 'New Regime')}
      {renderRegime('old', 'Old Regime')}
      {showModal && (
        <TaxSlabModal onClose={() => setShowModal(false)} onSuccess={() => { setShowModal(false); load(); }} />
      )}
    </div>
  );
}

function TaxSlabModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({ regime: 'new', min_income: '', max_income: '', rate_percent: '' });
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await createTaxSlab({
        regime: form.regime,
        min_income: Number(form.min_income),
        max_income: form.max_income ? Number(form.max_income) : null,
        rate_percent: Number(form.rate_percent),
      });
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add slab');
    }
  };

  return (
    <Modal title="Add Tax Slab" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div style={{ marginBottom: 12, color: 'var(--accent-rose)', fontSize: '0.875rem' }}>{error}</div>}
        <div className="input-group">
          <label className="input-label">Regime</label>
          <select className="input-field" value={form.regime} onChange={(e) => setForm({ ...form, regime: e.target.value })}>
            <option value="new">New Regime</option>
            <option value="old">Old Regime</option>
          </select>
        </div>
        <div className="input-group">
          <label className="input-label">Income From (₹, annual)</label>
          <input type="number" step="0.01" className="input-field" value={form.min_income} onChange={(e) => setForm({ ...form, min_income: e.target.value })} required />
        </div>
        <div className="input-group">
          <label className="input-label">Income To (₹, annual — leave blank for no upper bound)</label>
          <input type="number" step="0.01" className="input-field" value={form.max_income} onChange={(e) => setForm({ ...form, max_income: e.target.value })} />
        </div>
        <div className="input-group">
          <label className="input-label">Rate (%)</label>
          <input type="number" step="0.01" className="input-field" value={form.rate_percent} onChange={(e) => setForm({ ...form, rate_percent: e.target.value })} required />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">Add</button>
        </div>
      </form>
    </Modal>
  );
}

// ── Professional Tax Slabs ──────────────────────────────────
function PtSlabsTab() {
  const [slabs, setSlabs] = useState([]);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => { load(); }, []);
  const load = () => getPtSlabs().then((r) => setSlabs(r.data)).catch(() => {});

  const handleDelete = async (s) => {
    if (!confirm('Delete this PT slab?')) return;
    await deletePtSlab(s.id);
    load();
  };

  const states = [...new Set(slabs.map((s) => s.state))];

  return (
    <div>
      <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 16 }}>
        Professional Tax is looked up by the employee's state (via their assigned Site). A state with no slabs configured means PT simply doesn't apply to employees there.
      </p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} /> Add Slab</button>
      </div>
      {states.map((state) => (
        <div key={state} className="section-card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 16 }}><Landmark size={18} style={{ color: 'var(--accent-blue)' }} /> {state}</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th style={{ whiteSpace: 'nowrap' }}>Gross From</th><th style={{ whiteSpace: 'nowrap' }}>Gross To</th><th style={{ whiteSpace: 'nowrap' }}>Amount</th><th style={{ whiteSpace: 'nowrap' }}>Actions</th></tr></thead>
              <tbody>
                {slabs.filter((s) => s.state === state).sort((a, b) => a.min_gross - b.min_gross).map((s) => (
                  <tr key={s.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>₹{money(s.min_gross)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{s.max_gross ? `₹${money(s.max_gross)}` : 'and above'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>₹{money(s.amount)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}><button className="btn btn-danger btn-sm" onClick={() => handleDelete(s)}><Trash2 size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {states.length === 0 && (
        <div className="section-card">
          <div className="empty-state"><Landmark size={48} /><p>No states configured yet</p></div>
        </div>
      )}
      {showModal && (
        <PtSlabModal onClose={() => setShowModal(false)} onSuccess={() => { setShowModal(false); load(); }} />
      )}
    </div>
  );
}

function PtSlabModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({ state: '', min_gross: '', max_gross: '', amount: '' });
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await createPtSlab({
        state: form.state,
        min_gross: Number(form.min_gross),
        max_gross: form.max_gross ? Number(form.max_gross) : null,
        amount: Number(form.amount),
      });
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add slab');
    }
  };

  return (
    <Modal title="Add Professional Tax Slab" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div style={{ marginBottom: 12, color: 'var(--accent-rose)', fontSize: '0.875rem' }}>{error}</div>}
        <div className="input-group">
          <label className="input-label">State</label>
          <input className="input-field" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} required />
        </div>
        <div className="input-group">
          <label className="input-label">Gross From (₹, monthly)</label>
          <input type="number" step="0.01" className="input-field" value={form.min_gross} onChange={(e) => setForm({ ...form, min_gross: e.target.value })} required />
        </div>
        <div className="input-group">
          <label className="input-label">Gross To (₹, monthly — leave blank for no upper bound)</label>
          <input type="number" step="0.01" className="input-field" value={form.max_gross} onChange={(e) => setForm({ ...form, max_gross: e.target.value })} />
        </div>
        <div className="input-group">
          <label className="input-label">PT Amount (₹/month)</label>
          <input type="number" step="0.01" className="input-field" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">Add</button>
        </div>
      </form>
    </Modal>
  );
}

// ── Employee Loans ───────────────────────────────────────────
function LoansTab() {
  const [employees, setEmployees] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [loans, setLoans] = useState([]);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    getDirectory().then((r) => setEmployees(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedEmployeeId) loadLoans();
  }, [selectedEmployeeId]);

  const loadLoans = () => getEmployeeLoans(selectedEmployeeId).then((r) => setLoans(r.data)).catch(() => setLoans([]));

  const handleClose = async (loan) => {
    if (!confirm('Mark this loan as closed (forgive remaining balance)?')) return;
    await closeLoan(loan.id);
    loadLoans();
  };

  return (
    <div>
      <div className="section-card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 16 }}><HandCoins size={18} style={{ color: 'var(--accent-amber)' }} /> Employee Loans / Advances</h3>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 240px' }}>
            <select className="input-field" value={selectedEmployeeId} onChange={(e) => setSelectedEmployeeId(e.target.value)}>
              <option value="">Select an employee...</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</option>
              ))}
            </select>
          </div>
          {selectedEmployeeId && (
            <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} /> New Loan</button>
          )}
        </div>
      </div>

      {selectedEmployeeId && (
        <div className="section-card">
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ whiteSpace: 'nowrap' }}>Start Date</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Principal</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Monthly Installment</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Remaining</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Status</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Reason</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loans.map((l) => (
                  <tr key={l.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{l.start_date}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{money(l.principal_amount)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{money(l.monthly_installment)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{money(l.remaining_balance)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}><span className={`badge ${l.status === 'active' ? 'badge-pending' : 'badge-active'}`}>{l.status}</span></td>
                    <td style={{ whiteSpace: 'nowrap' }}>{l.reason || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {l.status === 'active' && (
                        <button className="btn btn-secondary btn-sm" onClick={() => handleClose(l)}>Close</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {loans.length === 0 && <div className="empty-state"><p>No loans on record</p></div>}
        </div>
      )}

      {showModal && (
        <LoanModal
          employeeId={selectedEmployeeId}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); loadLoans(); }}
        />
      )}
    </div>
  );
}

function LoanModal({ employeeId, onClose, onSuccess }) {
  const [form, setForm] = useState({ principal_amount: '', monthly_installment: '', start_date: '', reason: '' });
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await createLoan({
        employee_id: employeeId,
        principal_amount: Number(form.principal_amount),
        monthly_installment: Number(form.monthly_installment),
        start_date: form.start_date,
        reason: form.reason || null,
      });
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create loan');
    }
  };

  return (
    <Modal title="New Loan / Advance" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div style={{ marginBottom: 12, color: 'var(--accent-rose)', fontSize: '0.875rem' }}>{error}</div>}
        <div className="input-group">
          <label className="input-label">Principal Amount</label>
          <input type="number" step="0.01" className="input-field" value={form.principal_amount} onChange={(e) => setForm({ ...form, principal_amount: e.target.value })} required />
        </div>
        <div className="input-group">
          <label className="input-label">Monthly Installment</label>
          <input type="number" step="0.01" className="input-field" value={form.monthly_installment} onChange={(e) => setForm({ ...form, monthly_installment: e.target.value })} required />
        </div>
        <div className="input-group">
          <label className="input-label">Start Date</label>
          <input type="date" className="input-field" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} required />
        </div>
        <div className="input-group">
          <label className="input-label">Reason (optional)</label>
          <input className="input-field" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">Create Loan</button>
        </div>
      </form>
    </Modal>
  );
}

// ── Payroll Policy ───────────────────────────────────────────
function PolicyTab() {
  const [policy, setPolicy] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getPayrollPolicy().then((r) => setPolicy(r.data)).catch(() => {});
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const res = await updatePayrollPolicy(policy);
      setPolicy(res.data);
      setSaved(true);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to save policy');
    } finally {
      setSaving(false);
    }
  };

  if (!policy) return null;

  const field = (key, label, hint) => (
    <div className="input-group">
      <label className="input-label">{label}</label>
      <input
        type="number" step="0.01" className="input-field"
        value={policy[key]}
        onChange={(e) => setPolicy({ ...policy, [key]: e.target.value })}
      />
      {hint && <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>{hint}</p>}
    </div>
  );

  return (
    <div className="section-card">
      <h3 style={{ marginBottom: 4 }}><Settings2 size={18} style={{ color: 'var(--accent-violet)' }} /> Payroll Policy</h3>
      <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 16 }}>
        Every threshold below drives the payroll engine directly — nothing here is hardcoded in the app.
        {policy.epf_registered && (
          <span> Note: this company has already crossed the EPF headcount threshold and is marked EPF-registered — that stays true even if headcount later drops.</span>
        )}
      </p>
      <form onSubmit={handleSave}>
        <div className="form-grid-2">
          {field('min_basic_percent_of_ctc', 'Min Basic % of CTC', 'Basic + DA wage floor (India Labour Codes default: 50%)')}
          {field('epf_threshold_employee_count', 'EPF Headcount Threshold')}
          {field('esi_threshold_employee_count', 'ESI Headcount Threshold')}
          {field('esi_wage_ceiling', 'ESI Wage Ceiling (₹/month)')}
          {field('gratuity_threshold_employee_count', 'Gratuity Headcount Threshold')}
          {field('gratuity_years_regular', 'Gratuity Years (Regular)')}
          {field('gratuity_years_fixed_term', 'Gratuity Years (Fixed-Term)')}
          {field('fnf_settlement_days', 'F&F Settlement Days')}
          {field('standard_working_hours_per_day', 'Standard Working Hours/Day')}
          {field('overtime_rate_multiplier', 'Overtime Rate Multiplier')}
          {field('tds_cess_percent', 'TDS Cess %')}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 20 }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Policy'}</button>
          {saved && <span style={{ color: 'var(--accent-emerald)', fontSize: '0.875rem' }}>Saved</span>}
        </div>
      </form>
    </div>
  );
}
