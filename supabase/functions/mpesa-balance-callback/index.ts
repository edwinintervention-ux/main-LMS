import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabaseUrl = Deno.env.get('SUPABASE_URL') || "";
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || "";
const supabase = createClient(supabaseUrl, supabaseKey);

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    console.log("Balance Callback Payload:", JSON.stringify(payload));
    
    // 1. Log raw payload
    await supabase.from("raw_mpesa_logs").insert({
      source: "mpesa-balance-callback",
      payload: payload
    });

    const result = payload?.Result;
    if (result && result.ResultCode === 0) {
      // Success. Parse the parameters
      const params = result.ResultParameters?.ResultParameter || [];
      const accountBalancesStr = params.find((p: any) => p.Key === "AccountBalance")?.Value;
      
      console.log("Parsing accountBalancesStr:", accountBalancesStr);
      
      let utility_balance = 0;
      let working_balance = 0;
      let charges_balance = 0;

      if (accountBalancesStr) {
        const accounts = accountBalancesStr.split('&');
        for (const acc of accounts) {
          const parts = acc.split('|');
          if (parts.length >= 3) {
            const accName = parts[0];
            const currentBal = parseFloat(parts[2]);
            if (accName === "Utility Account") utility_balance = currentBal;
            if (accName === "Working Account") working_balance = currentBal;
            if (accName === "Charges Paid Account") charges_balance = currentBal;
          }
        }
      }

      const { error: updErr } = await supabase.from("paybill_balance").update({
        utility_balance,
        working_balance,
        charges_balance,
        last_updated: new Date().toISOString()
      }).eq('id', 1);

      if (updErr) {
        console.error("Failed to update paybill_balance:", updErr.message);
      } else {
        console.log("Successfully updated paybill_balance table.");
      }
    } else if (result) {
        console.warn("Balance check failed with code:", result.ResultCode, result.ResultDesc);
    }

    // Always respond with 200 OK so Safaricom doesn't retry
    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    });
  } catch (err) {
    console.error("Error in balance callback:", err);
    return new Response("Error processing callback", { status: 500 });
  }
});
