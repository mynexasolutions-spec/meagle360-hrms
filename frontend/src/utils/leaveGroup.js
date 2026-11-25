// Same grouping as normalize_name in backend dashboard_service.get_leave_summary,
// so a report row and the history it opens list the same leaves.
export function leaveGroup(name) {
  if (!name) return 'Other';
  const clean = name.trim();
  const low = clean.toLowerCase();
  if (/matern|patern|parent/.test(low)) return 'Parental Leave';
  if (low.includes('personal')) return 'Personal Leave';
  if (low.includes('sick')) return 'Sick Leave';
  if (low.includes('annual')) return 'Annual Leave';
  if (low.includes('casual')) return 'Casual Leave';
  if (low.includes('loss of pay') || low.includes('lop')) return 'Loss of Pay';
  return low.replace(/[a-z]+/g, (w) => w[0].toUpperCase() + w.slice(1));
}
