import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * AUTOMATED REMINDERS - PURGED
 * This function has been decommissioned by admin request.
 * All reminder logic (morning, evening, pre-due alerts) has been removed.
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  console.log("[Reminders] Function invoked. All automated reminder logic has been purged.");

  return new Response(JSON.stringify({ 
    success: true, 
    message: "Automated reminders system is decommissioned. No messages were sent." 
  }), { 
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
});
