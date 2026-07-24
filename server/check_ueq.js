import { supabase } from './config/db.js';

async function checkPayment() {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('mpesa', 'UEQSZAUB1T');
  console.log('Payment:', data);
}

checkPayment();
