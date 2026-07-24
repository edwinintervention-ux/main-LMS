import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { tx_type, id, reason } = await req.json();
    console.log(`[Reversal] Starting for ${tx_type} ID: ${id}`);

    // 1. Fetch Transaction Details
    let amount: number;
    let mpesa_receipt: string;
    
    if (tx_type === 'payment') {
      const { data: p } = await supabaseClient.from('payments').select('amount, mpesa').eq('id', id).single();
      if (!p) throw new Error("Payment record not found.");
      amount = p.amount;
      mpesa_receipt = p.mpesa;
    } else {
      const { data: d } = await supabaseClient.from('b2c_disbursements').select('amount, transaction_id').eq('id', id).single();
      if (!d) throw new Error("Disbursement record not found.");
      amount = d.amount;
      mpesa_receipt = d.transaction_id;
    }

    if (!mpesa_receipt) throw new Error("No M-Pesa reference found. Manual entries cannot be reversed via API.");

    // 2. Daraja Token Generation
    const consumerKey = Deno.env.get("MPESA_CONSUMER_KEY");
    const consumerSecret = Deno.env.get("MPESA_CONSUMER_SECRET");
    const credentials = btoa(`${consumerKey}:${consumerSecret}`);
    const mpesaEnv = Deno.env.get("MPESA_ENVIRONMENT") === "production" ? "api.safaricom.co.ke" : "sandbox.safaricom.co.ke";
    
    const tokenRes = await fetch(`https://${mpesaEnv}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${credentials}` },
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(`M-Pesa Token Generation Failed: ${JSON.stringify(tokenData)}`);
    const token = tokenData.access_token;

    // 3. Robust Shortcode Detection
    const c2bShortcode = Deno.env.get("MPESA_C2B_SHORTCODE") || Deno.env.get("MPESA_SHORTCODE");
    const b2cShortcode = Deno.env.get("MPESA_B2C_SHORTCODE") || Deno.env.get("MPESA_SHORTCODE");

    const shortcode = tx_type === 'payment' ? c2bShortcode : b2cShortcode;
    // Reversal uses dedicated DONAPIB initiator; fall back to B2C initiator if not set.
    // Reversal uses dedicated DONAPIB initiator; fall back to B2C initiator if not set.
    const initiator = Deno.env.get("MPESA_REVERSAL_INITIATOR_NAME") || Deno.env.get("MPESA_B2C_INITIATOR_NAME") || Deno.env.get("MPESA_INITIATOR_NAME");
    const securityCert = Deno.env.get("MPESA_REVERSAL_SECURITY_CREDENTIAL") || Deno.env.get("MPESA_B2C_SECURITY_CREDENTIAL") || Deno.env.get("MPESA_SECURITY_CREDENTIAL");
    const callbackUrl = Deno.env.get("MPESA_REVERSAL_CALLBACK_URL") || Deno.env.get("MPESA_B2C_CALLBACK_URL") || Deno.env.get("MPESA_C2B_CALLBACK_URL");

    if (!shortcode) throw new Error(`Missing Shortcode secret for ${tx_type}.`);
    if (!initiator || !securityCert) throw new Error(`Missing M-Pesa configuration: ${!initiator ? 'Initiator ' : ''}${!securityCert ? 'SecurityCredential' : ''}`);

    const reversalPayload = {
      Initiator: initiator,
      SecurityCredential: securityCert,
      CommandID: "TransactionReversal",
      TransactionID: mpesa_receipt.trim(),
      Amount: amount,
      ReceiverParty: shortcode,
      RecieverIdentifierType: tx_type === 'payment' ? "1" : "11", // Typo required by Safaricom API
      ResultURL: callbackUrl,
      QueueTimeOutURL: callbackUrl,
      Remarks: `LMS Rev: ${reason}`.substring(0, 100),
      Occasion: `LMS-REV-${id}`.substring(0, 100)
    };

    console.log("[Reversal] Sending Request to Safaricom...");
    
    // Log the request (excluding security credential)
    await supabaseClient.from('raw_mpesa_logs').insert({
      source: 'mpesa-reversal-request',
      payload: {
        tx_type,
        id,
        reversalPayload: { ...reversalPayload, SecurityCredential: '[REDACTED]' }
      }
    });

    const revRes = await fetch(`https://${mpesaEnv}/mpesa/reversal/v1/request`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(reversalPayload),
    });

    const revData = await revRes.json();
    
    if (revData.ResponseCode !== "0") {
      throw new Error(`Safaricom Rejection: ${revData.ResponseDescription || revData.errorMessage}`);
    }

    // 4. Update Database (Mark as Pending Reversal)
    await supabaseClient.rpc('manage_reversal', {
      p_phase: 'INITIATE',
      p_type: tx_type,
      p_id: id,
      p_reason: reason,
      p_reversal_id: revData.ConversationID 
    });

    return new Response(JSON.stringify({ 
      success: true, 
      message: "Reversal request sent to Safaricom.",
      conversation_id: revData.ConversationID 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
