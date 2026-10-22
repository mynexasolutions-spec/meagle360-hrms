import { useState } from 'react';
import { Upload, Camera } from 'lucide-react';
import Modal from './Modal';
import { uploadFaceProfile } from '../api/face';
import { usePopup } from '../context/PopupContext';

export default function PassportUploadModal({ isOpen, onClose, onUploaded, currentProfile }) {
  const { showToast } = usePopup();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(currentProfile?.photo_url || null);
  const [consent, setConsent] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      showToast({ message: 'Photo must be under 5 MB', type: 'warning' });
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      showToast({ message: 'Please select a passport-size photo', type: 'warning' });
      return;
    }
    if (!consent) {
      showToast({ message: 'Please grant consent for facial verification', type: 'warning' });
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('photo', file);
      formData.append('consent', 'true');
      const res = await uploadFaceProfile(formData);
      showToast({
        message: 'Passport photo submitted! Awaiting admin approval.',
        type: 'success',
      });
      if (onUploaded) onUploaded(res.data);
      onClose();
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to upload photo';
      showToast({ message: msg, type: 'error' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Upload Passport Photo" maxWidth="560px">
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12, margin: 0 }}>
        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
          {/* Left: Photo Preview & Select Button */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <div
              style={{
                width: 120,
                height: 140,
                borderRadius: 8,
                border: '2px dashed var(--border-color)',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--bg-secondary)',
              }}
            >
              {preview ? (
                <img
                  src={preview}
                  alt="Passport preview"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 8 }}>
                  <Camera size={26} style={{ margin: '0 auto 4px', opacity: 0.5 }} />
                  <span style={{ fontSize: 11 }}>Passport Photo</span>
                </div>
              )}
            </div>

            <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', padding: '4px 10px', fontSize: 12 }}>
              <Upload size={13} style={{ marginRight: 5 }} /> Choose File
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
            </label>
          </div>

          {/* Right: Instructions, Consent Checkbox & Action Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
              Upload a clear, front-facing passport-size photo. Once approved by your admin, this will be matched
              against your live clock-in selfies.
            </p>

            <div
              style={{
                padding: '8px 10px',
                background: 'var(--bg-secondary)',
                borderRadius: 6,
                border: '1px solid var(--border-color)',
              }}
            >
              <label style={{ display: 'flex', gap: 8, cursor: 'pointer', fontSize: 11.5, color: 'var(--text-primary)', lineHeight: 1.35 }}>
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  style={{ marginTop: 2, flexShrink: 0 }}
                />
                <span>
                  I consent to processing my face embedding strictly for attendance verification. Live selfies are discarded immediately.
                </span>
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={uploading}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={uploading || !file || !consent}>
                {uploading ? 'Analyzing & Uploading...' : 'Submit Photo'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}
