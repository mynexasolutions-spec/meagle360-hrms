import { useState, useEffect } from 'react';
import {
  Crown,
  Sparkles,
  Check,
  Users,
  Gift,
  Tag,
  Zap,
  ShieldCheck,
  CheckCircle2,
  Lock,
  ArrowRight,
  Receipt,
  AlertTriangle,
  Mail,
  HelpCircle,
} from 'lucide-react';
import Modal from '../components/Modal';
import { getMySubscription } from '../api/company';
import LoadingScreen from '../components/LoadingScreen';

const PLANS = [
  {
    id: 'quarterly',
    tierKey: 'quarterly',
    name: 'Quarterly Plan',
    duration: '3 Months',
    subtitle: 'Ideal for agile teams & short-term workforce planning',
    price: 4999,
    period: '/ quarter',
    billingNote: 'Billed every 3 months',
    savings: null,
    population: 'Up to 50',
    populationColor: { bg: '#fef3c7', border: '#fde68a', text: '#92400e', icon: '#d97706' },
    isPopular: false,
    perksHeader: 'Included Plan Perks',
    perks: [
      { icon: Gift, text: '+2 Days Bonus Validity Free on Signup', highlight: true },
      { icon: Tag, text: '10% Off Renewal Discount Coupon Code' },
      { icon: Zap, text: 'Standard Email & In-App Helpdesk Support (24h SLA)' },
      { icon: Users, text: 'Core Directory, Attendance & Automated Leave Tracking' },
    ],
    buttonText: 'Choose Quarterly',
    buttonVariant: 'outline',
  },
  {
    id: 'half_yearly',
    tierKey: 'half_yearly',
    name: 'Half-Yearly Plan',
    duration: '6 Months',
    subtitle: 'Best balance of team flexibility and operational cost efficiency',
    price: 8999,
    period: '/ 6 months',
    billingNote: 'Billed every 6 months',
    savings: 'Save 10% vs Quarterly',
    population: 'Up to 100',
    populationColor: { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af', icon: '#2563eb' },
    isPopular: true,
    perksHeader: 'Exclusive Half-Yearly Perks',
    perks: [
      { icon: Gift, text: '+1 Week Bonus Validity Free on Activation', highlight: true },
      { icon: Tag, text: '₹1,000 Cloud Document & Payslip Storage Credits' },
      { icon: Zap, text: 'Priority WhatsApp & Phone Support (2h Response SLA)' },
      { icon: Users, text: 'Full Shift Roster, Payroll & Expense Reimbursement Queue' },
    ],
    buttonText: 'Choose Half-Yearly',
    buttonVariant: 'primary',
  },
  {
    id: 'yearly',
    tierKey: 'yearly',
    name: 'Annual Plan',
    duration: '12 Months',
    subtitle: 'Unrestricted enterprise scale for established companies',
    price: 15999,
    period: '/ year',
    billingNote: 'Billed annually',
    savings: 'Maximum Savings (20% Off)',
    population: 'Unlimited',
    populationColor: { bg: '#ecfdf5', border: '#a7f3d0', text: '#065f46', icon: '#059669' },
    isPopular: false,
    perksHeader: 'Enterprise VIP Perks',
    perks: [
      { icon: Gift, text: '+1 Full Month Bonus Validity Free (13 Months Total)', highlight: true },
      { icon: Tag, text: '₹5,000 Custom Branding & Onboarding Setup Credit' },
      { icon: Zap, text: 'Dedicated Account Manager & 24/7 VIP SLA Guarantee' },
      { icon: Users, text: 'Offer & Relieving Letter Studios + Complete Data Audit Logs' },
    ],
    buttonText: 'Choose Annual',
    buttonVariant: 'outline',
  },
];

function formatTier(tier) {
  if (!tier) return 'Unknown';
  switch (tier.toLowerCase()) {
    case 'trial':
      return 'Trial';
    case 'quarterly':
      return 'Quarterly';
    case 'half_yearly':
      return 'Half-Yearly';
    case 'yearly':
      return 'Yearly';
    default:
      return tier.charAt(0).toUpperCase() + tier.slice(1);
  }
}

function formatDate(dateStr) {
  if (!dateStr) return 'No expiry set';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export default function Subscriptions() {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);

  useEffect(() => {
    getMySubscription()
      .then((res) => {
        setSubscription(res.data);
      })
      .catch((err) => {
        if (err.response?.status === 403) {
          setAccessDenied(true);
        } else if (err.response?.status === 402 && err.response?.data) {
          setSubscription(err.response.data);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <LoadingScreen subtitle="Loading subscription details..." />;
  }

  if (accessDenied) {
    return (
      <div className="animate-fade-in" style={{ maxWidth: 560, margin: '60px auto', textAlign: 'center', padding: '0 20px' }}>
        <div
          style={{
            background: '#ffffff',
            borderRadius: 24,
            padding: '48px 32px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 10px 30px -10px rgba(15, 23, 42, 0.08)',
          }}
        >
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: 18,
              background: '#f1f5f9',
              color: '#475569',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 18px',
            }}
          >
            <ShieldCheck size={32} />
          </div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>
            Access Restricted
          </h2>
          <p style={{ color: '#64748b', fontSize: '0.925rem', lineHeight: 1.5, margin: 0 }}>
            Only Organization Administrators can view or manage subscription and plan tracking details.
          </p>
        </div>
      </div>
    );
  }

  const isExpired = subscription?.is_expired;
  const daysRemaining = subscription?.days_remaining != null ? Math.max(subscription.days_remaining, 0) : null;
  const currentTier = subscription?.plan_tier?.toLowerCase();

  return (
    <div className="animate-fade-in" style={{ maxWidth: 1180, margin: '0 auto', paddingBottom: 48 }}>
      
      {/* Expired Global Alert Banner */}
      {isExpired && (
        <div
          style={{
            background: '#fef2f2',
            border: '1.5px solid #fecaca',
            borderRadius: 20,
            padding: '18px 24px',
            margin: '0 0 32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 16,
            boxShadow: '0 6px 20px rgba(220, 38, 38, 0.1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 280 }}>
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: 14,
                background: '#fee2e2',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <AlertTriangle size={24} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#991b1b', letterSpacing: '-0.01em' }}>
                Your plan has ended — purchase a plan to continue.
              </div>
              <div style={{ fontSize: '0.8125rem', color: '#b91c1c', marginTop: 2 }}>
                Expired on {formatDate(subscription?.plan_ends_at)}. Please contact our support team to reactivate access.
              </div>
            </div>
          </div>
          <a
            href="mailto:support@meagle360.com?subject=Plan%20Renewal%20Request%20-%20Meagle360"
            className="btn btn-primary"
            style={{
              background: '#dc2626',
              borderColor: '#dc2626',
              padding: '11px 20px',
              fontSize: '0.875rem',
              fontWeight: 700,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)',
            }}
          >
            <Mail size={16} /> Contact to Renew
          </a>
        </div>
      )}

      {/* Page Header */}
      <div style={{ textAlign: 'center', maxWidth: 680, margin: '0 auto 36px', paddingTop: 10 }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 16px',
            borderRadius: 9999,
            background: '#eff6ff',
            border: '1px solid #dbeafe',
            color: '#2563eb',
            fontWeight: 700,
            fontSize: '0.78125rem',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            marginBottom: 14,
            boxShadow: '0 2px 8px rgba(37, 99, 235, 0.08)',
          }}
        >
          <Sparkles size={14} />
          <span>Meagle360 Organization Plans</span>
        </div>

        <h1
          style={{
            fontSize: 'clamp(1.75rem, 5vw, 2.35rem)',
            fontWeight: 800,
            color: '#0f172a',
            lineHeight: 1.2,
            letterSpacing: '-0.02em',
            marginBottom: 12,
          }}
        >
          Transparent Pricing for Modern Workforces
        </h1>

        <p style={{ color: '#64748b', fontSize: '1rem', lineHeight: 1.5 }}>
          Choose the ideal billing cycle tailored to your organization size with premium perks and guaranteed SLA.
        </p>

        {/* Live Persistent Tracker Top Badge */}
        {subscription && (
          <div
            style={{
              marginTop: 20,
              padding: '10px 22px',
              borderRadius: 9999,
              background: isExpired ? '#fef2f2' : '#ecfdf5',
              border: isExpired ? '1px solid #fecaca' : '1px solid #a7f3d0',
              color: isExpired ? '#991b1b' : '#065f46',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 12,
              fontWeight: 600,
              fontSize: '0.875rem',
              flexWrap: 'wrap',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {isExpired ? (
                <AlertTriangle size={16} style={{ color: '#dc2626' }} />
              ) : (
                <CheckCircle2 size={16} style={{ color: '#10b981' }} />
              )}
              <span>
                Active Plan: <strong>{formatTier(subscription.plan_tier)}</strong>
              </span>
            </span>

            {subscription.plan_ends_at ? (
              <>
                <span style={{ opacity: 0.5 }}>•</span>
                <span>
                  Expires: <strong>{formatDate(subscription.plan_ends_at)}</strong>
                </span>
                <span style={{ opacity: 0.5 }}>•</span>
                <span
                  style={{
                    background: isExpired ? '#fee2e2' : '#d1fae5',
                    padding: '2px 10px',
                    borderRadius: 9999,
                    fontWeight: 700,
                    color: isExpired ? '#dc2626' : '#047857',
                  }}
                >
                  {isExpired
                    ? 'Expired'
                    : `${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} left`}
                </span>
              </>
            ) : (
              <>
                <span style={{ opacity: 0.5 }}>•</span>
                <span style={{ color: '#64748b', fontStyle: 'italic' }}>No expiry set</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Pricing Cards Grid (3 Columns — Quarterly, Half-Yearly, Yearly) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 24,
          alignItems: 'stretch',
        }}
      >
        {PLANS.map((plan) => {
          const isCurrentActive = currentTier === plan.tierKey && !isExpired;
          return (
            <div
              key={plan.id}
              style={{
                background: '#ffffff',
                borderRadius: 24,
                border: plan.isPopular ? '2px solid #2563eb' : '1.5px solid #e2e8f0',
                padding: '32px 28px',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                boxShadow: plan.isPopular
                  ? '0 16px 36px -10px rgba(37, 99, 235, 0.22)'
                  : '0 4px 20px -4px rgba(15, 23, 42, 0.05)',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              }}
            >
              {/* Popular Ribbon */}
              {plan.isPopular && (
                <div
                  style={{
                    position: 'absolute',
                    top: -14,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                    color: '#ffffff',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    letterSpacing: '0.04em',
                    padding: '5px 18px',
                    borderRadius: 9999,
                    boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <Crown size={13} /> Most Popular
                </div>
              )}

              {/* Card Top Title & Duration */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    {plan.name}
                  </h2>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      padding: '3px 10px',
                      borderRadius: 8,
                      background: plan.isPopular ? '#dbeafe' : '#f1f5f9',
                      color: plan.isPopular ? '#1e40af' : '#475569',
                    }}
                  >
                    {plan.duration}
                  </span>
                </div>

                <p style={{ fontSize: '0.8125rem', color: '#64748b', margin: '0 0 18px 0', lineHeight: 1.4 }}>
                  {plan.subtitle}
                </p>

                {/* Price */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 2 }}>
                  <span
                    style={{
                      fontSize: '2.35rem',
                      fontWeight: 800,
                      color: plan.isPopular ? '#2563eb' : '#0f172a',
                      letterSpacing: '-0.02em',
                    }}
                  >
                    ₹{plan.price.toLocaleString('en-IN')}
                  </span>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#64748b' }}>
                    {plan.period}
                  </span>
                </div>

                <div
                  style={{
                    fontSize: '0.75rem',
                    color: plan.savings ? (plan.isPopular ? '#2563eb' : '#059669') : '#94a3b8',
                    fontWeight: plan.savings ? 700 : 500,
                    marginBottom: 18,
                  }}
                >
                  {plan.savings || plan.billingNote}
                </div>

                {/* Workforce Population Badge */}
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 14px',
                    borderRadius: 12,
                    background: plan.populationColor.bg,
                    border: `1px solid ${plan.populationColor.border}`,
                    color: plan.populationColor.text,
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    width: '100%',
                    boxSizing: 'border-box',
                    marginBottom: 20,
                  }}
                >
                  <Users size={17} style={{ color: plan.populationColor.icon, flexShrink: 0 }} />
                  <span><strong>{plan.population}</strong> Employees Limit</span>
                </div>

                {/* Perks Section */}
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 18, marginBottom: 24 }}>
                  <div
                    style={{
                      fontSize: '0.71875rem',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: plan.isPopular ? '#2563eb' : '#94a3b8',
                      marginBottom: 14,
                    }}
                  >
                    {plan.perksHeader}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {plan.perks.map((perk, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <div
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 6,
                            background: perk.highlight
                              ? (plan.isPopular ? '#eff6ff' : '#fef3c7')
                              : (plan.isPopular ? '#f0fdf4' : '#f8fafc'),
                            color: perk.highlight
                              ? (plan.isPopular ? '#2563eb' : '#d97706')
                              : '#2563eb',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            marginTop: 1,
                          }}
                        >
                          <Check size={14} strokeWidth={2.8} />
                        </div>
                        <span
                          style={{
                            fontSize: '0.875rem',
                            color: perk.highlight ? '#0f172a' : '#334155',
                            fontWeight: perk.highlight ? 700 : 500,
                            lineHeight: 1.45,
                          }}
                        >
                          {perk.text}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* CTA Button */}
              <div style={{ marginTop: 'auto', paddingTop: 8 }}>
                <button
                  onClick={() => setSelectedPlan(plan)}
                  style={{
                    width: '100%',
                    padding: '13px 20px',
                    borderRadius: 14,
                    fontWeight: 700,
                    fontSize: '0.925rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    transition: 'all 0.18s ease',
                    ...(plan.buttonVariant === 'primary'
                      ? {
                          background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                          color: '#ffffff',
                          border: 'none',
                          boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)',
                        }
                      : {
                          background: isCurrentActive ? '#ecfdf5' : '#ffffff',
                          color: isCurrentActive ? '#065f46' : '#0f172a',
                          border: isCurrentActive ? '1.5px solid #a7f3d0' : '1.5px solid #cbd5e1',
                        }),
                  }}
                >
                  {isCurrentActive ? (
                    <>
                      <CheckCircle2 size={17} style={{ color: '#10b981' }} /> Current Active Plan
                    </>
                  ) : (
                    <>
                      {plan.buttonText} <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Trust & Guarantee Strip */}
      <div
        style={{
          marginTop: 48,
          padding: '20px 24px',
          borderRadius: 16,
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          flexWrap: 'wrap',
          gap: 16,
          textAlign: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: '#475569', fontWeight: 600 }}>
          <Lock size={16} style={{ color: '#10b981' }} />
          <span>256-bit Bank-grade Encryption</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: '#475569', fontWeight: 600 }}>
          <Zap size={16} style={{ color: '#2563eb' }} />
          <span>Instant Activation via Platform Ops</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: '#475569', fontWeight: 600 }}>
          <Receipt size={16} style={{ color: '#7c3aed' }} />
          <span>GST Invoicing Ready & Tax Compliant</span>
        </div>
      </div>

      {/* Contact & Activation Modal */}
      {selectedPlan && (
        <Modal
          title={`Renew / Upgrade to ${selectedPlan.name}`}
          onClose={() => setSelectedPlan(null)}
        >
          <div>
            <div
              style={{
                padding: '16px 20px',
                background: '#f8fafc',
                borderRadius: 16,
                border: '1px solid #e2e8f0',
                marginBottom: 20,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontWeight: 700, color: '#0f172a' }}>{selectedPlan.name} ({selectedPlan.duration})</span>
                <span style={{ fontWeight: 800, fontSize: '1.2rem', color: '#2563eb' }}>₹{selectedPlan.price.toLocaleString('en-IN')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', color: '#64748b', marginBottom: 4 }}>
                <span>Workforce Capacity:</span>
                <span style={{ fontWeight: 600, color: '#0f172a' }}>{selectedPlan.population} Employees</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', color: '#64748b' }}>
                <span>GST (18% Input Credit):</span>
                <span>Included</span>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
                Included Special Perks:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selectedPlan.perks.map((p, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: '#475569' }}>
                    <Check size={14} style={{ color: '#2563eb' }} />
                    <span>{p.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Renewal Instructions */}
            <div
              style={{
                background: '#eff6ff',
                border: '1px solid #dbeafe',
                borderRadius: 14,
                padding: '14px 16px',
                marginBottom: 24,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.85rem', color: '#1e40af', marginBottom: 6 }}>
                <HelpCircle size={16} />
                <span>How to activate or renew this plan:</span>
              </div>
              <p style={{ margin: 0, fontSize: '0.8125rem', color: '#3b82f6', lineHeight: 1.45 }}>
                To subscribe or change your company plan, please reach out to your Meagle360 representative or our 24/7 support desk. Your plan will be updated instantly.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSelectedPlan(null)}
              >
                Close
              </button>
              <a
                href={`mailto:support@meagle360.com?subject=${encodeURIComponent(`Plan Upgrade Request: ${selectedPlan.name}`)}&body=${encodeURIComponent(`Hello Meagle360 Team,\n\nWe would like to renew/upgrade our organization subscription to the ${selectedPlan.name} (₹${selectedPlan.price.toLocaleString('en-IN')}). Please provide the renewal details.\n\nThank you!`)}`}
                className="btn btn-primary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  textDecoration: 'none',
                  padding: '10px 18px',
                }}
              >
                <Mail size={16} />
                Contact Support to Renew
              </a>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
