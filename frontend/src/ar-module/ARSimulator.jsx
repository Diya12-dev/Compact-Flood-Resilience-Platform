import React, { useState, useEffect, useRef } from 'react';
import FallbackView from '../components/FallbackView';
import './ARSimulator.css';

export default function ARSimulator() {
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isCheckingCamera, setIsCheckingCamera] = useState(true);

  // Simulation State
  const [waterHeight, setWaterHeight] = useState(0.5); // Meters
  const [isWaterRising, setIsWaterRising] = useState(true);
  const videoRef = useRef(null);

  // Request camera access on component mount
  useEffect(() => {
    let mounted = true;

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

  // Update video element when stream is ready
  useEffect(() => {
    if (cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraStream]);

  // Rising Water Simulation Loop
  useEffect(() => {
    let interval;
    if (isWaterRising) {
      interval = setInterval(() => {
        setWaterHeight((prev) => {
          if (prev >= 3.5) return 0.2; // Loop simulation
          return parseFloat((prev + 0.04).toFixed(2));
        });
      }, 250);
    }
    return () => clearInterval(interval);
  }, [isWaterRising]);

  // Map numerical height to A-Frame Y position
  const aframePlaneY = -1.8 + (waterHeight * 0.65);

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
          embedded
          vr-mode-ui="enabled: false"
          style={{ width: '100%', height: '100%', background: 'transparent' }}
        >
          {/* Lighting */}
          <a-light type="ambient" intensity="0.9" color="#ffffff"></a-light>
          <a-light type="directional" position="2 4 -3" intensity="0.8" color="#38bdf8"></a-light>

          {/* Camera */}
          <a-camera position="0 1.6 0" look-controls="enabled: true"></a-camera>

          {/* 3D Semi-Transparent Water Plane */}
          <a-entity id="water-plane-container" position={`0 ${aframePlaneY} -3`}>
            <a-plane
              width="30"
              height="30"
              rotation="-90 0 0"
              material="color: #0284c7; opacity: 0.62; transparent: true; metalness: 0.1; roughness: 0.1; side: double"
              animation="property: material.opacity; to: 0.72; dir: alternate; dur: 2000; loop: true"
            ></a-plane>
            
            {/* Water Surface Wave Grid Lines */}
            <a-plane
              width="30"
              height="30"
              rotation="-90 0 0"
              position="0 0.02 0"
              material="color: #38bdf8; opacity: 0.25; transparent: true; wireframe: true; side: double"
            ></a-plane>
          </a-entity>

          {/* 3D Safety Direction Arrow pointing North-East */}
          <a-entity
            id="safety-direction-arrow"
            position="1.2 0.8 -2.5"
            rotation="0 45 25"
            animation="property: position; to: 1.2 1.0 -2.5; dir: alternate; dur: 1200; loop: true"
          >
            {/* Arrow Head (Cone) */}
            <a-cone
              position="0 0.6 0"
              radius-bottom="0.25"
              radius-top="0"
              height="0.5"
              material="color: #10b981; emissive: #059669; emissiveIntensity: 0.6"
            ></a-cone>
            
            {/* Arrow Shaft (Cylinder) */}
            <a-cylinder
              position="0 0.15 0"
              radius="0.09"
              height="0.6"
              material="color: #10b981; emissive: #059669; emissiveIntensity: 0.4"
            ></a-cylinder>

            {/* Glowing Base Signal Ring */}
            <a-ring
              position="0 -0.2 0"
              rotation="-90 0 0"
              radius-inner="0.3"
              radius-outer="0.45"
              material="color: #10b981; opacity: 0.8; transparent: true; side: double"
              animation="property: scale; to: 1.4 1.4 1.4; dir: alternate; dur: 1000; loop: true"
            ></a-ring>
          </a-entity>
        </a-scene>
      </div>

      {/* UI Overlay Layer */}
      <div className="ar-ui-overlay">
        {/* Top Header HUD */}
        <div className="ar-header-hud ar-ui-interactive">
          <div className="ar-badge">
            <span className="ar-badge-pulse" />
            <span>LIVE AR SIMULATION</span>
          </div>

          <div className="ar-safety-card">
            {/* Shield Check SVG */}
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
            <div>
              <div className="ar-safety-card-title">Find Safety Vector</div>
              <div className="ar-safety-card-direction">North-East (NE - High Ground)</div>
            </div>
          </div>
        </div>

        {/* Loading Spinner during Camera Initialization */}
        {isCheckingCamera && (
          <div className="ar-instructions-box ar-ui-interactive" style={{ margin: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
              {/* Eye SVG */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <span>Connecting Camera Feed & AR Scene...</span>
            </div>
          </div>
        )}

        {/* User Instructions */}
        {!isCheckingCamera && (
          <div className="ar-instructions-box ar-ui-interactive">
            <p className="ar-instructions-text">
              {/* Info SVG */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              Point device around your surroundings. Watch the blue water plane rise and follow the green 3D arrow towards high ground.
            </p>
          </div>
        )}

        {/* Bottom Controls Dock */}
        <div className="ar-controls-dock ar-ui-interactive">
          <div className="ar-control-group">
            <span className="ar-water-meter">
              Water Level: <strong>+{waterHeight}m</strong>
            </span>
            <input
              type="range"
              min="0"
              max="3.5"
              step="0.1"
              value={waterHeight}
              onChange={(e) => {
                setWaterHeight(parseFloat(e.target.value));
                setIsWaterRising(false);
              }}
              className="ar-slider"
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => setIsWaterRising(!isWaterRising)}
              className={`ar-btn-action ${isWaterRising ? 'ar-btn-secondary' : 'ar-btn-primary'}`}
            >
              {isWaterRising ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="6 3 20 12 6 21 6 3" />
                </svg>
              )}
              {isWaterRising ? 'Pause Water' : 'Auto Rise'}
            </button>

            <button
              onClick={() => {
                setWaterHeight(0.2);
                setIsWaterRising(true);
              }}
              className="ar-btn-action ar-btn-secondary"
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
    </div>
  );
}
