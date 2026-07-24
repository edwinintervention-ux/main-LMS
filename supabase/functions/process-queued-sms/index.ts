import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INTOUCH_SMS_URL = "https://sms-service.intouchvas.io/message/send/transactional";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );

    const apiKey = Deno.env.get("INTOUCH_API_KEY") || "";
    const senderId = Deno.env.get("INTOUCH_SENDER_ID") || "Adequate";

    if (!apiKey) {
      throw new Error("INTOUCH_API_KEY secret not configured.");
    }

    // Fetch queued messages whose send_at is past or current
    const { data: queuedMessages, error: fetchError } = await supabase
      .from("queued_sms")
      .select("*")
      .eq("status", "queued")
      .lte("send_at", new Date().toISOString());

    if (fetchError) throw fetchError;

    if (!queuedMessages || queuedMessages.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No queued messages to process." }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get phone numbers for these customers
    const customerIds = queuedMessages.map((m) => m.customer_id);
    const { data: customers, error: custError } = await supabase
      .from("customers")
      .select("id, phone")
      .in("id", customerIds);

    if (custError) throw custError;

    const customerPhoneMap = new Map(customers?.map((c) => [c.id, c.phone]) || []);

    const results = [];

    for (const msg of queuedMessages) {
      const rawPhone = customerPhoneMap.get(msg.customer_id);
      if (!rawPhone) {
        console.error(`[process-queued-sms] Phone not found for customer ID ${msg.customer_id}`);
        await supabase
          .from("queued_sms")
          .update({ status: "failed", updated_at: new Date().toISOString() })
          .eq("id", msg.id);
        results.push({ id: msg.id, status: "failed", error: "Phone number not found" });
        continue;
      }

      // Normalise phone to 254XXXXXXXXX
      let phone = rawPhone.replace(/\s+/g, "").replace(/^\+/, "");
      if (phone.startsWith("0")) {
        phone = "254" + phone.substring(1);
      } else if (phone.length === 9 && !phone.startsWith("254")) {
        phone = "254" + phone;
      } else if (phone.length === 10 && phone.startsWith("0")) {
        phone = "254" + phone.substring(1);
      }
      if (!phone.startsWith("254")) phone = "254" + phone;

      try {
        const res = await fetch(INTOUCH_SMS_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
          },
          body: JSON.stringify({ message: msg.message, msisdn: phone, sender_id: senderId }),
        });

        const responseBody = await res.json().catch(() => ({}));

        if (res.ok) {
          await supabase
            .from("queued_sms")
            .update({ status: "sent", updated_at: new Date().toISOString() })
            .eq("id", msg.id);

          try {
            await supabase.from("sms_logs").insert([{
              phone: phone,
              message: msg.message,
              customer_id: msg.customer_id,
              source: "Automated Queue",
              status_code: 200,
              response_body: responseBody,
              sender_id: "System"
            }]);
          } catch (e: any) {
            console.error(`[process-queued-sms] Failed to insert sms_logs for msg ID ${msg.id}:`, e.message);
          }

          results.push({ id: msg.id, status: "sent" });
        } else {
          console.error(`[process-queued-sms] Intouch failed: ${res.status}`, responseBody);
          await supabase
            .from("queued_sms")
            .update({ status: "failed", updated_at: new Date().toISOString() })
            .eq("id", msg.id);
          results.push({ id: msg.id, status: "failed", error: responseBody });
        }
      } catch (err: any) {
        console.error(`[process-queued-sms] Error sending SMS ID ${msg.id}:`, err.message);
        await supabase
          .from("queued_sms")
          .update({ status: "failed", updated_at: new Date().toISOString() })
          .eq("id", msg.id);
        results.push({ id: msg.id, status: "failed", error: err.message });
      }
    }

    return new Response(JSON.stringify({ success: true, processed: results.length, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[process-queued-sms] Global Error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
