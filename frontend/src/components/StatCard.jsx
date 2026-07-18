export default function StatCard({ icon: Icon, label, value, trend, color, bgColor }) {
  return (
    <div
      className="glass-card"
      style={{
        padding: '20px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '16px',
      }}
    >
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
        }}
      >
        <Icon size={20} style={{ color }} />
      </div>
      <div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>
          {label}
        </div>
        <div style={{ fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.2 }}>
          {value}
        </div>
        {trend && (
          <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: 4 }}>
            {trend}
          </div>
        )}
      </div>
    </div>
  );
}
