import { useState } from 'react';
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
  CreditCard,
  Building2,
  Lock,
  ArrowRight,
  Receipt,
  Clock,
} from 'lucide-react';
import Modal from '../components/Modal';

const PLANS = [
  {
    id: 'quarterly',
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
    id: 'annual',
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

export default function Subscriptions() {
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [subscribedPlan, setSubscribedPlan] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  const handleOpenCheckout = (plan) => {
    setSelectedPlan(plan);
    setPaymentSuccess(false);
  };

  const handleConfirmSubscription = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setPaymentSuccess(true);
      setSubscribedPlan(selectedPlan);
    }, 1200);
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: 1180, margin: '0 auto', paddingBottom: 48 }}>
      
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

        {subscribedPlan && (
          <div
            style={{
              marginTop: 20,
              padding: '12px 20px',
              borderRadius: 14,
              background: '#ecfdf5',
              border: '1px solid #a7f3d0',
              color: '#065f46',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              fontWeight: 600,
              fontSize: '0.9rem',
            }}
          >
            <CheckCircle2 size={18} style={{ color: '#10b981' }} />
            <span>Active Plan: <strong>{subscribedPlan.name}</strong> ({subscribedPlan.population} Employees)</span>
          </div>
        )}
      </div>

      {/* Pricing Cards Grid (3 Columns) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 24,
          alignItems: 'stretch',
        }}
      >
        {PLANS.map((plan) => {
          const isCurrentActive = subscribedPlan?.id === plan.id;
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

                <div style={{ fontSize: '0.75rem', color: plan.savings ? (plan.isPopular ? '#2563eb' : '#059669') : '#94a3b8', fontWeight: plan.savings ? 700 : 500, marginBottom: 18 }}>
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
                  onClick={() => handleOpenCheckout(plan)}
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
                      <CheckCircle2 size={17} style={{ color: '#10b981' }} /> Current Plan
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
          <span>Instant Activation with Auto-Perks</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: '#475569', fontWeight: 600 }}>
          <Receipt size={16} style={{ color: '#7c3aed' }} />
          <span>GST Invoicing Ready & Tax Compliant</span>
        </div>
      </div>

      {/* Checkout / Activation Modal */}
      {selectedPlan && (
        <Modal
          title={paymentSuccess ? 'Subscription Activated!' : `Subscribe to ${selectedPlan.name}`}
          onClose={() => setSelectedPlan(null)}
        >
          {paymentSuccess ? (
            <div style={{ textAlign: 'center', padding: '20px 10px' }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 20,
                  background: '#ecfdf5',
                  color: '#10b981',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                  boxShadow: '0 8px 20px rgba(16, 185, 129, 0.2)',
                }}
              >
                <CheckCircle2 size={36} />
              </div>
              <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0' }}>
                Plan Successfully Activated!
              </h3>
              <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: 20 }}>
                Your organization is now upgraded to <strong>{selectedPlan.name}</strong> ({selectedPlan.population} Employees) with all exclusive perks applied.
              </p>
              <div
                style={{
                  background: '#f8fafc',
                  borderRadius: 14,
                  padding: '16px',
                  border: '1px solid #e2e8f0',
                  textAlign: 'left',
                  marginBottom: 24,
                }}
              >
                <div style={{ fontSize: '0.78125rem', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', marginBottom: 8 }}>
                  Active Perks Applied to Your Account:
                </div>
                {selectedPlan.perks.map((p, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: '#334155', marginBottom: 6 }}>
                    <Check size={14} style={{ color: '#10b981' }} />
                    <span>{p.text}</span>
                  </div>
                ))}
              </div>
              <button
                className="btn btn-primary"
                style={{ width: '100%', padding: '12px' }}
                onClick={() => setSelectedPlan(null)}
              >
                Return to Dashboard
              </button>
            </div>
          ) : (
            <div>
              <div
                style={{
                  padding: '16px',
                  background: '#f8fafc',
                  borderRadius: 14,
                  border: '1px solid #e2e8f0',
                  marginBottom: 20,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>{selectedPlan.name} ({selectedPlan.duration})</span>
                  <span style={{ fontWeight: 800, fontSize: '1.15rem', color: '#2563eb' }}>₹{selectedPlan.price.toLocaleString('en-IN')}</span>
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

              <div style={{ marginBottom: 24 }}>
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

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setSelectedPlan(null)}
                  disabled={isProcessing}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleConfirmSubscription}
                  disabled={isProcessing}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                >
                  <CreditCard size={16} />
                  {isProcessing ? 'Activating Plan...' : `Confirm & Activate (₹${selectedPlan.price.toLocaleString('en-IN')})`}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
