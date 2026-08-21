import { supabase } from '../lib/supabase';

// ============================================================
// FLOOD ZONES
// ============================================================

export async function fetchFloodZones() {
  const { data, error } = await supabase
    .from('flood_zones')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching flood zones:', error);
    throw error;
  }

  return data || [];
}

export async function createFloodZone(zone) {
  const { data, error } = await supabase
    .from('flood_zones')
    .insert([zone])
    .select()
    .single();

  if (error) {
    console.error('Error creating flood zone:', error);
    throw error;
  }

  return data;
}

export async function updateFloodZone(id, updates) {
  const { data, error } = await supabase
    .from('flood_zones')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating flood zone:', error);
    throw error;
  }

  return data;
}

export async function deleteFloodZone(id) {
  const { data, error } = await supabase
    .from('flood_zones')
    .delete()
    .eq('id', id)
    .select();

  if (error) {
    console.error('Error deleting flood zone:', error);
    throw error;
  }

  return data;
}

// ============================================================
// VOLUNTEERS
// ============================================================

export async function fetchVolunteers() {
  const { data, error } = await supabase
    .from('volunteers')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching volunteers:', error);
    throw error;
  }

  return data || [];
}

// ============================================================
// DASHBOARD SUMMARY VIEW
// ============================================================

export async function fetchDashboardSummary() {
  const { data, error } = await supabase
    .from('dashboard_summary')
    .select('*');

  if (error) {
    console.error('Error fetching dashboard summary:', error);
    throw error;
  }

  return data || [];
}

// ============================================================
// SOS + ASSIGNED VOLUNTEER VIEW
// ============================================================

export async function fetchSOSWithVolunteer() {
  const { data, error } = await supabase
    .from('sos_with_volunteer')
    .select('*');

  if (error) {
    console.error('Error fetching SOS with volunteer:', error);
    throw error;
  }

  return data || [];
}