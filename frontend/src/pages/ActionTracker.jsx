import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getActionItems, createActionItem, updateActionItemStatus, deleteActionItem } from '../api/actionTracker';
import client from '../api/client';
import Modal from '../components/Modal';
import StatCard from '../components/StatCard';
import {
  CheckSquare,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  Calendar,
  User,
  Trash2,
  Filter,
  MessageSquare,
  Sparkles,
} from 'lucide-react';

export default function ActionTracker() {
  const { user } = useAuth();
  const isAdmin = user?.role_name === 'Admin' || !!user?.permissions?.['settings:write'];
  const isManager = !!user?.permissions?.['attendance:approve'] || !!user?.permissions?.['leave:approve'];
  const canCreateTask = isAdmin || isManager;

  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [filterStatus, setFilterStatus] = useState('all');
  const [loading, setLoading] = useState(true);

  // New Task Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTaskForm, setNewTaskForm] = useState({
    title: '',
    description: '',
    assigned_to_id: '',
    priority: 'medium',
    due_date: '',
  });

  // Update Status / Note Modal State
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [statusForm, setStatusForm] = useState({ status: '', completion_note: '' });

  useEffect(() => {
    loadData();
    if (canCreateTask) {
      client.get('/employees/').then((r) => setEmployees(r.data || [])).catch(() => {});
    }
  }, [canCreateTask]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await getActionItems();
      setTasks(res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTaskSubmit = async (e) => {
    e.preventDefault();
    try {
      await createActionItem({
        ...newTaskForm,
        due_date: newTaskForm.due_date || null,
      });
      setShowAddModal(false);
      setNewTaskForm({ title: '', description: '', assigned_to_id: '', priority: 'medium', due_date: '' });
      loadData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to create action task');
    }
  };

  const handleOpenStatusModal = (task, newStatus) => {
    setSelectedTask(task);
    setStatusForm({ status: newStatus || task.status, completion_note: task.completion_note || '' });
    setShowStatusModal(true);
  };

  const handleStatusSubmit = async (e) => {
    e.preventDefault();
    if (!selectedTask) return;
    try {
      await updateActionItemStatus(selectedTask.id, statusForm);
      setShowStatusModal(false);
      setSelectedTask(null);
      loadData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to update task status');
    }
  };

  const handleDeleteTask = async (id) => {
    if (!window.confirm('Are you sure you want to delete this action item?')) return;
    try {
      await deleteActionItem(id);
      loadData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to delete task');
    }
  };

  // KPI Calculations
  const totalTasks = tasks.length;
  const pendingTasks = tasks.filter((t) => t.status === 'todo').length;
  const inProgressTasks = tasks.filter((t) => t.status === 'in_progress').length;
  const completedTasks = tasks.filter((t) => t.status === 'completed').length;
  const overdueTasks = tasks.filter((t) => {
    if (t.status === 'completed' || !t.due_date) return false;
    return new Date(t.due_date) < new Date(new Date().setHours(0, 0, 0, 0));
  }).length;

  const filteredTasks = tasks.filter((t) => {
    if (filterStatus === 'all') return true;
    if (filterStatus === 'overdue') {
      return t.status !== 'completed' && t.due_date && new Date(t.due_date) < new Date(new Date().setHours(0, 0, 0, 0));
    }
    return t.status === filterStatus;
  });

  const getPriorityStyle = (priority) => {
    switch (priority) {
      case 'urgent': return { bg: '#fee2e2', color: '#dc2626', label: 'Urgent' };
      case 'high': return { bg: '#fef3c7', color: '#d97706', label: 'High' };
      case 'low': return { bg: '#f1f5f9', color: '#64748b', label: 'Low' };
      default: return { bg: '#e0f2fe', color: '#0284c7', label: 'Medium' };
    }
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case 'completed': return { bg: '#dcfce7', color: '#15803d', label: 'Completed' };
      case 'in_progress': return { bg: '#e0e7ff', color: '#4338ca', label: 'In Progress' };
      case 'cancelled': return { bg: '#f1f5f9', color: '#94a3b8', label: 'Cancelled' };
      default: return { bg: '#fef3c7', color: '#b45309', label: 'To Do' };
    }
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 48, height: 48, borderRadius: 16, flexShrink: 0,
              background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.13)',
            }}
          >
            <CheckSquare size={22} style={{ color: '#2563eb' }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 'clamp(1.25rem, 4.5vw, 1.75rem)', fontWeight: 800, color: '#0f172a' }}>Action Tracker</h1>
            <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Assign deliverables, track progress &amp; meet team deadlines</p>
          </div>
        </div>
        {canCreateTask && (
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '10px 20px',
              borderRadius: 12,
              border: 'none',
              background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.25)',
            }}
          >
            <Plus size={18} /> New Action Task
          </button>
        )}
      </div>

      {/* KPI Stats Cards */}
      <div className="stats-grid" style={{ marginBottom: 28 }}>
        <StatCard icon={CheckSquare} label="Total Action Items" value={totalTasks} color="#64748b" bgColor="#f1f5f9" />
        <StatCard icon={Clock} label="In Progress" value={inProgressTasks} color="#4338ca" bgColor="#e0e7ff" />
        <StatCard icon={CheckCircle2} label="Completed Tasks" value={completedTasks} color="#059669" bgColor="var(--accent-emerald-light)" />
        <StatCard icon={AlertCircle} label="Overdue Deadlines" value={overdueTasks} color="#dc2626" bgColor="var(--accent-rose-light)" />
      </div>

      {/* Tabs Filter */}
      <div className="pill-tabs" style={{ marginBottom: 24, alignItems: 'center' }}>
        {[
          { key: 'all', label: 'All Tasks' },
          { key: 'todo', label: 'To Do' },
          { key: 'in_progress', label: 'In Progress' },
          { key: 'completed', label: 'Completed' },
          { key: 'overdue', label: 'Overdue' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilterStatus(tab.key)}
            style={{
              padding: '9px 18px',
              borderRadius: 12,
              fontSize: '0.85rem',
              fontWeight: 700,
              border: filterStatus === tab.key ? 'none' : '1px solid #cbd5e1',
              background: filterStatus === tab.key ? '#0f172a' : '#ffffff',
              color: filterStatus === tab.key ? '#ffffff' : '#64748b',
              cursor: 'pointer',
              boxShadow: filterStatus === tab.key ? '0 4px 12px rgba(15, 23, 42, 0.15)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tasks List */}
      <div style={{ display: 'grid', gap: 16 }}>
        {filteredTasks.map((t) => {
          const priorityStyle = getPriorityStyle(t.priority);
          const statusStyle = getStatusStyle(t.status);
          const isOverdue = t.status !== 'completed' && t.due_date && new Date(t.due_date) < new Date(new Date().setHours(0, 0, 0, 0));

          return (
            <div
              key={t.id}
              className="action-task-card"
              style={{
                borderTop: `3px solid ${priorityStyle.color}`,
                borderLeft: isOverdue ? '1px solid #fca5a5' : '1px solid #e2e8f0',
                borderRight: isOverdue ? '1px solid #fca5a5' : '1px solid #e2e8f0',
                borderBottom: isOverdue ? '1px solid #fca5a5' : '1px solid #e2e8f0',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: priorityStyle.bg, color: priorityStyle.color }}>
                    {priorityStyle.label} Priority
                  </span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: statusStyle.bg, color: statusStyle.color }}>
                    {statusStyle.label}
                  </span>
                  {isOverdue && (
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: '#fee2e2', color: '#dc2626' }}>
                      ⚠️ Overdue
                    </span>
                  )}
                </div>

                <h3 style={{ margin: '0 0 6px 0', fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>{t.title}</h3>
                {t.description && <p style={{ margin: '0 0 12px 0', fontSize: '0.875rem', color: '#475569', lineHeight: 1.5 }}>{t.description}</p>}

                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: '0.8125rem', color: '#64748b' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <User size={15} style={{ color: '#2563eb' }} />
                    <span>Assignee: <strong style={{ color: '#334155' }}>{t.assigned_to_name || 'Unassigned'}</strong></span>
                  </div>
                  {t.created_by_name && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>Assigned By: <strong style={{ color: '#334155' }}>{t.created_by_name}</strong></span>
                    </div>
                  )}
                  {t.due_date && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Calendar size={15} style={{ color: isOverdue ? '#dc2626' : '#64748b' }} />
                      <span>Deadline: <strong style={{ color: isOverdue ? '#dc2626' : '#334155' }}>{t.due_date}</strong></span>
                    </div>
                  )}
                </div>

                {/* Completion Note */}
                {t.completion_note && (
                  <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: '0.8125rem', color: '#334155' }}>
                    <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <MessageSquare size={14} style={{ color: '#2563eb' }} /> Status Note:
                    </div>
                    {t.completion_note}
                  </div>
                )}
              </div>

              {/* Action Controls */}
              <div className="action-task-controls">
                <select
                  value={t.status}
                  onChange={(e) => handleOpenStatusModal(t, e.target.value)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#0f172a',
                    cursor: 'pointer',
                  }}
                >
                  <option value="todo">To Do</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>

                {canCreateTask && (
                  <button
                    onClick={() => handleDeleteTask(t.id)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: '#94a3b8',
                      padding: 4,
                      cursor: 'pointer',
                    }}
                    title="Delete Action Item"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {filteredTasks.length === 0 && !loading && (
          <div style={{ background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 48, textAlign: 'center', color: '#64748b' }}>
            <CheckSquare size={48} style={{ color: '#cbd5e1', marginBottom: 12 }} />
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontWeight: 700 }}>No Action Tasks Found</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.875rem' }}>Assigned tasks and action items will appear here.</p>
          </div>
        )}
      </div>

      {/* New Task Modal */}
      {showAddModal && (
        <Modal title="Create New Action Task" onClose={() => setShowAddModal(false)}>
          <form onSubmit={handleCreateTaskSubmit}>
            <div className="input-group">
              <label className="input-label">Task Title</label>
              <input
                className="input-field"
                placeholder="e.g., Finalize Monthly Payroll Review"
                value={newTaskForm.title}
                onChange={(e) => setNewTaskForm({ ...newTaskForm, title: e.target.value })}
                required
              />
            </div>
            <div className="input-group">
              <label className="input-label">Description / Instructions</label>
              <textarea
                className="input-field"
                rows={3}
                placeholder="Add task instructions or guidelines..."
                value={newTaskForm.description}
                onChange={(e) => setNewTaskForm({ ...newTaskForm, description: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label className="input-label">Assign To Employee</label>
              <select
                className="input-field"
                value={newTaskForm.assigned_to_id}
                onChange={(e) => setNewTaskForm({ ...newTaskForm, assigned_to_id: e.target.value })}
                required
              >
                <option value="">Select Employee...</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.full_name} ({emp.employee_code})</option>
                ))}
              </select>
            </div>
            <div className="form-grid-2">
              <div className="input-group">
                <label className="input-label">Priority</label>
                <select
                  className="input-field"
                  value={newTaskForm.priority}
                  onChange={(e) => setNewTaskForm({ ...newTaskForm, priority: e.target.value })}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Deadline Date</label>
                <input
                  type="date"
                  className="input-field"
                  value={newTaskForm.due_date}
                  onChange={(e) => setNewTaskForm({ ...newTaskForm, due_date: e.target.value })}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Create Task</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Update Status Modal */}
      {showStatusModal && selectedTask && (
        <Modal title="Update Task Status" onClose={() => setShowStatusModal(false)}>
          <form onSubmit={handleStatusSubmit}>
            <div className="input-group">
              <label className="input-label">Status</label>
              <select
                className="input-field"
                value={statusForm.status}
                onChange={(e) => setStatusForm({ ...statusForm, status: e.target.value })}
              >
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Completion / Status Note (Optional)</label>
              <textarea
                className="input-field"
                rows={3}
                placeholder="Add progress note or completion details..."
                value={statusForm.completion_note}
                onChange={(e) => setStatusForm({ ...statusForm, completion_note: e.target.value })}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowStatusModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save Status</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
