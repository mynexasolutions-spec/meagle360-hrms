import React from 'react';
import logoImg from '../assets/logo.jpg';

export default function LoadingScreen({ title = "Meagle360 HRMS", subtitle = "Loading workspace..." }) {
  return (
    <div className="loading-screen-overlay">
      <div className="loading-screen-card">
        <div className="loading-icon-wrapper">
          <div className="loading-icon-glow" />
          <div className="loading-ring-spinner" />
          <div className="loading-icon-badge" style={{ overflow: 'hidden', padding: 0 }}>
            <img src={logoImg} alt="Meagle360" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '14px' }} />
          </div>
        </div>
        
        <h3 className="loading-title">{title}</h3>
        <p className="loading-subtitle">{subtitle}</p>

        <div className="loading-bar-track">
          <div className="loading-bar-fill" />
        </div>
      </div>
    </div>
  );
}
