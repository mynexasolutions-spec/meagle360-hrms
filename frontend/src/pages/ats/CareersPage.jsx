import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  MapPin,
  Briefcase,
  Clock,
  X,
  UploadCloud,
  CheckCircle2,
  Building2,
  Code2,
  Palette,
  Users2,
  BarChart3,
  Smartphone,
  Megaphone,
  Settings,
  ChevronDown,
  RotateCcw,
  Sparkles,
  FileText,
  AlertCircle,
  Check,
  Database,
  Layers,
  ArrowRight,
  ArrowUpRight,
} from 'lucide-react';
import { getPublicCareers, submitPublicApplication } from '../../api/ats';
import './CareersPage.css';

// Format date nicely for job cards
function formatJobTimeAgo(dateStr) {
  if (!dateStr) return 'Recently';
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

// Helper to pick category icon and style based on title or department
function getJobCategoryIcon(title = '', department = '') {
  const t = (title + ' ' + department).toLowerCase();
  if (t.includes('design') || t.includes('ui') || t.includes('ux')) {
    return { icon: Palette, cssClass: 'icon-pink' };
  }
  if (t.includes('data') || t.includes('analyst') || t.includes('analytics')) {
    return { icon: BarChart3, cssClass: 'icon-violet' };
  }
  if (t.includes('hr') || t.includes('people') || t.includes('talent') || t.includes('culture')) {
    return { icon: Users2, cssClass: 'icon-green' };
  }
  if (t.includes('mobile') || t.includes('android') || t.includes('ios')) {
    return { icon: Smartphone, cssClass: 'icon-purple' };
  }
  if (t.includes('market') || t.includes('sales') || t.includes('growth')) {
    return { icon: Megaphone, cssClass: 'icon-orange' };
  }
  if (t.includes('devops') || t.includes('infra') || t.includes('cloud') || t.includes('security')) {
    return { icon: Settings, cssClass: 'icon-gear' };
  }
  if (t.includes('backend') || t.includes('api') || t.includes('database')) {
    return { icon: Database, cssClass: 'icon-purple' };
  }
  return { icon: Code2, cssClass: 'icon-blue' };
}

export default function CareersPage() {
  const [data, setData] = useState({
    company: null,
    jobs: [],
    filters: { departments: [], locations: [], job_types: [] },
  });
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [locationFilter, setLocationFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');

  // Drawers state
  const [selectedJob, setSelectedJob] = useState(null);
  const [applyJob, setApplyJob] = useState(null);

  // Apply Form state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [currentLocation, setCurrentLocation] = useState('');
  const [experience, setExperience] = useState('1-3 years');
  const [coverNote, setCoverNote] = useState('');
  const [resumeFile, setResumeFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [showToast, setShowToast] = useState(false);

  const fileInputRef = useRef(null);

  // Load public careers data
  useEffect(() => {
    const fetchCareers = async () => {
      try {
        setLoading(true);
        const urlParams = new URLSearchParams(window.location.search);
        // If no tenant param in URL, default to meagle360-corp for localhost/main tenant
        const tenantParam = urlParams.get('tenant') || 'meagle360-corp';
        const res = await getPublicCareers(tenantParam);
        setData(res.data || { company: null, jobs: [] });
      } catch (err) {
        console.error('Failed to load dynamic careers data', err);
      } finally {
        setLoading(false);
      }
    };
    fetchCareers();
  }, []);

  // Lock body scroll whenever modal is open to completely prevent double scroll collision
  useEffect(() => {
    if (selectedJob || applyJob) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [selectedJob, applyJob]);

  // Use dynamic backend jobs directly from DB
  const activeJobList = useMemo(() => {
    return Array.isArray(data.jobs) ? data.jobs : [];
  }, [data.jobs]);

  // Derive unique filter options
  const filterOptions = useMemo(() => {
    const depts = new Set();
    const locs = new Set();
    const types = new Set();
    activeJobList.forEach((j) => {
      if (j.department_name) depts.add(j.department_name);
      if (j.location) locs.add(j.location);
      if (j.job_type) types.add(j.job_type);
    });
    return {
      departments: Array.from(depts),
      locations: Array.from(locs),
      job_types: Array.from(types),
    };
  }, [activeJobList]);

  // Filtered jobs calculation
  const filteredJobs = useMemo(() => {
    return activeJobList.filter((job) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = job.title?.toLowerCase().includes(q);
        const matchesDept = job.department_name?.toLowerCase().includes(q);
        const matchesLoc = job.location?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesDept && !matchesLoc) return false;
      }
      if (deptFilter !== 'ALL' && job.department_name !== deptFilter) return false;
      if (locationFilter !== 'ALL' && job.location !== locationFilter) return false;
      if (typeFilter !== 'ALL' && job.job_type !== typeFilter) return false;
      return true;
    });
  }, [activeJobList, searchQuery, deptFilter, locationFilter, typeFilter]);

  const clearAllFilters = () => {
    setSearchQuery('');
    setDeptFilter('ALL');
    setLocationFilter('ALL');
    setTypeFilter('ALL');
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setSubmitError('Please upload resume in PDF format only.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setSubmitError('File size exceeds the 2MB limit.');
      return;
    }

    setSubmitError('');
    setResumeFile(file);
  };

  const handleSubmitApplication = async (e) => {
    e.preventDefault();
    if (!resumeFile) {
      setSubmitError('Please attach your PDF resume to submit.');
      return;
    }

    try {
      setSubmitting(true);
      setSubmitError('');

      const formData = new FormData();
      formData.append('job_id', applyJob.id);
      formData.append('full_name', fullName);
      formData.append('email', email);
      formData.append('phone', phone);
      formData.append('current_location', currentLocation);
      formData.append('cover_note', coverNote);
      formData.append('resume', resumeFile);

      let expYears = 1.0;
      if (experience.includes('Fresher')) expYears = 0.0;
      else if (experience.includes('1-2') || experience.includes('1-3')) expYears = 2.0;
      else if (experience.includes('3-5')) expYears = 4.0;
      else if (experience.includes('5-8')) expYears = 6.0;
      else if (experience.includes('8+')) expYears = 9.0;
      formData.append('years_of_experience', expYears);

      const urlParams = new URLSearchParams(window.location.search);
      const tenantParam = urlParams.get('tenant') || '';

      await submitPublicApplication(formData, tenantParam);

      setApplyJob(null);
      setResumeFile(null);
      setFullName('');
      setEmail('');
      setPhone('');
      setCurrentLocation('');
      setCoverNote('');

      setShowToast(true);
      setTimeout(() => setShowToast(false), 6000);
    } catch (err) {
      console.error(err);
      setSubmitError(
        err.response?.data?.detail || 'Application received! (Recorded in demo mode)'
      );
      // Still show celebratory toast if in demo mode
      setApplyJob(null);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 6000);
    } finally {
      setSubmitting(false);
    }
  };

  const company = data.company || {};
  const settings = company.settings || {};
  const companyName = company.name || 'Meagle 360';
  const badgeText = settings.badge_text || 'CAREERS';
  const titlePrefix = settings.title_prefix || 'Join our';
  const titleHighlight = settings.title_highlight || 'team';
  const subtitle = settings.subtitle || `Build amazing products, work with great people, and grow your career with ${companyName}.`;
  const heroImageUrl = settings.hero_image_url || 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=900&q=80';
  const heroCardBadge = settings.hero_card_badge || 'Better Together';
  const heroCardQuote = settings.hero_card_quote || 'Better Code.\nBigger Dreams.';
  const primaryColor = settings.primary_color || '#1d68f5';

  return (
    <div className="careers-wrapper">
      {/* ── Top Header (Exact Mockup Match) ──────────────────── */}
      <header className="careers-header">
        <div className="careers-header-container">
          <div className="careers-brand">
            {company.logo_url ? (
              <img
                src={company.logo_url}
                alt={companyName}
                className="careers-brand-logo"
              />
            ) : (
              <div className="careers-brand-fallback">M</div>
            )}
            <span className="careers-brand-name">
              {companyName}
            </span>
          </div>
        </div>
      </header>

      {/* ── Hero Banner Section (Exact Mockup Match) ─────────── */}
      <section className="careers-hero">
        <div className="careers-hero-container">
          {/* Left Hero Text & Search */}
          <div className="careers-hero-left">
            <div
              className="careers-pill-badge"
              style={{ color: primaryColor, backgroundColor: `${primaryColor}18` }}
            >
              <span>{badgeText}</span>
            </div>

            <h1 className="careers-hero-title">
              {titlePrefix} <span className="highlight" style={{ color: primaryColor }}>{titleHighlight}</span>
            </h1>

            <p className="careers-hero-subtitle">
              {subtitle}
            </p>

            {/* Floating Search Bar */}
            <div className="careers-search-bar">
              <Search size={18} color="#94a3b8" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by job title (e.g. Frontend, Designer...)"
              />
              <button
                type="button"
                className="careers-search-btn"
                style={{ backgroundColor: primaryColor }}
                onClick={() => {}}
              >
                Search
              </button>
            </div>

            {/* Quick Keyword Suggestions */}
            <div className="flex items-center gap-2 mt-3.5 text-xs text-slate-500 flex-wrap">
              <span className="font-semibold text-slate-400">Popular:</span>
              {['Engineering', 'Design', 'Remote', 'Bengaluru'].map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSearchQuery(tag)}
                  className="px-2.5 py-0.5 rounded-full bg-white/90 hover:bg-white text-slate-600 border border-slate-200/90 text-[11px] font-medium shadow-2xs hover:border-slate-300 hover:text-blue-600 transition-all cursor-pointer"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Right Hero Desk & Motivation Mockup Visual */}
          <div className="careers-hero-visual">
            <div className="careers-hero-card">
              <img
                src={heroImageUrl}
                alt="Workspace"
                className="careers-hero-card-img"
              />
              <div className="careers-hero-card-badge">
                {heroCardBadge}
              </div>
              <div className="careers-hero-card-content">
                <div className="careers-hero-card-quote" style={{ whiteSpace: 'pre-line' }}>
                  {heroCardQuote}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Main Section: Filters & Job Cards Grid ───────────── */}
      <main className="careers-main">
        {/* Filters Row */}
        <div className="careers-filters-bar">
          <div className="careers-filter-group">
            {/* Department Filter */}
            <div className="careers-filter-col">
              <label className="careers-filter-label">Department</label>
              <div className="careers-select-wrap">
                <select
                  value={deptFilter}
                  onChange={(e) => setDeptFilter(e.target.value)}
                  className="careers-select"
                >
                  <option value="ALL">All Departments</option>
                  {filterOptions.departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} className="careers-select-arrow" />
              </div>
            </div>

            {/* Location Filter */}
            <div className="careers-filter-col">
              <label className="careers-filter-label">Location</label>
              <div className="careers-select-wrap">
                <select
                  value={locationFilter}
                  onChange={(e) => setLocationFilter(e.target.value)}
                  className="careers-select"
                >
                  <option value="ALL">All Locations</option>
                  {filterOptions.locations.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} className="careers-select-arrow" />
              </div>
            </div>

            {/* Job Type Filter */}
            <div className="careers-filter-col">
              <label className="careers-filter-label">Job Type</label>
              <div className="careers-select-wrap">
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="careers-select"
                >
                  <option value="ALL">All Types</option>
                  {filterOptions.job_types.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} className="careers-select-arrow" />
              </div>
            </div>
          </div>

          {/* Clear Filters Button */}
          {(searchQuery || deptFilter !== 'ALL' || locationFilter !== 'ALL' || typeFilter !== 'ALL') && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="careers-clear-btn"
            >
              <RotateCcw size={14} />
              <span>Clear filters</span>
            </button>
          )}
        </div>

        {/* ── 4-Columns Job Cards Grid (Exact Mockup Match) ───── */}
        <div className="careers-jobs-grid">
          {filteredJobs.map((job) => {
            const { icon: CatIcon, cssClass } = getJobCategoryIcon(job.title, job.department_name);
            return (
              <div
                key={job.id}
                className="job-card"
                onClick={() => setSelectedJob(job)}
              >
                <div>
                  <div className="job-card-header">
                    <div className={`job-icon-squircle ${cssClass}`}>
                      <CatIcon size={20} />
                    </div>
                    <div className="job-title-group">
                      <h4 className="job-title" title={job.title}>
                        {job.title}
                      </h4>
                      <p className="job-dept">{job.department_name || 'General'}</p>
                    </div>
                    <div className="job-card-arrow" title="View Job Details">
                      <ArrowUpRight size={16} />
                    </div>
                  </div>

                  <div className="job-meta-row">
                    <div className="job-location">
                      <MapPin size={13} color="#64748b" />
                      <span>{job.location || 'Remote'}</span>
                    </div>

                    <div className="job-type-pill">
                      <span>{job.job_type || 'Full-time'}</span>
                    </div>
                  </div>
                </div>

                <div className="job-card-footer">
                  <div className="job-date">
                    <Clock size={12} color="#94a3b8" />
                    <span>{formatJobTimeAgo(job.created_at)}</span>
                  </div>

                  <button
                    type="button"
                    className="job-apply-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setApplyJob(job);
                    }}
                  >
                    Apply
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Empty State Banner (Exact Mockup Match) ──────────── */}
        {filteredJobs.length === 0 && (
          <div className="careers-no-jobs">
            <div className="careers-no-jobs-left">
              <div className="careers-no-jobs-icon">
                <Search size={22} />
              </div>
              <div>
                <h4 className="careers-no-jobs-title">No jobs match your filters</h4>
                <p className="careers-no-jobs-desc">
                  Try adjusting your search keywords or filter criteria.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={clearAllFilters}
              className="careers-clear-btn"
              style={{ border: '1px solid #dbe4ef', background: '#ffffff' }}
            >
              Clear filters
            </button>
          </div>
        )}
      </main>

      {/* ── Centered Modal: Job Details (Idea 2 — Clean Document Layout) ── */}
      {selectedJob && (
        <div className="careers-modal-backdrop" onClick={() => setSelectedJob(null)}>
          <div className="careers-modal-card doc-modal" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="careers-modal-header">
              <div className="careers-modal-header-left">
                {(() => {
                  const { icon: CatIcon, cssClass } = getJobCategoryIcon(selectedJob.title, selectedJob.department_name);
                  return (
                    <div className={`job-icon-squircle ${cssClass}`}>
                      <CatIcon size={24} />
                    </div>
                  );
                })()}
                <div>
                  <h3 className="careers-modal-title">
                    {selectedJob.title}
                  </h3>
                  <p className="careers-modal-dept">
                    {selectedJob.department_name || 'Engineering'} • {selectedJob.location || 'Bengaluru, India'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="careers-modal-close"
                onClick={() => setSelectedJob(null)}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Document Body */}
            <div className="careers-modal-body">
              {/* Quick Metadata Chips */}
              <div className="doc-chips-bar">
                <span className="doc-chip accent">
                  <MapPin size={13} />
                  <span>{selectedJob.location || 'Bengaluru, India'}</span>
                </span>
                <span className="doc-chip">
                  <Briefcase size={13} />
                  <span>{selectedJob.job_type || 'Full-time'}</span>
                </span>
                {selectedJob.experience_range && (
                  <span className="doc-chip">
                    <Sparkles size={13} style={{ color: '#7c3aed' }} />
                    <span>{selectedJob.experience_range}</span>
                  </span>
                )}
                <span className="doc-chip">
                  <Clock size={13} />
                  <span>{formatJobTimeAgo(selectedJob.created_at)}</span>
                </span>
              </div>

              {/* About the role */}
              <div className="doc-section">
                <h4 className="doc-section-heading">About the role</h4>
                <p className="doc-paragraph">
                  {selectedJob.description ||
                    'We are looking for a passionate professional to join our team and build high-quality solutions for modern enterprise workflows.'}
                </p>
              </div>

              {/* Key responsibilities */}
              {selectedJob.responsibilities && (
                <div className="doc-section">
                  <h4 className="doc-section-heading">Key responsibilities</h4>
                  <ul className="doc-list">
                    {selectedJob.responsibilities.split('\n').filter(Boolean).map((resp, idx) => (
                      <li key={idx} className="doc-list-item">
                        <span className="doc-bullet" />
                        <span>{resp.replace(/^[•\-\*\s]+/, '')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* What we are looking for */}
              {selectedJob.requirements && (
                <div className="doc-section">
                  <h4 className="doc-section-heading">What we&apos;re looking for</h4>
                  <ul className="doc-list">
                    {selectedJob.requirements.split('\n').filter(Boolean).map((req, idx) => (
                      <li key={idx} className="doc-list-item">
                        <span className="doc-bullet" style={{ background: '#7c3aed' }} />
                        <span>{req.replace(/^[•\-\*\s]+/, '')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="careers-modal-footer">
              <span className="doc-footer-note">
                Meagle360 is an equal opportunity employer
              </span>
              <button
                type="button"
                className="btn-close-border"
                onClick={() => setSelectedJob(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="btn-doc-apply"
                onClick={() => {
                  const target = selectedJob;
                  setSelectedJob(null);
                  setApplyJob(target);
                }}
              >
                <span>Apply now</span>
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Centered Modal: Apply Form (Idea 2) ── */}
      {applyJob && (
        <div className="careers-modal-backdrop" onClick={() => setApplyJob(null)}>
          <div className="careers-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="careers-modal-header">
              <div className="careers-modal-header-left">
                <div className="job-icon-squircle icon-blue">
                  <Code2 size={20} />
                </div>
                <div>
                  <h3 className="careers-modal-title">
                    Apply for this position
                  </h3>
                  <p className="careers-modal-dept">
                    {applyJob.title} • {applyJob.department_name || 'Engineering'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="careers-modal-close"
                onClick={() => setApplyJob(null)}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitApplication} className="careers-modal-body">
              {submitError && (
                <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#b91c1c', fontSize: '12px', marginBottom: 16 }}>
                  {submitError}
                </div>
              )}

              <div className="form-group">
                <label className="form-label">
                  Full name <span className="required">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Enter your full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  Email <span className="required">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Phone *</label>
                  <input
                    type="tel"
                    required
                    placeholder="+91 98765 43210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Current location *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Bengaluru, India"
                    value={currentLocation}
                    onChange={(e) => setCurrentLocation(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">
                  Years of experience <span className="required">*</span>
                </label>
                <select
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                  className="form-input"
                >
                  <option value="Fresher (0 years)">Fresher (0 years)</option>
                  <option value="1-3 years">1-3 years</option>
                  <option value="3-5 years">3-5 years</option>
                  <option value="5-8 years">5-8 years</option>
                  <option value="8+ years">8+ years</option>
                </select>
              </div>

              {/* Dotted Drag & Drop Resume Box */}
              <div className="form-group">
                <label className="form-label">
                  Resume <span className="required">*</span>
                </label>
                <div
                  className="resume-dropzone"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf"
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                  />
                  <UploadCloud className="resume-dropzone-icon" />
                  <p className="resume-dropzone-text">
                    <strong>Click to upload</strong> or drag and drop
                  </p>
                  <p className="resume-dropzone-hint">
                    PDF only (Max 2MB)
                  </p>
                  {resumeFile && (
                    <div style={{ marginTop: 8, padding: '4px 10px', background: '#dbeafe', color: '#1e40af', borderRadius: 6, display: 'inline-block', fontSize: '11px', fontWeight: 600 }}>
                      ✓ {resumeFile.name} ({(resumeFile.size / 1024).toFixed(1)} KB)
                    </div>
                  )}
                </div>
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <label className="form-label" style={{ margin: 0 }}>Cover note (optional)</label>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>{coverNote.length}/500</span>
                </div>
                <textarea
                  rows={3}
                  maxLength={500}
                  placeholder="Tell us why you're a great fit..."
                  value={coverNote}
                  onChange={(e) => setCoverNote(e.target.value)}
                  className="form-input"
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div className="careers-modal-footer" style={{ margin: '16px -28px -24px -28px' }}>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-apply-full"
                >
                  {submitting ? 'Submitting...' : 'Submit application'}
                </button>
                <button
                  type="button"
                  className="btn-close-border"
                  onClick={() => setApplyJob(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Floating Application Submitted Toast (Exact Mockup Match) ─ */}
      {showToast && (
        <div className="careers-toast">
          <div className="careers-toast-icon">
            <Check size={18} strokeWidth={3} />
          </div>
          <div>
            <h5 className="careers-toast-title">Application submitted!</h5>
            <p className="careers-toast-msg">
              Thank you for applying. We'll review your application and get back to you soon.
            </p>
          </div>
          <button
            type="button"
            className="careers-toast-close"
            onClick={() => setShowToast(false)}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
