import React, { useState, useEffect } from 'react';

// Helper to compute Flood Risk level & style properties based on predicted depth
function getRiskDetails(waterHeight) {
  const percentage = Math.min(100, Math.max(0, Math.round((waterHeight / 3.5) * 100)));
  if (percentage < 30) {
    return { level: 'LOW', percentage, color: '#10b981', bgColor: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.4)' };
  } else if (percentage < 60) {
    return { level: 'MODERATE', percentage, color: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.15)', borderColor: 'rgba(245, 158, 11, 0.4)' };
  } else if (percentage < 80) {
    return { level: 'HIGH', percentage, color: '#f97316', bgColor: 'rgba(249, 115, 22, 0.15)', borderColor: 'rgba(249, 115, 22, 0.4)' };
  } else {
    return { level: 'CRITICAL', percentage, color: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.2)', borderColor: 'rgba(239, 68, 68, 0.5)' };
  }
}

export default function FallbackView({ errorMessage, onRetryCamera }) {
  const [selectedDepth, setSelectedDepth] = useState(1.0); // Default 1.0m
  const [isAnimated, setIsAnimated] = useState(false); // Optional animate toggle

  const depthPresets = [0.5, 1.0, 1.5, 2.0, 3.0];

  // Optional Animate Loop (off by default)
  useEffect(() => {
    let interval;
    if (isAnimated) {
      interval = setInterval(() => {
        setSelectedDepth((prev) => {
          if (prev >= 3.5) return 0.2;
          return parseFloat((prev + 0.05).toFixed(2));
        });
      }, 250);
    }
    return () => clearInterval(interval);
  }, [isAnimated]);

  const risk = getRiskDetails(selectedDepth);
  const fillPercentage = Math.min(100, Math.max(0, (selectedDepth / 3.5) * 100));

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
      {/* Top Alert Banner */}
      <div style={{
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
        borderBottom: '1px solid rgba(245, 158, 11, 0.3)',
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 20
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div>
            <span style={{ fontWeight: 600, color: '#f59e0b', fontSize: '0.88rem' }}>
              WebXR Spatial AR Unavailable
            </span>
            <p style={{ fontSize: '0.78rem', color: '#cbd5e1', margin: 0 }}>
              {errorMessage || 'Camera feed or WebXR surface detection is unsupported on this device/browser. Displaying 3D Pre-Flood Visualizer fallback.'}
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

      {/* Main 3D Fallback Visualizer Canvas View */}
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
              fontSize: '0.78rem',
              fontWeight: 700,
              color: '#ffffff',
              backgroundColor: 'rgba(0,0,0,0.5)',
              padding: '4px 10px',
              borderRadius: '6px',
              border: '1px solid rgba(255,255,255,0.2)'
            }}>
              Inundation Level: +{selectedDepth}m
            </div>
          </div>
        </div>

        {/* Header Title Card */}
        <div style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          backgroundColor: 'rgba(15, 23, 42, 0.88)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '12px',
          padding: '12px 18px',
          maxWidth: '340px',
          zIndex: 10
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12h20" />
              <path d="M2 6h20" />
              <path d="M2 18h20" />
            </svg>
            <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#38bdf8', letterSpacing: '0.5px' }}>
              PRE-FLOOD VISUALIZER
            </span>
          </div>
          <p style={{ fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.4, margin: 0 }}>
            Simulating predicted flood depth scenario relative to ground level.
          </p>
        </div>

        {/* Dynamic Flood Risk Overlay Card */}
        <div style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          backgroundColor: 'rgba(15, 23, 42, 0.88)',
          backdropFilter: 'blur(12px)',
          border: `1px solid ${risk.borderColor}`,
          borderRadius: '12px',
          padding: '12px 16px',
          width: '300px',
          zIndex: 10
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              ⚠️ FLOOD RISK LEVEL
            </span>
            <span style={{
              padding: '3px 10px',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 800,
              backgroundColor: risk.bgColor,
              color: risk.color,
              border: `1px solid ${risk.borderColor}`
            }}>
              {risk.level} ({risk.percentage}%)
            </span>
          </div>

          <div style={{ width: '100%', height: '8px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${risk.percentage}%`, backgroundColor: risk.color, transition: 'width 0.3s ease, background-color 0.3s ease' }} />
          </div>
        </div>
      </div>

      {/* Control Panel Footer */}
      <div style={{
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderTop: '1px solid rgba(255, 255, 255, 0.15)',
        padding: '16px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        zIndex: 20
      }}>
        {/* Depth Presets & Slider Row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
              Presets:
            </span>
            {depthPresets.map((preset) => (
              <button
                key={preset}
                onClick={() => {
                  setSelectedDepth(preset);
                  setIsAnimated(false);
                }}
                style={{
                  padding: '5px 12px',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  backgroundColor: selectedDepth === preset && !isAnimated ? '#0284c7' : 'rgba(255, 255, 255, 0.08)',
                  color: selectedDepth === preset && !isAnimated ? '#ffffff' : '#cbd5e1',
                  border: `1px solid ${selectedDepth === preset && !isAnimated ? '#38bdf8' : 'rgba(255, 255, 255, 0.18)'}`,
                  cursor: 'pointer'
                }}
              >
                {preset}m
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '220px' }}>
            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#38bdf8', whiteSpace: 'nowrap' }}>
              Depth: <strong>+{selectedDepth}m</strong>
            </span>
            <input
              type="range"
              min="0"
              max="3.5"
              step="0.1"
              value={selectedDepth}
              onChange={(e) => {
                setSelectedDepth(parseFloat(e.target.value));
                setIsAnimated(false);
              }}
              style={{ accentColor: '#06b6d4', flex: 1, cursor: 'pointer' }}
            />
          </div>

          <button
            onClick={() => setIsAnimated(!isAnimated)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              backgroundColor: isAnimated ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
              color: isAnimated ? '#ef4444' : '#10b981',
              border: `1px solid ${isAnimated ? '#ef4444' : '#10b981'}`,
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
          >
            {isAnimated ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="6 3 20 12 6 21 6 3" />
              </svg>
            )}
            {isAnimated ? 'Stop Animation' : 'Animate Flood'}
          </button>
        </div>
      </div>
    </div>
  );
}
