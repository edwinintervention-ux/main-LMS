import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Fast and high-quota models in priority order
const MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.5-flash-lite',
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { message, history = [], customerContext } = await req.json();

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({
        reply: "I am currently in setup mode. Please contact the office at info@adequatecapital.co.ke."
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const c = customerContext || {};

    // Build rich per-loan breakdown
    const loanLines = c.loanDetails && c.loanDetails.length > 0
      ? c.loanDetails.map((l: any) =>
          `  • Loan Ref ${l.ref}: Principal KES ${Number(l.principal || 0).toLocaleString()}, ` +
          `Interest KES ${Number(l.interest || 0).toLocaleString()}, ` +
          `Penalty KES ${Number(l.penalty || 0).toLocaleString()}, ` +
          `Total Due KES ${Number(l.totalDue || 0).toLocaleString()}, ` +
          `Total Paid KES ${Number(l.totalPaid || 0).toLocaleString()}, ` +
          `Status: ${l.status}, Disbursed: ${l.disbursed}, Due: ${l.dueDate}`
        ).join('\n')
      : '  No active loans.';

    const paymentLines = c.payments && c.payments.length > 0
      ? c.payments.map((p: any) =>
          `  • KES ${Number(p.amount || 0).toLocaleString()} on ${p.date} via ${p.method || 'M-Pesa'}`
        ).join('\n')
      : '  No recorded payments.';

    const overdueNote = c.daysLeft !== null && c.daysLeft !== undefined
      ? c.daysLeft < 0
        ? `⚠️ OVERDUE by ${Math.abs(c.daysLeft)} days. Penalty of 1.2% per day is accruing on the outstanding balance.`
        : c.daysLeft === 0
        ? `⚠️ Payment is DUE TODAY.`
        : `✅ ${c.daysLeft} days remaining until due date.`
      : 'No active balance.';

    const systemInstruction = `
You are "Adequate Assistant", the official AI customer support agent for Adequate Capital Ltd — a licensed microfinance lender in Kenya.
You are fast, accurate, professional, and helpful.
Detect the language (English or Swahili) and reply in the SAME language automatically.
Be concise, clear, and direct.

════════════════════════════════════
CUSTOMER ACCOUNT — ${c.name || 'Valued Customer'}
════════════════════════════════════
Name: ${c.name || 'N/A'}
Phone: ${c.phone || 'N/A'}
National ID / M-Pesa Account No: ${c.account || 'N/A'}
Total Outstanding Balance: KES ${Number(c.totalOwed || 0).toLocaleString()}
Next Payment Due Date: ${c.nextDueDate || 'N/A'}
Status: ${overdueNote}

LOAN BREAKDOWN:
${loanLines}

RECENT PAYMENTS (newest first):
${paymentLines}

HOW TO PAY VIA M-PESA:
  • Go to M-Pesa → Lipa na M-Pesa → Pay Bill
  • Business Number (Paybill): 4166191
  • Account Number: ${c.account} (Customer's National ID number)
  • Amount: Any amount (minimum KES 1, up to total due KES ${Number(c.totalOwed || 0).toLocaleString()})
  • Partial payments are immediately credited to reduce the balance.

════════════════════════════════════
ADEQUATE CAPITAL — PRODUCTS & POLICIES
════════════════════════════════════

1. LOAN PRODUCTS:
- Short-term Individual Microloans & Small Business Working Capital Loans.
- Loan Term: 30 days from disbursement date.
- Disbursement: Sent directly to the borrower's M-Pesa number within 24 hours of approval.
- Security: No physical collateral required for standard loans; approved based on evaluation and repayment history.

2. LOAN LIMITS (MINIMUM & MAXIMUM):
- First-time borrowers typically qualify for amounts starting from KES 3,000 to KES 20,000.
- Repeat borrowers with a consistent, on-time repayment history can access higher limits (up to KES 50,000+ for growing businesses).
- For custom business financing or higher credit limits, customers can contact our credit officers at info@adequatecapital.co.ke.

3. INTEREST RATE:
- Standard Rate: 30% flat on the loan principal for the 30-day loan term.
- Example: Borrow KES 10,000 → Repay KES 13,000 (Principal: KES 10,000 + Interest: KES 3,000).
- Special interest rate discounts can be awarded by management based on loyalty and track record.

4. REGISTRATION FEE:
- One-time fee of KES 500 for NEW customers only, paid before first loan disbursement.
- Pay via M-Pesa Paybill 4166191, Account: National ID number.
- Repeat customers (who have already taken a loan with us) are 100% EXEMPT from registration fees.

5. LATE PAYMENTS & OVERDUE PENALTIES:
- Daily Penalty: 1.2% per day calculated on the outstanding balance if unpaid past day 30.
- Example: KES 10,000 balance overdue by 1 day accrues KES 120 penalty.
- Maximum Penalty Cap: Penalty accrues up to day 60 overdue, after which the balance is FROZEN (no additional penalty added).
- Customers facing difficulties should contact the office early to discuss options.

6. CONTACT & SUPPORT:
- Email: info@adequatecapital.co.ke
- Website: adequatecapital.co.ke
- Office Hours: Monday – Saturday, 8:00 AM – 5:00 PM

════════════════════════════════════
STRICT RULES
════════════════════════════════════
1. NEVER reveal any other customer's private data.
2. Use exact figures from CUSTOMER ACCOUNT section for balance and due dates.
3. For payment queries, always give Paybill 4166191 and Account: ${c.account}.
4. If asked about interest: "Our standard interest rate is 30% flat on the principal for the 30-day term."
5. If asked about registration fee: "The registration fee is KES 500, paid only once by new customers. Repeat customers are exempt."
6. If asked about loan limits: State that standard loans range from KES 3,000 to KES 50,000+ depending on repayment track record and business assessment.
    `.trim();

    // Sanitize and build clean alternating multiturn contents
    const rawHistory = Array.isArray(history) ? history : [];
    const sanitizedContents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    for (const msg of rawHistory) {
      if (!msg || !msg.content || typeof msg.content !== 'string') continue;
      const text = msg.content.trim();
      // Skip connection error messages from history
      if (text.includes("having trouble connecting") || text.includes("jaribu tena")) continue;

      const role = (msg.role === 'assistant' || msg.role === 'model') ? 'model' : 'user';

      // Ensure no duplicate consecutive roles
      if (sanitizedContents.length > 0 && sanitizedContents[sanitizedContents.length - 1].role === role) {
        // Append text to previous part rather than creating invalid consecutive role turn
        sanitizedContents[sanitizedContents.length - 1].parts[0].text += `\n${text}`;
      } else {
        sanitizedContents.push({ role, parts: [{ text }] });
      }
    }

    // Ensure contents starts with 'user'
    while (sanitizedContents.length > 0 && sanitizedContents[0].role === 'model') {
      sanitizedContents.shift();
    }

    // Add current user message
    if (sanitizedContents.length > 0 && sanitizedContents[sanitizedContents.length - 1].role === 'user') {
      sanitizedContents[sanitizedContents.length - 1].parts[0].text += `\n${message}`;
    } else {
      sanitizedContents.push({ role: 'user', parts: [{ text: message }] });
    }

    let replyText = '';
    let lastError = null;

    // Try models in order with automatic fallback
    for (const model of MODELS) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              system_instruction: { parts: [{ text: systemInstruction }] },
              contents: sanitizedContents,
              generationConfig: {
                temperature: 0.2,
                topP: 0.9,
              }
            })
          }
        );
        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (replyText) {
            break; // Success!
          }
        } else {
          const errBody = await response.text();
          console.warn(`Model ${model} failed (${response.status}):`, errBody);
          lastError = new Error(`Model ${model} returned ${response.status}`);
        }
      } catch (err) {
        console.warn(`Model ${model} error:`, err.message);
        lastError = err;
      }
    }

    if (!replyText) {
      replyText = "Hello! For immediate assistance with your account or loan inquiries, please contact our team at info@adequatecapital.co.ke or call our customer line.";
    }

    return new Response(JSON.stringify({ reply: replyText }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in portal-chat:', error);
    return new Response(JSON.stringify({ 
      reply: "I am having trouble connecting at the moment. Please reach out to info@adequatecapital.co.ke."
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200, // Return 200 with polite fallback instead of 500 crash
    });
  }
});
