import { useState, useEffect } from 'react';
import { getOrgChart } from '../api/employees';
import { Building2, ChevronDown, ChevronRight, Users, Network, List } from 'lucide-react';

const NODE_COLORS = [
  { border: '#2563eb', bg: '#eff6ff', badgeBg: '#dbeafe', badgeColor: '#1e40af', label: 'Executive Leadership' },
  { border: '#059669', bg: '#ecfdf5', badgeBg: '#d1fae5', badgeColor: '#065f46', label: 'Department Manager' },
  { border: '#7c3aed', bg: '#f5f3ff', badgeBg: '#ede9fe', badgeColor: '#5b21b6', label: 'Team Lead' },
  { border: '#d97706', bg: '#fffbeb', badgeBg: '#fef3c7', badgeColor: '#92400e', label: 'Team Member' },
];

/* ── Tree diagram view (boxes + connector lines) ─────────────── */
function OrgTreeNode({ node, depth = 0 }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.direct_reports && node.direct_reports.length > 0;
  const colorScheme = NODE_COLORS[Math.min(depth, NODE_COLORS.length - 1)];
  const initials = node.full_name.split(' ').map((n) => n[0]).join('').toUpperCase();

  return (
    <li>
      <div
        className={`org-card${hasChildren ? ' clickable' : ''}`}
        style={{ '--org-accent': colorScheme.border }}
        onClick={() => hasChildren && setExpanded(!expanded)}
        title={node.work_email || undefined}
      >
        {node.photo_url ? (
          <img
            src={node.photo_url}
            alt={node.full_name}
            style={{ width: 52, height: 52, borderRadius: 14, objectFit: 'cover', boxShadow: '0 4px 10px rgba(0,0,0,0.08)' }}
          />
        ) : (
          <div
            style={{
              width: 52, height: 52, borderRadius: 14,
              background: `linear-gradient(135deg, ${colorScheme.border}, #1e293b)`,
              color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: '1.05rem', boxShadow: '0 4px 10px rgba(0,0,0,0.08)',
            }}
          >
            {initials}
          </div>
        )}

        <div style={{ fontSize: '0.925rem', fontWeight: 800, color: '#0f172a', marginTop: 8, lineHeight: 1.25 }}>
          {node.full_name}
        </div>
        <span
          style={{
            fontSize: '0.6875rem', fontWeight: 700, padding: '2px 9px', borderRadius: 8,
            background: colorScheme.badgeBg, color: colorScheme.badgeColor, marginTop: 2,
          }}
        >
          {colorScheme.label}
        </span>
        {node.department_name && (
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 4 }}>{node.department_name}</div>
        )}
        <div style={{ fontSize: '0.6875rem', color: '#94a3b8', marginTop: 2 }}>{node.employee_code}</div>

        {hasChildren && (
          <div className="org-card-toggle">
            <Users size={11} />
            {node.direct_reports.length}
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </div>
        )}
      </div>

      {expanded && hasChildren && (
        <ul className="animate-fade-in">
          {node.direct_reports.map((child) => (
            <OrgTreeNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

/* ── List view (indented rows) ───────────────────────────────── */
function OrgNode({ node, depth = 0 }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.direct_reports && node.direct_reports.length > 0;
  const colorScheme = NODE_COLORS[Math.min(depth, NODE_COLORS.length - 1)];

  return (
    <div style={{ position: 'relative', marginTop: depth > 0 ? 12 : 0 }}>
      <div
        className="org-node-card"
        onClick={() => hasChildren && setExpanded(!expanded)}
        style={{
          background: '#ffffff',
          borderRadius: 16,
          border: `1px solid #e2e8f0`,
          borderLeft: `4px solid ${colorScheme.border}`,
          padding: '14px 20px',
          marginBottom: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          cursor: hasChildren ? 'pointer' : 'default',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.02)',
        }}
      >
        {hasChildren ? (
          <div
            style={{
              width: 28, height: 28, borderRadius: 8,
              background: colorScheme.bg, color: colorScheme.border,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </div>
        ) : (
          <div style={{ width: 28 }} />
        )}

        {node.photo_url ? (
          <img
            src={node.photo_url}
            alt={node.full_name}
            style={{ width: 44, height: 44, borderRadius: 14, objectFit: 'cover', flexShrink: 0, boxShadow: '0 4px 10px rgba(0,0,0,0.08)' }}
          />
        ) : (
          <div
            style={{
              width: 44, height: 44, borderRadius: 14,
              background: `linear-gradient(135deg, ${colorScheme.border}, #1e293b)`,
              color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: '0.95rem', boxShadow: '0 4px 10px rgba(0,0,0,0.08)', flexShrink: 0,
            }}
          >
            {node.full_name.split(' ').map((n) => n[0]).join('').toUpperCase()}
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h4 style={{ margin: 0, fontSize: '0.975rem', fontWeight: 800, color: '#0f172a' }}>{node.full_name}</h4>
            <span style={{ fontSize: '0.725rem', fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: colorScheme.badgeBg, color: colorScheme.badgeColor }}>
              {colorScheme.label}
            </span>
          </div>
          <div className="org-node-info-row" style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: 3, display: 'flex', gap: 16 }}>
            <span>Code: <strong style={{ color: '#334155' }}>{node.employee_code}</strong></span>
            {node.department_name && (
              <span>Dept: <strong style={{ color: '#2563eb' }}>{node.department_name}</strong></span>
            )}
            {node.work_email && (
              <span style={{ color: '#64748b' }}>{node.work_email}</span>
            )}
          </div>
        </div>

        {hasChildren && (
          <div
            style={{
              padding: '6px 14px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0',
              color: '#334155', fontSize: '0.8125rem', fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
            }}
          >
            <Users size={14} style={{ color: '#2563eb' }} />
            <span>{node.direct_reports.length} Direct Reports</span>
          </div>
        )}
      </div>

      {expanded && hasChildren && (
        <div className="animate-fade-in org-node-children" style={{ borderLeft: `2px dashed #cbd5e1`, marginTop: 4, marginBottom: 12 }}>
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
  const [viewMode, setViewMode] = useState(() => (
    window.matchMedia('(max-width: 768px)').matches ? 'list' : 'tree'
  ));

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 48, height: 48, borderRadius: 16, flexShrink: 0,
              background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.13)',
            }}
          >
            <Building2 size={22} style={{ color: '#2563eb' }} />
          </div>
          <div>
            <h1>Organization Chart</h1>
            <p>Visual hierarchy of your organization's reporting structure</p>
          </div>
        </div>

        {!loading && chart.length > 0 && (
          <div style={{ display: 'flex', background: '#f1f5f9', padding: 4, borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <button
              onClick={() => setViewMode('tree')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: 'none',
                fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease',
                background: viewMode === 'tree' ? '#ffffff' : 'transparent',
                color: viewMode === 'tree' ? '#0f172a' : '#64748b',
                boxShadow: viewMode === 'tree' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
              }}
            >
              <Network size={15} /> <span className="view-toggle-label">Tree View</span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: 'none',
                fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease',
                background: viewMode === 'list' ? '#ffffff' : 'transparent',
                color: viewMode === 'list' ? '#0f172a' : '#64748b',
                boxShadow: viewMode === 'list' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
              }}
            >
              <List size={15} /> <span className="view-toggle-label">List View</span>
            </button>
          </div>
        )}
      </div>

      {!loading && chart.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
          {NODE_COLORS.map((c) => (
            <span
              key={c.label}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                fontSize: '0.78125rem', fontWeight: 600, color: c.badgeColor,
                background: c.badgeBg, padding: '5px 12px', borderRadius: 'var(--radius-full)',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.border, flexShrink: 0 }} />
              {c.label}
            </span>
          ))}
        </div>
      )}

      <div className="section-card" style={{ padding: viewMode === 'tree' ? 0 : undefined, borderTop: '3px solid #2563eb' }}>
        {loading ? (
          <div className="empty-state"><p>Loading...</p></div>
        ) : chart.length === 0 ? (
          <div className="empty-state">
            <Building2 size={48} />
            <p>No organization data available</p>
          </div>
        ) : viewMode === 'tree' ? (
          <div className="org-tree-scroll">
            <div className="org-forest">
              {chart.map((node) => (
                <ul className="org-tree" key={node.id}>
                  <OrgTreeNode node={node} />
                </ul>
              ))}
            </div>
          </div>
        ) : (
          chart.map((node) => <OrgNode key={node.id} node={node} />)
        )}
      </div>
    </div>
  );
}
