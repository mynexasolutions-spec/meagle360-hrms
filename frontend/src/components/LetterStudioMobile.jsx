import { Pencil, Eye, Printer } from 'lucide-react';

// Phone-only controls shared by the Offer and Relieving letter studios.
export function StudioTabs({ tab, onChange }) {
  return (
    <div className="studio-tabs no-print" role="tablist">
      <button type="button" role="tab" aria-selected={tab === 'edit'} className={tab === 'edit' ? 'active' : ''} onClick={() => onChange('edit')}>
        <Pencil size={15} /> Edit
      </button>
      <button type="button" role="tab" aria-selected={tab === 'preview'} className={tab === 'preview' ? 'active' : ''} onClick={() => onChange('preview')}>
        <Eye size={15} /> Preview
      </button>
    </div>
  );
}

export function StudioPrintBar({ onPrint }) {
  return (
    <div className="studio-print-bar no-print">
      <button type="button" className="btn btn-primary" onClick={onPrint}>
        <Printer size={17} /> Print / Save as PDF
      </button>
    </div>
  );
}
