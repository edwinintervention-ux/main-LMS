import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function reassign() {
  const donaldId = '1def8b23-9def-49fd-a8bb-eeb5e82da90f';
  
  const { data, error } = await supabase
    .from('customers')
    .update({ 
      officer: 'Donald Barare', 
      assigned_officer: donaldId 
    })
    .or('officer.eq.DON,officer.is.null');
    
  if (error) {
    console.error('Update error:', error.message);
  } else {
    console.log('Successfully reassigned Unassigned and DON customers to Donald Barare!');
  }
}

reassign();
