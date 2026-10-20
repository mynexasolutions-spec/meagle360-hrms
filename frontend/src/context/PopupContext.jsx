import { createContext, useContext, useState, useCallback, useRef } from 'react';
import CompanyPopupModal from '../components/CompanyPopupModal';
import CompanyToastContainer from '../components/CompanyToast';

const PopupContext = createContext(null);

export function PopupProvider({ children }) {
  // Modal state
  const [modalConfig, setModalConfig] = useState({
    isOpen: false,
    type: 'warning',
    title: '',
    message: '',
    confirmText: '',
    cancelText: '',
    isConfirm: false,
    isPrompt: false,
    promptPlaceholder: '',
    promptDefaultValue: '',
    promptRequired: true,
  });

  const resolverRef = useRef(null);

  // Toasts state
  const [toasts, setToasts] = useState([]);

  // Dismiss Toast
  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Show Toast
  const showToast = useCallback(({ message, type = 'info', title = '', duration = 4000 }) => {
    const id = Date.now() + Math.random().toString(36).substring(2, 6);
    const newToast = { id, message, type, title };
    setToasts((prev) => [...prev, newToast]);

    if (duration > 0) {
      setTimeout(() => {
        dismissToast(id);
      }, duration);
    }
    return id;
  }, [dismissToast]);

  // Show Alert
  const showAlert = useCallback((options) => {
    return new Promise((resolve) => {
      resolverRef.current = () => resolve(true);

      const opts = typeof options === 'string' ? { message: options } : options;
      setModalConfig({
        isOpen: true,
        type: opts.type || 'warning',
        title: opts.title || '',
        message: opts.message || '',
        confirmText: opts.confirmText || 'Understood',
        cancelText: '',
        isConfirm: false,
        isPrompt: false,
      });
    });
  }, []);

  // Show Confirm
  const showConfirm = useCallback((options) => {
    return new Promise((resolve) => {
      resolverRef.current = (result) => resolve(!!result);

      const opts = typeof options === 'string' ? { message: options } : options;
      setModalConfig({
        isOpen: true,
        type: opts.type || 'danger',
        title: opts.title || 'Confirm Action',
        message: opts.message || '',
        confirmText: opts.confirmText || 'Confirm',
        cancelText: opts.cancelText || 'Cancel',
        isConfirm: true,
        isPrompt: false,
      });
    });
  }, []);

  // Show Prompt
  const showPrompt = useCallback((options) => {
    return new Promise((resolve) => {
      resolverRef.current = (result) => resolve(result !== undefined ? result : null);

      const opts = typeof options === 'string' ? { message: options } : options;
      setModalConfig({
        isOpen: true,
        type: opts.type || 'info',
        title: opts.title || 'Provide Information',
        message: opts.message || '',
        confirmText: opts.confirmText || 'Submit',
        cancelText: opts.cancelText || 'Cancel',
        isConfirm: false,
        isPrompt: true,
        promptPlaceholder: opts.placeholder || 'Enter details...',
        promptDefaultValue: opts.defaultValue || '',
        promptRequired: opts.required !== false,
      });
    });
  }, []);

  const handleModalConfirm = (val) => {
    setModalConfig((prev) => ({ ...prev, isOpen: false }));
    if (resolverRef.current) {
      resolverRef.current(val !== undefined ? val : true);
      resolverRef.current = null;
    }
  };

  const handleModalCancel = () => {
    setModalConfig((prev) => ({ ...prev, isOpen: false }));
    if (resolverRef.current) {
      resolverRef.current(modalConfig.isPrompt ? null : false);
      resolverRef.current = null;
    }
  };

  // Helper convenience object
  const value = {
    showAlert,
    showConfirm,
    showPrompt,
    showToast,
    // Convenient aliases
    alert: (msg, title) => showAlert({ message: msg, title }),
    confirm: (msg, title) => showConfirm({ message: msg, title }),
    prompt: (msg, defaultValue = '', title) => showPrompt({ message: msg, defaultValue, title }),
    toast: (msg, type = 'info', title) => showToast({ message: msg, type, title }),
  };

  return (
    <PopupContext.Provider value={value}>
      {children}
      <CompanyPopupModal
        {...modalConfig}
        onConfirm={handleModalConfirm}
        onCancel={handleModalCancel}
      />
      <CompanyToastContainer toasts={toasts} onDismiss={dismissToast} />
    </PopupContext.Provider>
  );
}

export function usePopup() {
  const context = useContext(PopupContext);
  if (!context) {
    throw new Error('usePopup must be used within a PopupProvider');
  }
  return context;
}
