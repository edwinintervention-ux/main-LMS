import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-idempotency-key",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";

    // Extract caller user ID directly from the JWT payload.
    // Supabase already verified the JWT signature at the gateway level before
    // this function runs, so we can trust the claims without an extra network call.
    let userId: string | null = null;
    try {
      const jwtPayload = authHeader.replace(/^Bearer\s+/i, "").split(".")[1];
      if (jwtPayload) {
        const decoded = JSON.parse(atob(jwtPayload));
        userId = decoded.sub ?? null;
      }
    } catch (e) {
      console.warn("JWT decode warning:", e);
    }

    if (!userId) {
      throw new Error("Unauthorized: Missing or invalid auth token");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body = await req.json().catch(() => ({}));
    const { loan_id, worker_id, amount, phone, type } = body;

    let payoutAmount: number;
    let phoneStr: string;
    let customerId: string | null = null;

    if (type === "salary" || worker_id) {
      // 1a. Fetch Worker Details
      const { data: worker, error: workerErr } = await supabaseClient
        .from("workers")
        .select("id, name, phone, mpesa_number")
        .eq("id", worker_id)
        .single();

      if (workerErr || !worker) throw new Error("Worker not found");

      payoutAmount = Number(amount);
      if (!payoutAmount || isNaN(payoutAmount) || payoutAmount <= 0) {
        throw new Error("Invalid disbursement amount");
      }

      phoneStr = String(phone || worker.mpesa_number || worker.phone).replace(/\D/g, "");
    } else {
      // 1b. Fetch Loan & Customer Details
      const { data: loan, error: loanErr } = await supabaseClient
        .from("loans")
        .select(`id, amount, status, customer_id, customers(status, phone, risk)`)
        .eq("id", loan_id)
        .single();

      if (loanErr || !loan) throw new Error("Loan not found");
      if (loan.status !== "Approved")
        throw new Error("Loan must be Approved to disburse");
      if (loan.customers.status === "Blacklisted")
        throw new Error("Customer is blacklisted");

      payoutAmount = loan.amount;
      customerId = loan.customer_id;
      phoneStr = String(loan.customers.phone).replace(/\D/g, "");
    }

    // Process Phone Number (Kenyan Format 2547XXXXXXXX)
    if (phoneStr.startsWith("0")) phoneStr = "254" + phoneStr.substring(1);
    if (phoneStr.startsWith("7") || phoneStr.startsWith("1"))
      phoneStr = "254" + phoneStr;
    if (!phoneStr.startsWith("254") || phoneStr.length !== 12)
      throw new Error("Invalid Kenyan phone number format");

    if (!type || type !== "salary") {
      // Check for existing pending/completed disbursement to prevent doubles
      const { data: existingDisb } = await supabaseClient
        .from("b2c_disbursements")
        .select("id")
        .eq("loan_id", loan_id)
        .in("status", ["pending", "completed"])
        .maybeSingle();

      if (existingDisb)
        throw new Error(
          "Disbursement already initiated or completed for this loan",
        );
    }

    // 2. Daraja Token Generation
    const consumerKey = Deno.env.get("MPESA_CONSUMER_KEY");
    const consumerSecret = Deno.env.get("MPESA_CONSUMER_SECRET");
    const credentials = btoa(`${consumerKey}:${consumerSecret}`);

    const mpesaEnv =
      Deno.env.get("MPESA_ENVIRONMENT") === "production"
        ? "api.safaricom.co.ke"
        : "sandbox.safaricom.co.ke";

    const tokenRes = await fetch(
      `https://${mpesaEnv}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: { Authorization: `Basic ${credentials}` },
      },
    );
    const tokenData = await tokenRes.json();
    const darajaToken = tokenData.access_token;

    // 3. Initiate B2C
    const shortcode = Deno.env.get("MPESA_B2C_SHORTCODE") || Deno.env.get("MPESA_SHORTCODE");
    const initiator = Deno.env.get("MPESA_B2C_INITIATOR_NAME") || Deno.env.get("MPESA_INITIATOR_NAME");
    const cert = Deno.env.get("MPESA_B2C_SECURITY_CREDENTIAL") || Deno.env.get("MPESA_SECURITY_CREDENTIAL");
    const callbackUrl = Deno.env.get("MPESA_B2C_CALLBACK_URL") || Deno.env.get("MPESA_C2B_CALLBACK_URL");

    if (!shortcode || !initiator || !cert) {
      throw new Error(`Missing M-Pesa configuration: ${!shortcode ? 'Shortcode ' : ''}${!initiator ? 'Initiator ' : ''}${!cert ? 'SecurityCredential' : ''}`);
    }

    const originatorConvId = `LMS-${type === "salary" ? "SAL-" + worker_id : loan_id}-${Date.now()}`.substring(0, 32);

    const b2cPayload = {
      OriginatorConversationID: originatorConvId,
      InitiatorName: initiator,
      SecurityCredential: cert,
      CommandID: "BusinessPayment",
      Amount: payoutAmount,
      PartyA: shortcode,
      PartyB: phoneStr,
      Remarks: type === "salary" ? `Salary payout for worker ${worker_id}` : `Loan Disbursement ${loan_id}`,
      QueueTimeOutURL: callbackUrl,
      ResultURL: callbackUrl,
      Occasion: type === "salary" ? `LMS-SAL-${worker_id}` : `LMS-${loan_id}`,
    };

    // 3b. Log pre-flight (without sensitive credentials)
    await supabaseClient.from("raw_mpesa_logs").insert({
      source: "mpesa-b2c-preflight",
      payload: {
        loan_id: loan_id || null,
        worker_id: worker_id || null,
        amount: payoutAmount,
        phone: phoneStr,
        shortcode,
        initiator,
        command_id: b2cPayload.CommandID,
        originator_id: b2cPayload.OriginatorConversationID
      }
    });

    const b2cRes = await fetch(
      `https://${mpesaEnv}/mpesa/b2c/v3/paymentrequest`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${darajaToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(b2cPayload),
      },
    );

    const b2cData = await b2cRes.json();

    if (b2cData.ResponseCode !== "0") {
      const errorMsg = b2cData.errorMessage || b2cData.ResponseDescription || 'Safaricom B2C Error';
      
      if (type === "salary" || worker_id) {
        // Log worker payout failure to salary_payments
        await supabaseClient.from("salary_payments").insert({
          worker_id: worker_id,
          amount: payoutAmount,
          month: new Date().toISOString().slice(0, 7),
          status: "Failed",
          recipient_phone: phoneStr,
          remarks: `B2C Payout Failed: ${errorMsg}`,
          mpesa_receipt: b2cPayload.OriginatorConversationID,
          created_by: userId
        });
      } else {
        // Record the failure so it shows in the UI history
        await supabaseClient.from("b2c_disbursements").insert({
          originator_conversation_id: b2cPayload.OriginatorConversationID,
          amount: payoutAmount,
          phone_number: phoneStr,
          customer_id: customerId,
          loan_id: loan_id,
          status: "failed",
          result_desc: errorMsg,
          initiated_by: userId,
        });
      }

      throw new Error(`Safaricom Error: ${errorMsg}`);
    }

    if (type === "salary" || worker_id) {
      // 4a. Record pending worker salary payment
      const { error: insertErr } = await supabaseClient.from("salary_payments").insert({
        worker_id: worker_id,
        amount: payoutAmount,
        month: new Date().toISOString().slice(0, 7),
        status: "Pending",
        recipient_phone: phoneStr,
        remarks: `B2C Payout Initiated. Pending callback.`,
        mpesa_receipt: b2cData.ConversationID,
        created_by: userId
      });
      if (insertErr) throw insertErr;
    } else {
      // 4b. Record pending loan B2C disbursement
      const { error: disbInsertErr } = await supabaseClient.from("b2c_disbursements").insert({
        conversation_id: b2cData.ConversationID,
        originator_conversation_id: b2cData.OriginatorConversationID,
        amount: payoutAmount,
        phone_number: phoneStr,
        customer_id: customerId,
        loan_id: loan_id,
        status: "pending",
        initiated_by: userId,
      });

      if (disbInsertErr) throw disbInsertErr;

      // 5. Update Loan Status Immediately to prevent UI lag and double-click risk
      await supabaseClient
        .from("loans")
        .update({
          status: "Active",
          disbursed: new Date().toISOString(),
          mpesa: b2cData.ConversationID, // Placeholder until callback
          phone: phoneStr
        })
        .eq("id", loan_id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Disbursement queued successfully",
        conversation_id: b2cData.ConversationID,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
