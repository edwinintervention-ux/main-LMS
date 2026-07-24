import { supabase } from './config/db.js';

async function checkMore() {
  console.log('--- Checking audit_log for UEP8Y57Q07 (the 50k one) ---');
  const { data: audit, error: err3 } = await supabase
    .from('audit_log')
    .select('*')
    .like('detail', `%UEP8Y57Q07%`);
  console.log(audit);

  // Check if we have webhook or api logs
  const { data: tables } = await supabase.rpc('get_tables').catch(() => ({}));
  console.log('Tables check: maybe look manually');
}

checkMore();
