import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  try {
    const { email, new_password } = await req.json();

    if (!email || !new_password) throw new Error("Missing email or password.");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 1. Find the user in auth.users by email
    const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) throw listError;

    const user = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
    
    let authUserId;

    if (!user) {
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: new_password,
        email_confirm: true
      });
      if (createError) throw createError;
      authUserId = newUser.user.id;
      console.log(`[AdminReset] Created new auth user for ${email}`);
    } else {
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
        password: new_password,
        email_confirm: true
      });
      if (updateError) throw updateError;
      authUserId = user.id;
      console.log(`[AdminReset] Password forcefully updated for ${email}`);
    }

    // Try to link the auth_user_id to any worker with this email
    await supabaseAdmin.from('workers').update({ auth_user_id: authUserId }).ilike('email', email);

    return new Response(JSON.stringify({ success: true, message: "Password updated successfully." }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error(`[AdminReset] Error: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
