import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf8').split('\n').reduce((acc, line) => {
  const [k, ...v] = line.split('=');
  if (k && v.length > 0) acc[k.trim()] = v.join('=').trim().replace(/['"]/g, '');
  return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  console.log('--- RLS POLICIES ---');
  const { data: policies, error: polErr } = await supabase.from('pg_policies').select('*');
  if (polErr) {
    console.error(polErr);
  } else {
    const relevant = policies.filter(p => ['loans', 'payments', 'customers'].includes(p.tablename));
    console.log(relevant.map(p => ({
      table: p.tablename,
      name: p.policyname,
      definition: p.definition,
      roles: p.roles,
      cmd: p.cmd
    })));
  }

  console.log('\n--- WORKERS ---');
  const { data: workers, error: workErr } = await supabase.from('workers').select('id, name, email, role, status');
  if (workErr) {
     console.error(workErr);
  } else {
     console.log(workers);
  }
}

check();
