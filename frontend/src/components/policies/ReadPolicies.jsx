import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, FileText, Search } from 'lucide-react';
import { acknowledgePolicy, getPolicies } from '../../api/policies';
import useUrlFilters from '../../utils/useUrlFilters';
import { PolicyText, announceChange, dateLabel, errorText, openPdf } from './shared';

function Agree({ policy, onDone }) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await acknowledgePolicy(policy.id, policy.version);
      announceChange();
      await onDone();
    } catch (err) {
      setError(errorText(err, 'Could not save. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="policy-agree">
      <label>
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        I have read and agree to this policy.
      </label>
      <button type="button" className="btn btn-primary" disabled={!checked || busy} onClick={submit}>
        {busy ? 'Saving...' : 'Submit'}
      </button>
      {error && <div className="policy-error" role="alert">{error}</div>}
    </div>
  );
}

export default function ReadPolicies() {
  const [policies, setPolicies] = useState(null);
  const [failed, setFailed] = useState('');
  const [pdfError, setPdfError] = useState('');
  const [search, setSearch] = useState('');
  const [{ policy: openId }, setFilters] = useUrlFilters({ policy: '' });

  const load = useCallback(async () => {
    try {
      const res = await getPolicies();
      setPolicies(res.data);
      setFailed('');
    } catch (err) {
      setFailed(errorText(err, 'Could not load the policies.'));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (failed && !policies) {
    return (
      <div className="glass-card policy-empty" role="alert">
        <p>{failed}</p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={load}>Try again</button>
      </div>
    );
  }
  if (!policies) return <div className="glass-card policy-empty">Loading...</div>;
  if (policies.length === 0) {
    return <div className="glass-card policy-empty">No policies have been published yet.</div>;
  }

  const q = search.trim().toLowerCase();
  const shown = policies.filter((p) => !q || `${p.title}\n${p.body}`.toLowerCase().includes(q));
  const current = shown.find((p) => p.id === openId) || shown.find((p) => p.pending) || shown[0];
  const pending = policies.filter((p) => p.pending).length;

  return (
    <>
      {pending > 0 && (
        <div className="policy-notice">
          {pending === 1 ? '1 policy needs' : `${pending} policies need`} your agreement.
        </div>
      )}
      <div className="policy-layout">
        <div className="glass-card policy-list">
          <div className="policy-search">
            <Search size={16} aria-hidden="true" />
            <input
              className="input-field" type="search" placeholder="Search policies..." aria-label="Search policies"
              value={search} onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {shown.length === 0 && <p className="policy-muted">No policy found.</p>}
          {shown.map((p) => (
            <button
              key={p.id} type="button" aria-current={p.id === current?.id}
              className={p.id === current?.id ? 'active' : ''}
              onClick={() => { setPdfError(''); setFilters({ policy: p.id }); }}
            >
              <span>{p.title}</span>
              {p.pending && <span className="badge badge-pending">Pending</span>}
              {p.requires_ack && p.acknowledged_at && (
                <CheckCircle2 size={16} className="policy-done" aria-label="Agreed" />
              )}
            </button>
          ))}
        </div>

        {current && (
          <article className="glass-card policy-view">
            <h2>{current.title}</h2>
            <p className="policy-muted">
              Version {current.version} · Published {dateLabel(current.published_at)}
            </p>
            {current.has_attachment && (
              <button
                type="button" className="btn btn-secondary btn-sm"
                onClick={() => {
                  setPdfError('');
                  openPdf(current.id).catch((err) => setPdfError(errorText(err, 'Could not open the PDF.')));
                }}
              >
                <FileText size={15} /> Open PDF
              </button>
            )}
            {pdfError && <div className="policy-error" role="alert">{pdfError}</div>}
            <PolicyText text={current.body} />
            {current.pending && <Agree key={`${current.id}-${current.version}`} policy={current} onDone={load} />}
            {current.requires_ack && current.acknowledged_at && (
              <p className="policy-agreed">
                <CheckCircle2 size={17} /> You agreed to version {current.acknowledged_version} on{' '}
                {dateLabel(current.acknowledged_at)}.
              </p>
            )}
          </article>
        )}
      </div>
    </>
  );
}
