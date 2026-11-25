export function formatMessageHtml(text) {
  if (!text) return '';
  const lines = text.split('\n');
  const htmlLines = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (/^[|\s:\-_]{3,}$/.test(trimmed)) continue;

    let processedLine = rawLine;
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const cells = trimmed
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean);
      if (!cells.length) continue;
      const lower = cells.map((c) => c.replace(/\*+/g, '').trim().toLowerCase());
      if (
        lower.some((h) => ['employee', 'employee name', 'name'].includes(h)) &&
        lower.some((h) => ['department', 'status', 'check-in', 'late by', 'leave type'].includes(h))
      ) {
        continue;
      }
      const first = cells[0].startsWith('**') ? cells[0] : `**${cells[0]}**`;
      const rest = cells.slice(1).join(' • ');
      processedLine = `- ${first}${rest ? ` — ${rest}` : ''}`;
    }

    const escaped = processedLine
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(
        /`([^`]+)`/g,
        '<code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:0.84em;color:#0f172a;">$1</code>'
      )
      .replace(/\*(.+?)\*/g, '<em>$1</em>');

    const bulletMatch = escaped.match(/^\s*[-•]\s+(.+)$/);
    if (bulletMatch) {
      htmlLines.push(
        `<div style="display:flex;align-items:flex-start;gap:8px;margin:4px 0;padding:4px 8px;border-radius:8px;background:rgba(241,245,249,0.65);">` +
          `<span style="color:#2563eb;font-weight:800;line-height:1.4;">•</span>` +
          `<span style="flex:1;">${bulletMatch[1]}</span>` +
        `</div>`
      );
    } else if (trimmed === '') {
      htmlLines.push('<div style="height:6px;"></div>');
    } else {
      htmlLines.push(`<div style="margin:2px 0;">${escaped}</div>`);
    }
  }

  return htmlLines.join('');
}
