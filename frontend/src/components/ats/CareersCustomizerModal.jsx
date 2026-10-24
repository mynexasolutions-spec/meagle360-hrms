import React, { useState, useEffect } from 'react';
import {
  Palette,
  X,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  RotateCcw,
  Image as ImageIcon,
  Eye,
  Search,
  Building2,
  UploadCloud,
  Trash2,
  Loader2,
} from 'lucide-react';
import { getCareersSettings, updateCareersSettings } from '../../api/ats';
import { uploadCompanyBranding } from '../../api/company';

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
  { name: 'Electric Blue', hex: '#1d68f5' },
  { name: 'Royal Purple', hex: '#7c3aed' },
  { name: 'Emerald Green', hex: '#059669' },
  { name: 'Crimson Rose', hex: '#dc2626' },
  { name: 'Warm Amber', hex: '#d97706' },
  { name: 'Midnight Slate', hex: '#0f172a' },
];

export default function CareersCustomizerModal({ onClose, onSaved }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Form states
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

  // Load current settings
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
    e.preventDefault();
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
        primary_color: primaryColor.trim() || '#1d68f5',
      };

      await updateCareersSettings(payload);
      setSuccessMessage('Careers page settings updated and published successfully!');
      setTimeout(() => setSuccessMessage(''), 4000);
      if (onSaved) onSaved();
    } catch (err) {
      console.error(err);
      setErrorMessage(err.response?.data?.detail || 'Failed to update careers settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden border border-gray-200">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-blue-50 to-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shadow-inner">
              <Palette size={22} />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-gray-900">
                Customize Public Careers Page
              </h3>
              <p className="text-xs text-gray-500">
                Tailor header branding, hero banner headlines, photos, quotes, and colors for your organization.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetDefaults}
              className="btn btn-secondary text-xs py-1.5 px-3 inline-flex items-center gap-1.5 text-gray-600 hover:text-gray-900"
            >
              <RotateCcw size={14} />
              <span>Reset Defaults</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Alerts */}
        {errorMessage && (
          <div className="m-4 p-3 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs font-semibold flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} />
              <span>{errorMessage}</span>
            </div>
            <button onClick={() => setErrorMessage('')} className="text-red-500">
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
            <button onClick={() => setSuccessMessage('')} className="text-emerald-500">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Content Body: Split Layout (Left: Form Inputs, Right: Live Interactive Preview) */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden bg-gray-50">
          {/* ── Left Pane: Settings Form (5 Cols) ────────────────── */}
          <form
            onSubmit={handleSave}
            className="lg:col-span-6 p-5 overflow-y-auto space-y-5 bg-white border-r border-gray-200 text-xs"
          >
            {/* Section 1: Header & Branding */}
            <div className="space-y-3 pb-4 border-b border-gray-100">
              <span className="font-bold uppercase tracking-wider text-gray-500 text-[11px] block">
                1. Header Branding
              </span>

              <div className="space-y-3">
                <div>
                  <label className="block text-gray-700 font-bold mb-1">Brand / Company Name</label>
                  <input
                    type="text"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    placeholder="e.g. Meagle 360"
                    className="w-full p-2.5 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-gray-700 font-bold mb-1.5">Company Header Logo</label>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                    <div className="flex items-center gap-3.5 mb-3">
                      <div className="w-16 h-16 rounded-xl border border-dashed border-slate-300 bg-white flex items-center justify-center overflow-hidden shrink-0">
                        {logoUrl ? (
                          <img src={logoUrl} alt="Logo" className="w-full h-full object-contain p-1" />
                        ) : (
                          <Building2 size={26} className="text-slate-300" />
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
                        <p className="text-[11px] text-slate-500 mt-0.5">PNG, JPG, SVG or WEBP</p>
                        {logoUrl && (
                          <button
                            type="button"
                            onClick={handleRemoveLogo}
                            className="mt-1.5 text-[11px] font-semibold text-rose-600 hover:text-rose-700 inline-flex items-center gap-1"
                          >
                            <Trash2 size={12} />
                            <span>Remove</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {uploadError && (
                      <p className="text-[11px] text-rose-600 mb-2 font-medium">{uploadError}</p>
                    )}

                    <label className={`w-full py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs ${
                      uploadingLogo
                        ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}>
                      {uploadingLogo ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          <span>Uploading...</span>
                        </>
                      ) : (
                        <>
                          <UploadCloud size={14} />
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
                </div>
              </div>
            </div>

            {/* Section 2: Hero Section Headlines */}
            <div className="space-y-3 pb-4 border-b border-gray-100">
              <span className="font-bold uppercase tracking-wider text-gray-500 text-[11px] block">
                2. Hero Headline & Description
              </span>

              <div>
                <label className="block text-gray-700 font-bold mb-1">Top Pill Badge Text</label>
                <input
                  type="text"
                  value={badgeText}
                  onChange={(e) => setBadgeText(e.target.value)}
                  placeholder="e.g. CAREERS, WE ARE HIRING"
                  className="w-full p-2.5 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 font-bold mb-1">Title Prefix</label>
                  <input
                    type="text"
                    value={titlePrefix}
                    onChange={(e) => setTitlePrefix(e.target.value)}
                    placeholder="e.g. Join our"
                    className="w-full p-2.5 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-bold mb-1">
                    Highlight Word <span className="text-blue-600 font-normal">(Colored)</span>
                  </label>
                  <input
                    type="text"
                    value={titleHighlight}
                    onChange={(e) => setTitleHighlight(e.target.value)}
                    placeholder="e.g. team, journey"
                    className="w-full p-2.5 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-700 font-bold mb-1">Subtitle / Tagline</label>
                <textarea
                  rows={2}
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder="Describe your organization's mission and culture..."
                  className="w-full p-2.5 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Section 3: Hero Photo & Quote Card */}
            <div className="space-y-3 pb-4 border-b border-gray-100">
              <span className="font-bold uppercase tracking-wider text-gray-500 text-[11px] block">
                3. Hero Photo & Motivation Card
              </span>

              <div>
                <label className="block text-gray-700 font-bold mb-1">Hero Image URL</label>
                <input
                  type="url"
                  value={heroImageUrl}
                  onChange={(e) => setHeroImageUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full p-2.5 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Presets */}
              <div className="space-y-1">
                <span className="text-[11px] text-gray-400 block font-semibold">Or pick a photo preset:</span>
                <div className="flex flex-wrap gap-2">
                  {PRESET_IMAGES.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => setHeroImageUrl(p.url)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                        heroImageUrl === p.url
                          ? 'bg-blue-50 border-blue-400 text-blue-700'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 font-bold mb-1">Card Floating Badge</label>
                  <input
                    type="text"
                    value={heroCardBadge}
                    onChange={(e) => setHeroCardBadge(e.target.value)}
                    placeholder="e.g. Better Together"
                    className="w-full p-2.5 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-bold mb-1">Whiteboard Quote</label>
                  <input
                    type="text"
                    value={heroCardQuote}
                    onChange={(e) => setHeroCardQuote(e.target.value)}
                    placeholder="e.g. Better Code. Bigger Dreams."
                    className="w-full p-2.5 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Section 4: Brand Accent Color */}
            <div className="space-y-2">
              <span className="font-bold uppercase tracking-wider text-gray-500 text-[11px] block">
                4. Primary Brand Color
              </span>
              <div className="flex items-center gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    title={c.name}
                    onClick={() => setPrimaryColor(c.hex)}
                    style={{ backgroundColor: c.hex }}
                    className={`w-7 h-7 rounded-full transition-transform ${
                      primaryColor === c.hex ? 'scale-125 ring-2 ring-offset-2 ring-gray-400' : 'hover:scale-110'
                    }`}
                  />
                ))}
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-24 p-1.5 text-xs border border-gray-300 rounded-lg text-center font-mono ml-2"
                />
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-3 sticky bottom-0 bg-white">
              <button
                type="button"
                onClick={onClose}
                className="btn btn-secondary text-xs py-2 px-4"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                style={{ backgroundColor: primaryColor }}
                className="btn text-white text-xs py-2 px-5 rounded-xl font-bold shadow-sm inline-flex items-center gap-1.5"
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <CheckCircle2 size={16} />
                )}
                <span>{saving ? 'Publishing...' : 'Save & Publish Changes'}</span>
              </button>
            </div>
          </form>

          {/* ── Right Pane: Real-Time Live Preview (6 Cols) ───────── */}
          <div className="lg:col-span-6 p-6 flex flex-col justify-start overflow-y-auto bg-slate-100/70">
            <div className="flex items-center justify-between mb-3 text-xs text-gray-500 font-semibold">
              <span className="flex items-center gap-1.5">
                <Eye size={15} className="text-blue-600" />
                <span>Live Candidate View Preview</span>
              </span>
              <span className="text-[11px] text-gray-400">Updates in real-time</span>
            </div>

            {/* Simulated Desktop Screen Container */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden text-slate-800">
              {/* Header Preview */}
              <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between bg-white">
                <div className="flex items-center gap-2.5">
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo" className="h-7 w-auto object-contain rounded" />
                  ) : (
                    <div className="w-7 h-7 rounded-lg bg-slate-900 text-white font-black text-xs flex items-center justify-center">
                      {(brandName || 'M')[0].toUpperCase()}
                    </div>
                  )}
                  <span className="text-sm font-bold text-slate-900">{brandName}</span>
                </div>
              </div>

              {/* Hero Preview */}
              <div className="p-6 bg-gradient-to-br from-blue-50/70 via-indigo-50/30 to-white border-b border-gray-100 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                  <div className="md:col-span-7 space-y-2">
                    <span
                      style={{ color: primaryColor, backgroundColor: `${primaryColor}1a` }}
                      className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider inline-block"
                    >
                      {badgeText}
                    </span>

                    <h2 className="text-xl font-extrabold text-slate-900 leading-tight">
                      {titlePrefix}{' '}
                      <span style={{ color: primaryColor }}>
                        {titleHighlight}
                      </span>
                    </h2>

                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      {subtitle}
                    </p>

                    {/* Preview Search Bar */}
                    <div className="bg-white p-1 rounded-xl border border-gray-200 flex items-center shadow-xs max-w-xs">
                      <Search size={14} className="text-gray-400 ml-2" />
                      <input
                        type="text"
                        readOnly
                        placeholder="Search roles..."
                        className="w-full text-[11px] bg-transparent outline-none px-2 py-0.5 text-gray-700"
                      />
                      <button
                        type="button"
                        style={{ backgroundColor: primaryColor }}
                        className="text-white text-[10px] font-bold px-3 py-1 rounded-lg"
                      >
                        Search
                      </button>
                    </div>
                  </div>

                  {/* Visual Card Preview */}
                  <div className="md:col-span-5">
                    <div className="relative rounded-2xl overflow-hidden aspect-[4/3] bg-slate-900 shadow-md">
                      <img
                        src={heroImageUrl}
                        alt="Hero Preview"
                        className="w-full h-full object-cover opacity-80"
                      />
                      <div className="absolute top-2 right-2 px-2 py-0.5 bg-white/20 backdrop-blur-md rounded-full text-[9px] font-bold text-white border border-white/30">
                        {heroCardBadge}
                      </div>
                      <div className="absolute bottom-2 right-2 text-right">
                        <span className="font-serif italic font-bold text-xs text-white drop-shadow whitespace-pre-line leading-none">
                          {heroCardQuote}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-gray-400 text-center mt-3">
              Candidate public link: <code className="bg-gray-200/70 px-1.5 py-0.5 rounded text-gray-700">/careers</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
