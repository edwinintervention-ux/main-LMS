import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config({ path: './.env' }); 

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const sql = fs.readFileSync('supabase/migrations/2026060103_customer_tagging.sql', 'utf8');

async function apply() {
  console.log('Applying migration...');
  const { data, error } = await supabase.rpc('exec_sql', { query: sql });
  if (error) {
    console.error('Error applying migration:', error);
  } else {
    console.log('Migration applied successfully:', data);
  }
}

apply();
