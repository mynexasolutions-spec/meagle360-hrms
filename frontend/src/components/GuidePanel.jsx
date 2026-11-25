import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, ChevronRight, Sparkles, X } from 'lucide-react';
import { getAiGuides, getAiGuide } from '../api/ai';
import { formatMessageHtml } from '../utils/aiText';

// Slide-over with saved how-to guides for the current page. Uses no AI tokens.
export default function GuidePanel({ page, onClose }) {
  const navigate = useNavigate();
  const [guides, setGuides] = useState(null);
  const [guide, setGuide] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    // Pages without their own guide show the full list.
    getAiGuides(page)
      .then((res) => (res.data.length ? res : getAiGuides()))
      .then((res) => active && setGuides(res.data))
      .catch((err) => active && setError(err.response?.data?.detail || 'Could not load the guides.'));
    return () => { active = false; };
  }, [page]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const openGuide = (id) => {
    setError('');
    getAiGuide(id)
      .then((res) => setGuide(res.data))
      .catch(() => setError('Could not load this guide.'));
  };

  const go = (path, state) => {
    onClose();
    navigate(path, { state });
  };

  return (
    <aside
      role="dialog"
      aria-label="How-to guides"
      style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(380px, 100vw)', zIndex: 200,
        display: 'flex', flexDirection: 'column', background: '#ffffff',
        borderLeft: '1px solid var(--border-color)', boxShadow: '-12px 0 32px -8px rgba(15, 23, 42, 0.18)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: '1px solid var(--border-color)' }}>
        {guide && (
          <button className="btn-icon btn-ghost" onClick={() => setGuide(null)} title="Back to guides">
            <ArrowLeft size={18} />
          </button>
        )}
        <strong style={{ flex: 1, fontSize: '0.95rem' }}>How-to guides</strong>
        <button className="btn-icon btn-ghost" onClick={onClose} title="Close">
          <X size={18} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, fontSize: '0.875rem', lineHeight: 1.6 }}>
        {error && <p style={{ color: 'var(--accent-rose)' }}>{error}</p>}
        {!error && !guides && <p>Loading...</p>}
        {guide ? (
          <>
            <div dangerouslySetInnerHTML={{ __html: formatMessageHtml(guide.reply) }} />
            {guide.path.split('?')[0] !== page && (
              <button className="btn btn-primary btn-sm" style={{ marginTop: 14 }} onClick={() => go(guide.path)}>
                {guide.button} <ArrowUpRight size={14} />
              </button>
            )}
          </>
        ) : (
          guides?.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => openGuide(g.id)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%',
                padding: '10px 12px', marginBottom: 8, borderRadius: 10, border: '1px solid var(--border-color)',
                background: '#ffffff', color: 'var(--text-primary)', font: 'inherit', fontWeight: 600,
                textAlign: 'left', cursor: 'pointer',
              }}
            >
              {g.title} <ChevronRight size={15} style={{ flexShrink: 0 }} />
            </button>
          ))
        )}
      </div>

      <div style={{ padding: 16, borderTop: '1px solid var(--border-color)' }}>
        <button
          className="btn btn-secondary"
          style={{ width: '100%', justifyContent: 'center' }}
          onClick={() => go('/ai-assistant', { fromPage: page })}
        >
          <Sparkles size={15} /> Ask Meagle AI
        </button>
      </div>
    </aside>
  );
}
