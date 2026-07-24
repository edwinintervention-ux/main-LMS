import { supabase } from './config/db.js';

async function checkLoan() {
  const { data: customer } = await supabase.from('customers').select('*').eq('id', 'CUS-0403');
  console.log('Customer:', customer);
  
  const { data: loans } = await supabase.from('loans').select('*').eq('customer_id', 'CUS-0403');
  console.log('Loans:', loans);
  
  if (loans && loans.length > 0) {
    const loanIds = loans.map(l => l.id);
    const { data: payments } = await supabase.from('payments').select('*').in('loan_id', loanIds).eq('status', 'Allocated');
    console.log('Payments:', payments);
  }
}

checkLoan();
