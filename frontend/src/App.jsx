import React, { useState, useEffect } from 'react';

import {
  fetchFloodZones,
  createFloodZone,
  updateFloodZone,
  deleteFloodZone,
} from './services/supabaseService';

import LeafletMap from './components/LeafletMap';
import FloodZonePanel from './components/FloodZonePanel';

import {
  calculatePolygonArea,
  getPolygonBounds,
} from './utils/geoUtils';

const STORAGE_KEY_ZONES = 'cfrp_flood_zones';

export default function App() {
  // =========================================================
  // STATE
  // =========================================================

  const [zones, setZones] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY_ZONES);

    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (error) {
        console.error('Failed to parse saved zones:', error);
      }
    }

    return [];
  });

  const [selectedZoneId, setSelectedZoneId] = useState(null);
  const [activeSeverity, setActiveSeverity] = useState('HIGH');
  const [drawMode, setDrawMode] = useState('simple_select');

  // =========================================================
  // DASHBOARD STATISTICS
  // =========================================================

  const totalZones = zones.length;

  const criticalZones = zones.filter(
    (z) => z.severity?.toUpperCase() === 'CRITICAL'
  ).length;

  const highRiskZones = zones.filter(
    (z) => z.severity?.toUpperCase() === 'HIGH'
  ).length;

  const totalAffectedArea = zones.reduce(
    (sum, z) => sum + (Number(z.area) || 0),
    0
  );

  const totalAffectedAreaKm2 = (
    totalAffectedArea / 1000000
  ).toFixed(2);

  // =========================================================
  // LOCAL STORAGE
  // =========================================================

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY_ZONES,
      JSON.stringify(zones)
    );
  }, [zones]);

  // =========================================================
  // FORMAT SUPABASE DATA
  // =========================================================

  const formatSupabaseZone = (row) => {
    const feature = row.geojson_polygon;
    const geom = feature?.geometry ?? feature;

    let coords = [];

    if (geom) {
      if (geom.type === 'Polygon') {
        coords = geom.coordinates?.[0] ?? [];
      } else if (geom.type === 'MultiPolygon') {
        coords = geom.coordinates?.[0]?.[0] ?? [];
      } else if (Array.isArray(geom)) {
        coords = geom;
      }
    }

    const area = calculatePolygonArea(coords);
    const bounds = getPolygonBounds(coords);

    return {
      id: row.id,
      name: row.ward_name,
      severity: row.severity,
      riskScore: row.risk_score,
      area,
      coordinates: coords,
      center: bounds.center,
      bbox: bounds.bbox,
      feature: feature,
      createdAt: row.created_at,
    };
  };

  // =========================================================
  // LOAD FLOOD ZONES FROM SUPABASE
  // =========================================================

  useEffect(() => {
    const loadFloodZones = async () => {
      try {
        const rows = await fetchFloodZones();

        console.log(
          'Supabase flood zones (raw):',
          rows
        );

        const formatted = rows.map(formatSupabaseZone);

        setZones(formatted);

        if (formatted.length > 0) {
          setSelectedZoneId(formatted[0].id);
        }
      } catch (error) {
        console.error(
          'Failed to load flood zones:',
          error
        );
      }
    };

    loadFloodZones();
  }, []);

  // =========================================================
  // ZONE CHANGES FROM LEAFLET MAP
  // =========================================================

  const handleZonesChange = async (updatedZones) => {
    /*
     * IMPORTANT:
     * First update React state so the UI/map remains responsive.
     */
    setZones(updatedZones);

    console.log(
      'Zones changed:',
      updatedZones
    );
  };

  // =========================================================
  // LOAD SAMPLE PUNE ZONES
  // =========================================================

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
        createdAt:
          feat.properties.createdAt ||
          new Date().toISOString(),
      };
    });

    setZones(formatted);

    if (formatted.length > 0) {
      setSelectedZoneId(formatted[0].id);
    }
  };

  // =========================================================
  // DELETE ZONE
  // =========================================================

  const handleDeleteZone = async (zoneId) => {
    try {
      /*
       * Sample zones don't exist in Supabase.
       */
      const isSampleZone = String(zoneId).startsWith(
        'sample-'
      );

      if (!isSampleZone) {
        await deleteFloodZone(zoneId);
      }

      setZones((prev) =>
        prev.filter((z) => z.id !== zoneId)
      );

      if (selectedZoneId === zoneId) {
        setSelectedZoneId(null);
      }

      console.log(
        'Flood zone deleted:',
        zoneId
      );
    } catch (error) {
      console.error(
        'Failed to delete flood zone:',
        error
      );
    }
  };

  // =========================================================
  // CLEAR ALL ZONES
  // =========================================================

  const handleClearAllZones = async () => {
    if (
      !window.confirm(
        'Are you sure you want to clear all flood zones from the map?'
      )
    ) {
      return;
    }

    try {
      /*
       * Delete real Supabase zones.
       * Sample zones are only local.
       */
      const realZones = zones.filter(
        (zone) =>
          !String(zone.id).startsWith('sample-')
      );

      for (const zone of realZones) {
        await deleteFloodZone(zone.id);
      }

      setZones([]);
      setSelectedZoneId(null);

      console.log('All flood zones cleared.');
    } catch (error) {
      console.error(
        'Failed to clear flood zones:',
        error
      );
    }
  };

  // =========================================================
  // UI
  // =========================================================

  return (
    <div
      className="app-container"
      id="app-root-layout"
    >
      {/* TOP COMMAND HEADER */}

      <header
        className="app-header"
        id="command-header"
      >
        <div className="header-left">
          <div className="platform-logo">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
            >
              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
            </svg>
          </div>

          <div>
            <h1 className="header-title">
              Compact Flood Resilience Platform
            </h1>

            <div className="header-meta">
              <span className="badge-branch">
                branch: feature/mapbox-flood-zones
              </span>

              <span className="badge-region">
                📍 Pune Division Command
              </span>
            </div>
          </div>
        </div>

        <div className="header-right">
          <div className="system-pill live">
            <span className="live-dot" />

            <span>
              OpenStreetMap Engine Active
            </span>
          </div>
        </div>
      </header>

      {/* FLOOD STATISTICS */}

      <section
        className="stats-ribbon"
        aria-label="Flood statistics"
      >
        <div className="stat-card">
          <span className="stat-label">
            FLOOD ZONES
          </span>

          <strong className="stat-value">
            {totalZones}
          </strong>
        </div>

        <div className="stat-card critical">
          <span className="stat-label">
            CRITICAL
          </span>

          <strong className="stat-value">
            {criticalZones}
          </strong>
        </div>

        <div className="stat-card high">
          <span className="stat-label">
            HIGH RISK
          </span>

          <strong className="stat-value">
            {highRiskZones}
          </strong>
        </div>

        <div className="stat-card area">
          <span className="stat-label">
            AFFECTED AREA
          </span>

          <strong className="stat-value">
            {totalAffectedAreaKm2} km²
          </strong>
        </div>
      </section>

      {/* MAIN WORKSPACE */}

      <main
        className="app-workspace"
        id="main-workspace"
      >
        {/* FLOOD ZONE PANEL */}

        <FloodZonePanel
          zones={zones}
          onZonesChange={handleZonesChange}
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

        {/* MAP */}

        <div className="map-view-container">
          <LeafletMap
            zones={zones}
            onZonesChange={handleZonesChange}
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