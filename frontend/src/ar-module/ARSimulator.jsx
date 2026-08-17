import React, { useState, useEffect, useRef } from 'react';
import FallbackView from '../components/FallbackView';
import './ARSimulator.css';

// Register custom A-Frame hit-test listener component for WebXR immersive AR
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
      warning: 'Low inundation risk. Point camera at floor to position pre-flood visualizer.'
    };
  } else if (percentage < 60) {
    return {
      level: 'MODERATE',
      percentage,
      color: '#f59e0b',
      bgColor: 'rgba(245, 158, 11, 0.15)',
      borderColor: 'rgba(245, 158, 11, 0.4)',
      warning: 'Moderate predicted inundation depth. Observe water level relative to floor.'
    };
  } else if (percentage < 80) {
    return {
      level: 'HIGH',
      percentage,
      color: '#f97316',
      bgColor: 'rgba(249, 115, 22, 0.15)',
      borderColor: 'rgba(249, 115, 22, 0.4)',
      warning: 'High flood hazard! Significant water depth predicted over floor surface.'
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
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isCheckingCamera, setIsCheckingCamera] = useState(true);

  // WebXR & Spatial Hit-Test Placement State
  const [isWebXRSupported, setIsWebXRSupported] = useState(false);
  const [isSurfaceDetected, setIsSurfaceDetected] = useState(false);
  const [detectedSurfacePose, setDetectedSurfacePose] = useState({ x: 0, y: -1.6, z: -3 });
  const [isPlaced, setIsPlaced] = useState(false);
  const [placedAnchor, setPlacedAnchor] = useState({ x: 0, y: -1.6, z: -3 });

  // Pre-Flood Water Visualization State (Controlled Depth & Presets)
  const [selectedDepth, setSelectedDepth] = useState(1.0); // Default 1.0m
  const [isAnimated, setIsAnimated] = useState(false); // Optional animation toggle (off by default)

  const depthPresets = [0.5, 1.0, 1.5, 2.0, 3.0];
  const videoRef = useRef(null);
  const sceneRef = useRef(null);

  // Check WebXR Immersive AR Capability & Camera Access
  useEffect(() => {
    let mounted = true;

    // 1. Check WebXR API support
    if (typeof navigator !== 'undefined' && navigator.xr && navigator.xr.isSessionSupported) {
      navigator.xr.isSessionSupported('immersive-ar')
        .then((supported) => {
          if (mounted) setIsWebXRSupported(supported);
        })
        .catch(() => {
          if (mounted) setIsWebXRSupported(false);
        });
    }

    // 2. Request Camera Feed
    async function initCamera() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (mounted) {
          setCameraError('MediaDevices API not supported on this browser/environment.');
          setIsCheckingCamera(false);
        }
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });

        if (mounted) {
          setCameraStream(stream);
          setIsCameraActive(true);
          setIsCheckingCamera(false);

          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch((err) => console.warn('Video play deferred:', err));
          }
        }
      } catch (err) {
        console.warn('Camera access request failed or denied:', err);
        if (mounted) {
          setCameraError(err.message || 'Camera permission denied or camera unavailable.');
          setIsCameraActive(false);
          setIsCheckingCamera(false);
        }
      }
    }

    initCamera();

    return () => {
      mounted = false;
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Bind WebXR Hit-Test Surface Events to A-Frame Scene
  useEffect(() => {
    const sceneEl = sceneRef.current;
    if (!sceneEl) return;

    const handleSurfaceFound = (evt) => {
      const { x, y, z } = evt.detail;
      setDetectedSurfacePose({ x, y, z });
      setIsSurfaceDetected(true);
    };

    const handleSurfaceLost = () => {
      setIsSurfaceDetected(false);
    };

    sceneEl.addEventListener('ar-surface-found', handleSurfaceFound);
    sceneEl.addEventListener('ar-surface-lost', handleSurfaceLost);

    return () => {
      sceneEl.removeEventListener('ar-surface-found', handleSurfaceFound);
      sceneEl.removeEventListener('ar-surface-lost', handleSurfaceLost);
    };
  }, [isCheckingCamera]);

  // Update video element when stream is ready
  useEffect(() => {
    if (cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraStream]);

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

  // Active Anchor Pose
  const currentAnchor = isPlaced
    ? placedAnchor
    : (isSurfaceDetected ? detectedSurfacePose : { x: 0, y: -1.6, z: -3 });

  // WebXR 1:1 Metric Calibration:
  // In A-Frame WebXR world units, 1 unit = 1 real-world meter.
  // 1.0m selected depth elevates the water plane vertically by exactly +1.0 meter above the floor anchor.
  const METRIC_SCALE_FACTOR = 1.0; 
  const spatialWaterY = currentAnchor.y + (selectedDepth * METRIC_SCALE_FACTOR);

  // Lock placement on user click/tap
  const handlePlaceSimulation = () => {
    setPlacedAnchor(detectedSurfacePose);
    setIsPlaced(true);
  };

  // Handle retry camera button click
  const handleRetryCamera = () => {
    setIsCheckingCamera(true);
    setCameraError(null);
    window.location.reload();
  };

  // If camera is unsupported or denied, render Graceful Fallback View
  if (!isCheckingCamera && (!isCameraActive || cameraError)) {
    return <FallbackView errorMessage={cameraError} onRetryCamera={handleRetryCamera} />;
  }

  return (
    <div className="ar-simulator-root">
      {/* Background Camera Feed Video */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="ar-camera-feed"
      />

      {/* A-Frame 3D AR WebXR Scene */}
      <div className="ar-scene-container">
        <a-scene
          ref={sceneRef}
          embedded
          ar-hit-test-listener
          webxr="optionalFeatures: hit-test, dom-overlay; overlayElement: .ar-ui-overlay"
          ar-mode-ui="enabled: true"
          vr-mode-ui="enabled: false"
          style={{ width: '100%', height: '100%', background: 'transparent' }}
        >
          {/* Lighting */}
          <a-light type="ambient" intensity="0.9" color="#ffffff"></a-light>
          <a-light type="directional" position="2 4 -3" intensity="0.8" color="#38bdf8"></a-light>

          {/* Camera */}
          <a-camera position="0 1.6 0" look-controls="enabled: true"></a-camera>

          {/* WebXR Real-World Hit-Test Surface Placement Ring Indicator */}
          {!isPlaced && isSurfaceDetected && (
            <a-entity
              id="placement-indicator"
              position={`${detectedSurfacePose.x} ${detectedSurfacePose.y} ${detectedSurfacePose.z}`}
              rotation="-90 0 0"
            >
              <a-ring
                radius-inner="0.6"
                radius-outer="0.8"
                material="color: #06b6d4; opacity: 0.85; transparent: true; side: double"
                animation="property: scale; to: 1.2 1.2 1.2; dir: alternate; dur: 800; loop: true"
              ></a-ring>
              <a-circle
                radius="0.5"
                material="color: #38bdf8; opacity: 0.35; transparent: true; side: double"
              ></a-circle>
            </a-entity>
          )}

          {/* 3D Water Plane Anchored to Detected/Placed Real-World Spatial Floor Position */}
          <a-entity
            id="water-plane-container"
            position={`${currentAnchor.x} ${spatialWaterY} ${currentAnchor.z}`}
          >
            <a-plane
              width="40"
              height="40"
              rotation="-90 0 0"
              material={`color: ${risk.color}; opacity: 0.65; transparent: true; metalness: 0.2; roughness: 0.1; side: double`}
              animation="property: material.opacity; to: 0.75; dir: alternate; dur: 1800; loop: true"
            ></a-plane>
            
            {/* Water Surface Wave Grid Lines */}
            <a-plane
              width="40"
              height="40"
              rotation="-90 0 0"
              position="0 0.02 0"
              material="color: #ffffff; opacity: 0.25; transparent: true; wireframe: true; side: double"
            ></a-plane>
          </a-entity>
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

        {/* Surface Detection & Tap-to-Place UX Banner */}
        {!isPlaced && isSurfaceDetected && (
          <div className="ar-placement-banner ar-ui-interactive">
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ffffff' }}>
              📍 Real-World Floor Detected!
            </span>
            <button onClick={handlePlaceSimulation} className="ar-placement-btn">
              Tap to Place Simulation
            </button>
          </div>
        )}

        {/* Loading Spinner during Camera Initialization */}
        {isCheckingCamera && (
          <div className="ar-instructions-box ar-ui-interactive" style={{ margin: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <span>Connecting Camera & WebXR Spatial Sensors...</span>
            </div>
          </div>
        )}

        {/* User Instructions */}
        {!isCheckingCamera && (
          <div className="ar-instructions-box ar-ui-interactive">
            <p className="ar-instructions-text">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              {!isPlaced && !isSurfaceDetected ? 'Point camera at the ground to place the flood simulation.' : risk.warning}
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
