import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Resolve __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Load environment variables from project .env (two levels up from src/scripts)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Supabase connection – using VITE-prefixed env vars from .env
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase URL or anon key missing in environment');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Test customer IDs to purge
const testCustomerIds = [
  'CUS-7NHGYWJ',
  'CUS-TEST-1777849088702'
];

// Tables that reference the customer via a `user_id` column
const relatedTables = [
  'customers',
  'loans',
  'payments',
  'repossessed_assets',
  'stk_requests',
  'interactions',
  'registration_fees',
  'b2c_disbursements',
  'assets',
  'customer_assets',
  'guarantors'
];

async function purge() {
  for (const custId of testCustomerIds) {
    console.log(`Purging data for customer ${custId}...`);
    for (const tbl of relatedTables) {
      const { data, error } = await supabase
        .from(tbl)
        .delete()
        .eq('user_id', custId);
      if (error) {
        console.warn(`No rows deleted from ${tbl} for ${custId} or error: ${error.message}`);
      } else {
        console.log(`Deleted ${data?.length || 0} row(s) from ${tbl} for ${custId}`);
      }
    }
  }
  console.log('All purge operations completed.');
  process.exit(0);
}

purge();
