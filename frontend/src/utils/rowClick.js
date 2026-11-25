// Props that make a whole row or card clickable (mouse and Enter key) without
// hijacking the buttons, links and inputs inside it, or a text selection.
export function rowClick(action, className = '') {
  if (!action) return { className: className || undefined };
  return {
    className: `row-clickable ${className}`.trim(),
    tabIndex: 0,
    onClick: (e) => {
      if (e.target.closest('button, a, input, select, textarea, label')) return;
      if (window.getSelection()?.toString()) return;
      action();
    },
    onKeyDown: (e) => {
      if (e.key === 'Enter' && e.target === e.currentTarget) action();
    },
  };
}
