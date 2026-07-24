import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf8').split('\n').reduce((acc, line) => {
  const [k, ...v] = line.split('=');
  if (k && v.length > 0) acc[k.trim()] = v.join('=').trim().replace(/['"]/g, '');
  return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

supabase.from('workers').select('name, docs').then(({ data, error }) => {
  if (error) {
    console.error(error);
    return;
  }
  
  data.forEach(worker => {
    const docs = worker.docs || [];
    const passport = docs.find(d => d.key === 'passport') || {};
    const idBack = docs.find(d => d.key === 'id_back') || {};
    
    if (passport.uploaded && passport.uploaded.length > 50) {
       console.log('Worker:', worker.name);
       console.log('Passport uploaded field length:', passport.uploaded.length);
       console.log('Passport uploaded field start:', passport.uploaded.substring(0, 100));
    }
  });
}).catch(console.error);
