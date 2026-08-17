import React from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import ARSimulator from './ar-module/ARSimulator';

function HomeLanding() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      padding: '24px',
      textAlign: 'center',
      background: 'radial-gradient(circle at center, #1e293b 0%, #0f172a 100%)'
    }}>
      <div style={{
        padding: '16px',
        background: 'rgba(2, 132, 199, 0.15)',
        border: '1px solid rgba(2, 132, 199, 0.3)',
        borderRadius: '50%',
        marginBottom: '24px'
      }}>
        {/* Shield Alert Icon */}
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
          <path d="M12 8v4" />
          <path d="M12 16h.01" />
        </svg>
      </div>

      <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '12px', color: '#f8fafc' }}>
        Compact Flood Resilience Platform
      </h1>
      <p style={{ color: '#94a3b8', maxWidth: '500px', marginBottom: '32px', lineHeight: 1.6 }}>
        Interactive disaster response platform integrating AR flood visualization, real-time command tools, and safe evacuation guidance.
      </p>

      <Link
        to="/simulate"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '10px',
          padding: '14px 28px',
          background: 'linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)',
          color: '#ffffff',
          fontWeight: 600,
          fontSize: '1rem',
          borderRadius: '12px',
          textDecoration: 'none',
          boxShadow: '0 10px 25px -5px rgba(2, 132, 199, 0.5)',
          transition: 'transform 0.2s ease, boxShadow 0.2s ease'
        }}
      >
        {/* Compass Icon */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
        </svg>
        Launch AR Flood Simulator (/simulate)
        {/* External Link Icon */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 3h6v6" />
          <path d="M10 14 21 3" />
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        </svg>
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/simulate" element={<ARSimulator />} />
      <Route path="*" element={<HomeLanding />} />
    </Routes>
  );
}
