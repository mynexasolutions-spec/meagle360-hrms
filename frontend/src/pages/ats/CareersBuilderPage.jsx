import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Palette,
  ArrowLeft,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Monitor,
  Smartphone,
  Save,
  Search,
  MapPin,
  Clock,
  Sparkles,
  ChevronDown,
  Building2,
  Eye,
  Briefcase,
  Code2,
  Users2,
  BarChart3,
  Megaphone,
  Settings,
  Database,
  Tv,
  UploadCloud,
  Trash2,
  Loader2,
} from 'lucide-react';
import { getCareersSettings, updateCareersSettings } from '../../api/ats';
import { uploadCompanyBranding } from '../../api/company';
import './CareersPage.css';

const PRESET_IMAGES = [
  {
    name: 'Modern Tech Desk',
    url: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=900&q=80',
  },
  {
    name: 'Team Collaboration',
    url: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=900&q=80',
  },
  {
    name: 'Creative Studio',
    url: 'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?auto=format&fit=crop&w=900&q=80',
  },
  {
    name: 'Minimal Workspace',
    url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=900&q=80',
  },
];

const PRESET_COLORS = [
  { name: 'Royal Blue (Default)', hex: '#1d68f5' },
  { name: 'Indigo Dream', hex: '#6366f1' },
  { name: 'Violet Pulse', hex: '#8b5cf6' },
  { name: 'Emerald Growth', hex: '#10b981' },
  { name: 'Teal Modern', hex: '#0d9488' },
  { name: 'Crimson Bold', hex: '#e11d48' },
];

const PREVIEW_JOBS = [
  {
    id: 'p1',
    title: 'Senior Product Designer',
    department_name: 'Design',
    location: 'Bengaluru, India',
    job_type: 'Full-time',
    icon: Palette,
    cssClass: 'icon-cyan',
  },
  {
    id: 'p2',
    title: 'Lead Frontend Engineer',
    department_name: 'Engineering',
    location: 'Bengaluru, India',
    job_type: 'Full-time',
    icon: Code2,
    cssClass: 'icon-blue',
  },
  {
    id: 'p3',
    title: 'Engineering Manager',
    department_name: 'Engineering',
    location: 'Bengaluru, India',
    job_type: 'Full-time',
    icon: Database,
    cssClass: 'icon-yellow',
  },
  {
    id: 'p4',
    title: 'HR Business Partner',
    department_name: 'People & Culture',
    location: 'Bengaluru, India',
    job_type: 'Full-time',
    icon: Users2,
    cssClass: 'icon-green',
  },
  {
    id: 'p5',
    title: 'Product Analytics Intern',
    department_name: 'Product',
    location: 'Bengaluru, India',
    job_type: 'Internship',
    icon: BarChart3,
    cssClass: 'icon-violet',
  },
  {
    id: 'p6',
    title: 'DevOps Engineer',
    department_name: 'Engineering',
    location: 'Pune, India',
    job_type: 'Contract',
    icon: Settings,
    cssClass: 'icon-gear',
  },
  {
    id: 'p7',
    title: 'Mobile App Developer',
    department_name: 'Engineering',
    location: 'Remote',
    job_type: 'Full-time',
    icon: Smartphone,
    cssClass: 'icon-purple',
  },
  {
    id: 'p8',
    title: 'Marketing Specialist',
    department_name: 'Marketing',
    location: 'Mumbai, India',
    job_type: 'Full-time',
    icon: Megaphone,
    cssClass: 'icon-orange',
  },
];

export default function CareersBuilderPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [viewportMode, setViewportMode] = useState('desktop'); // 'desktop' | 'mobile'
  const [activeTab, setActiveTab] = useState('brand'); // 'brand' | 'hero' | 'media' | 'theme'
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Silver Display Scaled Canvas Viewport
  const screenContainerRef = useRef(null);
  const [autoScale, setAutoScale] = useState(0.55);

  // Customizer States
  const [brandName, setBrandName] = useState('Meagle 360');
  const [logoUrl, setLogoUrl] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [badgeText, setBadgeText] = useState('CAREERS');
  const [titlePrefix, setTitlePrefix] = useState('Join our');
  const [titleHighlight, setTitleHighlight] = useState('team');
  const [subtitle, setSubtitle] = useState(
    'Build amazing products, work with great people, and grow your career with Meagle 360.'
  );
  const [heroImageUrl, setHeroImageUrl] = useState(
    'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=900&q=80'
  );
  const [heroCardBadge, setHeroCardBadge] = useState('Better Together');
  const [heroCardQuote, setHeroCardQuote] = useState('Better Code.\nBigger Dreams.');
  const [primaryColor, setPrimaryColor] = useState('#1d68f5');

  // Auto-calculate scale so 1200px virtual canvas fits 100% inside Silver Display without scroll
  useEffect(() => {
    const handleResize = () => {
      if (screenContainerRef.current) {
        const w = screenContainerRef.current.clientWidth;
        if (w > 0) {
          const s = Math.min(Math.max(w / 1200, 0.40), 0.72);
          setAutoScale(Number(s.toFixed(3)));
        }
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    const timer = setTimeout(handleResize, 150);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timer);
    };
  }, [viewportMode]);

  const currentScale = useMemo(() => {
    if (viewportMode === 'mobile') return 1;
    return autoScale;
  }, [autoScale, viewportMode]);

  // Load current settings from backend
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setLoading(true);
        const res = await getCareersSettings();
        const s = res.data;
        if (s) {
          if (s.brand_name) setBrandName(s.brand_name);
          if (s.logo_url) setLogoUrl(s.logo_url);
          if (s.badge_text) setBadgeText(s.badge_text);
          if (s.title_prefix) setTitlePrefix(s.title_prefix);
          if (s.title_highlight) setTitleHighlight(s.title_highlight);
          if (s.subtitle) setSubtitle(s.subtitle);
          if (s.hero_image_url) setHeroImageUrl(s.hero_image_url);
          if (s.hero_card_badge) setHeroCardBadge(s.hero_card_badge);
          if (s.hero_card_quote) setHeroCardQuote(s.hero_card_quote);
          if (s.primary_color) setPrimaryColor(s.primary_color);
        }
      } catch (err) {
        console.error('Failed to load careers settings', err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    setUploadError('');
    try {
      const res = await uploadCompanyBranding(file, 'logo');
      const uploadedUrl = res.data?.logo_url;
      if (uploadedUrl) {
        setLogoUrl(uploadedUrl);
        setSuccessMessage('Logo photo uploaded successfully to Cloudinary!');
        setTimeout(() => setSuccessMessage(''), 3000);
      }
    } catch (err) {
      setUploadError(err.response?.data?.detail || 'Failed to upload logo photo. Please try again.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = () => {
    setLogoUrl('');
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    try {
      setSaving(true);
      setErrorMessage('');
      const payload = {
        brand_name: brandName.trim() || null,
        logo_url: logoUrl.trim() || null,
        badge_text: badgeText.trim() || 'CAREERS',
        title_prefix: titlePrefix.trim() || 'Join our',
        title_highlight: titleHighlight.trim() || 'team',
        subtitle: subtitle.trim() || null,
        hero_image_url: heroImageUrl.trim() || null,
        hero_card_badge: heroCardBadge.trim() || 'Better Together',
        hero_card_quote: heroCardQuote.trim() || 'Better Code.\nBigger Dreams.',
        primary_color: primaryColor,
      };

      const res = await updateCareersSettings(payload);
      if (res.status === 'success' || res.data) {
        setSuccessMessage('Careers site published live successfully!');
        setTimeout(() => setSuccessMessage(''), 4000);
      }
    } catch (err) {
      console.error('Save failed', err);
      setErrorMessage(err.response?.data?.detail || 'Failed to save careers settings');
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    if (!window.confirm('Reset customized settings back to Meagle 360 defaults?')) return;
    setBrandName('Meagle 360');
    setLogoUrl('');
    setBadgeText('CAREERS');
    setTitlePrefix('Join our');
    setTitleHighlight('team');
    setSubtitle('Build amazing products, work with great people, and grow your career with Meagle 360.');
    setHeroImageUrl('https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=900&q=80');
    setHeroCardBadge('Better Together');
    setHeroCardQuote('Better Code.\nBigger Dreams.');
    setPrimaryColor('#1d68f5');
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 flex flex-col font-sans select-none">
      {/* ── Top Header Navigation Bar (Clean Glass) ────────────── */}
      <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-30 shadow-xs">
        {/* Left: Back & Title */}
        <div className="flex items-center gap-3">
          <Link
            to="/ats/jobs"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-slate-700 font-semibold text-xs transition-all shadow-xs group"
          >
            <ArrowLeft size={15} className="group-hover:-translate-x-0.5 transition-transform text-slate-500" />
            <span>Back to Job Openings</span>
          </Link>

          <div className="h-5 w-[1px] bg-slate-200" />

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-slate-900 tracking-tight">Careers Site Studio</h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Sync
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Customize branding, copy, hero photography & live theme
            </p>
          </div>
        </div>

        {/* Center: Device Switcher (Apple Style Segmented) */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            type="button"
            onClick={() => setViewportMode('desktop')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              viewportMode === 'desktop'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Monitor size={14} className={viewportMode === 'desktop' ? 'text-blue-600' : ''} />
            <span>Silver Display (Desktop)</span>
          </button>
          <button
            type="button"
            onClick={() => setViewportMode('mobile')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              viewportMode === 'mobile'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Smartphone size={14} className={viewportMode === 'mobile' ? 'text-blue-600' : ''} />
            <span>Mobile</span>
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw size={13} />
            <span>Reset</span>
          </button>

          <a
            href="/careers"
            target="_blank"
            rel="noreferrer"
            className="px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
          >
            <ExternalLink size={13} />
            <span>View Live Site</span>
          </a>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{ backgroundColor: primaryColor }}
            className="px-4 py-2 rounded-xl text-white text-xs font-bold shadow-md shadow-blue-500/20 inline-flex items-center gap-1.5 hover:brightness-105 active:scale-98 transition-all"
          >
            {saving ? (
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save size={14} />
            )}
            <span>{saving ? 'Publishing...' : 'Save & Publish'}</span>
          </button>
        </div>
      </header>

      {/* Alerts */}
      {errorMessage && (
        <div className="bg-red-50 text-red-800 border-b border-red-200 px-6 py-2.5 text-xs flex items-center justify-between">
          <span className="flex items-center gap-2 font-medium">
            <AlertCircle size={15} className="text-red-600" /> {errorMessage}
          </span>
          <button onClick={() => setErrorMessage('')} className="text-red-500 hover:text-red-800">✕</button>
        </div>
      )}
      {successMessage && (
        <div className="bg-emerald-50 text-emerald-800 border-b border-emerald-200 px-6 py-2.5 text-xs flex items-center justify-between animate-in fade-in">
          <span className="flex items-center gap-2 font-medium">
            <CheckCircle2 size={15} className="text-emerald-600" /> {successMessage}
          </span>
          <button onClick={() => setSuccessMessage('')} className="text-emerald-500 hover:text-emerald-800">✕</button>
        </div>
      )}

      {/* ── Main Workspace: 2-Column Split View ────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── Left Editor Sidebar (Spacious 460px Clean Light) ── */}
        <aside className="w-[460px] bg-white border-r border-slate-200 flex flex-col shrink-0 overflow-y-auto">
          {/* Sub-Tabs Navigation */}
          <div className="flex border-b border-slate-200 px-5 pt-3 gap-1 shrink-0 bg-slate-50/60">
            {[
              { id: 'brand', label: 'Branding', icon: Building2 },
              { id: 'hero', label: 'Hero Copy', icon: Sparkles },
              { id: 'media', label: 'Photos', icon: Eye },
              { id: 'theme', label: 'Theme Colors', icon: Palette },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold border-b-2 transition-all ${
                    isActive
                      ? 'border-blue-600 text-blue-600 bg-white rounded-t-lg shadow-2xs'
                      : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/60 rounded-t-lg'
                  }`}
                >
                  <Icon size={14} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab Content Body */}
          <div className="p-6 space-y-6 flex-1 overflow-y-auto text-xs text-slate-700">
            {/* Tab 1: Brand & Organization */}
            {activeTab === 'brand' && (
              <div className="space-y-5">
                <div>
                  <label className="block text-slate-800 font-bold mb-1.5">
                    Brand / Organization Display Name
                  </label>
                  <input
                    type="text"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    placeholder="e.g. Meagle 360"
                    className="w-full bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-250 focus:border-blue-500 focus:ring-4 focus:ring-blue-100/60 rounded-xl p-3 text-xs text-slate-900 placeholder-slate-400 outline-none transition-all"
                  />
                  <span className="text-[11px] text-slate-500 mt-1.5 block">
                    Displayed across the header, tab title and candidate notifications.
                  </span>
                </div>

                <div>
                  <label className="block text-slate-800 font-bold mb-1.5">
                    Company Header Logo
                  </label>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <div className="flex items-center gap-4 mb-3.5">
                      <div className="w-20 h-20 rounded-xl border border-dashed border-slate-300 bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-2xs">
                        {logoUrl ? (
                          <img src={logoUrl} alt="Logo" className="w-full h-full object-contain p-1.5" />
                        ) : (
                          <Building2 size={32} className="text-slate-300" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          {logoUrl ? (
                            <>
                              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                              <span>Active Header Logo</span>
                            </>
                          ) : (
                            <>
                              <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />
                              <span>No Logo Uploaded</span>
                            </>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1">
                          PNG, JPG, SVG or WEBP (Max 5MB)
                        </p>
                        {logoUrl && (
                          <button
                            type="button"
                            onClick={handleRemoveLogo}
                            className="mt-2 text-[11px] font-semibold text-rose-600 hover:text-rose-700 inline-flex items-center gap-1 transition-colors"
                          >
                            <Trash2 size={12} />
                            <span>Remove Logo</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {uploadError && (
                      <p className="text-[11px] text-rose-600 mb-2 font-medium">
                        {uploadError}
                      </p>
                    )}

                    <label className={`w-full py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs ${
                      uploadingLogo
                        ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white'
                    }`}>
                      {uploadingLogo ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          <span>Uploading to Cloudinary...</span>
                        </>
                      ) : (
                        <>
                          <UploadCloud size={15} />
                          <span>{logoUrl ? 'Change Logo Photo' : 'Upload Logo Photo'}</span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        disabled={uploadingLogo}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <span className="text-[11px] text-slate-500 mt-1.5 block">
                    Upload your company logo photo directly. It will be hosted securely and appear in your public careers header.
                  </span>
                </div>
              </div>
            )}

            {/* Tab 2: Hero Copy & Headlines */}
            {activeTab === 'hero' && (
              <div className="space-y-5">
                <div>
                  <label className="block text-slate-800 font-bold mb-1.5">
                    Hero Badge Text
                  </label>
                  <input
                    type="text"
                    value={badgeText}
                    onChange={(e) => setBadgeText(e.target.value)}
                    placeholder="e.g. CAREERS, WE ARE HIRING!"
                    className="w-full bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-250 focus:border-blue-500 focus:ring-4 focus:ring-blue-100/60 rounded-xl p-3 text-xs text-slate-900 placeholder-slate-400 outline-none transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-slate-800 font-bold mb-1.5">Title Prefix</label>
                    <input
                      type="text"
                      value={titlePrefix}
                      onChange={(e) => setTitlePrefix(e.target.value)}
                      placeholder="e.g. Join our"
                      className="w-full bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-250 focus:border-blue-500 focus:ring-4 focus:ring-blue-100/60 rounded-xl p-3 text-xs text-slate-900 placeholder-slate-400 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-800 font-bold mb-1.5">
                      Highlight Word <span style={{ color: primaryColor }}>(Colored)</span>
                    </label>
                    <input
                      type="text"
                      value={titleHighlight}
                      onChange={(e) => setTitleHighlight(e.target.value)}
                      placeholder="e.g. team, revolution"
                      className="w-full bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-250 focus:border-blue-500 focus:ring-4 focus:ring-blue-100/60 rounded-xl p-3 text-xs text-slate-900 placeholder-slate-400 outline-none transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-800 font-bold mb-1.5">
                    Hero Subtitle / Mission Statement
                  </label>
                  <textarea
                    rows={3}
                    value={subtitle}
                    onChange={(e) => setSubtitle(e.target.value)}
                    placeholder="Build amazing products, work with great people..."
                    className="w-full bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-250 focus:border-blue-500 focus:ring-4 focus:ring-blue-100/60 rounded-xl p-3 text-xs text-slate-900 placeholder-slate-400 outline-none transition-all"
                  />
                </div>
              </div>
            )}

            {/* Tab 3: Media & Quotes */}
            {activeTab === 'media' && (
              <div className="space-y-5">
                <div>
                  <label className="block text-slate-800 font-bold mb-1.5">Custom Photo URL</label>
                  <input
                    type="url"
                    value={heroImageUrl}
                    onChange={(e) => setHeroImageUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-250 focus:border-blue-500 focus:ring-4 focus:ring-blue-100/60 rounded-xl p-3 text-xs text-slate-900 placeholder-slate-400 outline-none transition-all"
                  />
                </div>

                {/* Visual Thumbnail Presets */}
                <div className="space-y-2.5">
                  <span className="text-xs text-slate-800 font-bold block">
                    Curated Photo Presets (Click to apply):
                  </span>
                  <div className="grid grid-cols-2 gap-3">
                    {PRESET_IMAGES.map((p) => {
                      const isSelected = heroImageUrl === p.url;
                      return (
                        <button
                          key={p.name}
                          type="button"
                          onClick={() => setHeroImageUrl(p.url)}
                          className={`group rounded-xl border text-left overflow-hidden transition-all ${
                            isSelected
                              ? 'border-blue-600 ring-2 ring-blue-500/30 shadow-xs'
                              : 'border-slate-250 hover:border-slate-350 bg-white hover:shadow-xs'
                          }`}
                        >
                          <img src={p.url} alt={p.name} className="w-full h-20 object-cover" />
                          <div className="p-2.5 bg-white">
                            <span className="font-bold text-xs text-slate-900 block truncate">{p.name}</span>
                            <span className="text-[10px] text-slate-400">
                              {isSelected ? '✓ Active Photo' : 'Select'}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3.5 pt-3 border-t border-slate-200">
                  <div>
                    <label className="block text-slate-800 font-bold mb-1.5">Floating Badge</label>
                    <input
                      type="text"
                      value={heroCardBadge}
                      onChange={(e) => setHeroCardBadge(e.target.value)}
                      placeholder="e.g. Better Together"
                      className="w-full bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-250 focus:border-blue-500 focus:ring-4 focus:ring-blue-100/60 rounded-xl p-2.5 text-xs text-slate-900 placeholder-slate-400 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-800 font-bold mb-1.5">Floating Quote</label>
                    <textarea
                      rows={2}
                      value={heroCardQuote}
                      onChange={(e) => setHeroCardQuote(e.target.value)}
                      placeholder="Better Code.\nBigger Dreams."
                      className="w-full bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-250 focus:border-blue-500 focus:ring-4 focus:ring-blue-100/60 rounded-xl p-2.5 text-xs text-slate-900 placeholder-slate-400 outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Tab 4: Colors & Theme */}
            {activeTab === 'theme' && (
              <div className="space-y-5">
                <div>
                  <label className="block text-slate-800 font-bold mb-2">
                    Primary Brand Color Swatches
                  </label>
                  <div className="grid grid-cols-3 gap-2.5">
                    {PRESET_COLORS.map((c) => {
                      const isSelected = primaryColor === c.hex;
                      return (
                        <button
                          key={c.hex}
                          type="button"
                          onClick={() => setPrimaryColor(c.hex)}
                          className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all ${
                            isSelected
                              ? 'bg-blue-50/80 border-blue-500 shadow-2xs text-blue-900 font-bold'
                              : 'bg-white border-slate-250 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span
                            className="w-4 h-4 rounded-full shrink-0 shadow-xs border border-white"
                            style={{ backgroundColor: c.hex }}
                          />
                          <span className="text-[11px] truncate">{c.name.split(' ')[0]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200">
                  <label className="block text-slate-800 font-bold mb-1.5">
                    Custom Hex Color
                  </label>
                  <div className="flex items-center gap-2.5">
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="w-10 h-10 rounded-xl bg-transparent border-0 cursor-pointer shadow-xs"
                    />
                    <input
                      type="text"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="flex-1 bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-250 focus:border-blue-500 focus:ring-4 focus:ring-blue-100/60 rounded-xl p-2.5 text-xs text-slate-900 font-mono uppercase outline-none"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* ── Right Main Area: LIVE PREVIEW VIEWPORT (DESKTOP OR IPHONE) ─ */}
        <main className="flex-1 bg-[#f1f5f9]/70 p-6 sm:p-8 overflow-y-auto flex flex-col items-center justify-start min-h-[calc(100vh-64px)]">
          {viewportMode === 'desktop' ? (
            /* ── DESKTOP VIEW: SILVER STUDIO DISPLAY ──────────────── */
            <>
              {/* Top Status Bar (No 60%/80% clutter) */}
              <div className="flex items-center justify-between w-full max-w-[980px] mb-3.5 px-1">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <Tv size={16} className="text-blue-600" />
                    <span>Silver Studio Display • 4K Retina</span>
                  </div>
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold flex items-center gap-1.5 shadow-2xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live Preview (Fit to Screen)
                  </span>
                </div>
              </div>

              {/* Silver Monitor Unit */}
              <div className="tv-monitor-container">
                <div className="tv-chassis transition-all duration-300">
                  {/* Silver Bezel Top */}
                  <div className="tv-bezel-top">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block shadow-2xs" />
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block shadow-2xs" />
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block shadow-2xs" />
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="tv-sensor-dot" />
                      <span className="text-[10px] font-mono text-slate-600 bg-white px-3 py-0.5 rounded-md border border-slate-200 shadow-2xs">
                        https://{brandName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'meagle360'}.meagle360.com/careers
                      </span>
                    </div>

                    <div className="tv-live-indicator">
                      <span className="tv-live-dot" />
                      <span>LIVE FEED</span>
                    </div>
                  </div>

                  {/* Screen Viewport (Zero Scroll, Full Page Fit) */}
                  <div
                    ref={screenContainerRef}
                    className="tv-screen-viewport no-scroll"
                    style={{ height: `${Math.round(720 * currentScale)}px` }}
                  >
                    <div
                      className="tv-virtual-canvas careers-wrapper"
                      style={{
                        transform: `scale(${currentScale})`,
                        transformOrigin: 'top left',
                        width: '1200px',
                        minHeight: 'auto',
                      }}
                    >
                      {/* Header */}
                      <header className="careers-header" style={{ height: '54px' }}>
                        <div className="careers-header-container" style={{ maxWidth: '1160px' }}>
                          <div className="careers-brand">
                            {logoUrl ? (
                              <img src={logoUrl} alt={brandName} className="careers-brand-logo" style={{ maxHeight: '32px' }} />
                            ) : (
                              <div className="careers-brand-fallback" style={{ width: '32px', height: '32px', fontSize: '16px' }}>M</div>
                            )}
                            <span className="careers-brand-name" style={{ fontSize: '18px' }}>{brandName}</span>
                          </div>
                        </div>
                      </header>

                      {/* Hero Banner */}
                      <section className="careers-hero" style={{ padding: '20px 0 24px 0' }}>
                        <div className="careers-hero-container" style={{ maxWidth: '1160px', gridTemplateColumns: '1fr 1.25fr', gap: '32px' }}>
                          <div className="careers-hero-left">
                            <div
                              className="careers-pill-badge"
                              style={{
                                color: primaryColor,
                                backgroundColor: `${primaryColor}18`,
                                padding: '3px 10px',
                                fontSize: '10px',
                                marginBottom: '10px',
                              }}
                            >
                              <span>{badgeText}</span>
                            </div>

                            <h1 className="careers-hero-title" style={{ fontSize: '2.3rem', marginBottom: '10px' }}>
                              {titlePrefix}{' '}
                              <span className="highlight" style={{ color: primaryColor }}>
                                {titleHighlight}
                              </span>
                            </h1>

                            <p className="careers-hero-subtitle" style={{ fontSize: '13px', marginBottom: '18px', lineHeight: 1.45 }}>
                              {subtitle}
                            </p>

                            <div className="careers-search-bar" style={{ padding: '4px 4px 4px 12px', maxWidth: '440px' }}>
                              <Search size={16} color="#94a3b8" />
                              <input type="text" readOnly placeholder="Search by job title (e.g. Frontend, Designer...)" style={{ fontSize: '13px' }} />
                              <button
                                type="button"
                                className="careers-search-btn"
                                style={{ backgroundColor: primaryColor, padding: '7px 18px', fontSize: '12px' }}
                              >
                                Search
                              </button>
                            </div>
                          </div>

                          <div className="careers-hero-visual">
                            <div className="careers-hero-card" style={{ height: '250px', maxWidth: '580px', borderRadius: '22px' }}>
                              <img src={heroImageUrl} alt="Workspace" className="careers-hero-card-img" />
                              <div className="careers-hero-card-badge" style={{ top: '12px', right: '12px', padding: '4px 10px', fontSize: '10px' }}>
                                {heroCardBadge}
                              </div>
                              <div className="careers-hero-card-content" style={{ bottom: '0', left: '0', right: '0', padding: '32px 18px 14px 18px' }}>
                                <div className="careers-hero-card-quote" style={{ fontSize: '24px', whiteSpace: 'pre-line' }}>
                                  {heroCardQuote}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </section>

                      {/* Main Content: Filter Bar & Job Cards */}
                      <main className="careers-main" style={{ maxWidth: '1160px', padding: '16px 20px 24px 20px' }}>
                        <div className="careers-filters-bar" style={{ marginBottom: '16px' }}>
                          <div className="careers-filter-group" style={{ gap: '12px' }}>
                            <div className="careers-filter-col" style={{ maxWidth: '220px' }}>
                              <label className="careers-filter-label" style={{ fontSize: '11px', marginBottom: '4px' }}>Department</label>
                              <div className="careers-select-wrap">
                                <select className="careers-select" defaultValue="ALL" style={{ padding: '7px 28px 7px 10px', fontSize: '12px' }}>
                                  <option value="ALL">All Departments</option>
                                  <option>Engineering</option>
                                  <option>Design</option>
                                  <option>People & Culture</option>
                                </select>
                                <ChevronDown size={14} className="careers-select-arrow" />
                              </div>
                            </div>

                            <div className="careers-filter-col" style={{ maxWidth: '220px' }}>
                              <label className="careers-filter-label" style={{ fontSize: '11px', marginBottom: '4px' }}>Location</label>
                              <div className="careers-select-wrap">
                                <select className="careers-select" defaultValue="ALL" style={{ padding: '7px 28px 7px 10px', fontSize: '12px' }}>
                                  <option value="ALL">All Locations</option>
                                  <option>Bengaluru, India</option>
                                  <option>Remote</option>
                                </select>
                                <ChevronDown size={14} className="careers-select-arrow" />
                              </div>
                            </div>

                            <div className="careers-filter-col" style={{ maxWidth: '220px' }}>
                              <label className="careers-filter-label" style={{ fontSize: '11px', marginBottom: '4px' }}>Job Type</label>
                              <div className="careers-select-wrap">
                                <select className="careers-select" defaultValue="ALL" style={{ padding: '7px 28px 7px 10px', fontSize: '12px' }}>
                                  <option value="ALL">All Types</option>
                                  <option>Full-time</option>
                                  <option>Contract</option>
                                </select>
                                <ChevronDown size={14} className="careers-select-arrow" />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Grid: 4 columns so all 8 cards fit in 2 rows without scrolling */}
                        <div
                          className="careers-jobs-grid"
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                            gap: '12px',
                          }}
                        >
                          {PREVIEW_JOBS.slice(0, 8).map((job) => {
                            const CatIcon = job.icon;
                            return (
                              <div key={job.id} className="job-card" style={{ padding: '12px', borderRadius: '12px' }}>
                                <div>
                                  <div className="job-card-header" style={{ marginBottom: '8px' }}>
                                    <div className={`job-icon-squircle ${job.cssClass}`} style={{ width: '32px', height: '32px' }}>
                                      <CatIcon size={16} />
                                    </div>
                                    <div className="job-title-group">
                                      <h4 className="job-title" style={{ fontSize: '12px', lineHeight: 1.25 }}>{job.title}</h4>
                                      <p className="job-dept" style={{ fontSize: '10px' }}>{job.department_name}</p>
                                    </div>
                                  </div>

                                  <div className="job-meta-row" style={{ marginBottom: '8px' }}>
                                    <div className="job-location" style={{ fontSize: '10px' }}>
                                      <MapPin size={11} color="#64748b" />
                                      <span>{job.location}</span>
                                    </div>

                                    <div className="job-type-pill" style={{ padding: '2px 6px', fontSize: '9px' }}>
                                      <span>{job.job_type}</span>
                                    </div>
                                  </div>
                                </div>

                                <div className="job-card-footer" style={{ paddingTop: '8px' }}>
                                  <div className="job-date" style={{ fontSize: '10px' }}>
                                    <Clock size={10} color="#94a3b8" />
                                    <span>3d ago</span>
                                  </div>

                                  <button
                                    type="button"
                                    className="job-apply-btn"
                                    style={{ backgroundColor: primaryColor, padding: '4px 10px', fontSize: '10px' }}
                                  >
                                    Apply
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </main>
                    </div>
                  </div>

                  {/* Silver Bezel Bottom */}
                  <div className="tv-bezel-bottom">
                    <span className="tv-brand-badge">MEAGLE VISION PRO • 4K DISPLAY</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      1200 × 720 ({Math.round(currentScale * 100)}%)
                    </span>
                  </div>
                </div>

                {/* Stand for Silver Monitor */}
                <div className="flex flex-col items-center select-none pointer-events-none -mt-[1px]">
                  <div className="tv-stand-neck" />
                  <div className="tv-stand-base" />
                </div>
              </div>
            </>
          ) : (
            /* ── MOBILE VIEW: REALISTIC IPHONE 16 PRO CHASSIS ──────── */
            <>
              {/* Top Status Bar */}
              <div className="flex items-center justify-between w-full max-w-[375px] mb-3.5 px-1">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <Smartphone size={16} className="text-blue-600" />
                    <span>iPhone 16 Pro • Super Retina</span>
                  </div>
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold flex items-center gap-1.5 shadow-2xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live Mobile Feed
                  </span>
                </div>
              </div>

              {/* Realistic iPhone 16 Pro Chassis */}
              <div className="iphone-frame">
                {/* iOS Status Bar + Dynamic Island */}
                <div className="iphone-status-bar">
                  <span>9:41</span>
                  <div className="iphone-dynamic-island">
                    <div className="iphone-camera-dot" />
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                    <span>5G</span>
                    <div className="w-4 h-2.5 border border-slate-700 rounded-xs p-[1px] flex items-center">
                      <div className="h-full bg-emerald-500 rounded-[1px] w-full" />
                    </div>
                  </div>
                </div>

                {/* Scrollable iPhone Screen (Hidden Scrollbar) */}
                <div className="iphone-screen">
                  {/* Mobile Header */}
                  <header className="bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between sticky top-0 z-30">
                    <div className="flex items-center gap-2">
                      {logoUrl ? (
                        <img src={logoUrl} alt={brandName} className="h-7 w-auto object-contain rounded" />
                      ) : (
                        <div className="w-7 h-7 rounded-lg bg-slate-900 text-white font-black text-xs flex items-center justify-center">
                          M
                        </div>
                      )}
                      <span className="font-extrabold text-sm text-slate-900">{brandName}</span>
                    </div>
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-600 uppercase">
                      {badgeText}
                    </span>
                  </header>

                  {/* Mobile Hero */}
                  <section className="bg-gradient-to-b from-blue-50/50 to-white px-5 py-6 text-center border-b border-slate-100">
                    <h1 className="text-2xl font-black text-slate-900 leading-tight mb-2">
                      {titlePrefix}{' '}
                      <span style={{ color: primaryColor }}>{titleHighlight}</span>
                    </h1>
                    <p className="text-xs text-slate-600 mb-4 leading-relaxed">
                      {subtitle}
                    </p>

                    {/* Hero Image Card */}
                    <div className="relative rounded-2xl overflow-hidden shadow-xs border border-slate-200/80 mb-4 h-36">
                      <img src={heroImageUrl} alt="Hero" className="w-full h-full object-cover" />
                      <div className="absolute top-2 right-2 bg-white/90 backdrop-blur-md px-2.5 py-0.5 rounded-full text-[9px] font-bold text-slate-800 shadow-2xs">
                        {heroCardBadge}
                      </div>
                      <div className="absolute bottom-2 right-3 text-right">
                        <span className="text-sm font-bold text-white drop-shadow-md whitespace-pre-line font-serif italic">
                          {heroCardQuote}
                        </span>
                      </div>
                    </div>

                    {/* Mobile Search */}
                    <div className="flex items-center bg-white border border-slate-250 rounded-xl p-1.5 shadow-2xs">
                      <Search size={14} className="text-slate-400 ml-2 mr-1" />
                      <input
                        type="text"
                        readOnly
                        placeholder="Search open roles..."
                        className="w-full text-xs text-slate-800 bg-transparent outline-none"
                      />
                      <button
                        type="button"
                        style={{ backgroundColor: primaryColor }}
                        className="text-white text-[11px] font-bold px-3 py-1.5 rounded-lg shrink-0"
                      >
                        Find
                      </button>
                    </div>
                  </section>

                  {/* Mobile Filter & Job Openings */}
                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">Open Positions</span>
                      <span className="text-[11px] text-slate-500 font-semibold">{PREVIEW_JOBS.length} jobs</span>
                    </div>

                    {/* Job Cards */}
                    <div className="space-y-2.5">
                      {PREVIEW_JOBS.slice(0, 6).map((job) => {
                        const CatIcon = job.icon;
                        return (
                          <div key={job.id} className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs space-y-2.5">
                            <div className="flex items-start gap-2.5">
                              <div className={`job-icon-squircle ${job.cssClass}`} style={{ width: '32px', height: '32px' }}>
                                <CatIcon size={16} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="text-xs font-bold text-slate-900 truncate">{job.title}</h4>
                                <p className="text-[11px] text-slate-500">{job.department_name}</p>
                              </div>
                            </div>

                            <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[10px]">
                              <div className="flex items-center gap-1 text-slate-500">
                                <MapPin size={11} />
                                <span>{job.location}</span>
                              </div>
                              <button
                                type="button"
                                style={{ backgroundColor: primaryColor }}
                                className="text-white font-bold px-3 py-1 rounded-lg shadow-2xs"
                              >
                                Apply
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* iPhone Bottom Bar: Safari Capsule & Home Indicator */}
                <div className="iphone-bottom-bar">
                  <div className="iphone-safari-capsule">
                    <span className="text-slate-400">🔒</span>
                    <span>meagle360.com/careers</span>
                  </div>
                  <div className="iphone-home-indicator" />
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
