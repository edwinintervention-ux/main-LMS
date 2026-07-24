import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Only callable by authenticated users (admin)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    // Use service role to create auth users
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Verify the caller is an active admin worker
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    const { data: callerWorker } = await supabaseAdmin
      .from('workers')
      .select('role, status')
      .or(`auth_user_id.eq.${caller.id},email.ilike."${caller.email}"`)
      .maybeSingle();

    const adminRoles = ['admin', 'Admin', 'Super Admin', 'Director'];
    if (!callerWorker || !adminRoles.includes(callerWorker.role) || callerWorker.status !== 'Active') {
      return new Response(JSON.stringify({ error: 'Only admins can create worker accounts' }), { status: 403, headers: corsHeaders });
    }

    const { email, password, worker_id } = await req.json();
    if (!email || !password || !worker_id) {
      return new Response(JSON.stringify({ error: 'email, password, and worker_id are required' }), { status: 400, headers: corsHeaders });
    }
    if (password.length < 6) {
      return new Response(JSON.stringify({ error: 'Password must be at least 6 characters' }), { status: 400, headers: corsHeaders });
    }

    // Check if auth user already exists — update password if so
    const { data: existingList } = await supabaseAdmin.auth.admin.listUsers();
    const existing = existingList?.users?.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());

    let authUserId: string;
    if (existing) {
      // Update password for existing user
      const { error: upErr } = await supabaseAdmin.auth.admin.updateUserById(existing.id, { password });
      if (upErr) throw upErr;
      authUserId = existing.id;
    } else {
      // Create brand new auth user
      const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Skip email confirmation
      });
      if (createErr) throw createErr;
      authUserId = newUser.user.id;
    }

    // Backfill auth_user_id on the worker row
    const { error: linkErr } = await supabaseAdmin
      .from('workers')
      .update({ auth_user_id: authUserId })
      .eq('id', worker_id);
    if (linkErr) console.warn('[create-worker-auth] Failed to backfill auth_user_id:', linkErr.message);

    return new Response(JSON.stringify({ success: true, auth_user_id: authUserId, created: !existing }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('[create-worker-auth] Error:', err.message);
    return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
