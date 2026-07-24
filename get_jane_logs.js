require('dotenv').config(); 
const { createClient } = require('@supabase/supabase-js'); 
const fs = require('fs'); 
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY); 

supabase.from('audit_log').select('*').eq('user_name', 'Jane Kamau').order('ts', { ascending: false }).then(res => { 
  let md = '# Audit Logs for Jane Kamau\n\n| Timestamp | Action | Target | Details | IP Address |\n|---|---|---|---|---|\n'; 
  res.data.forEach(l => { 
    const ts = new Date(l.ts).toISOString().replace('T', ' ').slice(0, 19); 
    md += `| ${ts} | ${l.action} | ${l.target_id || '-'} | ${l.detail || '-'} | ${l.ip_address || '-'} |\n`; 
  }); 
  fs.writeFileSync('jane_kamau_logs.md', md); 
  console.log('Done'); 
});
