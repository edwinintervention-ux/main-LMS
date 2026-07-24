import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf8').split('\n').reduce((acc, line) => {
  const [k, ...v] = line.split('=');
  if (k && v.length > 0) acc[k.trim()] = v.join('=').trim().replace(/['"]/g, '');
  return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const email = 'gkadi97@gmail.com';
  const testPw = 'AdequateCapital2026!';

  await supabase.auth.signInWithPassword({
    email,
    password: testPw
  });

  console.log('Testing each query individually:');
  const queries = [
    { name: 'loans', q: supabase.from('loans').select('*').order('created_at', { ascending: false }).range(0, 1999) },
    { name: 'payments', q: supabase.from('payments').select('*').order('date', { ascending: false }).range(0, 4999) },
    { name: 'monthly_targets', q: supabase.from('monthly_targets').select('*') },
    { name: 'salary_payments', q: supabase.from('salary_payments').select('*').order('created_at', { ascending: false }).limit(1000) },
    { name: 'leads', q: supabase.from('leads').select('*').order('date', { ascending: false }).limit(1000) },
    { name: 'interactions', q: supabase.from('interactions').select('*').order('date', { ascending: false }).limit(1000) },
    { name: 'repossessed_assets', q: supabase.from('repossessed_assets').select('*').order('possession_date', { ascending: false }) },
    { name: 'stk_requests', q: supabase.from('stk_requests').select('*').order('created_at', { ascending: false }).limit(500) },
    { name: 'b2c_disbursements', q: supabase.from('b2c_disbursements').select('*').order('created_at', { ascending: false }).limit(500) },
    { name: 'mpesa_transactions', q: supabase.from('mpesa_transactions').select('*').order('created_at', { ascending: false }).limit(1000) },
  ];

  for (const item of queries) {
    try {
      const { data, error } = await item.q;
      if (error) {
        console.log(`❌ ${item.name} FAILED:`, error.message, 'Code:', error.code);
      } else {
        console.log(`✅ ${item.name} SUCCESS: fetched ${data?.length} records`);
      }
    } catch (e) {
      console.log(`❌ ${item.name} THREW EXCEPTION:`, e.message);
    }
  }
}
run();
