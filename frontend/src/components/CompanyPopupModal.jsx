import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  AlertTriangle, 
  AlertCircle, 
  CheckCircle2, 
  Info, 
  X, 
  Clock 
} from 'lucide-react';
import logoImg from '../assets/logo.jpg';

export default function CompanyPopupModal({
  isOpen,
  type = 'warning', // 'warning' | 'danger' | 'error' | 'info' | 'success' | 'prompt'
  title,
  message,
  confirmText,
  cancelText,
  isConfirm = false,
  isPrompt = false,
  promptPlaceholder = 'Enter details here...',
  promptDefaultValue = '',
  promptRequired = true,
  onConfirm,
  onCancel,
}) {
  const [promptValue, setPromptValue] = useState(promptDefaultValue);
  const [promptError, setPromptError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setPromptValue(promptDefaultValue || '');
      setPromptError('');
      if (isPrompt) {
        setTimeout(() => inputRef.current?.focus(), 80);
      }
    }
  }, [isOpen, promptDefaultValue, isPrompt]);

  if (!isOpen) return null;

  // Determine badge styling based on type
  const isCooldown = typeof message === 'string' && (
    message.toLowerCase().includes('wait at least') ||
    message.toLowerCase().includes('cooldown')
  );

  const getBadgeConfig = () => {
    if (isCooldown) {
      return {
        icon: Clock,
        bg: '#fef3c7',
        color: '#b45309',
        border: '#fde68a',
        glow: 'rgba(245, 158, 11, 0.15)',
        defaultTitle: 'Clock-In Cooldown Active'
      };
    }
    switch (type) {
      case 'danger':
      case 'error':
        return {
          icon: AlertCircle,
          bg: '#fee2e2',
          color: '#dc2626',
          border: '#fecaca',
          glow: 'rgba(220, 38, 38, 0.15)',
          defaultTitle: 'Attention Required'
        };
      case 'success':
        return {
          icon: CheckCircle2,
          bg: '#d1fae5',
          color: '#059669',
          border: '#a7f3d0',
          glow: 'rgba(16, 185, 129, 0.15)',
          defaultTitle: 'Success'
        };
      case 'info':
        return {
          icon: Info,
          bg: '#dbeafe',
          color: '#2563eb',
          border: '#bfdbfe',
          glow: 'rgba(37, 99, 235, 0.15)',
          defaultTitle: 'Information'
        };
      case 'warning':
      default:
        return {
          icon: AlertTriangle,
          bg: '#fef3c7',
          color: '#d97706',
          border: '#fde68a',
          glow: 'rgba(245, 158, 11, 0.15)',
          defaultTitle: 'Notice'
        };
    }
  };

  const badge = getBadgeConfig();
  const IconComponent = badge.icon;
  const modalTitle = title || badge.defaultTitle;

  const handleConfirm = () => {
    if (isPrompt) {
      if (promptRequired && !promptValue.trim()) {
        setPromptError('This field cannot be empty');
        return;
      }
      onConfirm?.(promptValue);
    } else {
      onConfirm?.();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onCancel?.();
    } else if (e.key === 'Enter' && !isPrompt) {
      handleConfirm();
    }
  };

  return createPortal(
    <div
      className="modal-overlay"
      style={{
        zIndex: 9999,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.15s ease-out',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPrompt) {
          onCancel?.();
        }
      }}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div
        className="glass-card"
        style={{
          width: '100%',
          maxWidth: '460px',
          background: '#ffffff',
          borderRadius: '20px',
          boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(226, 232, 240, 0.8)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Company Brand Bar */}
        <div
          style={{
            padding: '14px 20px',
            background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img
              src={logoImg}
              alt="Meagle360 Logo"
              style={{
                width: 30,
                height: 30,
                borderRadius: '8px',
                objectFit: 'cover',
                boxShadow: '0 2px 4px rgba(0,0,0,0.06)',
                border: '1px solid rgba(0,0,0,0.05)',
              }}
            />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em', lineHeight: 1.1 }}>
                HRMS Portal
              </span>
              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#2563eb', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Meagle360
              </span>
            </div>
          </div>

          <button
            onClick={onCancel}
            type="button"
            className="btn-icon btn-ghost"
            style={{
              width: 28,
              height: 28,
              borderRadius: '8px',
              color: '#64748b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '28px 24px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {/* Glowing Center Badge */}
          <div
            style={{
              width: 58,
              height: 58,
              borderRadius: '50%',
              background: badge.bg,
              border: `1.5px solid ${badge.border}`,
              color: badge.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '18px',
              boxShadow: `0 0 20px ${badge.glow}`,
            }}
          >
            <IconComponent size={28} strokeWidth={2.2} />
          </div>

          {/* Heading Title */}
          <h3
            style={{
              margin: '0 0 8px 0',
              fontSize: '1.2rem',
              fontWeight: 700,
              color: '#0f172a',
              letterSpacing: '-0.015em',
            }}
          >
            {modalTitle}
          </h3>

          {/* Message text */}
          <p
            style={{
              margin: 0,
              fontSize: '0.925rem',
              color: '#475569',
              lineHeight: 1.55,
              maxWidth: '380px',
              wordBreak: 'break-word',
            }}
          >
            {message}
          </p>

          {/* Special Cooldown highlighted pill if it's a cooldown error */}
          {isCooldown && (
            <div
              style={{
                marginTop: '16px',
                padding: '8px 16px',
                borderRadius: '9999px',
                background: '#fffbeb',
                border: '1px solid #fde68a',
                color: '#b45309',
                fontSize: '0.825rem',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Clock size={15} />
              <span>Cooldown enforcement active</span>
            </div>
          )}

          {/* Prompt Input Field */}
          {isPrompt && (
            <div style={{ width: '100%', marginTop: '18px', textAlign: 'left' }}>
              <textarea
                ref={inputRef}
                value={promptValue}
                onChange={(e) => {
                  setPromptValue(e.target.value);
                  if (promptError) setPromptError('');
                }}
                rows={3}
                placeholder={promptPlaceholder}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: promptError ? '1.5px solid #ef4444' : '1px solid #cbd5e1',
                  fontSize: '0.9rem',
                  color: '#0f172a',
                  fontFamily: 'inherit',
                  outline: 'none',
                  resize: 'none',
                  boxSizing: 'border-box',
                  background: '#f8fafc',
                }}
              />
              {promptError && (
                <span style={{ fontSize: '0.775rem', color: '#ef4444', marginTop: '4px', display: 'block', fontWeight: 500 }}>
                  {promptError}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div
          style={{
            padding: '16px 24px 20px',
            display: 'flex',
            gap: '12px',
            justifyContent: isConfirm || isPrompt ? 'flex-end' : 'center',
            background: '#ffffff',
          }}
        >
          {(isConfirm || isPrompt) && (
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '10px 18px',
                borderRadius: '10px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#334155',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {cancelText || 'Cancel'}
            </button>
          )}

          <button
            type="button"
            onClick={handleConfirm}
            style={{
              padding: '10px 24px',
              borderRadius: '10px',
              border: 'none',
              background: type === 'danger' ? '#dc2626' : '#2563eb',
              color: '#ffffff',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: type === 'danger' 
                ? '0 4px 12px rgba(220, 38, 38, 0.25)' 
                : '0 4px 12px rgba(37, 99, 235, 0.25)',
              transition: 'all 0.15s ease',
              minWidth: isConfirm || isPrompt ? '110px' : '150px',
            }}
          >
            {confirmText || (isConfirm ? 'Confirm' : isPrompt ? 'Submit' : 'Understood')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
