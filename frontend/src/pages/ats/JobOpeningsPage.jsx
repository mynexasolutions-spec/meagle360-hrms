import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Briefcase,
  Plus,
  Search,
  Filter,
  MapPin,
  Users,
  Edit2,
  Trash2,
  ExternalLink,
  Copy,
  Check,
  Building,
  Clock,
  Sparkles,
  Palette,
  FileText,
  ListChecks,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import {
  getJobOpenings,
  createJobOpening,
  updateJobOpening,
  deleteJobOpening,
  getAtsDropdowns,
} from '../../api/ats';
import Modal from '../../components/Modal';
import CareersCustomizerModal from '../../components/ats/CareersCustomizerModal';

export default function JobOpeningsPage() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [dropdowns, setDropdowns] = useState({ departments: [], designations: [] });
  const [copiedLink, setCopiedLink] = useState(false);
  const [showCustomizer, setShowCustomizer] = useState(false);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [saving, setSaving] = useState(false);
  const [activeModalTab, setActiveModalTab] = useState('basic');
  const [errorMsg, setErrorMsg] = useState('');

  const [formData, setFormData] = useState({
    title: '',
    department_id: '',
    department_name: '',
    designation_id: '',
    designation_name: '',
    number_of_openings: 1,
    location: '',
    job_type: 'Full-time',
    status: 'Open',
    experience_range: '',
    description: '',
    responsibilities: '',
    requirements: '',
  });

  const loadJobs = async () => {
    try {
      setLoading(true);
      const res = await getJobOpenings({
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        search: search.trim() || undefined,
      });
      setJobs(res.data || []);
    } catch (err) {
      console.error('Failed to load jobs', err);
    } finally {
      setLoading(false);
    }
  };

  const loadDropdowns = async () => {
    try {
      const res = await getAtsDropdowns();
      setDropdowns(res.data || { departments: [], designations: [] });
    } catch (err) {
      console.error('Failed to load ATS dropdowns', err);
    }
  };

  useEffect(() => {
    loadJobs();
  }, [statusFilter]);

  useEffect(() => {
    loadDropdowns();
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadJobs();
  };

  const openCreateModal = () => {
    setEditingJob(null);
    setErrorMsg('');
    setFormData({
      title: '',
      department_id: '',
      department_name: '',
      designation_id: '',
      designation_name: '',
      number_of_openings: 1,
      location: 'Bengaluru, India',
      job_type: 'Full-time',
      status: 'Open',
      experience_range: '2-5 years',
      description: 'We are looking for a passionate professional to join our high-performing team and build modern software products.',
      responsibilities: '• Collaborate with cross-functional team members\n• Build robust and scalable features\n• Participate in code reviews and architecture design',
      requirements: '• Relevant experience in the required domain\n• Strong communication and problem solving skills\n• Passion for writing clean, maintainable code',
    });
    setActiveModalTab('basic');
    setShowModal(true);
  };

  const openEditModal = (job) => {
    setEditingJob(job);
    setErrorMsg('');
    setFormData({
      title: job.title || '',
      department_id: job.department_id || '',
      department_name: job.department_name || '',
      designation_id: job.designation_id || '',
      designation_name: job.designation_name || '',
      number_of_openings: job.number_of_openings || 1,
      location: job.location || '',
      job_type: job.job_type || 'Full-time',
      status: job.status || 'Open',
      experience_range: job.experience_range || '',
      description: job.description || '',
      responsibilities: job.responsibilities || '',
      requirements: job.requirements || '',
    });
    setActiveModalTab('basic');
    setShowModal(true);
  };

  const handleSaveJob = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      setErrorMsg('Job title is required.');
      return;
    }

    try {
      setSaving(true);
      setErrorMsg('');

      // Find department name if selected
      const selectedDept = dropdowns.departments.find((d) => d.id === formData.department_id);
      const selectedDesig = dropdowns.designations.find((d) => d.id === formData.designation_id);

      const payload = {
        ...formData,
        number_of_openings: parseInt(formData.number_of_openings, 10) || 1,
        department_name: selectedDept ? selectedDept.name : formData.department_name,
        designation_name: selectedDesig ? selectedDesig.title : formData.designation_name,
        department_id: formData.department_id || null,
        designation_id: formData.designation_id || null,
      };

      if (editingJob) {
        await updateJobOpening(editingJob.id, payload);
      } else {
        await createJobOpening(payload);
      }

      setShowModal(false);
      loadJobs();
    } catch (err) {
      console.error(err);
      setErrorMsg(err.response?.data?.detail || 'Failed to save job opening.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteJob = async (jobId) => {
    if (!window.confirm('Are you sure you want to delete this job opening?')) return;
    try {
      await deleteJobOpening(jobId);
      loadJobs();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to delete job opening.');
    }
  };

  const handleCopyCareersLink = () => {
    const url = `${window.location.origin}/careers?tenant=meagle360-corp`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-gray-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">Job Openings</h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
              ATS
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Create, manage and publish open positions to your public careers page.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleCopyCareersLink}
            className="btn btn-secondary inline-flex items-center gap-2 text-sm"
            title="Copy Public Careers Portal URL"
          >
            {copiedLink ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
            <span>{copiedLink ? 'Link Copied!' : 'Careers Link'}</span>
          </button>

          <a
            href="/careers?tenant=meagle360-corp"
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary inline-flex items-center gap-2 text-sm"
          >
            <ExternalLink size={16} />
            <span>View Careers Page</span>
          </a>

          <Link
            to="/ats/careers-builder"
            className="btn btn-secondary inline-flex items-center gap-2 text-sm text-purple-700 border-purple-200 hover:bg-purple-50"
            title="Open Careers Site Studio with Full Page Live Preview"
          >
            <Palette size={16} />
            <span>Careers Site Studio</span>
          </Link>

          <button
            type="button"
            onClick={openCreateModal}
            className="btn btn-primary inline-flex items-center gap-2 shadow-sm text-sm"
          >
            <Plus size={18} />
            <span>Create Job</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        {/* Status Tabs */}
        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg w-full sm:w-auto overflow-x-auto">
          {['ALL', 'Open', 'Draft', 'Closed'].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                statusFilter === tab
                  ? 'bg-white text-gray-900 shadow-sm font-semibold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab === 'ALL' ? 'All Postings' : tab}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full sm:w-80">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button type="submit" className="btn btn-secondary text-xs py-2 px-3">
            Search
          </button>
        </form>
      </div>

      {/* Jobs Grid */}
      {loading ? (
        <div className="py-20 text-center text-gray-500">
          <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
          <p className="text-sm">Loading job openings...</p>
        </div>
      ) : jobs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center shadow-sm">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Briefcase size={32} />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">No job openings found</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto mt-1 mb-6">
            {search || statusFilter !== 'ALL'
              ? 'Try adjusting your search query or status filter.'
              : 'Create your first job posting to start attracting top talent on your careers portal.'}
          </p>
          <button
            type="button"
            onClick={openCreateModal}
            className="btn btn-primary inline-flex items-center gap-2 text-sm"
          >
            <Plus size={16} /> Create Job Opening
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
            >
              <div>
                {/* Card Top */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900 text-base leading-snug hover:text-blue-600 transition-colors">
                      {job.title}
                    </h3>
                    <p className="text-xs font-medium text-gray-500 mt-0.5">
                      {job.department_name || 'General Department'}
                    </p>
                  </div>

                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold shrink-0 ${
                      job.status === 'Open'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : job.status === 'Draft'
                        ? 'bg-gray-100 text-gray-600 border border-gray-200'
                        : 'bg-red-50 text-red-700 border border-red-200'
                    }`}
                  >
                    {job.status}
                  </span>
                </div>

                {/* Badges / Meta */}
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 mb-4">
                  <span className="inline-flex items-center gap-1 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-md">
                    <MapPin size={13} className="text-gray-400" />
                    {job.location || 'Remote'}
                  </span>
                  <span className="inline-flex items-center gap-1 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-md">
                    <Briefcase size={13} className="text-gray-400" />
                    {job.job_type}
                  </span>
                  {job.number_of_openings > 1 && (
                    <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded-md font-medium">
                      {job.number_of_openings} openings
                    </span>
                  )}
                </div>

                {/* Description snippet */}
                {job.description && (
                  <p className="text-xs text-gray-500 line-clamp-2 mb-4 leading-relaxed">
                    {job.description}
                  </p>
                )}
              </div>

              {/* Card Footer */}
              <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                <div className="flex items-center gap-1.5 font-medium text-gray-700">
                  <Users size={14} className="text-blue-600" />
                  <span>{job.applicants_count || 0} applicants</span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEditModal(job)}
                    className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Edit Opening"
                  >
                    <Edit2 size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteJob(job.id)}
                    className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete Opening"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Job Modal (Idea 1 — Tabbed Clean Flow) */}
      {showModal && (
        <Modal
          title={editingJob ? `Edit Job: ${editingJob.title}` : 'Create Job Opening'}
          onClose={() => setShowModal(false)}
          maxWidth="760px"
        >
          <form onSubmit={handleSaveJob}>
            {errorMsg && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-medium">
                {errorMsg}
              </div>
            )}

            {/* ── Modal Tabs Bar ───────────────────────────────── */}
            <div className="flex border-b border-gray-200 mb-5 bg-gray-50/70 -mx-7 -mt-5 px-7 pt-3 rounded-t-lg gap-2 overflow-x-auto">
              {[
                { id: 'basic', label: '1. Position Details', icon: Briefcase },
                { id: 'description', label: '2. Role Scope', icon: FileText },
                { id: 'requirements', label: '3. Requirements', icon: ListChecks },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeModalTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveModalTab(tab.id)}
                    className={`flex items-center gap-2 pb-3 px-3 text-xs sm:text-sm font-semibold border-b-2 transition-all cursor-pointer ${
                      isActive
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <Icon size={15} className={isActive ? 'text-blue-600' : 'text-gray-400'} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* ── Tab 1: Position Details ───────────────────────── */}
            {activeModalTab === 'basic' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in duration-150">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Job Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Senior Frontend Developer"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Department</label>
                  <select
                    value={formData.department_id}
                    onChange={(e) => setFormData({ ...formData, department_id: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Department</option>
                    {dropdowns.departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Designation</label>
                  <select
                    value={formData.designation_id}
                    onChange={(e) => setFormData({ ...formData, designation_id: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Designation</option>
                    {dropdowns.designations.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Location</label>
                  <input
                    type="text"
                    placeholder="e.g. Bengaluru, India or Remote"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Job Type</label>
                  <select
                    value={formData.job_type}
                    onChange={(e) => setFormData({ ...formData, job_type: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Full-time">Full-time</option>
                    <option value="Internship">Internship</option>
                    <option value="Contract">Contract</option>
                    <option value="Part-time">Part-time</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Openings Count</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.number_of_openings}
                    onChange={(e) => setFormData({ ...formData, number_of_openings: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Experience Range</label>
                  <input
                    type="text"
                    placeholder="e.g. 2-5 years"
                    value={formData.experience_range}
                    onChange={(e) => setFormData({ ...formData, experience_range: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  >
                    <option value="Open">Open (Published on Public Careers Portal)</option>
                    <option value="Draft">Draft (Internal only)</option>
                    <option value="Closed">Closed (Archived)</option>
                  </select>
                </div>
              </div>
            )}

            {/* ── Tab 2: Role Scope & Description ──────────────── */}
            {activeModalTab === 'description' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-gray-700">
                      About the Role (Overview)
                    </label>
                    <span className="text-[11px] text-gray-400">Introduction and mission for candidates</span>
                  </div>
                  <textarea
                    rows={4}
                    placeholder="Give an overview of the role and what makes this position impactful..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-gray-700">
                      Key Responsibilities (Bullet points)
                    </label>
                    <span className="text-[11px] text-gray-400">Use • for clean bullet list</span>
                  </div>
                  <textarea
                    rows={6}
                    placeholder={"• Lead the development of scalable client-side features\n• Collaborate with backend engineers on clean RESTful APIs\n• Participate in code reviews and architecture design"}
                    value={formData.responsibilities}
                    onChange={(e) => setFormData({ ...formData, responsibilities: e.target.value })}
                    className="w-full px-3 py-2.5 text-xs font-mono border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed"
                  />
                </div>
              </div>
            )}

            {/* ── Tab 3: Requirements & Qualifications ─────────── */}
            {activeModalTab === 'requirements' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-gray-700">
                      Candidate Requirements & Qualifications
                    </label>
                    <span className="text-[11px] text-gray-400">Use • for clean bullet list</span>
                  </div>
                  <textarea
                    rows={8}
                    placeholder={"• 2+ years of professional software engineering experience\n• Strong proficiency in React, TypeScript, and modern CSS frameworks\n• Experience with RESTful APIs, Git workflows, and CI/CD\n• Passion for clean code, problem solving, and fast iteration"}
                    value={formData.requirements}
                    onChange={(e) => setFormData({ ...formData, requirements: e.target.value })}
                    className="w-full px-3 py-2.5 text-xs font-mono border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed"
                  />
                </div>

                <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-lg text-xs text-blue-800 flex items-start gap-2.5">
                  <Sparkles size={16} className="text-blue-600 mt-0.5 shrink-0" />
                  <span>
                    These qualifications will be showcased prominently on the public careers portal under <strong>&quot;What We&apos;re Looking For&quot;</strong>.
                  </span>
                </div>
              </div>
            )}

            {/* ── Bottom Actions Bar ───────────────────────────── */}
            <div className="pt-4 mt-6 border-t border-gray-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="btn btn-secondary text-sm"
              >
                Cancel
              </button>

              <div className="flex items-center gap-2">
                {activeModalTab !== 'basic' && (
                  <button
                    type="button"
                    onClick={() => {
                      if (activeModalTab === 'requirements') setActiveModalTab('description');
                      else if (activeModalTab === 'description') setActiveModalTab('basic');
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <ArrowLeft size={13} />
                    <span>Previous</span>
                  </button>
                )}

                {activeModalTab !== 'requirements' && (
                  <button
                    type="button"
                    onClick={() => {
                      if (activeModalTab === 'basic') setActiveModalTab('description');
                      else if (activeModalTab === 'description') setActiveModalTab('requirements');
                    }}
                    className="px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span>Next</span>
                    <ArrowRight size={13} />
                  </button>
                )}

                <button
                  type="submit"
                  disabled={saving}
                  className="btn btn-primary inline-flex items-center gap-2 text-sm shadow-sm ml-1"
                >
                  {saving && (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  )}
                  <span>{editingJob ? 'Save Changes' : 'Create Opening'}</span>
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* Careers Page Customizer Modal */}
      {showCustomizer && (
        <CareersCustomizerModal
          onClose={() => setShowCustomizer(false)}
          onSaved={() => {
            // Optional callback
          }}
        />
      )}
    </div>
  );
}
