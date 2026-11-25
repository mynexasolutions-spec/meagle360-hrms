import { useCallback, useEffect, useState } from 'react';
import { Upload } from 'lucide-react';
import Modal from '../Modal';
import { usePopup } from '../../context/PopupContext';
import {
  deleteOtherDocument, getOtherDocumentFile, getOtherDocuments, uploadOtherDocument,
} from '../../api/documents';
import { dateLabel, errorText } from '../policies/shared';
import { MAX_BYTES, openBlob } from './shared';

function UploadModal({ employeeId, onClose, onDone }) {
  const [name, setName] = useState('');
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const choose = (picked) => {
    if (!picked) return;
    const tooBig = picked.size > MAX_BYTES;
    setError(tooBig ? 'The file is larger than 5 MB.' : '');
    setFile(tooBig ? null : picked);
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await uploadOtherDocument(employeeId, name.trim(), file);
      onDone();
    } catch (err) {
      setError(errorText(err, 'Could not upload the file.'));
      setBusy(false);
    }
  };

  return (
    <Modal title="Upload Document" onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="doc-error" role="alert">{error}</div>}
        <div className="input-group">
          <label className="input-label" htmlFor="other-doc-name">Document name</label>
          <input
            id="other-doc-name" className="input-field" placeholder="e.g. Experience Letter" maxLength={100} required
            value={name} onChange={(e) => setName(e.target.value)}
          />
        </div>
        <label
          className={`doc-drop${dragging ? ' dragging' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); choose(e.dataTransfer.files[0]); }}
        >
          <Upload size={20} />
          <strong>{file ? file.name : 'Choose a file or drop it here'}</strong>
          <span className="doc-muted">PDF, JPG or PNG, up to 5 MB.</span>
          <input
            type="file" accept=".pdf,.jpg,.jpeg,.png"
            onChange={(e) => { choose(e.target.files[0]); e.target.value = ''; }}
          />
        </label>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !file || !name.trim()}>
            {busy ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Documents nobody asked for. Entries saved as a link before uploads existed still open. */
export default function OtherDocuments({ employeeId }) {
  const { showConfirm } = usePopup();
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  const load = useCallback(
    () => getOtherDocuments(employeeId).then((res) => setDocs(res.data)),
    [employeeId],
  );

  useEffect(() => {
    let active = true;
    setDocs(null);
    setError('');
    getOtherDocuments(employeeId)
      .then((res) => active && setDocs(res.data))
      .catch((err) => active && setError(errorText(err, 'Could not load the documents.')));
    return () => { active = false; };
  }, [employeeId]);

  const attempt = async (work, fallback) => {
    setError('');
    try {
      await work();
    } catch (err) {
      setError(errorText(err, fallback));
    }
  };

  const view = (doc) => attempt(
    () => openBlob(() => getOtherDocumentFile(employeeId, doc.id)),
    'Could not open the file. Please try again.',
  );

  const remove = async (doc) => {
    const ok = await showConfirm({
      title: 'Delete document',
      message: `Delete "${doc.name}" permanently?`,
      type: 'danger',
      confirmText: 'Delete',
    });
    if (!ok) return;
    attempt(async () => {
      await deleteOtherDocument(employeeId, doc.id);
      await load();
    }, 'Could not delete the document.');
  };

  return (
    <div>
      <div className="doc-head">
        <h2>Other documents</h2>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setUploading(true)}>
          <Upload size={14} /> Upload Document
        </button>
      </div>
      {error && <div className="doc-error" role="alert">{error}</div>}
      {!docs && !error && <p className="doc-muted">Loading...</p>}
      {docs?.length === 0 && <p className="doc-muted">No other documents.</p>}
      {docs?.map((doc) => (
        <div key={doc.id} className="doc-item">
          <div className="doc-item-text">
            <div className="doc-name">{doc.name}</div>
            <p className="doc-muted">{[doc.filename, dateLabel(doc.created_at)].filter(Boolean).join(', ')}</p>
          </div>
          <div className="doc-actions">
            {doc.has_file && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => view(doc)}>View</button>
            )}
            {!doc.has_file && doc.link && (
              <a className="btn btn-secondary btn-sm" href={doc.link} target="_blank" rel="noreferrer">Open link</a>
            )}
            {doc.can_delete && (
              <button type="button" className="btn btn-danger btn-sm" onClick={() => remove(doc)}>Delete</button>
            )}
          </div>
        </div>
      ))}
      {uploading && (
        <UploadModal
          employeeId={employeeId} onClose={() => setUploading(false)}
          onDone={() => { setUploading(false); attempt(load, 'Uploaded, but the list could not be refreshed.'); }}
        />
      )}
    </div>
  );
}
