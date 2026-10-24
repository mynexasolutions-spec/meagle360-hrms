import { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Search,
  UserCheck,
  Briefcase,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Plus,
  X,
  Check,
  Award,
  Info,
  Clock,
  Sparkles,
  Lock,
} from 'lucide-react';
import { getDirectory, getRoles, getEmployee, updateEmployeeRoles } from '../../api/employees';
import { useAuth } from '../../context/AuthContext';
import Modal from '../../components/Modal';

export default function HiringTeamPage() {
  const { user } = useAuth();
  const isAdmin = user?.role_name === 'Admin' || !!user?.permissions?.['settings:write'];

  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [roles, setRoles] = useState([]);

  // Filter & Search states
  const [activeTab, setActiveTab] = useState('HIRING_TEAM'); // 'HIRING_TEAM' | 'RECRUITERS' | 'INTERVIEWERS' | 'ALL'
  const [search, setSearch] = useState('');
  const [selectedDept, setSelectedDept] = useState('ALL');

  // Modal State for Role Assignment
  const [selectedMember, setSelectedMember] = useState(null);
  const [modalRecruiter, setModalRecruiter] = useState(false);
  const [modalInterviewer, setModalInterviewer] = useState(false);
  const [modalCurrentRoleIds, setModalCurrentRoleIds] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Inline toggle loading state (employeeId -> boolean)
  const [updatingId, setUpdatingId] = useState(null);

  // Alerts
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      setErrorMsg('');
      const [dirRes, rolesRes] = await Promise.all([
        getDirectory(0, 300),
        getRoles(),
      ]);

      setEmployees(dirRes.data || []);
      setRoles(rolesRes.data || []);
    } catch (err) {
      console.error('Failed to load hiring team directory', err);
      setErrorMsg(err.response?.data?.detail || 'Failed to load employees directory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Find recruiter & interviewer roles from company roles
  const recruiterRole = useMemo(() => {
    return roles.find((r) => r.name.toLowerCase() === 'recruiter');
  }, [roles]);

  const interviewerRole = useMemo(() => {
    return roles.find((r) => r.name.toLowerCase() === 'interviewer');
  }, [roles]);

  // Unique departments for filter dropdown
  const departments = useMemo(() => {
    const set = new Set();
    employees.forEach((m) => {
      if (m.department_name) set.add(m.department_name);
    });
    return Array.from(set).sort();
  }, [employees]);

  // Computed members with parsed roles & hiring team flags
  const members = useMemo(() => {
    return employees.map((emp) => {
      const roleNames = emp.role_names || [];
      const isAdm = roleNames.some((r) => r.toLowerCase() === 'admin');
      const isRec = roleNames.some((r) => r.toLowerCase() === 'recruiter');
      const isInt = roleNames.some((r) => r.toLowerCase() === 'interviewer');
      const isHiring = isAdm || isRec || isInt;

      return {
        ...emp,
        is_admin: isAdm,
        is_recruiter: isRec,
        is_interviewer: isInt,
        is_hiring_team: isHiring,
        has_account: emp.account_status !== 'No Account' && emp.account_status !== 'no_account' && !!emp.email,
      };
    });
  }, [employees]);

  // Stats calculation
  const stats = useMemo(() => {
    let recruiters = 0;
    let interviewers = 0;
    let hiringTeam = 0;

    members.forEach((m) => {
      if (m.is_hiring_team) hiringTeam++;
      if (m.is_recruiter || m.is_admin) recruiters++;
      if (m.is_interviewer || m.is_admin) interviewers++;
    });

    return {
      total_employees: members.length,
      total_hiring_team: hiringTeam,
      total_recruiters: recruiters,
      total_interviewers: interviewers,
    };
  }, [members]);

  // Filtered members list
  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      // Tab filter
      if (activeTab === 'HIRING_TEAM' && !m.is_hiring_team) return false;
      if (activeTab === 'RECRUITERS' && !(m.is_recruiter || m.is_admin)) return false;
      if (activeTab === 'INTERVIEWERS' && !(m.is_interviewer || m.is_admin)) return false;

      // Department filter
      if (selectedDept !== 'ALL' && m.department_name !== selectedDept) return false;

      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = m.full_name?.toLowerCase().includes(q);
        const matchEmail = m.email?.toLowerCase().includes(q);
        const matchCode = m.employee_code?.toLowerCase().includes(q);
        const matchDept = m.department_name?.toLowerCase().includes(q);
        if (!matchName && !matchEmail && !matchCode && !matchDept) {
          return false;
        }
      }

      return true;
    });
  }, [members, activeTab, selectedDept, search]);

  // Open modal to assign roles
  const handleOpenAssignModal = async (member) => {
    setSelectedMember(member);
    setModalRecruiter(member.is_recruiter);
    setModalInterviewer(member.is_interviewer);
    setErrorMsg('');

    try {
      setModalLoading(true);
      const empRes = await getEmployee(member.id);
      setModalCurrentRoleIds(empRes.data?.additional_role_ids || []);
    } catch (e) {
      console.error('Failed to fetch full employee profile', e);
    } finally {
      setModalLoading(false);
    }
  };

  // Save roles from modal
  const handleSaveModalRoles = async (e) => {
    e.preventDefault();
    if (!selectedMember) return;
    if (!recruiterRole || !interviewerRole) {
      setErrorMsg('Recruiter or Interviewer role definition missing in system.');
      return;
    }

    try {
      setSaving(true);
      setErrorMsg('');

      // Build updated list of additional role IDs
      let nextRoleIds = modalCurrentRoleIds.filter(
        (id) => id !== recruiterRole.id && id !== interviewerRole.id
      );

      if (modalRecruiter) {
        nextRoleIds.push(recruiterRole.id);
      }
      if (modalInterviewer) {
        nextRoleIds.push(interviewerRole.id);
      }

      await updateEmployeeRoles(selectedMember.id, nextRoleIds);

      // Optimistically update local employee list
      setEmployees((prev) =>
        prev.map((emp) => {
          if (emp.id === selectedMember.id) {
            const currentNames = (emp.role_names || []).filter(
              (n) => n.toLowerCase() !== 'recruiter' && n.toLowerCase() !== 'interviewer'
            );
            if (modalRecruiter) currentNames.push('Recruiter');
            if (modalInterviewer) currentNames.push('Interviewer');
            return {
              ...emp,
              role_names: currentNames,
            };
          }
          return emp;
        })
      );

      setSuccessMsg(`Roles successfully updated for ${selectedMember.full_name}.`);
      setSelectedMember(null);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      console.error('Failed to update member roles', err);
      setErrorMsg(err.response?.data?.detail || 'Failed to update member roles.');
    } finally {
      setSaving(false);
    }
  };

  // Inline toggle for instant switch
  const handleToggleRoleInline = async (member, roleKey) => {
    if (member.is_admin) return; // Admin automatically has full permissions
    if (!recruiterRole || !interviewerRole) {
      setErrorMsg('Recruiter or Interviewer role not found in system.');
      return;
    }

    const targetRole = roleKey === 'recruiter' ? recruiterRole : interviewerRole;
    const isCurrentlyActive = roleKey === 'recruiter' ? member.is_recruiter : member.is_interviewer;
    const turnOn = !isCurrentlyActive;

    try {
      setUpdatingId(member.id);
      setErrorMsg('');

      // Fetch employee's current additional roles
      const empRes = await getEmployee(member.id);
      const currentAdditionalIds = empRes.data?.additional_role_ids || [];

      let updatedRoleIds;
      if (turnOn) {
        updatedRoleIds = Array.from(new Set([...currentAdditionalIds, targetRole.id]));
      } else {
        updatedRoleIds = currentAdditionalIds.filter((id) => id !== targetRole.id);
      }

      await updateEmployeeRoles(member.id, updatedRoleIds);

      // Update in local state
      setEmployees((prev) =>
        prev.map((emp) => {
          if (emp.id === member.id) {
            let roleNames = (emp.role_names || []).filter(
              (n) => n.toLowerCase() !== targetRole.name.toLowerCase()
            );
            if (turnOn) {
              roleNames.push(targetRole.name);
            }
            return {
              ...emp,
              role_names: roleNames,
            };
          }
          return emp;
        })
      );

      setSuccessMsg(
        `Updated ${member.full_name}: ${targetRole.name} is now ${turnOn ? 'Active' : 'Disabled'}.`
      );
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.error('Inline toggle failed', err);
      setErrorMsg(err.response?.data?.detail || 'Failed to update role.');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-gray-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">Hiring Team & Roles</h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
              {stats.total_hiring_team || 0} Team Members
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Assign <strong className="text-gray-700">Recruiter</strong> and <strong className="text-gray-700">Interviewer</strong> roles to company employees. Recruiters can manage job openings and schedule rounds; Interviewers conduct candidate evaluations and submit feedback.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            className="btn btn-secondary inline-flex items-center gap-2 text-sm"
            title="Refresh list"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Success / Error Alerts */}
      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg('')} className="text-emerald-500 hover:text-emerald-700">
            <X size={16} />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} className="text-red-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg('')} className="text-red-500 hover:text-red-700">
            <X size={16} />
          </button>
        </div>
      )}

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Hiring Team */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            <UserCheck size={24} />
          </div>
          <div className="min-w-0">
            <div className="text-2xl font-bold text-gray-900">{stats.total_hiring_team || 0}</div>
            <div className="text-xs font-medium text-gray-500 truncate">Hiring Team Members</div>
            <div className="text-[11px] text-indigo-600 mt-0.5 leading-tight">Recruiters + Interviewers</div>
          </div>
        </div>

        {/* Card 2: Recruiters */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
            <Briefcase size={24} />
          </div>
          <div className="min-w-0">
            <div className="text-2xl font-bold text-gray-900">{stats.total_recruiters || 0}</div>
            <div className="text-xs font-medium text-gray-500 truncate">Recruiter Role</div>
            <div className="text-[11px] text-blue-600 mt-0.5 leading-tight">Manage jobs & rounds</div>
          </div>
        </div>

        {/* Card 3: Interviewers */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
            <Award size={24} />
          </div>
          <div className="min-w-0">
            <div className="text-2xl font-bold text-gray-900">{stats.total_interviewers || 0}</div>
            <div className="text-xs font-medium text-gray-500 truncate">Interviewer Panel</div>
            <div className="text-[11px] text-emerald-600 mt-0.5 leading-tight">Interview panel pool</div>
          </div>
        </div>

        {/* Card 4: Directory Pool */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-600 shrink-0">
            <Users size={24} />
          </div>
          <div className="min-w-0">
            <div className="text-2xl font-bold text-gray-900">{stats.total_employees || 0}</div>
            <div className="text-xs font-medium text-gray-500 truncate">Company Directory</div>
            <div className="text-[11px] text-gray-500 mt-0.5 leading-tight">Active employees pool</div>
          </div>
        </div>
      </div>

      {/* Filter Tabs (Row 1: Full-Width, No Scrollbar) */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setActiveTab('HIRING_TEAM')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
            activeTab === 'HIRING_TEAM'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-300'
          }`}
        >
          <UserCheck size={14} />
          <span>Active Hiring Team</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] ${
              activeTab === 'HIRING_TEAM' ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {stats.total_hiring_team || 0}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('RECRUITERS')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
            activeTab === 'RECRUITERS'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-300'
          }`}
        >
          <Briefcase size={14} />
          <span>Recruiters</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] ${
              activeTab === 'RECRUITERS' ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {stats.total_recruiters || 0}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('INTERVIEWERS')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
            activeTab === 'INTERVIEWERS'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-300'
          }`}
        >
          <Award size={14} />
          <span>Interviewers</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] ${
              activeTab === 'INTERVIEWERS' ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {stats.total_interviewers || 0}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ALL')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
            activeTab === 'ALL'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-300'
          }`}
        >
          <Users size={14} />
          <span>All Employees Directory</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] ${
              activeTab === 'ALL' ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {stats.total_employees || 0}
          </span>
        </button>
      </div>

      {/* Search & Department Filters (Row 2: Dedicated Filter Bar) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-2.5 px-3.5 rounded-xl border border-gray-200 shadow-xs">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, employee code..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50/50"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <label className="text-xs text-gray-500 font-medium whitespace-nowrap">Department:</label>
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="py-1.5 px-3 text-xs rounded-lg border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
          >
            <option value="ALL">All Departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Info Callout for Admin */}
      <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-100 flex items-start gap-3 text-xs text-blue-900">
        <Info size={16} className="text-blue-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-blue-950">How Roles Work in ATS:</span> Employees assigned the{' '}
          <strong className="text-blue-900">Recruiter</strong> role gain access to manage job postings, review applicants, and assign interviewers. Employees tagged as{' '}
          <strong className="text-blue-900">Interviewer</strong> automatically appear in the interviewer dropdown when scheduling rounds, allowing them to access the <em>My Interviews</em> portal and submit evaluation ratings.
        </div>
      </div>

      {/* Main Table View */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-20 text-center">
            <RefreshCw size={24} className="animate-spin text-blue-600 mx-auto mb-2" />
            <div className="text-sm font-semibold text-gray-700">Loading Hiring Team Directory...</div>
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="py-16 text-center text-gray-500">
            <Users size={32} className="mx-auto mb-2 text-gray-300" />
            <div className="text-sm font-medium text-gray-700">No team members found</div>
            <div className="text-xs text-gray-400 mt-1">
              {search || selectedDept !== 'ALL'
                ? 'Try adjusting your search or filters.'
                : 'Switch to the "All Employees Directory" tab to assign roles to employees.'}
            </div>
            {activeTab !== 'ALL' && (
              <button
                type="button"
                onClick={() => setActiveTab('ALL')}
                className="btn btn-secondary text-xs mt-3 inline-flex items-center gap-1.5"
              >
                <Plus size={14} /> Browse All Employees to Assign Roles
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[760px]">
              <thead>
                <tr className="bg-gray-50/75 border-b border-gray-200 text-[11px] font-bold text-gray-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Department & Site</th>
                  <th className="py-3 px-4">Current Roles</th>
                  <th className="py-3 px-4 text-center">Recruiter Role</th>
                  <th className="py-3 px-4 text-center">Interviewer Role</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {filteredMembers.map((member) => {
                  const isUpdating = updatingId === member.id;
                  const initials = member.full_name
                    ?.split(' ')
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2) || 'E';

                  return (
                    <tr
                      key={member.id}
                      className="hover:bg-blue-50/30 transition-colors"
                    >
                      {/* Employee Info */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          {member.photo_url ? (
                            <img
                              src={member.photo_url}
                              alt={member.full_name}
                              className="w-9 h-9 rounded-full object-cover border border-gray-200 shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-sm">
                              {initials}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-900 truncate flex items-center gap-1.5">
                              <span>{member.full_name}</span>
                              {member.is_admin && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                                  Admin
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-gray-400 truncate">
                              {member.employee_code || 'ID: --'} • {member.email || 'No login account'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Department & Site */}
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-gray-800 truncate">
                          {member.department_name || 'General Department'}
                        </div>
                        <div className="text-[11px] text-gray-400 truncate">
                          {member.site_name || 'Main Office'}
                        </div>
                      </td>

                      {/* Current Roles Badges */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1">
                          {member.is_admin && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              Org Admin
                            </span>
                          )}
                          {member.is_recruiter && !member.is_admin && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                              Recruiter
                            </span>
                          )}
                          {member.is_interviewer && !member.is_admin && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Interviewer
                            </span>
                          )}
                          {!member.is_admin && !member.is_recruiter && !member.is_interviewer && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-gray-50 text-gray-500 border border-gray-200">
                              {(member.role_names || []).join(', ') || 'Employee'}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Recruiter Role Toggle */}
                      <td className="py-3.5 px-4 text-center">
                        {member.is_admin ? (
                          <span className="text-[11px] font-semibold text-gray-400" title="Admin has full recruiter privileges">
                            Full Access (Admin)
                          </span>
                        ) : !member.has_account ? (
                          <span className="text-[11px] text-gray-400" title="Employee needs an account invite first">
                            No Account
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={isUpdating}
                            onClick={() => handleToggleRoleInline(member, 'recruiter')}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${
                              member.is_recruiter
                                ? 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                            title={member.is_recruiter ? 'Click to remove Recruiter role' : 'Click to assign Recruiter role'}
                          >
                            {isUpdating ? (
                              <RefreshCw size={11} className="animate-spin" />
                            ) : member.is_recruiter ? (
                              <>
                                <Check size={12} className="text-blue-700" /> Active
                              </>
                            ) : (
                              'Enable'
                            )}
                          </button>
                        )}
                      </td>

                      {/* Interviewer Role Toggle */}
                      <td className="py-3.5 px-4 text-center">
                        {member.is_admin ? (
                          <span className="text-[11px] font-semibold text-gray-400" title="Admin is eligible for any interview panel">
                            Eligible (Admin)
                          </span>
                        ) : !member.has_account ? (
                          <span className="text-[11px] text-gray-400" title="Employee needs an account invite first">
                            No Account
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={isUpdating}
                            onClick={() => handleToggleRoleInline(member, 'interviewer')}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${
                              member.is_interviewer
                                ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                            title={
                              member.is_interviewer
                                ? 'Click to remove Interviewer role'
                                : 'Click to assign Interviewer role'
                            }
                          >
                            {isUpdating ? (
                              <RefreshCw size={11} className="animate-spin" />
                            ) : member.is_interviewer ? (
                              <>
                                <Check size={12} className="text-emerald-700" /> Active
                              </>
                            ) : (
                              'Enable'
                            )}
                          </button>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenAssignModal(member)}
                          className="btn btn-secondary text-xs px-2.5 py-1"
                        >
                          Manage Roles
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

      {/* Role Assignment Modal */}
      {selectedMember && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedMember(null)}
          title={`Manage ATS Roles — ${selectedMember.full_name}`}
        >
          <form onSubmit={handleSaveModalRoles} className="space-y-4">
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0">
                {selectedMember.full_name?.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-gray-900 truncate">{selectedMember.full_name}</div>
                <div className="text-xs text-gray-500 truncate">
                  {selectedMember.department_name || 'General Department'} • {selectedMember.email || 'No email registered'}
                </div>
              </div>
            </div>

            {modalLoading ? (
              <div className="py-8 text-center text-gray-500">
                <RefreshCw size={20} className="animate-spin text-blue-600 mx-auto mb-2" />
                <div className="text-xs">Fetching current role configurations...</div>
              </div>
            ) : selectedMember.is_admin ? (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                <strong>Org Admin:</strong> This account holds the Admin role and automatically possesses full permissions to manage job openings, schedule rounds, assign interviewers, and participate in interview panels.
              </div>
            ) : !selectedMember.has_account ? (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800">
                <strong>Account Pending:</strong> This employee has not been invited to Meagle360 yet. Please go to the <em>Employee Directory</em> to send an invite email before assigning ATS roles.
              </div>
            ) : (
              <div className="space-y-3 pt-1">
                {/* Recruiter Role Option */}
                <label className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50/20 cursor-pointer transition-all">
                  <input
                    type="checkbox"
                    checked={modalRecruiter}
                    onChange={(e) => setModalRecruiter(e.target.checked)}
                    className="mt-1 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                  />
                  <div>
                    <div className="text-sm font-bold text-gray-900 flex items-center gap-2">
                      <span>Recruiter</span>
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-blue-100 text-blue-800">
                        ats:job:manage, ats:applicants:view
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Can create and edit job openings, review candidate resumes, move applications across stages, and create interview rounds.
                    </p>
                  </div>
                </label>

                {/* Interviewer Role Option */}
                <label className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/20 cursor-pointer transition-all">
                  <input
                    type="checkbox"
                    checked={modalInterviewer}
                    onChange={(e) => setModalInterviewer(e.target.checked)}
                    className="mt-1 h-4 w-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500"
                  />
                  <div>
                    <div className="text-sm font-bold text-gray-900 flex items-center gap-2">
                      <span>Interviewer / Panelist</span>
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                        ats:interview:view_own, ats:feedback:submit
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Enables this employee to be selected as interviewer during round creation. They can access <em>My Interviews</em>, confirm calendar slots, and submit scorecard feedback ratings.
                    </p>
                  </div>
                </label>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setSelectedMember(null)}
                className="btn btn-secondary text-xs"
              >
                Close
              </button>
              {selectedMember.has_account && !selectedMember.is_admin && !modalLoading && (
                <button
                  type="submit"
                  disabled={saving}
                  className="btn btn-primary text-xs inline-flex items-center gap-1.5"
                >
                  {saving ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" /> Saving...
                    </>
                  ) : (
                    'Save Roles'
                  )}
                </button>
              )}
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
