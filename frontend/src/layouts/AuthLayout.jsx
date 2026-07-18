import { Outlet } from 'react-router-dom';

export default function AuthLayout() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--gradient-bg)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background orbs */}
      <div
        style={{
          position: 'absolute',
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(59,130,246,0.15) 0%, transparent 70%)',
          top: '-15%',
          right: '-10%',
          animation: 'pulse 6s ease-in-out infinite',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 400,
          height: 400,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)',
          bottom: '-10%',
          left: '-5%',
          animation: 'pulse 8s ease-in-out infinite',
          animationDelay: '2s',
        }}
      />
      <Outlet />
    </div>
  );
}
