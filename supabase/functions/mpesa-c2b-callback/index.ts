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

    // Normalise phone to 254XXXXXXXXX — strip spaces/dashes first, then prefix
    let phone = msisdn.replace(/[\s\-]/g, '').replace(/^\+/, '');
    if (phone.startsWith('0')) phone = '254' + phone.substring(1);
    else if (phone.length === 9 && !phone.startsWith('254')) phone = '254' + phone;
    if (!phone.startsWith('254')) phone = '254' + phone;

    // Format currency
    const fmt = (n: number) => `KES ${n.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    const firstName = customerName.split(' ')[0];
    const message = loanBalance > 0
      ? `Dear ${firstName}, payment of ${fmt(amountPaid)} received (Ref: ${transID}). Outstanding balance: ${fmt(loanBalance)}. Pay to Paybill 4166191. - Adequate Capital.`
      : `Dear ${firstName}, payment of ${fmt(amountPaid)} received (Ref: ${transID}). Your loan is now FULLY SETTLED! Thank you - Adequate Capital.`;

    // Send SMS — API Key used directly as Bearer token
    const smsRes = await fetch(INTOUCH_SMS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({ message, msisdn: phone, sender_id: senderId }),
    });

    const smsJson = await smsRes.json().catch(() => ({}));
    console.log(`[SMS] Sent to ${phone}: status=${smsRes.status}`, JSON.stringify(smsJson));

    // Log to DB — tied to the customer's account
    await supabase.from('sms_logs').insert({
      phone,
      message,
      status_code: smsRes.status,
      response_body: smsJson,
      sender_id: senderId,
      customer_id: customerId || null,
      source: 'mpesa-c2b-callback'
    });
  } catch (smsErr: any) {
    console.error("[SMS] Failed to send balance SMS:", smsErr.message);
    await supabase.from('sms_logs').insert({
      phone: msisdn,
      message: 'CRITICAL_ERROR',
      status_code: 500,
      response_body: { error: smsErr.message },
      source: 'mpesa-c2b-callback'
    });
  }
}

/**
 * PRODUCTION-READY M-PESA C2B (PAYBILL) CALLBACK HANDLER
 *
 * Account Number Matching Priority:
 *   1. id_no  (National ID) — this is the canonical "account number" customers use at paybill
 *   2. id     (numeric customer record ID) — numeric fallback
 *   3. MSISDN (phone number) — last resort when account field is missing
 */


/** Generate a PAY-XXXXXXX style ID matching the frontend format */
const genPayId = () => 'PAY-' + crypto.randomUUID().replace(/-/g, '').substring(0, 7).toUpperCase();

Deno.serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const supabase = createClient(supabaseUrl, supabaseKey);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  let bodyText = "";
  try {
    bodyText = await req.text();
  } catch (err) {
    console.error(`[C2B ${requestId}] Failed to read body`, err);
  }

  try {
    console.log(`[C2B ${requestId}] Raw Body: ${bodyText}`);

    let payload: any = {};
    try {
      payload = JSON.parse(bodyText);
    } catch (e) {
      console.warn(`[C2B ${requestId}] JSON parse failed.`);
    }

    const TransID = payload.TransID || payload.reference || payload.transaction_id;
    if (!TransID) {
      console.warn(`[C2B ${requestId}] No TransID found — skipping.`);
      return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // Guard: IVAS Touch sends status_code 3112 for successful M-Pesa payments.
    // Reject any callback that explicitly marks a non-success status.
    const ivasTouchStatusCode = payload.status_code;
    if (ivasTouchStatusCode !== undefined && ivasTouchStatusCode !== null && ivasTouchStatusCode !== 3112) {
      console.warn(`[C2B ${requestId}] IVAS Touch status_code=${ivasTouchStatusCode} — not a successful payment. Skipping.`);
      return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // Respond immediately to prevent aggregator webhook timeout
    const response = new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), {
      headers: { "Content-Type": "application/json" }
    });

    // Run business logic in the background
    const doBackgroundTask = async () => {
      try {
        // 1. Log raw payload in the background
        try {
          await supabase.from('raw_mpesa_logs').insert({
            payload: payload && Object.keys(payload).length > 0 ? payload : { rawText: bodyText },
            source: 'mpesa-c2b-callback'
          });
        } catch (logErr: any) {
          console.error(`[C2B ${requestId}] Raw Log Error:`, logErr.message);
        }

        const amount        = Number(payload.TransAmount || payload.amount || 0);
        // IVAS Touch sends msisdn (lowercase); Safaricom uses MSISDN (uppercase)
        const MSISDN        = String(payload.MSISDN || payload.msisdn || '').replace(/[\s\-]/g, '').trim();
        // IVAS Touch sends account (customer's national ID); Safaricom uses BillRefNumber
        const BillRefNumber = String(payload.BillRefNumber || payload.account || '').trim();

        console.log(`[C2B ${requestId}] TransID=${TransID} Amount=${amount} BillRef="${BillRefNumber}" MSISDN=${MSISDN} IVASStatusCode=${ivasTouchStatusCode}`);
        
        // 1b. Update Live Balance if provided in payload
        const paybillBalance = payload.paybill_balance || payload.OrgPaymentDrillDown?.OrgPaymentDrillDownItem?.[0]?.Value;
        if (paybillBalance) {
            const bal = parseFloat(paybillBalance);
            if (!isNaN(bal)) {
                try {
                  await supabase.from('paybill_balance').update({
                      utility_balance: bal,
                      last_updated: new Date().toISOString()
                  }).eq('id', 1);
                  console.log(`[C2B ${requestId}] Updated live balance: ${bal}`);
                } catch (balErr: any) {
                  console.error(`[C2B ${requestId}] Balance Update Error:`, balErr.message);
                }
            }
        }

        // 2. Match customer
        let matchedCustomer: any = null;
        let matchMethod = 'none';

        try {
          if (BillRefNumber) {
            // 1. Try id_no
            const { data: byIdNo } = await supabase.from('customers').select('id, name, status, mpesa_registered').eq('id_no', BillRefNumber).maybeSingle();
            if (byIdNo) {
              matchedCustomer = byIdNo;
              matchMethod = 'id_no';
            } else {
              // 2. Try id_number (modern field)
              const { data: byIdNum } = await supabase.from('customers').select('id, name, status, mpesa_registered').eq('id_number', BillRefNumber).maybeSingle();
              if (byIdNum) {
                matchedCustomer = byIdNum;
                matchMethod = 'id_number';
              } else {
                // 3. Try account_number
                const { data: byAccNum } = await supabase.from('customers').select('id, name, status, mpesa_registered').eq('account_number', BillRefNumber).maybeSingle();
                if (byAccNum) {
                  matchedCustomer = byAccNum;
                  matchMethod = 'account_number';
                } else {
                   // 4. Try internal database ID
                   const { data: byId } = await supabase.from('customers').select('id, name, status, mpesa_registered').eq('id', BillRefNumber).maybeSingle();
                   if (byId) {
                     matchedCustomer = byId;
                     matchMethod = 'customer_id';
                   }
                }
              }
            }
          }

          // Suffix phone matching fallback: only match if the cleaned MSISDN is at least 9 digits long (to prevent short values like "0" from matching everything)
          const cleanMsisdn = MSISDN.replace(/\D/g, '');
          if (!matchedCustomer && cleanMsisdn && cleanMsisdn.length >= 9) {
            const phoneSuffix = cleanMsisdn.slice(-9);
            const { data: byPhone } = await supabase.from('customers').select('id, name, status, mpesa_registered').like('phone', `%${phoneSuffix}`).limit(1).maybeSingle();
            if (byPhone) {
              matchedCustomer = byPhone;
              matchMethod = 'phone';
            }
          }
        } catch (matchErr: any) {
          console.error(`[C2B ${requestId}] Matching Error:`, matchErr.message);
        }

        const mpesaName = [
          payload.FirstName  || payload.first_name,
          payload.MiddleName || payload.middle_name,
          payload.LastName   || payload.last_name
        ].filter(Boolean).join(' ').trim() || String(payload.invoice_number || '').trim();

        const customerName = matchedCustomer?.name || mpesaName || (MSISDN ? `M-Pesa (${MSISDN})` : `Paybill (${BillRefNumber})`);

        // 3. Record Payment
        if (matchedCustomer && amount === 500 && !matchedCustomer.mpesa_registered) {
          // Registration Fee
          await supabase.from("registration_fees").insert({
            customer_id: matchedCustomer.id,
            amount,
            paid_at: new Date().toISOString(),
            status: 'verified'
          });

          await supabase.from('payments').upsert({
            customer_id: matchedCustomer.id,
            customer_name: customerName,
            amount,
            mpesa: TransID,
            date: new Date().toISOString(),
            status: 'Allocated',
            is_reg_fee: true,
            allocated_by: 'M-Pesa C2B Auto'
          }, { onConflict: 'mpesa' });

          await supabase.from('customers').update({ mpesa_registered: true, status: 'Active' }).eq('id', matchedCustomer.id);

        } else {
          // Loan Repayment
          let targetLoanId: string | null = null;
          if (matchedCustomer) {
            // Step 1: Fast path — DB-confirmed Active or Overdue loan
            const { data: activeLoan } = await supabase
              .from("loans")
              .select("id")
              .eq("customer_id", matchedCustomer.id)
              .in("status", ["Overdue", "Active"])
              .order("days_overdue", { ascending: false })
              .limit(1)
              .maybeSingle();
            
            if (activeLoan) {
              targetLoanId = activeLoan.id;
              console.log(`[C2B ${requestId}] Loan matched via DB status: ${targetLoanId}`);
            } else {
              // Step 2: Fallback — DB status may be stale (e.g. marked Settled manually without
              // corresponding payment records). Use financial engine to find any disbursed loan
              // that still has a computed outstanding balance (same formula as the UI).
              const FREEZE_AFTER = 60;
              const DAILY_RATE = 0.012;
              const today = new Date();

              const { data: allLoans } = await supabase
                .from("loans")
                .select("id, amount, disbursed")
                .eq("customer_id", matchedCustomer.id)
                .not("disbursed", "is", null)
                .in("status", ["Active", "Overdue", "Settled"])
                .order("disbursed", { ascending: false })
                .limit(10);
              
              if (allLoans && allLoans.length > 0) {
                let bestLoanId: string | null = null;
                let bestBalance = 0;

                for (const l of allLoans as any[]) {
                  const baseTotal = Math.round((l.amount ?? 0) * 1.3);
                  
                  const disbursedDate = new Date(l.disbursed);
                  const dueDate = new Date(disbursedDate.getTime() + 30 * 24 * 60 * 60 * 1000);
                  const daysOverdue = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
                  const cappedOd = Math.min(daysOverdue, FREEZE_AFTER);
                  const penalty = Math.round(baseTotal * DAILY_RATE * cappedOd);

                  const { data: lPays } = await supabase
                    .from("payments")
                    .select("amount")
                    .eq("loan_id", l.id)
                    .eq("status", "Allocated");
                  const paid = lPays ? (lPays as any[]).reduce((s: number, p: any) => s + p.amount, 0) : 0;

                  const computedBalance = baseTotal + penalty - paid;
                  console.log(`[C2B ${requestId}] Fallback engine: loan=${l.id} baseTotal=${baseTotal} penalty=${penalty} paid=${paid} balance=${computedBalance}`);

                  if (computedBalance > 0 && computedBalance > bestBalance) {
                    bestBalance = computedBalance;
                    bestLoanId = l.id;
                  }
                }

                if (bestLoanId) {
                  targetLoanId = bestLoanId;
                  console.log(`[C2B ${requestId}] Loan matched via engine fallback: ${targetLoanId} (computed balance: ${bestBalance})`);
                } else {
                  console.log(`[C2B ${requestId}] No loan with outstanding balance found — payment will be Unallocated.`);
                }
              }
            }
          }

          const { data: existingPay } = await supabase.from('payments').select('id').eq('mpesa', TransID).maybeSingle();
          
          if (existingPay) {
            console.log(`[C2B ${requestId}] Payment ${TransID} already exists. Skipping.`);
          } else {
            const status = targetLoanId ? "Allocated" : "Unallocated";
            console.log(`[C2B ${requestId}] Inserting payment: status=${status} loan_id=${targetLoanId}`);

            const { error: payErr } = await supabase.from('payments').insert({
              customer_id: matchedCustomer?.id || null,
              customer_name: customerName,
              loan_id: targetLoanId,
              amount,
              mpesa: TransID,
              date: new Date().toISOString(),
              status,
              allocated_by: targetLoanId ? `M-Pesa C2B Auto (${matchMethod})` : null
            });
            if (payErr) console.error(`[C2B ${requestId}] Payment Insert Error:`, payErr.message);
          }

          // 4. Send SMS (Non-blocking failure)
          if (matchedCustomer && targetLoanId) {
            try {
              const [{ data: loanData }, { data: customerData }, { data: pays }] = await Promise.all([
                supabase.from('loans').select('amount, balance, penalties, penalty_accrued, disbursed, interest_discount').eq('id', targetLoanId).single(),
                supabase.from('customers').select('phone').eq('id', matchedCustomer.id).single(),
                supabase.from('payments').select('amount, mpesa').eq('loan_id', targetLoanId).eq('status', 'Allocated')
              ]);

              // Use financial engine logic (Principal + Interest + Penalty - Total Paid)
              // 1. Calculate sum of PREVIOUSLY allocated payments
              // We filter out the current transaction ID case-insensitively to be safe.
              const otherPayments = pays ? (pays as any[]).filter((p: any) => p.mpesa?.toUpperCase() !== TransID.toUpperCase()) : [];
              const prevPaid = otherPayments.reduce((s: number, p: any) => s + p.amount, 0);
              
              // 2. Add the current payment amount to the total (so we have exactly ONE instance of it)
              const totalPaid = prevPaid + amount;
              
              const loanDiscount = Number(loanData?.interest_discount || 0);
              const effectiveRate = 0.3 * (1 - loanDiscount / 100);
              const baseTotal = Math.round((loanData?.amount ?? 0) * (1 + effectiveRate));
              
              // Read penalty from DB-managed penalty_accrued (nightly compounding on outstanding balance).
              // Fall back to simple interest on principal only if penalty_accrued hasn't been set yet.
              let accruedPenalty = 0;
              if (loanData?.penalty_accrued != null) {
                accruedPenalty = Math.max(0, Number(loanData.penalty_accrued));
              } else if (loanData?.disbursed) {
                // Fallback: simple interest (pre-cron loans)
                const disbursedDate = new Date(loanData.disbursed);
                const dueDate = new Date(disbursedDate.getTime() + (30 * 24 * 60 * 60 * 1000));
                const daysOverdue = Math.max(0, Math.floor((Date.now() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
                const DAILY_RATE = 0.012;
                accruedPenalty = Math.round((loanData.amount || 0) * DAILY_RATE * Math.min(daysOverdue, 60));
              }

              const loanBalance = Math.max(0, baseTotal + accruedPenalty - totalPaid);
              const targetPhone = customerData?.phone;

              if (targetPhone) {
                console.log(`[C2B Legacy] Sending balance SMS to ${targetPhone}. Balance: ${loanBalance}`);
                await sendBalanceSMS(supabase, targetPhone, customerName, amount, loanBalance, TransID, matchedCustomer.id);
              } else {
                console.warn(`[C2B Legacy] No phone found for customer ${matchedCustomer.id} — skipping SMS.`);
              }
            } catch (smsErr: any) {
              console.error(`[C2B Legacy] SMS Prep Error:`, smsErr.message);
            }
          }
        }
        console.log(`[C2B ${requestId}] Completed Async Processing.`);
      } catch (err: any) {
        console.error(`[C2B ${requestId}] Fatal Async Error:`, err.message);
      }
    };

    if (typeof (self as any).EdgeRuntime !== 'undefined') {
      (self as any).EdgeRuntime.waitUntil(doBackgroundTask());
    } else {
      doBackgroundTask();
    }

    return response;
  } catch (err: any) {
    console.error(`[C2B ${requestId}] Fatal Error:`, err.message);
    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted with Error" }), {
      headers: { "Content-Type": "application/json" }
    });
  }
});
