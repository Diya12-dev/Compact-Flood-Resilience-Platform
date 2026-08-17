import React, { useState } from 'react';
import { SEVERITY_CONFIG, formatArea, downloadGeoJSON } from '../utils/geoUtils';

// Sample Pune flood zones along Mutha River for instant demo testing
const PUNE_SAMPLE_ZONES = [
  {
    type: 'Feature',
    id: 'sample-pune-mutha-critical',
    properties: {
      name: 'Mutha Riverbed - Deccan Gymkhana',
      severity: 'CRITICAL',
      createdAt: new Date().toISOString(),
    },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [73.8402, 18.5175],
          [73.8475, 18.5192],
          [73.8512, 18.5168],
          [73.8461, 18.5135],
          [73.8395, 18.5152],
          [73.8402, 18.5175],
        ],
      ],
    },
  },
  {
    type: 'Feature',
    id: 'sample-pune-sangam-high',
    properties: {
      name: 'Sangam Bridge Confluence Zone',
      severity: 'HIGH',
      createdAt: new Date().toISOString(),
    },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [73.8585, 18.5285],
          [73.8672, 18.5312],
          [73.8698, 18.5265],
          [73.8615, 18.5242],
          [73.8585, 18.5285],
        ],
      ],
    },
  },
  {
    type: 'Feature',
    id: 'sample-pune-yerwada-medium',
    properties: {
      name: 'Yerwada Low-Lying Floodplain',
      severity: 'MEDIUM',
      createdAt: new Date().toISOString(),
    },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [73.8821, 18.5492],
          [73.8935, 18.5521],
          [73.8962, 18.5445],
          [73.8845, 18.5422],
          [73.8821, 18.5492],
        ],
      ],
    },
  },
  {
    type: 'Feature',
    id: 'sample-pune-kothrud-low',
    properties: {
      name: 'Kothrud Runoff Advisory Area',
      severity: 'LOW',
      createdAt: new Date().toISOString(),
    },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [73.8052, 18.5085],
          [73.8162, 18.5112],
          [73.8195, 18.5042],
          [73.8081, 18.5015],
          [73.8052, 18.5085],
        ],
      ],
    },
  },
];

export default function FloodZonePanel({
  zones,
  onZonesChange,
  selectedZoneId,
  onSelectZone,
  activeSeverity,
  setActiveSeverity,
  drawMode,
  setDrawMode,
  onLoadSampleZones,
  onDeleteZone,
  onClearAllZones,
}) {
  const [activeTab, setActiveTab] = useState('zones'); // 'zones' | 'geojson'
  const [editingZoneId, setEditingZoneId] = useState(null);
  const [editName, setEditName] = useState('');
  const [copyFeedback, setCopyFeedback] = useState(false);

  const selectedZone = zones.find((z) => z.id === selectedZoneId);

  // Generate standard GeoJSON FeatureCollection
  const geoJsonFeatureCollection = {
    type: 'FeatureCollection',
    name: 'Pune_Flood_Resilience_Zones',
    crs: {
      type: 'name',
      properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' },
    },
    features: zones.map((z) => ({
      type: 'Feature',
      id: z.id,
      properties: {
        id: z.id,
        name: z.name,
        severity: z.severity,
        area_sq_meters: Math.round(z.area),
        area_formatted: formatArea(z.area),
        createdAt: z.createdAt,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [z.coordinates],
      },
    })),
  };

  const handleStartDraw = () => {
    if (drawMode === 'draw_polygon') {
      setDrawMode('simple_select');
    } else {
      setDrawMode('draw_polygon');
    }
  };

  const handleStartEditName = (zone) => {
    setEditingZoneId(zone.id);
    setEditName(zone.name);
  };

  const handleSaveName = (zoneId) => {
    if (!editName.trim()) return;
    const updated = zones.map((z) => (z.id === zoneId ? { ...z, name: editName.trim() } : z));
    onZonesChange(updated);
    setEditingZoneId(null);
  };

  const handleUpdateSeverity = (zoneId, newSeverity) => {
    const updated = zones.map((z) => (z.id === zoneId ? { ...z, severity: newSeverity } : z));
    onZonesChange(updated);
  };

  const handleCopyGeoJSON = () => {
    navigator.clipboard.writeText(JSON.stringify(geoJsonFeatureCollection, null, 2));
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  const handleDownload = () => {
    downloadGeoJSON(geoJsonFeatureCollection, `pune-flood-zones-${new Date().toISOString().slice(0, 10)}.geojson`);
  };

  const loadSamples = () => {
    onLoadSampleZones(PUNE_SAMPLE_ZONES);
  };

  return (
    <aside className="flood-panel" id="flood-zone-management-panel">
      {/* Panel Header */}
      <div className="panel-header">
        <div className="panel-brand">
          <div className="brand-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
            </svg>
          </div>
          <div>
            <h2 className="panel-title">Flood Resilience Engine</h2>
            <span className="panel-subtitle">Geospatial Hazard Mapping & Zones</span>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="panel-tabs">
          <button
            id="tab-btn-zones"
            className={`tab-btn ${activeTab === 'zones' ? 'active' : ''}`}
            onClick={() => setActiveTab('zones')}
          >
            Zones ({zones.length})
          </button>
          <button
            id="tab-btn-geojson"
            className={`tab-btn ${activeTab === 'geojson' ? 'active' : ''}`}
            onClick={() => setActiveTab('geojson')}
          >
            GeoJSON
          </button>
        </div>
      </div>

      {/* Main Action Bar: Draw Tool & Severity Selector */}
      <div className="panel-draw-controls" id="draw-action-card">
        <div className="draw-header-row">
          <span className="section-label">NEW ZONE SEVERITY</span>
          <span className={`draw-badge ${drawMode === 'draw_polygon' ? 'active-pulse' : ''}`}>
            {drawMode === 'draw_polygon' ? '● Drawing Active' : 'Ready'}
          </span>
        </div>

        {/* Severity Selector Grid */}
        <div className="severity-grid">
          {Object.entries(SEVERITY_CONFIG).map(([key, cfg]) => (
            <button
              key={key}
              id={`btn-severity-${key.toLowerCase()}`}
              type="button"
              className={`severity-btn ${activeSeverity === key ? 'selected' : ''}`}
              style={{
                '--sev-color': cfg.color,
                '--sev-border': cfg.border,
                '--sev-bg': cfg.bgLight,
              }}
              onClick={() => setActiveSeverity(key)}
            >
              <span className="sev-dot" />
              <span className="sev-text">{key}</span>
            </button>
          ))}
        </div>

        {/* Primary Draw Action Button */}
        <button
          id="btn-draw-polygon"
          type="button"
          className={`btn btn-draw ${drawMode === 'draw_polygon' ? 'btn-drawing' : 'btn-primary'}`}
          onClick={handleStartDraw}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="12 2 2 7 12 12 22 7 12 2" />
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
          </svg>
          <span>{drawMode === 'draw_polygon' ? 'Cancel Drawing (Esc)' : '+ Draw Flood Zone Polygon'}</span>
        </button>

        {drawMode === 'draw_polygon' && (
          <div className="draw-hint-box">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span>Click map to place points. Double-click or click starting point to finish.</span>
          </div>
        )}
      </div>

      {/* Tab 1: Flood Zones List & Inspector */}
      {activeTab === 'zones' && (
        <div className="panel-scroll-area">
          {/* Quick Actions & Demo Loader */}
          <div className="panel-section-header">
            <span className="section-label">ACTIVE FLOOD ZONES</span>
            <div className="quick-links">
              {zones.length === 0 && (
                <button id="btn-load-pune-samples" className="btn-link" onClick={loadSamples}>
                  + Load Pune Samples
                </button>
              )}
              {zones.length > 0 && (
                <button id="btn-clear-all-zones" className="btn-link danger" onClick={onClearAllZones}>
                  Clear All
                </button>
              )}
            </div>
          </div>

          {/* Zones Listing */}
          {zones.length === 0 ? (
            <div className="empty-state-card" id="empty-zones-state">
              <div className="empty-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              </div>
              <h4>No Flood Zones Drawn Yet</h4>
              <p>Click "Draw Flood Zone Polygon" above to outline flood-prone areas on the map, or load Pune sample data.</p>
              <button id="btn-load-samples-empty" className="btn btn-secondary" onClick={loadSamples}>
                Load Pune River Basin Samples
              </button>
            </div>
          ) : (
            <div className="zones-list" id="zones-list-container">
              {zones.map((zone) => {
                const isSelected = selectedZoneId === zone.id;
                const sevConfig = SEVERITY_CONFIG[zone.severity] || SEVERITY_CONFIG.HIGH;

                return (
                  <div
                    key={zone.id}
                    id={`zone-card-${zone.id}`}
                    className={`zone-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => onSelectZone(zone.id)}
                  >
                    <div className="zone-card-top">
                      {editingZoneId === zone.id ? (
                        <div className="inline-edit-group" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            className="inline-input"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveName(zone.id);
                              if (e.key === 'Escape') setEditingZoneId(null);
                            }}
                          />
                          <button className="btn-icon check" onClick={() => handleSaveName(zone.id)} title="Save">
                            ✓
                          </button>
                          <button className="btn-icon cancel" onClick={() => setEditingZoneId(null)} title="Cancel">
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="zone-title-row">
                          <span className="zone-name" title={zone.name}>
                            {zone.name}
                          </span>
                          <button
                            className="btn-edit-name"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartEditName(zone);
                            }}
                            title="Edit Name"
                          >
                            ✎
                          </button>
                        </div>
                      )}

                      {/* Severity Badge */}
                      <span
                        className="severity-pill"
                        style={{
                          backgroundColor: sevConfig.bgLight,
                          color: sevConfig.color,
                          borderColor: sevConfig.border,
                        }}
                      >
                        {zone.severity}
                      </span>
                    </div>

                    {/* Zone Metrics */}
                    <div className="zone-metrics-row">
                      <div className="metric">
                        <span className="metric-lbl">Area:</span>
                        <span className="metric-val mono">{formatArea(zone.area)}</span>
                      </div>
                      <div className="metric">
                        <span className="metric-lbl">Vertices:</span>
                        <span className="metric-val mono">{zone.coordinates?.length || 0}</span>
                      </div>
                    </div>

                    {/* Detailed Zone Inspector when Selected */}
                    {isSelected && (
                      <div className="zone-inspector-details" onClick={(e) => e.stopPropagation()}>
                        <div className="inspector-field">
                          <label>Severity Level:</label>
                          <select
                            id={`select-severity-${zone.id}`}
                            className="severity-select"
                            value={zone.severity}
                            onChange={(e) => handleUpdateSeverity(zone.id, e.target.value)}
                          >
                            <option value="LOW">LOW (Advisory / Minor)</option>
                            <option value="MEDIUM">MEDIUM (Rising Water / Restricted)</option>
                            <option value="HIGH">HIGH (Severe Flood / Evacuation)</option>
                            <option value="CRITICAL">CRITICAL (Life-Threatening / Emergency)</option>
                          </select>
                        </div>

                        <div className="inspector-actions">
                          <button
                            id={`btn-delete-zone-${zone.id}`}
                            type="button"
                            className="btn btn-danger-outline"
                            onClick={() => onDeleteZone(zone.id)}
                          >
                            Delete Zone
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: GeoJSON Representation & Export */}
      {activeTab === 'geojson' && (
        <div className="panel-scroll-area" id="geojson-tab-content">
          <div className="geojson-header-bar">
            <span className="section-label">RFC 7946 GEOJSON FEATURE COLLECTION</span>
            <div className="geojson-actions">
              <button id="btn-copy-geojson" className="btn btn-secondary-sm" onClick={handleCopyGeoJSON}>
                {copyFeedback ? '✓ Copied!' : 'Copy'}
              </button>
              <button id="btn-download-geojson" className="btn btn-primary-sm" onClick={handleDownload}>
                Export File
              </button>
            </div>
          </div>

          <div className="geojson-code-container">
            <pre className="geojson-pre mono">{JSON.stringify(geoJsonFeatureCollection, null, 2)}</pre>
          </div>
        </div>
      )}

      {/* Footer Export & Metrics Bar */}
      <div className="panel-footer">
        <div className="summary-stats">
          <div className="stat-col">
            <span className="stat-num">{zones.length}</span>
            <span className="stat-lbl">Zones</span>
          </div>
          <div className="stat-col">
            <span className="stat-num">
              {formatArea(zones.reduce((sum, z) => sum + (z.area || 0), 0))}
            </span>
            <span className="stat-lbl">Total Area</span>
          </div>
        </div>

        <button
          id="btn-quick-export-geojson"
          className="btn btn-export"
          onClick={handleDownload}
          disabled={zones.length === 0}
          title="Export GeoJSON for GIS / Supabase / Backend"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>Export GeoJSON</span>
        </button>
      </div>
    </aside>
  );
}
