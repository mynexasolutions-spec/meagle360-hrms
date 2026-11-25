import { useCallback, useEffect, useRef, useState } from 'react';
import { getDocumentChecklist, getDocumentFile, reviewDocument, uploadDocument } from '../../api/documents';
import { dateLabel, errorText } from '../policies/shared';
import { DOCUMENTS_CHANGED, MAX_BYTES, StatusBadge, openBlob } from './shared';

/** Required documents of one employee. `isHr` adds Verify / Reject and uploading on their behalf. */
export default function DocumentChecklist({ employeeId, isHr = false, onChange }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(null);
  const [note, setNote] = useState('');
  const inputRef = useRef(null);
  const uploadFor = useRef(null);

  const load = useCallback(
    () => getDocumentChecklist(employeeId).then((res) => setItems(res.data)),
    [employeeId],
  );

  useEffect(() => {
    let active = true;
    setItems(null);
    setError('');
    getDocumentChecklist(employeeId)
      .then((res) => active && setItems(res.data))
      .catch((err) => active && setError(errorText(err, 'Could not load the documents.')));
    return () => { active = false; };
  }, [employeeId]);

  const run = async (work, fallback) => {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (err) {
      setError(errorText(err, fallback));
    }
    // Reloaded after a failure too: someone else may have changed the file.
    try {
      await load();
      onChange?.();
      window.dispatchEvent(new Event(DOCUMENTS_CHANGED));
    } catch {
      // the list on screen stays
    }
    setBusy(false);
  };

  const pick = (documentId) => {
    uploadFor.current = documentId;
    inputRef.current.click();
  };

  const onFile = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError('The file is larger than 5 MB.');
      return;
    }
    run(() => uploadDocument(employeeId, uploadFor.current, file), 'Could not upload the file.');
  };

  const view = async (fileId) => {
    setError('');
    try {
      await openBlob(() => getDocumentFile(fileId));
    } catch {
      setError('Could not open the file. Refresh and try again.');
    }
  };

  const reject = (e) => {
    e.preventDefault();
    const fileId = rejecting;
    setRejecting(null);
    run(() => reviewDocument(fileId, 'rejected', note), 'Could not reject the document.');
  };

  return (
    <div>
      <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={onFile} style={{ display: 'none' }} />
      {error && <div className="doc-error" role="alert">{error}</div>}
      {!items && !error && <p className="doc-muted">Loading...</p>}
      {items?.length === 0 && <p className="doc-muted">No documents are required.</p>}
      {items?.map((item) => {
        const { file, status } = item;
        const canUpload = item.required && (isHr || status !== 'verified');
        return (
          <div key={item.document_id} className="doc-item">
            <div className="doc-item-text">
              <div className="doc-name">
                {item.name} <StatusBadge status={status} />
                {!item.mandatory && <span className="doc-muted">{item.required ? 'Optional' : 'No longer required'}</span>}
              </div>
              {item.instructions && <p className="doc-muted">{item.instructions}</p>}
              {file && (
                <p className="doc-muted">
                  {file.filename}, {dateLabel(file.uploaded_at)}{file.by_hr ? ', uploaded by HR' : ''}
                </p>
              )}
              {status === 'rejected' && <p className="doc-reject">Reason: {file.review_note}</p>}
            </div>
            <div className="doc-actions">
              {file && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => view(file.id)}>View</button>
              )}
              {canUpload && (
                <button
                  type="button" disabled={busy} onClick={() => pick(item.document_id)}
                  className={`btn btn-sm ${status === 'pending' || status === 'rejected' ? 'btn-primary' : 'btn-secondary'}`}
                >
                  {file ? 'Replace' : 'Upload'}
                </button>
              )}
              {isHr && file && status !== 'verified' && (
                <button
                  type="button" className="btn btn-success btn-sm" disabled={busy}
                  onClick={() => run(() => reviewDocument(file.id, 'verified'), 'Could not verify the document.')}
                >
                  Verify
                </button>
              )}
              {isHr && file && status !== 'rejected' && (
                <button
                  type="button" className="btn btn-danger btn-sm" disabled={busy}
                  onClick={() => { setNote(''); setRejecting(file.id); }}
                >
                  Reject
                </button>
              )}
            </div>
            {file && rejecting === file.id && (
              <form className="doc-reject-form" onSubmit={reject}>
                <input
                  className="input-field" placeholder="Why is it rejected? The employee will see this." autoFocus
                  aria-label="Reason" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)}
                />
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRejecting(null)}>Cancel</button>
                <button type="submit" className="btn btn-danger btn-sm" disabled={!note.trim()}>Reject</button>
              </form>
            )}
          </div>
        );
      })}
      {items?.some((i) => i.required) && <p className="doc-muted" style={{ marginTop: 12 }}>PDF, JPG or PNG, up to 5 MB.</p>}
    </div>
  );
}
