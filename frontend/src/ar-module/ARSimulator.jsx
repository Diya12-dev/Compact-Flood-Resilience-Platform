import React, { useState, useEffect, useRef } from 'react';
import FallbackView from '../components/FallbackView';
import './ARSimulator.css';

// Safely register custom A-Frame hit-test listener component for WebXR Immersive AR
function ensureHitTestComponentRegistered() {
  if (typeof window !== 'undefined' && window.AFRAME && !window.AFRAME.components['ar-hit-test-listener']) {
    window.AFRAME.registerComponent('ar-hit-test-listener', {
      init: function () {
        this.hitTestSource = null;

        this.el.sceneEl.addEventListener('enter-vr', async () => {
          if (this.el.sceneEl.is('ar-mode')) {
            const session = this.el.sceneEl.renderer.xr.getSession();
            if (session && session.requestHitTestSource) {
              try {
                const refSpace = await session.requestReferenceSpace('viewer');
                this.hitTestSource = await session.requestHitTestSource({ space: refSpace });

                session.addEventListener('end', () => {
                  this.hitTestSource = null;
                });
              } catch (e) {
                console.warn('WebXR hit-test source request failed:', e);
              }
            }
          }
        });

        this.el.sceneEl.addEventListener('exit-vr', () => {
          this.hitTestSource = null;
        });
      },

      tick: function () {
        if (!this.hitTestSource) return;
        const frame = this.el.sceneEl.frame;
        if (!frame) return;

        const hitTestResults = frame.getHitTestResults(this.hitTestSource);
        if (hitTestResults.length > 0) {
          const hit = hitTestResults[0];
          const referenceSpace = this.el.sceneEl.renderer.xr.getReferenceSpace();
          const pose = hit.getPose(referenceSpace);
          if (pose) {
            const pos = pose.transform.position;
            this.el.emit('ar-surface-found', {
              x: parseFloat(pos.x.toFixed(3)),
              y: parseFloat(pos.y.toFixed(3)),
              z: parseFloat(pos.z.toFixed(3))
            });
          }
        } else {
          this.el.emit('ar-surface-lost');
        }
      }
    });
  }
}

// Helper function to calculate Flood Risk metadata based on predicted flood depth (in meters)
function getRiskDetails(waterHeight) {
  const percentage = Math.min(100, Math.max(0, Math.round((waterHeight / 3.5) * 100)));
  if (percentage < 30) {
    return {
      level: 'LOW',
      percentage,
      color: '#10b981',
      bgColor: 'rgba(16, 185, 129, 0.15)',
      borderColor: 'rgba(16, 185, 129, 0.4)',
      warning: 'Low inundation depth predicted. Observe water height relative to ground.'
    };
  } else if (percentage < 60) {
    return {
      level: 'MODERATE',
      percentage,
      color: '#f59e0b',
      bgColor: 'rgba(245, 158, 11, 0.15)',
      borderColor: 'rgba(245, 158, 11, 0.4)',
      warning: 'Moderate predicted flood depth over real-world floor surface.'
    };
  } else if (percentage < 80) {
    return {
      level: 'HIGH',
      percentage,
      color: '#f97316',
      bgColor: 'rgba(249, 115, 22, 0.15)',
      borderColor: 'rgba(249, 115, 22, 0.4)',
      warning: 'High flood hazard! Significant inundation height over floor plane.'
    };
  } else {
    return {
      level: 'CRITICAL',
      percentage,
      color: '#ef4444',
      bgColor: 'rgba(239, 68, 68, 0.2)',
      borderColor: 'rgba(239, 68, 68, 0.5)',
      warning: 'CRITICAL INUNDATION! Severe flood height visual representation.'
    };
  }
}

export default function ARSimulator() {
  const [isWebXRSupported, setIsWebXRSupported] = useState(false);
  const [isCheckingWebXR, setIsCheckingWebXR] = useState(true);
  const [isInARSession, setIsInARSession] = useState(false);
  const [arError, setArError] = useState(null);
  const [isHitTestSupported, setIsHitTestSupported] = useState(true);

  // WebXR Surface Hit-Test Placement State
  const [isSurfaceDetected, setIsSurfaceDetected] = useState(false);
  const [detectedSurfacePose, setDetectedSurfacePose] = useState({ x: 0, y: -1.6, z: -2.5 });
  const [isPlaced, setIsPlaced] = useState(false);
  const [placedAnchor, setPlacedAnchor] = useState({ x: 0, y: -1.6, z: -2.5 });

  // Pre-Flood Water Visualization State (Controlled Depth & Presets)
  const [selectedDepth, setSelectedDepth] = useState(1.0); // Default 1.0m
  const [isAnimated, setIsAnimated] = useState(false); // Optional animation toggle (off by default)

  const depthPresets = [0.5, 1.0, 1.5, 2.0, 3.0];
  const sceneRef = useRef(null);

  // Ensure custom component is registered
  useEffect(() => {
    ensureHitTestComponentRegistered();
  }, []);

  // Check WebXR Immersive AR Session Support
  useEffect(() => {
    let mounted = true;

    if (typeof navigator !== 'undefined' && navigator.xr && navigator.xr.isSessionSupported) {
      navigator.xr.isSessionSupported('immersive-ar')
        .then((supported) => {
          if (mounted) {
            setIsWebXRSupported(supported);
            setIsCheckingWebXR(false);
          }
        })
        .catch(() => {
          if (mounted) {
            setIsWebXRSupported(false);
            setIsCheckingWebXR(false);
          }
        });
    } else {
      if (mounted) {
        setIsWebXRSupported(false);
        setIsCheckingWebXR(false);
      }
    }

    return () => {
      mounted = false;
    };
  }, []);

  // Bind WebXR Hit-Test Surface Events to A-Frame Scene
  useEffect(() => {
    const sceneEl = sceneRef.current;
    if (!sceneEl) return;

    const handleEnterVR = () => {
      if (sceneEl.is('ar-mode')) {
        setIsInARSession(true);
      }
    };

    const handleExitVR = () => {
      setIsInARSession(false);
      setIsPlaced(false);
      setIsSurfaceDetected(false);
    };

    const handleSurfaceFound = (evt) => {
      const { x, y, z } = evt.detail;
      setDetectedSurfacePose({ x, y, z });
      setIsSurfaceDetected(true);
    };

    const handleSurfaceLost = () => {
      setIsSurfaceDetected(false);
    };

    sceneEl.addEventListener('enter-vr', handleEnterVR);
    sceneEl.addEventListener('exit-vr', handleExitVR);
    sceneEl.addEventListener('ar-surface-found', handleSurfaceFound);
    sceneEl.addEventListener('ar-surface-lost', handleSurfaceLost);

    return () => {
      sceneEl.removeEventListener('enter-vr', handleEnterVR);
      sceneEl.removeEventListener('exit-vr', handleExitVR);
      sceneEl.removeEventListener('ar-surface-found', handleSurfaceFound);
      sceneEl.removeEventListener('ar-surface-lost', handleSurfaceLost);
    };
  }, [isCheckingWebXR]);

  // Optional Water Rise Animation Loop (off by default)
  useEffect(() => {
    let interval;
    if (isAnimated) {
      interval = setInterval(() => {
        setSelectedDepth((prev) => {
          if (prev >= 3.5) return 0.2;
          return parseFloat((prev + 0.04).toFixed(2));
        });
      }, 250);
    }
    return () => clearInterval(interval);
  }, [isAnimated]);

  // Dynamic Risk Details
  const risk = getRiskDetails(selectedDepth);

  // WebXR Metric 1:1 Height Calibration:
  // In WebXR / A-Frame world space, 1 unit = 1 real-world meter.
  // 1.0m selected depth elevates the water plane vertically by exactly +1.0 meter above locked placed floor anchor.
  const METRIC_SCALE_FACTOR = 1.0;
  const spatialWaterY = placedAnchor.y + (selectedDepth * METRIC_SCALE_FACTOR);

  // Lock placement on user click/tap
  const handlePlaceSimulation = () => {
    setPlacedAnchor(detectedSurfacePose);
    setIsPlaced(true);
  };

  // Helper to format detailed WebXR DOMExceptions without masking
  const formatXRError = (err) => {
    if (!err) return 'Unknown WebXR error';
    return [
      err.name || 'WebXRError',
      err.message || String(err)
    ].join(': ');
  };

  // Launch WebXR AR Immersive Session directly from user touch gesture
  const handleStartAR = async () => {
    setArError(null);
    const sceneEl = sceneRef.current;
    if (!sceneEl) return;

    if (!navigator.xr) {
      setArError('NotSupportedError: WebXR API (navigator.xr) is unavailable.');
      return;
    }

    try {
      const isSupported = await navigator.xr.isSessionSupported('immersive-ar');
      if (!isSupported) {
        setArError('NotSupportedError: This device/browser does not support immersive AR.');
        return;
      }

      // Direct WebXR session request with minimal optional features
      const session = await navigator.xr.requestSession('immersive-ar', {
        optionalFeatures: ['hit-test']
      });

      // Handle session end lifecycle
      session.addEventListener('end', () => {
        setIsInARSession(false);
        setIsPlaced(false);
        setIsSurfaceDetected(false);
      });

      // Connect native WebXR session to A-Frame 3D scene & renderer
      if (sceneEl.systems && sceneEl.systems.webxr) {
        sceneEl.systems.webxr.onSessionStarted(session);
      }

      setIsInARSession(true);
      setIsHitTestSupported(true);
    } catch (err) {
      console.error('WebXR requestSession failed:', err);
      console.error('Error name:', err?.name);
      console.error('Error message:', err?.message);
      console.error('Error stack:', err?.stack);

      setArError(formatXRError(err));
    }
  };

  // If WebXR is unsupported (e.g. desktop browser), render Graceful Fallback View
  if (!isCheckingWebXR && !isWebXRSupported) {
    return <FallbackView errorMessage="Immersive WebXR Spatial AR is unsupported on this device/browser. Please open on an ARCore/ARKit compatible mobile device running Chrome over HTTPS." />;
  }

  return (
    <div className="ar-simulator-root">
      {/* A-Frame 3D AR WebXR Scene */}
      <div className="ar-scene-container">
        <a-scene
          ref={sceneRef}
          embedded
          ar-hit-test-listener
          webxr="optionalFeatures: hit-test"
          ar-mode-ui="enabled: false"
          vr-mode-ui="enabled: false"
          style={{ width: '100%', height: '100%', background: 'transparent' }}
        >
          {/* Lighting */}
          <a-light type="ambient" intensity="0.9" color="#ffffff"></a-light>
          <a-light type="directional" position="2 4 -3" intensity="0.8" color="#38bdf8"></a-light>

          {/* Camera */}
          <a-camera position="0 1.6 0" look-controls="enabled: true"></a-camera>

          {/* WebXR Real-World Hit-Test Surface Placement Ring Indicator (Visible ONLY Before Placement) */}
          {!isPlaced && isSurfaceDetected && isHitTestSupported && (
            <a-entity
              id="placement-indicator"
              position={`${detectedSurfacePose.x} ${detectedSurfacePose.y} ${detectedSurfacePose.z}`}
              rotation="-90 0 0"
            >
              <a-ring
                radius-inner="0.4"
                radius-outer="0.6"
                material="color: #06b6d4; opacity: 0.85; transparent: true; side: double"
                animation="property: scale; to: 1.2 1.2 1.2; dir: alternate; dur: 800; loop: true"
              ></a-ring>
              <a-circle
                radius="0.35"
                material="color: #38bdf8; opacity: 0.35; transparent: true; side: double"
              ></a-circle>
            </a-entity>
          )}

          {/* 3D Water Plane (Calibrated 8x8m area) - Rendered ONLY After User Placement */}
          {isPlaced && (
            <a-entity
              id="water-plane-container"
              position={`${placedAnchor.x} ${spatialWaterY} ${placedAnchor.z}`}
            >
              <a-plane
                width="8"
                height="8"
                rotation="-90 0 0"
                material={`color: ${risk.color}; opacity: 0.65; transparent: true; metalness: 0.1; roughness: 0.1; side: double`}
                animation="property: material.opacity; to: 0.75; dir: alternate; dur: 1800; loop: true"
              ></a-plane>

              {/* Subtle Water Surface Mesh Grid Lines */}
              <a-plane
                width="8"
                height="8"
                rotation="-90 0 0"
                position="0 0.01 0"
                material="color: #ffffff; opacity: 0.22; transparent: true; wireframe: true; side: double"
              ></a-plane>
            </a-entity>
          )}
        </a-scene>
      </div>

      {/* UI Overlay Layer */}
      <div className="ar-ui-overlay">
        {/* Top Header HUD */}
        <div className="ar-header-hud ar-ui-interactive">
          <div className="ar-header-top-row">
            <div className="ar-badge">
              <span className="ar-badge-pulse" />
              <span>PRE-FLOOD WATER LEVEL VISUALIZER</span>
            </div>

            <div className="ar-title-card">
              <span className="ar-title-text">Predicted Flood Depth: +{selectedDepth}m</span>
            </div>
          </div>

          {/* Dynamic Flood Risk Indicator Bar */}
          <div className="ar-risk-card" style={{ borderColor: risk.borderColor }}>
            <div className="ar-risk-header">
              <span className="ar-risk-title">⚠️ FLOOD RISK LEVEL</span>
              <span
                className="ar-risk-badge"
                style={{
                  backgroundColor: risk.bgColor,
                  color: risk.color,
                  border: `1px solid ${risk.borderColor}`
                }}
              >
                {risk.level} ({risk.percentage}%)
              </span>
            </div>

            <div className="ar-risk-bar-container">
              <div
                className="ar-risk-bar-fill"
                style={{
                  width: `${risk.percentage}%`,
                  backgroundColor: risk.color
                }}
              />
            </div>
          </div>
        </div>

        {/* Start AR Action Banner when not in AR session */}
        {!isInARSession && (
          <div className="ar-placement-banner ar-ui-interactive" style={{ margin: 'auto', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#ffffff' }}>
              WebXR Spatial AR Supported
            </span>
            <button onClick={handleStartAR} className="ar-placement-btn">
              Start AR Experience
            </button>
            {arError && (
              <span style={{ fontSize: '0.8rem', color: '#fca5a5', marginTop: '4px', textAlign: 'center', wordBreak: 'break-word' }}>
                Unable to start AR: {arError}
              </span>
            )}
          </div>
        )}

        {/* Surface Detection & Tap-to-Place UX Banner inside AR session */}
        {isInARSession && !isPlaced && isSurfaceDetected && isHitTestSupported && (
          <div className="ar-placement-banner ar-ui-interactive">
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ffffff' }}>
              📍 Real-World Floor Detected!
            </span>
            <button onClick={handlePlaceSimulation} className="ar-placement-btn">
              Tap to Place Simulation
            </button>
          </div>
        )}

        {/* User Instructions */}
        {!isCheckingWebXR && (
          <div className="ar-instructions-box ar-ui-interactive">
            <p className="ar-instructions-text">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              {!isInARSession
                ? 'Tap "Start AR Experience" to begin camera passthrough and floor detection.'
                : (!isHitTestSupported
                  ? 'AR Camera Active. Floor hit-testing is unsupported on this device; visualizer rendered at default spatial position.'
                  : (!isPlaced && !isSurfaceDetected
                    ? 'Point camera at the ground to place the flood simulation.'
                    : (isPlaced ? risk.warning : 'Floor detected. Tap "Tap to Place Simulation" to render water plane.')))}
            </p>
          </div>
        )}

        {/* Bottom Controls Dock */}
        <div className="ar-controls-dock ar-ui-interactive">
          {/* Depth Presets & Controls Row */}
          <div className="ar-controls-row">
            <div className="ar-presets-group">
              <span className="ar-preset-label">Presets:</span>
              {depthPresets.map((preset) => (
                <button
                  key={preset}
                  onClick={() => {
                    setSelectedDepth(preset);
                    setIsAnimated(false);
                  }}
                  className={`ar-preset-btn ${selectedDepth === preset && !isAnimated ? 'active' : ''}`}
                >
                  {preset}m
                </button>
              ))}
            </div>

            <button
              onClick={() => setIsAnimated(!isAnimated)}
              className={`ar-btn-action ${isAnimated ? 'ar-btn-secondary' : 'ar-btn-primary'}`}
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

          {/* Continuous Depth Slider */}
          <div className="ar-control-group">
            <span className="ar-water-meter">
              Predicted Depth: <strong>+{selectedDepth}m</strong>
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
              className="ar-slider"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
