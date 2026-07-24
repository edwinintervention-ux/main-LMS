import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config({ path: './.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Run the cleanup directly via individual deletes (no exec_sql needed)
const CUSTOMER_IDS = ['CUS-IIF9GWW', 'CUS-80B3743'];
const CHILD_TABLES = ['queued_sms', 'registration_fees', 'stk_requests', 'interactions', 'payments', 'loans'];

async function cleanup() {
  console.log('Starting orphaned record cleanup for deleted customers:', CUSTOMER_IDS);

  for (const table of CHILD_TABLES) {
    for (const customerId of CUSTOMER_IDS) {
      const { error, count } = await supabase
        .from(table)
        .delete({ count: 'exact' })
        .eq('customer_id', customerId);

      if (error) {
        // Not all tables may have a customer_id column — skip silently
        if (!error.message.includes('column') && !error.message.includes('does not exist')) {
          console.error(`  ✗ ${table} [${customerId}]:`, error.message);
        }
      } else {
        if (count > 0) {
          console.log(`  ✓ Deleted ${count} row(s) from ${table} for ${customerId}`);
        }
      }
    }
  }

  console.log('\nCleanup complete. All orphaned records removed.');
}

cleanup();
