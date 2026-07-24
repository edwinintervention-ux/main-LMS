import { createClient } from "@supabase/supabase-js";

Deno.serve(async (req: Request) => {
  try {
    const payload = await req.json();
    console.log("[M-Pesa Reversal Callback] Raw:", JSON.stringify(payload));

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    // Audit Log the incoming callback
    await supabase.from('raw_mpesa_logs').insert({
      source: 'mpesa-reversal-callback',
      payload: payload
    });

    const result = payload.Result;
    if (!result) throw new Error("Invalid Reversal Callback payload");

    const conversationId = result.ConversationID;
    const resultCode = result.ResultCode;
    const resultDesc = result.ResultDesc;

    console.log(`[M-Pesa Reversal Callback] ConvID: ${conversationId}, Result: ${resultCode} - ${resultDesc}`);
    
    // 1. Determine the transaction type (payment or disbursement) by checking both tables for the ConversationID
    let txType: string | null = null;
    
    const { data: pay } = await supabase.from('payments').select('id').eq('reversal_id', conversationId).maybeSingle();
    if (pay) {
      txType = 'payment';
    } else {
      const { data: disb } = await supabase.from('b2c_disbursements').select('id').eq('reversal_id', conversationId).maybeSingle();
      if (disb) txType = 'disbursement';
    }

    if (txType) {
      console.log(`[M-Pesa Reversal Callback] Found record in ${txType}. Finalizing phase: ${resultCode === 0 ? 'COMPLETE' : 'FAIL'}`);
      await supabase.rpc('manage_reversal', {
        p_phase: resultCode === 0 ? 'COMPLETE' : 'FAIL',
        p_type: txType,
        p_id: conversationId,
        p_reason: resultDesc
      });
    } else {
      console.warn(`[M-Pesa Reversal Callback] No record found for ConversationID: ${conversationId}`);
    }

    // 2. Update Paybill Balance if provided (standard logic)
    if (resultCode === 0 && result.ResultParameters?.ResultParameter) {
       const balanceParam = result.ResultParameters.ResultParameter.find((p: any) => p.Key === "AccountBalance");
       if (balanceParam) {
           const utilityPart = balanceParam.Value.split('&').find((s: string) => s.startsWith("Utility Account"));
           if (utilityPart) {
               const bal = parseFloat(utilityPart.split('|')[2]);
               if (!isNaN(bal)) {
                   await supabase.from('paybill_balance').update({
                       utility_balance: bal,
                       last_updated: new Date().toISOString()
                   }).eq('id', 1);
               }
           }
       }
    }

    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Success" }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err: any) {
    console.error("[M-Pesa Reversal Callback] Error:", err.message);
    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Acknowledged Error" }));
  }
});
