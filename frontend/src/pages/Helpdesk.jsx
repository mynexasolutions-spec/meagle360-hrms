import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  getMyTickets,
  getStaffTickets,
  createTicket,
  replyAsEmployee,
  replyAsStaff,
  updateTicketStatus,
} from '../api/helpdesk';
import Modal from '../components/Modal';
import StatCard from '../components/StatCard';
import {
  LifeBuoy,
  Plus,
  Search,
  Filter,
  RefreshCw,
  MessageSquare,
  Clock,
  CheckCircle2,
  AlertCircle,
  Send,
  User,
  ShieldCheck,
  Tag,
  Calendar,
  Layers,
  Check,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

const CATEGORIES = [
  'IT Support',
  'HR Operations',
  'Payroll & Benefits',
  'Workplace & Facilities',
  'Policy & Legal',
  'General Inquiry',
];

const STATUS_CONFIG = {
  open: {
    label: 'Open',
    color: 'var(--accent-amber)',
    bgColor: 'var(--accent-amber-light)',
    badgeClass: 'badge-warning',
    icon: Clock,
  },
  in_progress: {
    label: 'In Progress',
    color: 'var(--accent-blue)',
    bgColor: 'var(--accent-blue-light)',
    badgeClass: 'badge-info',
    icon: RefreshCw,
  },
  resolved: {
    label: 'Resolved',
    color: 'var(--accent-emerald)',
    bgColor: 'var(--accent-emerald-light)',
    badgeClass: 'badge-success',
    icon: CheckCircle2,
  },
  closed: {
    label: 'Closed',
    color: 'var(--text-secondary)',
    bgColor: '#e2e8f0',
    badgeClass: 'badge-secondary',
    icon: Check,
  },
};

export default function Helpdesk() {
  const { user, loading: authLoading } = useAuth();

  // Derived role flags — safe to compute every render (will be correct once authLoading=false)
  const isAdmin = user?.role_name === 'Admin' || !!user?.permissions?.['settings:write'];
  const isManager =
    user?.role_name === 'Manager' ||
    !!user?.permissions?.['leave:approve'] ||
    !!user?.permissions?.['attendance:approve'];
  const isStaff = isAdmin || isManager;

  // Active Tab: 'my-tickets' or 'queue'
  const [tab, setTab] = useState('my-tickets'); // safe default; corrected by effect below
  const [myTickets, setMyTickets] = useState([]);
  const [staffTickets, setStaffTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');

  // Create Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    category: 'IT Support',
    subject: '',
    description: '',
  });
  const [submitting, setSubmitting] = useState(false);

  // Ticket Detail / Thread Modal
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // ✅ KEY FIX: Only run once authLoading is false AND user is set.
  // This ensures isStaff is correctly computed before we fetch data or set the tab.
  useEffect(() => {
    if (authLoading || !user) return; // wait — auth not resolved yet
    const correctTab = isStaff ? 'queue' : 'my-tickets';
    setTab(correctTab);
    loadDataWithRole(isStaff);
  }, [authLoading, user?.id]); // fires when auth finishes, or user changes (login/logout)

  const loadData = async (isManualRefresh = false) => {
    if (authLoading || !user) return;
    return loadDataWithRole(isStaff, isManualRefresh);
  };

  const loadDataWithRole = async (staffMode, isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const promises = [getMyTickets().catch(() => ({ data: [] }))];
      if (staffMode) {
        promises.push(getStaffTickets().catch(() => ({ data: [] })));
      }

      const [myRes, staffRes] = await Promise.all(promises);

      const myData = Array.isArray(myRes?.data) ? myRes.data : (myRes?.data ? [myRes.data] : []);
      setMyTickets(myData);

      if (staffRes) {
        const staffData = Array.isArray(staffRes?.data) ? staffRes.data : (staffRes?.data ? [staffRes.data] : []);
        setStaffTickets(staffData);
      }
    } catch (err) {
      console.error('Failed to load helpdesk data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleCreateTicket = async (e) => {
    e.preventDefault();
    if (!createForm.subject.trim() || !createForm.description.trim()) {
      alert('Please fill out all required fields.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await createTicket({
        category: createForm.category,
        subject: createForm.subject.trim(),
        description: createForm.description.trim(),
      });
      setShowCreateModal(false);
      setCreateForm({ category: 'IT Support', subject: '', description: '' });
      await loadData();
      if (res.data) {
        setSelectedTicket(res.data);
      }
    } catch (err) {
      console.error('Failed to create ticket:', err);
      alert(err.response?.data?.detail || 'Failed to create ticket. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyMessage.trim() || !selectedTicket) return;

    setSendingReply(true);
    try {
      let res;
      if (tab === 'queue' && isStaff) {
        res = await replyAsStaff(selectedTicket.id, { message: replyMessage.trim() });
      } else {
        res = await replyAsEmployee(selectedTicket.id, { message: replyMessage.trim() });
      }

      setReplyMessage('');
      setSelectedTicket(res.data);
      loadData();
    } catch (err) {
      console.error('Failed to send reply:', err);
      alert(err.response?.data?.detail || 'Failed to send reply. Please try again.');
    } finally {
      setSendingReply(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    if (!selectedTicket || !isStaff) return;
    setUpdatingStatus(true);
    try {
      const res = await updateTicketStatus(selectedTicket.id, { status: newStatus });
      setSelectedTicket(res.data);
      loadData();
    } catch (err) {
      console.error('Failed to update status:', err);
      alert(err.response?.data?.detail || 'Failed to update ticket status.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Active tickets depending on selected tab
  const activeTickets = tab === 'queue' && isStaff ? staffTickets : myTickets;

  // Stats calculation
  const totalCount = activeTickets.length;
  const openCount = activeTickets.filter((t) => t.status === 'open').length;
  const inProgressCount = activeTickets.filter((t) => t.status === 'in_progress').length;
  const resolvedCount = activeTickets.filter((t) => t.status === 'resolved' || t.status === 'closed').length;

  // Filtered tickets
  const filteredTickets = activeTickets.filter((ticket) => {
    const matchCategory =
      selectedCategory === 'all' ||
      ticket.category?.toLowerCase() === selectedCategory.toLowerCase();
    const matchStatus = selectedStatus === 'all' || ticket.status === selectedStatus;
    const searchLower = searchQuery.toLowerCase();
    const matchSearch =
      !searchQuery ||
      ticket.subject?.toLowerCase().includes(searchLower) ||
      ticket.description?.toLowerCase().includes(searchLower) ||
      ticket.employee_name?.toLowerCase().includes(searchLower) ||
      ticket.id?.toLowerCase().includes(searchLower);

    return matchCategory && matchStatus && matchSearch;
  });

  const formatDate = (isoString) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* ── Header ────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 'var(--radius-md)',
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
              }}
            >
              <LifeBuoy size={22} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
                HR Helpdesk & Support
              </h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: '2px 0 0 0' }}>
                Raise queries, report workplace issues, and track requests with the support team.
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => loadData(true)}
            disabled={refreshing}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowCreateModal(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
            }}
          >
            <Plus size={18} />
            <span>Raise Ticket</span>
          </button>
        </div>
      </div>

      {/* ── Stat Cards ────────────────────────────────────── */}
      <div className="stats-grid">
        <StatCard
          icon={Layers}
          label="Total Tickets"
          value={loading ? '...' : totalCount}
          color="var(--accent-blue)"
          bgColor="var(--accent-blue-light)"
        />
        <StatCard
          icon={Clock}
          label="Open Tickets"
          value={loading ? '...' : openCount}
          color="var(--accent-amber)"
          bgColor="var(--accent-amber-light)"
        />
        <StatCard
          icon={RefreshCw}
          label="In Progress"
          value={loading ? '...' : inProgressCount}
          color="var(--accent-violet)"
          bgColor="var(--accent-violet-light)"
        />
        <StatCard
          icon={CheckCircle2}
          label="Resolved / Closed"
          value={loading ? '...' : resolvedCount}
          color="var(--accent-emerald)"
          bgColor="var(--accent-emerald-light)"
        />
      </div>

      {/* ── Navigation Tabs (Staff vs Employee) ───────────── */}
      {isStaff && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            borderBottom: '1px solid var(--border-color)',
            paddingBottom: 4,
          }}
        >
          <button
            type="button"
            className={`tab-btn ${tab === 'queue' ? 'active' : ''}`}
            onClick={() => setTab('queue')}
            style={{
              padding: '8px 18px',
              fontWeight: 600,
              fontSize: '0.9rem',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              cursor: 'pointer',
              background: tab === 'queue' ? 'var(--accent-blue-light)' : 'transparent',
              color: tab === 'queue' ? 'var(--accent-blue)' : 'var(--text-secondary)',
              transition: 'all 0.15s ease',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>{isAdmin ? 'All Company Tickets' : 'Team Ticket Queue'}</span>
            {staffTickets.filter((t) => t.status === 'open').length > 0 && (
              <span
                style={{
                  background: 'var(--accent-amber)',
                  color: 'white',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '0.7rem',
                  padding: '2px 7px',
                  fontWeight: 700,
                }}
              >
                {staffTickets.filter((t) => t.status === 'open').length}
              </span>
            )}
          </button>

          <button
            type="button"
            className={`tab-btn ${tab === 'my-tickets' ? 'active' : ''}`}
            onClick={() => setTab('my-tickets')}
            style={{
              padding: '8px 18px',
              fontWeight: 600,
              fontSize: '0.9rem',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              cursor: 'pointer',
              background: tab === 'my-tickets' ? 'var(--accent-blue-light)' : 'transparent',
              color: tab === 'my-tickets' ? 'var(--accent-blue)' : 'var(--text-secondary)',
              transition: 'all 0.15s ease',
            }}
          >
            My Raised Tickets
          </button>
        </div>
      )}

      {/* ── Filters & Search Bar ──────────────────────────── */}
      <div
        className="glass-card"
        style={{
          padding: '16px 20px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: 14,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
            }}
          />
          <input
            type="text"
            className="input-field"
            placeholder={
              tab === 'queue'
                ? 'Search tickets, subject, employee...'
                : 'Search your tickets...'
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: 38, height: 40 }}
          />
        </div>

        {/* Category Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Tag size={15} style={{ color: 'var(--text-muted)' }} />
          <select
            className="input-field"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            style={{ height: 40, minWidth: 160 }}
          >
            <option value="all">All Categories</option>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Filter size={15} style={{ color: 'var(--text-muted)' }} />
          <select
            className="input-field"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            style={{ height: 40, minWidth: 140 }}
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>

      {/* ── Ticket List ───────────────────────────────────── */}
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
            <RefreshCw size={28} className="spin" style={{ margin: '0 auto 12px auto', display: 'block' }} />
            <p>Loading tickets...</p>
          </div>
        ) : filteredTickets.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'var(--accent-blue-light)',
                color: 'var(--accent-blue)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px auto',
              }}
            >
              <LifeBuoy size={28} />
            </div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 6px 0' }}>
              No tickets found
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', maxWidth: 400, margin: '0 auto 20px auto' }}>
              {searchQuery || selectedCategory !== 'all' || selectedStatus !== 'all'
                ? 'Try adjusting your filters or search terms.'
                : tab === 'queue'
                ? 'No support requests from your team at this time.'
                : 'You have not raised any support tickets yet. Click "Raise Ticket" to submit a request.'}
            </p>
            {tab === 'my-tickets' && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowCreateModal(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                <Plus size={16} />
                <span>Raise Ticket</span>
              </button>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-primary)', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '14px 20px', fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Subject & Details
                  </th>
                  <th style={{ padding: '14px 16px', fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Category
                  </th>
                  {tab === 'queue' && (
                    <th style={{ padding: '14px 16px', fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      Raised By
                    </th>
                  )}
                  <th style={{ padding: '14px 16px', fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Status
                  </th>
                  <th style={{ padding: '14px 16px', fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Activity
                  </th>
                  <th style={{ padding: '14px 20px', textAlign: 'right', fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredTickets.map((ticket) => {
                  const statusInfo = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open;
                  const replyCount = ticket.replies ? ticket.replies.length : 0;

                  return (
                    <tr
                      key={ticket.id}
                      onClick={() => setSelectedTicket(ticket)}
                      style={{
                        cursor: 'pointer',
                        transition: 'background 0.15s ease',
                        borderBottom: '1px solid var(--border-color)',
                      }}
                      className="table-row-hover"
                    >
                      {/* Subject & Description snippet */}
                      <td style={{ padding: '16px 20px', maxWidth: 360 }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem', marginBottom: 4 }}>
                          {ticket.subject}
                        </div>
                        <div
                          style={{
                            color: 'var(--text-muted)',
                            fontSize: '0.825rem',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: 320,
                          }}
                        >
                          {ticket.description}
                        </div>
                      </td>

                      {/* Category */}
                      <td style={{ padding: '16px 16px', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '4px 10px',
                            borderRadius: 'var(--radius-full)',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            background: '#f1f5f9',
                            color: '#475569',
                          }}
                        >
                          <Tag size={12} />
                          {ticket.category}
                        </span>
                      </td>

                      {/* Raised By (Queue tab only) */}
                      {tab === 'queue' && (
                        <td style={{ padding: '16px 16px', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: '50%',
                                background: 'var(--accent-blue-light)',
                                color: 'var(--accent-blue)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                              }}
                            >
                              {(ticket.employee_name || 'U').charAt(0)}
                            </div>
                            <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                              {ticket.employee_name || 'Employee'}
                            </span>
                          </div>
                        </td>
                      )}

                      {/* Status */}
                      <td style={{ padding: '16px 16px', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '4px 10px',
                            borderRadius: 'var(--radius-full)',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            background: statusInfo.bgColor,
                            color: statusInfo.color,
                          }}
                        >
                          <statusInfo.icon size={13} />
                          {statusInfo.label}
                        </span>
                      </td>

                      {/* Activity / Date */}
                      <td style={{ padding: '16px 16px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {formatDate(ticket.created_at)}
                        </div>
                        {replyCount > 0 && (
                          <div
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: '0.75rem',
                              color: 'var(--accent-blue)',
                              fontWeight: 600,
                              marginTop: 2,
                            }}
                          >
                            <MessageSquare size={12} />
                            <span>{replyCount} {replyCount === 1 ? 'reply' : 'replies'}</span>
                          </div>
                        )}
                      </td>

                      {/* Action */}
                      <td style={{ padding: '16px 20px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTicket(ticket);
                          }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '6px 12px',
                          }}
                        >
                          <span>View Ticket</span>
                          <ChevronRight size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── CREATE TICKET MODAL ───────────────────────────── */}
      {showCreateModal && (
        <Modal title="Raise Support Ticket" onClose={() => setShowCreateModal(false)}>
          <form onSubmit={handleCreateTicket} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 6 }}>
                Category <span style={{ color: 'var(--accent-rose)' }}>*</span>
              </label>
              <select
                className="input-field"
                value={createForm.category}
                onChange={(e) => setCreateForm({ ...createForm, category: e.target.value })}
                required
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 6 }}>
                Subject / Issue Summary <span style={{ color: 'var(--accent-rose)' }}>*</span>
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g., Software license request, Monitor issue, Leave policy question"
                maxLength={200}
                value={createForm.subject}
                onChange={(e) => setCreateForm({ ...createForm, subject: e.target.value })}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 6 }}>
                Description <span style={{ color: 'var(--accent-rose)' }}>*</span>
              </label>
              <textarea
                className="input-field"
                rows={5}
                placeholder="Please describe your issue or question in detail. Include any relevant error messages or context."
                value={createForm.description}
                onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                required
                style={{ resize: 'vertical' }}
              />
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: 12,
                marginTop: 8,
              }}
            >
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowCreateModal(false)}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submitting}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                {submitting ? (
                  <>
                    <RefreshCw size={16} className="spin" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    <span>Submit Ticket</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── TICKET DETAIL & REPLY THREAD MODAL ───────────── */}
      {selectedTicket && (
        <Modal
          title={`Ticket: ${selectedTicket.subject}`}
          onClose={() => setSelectedTicket(null)}
          closeOnOverlay={false}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Header info bar inside modal */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'var(--bg-primary)',
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '3px 10px',
                    borderRadius: 'var(--radius-full)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    background: '#e2e8f0',
                    color: '#334155',
                  }}
                >
                  <Tag size={12} />
                  {selectedTicket.category}
                </span>

                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Created: {formatDate(selectedTicket.created_at)}
                </span>

                {selectedTicket.employee_name && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    Raised by: {selectedTicket.employee_name}
                  </span>
                )}
              </div>

              {/* Status Badge or Staff Status Dropdown */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {isStaff && tab === 'queue' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      Status:
                    </span>
                    <select
                      className="input-field"
                      value={selectedTicket.status}
                      disabled={updatingStatus}
                      onChange={(e) => handleStatusChange(e.target.value)}
                      style={{
                        padding: '4px 8px',
                        height: 32,
                        fontSize: '0.8rem',
                        fontWeight: 600,
                      }}
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>
                ) : (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 12px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      background: STATUS_CONFIG[selectedTicket.status]?.bgColor || '#f1f5f9',
                      color: STATUS_CONFIG[selectedTicket.status]?.color || '#475569',
                    }}
                  >
                    {STATUS_CONFIG[selectedTicket.status]?.label || selectedTicket.status}
                  </span>
                )}
              </div>
            </div>

            {/* Original Problem Description Box */}
            <div
              style={{
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                padding: '14px 16px',
                background: 'var(--bg-secondary)',
              }}
            >
              <div
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  marginBottom: 6,
                  letterSpacing: '0.04em',
                }}
              >
                Initial Issue Description
              </div>
              <p
                style={{
                  fontSize: '0.92rem',
                  lineHeight: 1.6,
                  color: 'var(--text-primary)',
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {selectedTicket.description}
              </p>
            </div>

            {/* Conversation Thread */}
            <div>
              <div
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: 'var(--text-secondary)',
                  marginBottom: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <MessageSquare size={16} />
                <span>Conversation History ({selectedTicket.replies?.length || 0})</span>
              </div>

              <div
                style={{
                  maxHeight: 280,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  paddingRight: 4,
                  paddingBottom: 4,
                }}
              >
                {!selectedTicket.replies || selectedTicket.replies.length === 0 ? (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '24px 12px',
                      background: 'var(--bg-primary)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--text-muted)',
                      fontSize: '0.85rem',
                    }}
                  >
                    No replies yet. Send a message below to start the conversation.
                  </div>
                ) : (
                  selectedTicket.replies.map((reply) => {
                    const isStaffRole =
                      reply.author_role === 'admin' ||
                      reply.author_role === 'manager' ||
                      reply.author_role === 'support';

                    let authorName = '';
                    let roleBadge = null;
                    let avatarLetter = 'U';
                    let isHighlightedBubble = false;

                    if (isStaff) {
                      // Admin or Manager viewing: Show EXACT person name and their role
                      authorName =
                        reply.author_name && reply.author_name !== 'Support Team'
                          ? reply.author_name
                          : reply.author_role === 'admin'
                          ? 'Admin'
                          : reply.author_role === 'manager'
                          ? 'Manager'
                          : 'Employee';

                      avatarLetter = authorName.charAt(0).toUpperCase();
                      isHighlightedBubble = isStaffRole;

                      if (reply.author_role === 'admin') {
                        roleBadge = {
                          label: 'Admin',
                          bg: 'var(--accent-rose-light)',
                          color: 'var(--accent-rose)',
                        };
                      } else if (reply.author_role === 'manager') {
                        roleBadge = {
                          label: 'Manager',
                          bg: 'var(--accent-amber-light)',
                          color: 'var(--accent-amber)',
                        };
                      } else {
                        roleBadge = {
                          label: 'Employee',
                          bg: '#e2e8f0',
                          color: 'var(--text-secondary)',
                        };
                      }
                    } else {
                      // Regular employee viewing: Staff replies are anonymized to Support Team
                      if (isStaffRole || reply.author_name === 'Support Team') {
                        authorName = 'Support Team';
                        avatarLetter = 'S';
                        isHighlightedBubble = true;
                        roleBadge = {
                          label: 'Support',
                          bg: 'var(--accent-blue)',
                          color: 'white',
                        };
                      } else {
                        authorName = reply.author_name || user?.full_name || 'You';
                        avatarLetter = authorName.charAt(0).toUpperCase();
                        isHighlightedBubble = false;
                        roleBadge = null;
                      }
                    }

                    return (
                      <div
                        key={reply.id}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                          padding: '12px 14px',
                          borderRadius: 'var(--radius-md)',
                          background: isHighlightedBubble
                            ? 'var(--accent-blue-light)'
                            : 'var(--bg-primary)',
                          border: `1px solid ${
                            isHighlightedBubble
                              ? 'rgba(59, 130, 246, 0.2)'
                              : 'var(--border-color)'
                          }`,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div
                              style={{
                                width: 22,
                                height: 22,
                                borderRadius: '50%',
                                background: isHighlightedBubble
                                  ? (roleBadge?.color === 'var(--accent-rose)' ? 'var(--accent-rose)' : 'var(--accent-blue)')
                                  : 'var(--text-secondary)',
                                color: 'white',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.65rem',
                                fontWeight: 700,
                              }}
                            >
                              {avatarLetter}
                            </div>
                            <span
                              style={{
                                fontWeight: 600,
                                fontSize: '0.825rem',
                                color: 'var(--text-primary)',
                              }}
                            >
                              {authorName}
                            </span>
                            {roleBadge && (
                              <span
                                style={{
                                  fontSize: '0.68rem',
                                  fontWeight: 700,
                                  textTransform: 'uppercase',
                                  padding: '1px 6px',
                                  borderRadius: 'var(--radius-full)',
                                  background: roleBadge.bg,
                                  color: roleBadge.color,
                                }}
                              >
                                {roleBadge.label}
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            {formatDate(reply.created_at)}
                          </span>
                        </div>

                        <div
                          style={{
                            fontSize: '0.88rem',
                            color: 'var(--text-primary)',
                            lineHeight: 1.5,
                            marginTop: 4,
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {reply.message}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Reply Input Form */}
            {selectedTicket.status === 'closed' ? (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-md)',
                  background: '#f1f5f9',
                  color: 'var(--text-secondary)',
                  fontSize: '0.85rem',
                  textAlign: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <Check size={16} style={{ color: 'var(--accent-emerald)' }} />
                <span>This ticket has been marked as closed.</span>
              </div>
            ) : (
              <form onSubmit={handleSendReply} style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                <textarea
                  className="input-field"
                  rows={2}
                  placeholder="Type a response or update..."
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  style={{ flex: 1, resize: 'none', padding: '10px 12px' }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendReply(e);
                    }
                  }}
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={sendingReply || !replyMessage.trim()}
                  style={{
                    height: 42,
                    padding: '0 16px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {sendingReply ? (
                    <RefreshCw size={16} className="spin" />
                  ) : (
                    <>
                      <Send size={16} />
                      <span>Send</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
