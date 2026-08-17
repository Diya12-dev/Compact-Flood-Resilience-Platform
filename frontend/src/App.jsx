import React, { useState, useEffect } from 'react';
import LeafletMap from './components/LeafletMap';
import FloodZonePanel from './components/FloodZonePanel';
import { calculatePolygonArea, getPolygonBounds } from './utils/geoUtils';

const STORAGE_KEY_ZONES = 'cfrp_flood_zones';

export default function App() {
  const [zones, setZones] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY_ZONES);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved zones:', e);
      }
    }
    return [];
  });

  const [selectedZoneId, setSelectedZoneId] = useState(null);
  const [activeSeverity, setActiveSeverity] = useState('HIGH');
  const [drawMode, setDrawMode] = useState('simple_select'); // 'simple_select' | 'draw_polygon'

  // Persist zones in localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_ZONES, JSON.stringify(zones));
  }, [zones]);

  // Load sample Pune flood zones
  const handleLoadSampleZones = (sampleFeatures) => {
    const formatted = sampleFeatures.map((feat) => {
      const coords = feat.geometry.coordinates[0];
      const area = calculatePolygonArea(coords);
      const bounds = getPolygonBounds(coords);
      return {
        id: feat.id,
        name: feat.properties.name,
        severity: feat.properties.severity,
        area,
        coordinates: coords,
        center: bounds.center,
        bbox: bounds.bbox,
        feature: feat,
        createdAt: feat.properties.createdAt || new Date().toISOString(),
      };
    });

    setZones(formatted);
    if (formatted.length > 0) {
      setSelectedZoneId(formatted[0].id);
    }
  };

  // Delete a specific zone
  const handleDeleteZone = (zoneId) => {
    setZones((prev) => prev.filter((z) => z.id !== zoneId));
    if (selectedZoneId === zoneId) {
      setSelectedZoneId(null);
    }
  };

  // Clear all zones
  const handleClearAllZones = () => {
    if (window.confirm('Are you sure you want to clear all flood zones from the map?')) {
      setZones([]);
      setSelectedZoneId(null);
    }
  };

  return (
    <div className="app-container" id="app-root-layout">
      {/* Top Command Header */}
      <header className="app-header" id="command-header">
        <div className="header-left">
          <div className="platform-logo">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
            </svg>
          </div>
          <div>
            <h1 className="header-title">Compact Flood Resilience Platform</h1>
            <div className="header-meta">
              <span className="badge-branch">branch: feature/mapbox-flood-zones</span>
              <span className="badge-region">📍 Pune Division Command</span>
            </div>
          </div>
        </div>

        <div className="header-right">
          <div className="system-pill live">
            <span className="live-dot" />
            <span>OpenStreetMap Engine Active</span>
          </div>
        </div>
      </header>

      {/* Main Workspace Area: Sidebar Drawer + Map Viewport */}
      <main className="app-workspace" id="main-workspace">
        {/* Left Side Flood Zone Management Panel */}
        <FloodZonePanel
          zones={zones}
          onZonesChange={setZones}
          selectedZoneId={selectedZoneId}
          onSelectZone={setSelectedZoneId}
          activeSeverity={activeSeverity}
          setActiveSeverity={setActiveSeverity}
          drawMode={drawMode}
          setDrawMode={setDrawMode}
          onLoadSampleZones={handleLoadSampleZones}
          onDeleteZone={handleDeleteZone}
          onClearAllZones={handleClearAllZones}
        />

        {/* Center / Full Viewport Leaflet Map */}
        <div className="map-view-container">
          <LeafletMap
            zones={zones}
            onZonesChange={setZones}
            selectedZoneId={selectedZoneId}
            onSelectZone={setSelectedZoneId}
            activeSeverity={activeSeverity}
            drawMode={drawMode}
            setDrawMode={setDrawMode}
          />
        </div>
      </main>
    </div>
  );
}
