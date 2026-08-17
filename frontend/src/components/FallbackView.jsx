import React, { useState, useEffect } from 'react';

export default function FallbackView({ errorMessage, onRetryCamera }) {
  const [waterLevel, setWaterLevel] = useState(0.5); // meters
  const [isRising, setIsRising] = useState(true);
  const [safeDirection] = useState('North-East (NE - Elevation +15m)');

  useEffect(() => {
    let interval;
    if (isRising) {
      interval = setInterval(() => {
        setWaterLevel((prev) => {
          if (prev >= 3.0) return 0.2; // Loop back
          return parseFloat((prev + 0.05).toFixed(2));
        });
      }, 300);
    }
    return () => clearInterval(interval);
  }, [isRising]);

  // Calculate visual height percentage for 3D simulated container
  const fillPercentage = Math.min(100, Math.max(0, (waterLevel / 3.5) * 100));

  return (
    <div className="fallback-container" style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#0f172a',
      color: '#f8fafc',
      fontFamily: 'var(--font-family)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Top Banner Alert */}
      <div style={{
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
        borderBottom: '1px solid rgba(245, 158, 11, 0.3)',
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 20
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Alert Triangle SVG */}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div>
            <span style={{ fontWeight: 600, color: '#f59e0b', fontSize: '0.9rem' }}>
              AR Camera Unavailable
            </span>
            <p style={{ fontSize: '0.78rem', color: '#cbd5e1', margin: 0 }}>
              {errorMessage || 'Camera feed or WebXR sensor access was denied or is unsupported on this device. Displaying 3D Simulation Fallback view.'}
            </p>
          </div>
        </div>
        {onRetryCamera && (
          <button
            onClick={onRetryCamera}
            style={{
              padding: '6px 14px',
              backgroundColor: '#f59e0b',
              color: '#0f172a',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '0.8rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            Retry Camera
          </button>
        )}
      </div>

      {/* Main 3D Fallback Interactive Canvas View */}
      <div style={{
        flex: 1,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle at center, #1e293b 0%, #090d16 100%)',
        overflow: 'hidden'
      }}>
        {/* Grid Floor */}
        <div style={{
          position: 'absolute',
          bottom: '10%',
          width: '80%',
          height: '60%',
          transform: 'rotateX(60deg) rotateZ(-15deg)',
          transformStyle: 'preserve-3d',
          border: '2px dashed rgba(255, 255, 255, 0.2)',
          borderRadius: '16px',
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.5) 0%, rgba(15, 23, 42, 0.8) 100%)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.8)'
        }}>
          {/* Water plane inside 3D grid */}
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: `${fillPercentage}%`,
            background: 'linear-gradient(180deg, rgba(6, 182, 212, 0.75) 0%, rgba(2, 132, 199, 0.85) 100%)',
            borderTop: '3px solid #38bdf8',
            transition: 'height 0.3s ease-out',
            boxShadow: '0 0 30px rgba(6, 182, 212, 0.4)'
          }}>
            <div style={{
              position: 'absolute',
              top: '8px',
              right: '12px',
              fontSize: '0.75rem',
              fontWeight: 700,
              color: '#ffffff',
              backgroundColor: 'rgba(0,0,0,0.4)',
              padding: '2px 8px',
              borderRadius: '4px'
            }}>
              Simulated Flood Level: +{waterLevel}m
            </div>
          </div>

          {/* 3D Directional Safety Arrow Component */}
          <div style={{
            position: 'absolute',
            top: '20%',
            left: '50%',
            transform: 'translate(-50%, -50%) rotateZ(-45deg)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            zIndex: 10
          }}>
            <div style={{
              width: 0,
              height: 0,
              borderLeft: '20px solid transparent',
              borderRight: '20px solid transparent',
              borderBottom: '40px solid #10b981',
              filter: 'drop-shadow(0 0 12px #10b981)',
              animation: 'bounce 1.5s infinite alternate'
            }} />
            <div style={{
              width: '12px',
              height: '35px',
              backgroundColor: '#10b981',
              boxShadow: '0 0 10px #10b981'
            }} />
            <span style={{
              marginTop: '8px',
              fontSize: '0.75rem',
              fontWeight: 700,
              color: '#10b981',
              backgroundColor: 'rgba(15, 23, 42, 0.9)',
              padding: '4px 10px',
              borderRadius: '6px',
              border: '1px solid #10b981',
              whiteSpace: 'nowrap',
              transform: 'rotateZ(45deg)'
            }}>
              SAFE DIRECTION (NE)
            </span>
          </div>
        </div>

        {/* HUD Info Box */}
        <div style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          backgroundColor: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '12px',
          padding: '14px 18px',
          maxWidth: '320px',
          zIndex: 10
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            {/* Layers SVG */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
              <path d="m22 12.5-8.58 3.91a2 2 0 0 1-1.66 0L3.18 12.5" />
              <path d="m22 17.5-8.58 3.91a2 2 0 0 1-1.66 0L3.18 17.5" />
            </svg>
            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#f8fafc' }}>
              3D SIMULATION DEMO
            </span>
          </div>
          <p style={{ fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.4, margin: 0 }}>
            Simulating rising water table dynamics and evacuation vector pointing toward safe elevation ground.
          </p>
        </div>

        {/* Find Safety Banner Overlay */}
        <div style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          backgroundColor: 'rgba(16, 185, 129, 0.15)',
          border: '1px solid rgba(16, 185, 129, 0.4)',
          borderRadius: '12px',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          zIndex: 10
        }}>
          {/* Shield Check SVG */}
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
          <div>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Recommended Evacuation
            </div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#10b981' }}>
              {safeDirection}
            </div>
          </div>
        </div>
      </div>

      {/* Control Panel Footer */}
      <div style={{
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderTop: '1px solid rgba(255, 255, 255, 0.15)',
        padding: '16px 24px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        zIndex: 20
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '220px' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#38bdf8' }}>
            Flood Height: <strong>+{waterLevel}m</strong>
          </span>
          <input
            type="range"
            min="0"
            max="3.5"
            step="0.1"
            value={waterLevel}
            onChange={(e) => {
              setWaterLevel(parseFloat(e.target.value));
              setIsRising(false);
            }}
            style={{ accentColor: '#06b6d4', flex: 1, cursor: 'pointer' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => setIsRising(!isRising)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              backgroundColor: isRising ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
              color: isRising ? '#ef4444' : '#10b981',
              border: `1px solid ${isRising ? '#ef4444' : '#10b981'}`,
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
          >
            {isRising ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="6 3 20 12 6 21 6 3" />
              </svg>
            )}
            {isRising ? 'Pause Water' : 'Auto Rise'}
          </button>

          <button
            onClick={() => {
              setWaterLevel(0.2);
              setIsRising(true);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              color: '#f8fafc',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            Reset Level
          </button>
        </div>
      </div>
    </div>
  );
}
