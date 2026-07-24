import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf8').split('\n').reduce((acc, line) => {
  const [k, ...v] = line.split('=');
  if (k && v.length > 0) acc[k.trim()] = v.join('=').trim().replace(/['"]/g, '');
  return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const fromSupabaseLead = (r) => ({
  id: r.id,
  name: r.name,
  phone: r.phone,
  altPhone: r.alt_phone,
  business: r.business,
  location: r.location,
  source: r.source,
  officer: r.officer,
  status: r.status,
  notes: r.notes,
  date: r.date || r.created_at,
});

const fromSupabaseInteraction = (r) => ({
  id: r.id,
  customerId: r.customer_id,
  date: r.date,
  type: r.type,
  summary: r.summary,
  officer: r.officer,
});

const fromSupabaseAsset = (r) => ({
  id: r.id,
  customerId: r.customer_id,
  customerName: r.customer_name,
  assetName: r.asset_name,
  valuation: Number(r.valuation || 0),
  possessionDate: r.possession_date,
  storageLocation: r.storage_location,
  status: r.status,
  notes: r.notes,
  liquidatedAt: r.liquidated_at || null,
  liquidationAmount: r.liquidation_amount ? Number(r.liquidation_amount) : null,
});

async function run() {
  const { data: leads } = await supabase.from('leads').select('*');
  const { data: interactions } = await supabase.from('interactions').select('*');
  const { data: assets } = await supabase.from('repossessed_assets').select('*');

  console.log('Mapping leads...');
  try {
    leads.map(fromSupabaseLead);
    console.log('✅ Leads mapped successfully');
  } catch (e) {
    console.error('❌ Leads mapping failed:', e.message);
  }

  console.log('Mapping interactions...');
  try {
    interactions.map(fromSupabaseInteraction);
    console.log('✅ Interactions mapped successfully');
  } catch (e) {
    console.error('❌ Interactions mapping failed:', e.message);
  }

  console.log('Mapping assets...');
  try {
    assets.map(fromSupabaseAsset);
    console.log('✅ Assets mapped successfully');
  } catch (e) {
    console.error('❌ Assets mapping failed:', e.message);
  }
}
run();
