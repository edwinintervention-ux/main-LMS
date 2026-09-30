import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const getCors = (req: Request) => {
  const origin = req.headers.get("Origin") || "https://adequatecapital.co.ke";
  const allowed = origin.includes("localhost") || origin.includes("adequate") ? origin : "https://adequatecapital.co.ke";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-customer-id",
    "Access-Control-Max-Age": "86400",
  };
};

async function sha256(message: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req: Request) => {
  const CORS = getCors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { pin } = await req.json();
    if (!pin) {
      return new Response(
        JSON.stringify({ error: "PIN is required" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader) {
      console.error("[verify-disbursement-pin] Missing Authorization header");
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
      console.error("[verify-disbursement-pin] Auth Error:", authError?.message || "No user found");
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized access detected", message: authError?.message || "Invalid security token" }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const { count: failedAttempts } = await supabase
      .from("audit_log")
      .select("*", { count: "exact", head: true })
      .eq("action", "Failed PIN Attempt")
      .eq("target_id", user.id)
      .gte("ts", new Date(Date.now() - 15 * 60000).toISOString());

    if (failedAttempts !== null && failedAttempts >= 5) {
      return new Response(
        JSON.stringify({ success: false, error: "Too many failed attempts. Try again in 15 minutes." }),
        { status: 429, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    let worker: any = null;

    const byAuthId = await supabase
      .from("workers")
      .select("id, disbursement_pin")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (!byAuthId.error && byAuthId.data) {
      worker = byAuthId.data;
    } else {
      const byEmail = await supabase
        .from("workers")
        .select("id, disbursement_pin")
        .ilike("email", user.email ?? "")
        .maybeSingle();
      worker = byEmail.data;
    }

    if (!worker) {
      return new Response(
        JSON.stringify({ success: false, error: "Worker profile not found", message: "Your admin profile could not be linked." }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    if (!worker.disbursement_pin) {
      return new Response(
        JSON.stringify({ success: false, error: "No Disbursement PIN set", message: "Please set your Disbursement PIN in Settings first." }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const parts = worker.disbursement_pin.split(':');
    if (parts.length !== 2) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid PIN format in database. Please reset your PIN." }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const [salt, storedHash] = parts;
    const computedHash = await sha256(String(pin).trim() + salt);

    if (computedHash !== storedHash) {
      await supabase.from("audit_log").insert({
        action: "Failed PIN Attempt",
        target_id: user.id,
        user_name: worker.name || user.email || "Unknown Worker",
        detail: "Incorrect disbursement PIN entered"
      });

      return new Response(
        JSON.stringify({ success: false, error: "Incorrect Secret PIN." }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    await supabase.from("audit_log").delete().eq("action", "Failed PIN Attempt").eq("target_id", user.id);

    return new Response(
      JSON.stringify({ success: true, message: "PIN verified successfully" }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error("[verify-disbursement-pin] Critical Error:", err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
