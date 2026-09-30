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
    const { origin } = await req.json().catch(() => ({}));

    const authHeader = req.headers.get("Authorization");
    console.log("[send-admin-otp] Auth Header:", authHeader ? "Present" : "Missing");

    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), { status: 401, headers: CORS });
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
      console.error("[send-admin-otp] Auth Error:", authError?.message || "No user found");
      return new Response(JSON.stringify({ 
        error: "Unauthorized access detected", 
        message: authError?.message || "Invalid security token",
        code: "AUTH_FAILED"
      }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // Fetch the worker profile — try auth_user_id first, fallback to email match
    let worker: any = null;
    let workerError: any = null;

    const byAuthId = await supabase
      .from("workers")
      .select("id, mfa_phone, phone, role, email, otp_code, otp_expires_at")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (!byAuthId.error && byAuthId.data) {
      worker = byAuthId.data;
    } else {
      // Fallback: match by auth user email (handles workers created before auth_user_id linking)
      const byEmail = await supabase
        .from("workers")
        .select("id, mfa_phone, phone, role, email, otp_code, otp_expires_at")
        .ilike("email", user.email ?? "")
        .maybeSingle();
      worker = byEmail.data;
      workerError = byEmail.error;
    }

    if (workerError || !worker) {
      console.error("[send-admin-otp] Worker not found for user:", user.id, user.email);
      return new Response(JSON.stringify({ 
        error: "Worker profile not found", 
        message: "Your administrator profile could not be linked to this login. Contact support.",
        code: "PROFILE_NOT_FOUND"
      }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    console.log(`[send-admin-otp] Worker identified: ${worker.name || worker.email} (ID: ${worker.id})`);

    // Check for existing valid OTP
    let otp = worker.otp_code ? String(worker.otp_code).trim() : null;
    let expiresAt = worker.otp_expires_at;

    const nowTimestamp = new Date();
    // Reuse if exists and has at least 30 seconds left
    const isStillValid = otp && expiresAt && new Date(expiresAt).getTime() > (nowTimestamp.getTime() + 30000);

    if (!isStillValid) {
      console.log("[send-admin-otp] Generating new OTP...");
      otp = Math.floor(1000 + Math.random() * 9000).toString();
      expiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString(); // 2 minutes

      const { error: updateError } = await supabase
        .from("workers")
        .update({ otp_code: otp, otp_expires_at: expiresAt })
        .eq("id", worker.id);

      if (updateError) {
        console.error("[send-admin-otp] DB Update Error:", updateError);
        throw updateError;
      }
      console.log(`[send-admin-otp] New OTP ${otp} stored for ${worker.id}`);
    } else {
      console.log("[send-admin-otp] Reusing existing valid OTP:", otp);
    }

    // Send SMS
    const targetPhone = worker.mfa_phone || worker.phone;
    if (!targetPhone) {
      return new Response(JSON.stringify({ error: "No phone number configured for MFA" }), { status: 400, headers: CORS });
    }

    let smsMessage = `Your Intervention Capital login code is: ${otp}. Expires in 2 minutes.`;
    
    // WebOTP API formatting: Standard @domain #OTP on the last line
    if (origin) {
      try {
        const domain = new URL(origin).hostname;
        // Some browsers prefer no space between # and the code, others are fine with it. 
        // We'll use the most standard: @domain #1234
        smsMessage += `\n\n@${domain} #${otp}`;
      } catch (e) {
        console.warn("[send-admin-otp] Invalid origin for WebOTP:", origin);
      }
    }
    
    // Call the existing send-sms function internally or just duplicate logic
    const apiKey = Deno.env.get("INTOUCH_API_KEY") || "";
    const senderId = Deno.env.get("INTOUCH_SENDER_ID") || "ADEQUATE";
    
    // Robust Kenyan phone normalization
    let phone = targetPhone.replace(/\s+/g, "").replace(/^\+/, "");
    if (phone.startsWith("0")) {
      phone = "254" + phone.substring(1);
    } else if (phone.length === 9 && !phone.startsWith("254")) {
      phone = "254" + phone;
    } else if (phone.length === 10 && phone.startsWith("7")) { // Handle 7XXXXXXXX format
      phone = "254" + phone.substring(1); // Wait, usually 10 digits starting with 7 is not standard unless it's 07...
    }
    // Simplest reliable way for Kenya:
    if (phone.length === 9) phone = "254" + phone;
    if (phone.length === 10 && phone.startsWith("0")) phone = "254" + phone.substring(1);
    if (!phone.startsWith("254")) phone = "254" + phone; // Final fallback if it looks like a local number


    const smsRes = await fetch("https://sms-service.intouchvas.io/message/send/transactional", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({ message: smsMessage, msisdn: phone, sender_id: senderId }),
    });

    const smsData = await smsRes.json().catch(() => null);

    const isSuccessText = smsData && typeof smsData.message === 'string' && smsData.message.toLowerCase().includes('success');
    
    if (!smsRes.ok && !isSuccessText) {
       console.error("[send-admin-otp] SMS Provider Error:", smsRes.status, smsData);
       return new Response(JSON.stringify({ 
         error: `SMS Provider Error: ${smsData?.message || smsData?.error || 'Delivery failed'}` 
       }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // Even if smsRes.ok is true, double check it doesn't contain an explicit error
    if (smsRes.ok && smsData && (smsData.error || (typeof smsData.status === 'string' && smsData.status.toLowerCase() === 'error'))) {
       console.error("[send-admin-otp] SMS Provider Soft Error:", smsRes.status, smsData);
       return new Response(JSON.stringify({ 
         error: `SMS Provider Error: ${smsData?.message || smsData?.error || 'Delivery failed'}` 
       }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // Log to sms_logs (best effort)
    try {
      await supabase.from("sms_logs").insert({
        phone,
        message: smsMessage,
        status_code: smsRes.status,
        response_body: smsData,
        sender_id: senderId,
        customer_id: null,
        source: "send-admin-otp",
      });
    } catch (e) {
      console.warn("[send-admin-otp] Failed to log SMS:", e.message);
    }

    return new Response(JSON.stringify({ success: true, message: "OTP sent" }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
  }
});
