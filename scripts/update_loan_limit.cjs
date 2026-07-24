/**
 * Update a customer's credit limit via Supabase.
 * Usage: node scripts/update_loan_limit.cjs <customerId> <newLimit>
 */
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const [,, custId, newLimit] = process.argv;
if (!custId || !newLimit) {
  console.error('Usage: node update_loan_limit.cjs <customerId> <newLimit>');
  process.exit(1);
}

(async () => {
  const { data, error } = await supabase
    .from('customers')
    .update({ credit_limit: Number(newLimit) })
    .eq('id', custId);
  if (error) {
    console.error('Error updating limit:', error.message);
    process.exit(1);
  }
  console.log('Successfully updated limit for customer', custId, 'to', newLimit);
})();
