import { getPolicyPdf } from '../../api/policies';

// The sidebar listens for this to refresh its pending badge.
export const POLICIES_CHANGED = 'policies-changed';
export const announceChange = () => window.dispatchEvent(new Event(POLICIES_CHANGED));

export function errorText(err, fallback) {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
  return fallback;
}

export const dateLabel = (iso) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export async function openPdf(id, draft = false) {
  // Opened before the request so the browser does not block it as a pop-up.
  const tab = window.open('', '_blank');
  try {
    const res = await getPolicyPdf(id, draft);
    const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
    if (tab) tab.location = url;
    else window.location.assign(url);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    tab?.close();
    throw err;
  }
}

/** Plain text with "## " headings and "- " bullets. Never rendered as HTML. */
export function PolicyText({ text }) {
  const blocks = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const last = blocks[blocks.length - 1];
    if (!line) blocks.push(null);
    else if (line.startsWith('## ')) blocks.push({ type: 'h', text: line.slice(3) });
    else if (line.startsWith('- ')) {
      if (last?.type === 'ul') last.items.push(line.slice(2));
      else blocks.push({ type: 'ul', items: [line.slice(2)] });
    } else if (last?.type === 'p') last.text += `\n${line}`;
    else blocks.push({ type: 'p', text: line });
  }
  return (
    <div className="policy-text">
      {blocks.map((b, i) => {
        if (!b) return null;
        if (b.type === 'h') return <h3 key={i}>{b.text}</h3>;
        if (b.type === 'ul') return <ul key={i}>{b.items.map((item, j) => <li key={j}>{item}</li>)}</ul>;
        return <p key={i}>{b.text}</p>;
      })}
    </div>
  );
}
