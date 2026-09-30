import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { action, phone } = await req.json();

    if (action !== "request_otp") {
      return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    if (!phone) {
      return new Response(JSON.stringify({ error: "Phone required" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 1. Call RPC to generate OTP
    const { data: code, error: rpcError } = await sb.rpc("request_customer_otp", { p_phone: phone });
    if (rpcError) throw new Error(rpcError.message);

    // 2. Format phone for SMS
    let smsPhone = phone.replace(/\s+/g, "").replace(/^\+/, "");
    if (smsPhone.startsWith("0")) smsPhone = "254" + smsPhone.substring(1);
    if (!smsPhone.startsWith("254")) smsPhone = "254" + smsPhone;

    // 3. Send SMS via Intouch VAS directly to save an extra function invocation
    const apiKey = Deno.env.get("INTOUCH_API_KEY") || "";
    const senderId = Deno.env.get("INTOUCH_SENDER_ID") || "Adequate";
    
    if (apiKey) {
      const msg = "Your Adequate Capital login code is " + code + ". It expires in 2 minutes. Do not share this code with anyone.";
      await fetch("https://sms-service.intouchvas.io/message/send/transactional", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({ message: msg, msisdn: smsPhone, sender_id: senderId }),
      }).catch(e => console.error("SMS sending failed:", e));
    } else {
      console.warn("INTOUCH_API_KEY not set. SMS not sent. Code:", code);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: err.message === 'Customer not found' ? 404 : 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});