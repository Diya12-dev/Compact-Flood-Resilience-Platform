import { supabase } from '../lib/supabase';

export async function fetchFloodZones() {
  const { data, error } = await supabase
    .from('flood_zones')
    .select('*');

  if (error) {
    console.error('Error fetching flood zones:', error);
    throw error;
  }

  return data || [];
}

export async function createFloodZone(zone) {
  const { data, error } = await supabase
    .from('flood_zones')
    .insert({
      geojson_polygon: zone.feature || {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [zone.coordinates],
        },
        properties: {},
      },
      severity: zone.severity,
      ward_name: zone.name,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating flood zone:', error);
    throw error;
  }

  return data;
}

export async function updateFloodZone(zoneId, updates) {
  const { data, error } = await supabase
    .from('flood_zones')
    .update({
      severity: updates.severity,
      ward_name: updates.name,
      geojson_polygon: updates.feature || {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [updates.coordinates],
        },
        properties: {},
      },
    })
    .eq('id', zoneId)
    .select()
    .single();

  if (error) {
    console.error('Error updating flood zone:', error);
    throw error;
  }

  return data;
}

export async function deleteFloodZone(zoneId) {
  const { error } = await supabase
    .from('flood_zones')
    .delete()
    .eq('id', zoneId);

  if (error) {
    console.error('Error deleting flood zone:', error);
    throw error;
  }

  return true;
}

// =========================================================
// VOLUNTEER FUNCTIONS
// =========================================================

export async function fetchVolunteers() {
  const { data, error } = await supabase
    .from('volunteers')
    .select('*');

  if (error) {
    console.error('Error fetching volunteers:', error);
    throw error;
  }

  return data || [];
}