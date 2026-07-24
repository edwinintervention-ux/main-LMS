import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf8').split('\n').reduce((acc, line) => {
  const [k, ...v] = line.split('=');
  if (k && v.length > 0) acc[k.trim()] = v.join('=').trim().replace(/['"]/g, '');
  return acc;
}, {});

const supabaseAdmin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const supabaseUser = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const email = 'gkadi97@gmail.com';
  const uid = 'fed6c4b0-a902-4ff9-8b33-73eaab5b92c6';
  const testPw = 'AdequateCapital2026!';

  console.log('Resetting DON password for testing...');
  const { error: resetErr } = await supabaseAdmin.auth.admin.updateUserById(uid, {
    password: testPw
  });
  if (resetErr) {
    console.error('Failed to reset password:', resetErr);
    return;
  }

  console.log('Signing in as DON...');
  const { data: authData, error: authErr } = await supabaseUser.auth.signInWithPassword({
    email,
    password: testPw
  });

  if (authErr) {
    console.error('Sign in failed:', authErr);
    return;
  }

  console.log('Successfully signed in as DON. JWT token obtained.');
  
  // Now query loans using the authenticated client
  const { data: loans, error: loansErr } = await supabaseUser.from('loans').select('id, customer_name, amount, status');
  if (loansErr) {
    console.error('Failed to query loans as DON:', loansErr);
  } else {
    console.log('Number of loans visible to DON:', loans.length);
  }

  const { data: customers, error: custErr } = await supabaseUser.from('customers').select('id, name');
  if (custErr) {
    console.error('Failed to query customers as DON:', custErr);
  } else {
    console.log('Number of customers visible to DON:', customers.length);
  }
}
run();
