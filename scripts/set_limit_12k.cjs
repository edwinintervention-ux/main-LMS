require('dotenv').config({ path: './production.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  // Update credit_limit to 12000 for CUS-0400
  const { data, error } = await supabase
    .from('customers')
    .update({ credit_limit: 12000 })
    .or('id.eq.CUS-0400,id_no.eq.21167188')
    .select('id, name, credit_limit');

  if (error) {
    console.error('ERROR:', error.message);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log('No matching customer found. Trying by id_number...');
    const { data: d2, error: e2 } = await supabase
      .from('customers')
      .update({ credit_limit: 12000 })
      .eq('id_number', '21167188')
      .select('id, name, credit_limit');
    if (e2) { console.error('ERROR:', e2.message); process.exit(1); }
    console.log('Result:', d2);
  } else {
    console.log('SUCCESS! Updated:', data);
  }
}

run().catch(e => { console.error(e); process.exit(1); });
