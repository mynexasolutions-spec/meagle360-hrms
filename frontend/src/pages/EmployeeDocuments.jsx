import { useCallback, useEffect, useState } from 'react';
import { FolderCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import PageTitle from '../components/PageTitle';
import DocumentChecklist from '../components/documents/DocumentChecklist';
import ManageRequired from '../components/documents/ManageRequired';
import { EMPLOYMENT_TYPES, NoRequiredDocuments, StatusBadge } from '../components/documents/shared';
import { errorText } from '../components/policies/shared';
import { getDocumentOverview } from '../api/documents';
import useUrlFilters from '../utils/useUrlFilters';
import './Company.css';
import './EmployeeDocuments.css';

const SHOW = [
  ['', 'All employees'],
  ['missing', 'Pending from employee'],
  ['review', 'Waiting for review'],
  ['done', 'All verified'],
];

const MATCHES = {
  '': () => true,
  missing: (e) => e.missing > 0,
  review: (e) => e.to_review > 0,
  done: (e) => e.total > 0 && e.verified === e.total,
};

function Overview({ canManage, onAdd }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);
  const [filters, setFilters] = useUrlFilters({ q: '', dept: '', type: '', show: '' });

  const load = useCallback(() => {
    setError('');
    return getDocumentOverview()
      .then((res) => setData(res.data))
      .catch((err) => setError(errorText(err, 'Could not load the documents.')));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error && !data) {
    return (
      <div className="doc-error" role="alert">
        {error} <button type="button" className="btn btn-secondary btn-sm" onClick={load}>Try again</button>
      </div>
    );
  }
  if (!data) return <p className="doc-muted">Loading...</p>;
  if (!data.documents.length) {
    return <NoRequiredDocuments onAdd={canManage ? onAdd : undefined} />;
  }

  const departments = [...new Set(data.employees.map((e) => e.department).filter(Boolean))].sort();
  const q = filters.q.trim().toLowerCase();
  const inScope = data.employees.filter((e) =>
    (!q || e.name.toLowerCase().includes(q) || e.code.toLowerCase().includes(q))
    && (!filters.dept || e.department === filters.dept)
    && (!filters.type || e.employment_type === filters.type));
  const rows = inScope.filter(MATCHES[filters.show] || MATCHES['']);

  return (
    <>
      <div className="doc-cards">
        {SHOW.map(([id, label]) => (
          <button
            key={id} type="button" aria-pressed={filters.show === id}
            className={`section-card doc-card${filters.show === id ? ' active' : ''}`}
            onClick={() => setFilters({ show: id })}
          >
            <span>{label}</span>
            <strong>{inScope.filter(MATCHES[id]).length}</strong>
          </button>
        ))}
      </div>
      <div className="doc-filters">
        <input
          className="input-field" placeholder="Search by name or code..." aria-label="Search employees"
          value={filters.q} onChange={(e) => setFilters({ q: e.target.value })}
        />
        <select className="input-field" aria-label="Department" value={filters.dept} onChange={(e) => setFilters({ dept: e.target.value })}>
          <option value="">All departments</option>
          {departments.map((d) => <option key={d}>{d}</option>)}
        </select>
        <select className="input-field" aria-label="Employment type" value={filters.type} onChange={(e) => setFilters({ type: e.target.value })}>
          <option value="">All employment types</option>
          {EMPLOYMENT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      {error && <div className="doc-error" role="alert">{error}</div>}
      <div className="section-card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Verified</th>
              {data.documents.map((d) => <th key={d.id} style={{ whiteSpace: 'nowrap' }}>{d.name}{d.mandatory ? '' : ' (optional)'}</th>)}
              <th style={{ textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.employee_id}>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <strong>{e.name}</strong>
                  <p className="doc-muted">{[e.code, e.department].filter(Boolean).join(', ')}</p>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>{e.total ? `${e.verified}/${e.total}` : '-'}</td>
                {data.documents.map((d) => (
                  <td key={d.id}>
                    {e.statuses[d.id] ? <StatusBadge status={e.statuses[d.id]} /> : <span title="Not required">-</span>}
                  </td>
                ))}
                <td style={{ textAlign: 'right' }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(e)}>
                    {e.to_review ? 'Review' : 'Open'}
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={data.documents.length + 3} className="doc-empty">No employees match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {open && (
        <Modal title={`Documents: ${open.name}`} onClose={() => setOpen(null)} maxWidth={760}>
          <DocumentChecklist employeeId={open.employee_id} isHr onChange={load} />
        </Modal>
      )}
    </>
  );
}

export default function EmployeeDocuments() {
  const { user } = useAuth();
  const canManage = !!user?.permissions?.['settings:write'];
  const [filters, setFilters] = useUrlFilters({ tab: 'status' });
  const [adding, setAdding] = useState(false); // opens the Add form on the other tab
  const tab = canManage && filters.tab === 'required' ? 'required' : 'status';

  return (
    <div className="animate-fade-in company-page">
      <PageTitle icon={FolderCheck} title="Employee Documents" subtitle="Documents your employees must submit, and who has submitted them" />
      {canManage && (
        <div className="tabs">
          {[['status', 'Employees'], ['required', 'Required documents']].map(([id, label]) => (
            <button key={id} type="button" className={`tab${tab === id ? ' active' : ''}`} onClick={() => { setAdding(false); setFilters({ tab: id }); }}>
              {label}
            </button>
          ))}
        </div>
      )}
      {tab === 'required'
        ? <ManageRequired startAdding={adding} />
        : <Overview canManage={canManage} onAdd={() => { setAdding(true); setFilters({ tab: 'required' }); }} />}
    </div>
  );
}
