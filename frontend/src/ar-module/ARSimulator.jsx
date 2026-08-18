import React, { useState, useEffect, useRef } from 'react';
import FallbackView from '../components/FallbackView';
import './ARSimulator.css';

// Safely register custom A-Frame hit-test listener component for WebXR Immersive AR
function ensureHitTestComponentRegistered() {
  if (typeof window !== 'undefined' && window.AFRAME && !window.AFRAME.components['ar-hit-test-listener']) {
    window.AFRAME.registerComponent('ar-hit-test-listener', {
      init: function () {
        this.hitTestSource = null;
        this.lastPose = null;
        this.stableCount = 0;

        this.el.sceneEl.addEventListener('enter-vr', async () => {
          if (this.el.sceneEl.is('ar-mode')) {
            const session = this.el.sceneEl.renderer.xr.getSession();
            if (session && session.requestHitTestSource) {
              try {
                const refSpace = await session.requestReferenceSpace('viewer');
                this.hitTestSource = await session.requestHitTestSource({ space: refSpace });

                session.addEventListener('end', () => {
                  this.hitTestSource = null;
                  this.lastPose = null;
                  this.stableCount = 0;
                });
              } catch (e) {
                console.warn('WebXR hit-test source request failed:', e);
              }
            }
          }
        });

        this.el.sceneEl.addEventListener('exit-vr', () => {
          this.hitTestSource = null;
          this.lastPose = null;
          this.stableCount = 0;
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
            const newPos = {
              x: parseFloat(pos.x.toFixed(3)),
              y: parseFloat(pos.y.toFixed(3)),
              z: parseFloat(pos.z.toFixed(3))
            };

            // Require stable consecutive hit-test poses to prevent jitter
            if (this.lastPose) {
              const dx = newPos.x - this.lastPose.x;
              const dy = newPos.y - this.lastPose.y;
              const dz = newPos.z - this.lastPose.z;
              const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

              if (dist < 0.3) {
                this.stableCount++;
              } else {
                this.stableCount = 1;
              }
            } else {
              this.stableCount = 1;
            }

            this.lastPose = newPos;

            // Emit surface found only when pose is stable (>= 2 consecutive frames)
            if (this.stableCount >= 2) {
              this.el.emit('ar-surface-found', newPos);
            }
          }
        } else {
          this.el.emit('ar-surface-lost');
        }
      }
    });
  }
}

// Safely register custom A-Frame camera water submersion detection component
function ensureSubmersionComponentRegistered() {
  if (typeof window !== 'undefined' && window.AFRAME && !window.AFRAME.components['camera-water-submersion']) {
    window.AFRAME.registerComponent('camera-water-submersion', {
      schema: {
        waterSurfaceY: { type: 'number', default: -0.6 },
        active: { type: 'boolean', default: false }
      },
      tick: function () {
        if (!this.data.active) return;
        const cameraEl = this.el.querySelector('a-camera') || (this.el.camera && this.el.camera.el);
        if (!cameraEl || !cameraEl.object3D) return;

        const THREE = window.THREE || (window.AFRAME && window.AFRAME.THREE);
        if (!THREE) return;

        const worldPos = new THREE.Vector3();
        cameraEl.object3D.getWorldPosition(worldPos);

        const isSubmerged = worldPos.y < this.data.waterSurfaceY;
        const overlayEl = document.getElementById('ar-dom-overlay-root');
        if (overlayEl) {
          if (isSubmerged) {
            overlayEl.classList.add('underwater-submerged');
          } else {
            overlayEl.classList.remove('underwater-submerged');
          }
        }
      }
    });
  }
}

// Safely register custom A-Frame water depth synchronization component for strict 1:1 metric height scaling
function ensureWaterDepthSyncComponentRegistered() {
  if (typeof window !== 'undefined' && window.AFRAME && !window.AFRAME.components['water-depth-sync']) {
    window.AFRAME.registerComponent('water-depth-sync', {
      schema: {
        depth: { type: 'number', default: 1.0 },
        floorY: { type: 'number', default: -1.6 },
        anchorX: { type: 'number', default: 0 },
        anchorZ: { type: 'number', default: -2.5 }
      },
      update: function () {
        const depth = this.data.depth;
        const floorY = this.data.floorY;
        const anchorX = this.data.anchorX;
        const anchorZ = this.data.anchorZ;
        const surfaceY = floorY + depth;

        // Synchronize surface plane position exactly to floorY + depth
        const surfacePlane = this.el.querySelector('a-plane');
        if (surfacePlane && surfacePlane.object3D) {
          surfacePlane.object3D.position.set(anchorX, surfaceY, anchorZ);
        }

        // Synchronize volumetric cylinder height and center position
        const volumeCylinder = this.el.querySelector('a-cylinder');
        if (volumeCylinder && volumeCylinder.object3D) {
          volumeCylinder.object3D.position.set(anchorX, floorY + (depth / 2), anchorZ);
          volumeCylinder.setAttribute('height', Math.max(0.01, depth));
        }
      }
    });
  }
}

// Safely register custom A-Frame expansive flowing water surface component with Three.js GLSL Shader
function ensureWaterComponentsRegistered() {
  if (typeof window !== 'undefined' && window.AFRAME) {
    if (!window.AFRAME.components['realistic-flood-water']) {
      window.AFRAME.registerComponent('realistic-flood-water', {
        schema: {
          color: { type: 'color', default: '#0e7490' },
          radius: { type: 'number', default: 12.5 },
          flowX: { type: 'number', default: 0.4 },
          flowY: { type: 'number', default: 0.3 }
        },
        init: function () {
          const THREE = window.THREE || (window.AFRAME && window.AFRAME.THREE);
          if (!THREE) return;

          this.uniforms = {
            uTime: { value: 0 },
            uWaterColor: { value: new THREE.Color(this.data.color) },
            uMaxRadius: { value: this.data.radius },
            uFlowDir: { value: new THREE.Vector2(this.data.flowX, this.data.flowY) }
          };

          const vertexShader = `
            varying vec2 vUv;
            varying vec3 vWorldPos;
            uniform float uTime;
            uniform vec2 uFlowDir;

            void main() {
              vUv = uv;
              vec4 worldPos = modelMatrix * vec4(position, 1.0);
              vWorldPos = worldPos.xyz;

              // World coordinate directional flow UVs for continuous fluid motion across floor
              vec2 flowUv = worldPos.xz + uTime * uFlowDir * 0.8;

              // Multi-frequency Gerstner wave vertex displacement
              float w1 = sin(flowUv.x * 1.5 + flowUv.y * 1.2) * 0.025;
              float w2 = cos(flowUv.y * 1.8 - flowUv.x * 1.1) * 0.020;
              float w3 = sin((flowUv.x + flowUv.y) * 1.2) * 0.015;

              vec3 displacedPos = position;
              displacedPos.z += (w1 + w2 + w3);

              vec4 finalWorldPos = modelMatrix * vec4(displacedPos, 1.0);
              gl_Position = projectionMatrix * viewMatrix * finalWorldPos;
            }
          `;

          const fragmentShader = `
            varying vec2 vUv;
            varying vec3 vWorldPos;
            uniform float uTime;
            uniform vec3 uWaterColor;
            uniform vec2 uFlowDir;
            uniform float uMaxRadius;

            void main() {
              // Smooth radial falloff near 12.5m outer boundary
              float distFromCenter = length(vWorldPos.xz);
              float radialAlpha = 1.0 - smoothstep(8.0, uMaxRadius, distFromCenter);

              // World-coordinate directional surface caustics & highlights
              vec2 causticUv = vWorldPos.xz * 1.8 + uTime * uFlowDir * 0.6;

              float caustic1 = sin(causticUv.x * 8.0 + uTime * 1.5) * cos(causticUv.y * 8.0 + uTime * 1.5);
              float caustic2 = sin((causticUv.x + causticUv.y) * 6.0 - uTime * 1.2);
              float highlight = pow(clamp(caustic1 + caustic2, 0.0, 1.0), 3.0) * 0.4;

              vec3 finalColor = uWaterColor + vec3(highlight * 0.25, highlight * 0.45, highlight * 0.55);
              // Target realistic opacity ~0.65 with radial shoreline falloff
              float finalAlpha = (0.55 + highlight * 0.15) * radialAlpha;

              if (finalAlpha < 0.01) discard;

              gl_FragColor = vec4(finalColor, finalAlpha);
            }
          `;

          this.material = new THREE.ShaderMaterial({
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            uniforms: this.uniforms,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false
          });

          const mesh = this.el.getObject3D('mesh');
          if (mesh) {
            mesh.material = this.material;
          } else {
            this.el.addEventListener('model-loaded', () => {
              const loadedMesh = this.el.getObject3D('mesh');
              if (loadedMesh) loadedMesh.material = this.material;
            });
          }
        },
        update: function () {
          const THREE = window.THREE || (window.AFRAME && window.AFRAME.THREE);
          if (this.material && this.material.uniforms && THREE) {
            this.material.uniforms.uWaterColor.value.set(this.data.color);
            this.material.uniforms.uMaxRadius.value = this.data.radius;
            this.material.uniforms.uFlowDir.value.set(this.data.flowX, this.data.flowY);
          }
        },
        tick: function (t, dt) {
          if (this.material && this.material.uniforms) {
            this.material.uniforms.uTime.value = t * 0.001;
          }
        }
      });
    }
  }
}

// Helper function to calculate Flood Risk metadata and aquatic water colors based on predicted flood depth (in meters)
function getRiskDetails(waterHeight) {
  const percentage = Math.min(100, Math.max(0, Math.round((waterHeight / 3.5) * 100)));
  if (percentage < 30) {
    return {
      level: 'LOW',
      percentage,
      color: '#10b981',
      bgColor: 'rgba(16, 185, 129, 0.15)',
      borderColor: 'rgba(16, 185, 129, 0.4)',
      waterColor: '#075985',
      warning: 'Low inundation depth predicted. Observe water height relative to ground.'
    };
  } else if (percentage < 60) {
    return {
      level: 'MODERATE',
      percentage,
      color: '#f59e0b',
      bgColor: 'rgba(245, 158, 11, 0.15)',
      borderColor: 'rgba(245, 158, 11, 0.4)',
      waterColor: '#0e7490',
      warning: 'Moderate predicted flood depth over real-world floor surface.'
    };
  } else if (percentage < 80) {
    return {
      level: 'HIGH',
      percentage,
      color: '#f97316',
      bgColor: 'rgba(249, 115, 22, 0.15)',
      borderColor: 'rgba(249, 115, 22, 0.4)',
      waterColor: '#155e75',
      warning: 'High flood hazard! Significant inundation height over floor plane.'
    };
  } else {
    return {
      level: 'CRITICAL',
      percentage,
      color: '#ef4444',
      bgColor: 'rgba(239, 68, 68, 0.2)',
      borderColor: 'rgba(239, 68, 68, 0.5)',
      waterColor: '#164e63',
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

  // Temporary WebXR Diagnostics State (Dev Mode Only)
  const [showDiagPanel, setShowDiagPanel] = useState(false);
  const [diagLog, setDiagLog] = useState('Click a test button to run diagnostics.');

  // WebXR Surface Hit-Test Placement State
  const [isSurfaceDetected, setIsSurfaceDetected] = useState(false);
  const [detectedSurfacePose, setDetectedSurfacePose] = useState({ x: 0, y: -1.6, z: -2.5 });
  const [isPlaced, setIsPlaced] = useState(false);
  const [placedAnchor, setPlacedAnchor] = useState({ x: 0, y: -1.6, z: -2.5 });

  // Dynamic Device & Screen Orientation Tracking
  const [screenAngle, setScreenAngle] = useState(0);
  const [isLandscape, setIsLandscape] = useState(false);

  // Spatial Anchor Lock Ref to prevent continuous repositioning jitter
  const isLockedRef = useRef(false);

  // WebXR DOM Overlay API Root Element Ref
  const arHudRootRef = useRef(null);

  // Pre-Flood Water Visualization State (Target Depth, Live Depth, Animation Status)
  const [selectedDepth, setSelectedDepth] = useState(1.0); // Target Depth (e.g. 0.5m, 1.0m, 3.0m)
  const [currentWaterDepth, setCurrentWaterDepth] = useState(1.0); // Live Animated Depth
  const [animStatus, setAnimStatus] = useState('READY'); // 'READY', 'FLOOD RISING', 'SIMULATION COMPLETE'
  const [isAnimated, setIsAnimated] = useState(false); // Animation active flag

  const depthPresets = [0.5, 1.0, 1.5, 2.0, 3.0];
  const sceneRef = useRef(null);

  // Ensure custom A-Frame components are registered
  useEffect(() => {
    ensureHitTestComponentRegistered();
    ensureSubmersionComponentRegistered();
    ensureWaterDepthSyncComponentRegistered();
    ensureWaterComponentsRegistered();
  }, []);

  // Track physical screen orientation changes (Portrait vs Landscape) & Viewport dimensions
  useEffect(() => {
    const updateViewportAndOrientation = () => {
      let angle = 0;
      if (typeof window !== 'undefined') {
        if (window.screen && window.screen.orientation) {
          angle = window.screen.orientation.angle || 0;
        } else if (typeof window.orientation !== 'undefined') {
          angle = Number(window.orientation) || 0;
        }

        const width = window.visualViewport ? window.visualViewport.width : window.innerWidth;
        const height = window.visualViewport ? window.visualViewport.height : window.innerHeight;

        const landscape = Math.abs(angle) === 90 || angle === 270 || width > height;

        setScreenAngle(angle);
        setIsLandscape(landscape);

        document.documentElement.style.setProperty('--ar-viewport-width', `${width}px`);
        document.documentElement.style.setProperty('--ar-viewport-height', `${height}px`);
      }
    };

    updateViewportAndOrientation();

    if (typeof window !== 'undefined') {
      if (window.screen && window.screen.orientation) {
        window.screen.orientation.addEventListener('change', updateViewportAndOrientation);
      }
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', updateViewportAndOrientation);
      }
      window.addEventListener('resize', updateViewportAndOrientation);
      window.addEventListener('orientationchange', updateViewportAndOrientation);
    }

    return () => {
      if (typeof window !== 'undefined') {
        if (window.screen && window.screen.orientation) {
          window.screen.orientation.removeEventListener('change', updateViewportAndOrientation);
        }
        if (window.visualViewport) {
          window.visualViewport.removeEventListener('resize', updateViewportAndOrientation);
        }
        window.removeEventListener('resize', updateViewportAndOrientation);
        window.removeEventListener('orientationchange', updateViewportAndOrientation);
      }
    };
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
      isLockedRef.current = false;
    };

    const handleSurfaceFound = (evt) => {
      const { x, y, z } = evt.detail;
      setDetectedSurfacePose({ x, y, z });
      setIsSurfaceDetected(true);

      // Auto-update floor anchor ONLY if position is not locked yet
      if (!isLockedRef.current) {
        setPlacedAnchor({ x, y, z });
      }
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

  // Throttled Smooth Flood Animation Loop (~12Hz) for continuous rising water level
  useEffect(() => {
    let interval;
    if (isAnimated) {
      setAnimStatus('FLOOD RISING');
      setCurrentWaterDepth(0.05);
      interval = setInterval(() => {
        setCurrentWaterDepth((prev) => {
          const next = parseFloat((prev + 0.05).toFixed(2));
          if (next >= selectedDepth) {
            setIsAnimated(false);
            setAnimStatus('SIMULATION COMPLETE');
            return selectedDepth;
          }
          return next;
        });
      }, 80);
    } else {
      if (animStatus !== 'SIMULATION COMPLETE') {
        setCurrentWaterDepth(selectedDepth);
        setAnimStatus('READY');
      }
    }
    return () => clearInterval(interval);
  }, [isAnimated, selectedDepth]);

  // Dynamic Risk Details based on live water depth
  const risk = getRiskDetails(currentWaterDepth);

  // WebXR Metric 1:1 Height Calibration:
  // In WebXR / A-Frame world space, 1 unit = 1 real-world meter.
  // Floor Y is placedAnchor.y (locked floor anchor).
  // Water Surface Y elevates vertically to placedAnchor.y + currentWaterDepth.
  const METRIC_SCALE_FACTOR = 1.0;
  const waterSurfaceY = placedAnchor.y + (currentWaterDepth * METRIC_SCALE_FACTOR);

  // Explicitly lock spatial placement on user tap/click
  const handlePlaceSimulation = () => {
    if (isSurfaceDetected) {
      setPlacedAnchor(detectedSurfacePose);
    }
    isLockedRef.current = true;
    setIsPlaced(true);
  };

  // Helper to format detailed WebXR DOMExceptions without masking
  const formatXRError = (err) => {
    if (!err) return 'Unknown WebXR error';
    if (err.name === 'NotAllowedError') {
      return 'Permission Denied: Camera/AR access was denied. Please allow Camera & AR permissions in Chrome site settings and try again.';
    }
    return [
      err.name || 'WebXRError',
      err.message || String(err)
    ].join(': ');
  };

  // Launch WebXR AR Immersive Session directly from user touch gesture with DOM Overlay API
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

      // WebXR Session Configuration with DOM Overlay API
      const sessionOptions = {
        optionalFeatures: ['dom-overlay']
      };

      if (arHudRootRef.current) {
        sessionOptions.domOverlay = { root: arHudRootRef.current };
      }

      // 1. Request native WebXR immersive AR session
      const session = await navigator.xr.requestSession('immersive-ar', sessionOptions);

      console.log('WebXR Session Created Successfully');
      console.log('DOM Overlay State:', session.domOverlayState || 'Not supported / not active');

      // Reset placement lock ref
      isLockedRef.current = false;

      // 2. Reference Space Fallback Strategy (local-floor -> local -> viewer)
      let selectedReferenceSpaceType = 'local-floor';
      try {
        await session.requestReferenceSpace('local-floor');
        selectedReferenceSpaceType = 'local-floor';
      } catch (e1) {
        try {
          await session.requestReferenceSpace('local');
          selectedReferenceSpaceType = 'local';
        } catch (e2) {
          try {
            await session.requestReferenceSpace('viewer');
            selectedReferenceSpaceType = 'viewer';
          } catch (e3) {
            throw e3;
          }
        }
      }

      // 3. Connect session & reference space to Three.js WebGLRenderer.xr
      const vrManager = sceneEl.renderer ? sceneEl.renderer.xr : null;
      if (vrManager) {
        vrManager.enabled = true;
        if (typeof vrManager.setReferenceSpaceType === 'function') {
          vrManager.setReferenceSpaceType(selectedReferenceSpaceType);
        }
        await vrManager.setSession(session);
        sceneEl.xrSession = session;
      }

      // 4. Session end lifecycle cleanup
      session.addEventListener('end', () => {
        if (sceneEl.removeState) {
          sceneEl.removeState('ar-mode');
          sceneEl.removeState('vr-mode');
        }
        if (sceneEl.renderer && sceneEl.renderer.xr) {
          sceneEl.renderer.xr.enabled = false;
        }
        sceneEl.xrSession = null;
        isLockedRef.current = false;
        setIsInARSession(false);
        setIsPlaced(false);
        setIsSurfaceDetected(false);
        if (sceneEl.emit) {
          sceneEl.emit('exit-vr', { target: sceneEl });
        }
      });

      // 5. Fast AR Start: Instantly establish default spatial position & render water plane
      setPlacedAnchor({ x: 0, y: -1.6, z: -2.5 });
      setIsPlaced(true);

      // 6. Determine hit-test capability
      const hasHitTest = session.enabledFeatures
        ? session.enabledFeatures.includes('hit-test')
        : (typeof session.requestHitTestSource === 'function');

      setIsHitTestSupported(hasHitTest);

      // 7. Update A-Frame state & emit enter-vr event for components
      if (sceneEl.addState) {
        sceneEl.addState('ar-mode');
      }
      if (sceneEl.emit) {
        sceneEl.emit('enter-vr', { target: sceneEl });
      }

      setIsInARSession(true);
    } catch (err) {
      console.error('WebXR requestSession failed:', err);
      setArError(formatXRError(err));
    }
  };

  // Diagnostic Action 1: Collect Browser, Security & WebXR Capability Info (Dev Mode Only)
  const runCapabilityCheck = async () => {
    let log = [];
    log.push('=== TEMPORARY WEBXR DIAGNOSTICS ===');
    log.push(`Timestamp: ${new Date().toISOString()}`);
    log.push(`URL: ${window.location.href}`);
    log.push('');

    log.push('[A. Browser & Security]');
    log.push(`Secure Context: ${window.isSecureContext ? 'YES' : 'NO'}`);
    log.push(`Protocol: ${window.location.protocol}`);
    log.push(`Hostname: ${window.location.hostname}`);
    log.push(`User Agent: ${navigator.userAgent}`);
    log.push(`Platform: ${navigator.platform || 'Unknown'}`);
    log.push(`Vendor: ${navigator.vendor || 'Unknown'}`);
    log.push(`Language: ${navigator.language || 'Unknown'}`);
    log.push('');

    log.push('[B. Device / UA Analysis]');
    const isAndroid = /Android/i.test(navigator.userAgent);
    const isChrome = /Chrome/i.test(navigator.userAgent) && !/Edg|OPR|Brave/i.test(navigator.userAgent);
    const chromeVer = navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1] || 'Unknown';
    const isMobile = /Mobi|Android/i.test(navigator.userAgent);
    log.push(`Android Detected: ${isAndroid ? 'YES' : 'NO'}`);
    log.push(`Chrome Detected: ${isChrome ? 'YES' : 'NO'}`);
    log.push(`Chrome Version: ${chromeVer}`);
    log.push(`Mobile Device: ${isMobile ? 'YES' : 'NO'}`);
    log.push('');

    log.push('[C. WebXR Availability]');
    const hasXR = typeof navigator !== 'undefined' && 'xr' in navigator && !!navigator.xr;
    log.push(`typeof navigator.xr: ${typeof (navigator.xr)}`);
    log.push(`navigator.xr Exists: ${hasXR ? 'YES' : 'NO'}`);

    if (hasXR) {
      try {
        const supported = await navigator.xr.isSessionSupported('immersive-ar');
        log.push(`isSessionSupported('immersive-ar'): ${supported ? 'YES' : 'NO'}`);
      } catch (err) {
        log.push(`isSessionSupported('immersive-ar') ERROR: ${err?.name || err}: ${err?.message || ''}`);
      }
    } else {
      log.push("isSessionSupported('immersive-ar'): UNCHECKED (navigator.xr missing)");
    }
    log.push('');

    log.push('[D. Permissions API]');
    if (navigator.permissions && navigator.permissions.query) {
      try {
        const camPerm = await navigator.permissions.query({ name: 'camera' });
        log.push(`Camera Permission: ${camPerm.state}`);
      } catch (err) {
        log.push('Camera permission API: unavailable');
      }
    } else {
      log.push('Camera permission API: unavailable');
    }
    log.push('WebXR permission API: unavailable');
    log.push('');

    setDiagLog(log.join('\n'));
  };

  // Diagnostic Action 2: Run Raw Minimal WebXR Session Test (Dev Mode Only)
  const runMinimalSessionTest = async () => {
    let log = [];
    log.push('=== MINIMAL AR SESSION TEST ===');
    log.push(`Timestamp: ${new Date().toISOString()}`);

    if (!navigator.xr) {
      log.push('ERROR: navigator.xr is undefined/missing!');
      setDiagLog(log.join('\n'));
      return;
    }

    try {
      const session = await navigator.xr.requestSession('immersive-ar');

      log.push('');
      log.push('Minimal immersive-ar requestSession: SUCCESS');
      log.push(`Session Mode: ${session.mode}`);
      log.push(`Visibility State: ${session.visibilityState}`);

      try {
        await session.end();
        log.push('Diagnostic session ended cleanly via session.end()');
      } catch (endErr) {
        log.push(`session.end() note: ${endErr?.message || String(endErr)}`);
      }
    } catch (err) {
      console.error('WebXR diagnostic requestSession failed:', err);
      log.push('');
      log.push('Minimal requestSession: FAILED');
      log.push(`Error Name: ${err?.name || 'UndefinedName'}`);
      log.push(`Error Message: ${err?.message || String(err)}`);
    }

    setDiagLog(log.join('\n'));
  };

  // If WebXR is unsupported (e.g. desktop browser), render Graceful Fallback View
  if (!isCheckingWebXR && !isWebXRSupported) {
    return <FallbackView errorMessage="Immersive WebXR Spatial AR is unsupported on this device/browser. Please open on an ARCore/ARKit compatible mobile device running Chrome over HTTPS." />;
  }

  return (
    <div className="ar-simulator-root">
      {/* WebXR DOM Overlay API Root Element (Mounted in DOM so ref exists for requestSession) */}
      <div
        ref={arHudRootRef}
        id="ar-dom-overlay-root"
        className={`ar-dom-overlay-container ${isInARSession ? 'active' : ''} ${isLandscape ? 'orientation-landscape' : 'orientation-portrait'}`}
        data-angle={screenAngle}
      >
        {isInARSession && (
          <div className="ar-hud-two-corners">
            {/* Top-Left Corner Panel */}
            <div className="ar-hud-corner-card ar-hud-top-left">
              <span className="ar-hud-corner-title">FLOOD SIMULATION</span>
              <div className="ar-hud-corner-status" style={{ color: animStatus === 'FLOOD RISING' ? '#06b6d4' : '#10b981' }}>
                <span
                  className="ar-status-dot"
                  style={{
                    backgroundColor:
                      animStatus === 'FLOOD RISING' ? '#06b6d4' :
                      animStatus === 'SIMULATION COMPLETE' ? '#10b981' : '#38bdf8'
                  }}
                />
                <span>
                  {animStatus === 'FLOOD RISING' ? 'FLOOD RISING' :
                   animStatus === 'SIMULATION COMPLETE' ? 'COMPLETE' : 'ACTIVE'}
                </span>
              </div>
              <div className="ar-hud-corner-title" style={{ marginTop: '2px', color: risk.color }}>
                RISK: {risk.level} · {risk.percentage}%
              </div>
            </div>

            {/* Top-Right Corner Panel */}
            <div className="ar-hud-corner-card ar-hud-top-right">
              <span className="ar-hud-corner-title">WATER LEVEL</span>
              <span className="ar-hud-corner-metric">
                +{currentWaterDepth.toFixed(2)}m
              </span>
              <div style={{ fontSize: '0.68rem', color: '#cbd5e1', fontWeight: 700 }}>
                TARGET: {selectedDepth.toFixed(1)}m
              </div>
              <div className="ar-hud-mini-progress-track">
                <div
                  className="ar-hud-mini-progress-fill"
                  style={{
                    width: `${Math.min(100, Math.max(0, (currentWaterDepth / selectedDepth) * 100))}%`,
                    backgroundColor: risk.color
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* A-Frame 3D AR WebXR Scene */}
      <div className="ar-scene-container">
        <a-scene
          ref={sceneRef}
          embedded
          ar-hit-test-listener
          camera-water-submersion={`waterSurfaceY: ${waterSurfaceY}; active: ${isInARSession && isPlaced}`}
          webxr="enabled: true"
          ar-mode-ui="enabled: false"
          vr-mode-ui="enabled: false"
          style={{ width: '100%', height: '100%', background: 'transparent' }}
        >
          {/* Lighting */}
          <a-light type="ambient" intensity="0.9" color="#ffffff"></a-light>
          <a-light type="directional" position="2 4 -3" intensity="0.8" color="#38bdf8"></a-light>

          {/* Camera */}
          <a-camera position="0 1.6 0" look-controls="enabled: true"></a-camera>

          {/* WebXR Real-World Hit-Test Surface Placement Ring Indicator (Visible ONLY Before Placement Lock) */}
          {isInARSession && !isLockedRef.current && isSurfaceDetected && isHitTestSupported && (
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

          {/* 3D Pre-Flood Translucent Expansive Water Volume & Flowing Surface (Strict 1:1 Metric Height Scaling) */}
          {isPlaced && (
            <a-entity
              id="water-simulation-container"
              water-depth-sync={`depth: ${currentWaterDepth}; floorY: ${placedAnchor.y}; anchorX: ${placedAnchor.x}; anchorZ: ${placedAnchor.z}`}
            >
              {/* Expansive Volumetric Water Depth Body (Fills entire span from floor placedAnchor.y up to waterSurfaceY) */}
              <a-cylinder
                radius="12.5"
                height={Math.max(0.01, currentWaterDepth)}
                position={`${placedAnchor.x} ${placedAnchor.y + currentWaterDepth / 2} ${placedAnchor.z}`}
                material={`color: ${risk.waterColor}; opacity: 0.32; transparent: true; side: double; depthWrite: false`}
              ></a-cylinder>

              {/* Expansive Top Surface Plane with World-Coordinate Shader Wave Displacement */}
              <a-plane
                realistic-flood-water={`color: ${risk.waterColor}; radius: 12.5; flowX: 0.4; flowY: 0.3`}
                width="25.0"
                height="25.0"
                segments-width="48"
                segments-height="48"
                rotation="-90 0 0"
                position={`${placedAnchor.x} ${waterSurfaceY} ${placedAnchor.z}`}
              ></a-plane>
            </a-entity>
          )}
        </a-scene>
      </div>

      {/* Normal UI Overlay Layer (Outside AR Mode) */}
      <div className="ar-ui-overlay">
        {!isInARSession && (
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
        )}

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

        {/* Development-Only WebXR Diagnostics Panel (Omitted from Production Build) */}
        {import.meta.env.DEV && (
          <div className="ar-ui-interactive" style={{ margin: '8px auto', width: '90%', maxWidth: '460px' }}>
            <button
              onClick={() => setShowDiagPanel(!showDiagPanel)}
              style={{
                width: '100%',
                padding: '6px 12px',
                backgroundColor: 'rgba(30, 41, 59, 0.9)',
                color: '#38bdf8',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              {showDiagPanel ? '▼ Hide Temporary WebXR Diagnostics' : '▶ TEMPORARY WEBXR DIAGNOSTICS'}
            </button>

            {showDiagPanel && (
              <div style={{
                marginTop: '6px',
                padding: '12px',
                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                borderRadius: '8px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    onClick={runCapabilityCheck}
                    style={{
                      padding: '6px 10px',
                      backgroundColor: '#0284c7',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Run WebXR Capability Test
                  </button>
                  <button
                    onClick={runMinimalSessionTest}
                    style={{
                      padding: '6px 10px',
                      backgroundColor: '#06b6d4',
                      color: '#0f172a',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Run Minimal AR Session Test
                  </button>
                </div>

                <pre style={{
                  margin: 0,
                  padding: '8px',
                  backgroundColor: '#090d16',
                  color: '#4ade80',
                  fontSize: '0.7rem',
                  fontFamily: 'monospace',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'all',
                  maxHeight: '220px',
                  overflowY: 'auto',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '4px'
                }}>
                  {diagLog}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* User Instructions (outside AR) */}
        {!isInARSession && !isCheckingWebXR && (
          <div className="ar-instructions-box ar-ui-interactive">
            <p className="ar-instructions-text">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              Tap "Start AR Experience" to begin camera passthrough and flood visualization.
            </p>
          </div>
        )}

        {/* In-AR Mode Bottom Controls Dock */}
        {isInARSession ? (
          <div className="ar-hud-bottom ar-ui-interactive">
            {/* Lock Status & Guidance Bar */}
            <div className="ar-hud-lock-bar">
              <span
                className="ar-lock-chip"
                style={{
                  borderColor: isLockedRef.current ? 'rgba(16,185,129,0.5)' : 'rgba(6,182,212,0.5)',
                  color: isLockedRef.current ? '#10b981' : '#38bdf8'
                }}
              >
                {isLockedRef.current ? '📍 FLOOR LOCKED' : (isSurfaceDetected ? '📍 FLOOR DETECTED' : '📍 DETECTING FLOOR...')}
              </span>
              <span className="ar-hud-instruction">
                {isLockedRef.current
                  ? risk.warning
                  : (isSurfaceDetected
                    ? 'Floor detected · Position locked'
                    : 'Point camera at the floor to detect surface')}
              </span>
            </div>

            {/* Presets & Animation Controls Row */}
            <div className="ar-controls-row">
              <div className="ar-presets-group">
                <span className="ar-preset-label">Presets:</span>
                {depthPresets.map((preset) => (
                  <button
                    key={preset}
                    onClick={() => {
                      setSelectedDepth(preset);
                      setCurrentWaterDepth(preset);
                      setIsAnimated(false);
                      setAnimStatus('READY');
                    }}
                    className={`ar-preset-btn ${selectedDepth === preset && !isAnimated ? 'active' : ''}`}
                  >
                    {preset}m
                  </button>
                ))}
              </div>

              <button
                onClick={() => {
                  if (isAnimated) {
                    setIsAnimated(false);
                    setAnimStatus('READY');
                  } else {
                    setIsAnimated(true);
                  }
                }}
                className={`ar-btn-action ${isAnimated ? 'ar-btn-secondary' : 'ar-btn-primary'}`}
              >
                {animStatus === 'FLOOD RISING' ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="6" y="4" width="4" height="16" />
                      <rect x="14" y="4" width="4" height="16" />
                    </svg>
                    ⏸ FLOOD RISING
                  </>
                ) : animStatus === 'SIMULATION COMPLETE' ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                    </svg>
                    ↻ RUN AGAIN
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="6 3 20 12 6 21 6 3" />
                    </svg>
                    ▶ START FLOOD
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* Normal Bottom Controls Dock (outside AR) */
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
                      setCurrentWaterDepth(preset);
                      setIsAnimated(false);
                      setAnimStatus('READY');
                    }}
                    className={`ar-preset-btn ${selectedDepth === preset && !isAnimated ? 'active' : ''}`}
                  >
                    {preset}m
                  </button>
                ))}
              </div>

              <button
                onClick={() => {
                  if (isAnimated) {
                    setIsAnimated(false);
                    setAnimStatus('READY');
                  } else {
                    setIsAnimated(true);
                  }
                }}
                className={`ar-btn-action ${isAnimated ? 'ar-btn-secondary' : 'ar-btn-primary'}`}
              >
                {animStatus === 'FLOOD RISING' ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="6" y="4" width="4" height="16" />
                      <rect x="14" y="4" width="4" height="16" />
                    </svg>
                    ⏸ FLOOD RISING
                  </>
                ) : animStatus === 'SIMULATION COMPLETE' ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                    </svg>
                    ↻ RUN AGAIN
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="6 3 20 12 6 21 6 3" />
                    </svg>
                    ▶ START FLOOD
                  </>
                )}
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
                  const val = parseFloat(e.target.value);
                  setSelectedDepth(val);
                  setCurrentWaterDepth(val);
                  setIsAnimated(false);
                  setAnimStatus('READY');
                }}
                className="ar-slider"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
