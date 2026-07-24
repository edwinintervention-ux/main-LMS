import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

Deno.serve(async (req: Request) => {
  try {
    const payload = await req.json();
    const result = payload.Result;

    if (!result) return new Response("OK"); // Acknowledge without doing anything if malformed

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 0. Log raw payload for debugging
    await supabaseClient.from('raw_mpesa_logs').insert({
      payload: payload,
      source: 'mpesa-b2c-callback'
    });

    const convId = result.ConversationID;
    const origConvId = result.OriginatorConversationID;
    const resultCode = result.ResultCode; // 0 is success
    
    let transactionId = "FAILED";
    let paybillBalance = null;
    let utilityBalance = "N/A";

    // Extract transaction ID and Balance if successful
    if (resultCode === 0 && result.ResultParameters?.ResultParameter) {
      const trxParam = result.ResultParameters.ResultParameter.find((p: any) => p.Key === "TransactionReceipt");
      if (trxParam) transactionId = trxParam.Value;

      // Extract account balance if present (C2B format)
      const balanceParam = result.ResultParameters.ResultParameter.find((p: any) => p.Key === "AccountBalance");
      if (balanceParam) paybillBalance = balanceParam.Value;

      // Extract B2C specific balance (B2C format)
      const b2cBalanceParam = result.ResultParameters.ResultParameter.find((p: any) => p.Key === "B2CUtilityAccountAvailableFunds");
      if (b2cBalanceParam) {
          const bal = parseFloat(b2cBalanceParam.Value);
          if (!isNaN(bal)) utilityBalance = bal.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
    }

    // 0b. Update Live Balance if provided (C2B fallback)
    if (paybillBalance && utilityBalance === "N/A") {
        // Balance string format: "Utility Account|KES|123.00|123.00|0.00|0.00&..."
        const utilityPart = paybillBalance.split('&').find((s: string) => s.startsWith("Utility Account"));
        if (utilityPart) {
            const rawVal = utilityPart.split('|')[2];
            utilityBalance = parseFloat(rawVal).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const bal = parseFloat(rawVal);
            if (!isNaN(bal)) {
                await supabaseClient.from('paybill_balance').update({
                    utility_balance: bal,
                    last_updated: new Date().toISOString()
                }).eq('id', 1);
            }
        }
    } else if (utilityBalance !== "N/A") {
        // Update from B2C specific balance
        const bal = parseFloat(utilityBalance.replace(/,/g, ''));
        if (!isNaN(bal)) {
            await supabaseClient.from('paybill_balance').update({
                utility_balance: bal,
                last_updated: new Date().toISOString()
            }).eq('id', 1);
        }
    }

    const finalStatus = resultCode === 0 ? "completed" : "failed";

    // 0c. Update salary_payments first if this is a worker payout
    const { data: salaryPayment } = await supabaseClient
      .from("salary_payments")
      .select("id")
      .or(`mpesa_receipt.eq.${convId},mpesa_receipt.eq.${origConvId}`)
      .maybeSingle();

    if (salaryPayment) {
      await supabaseClient
        .from("salary_payments")
        .update({
          status: finalStatus === "completed" ? "Success" : "Failed",
          remarks: `M-Pesa B2C callback: ${result.ResultDesc}`,
          mpesa_receipt: transactionId !== "FAILED" ? transactionId : convId
        })
        .eq("id", salaryPayment.id);
      
      // Audit log for salary payout callback
      await supabaseClient.from("audit_log").insert({
        ts: new Date().toISOString(),
        user_name: "System",
        action: "Salary Callback",
        target_table: "salary_payments",
        target_id: salaryPayment.id,
        detail: `Worker B2C payout callback. Status: ${finalStatus}. Description: ${result.ResultDesc}. Receipt: ${transactionId}`
      });

      return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // 1. Find the pending disbursement record
    const { data: record, error: fetchErr } = await supabaseClient
      .from("b2c_disbursements")
      .select("id, loan_id, customer_id, amount, phone_number")
      .ilike("originator_conversation_id", origConvId.trim())
      .eq("status", "pending")
      .maybeSingle();

    if (!record) {
      console.warn("Disbursement record not found for OrigConvID:", origConvId);
      return new Response("OK", { status: 200 });
    }

    // 2. Update Disbursement Status
    await supabaseClient
      .from("b2c_disbursements")
      .update({
        transaction_id: transactionId,
        status: finalStatus,
        result_desc: result.ResultDesc,
        updated_at: new Date().toISOString()
      })
      .eq("id", record.id);

    // 3. Update Loan Status if Success
    if (finalStatus === "completed") {
      const apiKey   = Deno.env.get('INTOUCH_API_KEY') || '';
      const senderId = Deno.env.get('INTOUCH_SENDER_ID') || 'Adequate';

      const { error: loanUpdateErr } = await supabaseClient
        .from("loans")
        .update({ 
          status: "Active", 
          disbursed: new Date().toISOString(),
          // balance: record.amount // REMOVED: Don't overwrite the balance which includes interest!
          mpesa: transactionId,
          phone: record.phone_number || null // record.phone_number is selected below
        })
        .eq("id", record.loan_id)
        .in("status", ["Approved", "Active"]);

      if (loanUpdateErr) {
        console.error("Loan update failed:", loanUpdateErr);
      }

      await supabaseClient.from("audit_log").insert({
        ts: new Date().toISOString(),
        user_name: "System",
        action: "Daraja Disbursed",
        target_table: "loans",
        target_id: record.loan_id,
        detail: `M-Pesa System Auto Disbursement OK. Receipt: ${transactionId}. Amount: KES ${record.amount}`
      });

      // Send disbursement confirmation SMS to the customer's registered phone
      try {
        const { data: custData } = await supabaseClient
          .from('customers')
          .select('name, phone')
          .eq('id', record.customer_id)
          .maybeSingle();

        // 3a. Customer Confirmation SMS
        if (custData?.phone && apiKey) {
          const fmt = (n: number) => `KES ${n.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
          const firstName = (custData.name || 'Customer').split(' ')[0];
          const message = `Dear ${firstName}, your loan of ${fmt(record.amount)} has been disbursed to your M-Pesa. Receipt: ${transactionId}. Pay back to Paybill 4166191. Thank you - Adequate Capital.`;
          const phone = custData.phone.replace(/^\+/, '').replace(/^0/, '254');

          const smsRes = await fetch('https://sms-service.intouchvas.io/message/send/transactional', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
            body: JSON.stringify({ message, msisdn: phone, sender_id: senderId }),
          });
          const smsJson = await smsRes.json().catch(() => ({}));
          console.log(`[SMS] Disbursement SMS to ${phone}: status=${smsRes.status}`, JSON.stringify(smsJson));

          await supabaseClient.from('sms_logs').insert({
            phone,
            message,
            status_code: smsRes.status,
            response_body: smsJson,
            sender_id: senderId,
            customer_id: record.customer_id,
            source: 'mpesa-b2c-callback'
          });
        }

        // 3b. Admin Notification (Always send on success)
        const adminPhone = Deno.env.get("ADMIN_NOTIFICATION_PHONE") || "254714256816";
        const adminMsg = `System Alert: KES ${record.amount.toLocaleString()} disbursed to ${custData?.name || 'Customer'}. Paybill Balance: KES ${utilityBalance}. Receipt: ${transactionId}.`;
        
        const adminRes = await fetch('https://sms-service.intouchvas.io/message/send/transactional', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
          body: JSON.stringify({ message: adminMsg, msisdn: adminPhone, sender_id: senderId }),
        });
        const adminJson = await adminRes.json().catch(() => ({}));

        await supabaseClient.from('sms_logs').insert({
          phone: adminPhone,
          message: adminMsg,
          status_code: adminRes.status,
          response_body: adminJson,
          sender_id: senderId,
          source: 'mpesa-b2c-callback-admin'
        });
      } catch (smsErr: any) {
        console.error('[SMS] Failed to send disbursement SMS:', smsErr.message);
      }
    } else {
      // Failed callback logic - Revert loan to Approved so it can be retried
      await supabaseClient
        .from("loans")
        .update({ status: "Approved" })
        .eq("id", record.loan_id);

      await supabaseClient.from("audit_log").insert({
        action: "Daraja Disburse Failed",
        target_table: "loans",
        target_id: record.loan_id,
        detail: `B2C Callback resulted in fail. Code: ${resultCode}. Desc: ${result.ResultDesc}. Loan reverted to Approved.`
      });
    }

    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err: any) {
    console.error("B2C Callback Processing Error:", err);
    return new Response("OK", { status: 200 }); // Safaricom expects 200 regardless
  }
});
