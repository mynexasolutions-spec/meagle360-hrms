import { AlertTriangle } from 'lucide-react';

// Live warnings for the drafted organization. Click a name to move that person.
export default function OrgHealth({ issues, onPerson }) {
  if (!issues.length) return <p className="oe-hint" style={{ margin: 0 }}>No problems found</p>;
  const total = issues.reduce((n, i) => n + (i.people || i.departments).length, 0);
  return (
    <details className="oe-health">
      <summary><span className="oe-summary"><AlertTriangle size={14} /> {total} to check</span></summary>
      <div className="oe-issues">
      {issues.map((issue) => (
        <div key={issue.label} className="oe-issue">
          <strong>{issue.label}</strong>
          <div className="oe-foot">
            {issue.people?.map((p) => (
              <button key={p.id} type="button" onClick={() => onPerson(p.id)}>{p.full_name}{p.note ? ` (${p.note})` : ''}</button>
            ))}
            {issue.departments?.map((d) => <span key={d.id}>{d.name}</span>)}
          </div>
        </div>
      ))}
      </div>
    </details>
  );
}
