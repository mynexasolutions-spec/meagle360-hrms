import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function Modal({ title, onClose, children, closeOnOverlay = false }) {
  return createPortal(
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (closeOnOverlay && e.target === e.currentTarget && onClose) {
          onClose();
        }
      }}
    >
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="btn-icon btn-ghost" onClick={onClose} type="button" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}

