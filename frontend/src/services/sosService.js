import { supabase } from '../lib/supabase';

export async function fetchSOSAlerts() {
  const { data, error } = await supabase
    .from('sos_alerts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching SOS alerts:', error);
    throw error;
  }

  return data || [];
}