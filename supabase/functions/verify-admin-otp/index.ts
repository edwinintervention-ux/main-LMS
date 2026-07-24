import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-customer-id",
  "Access-Control-Max-Age": "86400",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { otp } = await req.json();
    if (!otp) {
      return new Response(
        JSON.stringify({ error: "OTP is required" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader) {
      console.error("[verify-admin-otp] Missing Authorization header");
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      console.error("[verify-admin-otp] Auth Error:", authError?.message || "No user found");
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized access detected", message: authError?.message || "Invalid security token" }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // Resolve worker — try auth_user_id first, then fallback to email
    let worker: any = null;

    const byAuthId = await supabase
      .from("workers")
      .select("id, otp_code, otp_expires_at")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (!byAuthId.error && byAuthId.data) {
      worker = byAuthId.data;
    } else {
      const byEmail = await supabase
        .from("workers")
        .select("id, otp_code, otp_expires_at")
        .ilike("email", user.email ?? "")
        .maybeSingle();
      worker = byEmail.data;
    }

    if (!worker) {
      console.error("[verify-admin-otp] Worker not found for user:", user.id, user.email);
      return new Response(
        JSON.stringify({ success: false, error: "Worker profile not found", message: "Your admin profile could not be linked." }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const submittedOtp = String(otp).trim();
    const storedOtp = worker.otp_code ? String(worker.otp_code).trim() : null;
    const expiresAt = worker.otp_expires_at;

    console.log(`[verify-admin-otp] Attempt for ${worker.id}: Submitted="${submittedOtp}", Stored="${storedOtp}"`);

    if (!storedOtp) {
      console.error("[verify-admin-otp] No active code in DB for worker:", worker.id);
      return new Response(
        JSON.stringify({ success: false, error: "No active security code. Please request a new one." }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    if (storedOtp !== submittedOtp) {
      console.error(`[verify-admin-otp] Code mismatch for worker ${worker.id}: ${submittedOtp} != ${storedOtp}`);
      return new Response(
        JSON.stringify({ success: false, error: "Incorrect security code. Please check the SMS and try again." }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    if (expiresAt && new Date(expiresAt) < new Date()) {
      console.error("[verify-admin-otp] Code expired for worker:", worker.id, "at", expiresAt);
      return new Response(
        JSON.stringify({ success: false, error: "Security code has expired. Please request a new one." }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // Clear OTP after successful verification (one-time use)
    const { error: updateError } = await supabase
      .from("workers")
      .update({ otp_code: null, otp_expires_at: null })
      .eq("id", worker.id);

    if (updateError) {
      console.error("[verify-admin-otp] Update error:", updateError);
    }

    return new Response(
      JSON.stringify({ success: true, message: "OTP verified" }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error("[verify-admin-otp] Critical Error:", err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
