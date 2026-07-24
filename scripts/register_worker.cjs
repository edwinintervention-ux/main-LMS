const { createClient } = require('@supabase/supabase-js');

// Load environment variables if available
require('dotenv').config({ path: 'production.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://wnmabkrkbcigxqdprzrb.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndubWFia3JrYmNpZ3hxZHByenJiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njk1ODI2NywiZXhwIjoyMDkyNTM0MjY3fQ.L8TnRTzQ5HZRGdBPtSrtSIufC3SLtcqRE8n89roTLxI';

const s = createClient(supabaseUrl, serviceRoleKey);

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.log("Usage: node register_worker.cjs <email> <password>");
  process.exit(1);
}

async function run() {
  console.log(`\nStarting registration for ${email}...`);

  // 1. Check if worker exists in public.workers table
  const { data: worker, error: fetchErr } = await s
    .from('workers')
    .select('*')
    .eq('email', email)
    .single();

  if (fetchErr || !worker) {
    console.error(`Error: Worker with email ${email} not found in public.workers table.`);
    if (fetchErr) console.error(fetchErr);
    process.exit(1);
  }

  console.log(`Found worker record: ${worker.name} (ID: ${worker.id})`);

  // 2. Create the user in Supabase Auth
  console.log("Creating user in Supabase Auth...");
  const { data: authData, error: authErr } = await s.auth.admin.createUser({
    email: email.trim(),
    password: password,
    email_confirm: true
  });

  let authUserId;

  if (authErr) {
    if (authErr.message.includes('already exists') || authErr.code === 'email_exists') {
      console.log("Auth user already exists. Fetching existing user...");
      
      // Fetch users to find the existing one
      const { data: { users }, error: listErr } = await s.auth.admin.listUsers();
      if (listErr) {
        console.error("Error listing users:", listErr);
        process.exit(1);
      }
      
      const existingUser = users.find(u => u.email?.toLowerCase() === email.trim().toLowerCase());
      if (!existingUser) {
        console.error("Could not find the existing auth user.");
        process.exit(1);
      }
      
      authUserId = existingUser.id;
      console.log(`Linked existing Auth User ID: ${authUserId}`);
      
      // Update password of existing user to the requested one
      console.log("Updating password for existing user...");
      const { error: updatePwErr } = await s.auth.admin.updateUserById(authUserId, { password });
      if (updatePwErr) {
        console.error("Error updating password:", updatePwErr);
      } else {
        console.log("Password updated successfully.");
      }
    } else {
      console.error("Error creating auth user:", authErr);
      process.exit(1);
    }
  } else {
    authUserId = authData.user.id;
    console.log(`Successfully created Auth User with ID: ${authUserId}`);
  }

  // 3. Update the auth_user_id in public.workers table
  console.log("Updating public.workers table with auth_user_id...");
  const { data: updatedWorker, error: updateErr } = await s
    .from('workers')
    .update({ auth_user_id: authUserId })
    .eq('id', worker.id)
    .select();

  if (updateErr) {
    console.error("Error updating public.workers table:", updateErr);
    process.exit(1);
  }

  console.log("SUCCESS: Worker registered in Auth and linked successfully!");
  console.log(updatedWorker);
}

run();
