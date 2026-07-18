import { useState, useEffect } from 'react';
import { getOrgChart } from '../api/employees';
import { Building2, ChevronDown, ChevronRight, User } from 'lucide-react';

function OrgNode({ node, depth = 0 }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.direct_reports && node.direct_reports.length > 0;

  return (
    <div style={{ marginLeft: depth > 0 ? 24 : 0 }}>
      <div
        className="glass-card"
        style={{
          padding: '12px 16px',
          marginBottom: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          cursor: hasChildren ? 'pointer' : 'default',
          borderLeft: `3px solid ${depth === 0 ? 'var(--accent-blue)' : depth === 1 ? 'var(--accent-violet)' : 'var(--accent-emerald)'}`,
        }}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {hasChildren && (
          expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />
        )}
        {!hasChildren && <div style={{ width: 16 }} />}
        <div
          className="avatar"
          style={{
            width: 32, height: 32, fontSize: '0.75rem',
            background: depth === 0 ? 'var(--gradient-primary)' : depth === 1 ? 'var(--gradient-success)' : 'var(--gradient-warm)',
          }}
        >
          {node.full_name.split(' ').map(n => n[0]).join('').toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{node.full_name}</div>
          <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
            {node.department_name || 'No department'} · {node.employee_code}
          </div>
        </div>
        {hasChildren && (
          <span className="badge badge-info">{node.direct_reports.length} reports</span>
        )}
      </div>
      {expanded && hasChildren && (
        <div className="animate-fade-in" style={{ borderLeft: '1px dashed var(--border-color)', marginLeft: 20, paddingLeft: 0 }}>
          {node.direct_reports.map((child) => (
            <OrgNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrgChart() {
  const [chart, setChart] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadChart();
  }, []);

  const loadChart = async () => {
    try {
      const res = await getOrgChart();
      setChart(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1>Organization Chart</h1>
          <p>Visual hierarchy of your organization's reporting structure</p>
        </div>
      </div>

      <div className="section-card">
        {loading ? (
          <div className="empty-state"><p>Loading...</p></div>
        ) : chart.length > 0 ? (
          chart.map((node) => <OrgNode key={node.id} node={node} />)
        ) : (
          <div className="empty-state">
            <Building2 size={48} />
            <p>No organization data available</p>
          </div>
        )}
      </div>
    </div>
  );
}
