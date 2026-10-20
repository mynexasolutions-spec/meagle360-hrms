import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';
import logoImg from '../assets/logo.jpg';

export default function CompanyToastContainer({ toasts, onDismiss }) {
  if (!toasts || toasts.length === 0) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 20,
        right: 20,
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        maxWidth: '380px',
        width: 'calc(100vw - 40px)',
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => {
        const getStyles = () => {
          switch (toast.type) {
            case 'success':
              return { icon: CheckCircle2, color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' };
            case 'error':
            case 'danger':
              return { icon: AlertCircle, color: '#dc2626', bg: '#fef2f2', border: '#fecaca' };
            case 'warning':
              return { icon: AlertTriangle, color: '#d97706', bg: '#fffbeb', border: '#fde68a' };
            case 'info':
            default:
              return { icon: Info, color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' };
          }
        };

        const config = getStyles();
        const Icon = config.icon;

        return (
          <div
            key={toast.id}
            style={{
              pointerEvents: 'auto',
              background: '#ffffff',
              border: `1px solid ${config.border}`,
              borderLeft: `4px solid ${config.color}`,
              borderRadius: '12px',
              padding: '12px 14px',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              animation: 'slideInRight 0.25s ease-out',
            }}
          >
            <img
              src={logoImg}
              alt="Meagle360"
              style={{
                width: 24,
                height: 24,
                borderRadius: '6px',
                objectFit: 'cover',
                flexShrink: 0,
                marginTop: '1px',
              }}
            />

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                <Icon size={14} color={config.color} strokeWidth={2.5} />
                <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>
                  {toast.title || (toast.type === 'error' ? 'Error' : toast.type === 'success' ? 'Success' : 'Notice')}
                </h4>
              </div>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#475569', lineHeight: 1.4, wordBreak: 'break-word' }}>
                {toast.message}
              </p>
            </div>

            <button
              onClick={() => onDismiss(toast.id)}
              type="button"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '2px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>,
    document.body
  );
}
