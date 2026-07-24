import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// The 44 customers with empty DB documents column
const ids = [
  'CUS-0374','CUS-0396','CUS-0401','CUS-0392','CUS-0390','CUS-0414',
  'CUS-0385','CUS-0410','CUS-0404','CUS-0405','CUS-0403','CUS-0371',
  'CUS-0408','CUS-0377','CUS-0399','CUS-0373','CUS-0400','CUS-0402',
  'CUS-0383','CUS-0382','CUS-0375','CUS-0395','CUS-0370','CUS-0397',
  'CUS-0389','CUS-0394','CUS-0381','CUS-0413','CUS-0372','CUS-0416',
  'CUS-0378','CUS-0379','CUS-0384','CUS-0380','CUS-0412','CUS-0420',
  'CUS-LGTA6LI','CUS-KCPV6Z1','CUS-8QI4TIE','CUS-VY8FCBK',
  'CUS-RTUEBYC','CUS-WR7S6QL','CUS-20KPFL8','CUS-U261UBG'
];

async function check() {
  // Get names
  const { data: customers } = await supabase
    .from('customers')
    .select('id, name')
    .in('id', ids);
  const nameMap = {};
  customers?.forEach(c => nameMap[c.id] = c.name);

  const noStorage = [];
  const hasStorage = [];

  for (const id of ids) {
    const { data: files } = await supabase.storage.from('documents').list(id);
    const count = files?.length || 0;
    if (count === 0) {
      noStorage.push({ id, name: nameMap[id] || '?' });
    } else {
      hasStorage.push({ id, name: nameMap[id] || '?', count });
    }
  }

  console.log(`\n✅ HAS files in storage (${hasStorage.length}):`);
  hasStorage.forEach(c => console.log(`  ${c.id} | ${c.name} | ${c.count} file(s)`));

  console.log(`\n❌ NO files in storage (${noStorage.length}):`);
  noStorage.forEach(c => console.log(`  ${c.id} | ${c.name}`));
}

check();
