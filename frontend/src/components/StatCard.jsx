import { useState } from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

export default function StatCard({ icon: Icon, label, value, trend, trendDirection, color, bgColor }) {
  const [hover, setHover] = useState(false);

  return (
    <div
      className="glass-card"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '20px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '16px',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'default',
        transform: hover ? 'translateY(-3px)' : 'translateY(0)',
        boxShadow: hover ? '0 12px 28px -8px rgba(15, 23, 42, 0.15)' : 'var(--shadow-sm)',
        borderColor: hover ? color : 'var(--border-color)',
      }}
    >
      <div
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: color, opacity: hover ? 1 : 0, transition: 'opacity 0.2s ease',
        }}
      />
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 'var(--radius-md)',
          background: bgColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'transform 0.2s ease',
          transform: hover ? 'scale(1.08)' : 'scale(1)',
        }}
      >
        <Icon size={20} style={{ color }} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4, fontWeight: 500 }}>
          {label}
        </div>
        <div style={{ fontSize: '1.625rem', fontWeight: 800, lineHeight: 1.2, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
          {value}
        </div>
        {trend && (
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 3, marginTop: 6,
              fontSize: '0.6875rem', fontWeight: 600,
              color: trendDirection === 'down' ? 'var(--accent-rose)' : 'var(--accent-emerald)',
            }}
          >
            {trendDirection === 'down' ? <ArrowDownRight size={12} /> : <ArrowUpRight size={12} />}
            {trend}
          </div>
        )}
      </div>
    </div>
  );
}
