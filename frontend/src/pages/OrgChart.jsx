import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../components/Modal';
import { getOrgChart } from '../api/employees';
import { roleFor } from '../components/job/orgDraft';
import { Building2, ChevronDown, ChevronRight, Users, Network, List, ZoomIn, ZoomOut, RotateCcw, Search, X } from 'lucide-react';

const NODE_COLORS = [
  { border: '#2563eb', bg: '#eff6ff', badgeBg: '#dbeafe', badgeColor: '#1e40af', label: 'Leadership', role: 'leadership' },
  { border: '#059669', bg: '#ecfdf5', badgeBg: '#d1fae5', badgeColor: '#065f46', label: 'Manager', role: 'manager' },
  { border: '#7c3aed', bg: '#f5f3ff', badgeBg: '#ede9fe', badgeColor: '#5b21b6', label: 'Team Lead', role: 'lead' },
  { border: '#d97706', bg: '#fffbeb', badgeBg: '#fef3c7', badgeColor: '#92400e', label: 'Member', role: 'member' },
];

function schemeFor(node, depth) {
  const reports = node.direct_reports || [];
  const role = roleFor({
    hasTeam: reports.length > 0,
    leadsLeads: reports.some((r) => r.direct_reports?.length > 0),
    hasManager: depth > 0,
  });
  return NODE_COLORS.find((c) => c.role === role);
}

/* ── Tree diagram view (boxes + connector lines) ─────────────── */
function OrgTreeNode({ node, depth = 0, isMobile = false, onSelect }) {
  // On phones only the first level opens by default so the chart fits the screen.
  const [expanded, setExpanded] = useState(depth < (isMobile ? 1 : 2));
  const hasChildren = node.direct_reports && node.direct_reports.length > 0;
  const colorScheme = schemeFor(node, depth);
  const initials = (node.full_name || '').split(' ').map((n) => n[0]).join('').toUpperCase();

  return (
    <li>
      <div
        className={`org-card${hasChildren ? ' clickable' : ''}`}
        style={{ '--org-accent': colorScheme.border }}
        onClick={(e) => {
          // Phones: tapping the card opens details, the count chip expands/collapses.
          if (isMobile && onSelect && !e.target.closest('.org-card-toggle')) { onSelect(node); return; }
          if (hasChildren) setExpanded(!expanded);
        }}
        title={node.work_email || undefined}
      >
        {node.photo_url ? (
          <img
            src={node.photo_url}
            alt={node.full_name}
            style={{ width: 36, height: 36, borderRadius: 10, objectFit: 'cover', boxShadow: '0 2px 6px rgba(0,0,0,0.08)' }}
          />
        ) : (
          <div
            style={{
              width: 36, height: 36, borderRadius: 10,
              background: `linear-gradient(135deg, ${colorScheme.border}, #1e293b)`,
              color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: '0.85rem', boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
            }}
          >
            {initials}
          </div>
        )}

        <div style={{ fontSize: '0.8125rem', fontWeight: 800, color: '#0f172a', marginTop: 4, lineHeight: 1.2 }}>
          {node.full_name}
        </div>
        <span
          style={{
            fontSize: '0.75rem', fontWeight: 700, padding: '1px 7px', borderRadius: 6,
            background: colorScheme.badgeBg, color: colorScheme.badgeColor, marginTop: 1,
          }}
        >
          {colorScheme.label}
        </span>
        {node.designation_name && (
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155', marginTop: 2 }}>{node.designation_name}</div>
        )}
        {node.open_positions?.length > 0 && (
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#b45309', marginTop: 2 }} title={node.open_positions.join(', ')}>
            {node.open_positions.length} open position{node.open_positions.length === 1 ? '' : 's'}
          </div>
        )}
        {node.department_name && (
          <div style={{ fontSize: '0.75rem', color: '#3d4a5e', marginTop: 2 }}>{node.department_name}</div>
        )}
        <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: 1 }}>{node.employee_code}</div>

        {hasChildren && (
          <div className="org-card-toggle">
            <Users size={10} />
            {node.direct_reports.length}
            {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </div>
        )}
      </div>

      {expanded && hasChildren && (
        <ul className="animate-fade-in">
          {node.direct_reports.map((child) => (
            <OrgTreeNode key={child.id} node={child} depth={depth + 1} isMobile={isMobile} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </li>
  );
}

/* ── List view (indented rows) ───────────────────────────────── */
function OrgNode({ node, depth = 0, onSelect, isMobile = false }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.direct_reports && node.direct_reports.length > 0;
  const colorScheme = schemeFor(node, depth);

  return (
    <div style={{ position: 'relative', marginTop: depth > 0 ? 12 : 0 }}>
      <div
        className="org-node-card"
        onClick={() => {
          if (isMobile && onSelect) { onSelect(node); return; }
          if (hasChildren) setExpanded(!expanded);
        }}
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
            className="org-chev"
            onClick={(e) => { if (isMobile) { e.stopPropagation(); setExpanded(!expanded); } }}
            style={{
              width: 28, height: 28, borderRadius: 8,
              background: colorScheme.bg, color: colorScheme.border,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </div>
        ) : (
          <div className="org-chev" style={{ width: 28 }} />
        )}

        {node.photo_url ? (
          <img
            className="org-avatar"
            src={node.photo_url}
            alt={node.full_name}
            style={{ width: 44, height: 44, borderRadius: 14, objectFit: 'cover', flexShrink: 0, boxShadow: '0 4px 10px rgba(0,0,0,0.08)' }}
          />
        ) : (
          <div
            className="org-avatar"
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
          <div className="org-node-info-row" style={{ fontSize: '0.8125rem', color: '#3d4a5e', marginTop: 3, display: 'flex', gap: 16 }}>
            <span>Code: <strong style={{ color: '#334155' }}>{node.employee_code}</strong></span>
            {node.department_name && (
              <span>Dept: <strong style={{ color: '#2563eb' }}>{node.department_name}</strong></span>
            )}
            {node.work_email && (
              <span className="org-email" style={{ color: '#3d4a5e' }}>{node.work_email}</span>
            )}
          </div>
        </div>

        {hasChildren && (
          <div
            className="org-reports-badge"
            style={{
              padding: '6px 14px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0',
              color: '#334155', fontSize: '0.8125rem', fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
            }}
          >
            <Users size={14} style={{ color: '#2563eb' }} />
            <span>{node.direct_reports.length}<span className="org-reports-word"> Direct Reports</span></span>
          </div>
        )}
      </div>

      {expanded && hasChildren && (
        <div className="animate-fade-in org-node-children" style={{ borderLeft: `2px dashed #cbd5e1`, marginTop: 4, marginBottom: 12 }}>
          {node.direct_reports.map((child) => (
            <OrgNode key={child.id} node={child} depth={depth + 1} onSelect={onSelect} isMobile={isMobile} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrgChart({ embedded = false }) {
  const [chart, setChart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(0.85);
  const [viewMode, setViewMode] = useState(() => (
    window.matchMedia('(max-width: 768px)').matches ? 'list' : 'tree'
  ));
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 768px)').matches);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  const [size, setSize] = useState({ w: 0, h: 0 });
  const scrollRef = useRef(null);
  const forestRef = useRef(null);
  const fittedRef = useRef(false);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const onChange = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

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

  const handleZoomIn = () => setZoom((z) => Math.min(1.4, Number((z + 0.1).toFixed(2))));
  const handleZoomOut = () => setZoom((z) => Math.max(0.3, Number((z - 0.1).toFixed(2))));

  // Scale the whole chart to the visible width (phones start fitted).
  const fit = useCallback(() => {
    const cw = scrollRef.current?.clientWidth;
    if (!cw || !size.w) return;
    const z = Number(((cw - 16) / size.w).toFixed(2));
    setZoom(Math.max(isMobile ? 0.5 : 0.4, Math.min(1, z)));
  }, [size.w, isMobile]);
  const handleResetZoom = () => (isMobile ? fit() : setZoom(0.85));

  // Measure the unscaled chart so the scroll area matches its scaled size.
  useEffect(() => {
    const el = forestRef.current;
    if (viewMode !== 'tree' || !el) return undefined;
    const measure = () => setSize({ w: el.offsetWidth, h: el.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [viewMode, chart, loading]);

  useEffect(() => { fittedRef.current = false; }, [viewMode]);
  useEffect(() => {
    if (viewMode === 'tree' && isMobile && size.w && !fittedRef.current) {
      fittedRef.current = true;
      fit();
    }
  }, [viewMode, isMobile, size.w, fit]);

  // Two-finger pinch to zoom.
  useEffect(() => {
    const el = scrollRef.current;
    if (viewMode !== 'tree' || !el) return undefined;
    let startDist = 0;
    let startZoom = 1;
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = (e) => {
      if (e.touches.length === 2) { startDist = dist(e.touches); startZoom = zoomRef.current; }
    };
    const onMove = (e) => {
      if (e.touches.length === 2 && startDist) {
        e.preventDefault();
        setZoom(Math.max(0.3, Math.min(1.6, Number((startZoom * dist(e.touches) / startDist).toFixed(2)))));
      }
    };
    const onEnd = () => { startDist = 0; };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
    };
  }, [viewMode, chart, loading]);

  const flat = useMemo(() => {
    const out = [];
    const walk = (n, parent) => { out.push({ node: n, parent }); (n.direct_reports || []).forEach((c) => walk(c, n)); };
    chart.forEach((n) => walk(n, null));
    return out;
  }, [chart]);
  const q = query.trim().toLowerCase();
  const results = q
    ? flat.filter(({ node }) => [node.full_name, node.employee_code, node.designation_name, node.department_name]
      .some((v) => (v || '').toLowerCase().includes(q)))
    : null;

  return (
    <div className="animate-fade-in">
      {!embedded && (
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
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Organization Chart</h1>
              <p style={{ color: '#3d4a5e', fontSize: '0.875rem', margin: '2px 0 0 0' }}>Visual hierarchy of your organization's reporting structure</p>
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
                  color: viewMode === 'tree' ? '#0f172a' : '#475569',
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
                  color: viewMode === 'list' ? '#0f172a' : '#475569',
                  boxShadow: viewMode === 'list' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                <List size={15} /> <span className="view-toggle-label">List View</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Embedded Controls Bar */}
      {embedded && !loading && chart.length > 0 && (
        <div className="org-controls" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div className="org-legend" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {NODE_COLORS.map((c) => (
              <span
                key={c.label}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: '0.75rem', fontWeight: 600, color: c.badgeColor,
                  background: c.badgeBg, padding: '4px 10px', borderRadius: 'var(--radius-full)',
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.border, flexShrink: 0 }} />
                {c.label}
              </span>
            ))}
          </div>

          <div className="org-seg" style={{ display: 'flex', background: '#f1f5f9', padding: 3, borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <button
              onClick={() => setViewMode('tree')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 7, border: 'none',
                fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease',
                background: viewMode === 'tree' ? '#ffffff' : 'transparent',
                color: viewMode === 'tree' ? '#0f172a' : '#475569',
                boxShadow: viewMode === 'tree' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
              }}
            >
              <Network size={14} /> Tree View
            </button>
            <button
              onClick={() => setViewMode('list')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 7, border: 'none',
                fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease',
                background: viewMode === 'list' ? '#ffffff' : 'transparent',
                color: viewMode === 'list' ? '#0f172a' : '#475569',
                boxShadow: viewMode === 'list' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
              }}
            >
              <List size={14} /> List View
            </button>
          </div>
        </div>
      )}

      {!embedded && !loading && chart.length > 0 && (
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

      <div className="section-card" style={{ padding: 0, borderTop: '3px solid #2563eb', position: 'relative', overflow: 'hidden' }}>
        {loading ? (
          <div className="empty-state" style={{ padding: 40 }}><p>Loading...</p></div>
        ) : chart.length === 0 ? (
          <div className="empty-state" style={{ padding: 40 }}>
            <Building2 size={48} />
            <p>No organization data available</p>
          </div>
        ) : viewMode === 'tree' ? (
          <div ref={scrollRef} className="org-tree-scroll" style={{ position: 'relative', overflow: 'auto', minHeight: 460, background: '#fafafa', padding: '16px 8px 32px 8px', touchAction: 'pan-x pan-y' }}>
            
            {/* Floating Zoom Control Bar */}
            <div style={{ position: 'sticky', top: 8, right: 8, zIndex: 10, display: 'flex', justifyContent: 'flex-end', padding: '0 8px', pointerEvents: 'none', marginBottom: 6 }}>
              <div style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255, 255, 255, 0.94)', backdropFilter: 'blur(8px)', padding: '4px 8px', borderRadius: 10, border: '1px solid #cbd5e1', boxShadow: '0 4px 14px rgba(0,0,0,0.08)' }}>
                <button
                  type="button"
                  onClick={handleZoomOut}
                  className="org-zoom-btn" style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e2e8f0', background: '#ffffff', color: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                  title="Zoom Out"
                >
                  <ZoomOut size={14} />
                </button>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0f172a', minWidth: 40, textAlign: 'center' }}>
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={handleZoomIn}
                  className="org-zoom-btn" style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e2e8f0', background: '#ffffff', color: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                  title="Zoom In"
                >
                  <ZoomIn size={14} />
                </button>
                <div style={{ width: 1, height: 16, background: '#cbd5e1', margin: '0 2px' }} />
                <button
                  type="button"
                  onClick={handleResetZoom}
                  style={{ height: 28, padding: '0 8px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#ffffff', color: '#334155', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}
                  title="Reset to Fit View"
                >
                  <RotateCcw size={12} /> Fit
                </button>
              </div>
            </div>

            <div
              style={{
                width: size.w ? size.w * zoom : undefined,
                height: size.h ? size.h * zoom : undefined,
                margin: '0 auto',
              }}
            >
              <div
                ref={forestRef}
                className="org-forest"
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: 'top left',
                  width: 'max-content',
                  display: 'flex',
                  justifyContent: 'center',
                  paddingTop: 4,
                  paddingBottom: 24,
                }}
              >
                {chart.map((node) => (
                  <ul className="org-tree" key={node.id}>
                    <OrgTreeNode node={node} isMobile={isMobile} onSelect={setSelected} />
                  </ul>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="org-list-wrap" style={{ padding: '20px 24px' }}>
            <div className="org-search">
              <Search size={16} className="org-search-icon" />
              <input
                className="input-field"
                placeholder="Search name, code, designation, department..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button type="button" className="org-search-clear" onClick={() => setQuery('')} aria-label="Clear search">
                  <X size={14} />
                </button>
              )}
            </div>
            {results ? (
              results.length === 0 ? (
                <div className="empty-state" style={{ padding: 24 }}><p>No one matches "{query}"</p></div>
              ) : results.map(({ node, parent }) => (
                <div key={node.id} className="org-result" onClick={() => setSelected(node)}>
                  <div className="org-result-avatar">
                    {node.photo_url
                      ? <img src={node.photo_url} alt={node.full_name} />
                      : (node.full_name || '').split(' ').map((n) => n[0]).join('').toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="org-result-name">{node.full_name}</div>
                    <div className="org-result-sub">
                      {[node.designation_name, node.department_name].filter(Boolean).join(' · ') || node.employee_code}
                    </div>
                    {parent && <div className="org-result-sub">Reports to {parent.full_name}</div>}
                  </div>
                </div>
              ))
            ) : (
              chart.map((node) => <OrgNode key={node.id} node={node} onSelect={setSelected} isMobile={isMobile} />)
            )}
          </div>
        )}
      </div>

      {selected && (
        <Modal sheet title={selected.full_name} onClose={() => setSelected(null)} closeOnOverlay>
          <dl className="info-dl" style={{ marginBottom: 16 }}>
            <dt>Designation</dt><dd>{selected.designation_name || '—'}</dd>
            <dt>Department</dt><dd>{selected.department_name || '—'}</dd>
            <dt>Employee code</dt><dd>{selected.employee_code || '—'}</dd>
            <dt>Email</dt><dd style={{ overflowWrap: 'anywhere' }}>{selected.work_email || '—'}</dd>
            <dt>Direct reports</dt><dd>{selected.direct_reports?.length || 0}</dd>
            {selected.open_positions?.length > 0 && (
              <><dt>Open positions</dt><dd>{selected.open_positions.join(', ')}</dd></>
            )}
          </dl>
          <Link to={`/employees/${selected.id}`} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', minHeight: 44 }}>
            View profile
          </Link>
        </Modal>
      )}
    </div>
  );
}
