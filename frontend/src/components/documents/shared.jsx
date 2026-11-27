import { FolderPlus, Plus } from 'lucide-react';

export const MAX_BYTES = 2 * 1024 * 1024;

// The sidebar listens for this to refresh its pending badge.
export const DOCUMENTS_CHANGED = 'documents-changed';

export const EMPLOYMENT_TYPES = [
  ['full_time', 'Full-time'],
  ['fixed_term', 'Fixed-term'],
  ['contractor', 'Contractor'],
  ['intern', 'Intern'],
];

const STATUS = {
  pending: ['Pending', 'badge-pending'],
  uploaded: ['Uploaded', 'badge-info'],
  verified: ['Verified', 'badge-active'],
  rejected: ['Rejected', 'badge-rejected'],
};

export function StatusBadge({ status }) {
  const [label, badge] = STATUS[status];
  return <span className={`badge ${badge}`}>{label}</span>;
}

/** Shown until the company has a required document. Without `onAdd` there is no button. */
export function NoRequiredDocuments({ onAdd }) {
  return (
    <div className="section-card doc-none">
      <div className="doc-none-icon"><FolderPlus size={30} /></div>
      <h3>No required documents yet</h3>
      <p>
        {onAdd
          ? 'Add the documents your employees must submit, such as PAN or Aadhaar. You can then see here who has uploaded them and verify each file.'
          : 'Once an admin adds the documents employees must submit, you can see here who has uploaded them.'}
      </p>
      {onAdd && (
        <button type="button" className="btn btn-primary" onClick={onAdd}><Plus size={16} /> Add document</button>
      )}
    </div>
  );
}

/** Opens the file that `request` fetches in a new tab. */
export async function openBlob(request) {
  // Opened before the request so the browser does not block it as a pop-up.
  const tab = window.open('', '_blank');
  try {
    const res = await request();
    const url = URL.createObjectURL(res.data);
    if (tab) tab.location = url;
    else window.location.assign(url);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    tab?.close();
    throw err;
  }
}
