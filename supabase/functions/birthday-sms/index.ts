import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * AUTO BIRTHDAY SMS
 *
 * Called by pg_cron daily at 05:00 UTC (08:00 EAT).
 * Finds all customers whose dob matches today's month/day,
 * sends each a personalised SMS, and logs to sms_logs.
 *
 * Also callable manually via POST (no body required).
 *
 * Env secrets required (same as send-sms):
 *   INTOUCH_API_KEY   — sms.intouchvas.io API key
 *   INTOUCH_SENDER_ID — registered sender name (e.g. ADEQUATE)
 *   SUPABASE_URL      — auto-injected by Supabase runtime
 *   SUPABASE_SERVICE_ROLE_KEY — auto-injected by Supabase runtime
 */

const INTOUCH_SMS_URL = "https://sms-service.intouchvas.io/message/send/transactional";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizePhone(raw: string): string {
  let phone = raw.replace(/\s+/g, "").replace(/^\+/, "");
  if (phone.startsWith("0")) phone = "254" + phone.substring(1);
  else if (phone.length === 9 && !phone.startsWith("254")) phone = "254" + phone;
  if (!phone.startsWith("254")) phone = "254" + phone;
  return phone;
}

async function sendSms(phone: string, message: string, apiKey: string, senderId: string) {
  const res = await fetch(INTOUCH_SMS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({ message, msisdn: phone, sender_id: senderId }),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apiKey      = Deno.env.get("INTOUCH_API_KEY") || "";
    const senderId    = Deno.env.get("INTOUCH_SENDER_ID") || "Adequate";

    if (!apiKey) throw new Error("INTOUCH_API_KEY secret not configured.");

    const sb = createClient(supabaseUrl, serviceKey);

    // Parse today's month/day in EAT (UTC+3)
    const now = new Date(Date.now() + 3 * 60 * 60 * 1000); // shift to EAT
    const todayMM = String(now.getUTCMonth() + 1).padStart(2, "0");
    const todayDD = String(now.getUTCDate()).padStart(2, "0");

    let template = "Happy Birthday, {name}! We wish you a wonderful day and a successful year ahead. From all of us at Adequate Capital.";
    try {
      const body = await req.json().catch(() => ({}));
      if (body?.template) template = body.template;
    } catch (_) { /* no body */ }

    // Fetch all customers whose dob matches today MM-DD (format: YYYY-MM-DD in DB)
    const { data: customers, error } = await sb
      .from("customers")
      .select("id, name, phone, dob")
      .not("dob", "is", null)
      .not("phone", "is", null)
      .ilike("dob", `%-${todayMM}-${todayDD}`);

    if (error) throw error;

    if (!customers || customers.length === 0) {
      console.log(`[birthday-sms] No birthdays on ${todayMM}-${todayDD}`);
      return new Response(JSON.stringify({ sent: 0, message: "No birthdays today." }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    console.log(`[birthday-sms] Found ${customers.length} birthday(s) on ${todayMM}-${todayDD}`);

    let sent = 0;
    let failed = 0;
    const results = [];

    for (const cust of customers) {
      const firstName = (cust.name || "").split(" ")[0];
      const msg = template
        .replace(/{name}/g, firstName)
        .replace(/{full_name}/g, cust.name || "");

      const phone = normalizePhone(cust.phone);
      const result = await sendSms(phone, msg, apiKey, senderId);

      if (result.ok) {
        sent++;
        // Log to sms_logs
        await sb.from("sms_logs").insert([{
          phone: cust.phone,
          message: msg,
          customer_id: cust.id,
          customer_name: cust.name,
          type: "birthday",
          status: "sent",
          created_at: new Date().toISOString(),
        }]);
        console.log(`[birthday-sms] ✓ Sent to ${cust.name} (${phone})`);
      } else {
        failed++;
        console.error(`[birthday-sms] ✗ Failed for ${cust.name}: ${JSON.stringify(result.body)}`);
      }

      results.push({ customer: cust.name, phone, ok: result.ok });
    }

    return new Response(
      JSON.stringify({ sent, failed, total: customers.length, results }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[birthday-sms] Error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
