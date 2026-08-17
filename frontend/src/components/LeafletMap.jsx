import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import {
  SEVERITY_CONFIG,
  calculatePolygonArea,
  getPolygonBounds,
} from '../utils/geoUtils';

// Pune Center Coordinates [Lat, Lng] for Leaflet
const PUNE_CENTER = [18.5204, 73.8567];
const DEFAULT_ZOOM = 13;

// Standard OpenStreetMap Tile Provider
const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors';

export default function LeafletMap({
  zones = [],
  onZonesChange,
  selectedZoneId,
  onSelectZone,
  activeSeverity,
  drawMode,
  setDrawMode,
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const layersMapRef = useRef(new Map()); // zone.id -> L.Polygon

  const [cursorCoords, setCursorCoords] = useState(null);
  const [mapZoom, setMapZoom] = useState(DEFAULT_ZOOM);

  // Helper to get styling options based on severity
  const getStyleForSeverity = (severity, isSelected = false) => {
    const config = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.HIGH;
    return {
      color: isSelected ? '#ffffff' : config.border,
      fillColor: config.color,
      fillOpacity: isSelected ? 0.6 : 0.4,
      weight: isSelected ? 3.5 : 2.5,
      dashArray: isSelected ? '4, 4' : null,
    };
  };

  // Convert any depth Leaflet LatLng array to GeoJSON [lng, lat] ring
  const latLngsToGeoJsonCoords = (latLngs) => {
    let current = latLngs;
    while (Array.isArray(current) && current.length > 0 && Array.isArray(current[0])) {
      current = current[0];
    }
    if (!Array.isArray(current)) return [];

    const coords = current.map((ll) => {
      const lat = ll.lat !== undefined ? ll.lat : ll[0];
      const lng = ll.lng !== undefined ? ll.lng : ll[1];
      return [Number(Number(lng).toFixed(5)), Number(Number(lat).toFixed(5))];
    });

    if (coords.length > 0) {
      // Ensure closed ring for RFC 7946 polygon
      const first = coords[0];
      const last = coords[coords.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        coords.push([first[0], first[1]]);
      }
    }
    return coords;
  };

  // Sync all current map layers to parent state
  const syncLayersToState = useCallback(() => {
    const updatedZones = [];
    layersMapRef.current.forEach((layer, id) => {
      const latLngs = layer.getLatLngs();
      const coords = latLngsToGeoJsonCoords(latLngs);
      const area = calculatePolygonArea(coords);
      const bounds = getPolygonBounds(coords);

      updatedZones.push({
        id,
        name: layer._zoneName || `Flood Zone ${id.substring(0, 4).toUpperCase()}`,
        severity: layer._zoneSeverity || 'HIGH',
        area,
        coordinates: coords,
        center: bounds.center,
        bbox: bounds.bbox,
        createdAt: layer._createdAt || new Date().toISOString(),
      });
    });

    onZonesChange(updatedZones);
  }, [onZonesChange]);

  // Initialize Leaflet Map with OpenStreetMap tiles
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // In React 18 StrictMode, cleanup old leaflet ID to prevent "Map container is already initialized"
    if (mapContainerRef.current._leaflet_id) {
      mapContainerRef.current._leaflet_id = null;
    }

    // Create Leaflet map instance centered on Pune
    const map = L.map(mapContainerRef.current, {
      center: PUNE_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
      attributionControl: true,
    });

    // Add Zoom & Scale Controls
    L.control.zoom({ position: 'topright' }).addTo(map);
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

    // Add OpenStreetMap Tile Layer
    L.tileLayer(OSM_TILE_URL, {
      attribution: OSM_ATTRIBUTION,
      maxZoom: 19,
    }).addTo(map);

    // Configure Geoman (Draw & Edit plugin) if available
    if (map.pm) {
      map.pm.setGlobalOptions({
        allowSelfIntersection: false,
        templineStyle: { color: SEVERITY_CONFIG[activeSeverity]?.color || '#f97316' },
        hintlineStyle: { color: SEVERITY_CONFIG[activeSeverity]?.color || '#f97316', dashArray: [5, 5] },
      });

      // Geoman Draw Events
      map.on('pm:create', (e) => {
        const layer = e.layer;
        const id = `zone-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

        layer._zoneId = id;
        layer._zoneSeverity = activeSeverity;
        layer._zoneName = `Flood Zone ${id.substring(5, 9).toUpperCase()}`;
        layer._createdAt = new Date().toISOString();

        // Apply severity styling
        layer.setStyle(getStyleForSeverity(activeSeverity, false));

        // Click to select
        layer.on('click', () => {
          onSelectZone(id);
        });

        // Vertex and drag edit listeners
        layer.on('pm:edit pm:update pm:dragend pm:markerdragend pm:vertexadded pm:vertexremoved', () => {
          syncLayersToState();
        });

        layersMapRef.current.set(id, layer);
        syncLayersToState();
        onSelectZone(id);
        setDrawMode('simple_select');
      });

      map.on('pm:remove', (e) => {
        const layer = e.layer;
        if (layer._zoneId) {
          layersMapRef.current.delete(layer._zoneId);
          syncLayersToState();
        }
      });
    }

    // Mouse movement listener for HUD
    map.on('mousemove', (e) => {
      setCursorCoords({
        lat: e.latlng.lat.toFixed(5),
        lng: e.latlng.lng.toFixed(5),
      });
    });

    map.on('zoomend', () => {
      setMapZoom(map.getZoom());
    });

    mapRef.current = map;

    // Trigger resize calculation to ensure tiles load seamlessly
    setTimeout(() => {
      map.invalidateSize();
    }, 100);

    return () => {
      map.remove();
      if (mapContainerRef.current) {
        mapContainerRef.current._leaflet_id = null;
      }
      mapRef.current = null;
      layersMapRef.current.clear();
    };
  }, []);

  // Update Draw mode & styling when activeSeverity or drawMode changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.pm) return;

    const sevConfig = SEVERITY_CONFIG[activeSeverity] || SEVERITY_CONFIG.HIGH;

    if (drawMode === 'draw_polygon') {
      map.pm.enableDraw('Polygon', {
        snappable: true,
        snapDistance: 20,
        templineStyle: { color: sevConfig.color },
        hintlineStyle: { color: sevConfig.color, dashArray: [5, 5] },
        pathOptions: {
          color: sevConfig.border,
          fillColor: sevConfig.color,
          fillOpacity: 0.4,
          weight: 2.5,
        },
      });
    } else {
      map.pm.disableDraw();
    }
  }, [drawMode, activeSeverity]);

  // Synchronize React `zones` state with Leaflet map layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentMap = layersMapRef.current;
    const incomingIds = new Set((zones || []).map((z) => z.id));

    // 1. Remove layers that no longer exist in state
    currentMap.forEach((layer, id) => {
      if (!incomingIds.has(id)) {
        if (map.hasLayer(layer)) {
          map.removeLayer(layer);
        }
        currentMap.delete(id);
      }
    });

    // 2. Add or update layers from state
    (zones || []).forEach((zone) => {
      if (!zone || !zone.coordinates || !Array.isArray(zone.coordinates) || zone.coordinates.length === 0) {
        return;
      }

      const isSelected = zone.id === selectedZoneId;
      let layer = currentMap.get(zone.id);

      if (!layer) {
        // Convert GeoJSON [[lng, lat]] coordinates to Leaflet [[lat, lng]]
        const latLngs = zone.coordinates.map(([lng, lat]) => [lat, lng]);
        layer = L.polygon(latLngs, getStyleForSeverity(zone.severity, isSelected)).addTo(map);

        layer._zoneId = zone.id;
        layer._zoneName = zone.name;
        layer._zoneSeverity = zone.severity;
        layer._createdAt = zone.createdAt;

        layer.on('click', () => {
          onSelectZone(zone.id);
        });

        layer.on('pm:edit pm:update pm:dragend pm:markerdragend pm:vertexadded pm:vertexremoved', () => {
          syncLayersToState();
        });

        currentMap.set(zone.id, layer);
      } else {
        // Update styling and metadata
        layer._zoneName = zone.name;
        layer._zoneSeverity = zone.severity;
        layer.setStyle(getStyleForSeverity(zone.severity, isSelected));
      }

      // If selected, enable vertex editing mode on this specific polygon
      if (isSelected) {
        if (layer.pm && !layer.pm.enabled()) {
          layer.pm.enable({
            allowSelfIntersection: false,
          });
        }
      } else {
        if (layer.pm && layer.pm.enabled()) {
          layer.pm.disable();
        }
      }
    });
  }, [zones, selectedZoneId, onSelectZone, syncLayersToState]);

  // Focus and zoom when a zone is selected
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedZoneId) return;

    const layer = layersMapRef.current.get(selectedZoneId);
    if (layer) {
      try {
        map.fitBounds(layer.getBounds(), { padding: [60, 60], maxZoom: 15, animate: true });
      } catch (e) {
        console.warn('Could not fit bounds to zone:', e);
      }
    }
  }, [selectedZoneId]);

  // Recenter to Pune City Center
  const resetToPune = () => {
    const map = mapRef.current;
    if (map) {
      map.setView(PUNE_CENTER, DEFAULT_ZOOM, { animate: true });
    }
  };

  return (
    <div className="map-wrapper" id="leaflet-map-container">
      {/* Leaflet DOM container */}
      <div ref={mapContainerRef} className="map-canvas" id="leaflet-canvas" />

      {/* Top HUD Toolbar with Pune recenter button */}
      <div className="map-hud-top-bar" id="map-hud-toolbar">
        <div className="hud-pill-group">
          <button
            type="button"
            id="btn-recenter-pune"
            className="hud-btn"
            onClick={resetToPune}
            title="Recenter Map to Pune"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v4M12 18v4M2 12h4M18 12h4M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
            </svg>
            <span>Pune (18.52° N, 73.85° E)</span>
          </button>

          <div className="hud-divider" />

          <div className="osm-tag-pill">
            <span>OpenStreetMap</span>
          </div>
        </div>
      </div>

      {/* Bottom Status Bar for Coordinates & Zoom */}
      <div className="map-hud-status-bar" id="map-coordinates-bar">
        <div className="status-item">
          <span className="status-label">LAT/LNG:</span>
          <span className="status-value mono">
            {cursorCoords ? `${cursorCoords.lat}°, ${cursorCoords.lng}°` : '18.5204°, 73.8567°'}
          </span>
        </div>
        <div className="status-divider" />
        <div className="status-item">
          <span className="status-label">ZOOM:</span>
          <span className="status-value mono">{mapZoom}x</span>
        </div>
        <div className="status-divider" />
        <div className="status-item">
          <span className="status-label">ZONES:</span>
          <span className="status-value mono">{zones.length} active</span>
        </div>
      </div>
    </div>
  );
}
