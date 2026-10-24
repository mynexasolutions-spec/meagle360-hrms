import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  UserCheck,
  X,
  AlertCircle,
  CheckCircle2,
  Briefcase,
  Building2,
  Calendar,
  Mail,
  ShieldCheck,
  ArrowRight,
  ExternalLink,
  Copy,
  Check,
  Shield,
  MapPin,
} from 'lucide-react';
import { convertToEmployee, getAtsDropdowns } from '../../api/ats';

export default function ConvertToEmployeeModal({
  applicationId,
  candidate,
  job,
  latestOffer,
  alreadyConvertedEmployeeId,
  onClose,
  onSuccess,
}) {
  const [loading, setLoading] = useState(false);
  const [dropdowns, setDropdowns] = useState({ departments: [], designations: [], roles: [], sites: [] });
  const [errorMessage, setErrorMessage] = useState('');
  const [successData, setSuccessData] = useState(null);
  const [copied, setCopied] = useState(false);

  // Form fields
  const [employeeCode, setEmployeeCode] = useState('');
  const [dateOfHire, setDateOfHire] = useState(
    latestOffer?.joining_date || new Date().toISOString().split('T')[0]
  );
  const [departmentId, setDepartmentId] = useState(job?.department_id || '');
  const [designationId, setDesignationId] = useState(job?.designation_id || '');
  const [siteId, setSiteId] = useState('');
  const [roleId, setRoleId] = useState('');
  const [createUserAccount, setCreateUserAccount] = useState(true);

  // Load departments, designations, roles, sites
  useEffect(() => {
    const fetchDropdowns = async () => {
      try {
        const res = await getAtsDropdowns();
        const data = res.data || { departments: [], designations: [], roles: [], sites: [] };
        setDropdowns(data);

        // Pre-select 'Employee' role if available
        if (data.roles && data.roles.length > 0) {
          const defaultRole = data.roles.find((r) => r.name.toLowerCase() === 'employee') || data.roles[0];
          if (defaultRole) {
            setRoleId(defaultRole.id);
          }
        }
      } catch (err) {
        console.error('Failed to load ATS dropdowns', err);
      }
    };
    fetchDropdowns();
  }, []);

  const handleCopyLink = () => {
    if (!successData?.invite_token) return;
    const link = `${window.location.origin}/set-password?token=${successData.invite_token}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!dateOfHire) {
      setErrorMessage('Date of hire is required.');
      return;
    }

    try {
      setLoading(true);
      setErrorMessage('');
      const payload = {
        employee_code: employeeCode.trim() || null,
        department_id: departmentId || null,
        designation_id: designationId || null,
        site_id: siteId || null,
        role_id: roleId || null,
        date_of_hire: dateOfHire,
        create_user_account: createUserAccount,
      };

      const res = await convertToEmployee(applicationId, payload);
      setSuccessData(res.data);
      if (onSuccess) {
        onSuccess(res.data);
      }
    } catch (err) {
      console.error('Failed to convert candidate to employee', err);
      setErrorMessage(
        err.response?.data?.detail || 'Failed to onboard candidate as employee.'
      );
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden border border-gray-200 animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-emerald-50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-inner">
              <UserCheck size={22} />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">
                Onboard Candidate as Employee
              </h3>
              <p className="text-xs text-gray-500">
                Convert <strong>{candidate?.full_name}</strong> into an active employee & invite to HRMS.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-5 text-xs text-gray-700 max-h-[80vh] overflow-y-auto">
          {/* Already converted idempotency alert */}
          {alreadyConvertedEmployeeId && !successData && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-3">
              <ShieldCheck size={20} className="text-blue-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-bold text-blue-900 block">
                  Already Converted to Employee
                </span>
                <p className="text-blue-700">
                  This candidate has already been onboarded into Meagle360 HRMS. Idempotent protection prevents duplicate employee records.
                </p>
              </div>
            </div>
          )}

          {/* Success screen */}
          {successData ? (
            <div className="py-4 text-center space-y-4">
              <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle2 size={32} />
              </div>
              <div className="space-y-1">
                <h4 className="text-lg font-bold text-gray-900">
                  Candidate Successfully Hired & Onboarded!
                </h4>
                <p className="text-xs text-gray-600 max-w-sm mx-auto">
                  {successData.message}
                </p>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full font-semibold text-[11px] mt-1 border border-emerald-200">
                  <Check size={13} />
                  <span>Applicant moved to <strong>Hired</strong> stage in ATS</span>
                </div>
              </div>

              {/* Status Notice */}
              {successData.invite_sent ? (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-left flex items-start gap-2.5 text-xs">
                  <Mail size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Setup Email Sent</span>
                    <p className="text-[11px] text-emerald-700">
                      An onboarding invite has been sent to <strong>{successData.email || candidate?.email}</strong>. The setup link expires in 48 hours.
                    </p>
                  </div>
                </div>
              ) : successData.invite_token ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-left flex items-start gap-2.5 text-xs">
                  <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Account Created (Share Link Manually)</span>
                    <p className="text-[11px] text-amber-700">
                      Account created for <strong>{successData.email || candidate?.email}</strong>. Email delivery was unavailable, so please copy the setup link below and share it directly.
                    </p>
                  </div>
                </div>
              ) : null}

              {/* Fallback Copy Link Box (same pattern as Employee Directory Invite) */}
              {successData.invite_token && (
                <div className="space-y-1.5 text-left bg-gray-50 p-3.5 rounded-xl border border-gray-200">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-700 text-xs">Direct Password Setup Link</span>
                    <span className="text-[10px] text-gray-400">Valid for 48 hours</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      type="text"
                      value={`${window.location.origin}/set-password?token=${successData.invite_token}`}
                      className="w-full text-xs p-2.5 bg-white border border-gray-300 rounded-xl font-mono text-gray-800 select-all focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className={`btn text-xs py-2.5 px-3.5 shrink-0 inline-flex items-center gap-1.5 font-semibold rounded-xl border transition-all ${
                        copied
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                      }`}
                    >
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                      <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Employee Summary Card */}
              <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-200 max-w-md mx-auto text-left space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">Employee Code:</span>
                  <strong className="text-gray-900 font-mono">{successData.employee_code}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Full Name:</span>
                  <strong className="text-gray-900">{successData.full_name}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Date of Hire:</span>
                  <strong className="text-gray-900">{successData.date_of_hire}</strong>
                </div>
                {successData.job_auto_closed && (
                  <div className="p-2 bg-purple-50 text-purple-700 rounded-lg text-[11px] font-semibold">
                    ✓ Job Opening auto-closed (all positions filled).
                  </div>
                )}
              </div>

              <div className="pt-2 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-secondary text-xs py-2 px-4"
                >
                  Close & Refresh ATS
                </button>
                <a
                  href="/employees"
                  className="btn btn-primary text-xs py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white inline-flex items-center gap-1.5"
                >
                  <span>Go to Employee Directory</span>
                  <ArrowRight size={14} />
                </a>
              </div>
            </div>
          ) : (
            /* Conversion Form */
            <form onSubmit={handleSubmit} className="space-y-4">
              {errorMessage && (
                <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Candidate Quick Info Card */}
              <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-200 grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[11px] text-gray-400 font-semibold uppercase block">Candidate Name</span>
                  <strong className="text-gray-900">{candidate?.full_name}</strong>
                </div>
                <div>
                  <span className="text-[11px] text-gray-400 font-semibold uppercase block">Login Email</span>
                  <span className="text-gray-900 font-medium truncate block">{candidate?.email}</span>
                </div>
                <div>
                  <span className="text-[11px] text-gray-400 font-semibold uppercase block">Offered Role</span>
                  <span className="text-purple-700 font-semibold block">
                    {latestOffer?.designation || job?.title}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-gray-400 font-semibold uppercase block">Offered CTC</span>
                  <span className="text-gray-900 font-semibold block">
                    {latestOffer ? `₹${latestOffer.ctc?.toLocaleString('en-IN')}` : 'Not specified'}
                  </span>
                </div>
              </div>

              {/* Input Fields Row 1 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 font-bold mb-1">
                    Employee Code <span className="text-gray-400 font-normal">(Auto if blank)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. EMP-0042"
                    value={employeeCode}
                    onChange={(e) => setEmployeeCode(e.target.value)}
                    className="w-full p-2.5 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-gray-700 font-bold mb-1">
                    Date of Hire / Joining <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={dateOfHire}
                    onChange={(e) => setDateOfHire(e.target.value)}
                    className="w-full p-2.5 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Input Fields Row 2 (Department & Designation) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 font-bold mb-1">Department</label>
                  <select
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                    className="w-full p-2.5 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Select Department (or Default)</option>
                    {dropdowns.departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-gray-700 font-bold mb-1">Designation</label>
                  <select
                    value={designationId}
                    onChange={(e) => setDesignationId(e.target.value)}
                    className="w-full p-2.5 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Select Designation (or Default)</option>
                    {dropdowns.designations.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Input Fields Row 3 (Role & Site/Location) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 font-bold mb-1">System Role</label>
                  <select
                    value={roleId}
                    onChange={(e) => setRoleId(e.target.value)}
                    className="w-full p-2.5 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Default (Employee)</option>
                    {dropdowns.roles?.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-gray-700 font-bold mb-1">Site / Work Location</label>
                  <select
                    value={siteId}
                    onChange={(e) => setSiteId(e.target.value)}
                    className="w-full p-2.5 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Select Site (Optional)</option>
                    {dropdowns.sites?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Login Account Checkbox */}
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl flex items-start gap-3">
                <input
                  type="checkbox"
                  id="create_user_acc"
                  checked={createUserAccount}
                  onChange={(e) => setCreateUserAccount(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500 mt-0.5"
                />
                <label htmlFor="create_user_acc" className="cursor-pointer space-y-0.5">
                  <span className="font-bold text-gray-800 block">
                    Create User Account & Trigger Invite Flow
                  </span>
                  <span className="text-gray-500 block text-[11px]">
                    Creates credentials, sends welcome setup email, and transitions application into the <strong>Hired</strong> stage.
                  </span>
                </label>
              </div>

              <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-secondary text-xs py-2 px-4"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-primary text-xs py-2 px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm inline-flex items-center gap-1.5"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <UserCheck size={15} />
                  )}
                  <span>{loading ? 'Converting & Hiring...' : 'Confirm & Convert to Employee'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
