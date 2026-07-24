import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Read env vars fresh on every request so secret updates take effect immediately
    const MpesaConsumerKey = Deno.env.get('MPESA_CONSUMER_KEY') || "";
    const MpesaConsumerSecret = Deno.env.get('MPESA_CONSUMER_SECRET') || "";
    // Reversal/Balance uses dedicated DONAPIB initiator; fall back to B2C initiator if not set.
    const InitiatorName = Deno.env.get('MPESA_REVERSAL_INITIATOR_NAME') || Deno.env.get('MPESA_B2C_INITIATOR_NAME') || Deno.env.get('MPESA_INITIATOR_NAME') || "";
    const SecurityCredential = Deno.env.get('MPESA_REVERSAL_SECURITY_CREDENTIAL') || Deno.env.get('MPESA_B2C_SECURITY_CREDENTIAL') || Deno.env.get('MPESA_SECURITY_CREDENTIAL') || "";
    const ShortCode = Deno.env.get('MPESA_SHORTCODE') || "4166191";

    console.log(`[trigger-account-balance] Using InitiatorName: ${InitiatorName}, ShortCode: ${ShortCode}`);

    // Get Daraja access token
    const credentials = btoa(`${MpesaConsumerKey}:${MpesaConsumerSecret}`);
    const tokenRes = await fetch("https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials", {
      headers: { "Authorization": `Basic ${credentials}` }
    });
    if (!tokenRes.ok) throw new Error("Failed to get Daraja access token");
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!supabaseUrl) throw new Error("Missing SUPABASE_URL configuration.");
    const resultUrl = `${supabaseUrl}/functions/v1/mpesa-balance-callback`;

    const origId = `BAL-${Date.now()}`.substring(0, 32);
    const payload = {
      OriginatorConversationID: origId,
      Initiator: InitiatorName,
      SecurityCredential: SecurityCredential,
      CommandID: "AccountBalance",
      PartyA: ShortCode,
      IdentifierType: "4",
      Remarks: "Check Balance",
      QueueTimeOutURL: resultUrl,
      ResultURL: resultUrl
    };

    const balanceRes = await fetch("https://api.safaricom.co.ke/mpesa/accountbalance/v1/query", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await balanceRes.json();

    // Log the immediate response
    const supabase = createClient(Deno.env.get('SUPABASE_URL') || "", Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || "");
    await supabase.from("raw_mpesa_logs").insert({
      source: "trigger-account-balance",
      payload: { 
        Response: data, 
        Request: { ...payload, SecurityCredential: "[MASKED]" },
        OriginatorConversationID: origId, 
        _initiator: InitiatorName 
      }
    });

    if (data.errorCode || (data.ResponseCode && data.ResponseCode !== "0")) {
      return new Response(JSON.stringify({ error: data.errorMessage || data.ResponseDescription || "Daraja rejected the request." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }

    return new Response(JSON.stringify({ ...data, OriginatorConversationID: origId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: balanceRes.ok ? 200 : 400
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
