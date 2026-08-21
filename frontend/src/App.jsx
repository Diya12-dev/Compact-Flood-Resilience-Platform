import React, { useEffect, useState } from 'react';
import { Routes, Route, Link } from 'react-router-dom';

import FloodDashboard from './flood-module/FloodDashboard';
import ARSimulator from './ar-module/ARSimulator';
import DroneMonitoring from './drone-module/DroneMonitoring';

import { fetchSOSAlerts } from './services/sosService';

function HomeLanding() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '24px',
        textAlign: 'center',
        background:
          'radial-gradient(circle at center, #1e293b 0%, #0f172a 100%)',
        boxSizing: 'border-box',
      }}
    >
      {/* Shield Icon */}
      <div
        style={{
          padding: '16px',
          background: 'rgba(2, 132, 199, 0.15)',
          border: '1px solid rgba(2, 132, 199, 0.3)',
          borderRadius: '50%',
          marginBottom: '24px',
        }}
      >
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#0284c7"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
          <path d="M12 8v4" />
          <path d="M12 16h.01" />
        </svg>
      </div>

      {/* Title */}
      <h1
        style={{
          fontSize: '2rem',
          fontWeight: 800,
          marginBottom: '12px',
          color: '#f8fafc',
        }}
      >
        Compact Flood Resilience Platform
      </h1>

      {/* Description */}
      <p
        style={{
          color: '#94a3b8',
          maxWidth: '560px',
          marginBottom: '32px',
          lineHeight: 1.6,
        }}
      >
        Interactive disaster response platform integrating AR flood
        visualization, AI-powered drone monitoring, real-time command tools,
        and safe evacuation guidance.
      </p>

      {/* Buttons */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          width: '100%',
          maxWidth: '430px',
        }}
      >
        {/* Flood Dashboard */}
        <Link
          to="/flood"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            padding: '15px 24px',
            background:
              'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: '1rem',
            borderRadius: '12px',
            textDecoration: 'none',
            boxShadow: '0 10px 25px -5px rgba(34, 197, 94, 0.5)',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          }}
        >
          {/* Map Icon */}
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>

          Flood Dashboard & Volunteers
        </Link>

        {/* AR Flood Simulator */}
        <Link
          to="/simulate"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            padding: '15px 24px',
            background:
              'linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: '1rem',
            borderRadius: '12px',
            textDecoration: 'none',
            boxShadow: '0 10px 25px -5px rgba(2, 132, 199, 0.5)',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          }}
        >
          {/* Compass Icon */}
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
          </svg>

          Launch AR Flood Simulator
        </Link>

        {/* AI Drone Monitoring */}
        <Link
          to="/drone"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            padding: '15px 24px',
            background:
              'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: '1rem',
            borderRadius: '12px',
            textDecoration: 'none',
            boxShadow: '0 10px 25px -5px rgba(79, 70, 229, 0.45)',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          }}
        >
          {/* Drone Icon */}
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 8v8" />
            <path d="M8 12h8" />
            <rect x="9" y="9" width="6" height="6" rx="1" />
            <path d="M5 7h2v2H5z" />
            <path d="M17 7h2v2h-2z" />
            <path d="M5 15h2v2H5z" />
            <path d="M17 15h2v2h-2z" />
            <path d="M7 8l2 2" />
            <path d="M17 8l-2 2" />
            <path d="M7 16l2-2" />
            <path d="M17 16l-2-2" />
          </svg>

          Launch AI Drone Monitoring
        </Link>
      </div>

      {/* Platform Status */}
      <div
        style={{
          marginTop: '28px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          color: '#64748b',
          fontSize: '0.8rem',
        }}
      >
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: '#22c55e',
            boxShadow: '0 0 8px rgba(34, 197, 94, 0.7)',
          }}
        />

        Platform modules available
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0f172a',
        color: '#f8fafc',
        textAlign: 'center',
        padding: '24px',
      }}
    >
      <h1
        style={{
          fontSize: '3rem',
          marginBottom: '10px',
        }}
      >
        404
      </h1>

      <p
        style={{
          color: '#94a3b8',
          marginBottom: '24px',
        }}
      >
        Page not found.
      </p>

      <Link
        to="/"
        style={{
          padding: '12px 22px',
          borderRadius: '10px',
          background: '#0284c7',
          color: '#fff',
          textDecoration: 'none',
          fontWeight: 600,
        }}
      >
        Return to Platform
      </Link>
    </div>
  );
}

export default function App() {
  const [sosAlerts, setSosAlerts] = useState([]);

  // =========================================================
  // LOAD SOS ALERTS
  // =========================================================
  useEffect(() => {
    async function loadSOS() {
      try {
        const alerts = await fetchSOSAlerts();

        console.log('SOS ALERTS:', alerts);

        setSosAlerts(alerts || []);
      } catch (error) {
        console.error('Failed to load SOS alerts:', error);
        setSosAlerts([]);
      }
    }

    loadSOS();
  }, []);

  return (
    <Routes>
      {/* Flood Dashboard */}
      <Route
        path="/flood"
        element={
          <FloodDashboard sosAlerts={sosAlerts} />
        }
      />

      {/* Home */}
      <Route
        path="/"
        element={<HomeLanding />}
      />

      {/* AR Flood Simulator */}
      <Route
        path="/simulate"
        element={<ARSimulator />}
      />

      {/* AI Drone Monitoring */}
      <Route
        path="/drone"
        element={<DroneMonitoring />}
      />

      {/* Unknown routes */}
      <Route
        path="*"
        element={<NotFound />}
      />
    </Routes>
  );
}