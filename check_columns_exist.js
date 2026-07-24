const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceKey);

async function check() {
  console.log('Fetching one customer row to inspect columns...');
  const { data, error } = await supabase.from('customers').select('*').limit(1);
  if (error) {
    console.error('Error fetching customers:', error.message);
  } else {
    console.log('Customer row keys:', Object.keys(data[0]));
    console.log('limit_suspended:', data[0].limit_suspended);
    console.log('suspended_baseline_limit:', data[0].suspended_baseline_limit);
    console.log('last_overdue_clear_date:', data[0].last_overdue_clear_date);
  }
}
check();
