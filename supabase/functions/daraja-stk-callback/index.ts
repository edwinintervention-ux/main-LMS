import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// ── Intouch VAS SMS helper (API Key auth) ────────────────────────────────────
const INTOUCH_SMS_URL = "https://sms-service.intouchvas.io/message/send/transactional";

async function sendBalanceSMS(supabase: any, msisdn: string, customerName: string, amountPaid: number, loanBalance: number, transID: string, customerId?: string): Promise<void> {
  try {
    const apiKey   = Deno.env.get("INTOUCH_API_KEY") || "";
    const senderId = Deno.env.get("INTOUCH_SENDER_ID") || "Adequate";

    if (!apiKey || !msisdn) {
      console.warn("[SMS] INTOUCH_API_KEY not set or no MSISDN — skipping.");
      return;
    }

    const phone = msisdn.replace(/^\+/, "").replace(/^0/, "254");
    const fmt = (n: number) => `KES ${n.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    const firstName = customerName.split(' ')[0];
    const message = loanBalance > 0
      ? `Dear ${firstName}, payment of ${fmt(amountPaid)} received (Ref: ${transID}). Outstanding balance: ${fmt(loanBalance)}. Pay to Paybill 4166191. - Adequate Capital.`
      : `Dear ${firstName}, payment of ${fmt(amountPaid)} received (Ref: ${transID}). Your loan is now FULLY SETTLED! Thank you - Adequate Capital.`;

    const smsRes = await fetch(INTOUCH_SMS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({ message, msisdn: phone, sender_id: senderId }),
    });

    const smsJson = await smsRes.json().catch(() => ({}));
    // Log to DB — tied to the customer's account
    await supabase.from('sms_logs').insert({
      phone,
      message,
      status_code: smsRes.status,
      response_body: smsJson,
      sender_id: senderId,
      customer_id: customerId || null,
      source: 'daraja-stk-callback'
    });
  } catch (smsErr: any) {
    console.error("[SMS] Failed to send balance SMS:", smsErr.message);
  }
}

/**
 * PRODUCTION-READY M-PESA STK CALLBACK HANDLER (Unified)
 * This function is now "Trigger-Driven". It logs the payment 
 * and lets the Database Master Trigger handle the financial math.
 */

Deno.serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const supabase = createClient(supabaseUrl, supabaseKey);

  if (req.method !== 'POST') return new Response("Method Not Allowed", { status: 405 });

  try {
    const payload = await req.json();
    console.log("[M-Pesa Edge] Callback Raw:", JSON.stringify(payload));

    const cb = payload.Body?.stkCallback;
    if (!cb) throw new Error("Invalid STK Callback payload");

    const checkoutId = cb.CheckoutRequestID;
    console.log(`[M-Pesa Edge] Processing Callback for: ${checkoutId}`);

    // 1. IMMEDIATE DIAGNOSTIC UPDATE: Mark as 'Processing' so we know the callback reached us
    await supabase.from('stk_requests').update({ 
        status: 'Processing',
        result_desc: `Callback received at ${new Date().toISOString()}`
    }).eq('checkout_request_id', checkoutId);

    // 2. Handle Failures (User cancelled, Timeout, etc.)
    if (cb.ResultCode !== 0) {
      console.warn(`[M-Pesa Edge] STK Failed: ${cb.ResultDesc} (${cb.ResultCode})`);
      await supabase.from('stk_requests').update({ 
        status: 'Failed', 
        result_code: cb.ResultCode, 
        result_desc: cb.ResultDesc 
      }).eq('checkout_request_id', checkoutId);
      
      return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Failure Acknowledged" }));
    }

    // 3. Extract Success Data
    const meta = cb.CallbackMetadata?.Item || [];
    const mpesaReceipt = meta.find((i: any) => i.Name === 'MpesaReceiptNumber')?.Value;
    const amount = parseFloat(meta.find((i: any) => i.Name === 'Amount')?.Value);
    const phone = meta.find((i: any) => i.Name === 'PhoneNumber')?.Value;

    // 4. Match and Update Request in DB
    const { data: request, error: reqErr } = await supabase
      .from('stk_requests')
      .update({ 
        status: 'Completed', 
        mpesa_receipt: mpesaReceipt, 
        result_code: 0,
        result_desc: 'Success'
      })
      .eq('checkout_request_id', checkoutId)
      .select('id, reference, description, loan_id')
      .maybeSingle();

    if (!request || reqErr) {
        console.error("[M-Pesa Edge] STK Request record NOT FOUND for CheckoutRequestID:", checkoutId);
        return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Orphaned Success Logged" }));
    }

    // 5. Fetch Customer Details for Ledger Consistency
    const { data: customer } = await supabase
        .from('customers')
        .select('name')
        .eq('id', request.reference)
        .maybeSingle();

    const customerName = customer?.name || 'Unknown Customer';
    
    // Use Africa/Nairobi time for the date string to ensure consistency with the frontend dashboard "Today" filter
    const todayStr = new Intl.DateTimeFormat('en-CA', { 
        timeZone: 'Africa/Nairobi',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit' 
    }).format(new Date());

    console.log(`[M-Pesa Edge] matched request: ${request.id}, reference: ${request.reference}, desc: ${request.description}, date: ${todayStr}`);

    // 6. Record the Payment (CONSISTENT WITH SCHEMAv4)
    if (request.description === 'Registration Fee') {
        // 1. Registration Fee Record
        const { error: regErr } = await supabase.from('registration_fees').insert({
            customer_id: request.reference,
            amount: amount,
            paid_at: new Date().toISOString(),
            status: 'paid' // FIXED: must be 'paid' to match registration_fee_status enum
        });
        if (regErr) console.error("[M-Pesa Edge] Reg Fee Record Error:", regErr.message);

        // 2. Also Record in Payments Ledger for frontend visibility
        const { error: payErr } = await supabase.from('payments').insert({
            customer_id: request.reference,
            customer_name: customerName,
            amount: amount,
            mpesa: mpesaReceipt, 
            date: new Date().toISOString(),
            status: 'Allocated',
            is_reg_fee: true,
            allocated_by: 'M-Pesa STK Callback'
        });

        if (payErr) {
            console.error("[M-Pesa Edge] Registration Payment Log Error:", payErr.message);
            throw new Error(`Payment insertion failed: ${payErr.message}`);
        }

        // 3. Activate Customer
        await supabase.from('customers')
            .update({ mpesa_registered: true, status: 'Active' })
            .eq('id', request.reference);
    } else {
        // Standard Loan Payment Logic
        // If a specific loan_id was requested, use it. Otherwise find the latest Active/Overdue loan.
        let targetLoanId = request.loan_id;

        if (!targetLoanId) {
            const { data: loan } = await supabase.from('loans')
                .select('id')
                .eq('customer_id', request.reference)
                .in('status', ['Active', 'Overdue'])
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            targetLoanId = loan?.id || null;
        }

        const { data: existingPay } = await supabase.from('payments').select('id').eq('mpesa', mpesaReceipt).maybeSingle();
        if (existingPay) {
            console.log(`[M-Pesa Edge] STK payment ${mpesaReceipt} already exists. Skipping.`);
        } else {
            const { error: payErr } = await supabase.from('payments').insert({
                customer_id: request.reference,
                customer_name: customerName,
                loan_id: targetLoanId,
                amount,
                mpesa: mpesaReceipt,
                date: new Date().toISOString(),
                status: targetLoanId ? 'Allocated' : 'Unallocated',
                allocated_by: targetLoanId ? 'M-Pesa STK Callback' : null
            });

            if (payErr) {
                console.error("[M-Pesa Edge] Loan Payment Log Error:", payErr.message);
                throw new Error(`Payment insertion failed: ${payErr.message}`);
            }
        }

        // ── Send loan balance SMS via Intouch VAS ──────────────────────────
        if (request.reference && targetLoanId) {
            try {
                const [{ data: loanData }, { data: customerData }, { data: pays }] = await Promise.all([
                    supabase.from('loans').select('amount, balance, penalties, disbursed, interest_discount').eq('id', targetLoanId).single(),
                    supabase.from('customers').select('phone').eq('id', request.reference).single(),
                    supabase.from('payments').select('amount, mpesa').eq('loan_id', targetLoanId).eq('status', 'Allocated')
                ]);

                // Use financial engine logic (Principal + Interest + Penalty - Total Paid)
                // 1. Calculate sum of PREVIOUSLY allocated payments
                // We filter out the current transaction ID case-insensitively to be safe.
                const otherPayments = pays ? (pays as any[]).filter((p: any) => p.mpesa?.toUpperCase() !== mpesaReceipt.toUpperCase()) : [];
                const prevPaid = otherPayments.reduce((s: number, p: any) => s + p.amount, 0);

                // 2. Add current payment amount to the total (exactly once)
                const totalPaid = prevPaid + amount;
                
                const loanDiscount = Number(loanData?.interest_discount || 0);
                const effectiveRate = 0.3 * (1 - loanDiscount / 100);
                const baseTotal = Math.round((loanData?.amount ?? 0) * (1 + effectiveRate));
                
                let accruedPenalty = 0;
                if (loanData?.disbursed) {
                    const disbursedDate = new Date(loanData.disbursed);
                    const dueDate = new Date(disbursedDate.getTime() + (30 * 24 * 60 * 60 * 1000));
                    const today = new Date();
                    const daysOverdue = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000)));
                    const cappedOverdue = Math.min(daysOverdue, 60);
                    accruedPenalty = Math.round(baseTotal * 0.012 * cappedOverdue);
                }

                const loanBalance = baseTotal + accruedPenalty - totalPaid;
                const targetPhone = customerData?.phone;

                if (targetPhone) {
                    console.log(`[STK Callback] Sending balance SMS to ${targetPhone}. Balance: ${loanBalance}`);
                    await sendBalanceSMS(supabase, targetPhone, customerName, amount, loanBalance, mpesaReceipt, request.reference);
                } else {
                    console.warn(`[STK Callback] No phone found for customer ${request.reference} — skipping SMS.`);
                }
            } catch (smsErr: any) {
                console.error(`[M-Pesa Edge] SMS Error:`, smsErr.message);
            }
        }
    }

    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Success" }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err: any) {
    console.error("[M-Pesa Edge] Critical Error:", err.message);
    
    // Attempt to log the error to the database if we have a CheckoutID
    try {
        const payload = await req.clone().json().catch(() => ({}));
        const checkoutId = payload.Body?.stkCallback?.CheckoutRequestID;
        if (checkoutId) {
            await supabase.from('stk_requests').update({
                status: 'Failed',
                result_desc: `Internal Processing Error: ${err.message}`
            }).eq('checkout_request_id', checkoutId);
        }
    } catch (loggingErr) {
        console.error("Failed to log error to DB:", loggingErr.message);
    }

    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Acknowledged Error" }));
  }
});
