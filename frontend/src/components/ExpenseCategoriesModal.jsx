import { useEffect, useState } from 'react';
import { Plus, Pencil, Check, X } from 'lucide-react';
import Modal from './Modal';
import { usePopup } from '../context/PopupContext';
import { getExpenseCategories, createExpenseCategory, updateExpenseCategory } from '../api/expenses';

/** Org admins add, rename and switch expense categories on/off.
 *  Categories are never deleted, so old claims keep their category name. */
export default function ExpenseCategoriesModal({ onClose, onChanged }) {
  const { showAlert } = usePopup();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await getExpenseCategories(true);
      setCategories(res.data);
    } catch (err) {
      showAlert({ title: 'Could not load categories', message: err.response?.data?.detail || 'Please try again.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const run = async (action) => {
    setBusy(true);
    try {
      await action();
      await load();
      onChanged?.();
      return true;
    } catch (err) {
      showAlert({ title: 'Action Failed', message: err.response?.data?.detail || 'Please try again.', type: 'error' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    if (await run(() => createExpenseCategory(name))) setNewName('');
  };

  const handleRename = async (id) => {
    const name = editName.trim();
    if (!name) return;
    if (await run(() => updateExpenseCategory(id, { name }))) setEditingId(null);
  };

  return (
    <Modal title="Expense Categories" onClose={onClose}>
      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          className="input-field"
          placeholder="New category, e.g. Travel"
          maxLength={100}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          aria-label="New category name"
        />
        <button type="submit" className="btn btn-primary" disabled={busy || !newName.trim()} style={{ whiteSpace: 'nowrap' }}>
          <Plus size={16} /> Add
        </button>
      </form>

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>
      ) : categories.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)' }}>No categories yet. Add the first one above.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {categories.map((cat) => (
            <div
              key={cat.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                border: '1px solid #e2e8f0', borderRadius: 10,
                background: cat.is_active ? '#ffffff' : '#f8fafc',
              }}
            >
              {editingId === cat.id ? (
                <>
                  <input
                    className="input-field"
                    style={{ flex: 1 }}
                    maxLength={100}
                    value={editName}
                    autoFocus
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); handleRename(cat.id); }
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    aria-label="Category name"
                  />
                  <button type="button" className="btn-icon btn-ghost" disabled={busy} onClick={() => handleRename(cat.id)} aria-label="Save">
                    <Check size={16} />
                  </button>
                  <button type="button" className="btn-icon btn-ghost" onClick={() => setEditingId(null)} aria-label="Cancel">
                    <X size={16} />
                  </button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontWeight: 600, color: cat.is_active ? '#0f172a' : '#94a3b8' }}>
                    {cat.name}
                  </span>
                  {!cat.is_active && <span className="badge badge-rejected">Inactive</span>}
                  <button
                    type="button" className="btn-icon btn-ghost" aria-label={`Rename ${cat.name}`}
                    onClick={() => { setEditingId(cat.id); setEditName(cat.name); }}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button" className="btn btn-secondary btn-sm" disabled={busy}
                    onClick={() => run(() => updateExpenseCategory(cat.id, { is_active: !cat.is_active }))}
                  >
                    {cat.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      <p style={{ marginTop: 14, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        Inactive categories are hidden from the claim form; existing claims keep them.
      </p>
    </Modal>
  );
}
