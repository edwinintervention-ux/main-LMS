import { supabase } from './config/db.js';

async function checkCols() {
  const { data } = await supabase.from('payments').select('*').limit(1);
  console.log('Payments columns:', Object.keys(data[0] || {}));
  
  const { data: u } = await supabase.from('unallocated_payments').select('*').limit(1);
  console.log('Unallocated columns:', Object.keys(u[0] || {}));
}

checkCols();
