/**
 * Geospatial utility functions for polygon calculations without external dependencies.
 */

// Severity level definitions and color codes
export const SEVERITY_CONFIG = {
  LOW: {
    label: 'Low Hazard',
    color: '#22c55e', // Emerald / Green
    bgLight: 'rgba(34, 197, 94, 0.15)',
    border: '#16a34a',
    description: 'Minor waterlogging, passable roads with caution.',
  },
  MEDIUM: {
    label: 'Medium Hazard',
    color: '#eab308', // Amber / Yellow
    bgLight: 'rgba(234, 179, 8, 0.15)',
    border: '#ca8a04',
    description: 'Rising water levels, basement flooding, restricted access.',
  },
  HIGH: {
    label: 'High Hazard',
    color: '#f97316', // Orange
    bgLight: 'rgba(249, 115, 22, 0.15)',
    border: '#ea580c',
    description: 'Severe inundation, ground floors flooded, evacuation advised.',
  },
  CRITICAL: {
    label: 'Critical Hazard',
    color: '#ef4444', // Red
    bgLight: 'rgba(239, 68, 68, 0.2)',
    border: '#dc2626',
    description: 'Life-threatening flood level, structural danger, emergency rescue required.',
  },
};

/**
 * Calculates the geodesic surface area of a polygon coordinates array in square meters.
 * Uses spherical excess formula on WGS84 sphere.
 * @param {Array<Array<number>>} ring - Array of [longitude, latitude] coordinates (first and last matching)
 * @returns {number} Area in square meters
 */
export function calculatePolygonArea(ring) {
  if (!ring || ring.length < 3) return 0;

  const RADIUS = 6378137; // Earth's mean radius in meters
  const rad = (deg) => (deg * Math.PI) / 180;

  let totalAngle = 0;
  const n = ring.length;

  for (let i = 0; i < n - 1; i++) {
    const p1 = ring[i];
    const p2 = ring[i + 1];

    const lambda1 = rad(p1[0]);
    const phi1 = rad(p1[1]);
    const lambda2 = rad(p2[0]);
    const phi2 = rad(p2[1]);

    const dLambda = lambda2 - lambda1;
    totalAngle += (lambda2 - lambda1) * (2 + Math.sin(phi1) + Math.sin(phi2));
  }

  const area = Math.abs((totalAngle * RADIUS * RADIUS) / 4.0);
  return area;
}

/**
 * Formats area into human readable string (sq m or sq km)
 * @param {number} areaInSqMeters
 * @returns {string}
 */
export function formatArea(areaInSqMeters) {
  if (!areaInSqMeters || isNaN(areaInSqMeters)) return '0 m²';
  if (areaInSqMeters >= 1000000) {
    return `${(areaInSqMeters / 1000000).toFixed(2)} km²`;
  } else if (areaInSqMeters >= 10000) {
    return `${(areaInSqMeters / 10000).toFixed(2)} ha`;
  } else {
    return `${Math.round(areaInSqMeters).toLocaleString()} m²`;
  }
}

/**
 * Calculates approximate centroid and bounding box of a polygon
 * @param {Array<Array<number>>} ring
 * @returns {{ center: [number, number], bbox: [number, number, number, number] }}
 */
export function getPolygonBounds(ring) {
  if (!ring || ring.length === 0) {
    return { center: [73.8567, 18.5204], bbox: [73.8, 18.4, 73.9, 18.6] };
  }

  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let sumLng = 0;
  let sumLat = 0;
  const count = ring.length;

  ring.forEach(([lng, lat]) => {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    sumLng += lng;
    sumLat += lat;
  });

  return {
    center: [sumLng / count, sumLat / count],
    bbox: [minLng, minLat, maxLng, maxLat],
  };
}

/**
 * Download a GeoJSON FeatureCollection as a .json / .geojson file
 * @param {object} featureCollection
 * @param {string} filename
 */
export function downloadGeoJSON(featureCollection, filename = 'flood-zones.geojson') {
  const jsonStr = JSON.stringify(featureCollection, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/geo+json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
