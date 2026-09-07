import { useState } from 'react';

export default function StatCard({ icon: Icon, label, value, trend, trendDirection, color, bgColor }) {
  const [hover, setHover] = useState(false);

  return (
    <div
      className="glass-card stat-card-root"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
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
        className="stat-card-icon-wrap"
        style={{
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
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="stat-card-label" style={{ color: 'var(--text-muted)', marginBottom: 3, fontWeight: 600 }}>
          {label}
        </div>
        <div className="stat-card-value" style={{ fontWeight: 800, lineHeight: 1.15, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
          {value}
        </div>
        {trend && (
          <div
            className="stat-card-trend"
            style={{
              display: 'flex', alignItems: 'center', gap: 3, marginTop: 4,
              fontWeight: 600,
              color: trendDirection === 'down' ? 'var(--accent-rose)' : 'var(--accent-emerald)',
            }}
          >
            {trend}
          </div>
        )}
      </div>
    </div>
  );
}
