import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Printer,
  X,
  FileCheck,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Plus,
  ChevronDown,
  Building2,
  Calendar,
  Briefcase,
  DollarSign,
  User,
  History,
} from 'lucide-react';
import {
  createOffer,
  getOffers,
  updateOfferStatus,
  getOfferPrintData,
} from '../../api/ats';

export default function OfferLetterModal({
  applicationId,
  candidateName,
  jobTitle,
  onClose,
  onConverted,
  onOpenConvertModal,
  canManageOffers = true,
  canConvertEmployee = true,
}) {
  const [loading, setLoading] = useState(true);
  const [offers, setOffers] = useState([]);
  const [selectedOfferId, setSelectedOfferId] = useState(null);
  const [printData, setPrintData] = useState(null);
  const [viewMode, setViewMode] = useState('preview'); // 'preview' | 'create_version'
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Status modal state
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState('Approved');
  const [declinedReason, setDeclinedReason] = useState('');
  const [statusNote, setStatusNote] = useState('');

  // New version form state
  const [formDesignation, setFormDesignation] = useState(jobTitle || '');
  const [formCtc, setFormCtc] = useState('');
  const [formJoiningDate, setFormJoiningDate] = useState('');
  const [formProbationMonths, setFormProbationMonths] = useState(3);
  const [formValidityDate, setFormValidityDate] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formTemplate, setFormTemplate] = useState('');

  const printableAreaRef = useRef(null);

  // Load offers list
  const loadOffers = async () => {
    try {
      setLoading(true);
      const res = await getOffers(applicationId);
      const data = res.data || [];
      setOffers(data);

      if (data.length > 0) {
        // Default to latest version
        const latest = data[0];
        setSelectedOfferId(latest.id);
        await loadPrintData(latest.id);
      } else {
        // No offers exist yet, switch to create mode
        setViewMode('create_version');
      }
    } catch (err) {
      console.error('Failed to load offers', err);
      setErrorMessage(err.response?.data?.detail || 'Failed to load offers.');
    } finally {
      setLoading(false);
    }
  };

  const loadPrintData = async (offerId) => {
    try {
      const res = await getOfferPrintData(offerId);
      setPrintData(res.data);
    } catch (err) {
      console.error('Failed to load offer print data', err);
    }
  };

  useEffect(() => {
    if (applicationId) {
      loadOffers();
    }
  }, [applicationId]);

  // Handle offer selection change
  const handleSelectOffer = async (id) => {
    setSelectedOfferId(id);
    setViewMode('preview');
    await loadPrintData(id);
  };

  // Handle native browser print
  const handlePrint = () => {
    window.print();
  };

  // Submit new offer version
  const handleCreateOffer = async (e) => {
    e.preventDefault();
    if (!formCtc || !formJoiningDate || !formDesignation) {
      setErrorMessage('Please fill in Designation, CTC, and Joining Date.');
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage('');
      const payload = {
        designation: formDesignation.trim(),
        ctc: parseFloat(formCtc),
        joining_date: formJoiningDate,
        probation_period_months: parseInt(formProbationMonths, 10) || 3,
        validity_date: formValidityDate || null,
        notes: formNotes || null,
        offer_letter_template: formTemplate || null,
      };

      const res = await createOffer(applicationId, payload);
      setSuccessMessage(`Offer version ${res.data.version_number} created successfully.`);
      await loadOffers();
      setViewMode('preview');
    } catch (err) {
      console.error('Failed to create offer', err);
      setErrorMessage(err.response?.data?.detail || 'Failed to create offer.');
    } finally {
      setActionLoading(false);
    }
  };

  // Update offer status
  const handleStatusSubmit = async (e) => {
    e.preventDefault();
    if (!selectedOfferId) return;

    try {
      setActionLoading(true);
      setErrorMessage('');
      await updateOfferStatus(selectedOfferId, {
        status: newStatus,
        declined_reason: newStatus === 'Declined' ? declinedReason : null,
        notes: statusNote || null,
      });

      setShowStatusModal(false);
      setSuccessMessage(`Offer status updated to ${newStatus}.`);
      await loadOffers();
      if (selectedOfferId) await loadPrintData(selectedOfferId);
    } catch (err) {
      console.error('Failed to update status', err);
      setErrorMessage(err.response?.data?.detail || 'Failed to update offer status.');
    } finally {
      setActionLoading(false);
    }
  };

  const currentOffer = offers.find((o) => o.id === selectedOfferId);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Draft':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">Draft</span>;
      case 'Approved':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">Approved</span>;
      case 'Sent':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">Sent to Candidate</span>;
      case 'Accepted':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">Accepted</span>;
      case 'Declined':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">Declined</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">{status}</span>;
    }
  };

  return (
    <>
      {/* ── CSS for clean browser printing ────────────────── */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #offer-letter-printable, #offer-letter-printable * {
            visibility: visible !important;
          }
          #offer-letter-printable {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 24px !important;
            box-shadow: none !important;
            border: none !important;
            background: white !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {createPortal(
        <>
          <div className="fixed inset-0 z-[350] flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm overflow-y-auto no-print">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden border border-gray-200">
          {/* Modal Header */}
          <div className="p-4 sm:p-5 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shadow-inner">
                <FileCheck size={22} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base sm:text-lg font-bold text-gray-900">
                    Offer Letter Management
                  </h3>
                  {currentOffer && getStatusBadge(currentOffer.status)}
                </div>
                <p className="text-xs text-gray-500">
                  Candidate: <strong className="text-gray-800">{candidateName}</strong> • Job: {jobTitle}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Print / Save PDF Button */}
              {viewMode === 'preview' && printData && (
                <button
                  type="button"
                  onClick={handlePrint}
                  className="btn btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5 shadow-sm hover:bg-gray-100"
                  title="Print / Save PDF (Native Browser Print)"
                >
                  <Printer size={15} className="text-gray-700" />
                  <span className="font-semibold">Print / Save PDF</span>
                </button>
              )}

              {/* Convert to Employee Action */}
              {canConvertEmployee && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (onOpenConvertModal) onOpenConvertModal();
                  }}
                  className="btn btn-primary text-xs py-2 px-3.5 inline-flex items-center gap-1.5 shadow-sm bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <CheckCircle2 size={15} />
                  <span className="font-semibold">Convert to Employee</span>
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors ml-1"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Subheader / Tabs & Version Switcher */}
          <div className="px-5 py-2.5 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
            {/* Version Switcher */}
            <div className="flex items-center gap-2">
              <span className="text-gray-500 font-semibold uppercase tracking-wider text-[11px]">
                Version:
              </span>
              {offers.length === 0 ? (
                <span className="text-gray-400 italic">No offers yet</span>
              ) : (
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  {offers.map((off) => (
                    <button
                      key={off.id}
                      type="button"
                      onClick={() => handleSelectOffer(off.id)}
                      className={`px-3 py-1 rounded-lg font-bold text-xs transition-all ${
                        selectedOfferId === off.id && viewMode === 'preview'
                          ? 'bg-purple-600 text-white shadow-sm'
                          : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      v{off.version_number} ({off.status})
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Mode Controls */}
            <div className="flex items-center gap-2">
              {canManageOffers && viewMode === 'preview' && currentOffer && (
                <button
                  type="button"
                  onClick={() => {
                    setNewStatus(currentOffer.status);
                    setShowStatusModal(true);
                  }}
                  className="btn btn-secondary text-xs py-1.5 px-3 font-semibold text-purple-700 border-purple-200 hover:bg-purple-50"
                >
                  Update Status
                </button>
              )}

              {canManageOffers && (
                <button
                  type="button"
                  onClick={() => {
                    if (viewMode === 'create_version') {
                      setViewMode('preview');
                    } else {
                      // Pre-fill from current offer
                      if (currentOffer) {
                        setFormDesignation(currentOffer.designation);
                        setFormCtc(currentOffer.ctc);
                        setFormJoiningDate(currentOffer.joining_date || '');
                        setFormProbationMonths(currentOffer.probation_period_months || 3);
                        setFormValidityDate(currentOffer.validity_date || '');
                        setFormNotes(currentOffer.notes || '');
                      }
                      setViewMode('create_version');
                    }
                  }}
                  className={`text-xs py-1.5 px-3 rounded-lg font-semibold inline-flex items-center gap-1 transition-all ${
                    viewMode === 'create_version'
                      ? 'bg-gray-200 text-gray-800'
                      : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'
                  }`}
                >
                  <Plus size={14} />
                  <span>{viewMode === 'create_version' ? 'Back to Preview' : 'New Offer Version'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Feedback alerts */}
          {errorMessage && (
            <div className="m-4 p-3 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs font-semibold flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} />
                <span>{errorMessage}</span>
              </div>
              <button onClick={() => setErrorMessage('')} className="text-red-500 hover:text-red-700">
                <X size={14} />
              </button>
            </div>
          )}

          {successMessage && (
            <div className="m-4 p-3 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-semibold flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} />
                <span>{successMessage}</span>
              </div>
              <button onClick={() => setSuccessMessage('')} className="text-emerald-500 hover:text-emerald-700">
                <X size={14} />
              </button>
            </div>
          )}

          {/* Modal Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-gray-100">
            {loading ? (
              <div className="py-24 text-center text-gray-500">
                <div className="inline-block w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mb-3"></div>
                <p className="text-sm font-medium">Loading offer data...</p>
              </div>
            ) : viewMode === 'create_version' ? (
              /* ── Create / Revise Offer Form ─────────────────────── */
              <div className="bg-white rounded-2xl border border-gray-200 p-6 max-w-2xl mx-auto shadow-sm space-y-5">
                <div className="border-b border-gray-100 pb-3">
                  <h4 className="text-base font-bold text-gray-900">
                    {offers.length === 0 ? 'Create Initial Offer Letter' : `Create Offer Version ${offers.length + 1}`}
                  </h4>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Configure official compensation, role, joining timeline, and terms for <strong>{candidateName}</strong>.
                  </p>
                </div>

                <form onSubmit={handleCreateOffer} className="space-y-4 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-gray-700 font-bold mb-1">
                        Offered Designation <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formDesignation}
                        onChange={(e) => setFormDesignation(e.target.value)}
                        placeholder="e.g. Senior Software Engineer"
                        className="w-full p-2.5 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>

                    <div>
                      <label className="block text-gray-700 font-bold mb-1">
                        Annual CTC (₹ INR) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="1"
                        required
                        value={formCtc}
                        onChange={(e) => setFormCtc(e.target.value)}
                        placeholder="e.g. 1200000"
                        className="w-full p-2.5 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                      {formCtc > 0 && (
                        <span className="text-[11px] text-gray-500 mt-1 block">
                          Monthly Gross: ~₹{Math.round(formCtc / 12).toLocaleString('en-IN')} / month
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-gray-700 font-bold mb-1">
                        Date of Joining <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        required
                        value={formJoiningDate}
                        onChange={(e) => setFormJoiningDate(e.target.value)}
                        className="w-full p-2.5 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>

                    <div>
                      <label className="block text-gray-700 font-bold mb-1">
                        Probation Period (Months)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="24"
                        value={formProbationMonths}
                        onChange={(e) => setFormProbationMonths(e.target.value)}
                        className="w-full p-2.5 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>

                    <div>
                      <label className="block text-gray-700 font-bold mb-1">
                        Offer Validity Date
                      </label>
                      <input
                        type="date"
                        value={formValidityDate}
                        onChange={(e) => setFormValidityDate(e.target.value)}
                        className="w-full p-2.5 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-gray-700 font-bold mb-1">
                      Internal Notes / Special Allowances
                    </label>
                    <textarea
                      rows={2}
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      placeholder="e.g. Relocation allowance of ₹50,000 provided, subject to 1-year retention."
                      className="w-full p-2.5 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-3">
                    {offers.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setViewMode('preview')}
                        className="btn btn-secondary text-xs py-2 px-4"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={actionLoading}
                      className="btn btn-primary text-xs py-2 px-5 bg-purple-600 hover:bg-purple-700 text-white font-semibold"
                    >
                      {actionLoading ? 'Saving...' : 'Generate Offer Letter'}
                    </button>
                  </div>
                </form>
              </div>
            ) : printData ? (
              /* ── Browser-Print Friendly Offer Letter Preview Document ─ */
              <div
                id="offer-letter-printable"
                ref={printableAreaRef}
                className="bg-white rounded-2xl border border-gray-200 shadow-md max-w-4xl mx-auto p-8 sm:p-12 text-gray-900 leading-relaxed font-sans"
              >
                {/* Letterhead Header */}
                <div className="flex items-start justify-between border-b-2 border-gray-900 pb-6 mb-8">
                  <div className="flex items-center gap-4">
                    {printData.company?.logo_url ? (
                      <img
                        src={printData.company.logo_url}
                        alt={printData.company.name}
                        className="h-14 w-auto object-contain rounded-lg"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-purple-600 text-white font-bold text-xl flex items-center justify-center">
                        {printData.company?.name?.[0] || 'M'}
                      </div>
                    )}
                    <div>
                      <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">
                        {printData.company?.name || 'Company'}
                      </h1>
                      <p className="text-xs text-gray-500">
                        Official Employment Offer Letter • Version {printData.version_number}
                      </p>
                    </div>
                  </div>

                  <div className="text-right text-xs text-gray-600 space-y-0.5">
                    <p className="font-semibold text-gray-800">Date: {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                    <p>Reference: OFF-{printData.offer_id?.slice(0, 8)?.toUpperCase()}</p>
                    {printData.validity_date && (
                      <p className="text-red-600 font-semibold">Valid Until: {printData.validity_date}</p>
                    )}
                  </div>
                </div>

                {/* Candidate Address Block */}
                <div className="mb-6 text-xs text-gray-700 space-y-1">
                  <p className="font-bold text-gray-900 text-sm">To,</p>
                  <p className="font-bold text-gray-900 text-base">{printData.candidate?.full_name}</p>
                  <p>Email: {printData.candidate?.email}</p>
                  {printData.candidate?.phone && <p>Phone: {printData.candidate?.phone}</p>}
                  {printData.candidate?.current_location && (
                    <p>Location: {printData.candidate?.current_location}</p>
                  )}
                </div>

                {/* Formal Salutation & Intro */}
                <div className="space-y-3 text-xs text-gray-700 mb-6">
                  <p className="font-bold text-sm text-gray-900">
                    Subject: Offer of Employment for the position of {printData.designation}
                  </p>
                  <p>Dear <strong>{printData.candidate?.full_name}</strong>,</p>
                  <p>
                    On behalf of <strong>{printData.company?.name}</strong>, we are thrilled to offer you the position of{' '}
                    <strong>{printData.designation}</strong> in our {printData.job?.department_name || 'Engineering'} team.
                    We were thoroughly impressed with your experience and believe your skills will be instrumental in our mission.
                  </p>
                  <p>
                    This letter outlines the primary terms and compensation package of your employment with us.
                  </p>
                </div>

                {/* Compensation & Terms Table */}
                <div className="mb-6 border border-gray-300 rounded-xl overflow-hidden text-xs">
                  <div className="bg-gray-100 px-4 py-2.5 font-bold text-gray-900 uppercase tracking-wider text-[11px] border-b border-gray-300">
                    Employment & Compensation Summary
                  </div>
                  <table className="w-full text-left">
                    <tbody className="divide-y divide-gray-200">
                      <tr>
                        <td className="py-2.5 px-4 font-semibold text-gray-600 w-1/3 bg-gray-50/50">Position / Title</td>
                        <td className="py-2.5 px-4 font-bold text-gray-900">{printData.designation}</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-4 font-semibold text-gray-600 bg-gray-50/50">Department</td>
                        <td className="py-2.5 px-4 text-gray-900">{printData.job?.department_name || 'General'}</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-4 font-semibold text-gray-600 bg-gray-50/50">Work Location / Mode</td>
                        <td className="py-2.5 px-4 text-gray-900">{printData.job?.location || 'Remote / Hybrid'}</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-4 font-semibold text-gray-600 bg-gray-50/50">Date of Joining</td>
                        <td className="py-2.5 px-4 font-bold text-purple-700">{printData.joining_date}</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-4 font-semibold text-gray-600 bg-gray-50/50">Probation Period</td>
                        <td className="py-2.5 px-4 text-gray-900">{printData.probation_period_months} Months</td>
                      </tr>
                      {printData.reporting_manager && (
                        <tr>
                          <td className="py-2.5 px-4 font-semibold text-gray-600 bg-gray-50/50">Reporting Manager</td>
                          <td className="py-2.5 px-4 text-gray-900">{printData.reporting_manager.name} ({printData.reporting_manager.code})</td>
                        </tr>
                      )}
                      <tr className="bg-purple-50/60 font-bold">
                        <td className="py-3 px-4 text-purple-900">Annual Gross CTC</td>
                        <td className="py-3 px-4 text-purple-900 text-sm">
                          ₹{printData.ctc?.toLocaleString('en-IN')} / Year
                        </td>
                      </tr>
                      <tr className="bg-gray-50">
                        <td className="py-2.5 px-4 font-semibold text-gray-600">Monthly Gross Equivalent</td>
                        <td className="py-2.5 px-4 font-bold text-gray-900">
                          ₹{printData.ctc_monthly?.toLocaleString('en-IN')} / Month
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Terms and Conditions Clauses */}
                <div className="space-y-3 text-xs text-gray-700 mb-8 leading-relaxed">
                  <h4 className="font-bold text-gray-900 uppercase text-[11px] tracking-wider">
                    Terms & Standard Conditions
                  </h4>
                  <ol className="list-decimal list-inside space-y-1.5 pl-1">
                    <li>
                      <strong>Statutory Deductions:</strong> All compensation amounts are subject to applicable statutory deductions including Provident Fund (PF), Employee State Insurance (ESI), and Income Tax TDS as per government guidelines.
                    </li>
                    <li>
                      <strong>Probation & Confirmation:</strong> You will be on probation for a period of {printData.probation_period_months} months from your date of joining. Upon successful evaluation of your performance, your employment will be confirmed in writing.
                    </li>
                    <li>
                      <strong>Confidentiality & Code of Conduct:</strong> You agree to abide by all organizational policies, maintain confidentiality of company IP, and represent the organization with high integrity.
                    </li>
                    {printData.notes && (
                      <li>
                        <strong>Special Stipulations:</strong> {printData.notes}
                      </li>
                    )}
                  </ol>
                </div>

                {/* Sign-off & Acceptance Blocks */}
                <div className="grid grid-cols-2 gap-8 pt-8 border-t border-gray-300 text-xs">
                  <div className="space-y-12">
                    <p className="font-bold text-gray-800">For {printData.company?.name}:</p>
                    <div>
                      <div className="border-b border-gray-400 w-48 mb-1"></div>
                      <p className="font-bold text-gray-900">Authorized HR Signatory</p>
                      <p className="text-gray-500">{printData.company?.name}</p>
                    </div>
                  </div>

                  <div className="space-y-12">
                    <p className="font-bold text-gray-800">Acceptance by Candidate:</p>
                    <div>
                      <div className="border-b border-gray-400 w-48 mb-1"></div>
                      <p className="font-bold text-gray-900">{printData.candidate?.full_name}</p>
                      <p className="text-gray-500">Signature & Date</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-20 text-center text-gray-400">
                <FileCheck size={48} className="mx-auto mb-2 opacity-40" />
                <p>No offer letter selected.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Status Update Modal ────────────────────────────── */}
      {showStatusModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm no-print">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 border border-gray-200 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h4 className="text-sm font-bold text-gray-900">Update Offer Status</h4>
              <button
                type="button"
                onClick={() => setShowStatusModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleStatusSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-700 font-bold mb-1">Select Status</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full p-2.5 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
                >
                  <option value="Draft">Draft</option>
                  <option value="Approved">Approved (Ready to send)</option>
                  <option value="Sent">Sent to Candidate</option>
                  <option value="Accepted">Accepted by Candidate</option>
                  <option value="Declined">Declined by Candidate</option>
                  <option value="Expired">Expired</option>
                  <option value="Withdrawn">Withdrawn</option>
                </select>
              </div>

              {newStatus === 'Declined' && (
                <div>
                  <label className="block text-gray-700 font-bold mb-1">
                    Declined Reason <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Received counter-offer, notice period issue"
                    value={declinedReason}
                    onChange={(e) => setDeclinedReason(e.target.value)}
                    className="w-full p-2.5 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-gray-700 font-bold mb-1">Notes / Remarks</label>
                <textarea
                  rows={2}
                  placeholder="Optional log notes..."
                  value={statusNote}
                  onChange={(e) => setStatusNote(e.target.value)}
                  className="w-full p-2.5 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="pt-3 border-t flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowStatusModal(false)}
                  className="btn btn-secondary text-xs py-2 px-3"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="btn btn-primary text-xs py-2 px-4 bg-purple-600 hover:bg-purple-700 text-white font-semibold"
                >
                  {actionLoading ? 'Saving...' : 'Update Status'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
        </>,
        document.body
      )}
    </>
  );
}
