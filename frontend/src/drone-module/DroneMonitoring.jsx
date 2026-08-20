import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './DroneMonitoring.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
const WS_BASE_URL = API_BASE_URL.replace(/^http/, 'ws');

export default function DroneMonitoring() {
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [annotatedVideoUrl, setAnnotatedVideoUrl] = useState(null);
  const [videoMode, setVideoMode] = useState('original'); // original | processed
  const [processedVideoError, setProcessedVideoError] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [backendStatus, setBackendStatus] = useState('checking');
  const [processingState, setProcessingState] = useState('idle'); // idle | uploading | analyzing | completed | error
  const [progressPercent, setProgressPercent] = useState(0);
  const [isWsReconnecting, setIsWsReconnecting] = useState(false);
  const [detectionSummary, setDetectionSummary] = useState(null);
  const [missionTelemetry, setMissionTelemetry] = useState(null);
  const [livePosition, setLivePosition] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  // New Mission Playback Intelligence State
  const [tracksList, setTracksList] = useState([]);
  const [missionEvents, setMissionEvents] = useState([]);
  const [selectedTrack, setSelectedTrack] = useState(null);

  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const wsRef = useRef(null);
  const activeMissionIdRef = useRef(null);

  // Check FastAPI backend health status on component mount
  useEffect(() => {
    const controller = new AbortController();

    const checkBackendHealth = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/health`, {
          signal: controller.signal,
        });
        if (response.ok) {
          const data = await response.json();
          if (data && data.status === 'online') {
            setBackendStatus('online');
          } else {
            setBackendStatus('offline');
          }
        } else {
          setBackendStatus('offline');
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          setBackendStatus('offline');
        }
      }
    };

    checkBackendHealth();

    return () => {
      controller.abort();
    };
  }, []);

  // Cleanup object URL and WebSocket on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  // Linear interpolation of GPS position for synchronized video timeline playback
  const getInterpolatedLocation = (timeInSec, waypoints) => {
    if (!waypoints || waypoints.length === 0) return null;
    const t = Number(timeInSec);

    if (t <= waypoints[0].timestamp_seconds) {
      return {
        lat: waypoints[0].lat ?? waypoints[0].latitude,
        lon: waypoints[0].lon ?? waypoints[0].longitude,
      };
    }

    if (t >= waypoints[waypoints.length - 1].timestamp_seconds) {
      const last = waypoints[waypoints.length - 1];
      return {
        lat: last.lat ?? last.latitude,
        lon: last.lon ?? last.longitude,
      };
    }

    for (let i = 0; i < waypoints.length - 1; i++) {
      const w1 = waypoints[i];
      const w2 = waypoints[i + 1];

      const t1 = w1.timestamp_seconds;
      const t2 = w2.timestamp_seconds;

      const lat1 = w1.lat ?? w1.latitude;
      const lon1 = w1.lon ?? w1.longitude;
      const lat2 = w2.lat ?? w2.latitude;
      const lon2 = w2.lon ?? w2.longitude;

      if (t >= t1 && t <= t2) {
        if (t2 === t1) {
          return { lat: lat1, lon: lon1 };
        }
        const ratio = (t - t1) / (t2 - t1);
        const lat = lat1 + ratio * (lat2 - lat1);
        const lon = lon1 + ratio * (lon2 - lon1);
        return { lat, lon };
      }
    }

    const last = waypoints[waypoints.length - 1];
    return {
      lat: last.lat ?? last.latitude,
      lon: last.lon ?? last.longitude,
    };
  };

  const handleSelectVideoClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const connectWebSocket = (missionId, retryCount = 0) => {
    activeMissionIdRef.current = missionId;
    const ws = new WebSocket(`${WS_BASE_URL}/api/drone/stream/${missionId}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      setIsWsReconnecting(false);
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'telemetry') {
          setProgressPercent(msg.progress || 0);
          setDetectionSummary({
            personDetections: msg.people_detections || 0,
            vehicleDetections: msg.vehicle_detections || 0,
            totalDetections: msg.total_detections || 0,
            uniquePersonTracks: msg.unique_person_tracks || 0,
            uniqueVehicleTracks: msg.unique_vehicle_tracks || 0,
            uniqueTrackIds: msg.unique_track_ids || 0,
          });
          if (msg.latitude && msg.longitude) {
            setLivePosition({ lat: msg.latitude, lon: msg.longitude });
          }
        } else if (msg.type === 'completed') {
          setProgressPercent(100);
          setProcessingState('completed');
          setIsWsReconnecting(false);

          if (msg.summary) {
            setDetectionSummary({
              personDetections: msg.summary.person_detections ?? 0,
              vehicleDetections: msg.summary.vehicle_detections ?? 0,
              totalDetections: msg.summary.total_detections ?? 0,
              uniquePersonTracks: msg.summary.unique_person_tracks ?? 0,
              uniqueVehicleTracks: msg.summary.unique_vehicle_tracks ?? 0,
              uniqueTrackIds: msg.summary.unique_track_ids ?? 0,
            });
          }
          if (msg.mission) {
            setMissionTelemetry(msg.mission);
            if (msg.mission.current_position) {
              setLivePosition(msg.mission.current_position);
            }
          }
          if (msg.tracks && Array.isArray(msg.tracks)) {
            setTracksList(msg.tracks);
          }
          if (msg.events && Array.isArray(msg.events)) {
            setMissionEvents(msg.events);
          }
          if (msg.annotated_video) {
            const outputUrl = `${API_BASE_URL}/api/drone/output/${msg.annotated_video}`;
            setAnnotatedVideoUrl(outputUrl);
            setVideoMode('processed'); // Automatically switch to AI PROCESSED mode on completion!
            setProcessedVideoError(false);
          }
        } else if (msg.type === 'error') {
          setProcessingState('error');
          setErrorMessage(msg.message || 'Processing failed');
        }
      } catch (err) {
        console.error('WebSocket message parse error:', err);
      }
    };

    ws.onerror = (err) => {
      console.warn('WebSocket stream error:', err);
    };

    ws.onclose = () => {
      console.log('WebSocket connection closed');
      if (activeMissionIdRef.current === missionId && retryCount < 3) {
        setIsWsReconnecting(true);
        setTimeout(() => {
          if (activeMissionIdRef.current === missionId) {
            connectWebSocket(missionId, retryCount + 1);
          }
        }, 2000);
      } else {
        setIsWsReconnecting(false);
      }
    };
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('video/') && !/\.(mp4|webm|mov|avi)$/i.test(file.name)) {
      alert('Please select a valid video file (.mp4, .webm, .mov, .avi).');
      return;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }

    const newUrl = URL.createObjectURL(file);
    setVideoFile(file);
    setVideoUrl(newUrl);
    setAnnotatedVideoUrl(null);
    setVideoMode('original'); // Immediately set ORIGINAL mode on upload
    setProcessedVideoError(false);
    setIsWsReconnecting(false);
    setCurrentTime(0);
    setDuration(0);
    setProgressPercent(0);
    setDetectionSummary(null);
    setMissionTelemetry(null);
    setLivePosition(null);
    setErrorMessage(null);
    setTracksList([]);
    setMissionEvents([]);
    setSelectedTrack(null);

    setProcessingState('uploading');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_BASE_URL}/api/drone/process`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        if ((data.status === 'started' || data.status === 'completed') && data.mission_id) {
          setProcessingState('analyzing');
          connectWebSocket(data.mission_id, 0);
        } else {
          setProcessingState('error');
          setErrorMessage('Failed to start mission');
        }
      } else {
        const errorData = await response.json().catch(() => ({ detail: 'Processing failed' }));
        setProcessingState('error');
        setErrorMessage(errorData.detail || 'Drone CV processing failed');
      }
    } catch (err) {
      console.error('Drone CV process request error:', err);
      setProcessingState('error');
      setErrorMessage('Backend server connection error');
    }
  };

  const handleClearMission = () => {
    activeMissionIdRef.current = null;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
    setVideoFile(null);
    setVideoUrl(null);
    setAnnotatedVideoUrl(null);
    setVideoMode('original');
    setProcessedVideoError(false);
    setIsWsReconnecting(false);
    setCurrentTime(0);
    setDuration(0);
    setProcessingState('idle');
    setProgressPercent(0);
    setDetectionSummary(null);
    setMissionTelemetry(null);
    setLivePosition(null);
    setErrorMessage(null);
    setTracksList([]);
    setMissionEvents([]);
    setSelectedTrack(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleProcessedVideoError = () => {
    console.warn('Annotated processed video failed to load. Falling back to original video preview.');
    setProcessedVideoError(true);
    setVideoMode('original');
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const vTime = videoRef.current.currentTime || 0;
    setCurrentTime(vTime);

    // Synchronize GPS position telemetry with video timeline playback
    if (missionTelemetry && missionTelemetry.waypoints && missionTelemetry.waypoints.length > 0) {
      const geo = getInterpolatedLocation(vTime, missionTelemetry.waypoints);
      if (geo) {
        setLivePosition(geo);
      }
    }
  };

  const formatTime = (seconds) => {
    if (seconds === undefined || seconds === null || isNaN(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formattedVideoTime = videoUrl
    ? `${formatTime(currentTime)} / ${formatTime(duration)}`
    : '--:--';

  // Filter video-synchronized mission events occurring up to current video timestamp
  const visibleEvents = missionEvents.filter(
    (e) => e.timestamp <= currentTime || processingState !== 'completed'
  );

  const getHudBadge = () => {
    if (!videoUrl) {
      return { text: 'LIVE ANALYSIS FEED', tagClass: '', dotClass: '' };
    }
    if (isWsReconnecting) {
      return { text: 'TELEMETRY CONNECTION LOST — RECONNECTING...', tagClass: 'uploading-tag', dotClass: 'amber-dot' };
    }
    if (processedVideoError && videoMode === 'original') {
      return { text: 'PROCESSED VIDEO UNAVAILABLE (ORIGINAL ACTIVE)', tagClass: 'error-tag', dotClass: '' };
    }
    switch (processingState) {
      case 'uploading':
        return { text: 'UPLOADING MISSION...', tagClass: 'uploading-tag', dotClass: 'amber-dot' };
      case 'analyzing':
        return { text: `ANALYSIS RUNNING — ${progressPercent}%`, tagClass: 'analyzing-tag', dotClass: 'cyan-dot' };
      case 'completed':
        return { text: 'ANALYSIS COMPLETE', tagClass: 'ready-tag', dotClass: 'green-dot' };
      case 'error':
        return { text: 'PROCESSING FAILED', tagClass: 'error-tag', dotClass: '' };
      default:
        return { text: 'LOCAL VIDEO READY', tagClass: 'ready-tag', dotClass: 'green-dot' };
    }
  };

  const hudBadge = getHudBadge();

  return (
    <div className="drone-container">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="video/mp4,video/webm,video/ogg,video/quicktime,.mp4,.webm,.mov"
        style={{ display: 'none' }}
      />

      {/* --------------------------------------------------------------------
          1. HEADER NAVIGATION & SYSTEM STATUS
          -------------------------------------------------------------------- */}
      <header className="drone-header">
        <div className="drone-header-left">
          <Link to="/" className="drone-back-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            Command Home
          </Link>

          <div className="drone-title-group">
            <h1>
              DRONE MONITOR
              <span className="drone-title-badge">DRONE-CV v1.0</span>
            </h1>
            <p className="drone-subtitle">
              Aerial Intelligence, Object Tracking & Mission Telemetry Analysis
            </p>
          </div>
        </div>

        <div className="drone-header-right" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {videoUrl && (
            <button className="drone-remove-video-btn" onClick={handleClearMission} title="Remove uploaded video and clear mission">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              Remove Video
            </button>
          )}

          <div className={`drone-status-pill ${backendStatus}`}>
            <span
              className={
                backendStatus === 'online'
                  ? 'status-dot-pulse'
                  : backendStatus === 'offline'
                  ? 'status-dot-red'
                  : 'status-dot-amber'
              }
            ></span>
            {backendStatus === 'online'
              ? 'BACKEND ONLINE'
              : backendStatus === 'offline'
              ? 'BACKEND OFFLINE'
              : 'CHECKING BACKEND...'}
          </div>
        </div>
      </header>

      {/* --------------------------------------------------------------------
          2. MAIN CONTENT (Tactical Feed & Side Telemetry)
          -------------------------------------------------------------------- */}
      <div className="drone-main-grid">
        {/* Tactical Feed Hero Area */}
        <div className="drone-video-panel">
          <div className="drone-grid-overlay"></div>
          <div className="drone-scanline-overlay"></div>

          {/* Corner Reticle Brackets */}
          <div className="hud-corner hud-top-left"></div>
          <div className="hud-corner hud-top-right"></div>
          <div className="hud-corner hud-bottom-left"></div>
          <div className="hud-corner hud-bottom-right"></div>

          {/* Top HUD Bar with Video Mode Toggle Tabs */}
          <div className="hud-top-bar">
            <div className={`hud-live-tag ${hudBadge.tagClass}`}>
              <span className={`live-dot ${hudBadge.dotClass}`}></span>
              {hudBadge.text}
            </div>

            {/* Video Player Mode Tabs */}
            {videoUrl && (
              <div className="hud-video-mode-toggle">
                <button
                  className={`video-mode-btn ${videoMode === 'original' ? 'active' : ''}`}
                  onClick={() => setVideoMode('original')}
                >
                  ORIGINAL VIDEO
                </button>
                <button
                  className={`video-mode-btn ${videoMode === 'processed' ? 'active' : ''} ${
                    processingState !== 'completed' || processedVideoError ? 'disabled' : ''
                  }`}
                  onClick={() => {
                    if (processingState === 'completed' && annotatedVideoUrl && !processedVideoError) {
                      setVideoMode('processed');
                    }
                  }}
                  disabled={processingState !== 'completed' || !annotatedVideoUrl || processedVideoError}
                  title={
                    processingState === 'completed'
                      ? 'Watch YOLOv8 + ByteTrack Annotated Video'
                      : 'Processing in progress...'
                  }
                >
                  {processingState === 'analyzing' || processingState === 'uploading'
                    ? `PROCESSING (${progressPercent}%)`
                    : 'PROCESSED'}
                </button>
              </div>
            )}

            <div className="hud-top-bar-right">
              <span className="hud-cam-info">
                {videoFile
                  ? `FILE: ${videoFile.name}${videoMode === 'processed' ? ' (ANNOTATED)' : ''}`
                  : 'CAM_01 // AERIAL_FEED'}
              </span>
              {videoUrl && (
                <button className="drone-clear-btn" onClick={handleClearMission} title="Remove uploaded video">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                  Remove Video
                </button>
              )}
            </div>
          </div>

          {/* Real-time Progress Bar Overlay during analysis */}
          {(processingState === 'analyzing' || processingState === 'uploading') && (
            <div className="hud-progress-bar-container">
              <div className="hud-progress-bar" style={{ width: `${progressPercent}%` }}></div>
              <span className="hud-progress-text">REAL-TIME ANALYSIS — {progressPercent}%</span>
            </div>
          )}

          {/* Display Video Stream with Autoplay support */}
          {videoUrl ? (
            <video
              key={videoMode === 'processed' && annotatedVideoUrl ? annotatedVideoUrl : videoUrl}
              ref={videoRef}
              src={videoMode === 'processed' && annotatedVideoUrl ? annotatedVideoUrl : videoUrl}
              controls
              autoPlay
              playsInline
              className="drone-active-video"
              onError={videoMode === 'processed' ? handleProcessedVideoError : undefined}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
              onCanPlay={() => {
                if (videoRef.current) {
                  videoRef.current.play().catch((err) => {
                    console.log('Autoplay deferred by browser policy:', err);
                  });
                }
              }}
            />
          ) : (
            <div className="video-placeholder-content">
              <div className="video-icon-wrapper">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="M10 9l5 3-5 3V9z" />
                </svg>
              </div>
              <h2 className="video-placeholder-title">AERIAL SURVEILLANCE FEED // STANDBY</h2>
              <p className="video-placeholder-desc">
                Load a drone mission video feed to execute YOLOv8 object detection, ByteTrack persistent tracking, and GPS mission telemetry.
              </p>
              <button className="drone-btn-primary drone-btn-compact" onClick={handleSelectVideoClick}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Select Mission Video
              </button>
            </div>
          )}

          {/* Single-row compact HUD metrics overlay strip */}
          {videoUrl && (
            <div className="hud-video-metrics-strip">
              <span className="hud-metric-item cyan-txt">PPL: <strong>{detectionSummary?.uniquePersonTracks ?? 0}</strong></span>
              <span className="hud-metric-divider">•</span>
              <span className="hud-metric-item emerald-txt">VEH: <strong>{detectionSummary?.uniqueVehicleTracks ?? 0}</strong></span>
              <span className="hud-metric-divider">•</span>
              <span className="hud-metric-item bright-txt">TRACKS: <strong>{detectionSummary?.uniqueTrackIds ?? 0}</strong></span>
              <span className="hud-metric-divider">•</span>
              <span className="hud-metric-item amber-txt">DETECTIONS: <strong>{detectionSummary?.totalDetections ?? 0}</strong></span>
            </div>
          )}

          {/* Compact Synchronized Mission Timeline HUD Bar */}
          {videoUrl && (
            <div className="hud-mission-timeline-bar">
              <div className="timeline-hud-col">
                <span className="timeline-hud-label">MISSION TIMELINE</span>
                <span className="timeline-hud-value">
                  {formattedVideoTime}
                </span>
              </div>

              <div className="timeline-hud-col">
                <span className="timeline-hud-label">GPS POSITION</span>
                <span className="timeline-hud-value geo-glow">
                  {livePosition ? `${livePosition.lat.toFixed(6)}° N, ${livePosition.lon.toFixed(6)}° E` : '--.------, --.------'}
                </span>
              </div>

              <div className="timeline-hud-col">
                <span className="timeline-hud-label">ANALYSIS PROGRESS</span>
                <span className="timeline-hud-value cyan-glow">
                  {processingState === 'completed' ? '100% COMPLETE' : `${progressPercent}%`}
                </span>
              </div>

              <div className="timeline-hud-col">
                <span className="timeline-hud-label">MISSION STATE</span>
                <span className="timeline-hud-value">
                  {processingState === 'completed' && <span className="badge-complete">COMPLETE</span>}
                  {processingState === 'analyzing' && <span className="badge-analyzing">ANALYZING</span>}
                  {processingState === 'uploading' && <span className="badge-uploading">UPLOADING</span>}
                  {processingState === 'error' && <span className="badge-error">ERROR</span>}
                  {processingState === 'idle' && <span className="badge-ready">READY</span>}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Side Telemetry Panel */}
        <div className="drone-telemetry-panel">
          <div className="panel-header">
            <h2>MISSION TELEMETRY</h2>
            <span className="panel-tag">
              {processingState === 'completed'
                ? 'ACTIVE'
                : processingState === 'analyzing' || processingState === 'uploading'
                ? 'PROCESSING'
                : videoUrl
                ? 'LOCAL PREVIEW'
                : 'STANDBY'}
            </span>
          </div>

          {/* CRITICAL MISSION KPI & SUMMARY GRID (ALWAYS VISIBLE AT TOP WITHOUT SCROLLING) */}
          <div className="telemetry-kpi-grid-container">
            <div className="kpi-grid-header">
              <span className="kpi-grid-title">MISSION SUMMARY & TRACKING KPIs</span>
              <span className="kpi-grid-status">
                {processingState === 'completed' && <span className="badge-complete">COMPLETE</span>}
                {processingState === 'analyzing' && <span className="badge-analyzing">ANALYZING {progressPercent}%</span>}
                {processingState === 'uploading' && <span className="badge-uploading">UPLOADING</span>}
                {processingState === 'error' && <span className="badge-error">ERROR</span>}
                {processingState === 'idle' && <span className="badge-ready">READY</span>}
              </span>
            </div>

            <div className="kpi-metrics-2x3-grid">
              <div className="kpi-metric-box highlight-box-cyan">
                <span className="kpi-metric-label">UNIQUE PEOPLE</span>
                <span className="kpi-metric-val cyan-glow">
                  {detectionSummary ? detectionSummary.uniquePersonTracks : '--'}
                </span>
                <span className="kpi-metric-sub">
                  ({detectionSummary ? detectionSummary.personDetections : 0} events)
                </span>
              </div>

              <div className="kpi-metric-box highlight-box-emerald">
                <span className="kpi-metric-label">UNIQUE VEHICLES</span>
                <span className="kpi-metric-val emerald-glow">
                  {detectionSummary ? detectionSummary.uniqueVehicleTracks : '--'}
                </span>
                <span className="kpi-metric-sub">
                  ({detectionSummary ? detectionSummary.vehicleDetections : 0} events)
                </span>
              </div>

              <div className="kpi-metric-box highlight-box-bright">
                <span className="kpi-metric-label">TOTAL TRACKS</span>
                <span className="kpi-metric-val bright-glow">
                  {detectionSummary ? detectionSummary.uniqueTrackIds : '--'}
                </span>
                <span className="kpi-metric-sub">Persistent MOT</span>
              </div>

              <div className="kpi-metric-box highlight-box-amber">
                <span className="kpi-metric-label">DETECTION EVENTS</span>
                <span className="kpi-metric-val amber-glow">
                  {detectionSummary ? detectionSummary.totalDetections : '--'}
                </span>
                <span className="kpi-metric-sub">YOLOv8 Frames</span>
              </div>

              <div className="kpi-metric-box">
                <span className="kpi-metric-label">VIDEO DURATION</span>
                <span className="kpi-metric-val">{formatTime(duration)}</span>
                <span className="kpi-metric-sub">{formattedVideoTime}</span>
              </div>

              <div className="kpi-metric-box">
                <span className="kpi-metric-label">GPS WAYPOINTS</span>
                <span className="kpi-metric-val">
                  {missionTelemetry?.waypoints?.length ?? (videoUrl ? 5 : 0)}
                </span>
                <span className="kpi-metric-sub">Path Points</span>
              </div>
            </div>

            {/* GPS POSITION SUMMARY STRIP */}
            <div className="kpi-gps-strip">
              <span className="gps-strip-label">GPS POSITION:</span>
              <span className="gps-strip-val">
                {livePosition
                  ? `${livePosition.lat.toFixed(6)}° N, ${livePosition.lon.toFixed(6)}° E`
                  : '--.------, --.------'}
              </span>
            </div>
          </div>

          {/* DETECTIONS BREAKDOWN */}
          <div className="telemetry-section-title">
            DETECTION BREAKDOWN
          </div>

          <div className="telemetry-item">
            <span className="telemetry-label">PERSON DETECTIONS</span>
            <div className="telemetry-value-container">
              <span className={`telemetry-value ${detectionSummary ? '' : 'placeholder'}`}>
                {detectionSummary ? detectionSummary.personDetections.toLocaleString() : '--'}
              </span>
            </div>
          </div>

          <div className="telemetry-item">
            <span className="telemetry-label">VEHICLE DETECTIONS</span>
            <div className="telemetry-value-container">
              <span className={`telemetry-value ${detectionSummary ? '' : 'placeholder'}`}>
                {detectionSummary ? detectionSummary.vehicleDetections.toLocaleString() : '--'}
              </span>
            </div>
          </div>

          {/* TELEMETRY & POSITION SECTION */}
          <div className="telemetry-section-title">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            TELEMETRY & POSITION
          </div>

          {/* CURRENT LATITUDE */}
          <div className="telemetry-item">
            <span className="telemetry-label">CURRENT LATITUDE</span>
            <div className="telemetry-value-container">
              <span className={`telemetry-value ${livePosition ? 'geo-coord' : 'placeholder'}`}>
                {livePosition ? `${livePosition.lat.toFixed(6)}° N` : '--.------'}
              </span>
            </div>
          </div>

          {/* CURRENT LONGITUDE */}
          <div className="telemetry-item">
            <span className="telemetry-label">CURRENT LONGITUDE</span>
            <div className="telemetry-value-container">
              <span className={`telemetry-value ${livePosition ? 'geo-coord' : 'placeholder'}`}>
                {livePosition ? `${livePosition.lon.toFixed(6)}° E` : '--.------'}
              </span>
            </div>
          </div>

          {/* GPS SOURCE */}
          <div className="telemetry-item">
            <span className="telemetry-label">GPS SOURCE</span>
            <div className="telemetry-value-container">
              <span className="badge-simulated">
                {missionTelemetry ? missionTelemetry.gps_source : 'SIMULATED MISSION PATH'}
              </span>
            </div>
          </div>

          {/* MISSION STATUS */}
          <div className="telemetry-item">
            <span className="telemetry-label">MISSION STATUS</span>
            <div className="telemetry-value-container">
              {processingState === 'completed' && <span className="badge-complete">COMPLETE</span>}
              {processingState === 'analyzing' && <span className="badge-analyzing">ANALYZING</span>}
              {processingState === 'uploading' && <span className="badge-uploading">UPLOADING</span>}
              {processingState === 'error' && <span className="badge-error">ERROR</span>}
              {processingState === 'idle' && <span className="badge-ready">READY</span>}
            </div>
          </div>

          {/* COMPACT MISSION ROUTE CARD */}
          {missionTelemetry && missionTelemetry.waypoints && missionTelemetry.waypoints.length > 0 && (
            <div className="mission-route-card">
              <div className="route-card-header">
                <span className="route-title">MISSION ROUTE</span>
                <span className="route-count">{missionTelemetry.waypoints.length} WAYPOINTS</span>
              </div>
              <div className="route-path-summary">
                <span className="route-point">
                  START: {missionTelemetry.start_position.lat.toFixed(4)}, {missionTelemetry.start_position.lon.toFixed(4)}
                </span>
                <span className="route-arrow">➔</span>
                <span className="route-point">
                  END: {missionTelemetry.end_position.lat.toFixed(4)}, {missionTelemetry.end_position.lon.toFixed(4)}
                </span>
              </div>
            </div>
          )}

          {/* VIDEO TIME */}
          <div className="telemetry-item">
            <span className="telemetry-label">VIDEO TIME</span>
            <div className="telemetry-value-container">
              <span className={`telemetry-value ${videoUrl ? '' : 'placeholder'}`}>
                {formattedVideoTime}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}