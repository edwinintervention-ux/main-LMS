const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('', '');

async function check() {
  const { data, error } = await supabase.from('workers').select('*').ilike('name', '%Juliet%');
  if (error) {
    console.error('Error:', error);
    return;
  }
  console.log('Workers found:', JSON.stringify(data, null, 2));
}

check();
