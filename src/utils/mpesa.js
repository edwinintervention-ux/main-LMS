import { supabase, DEMO_MODE } from '@/config/supabaseClient';
import { getSecConfig } from '@/lms-common';

/**
 * mpesa.js — Frontend Gateway for Daraja Supabase Edge Functions
 * All calls go directly to Supabase Edge Functions.
 * The old Express server (localhost:3001) has been retired.
 */

const handleInvokeError = async (error) => {
  if (error && error.context) {
    try {
      // Clones the response if it was already read, but context is a fresh Response here
      const body = await error.context.json();
      if (body && body.error) return new Error(body.error);
    } catch (_) {
      try {
        const txt = await error.context.text();
        if (txt) return new Error(txt);
      } catch (__) {}
    }
  }
  return error;
};

/**
 * initiateStkPush
 * Triggers an M-Pesa STK Push via the mpesa-stk-push Edge Function.
 */
export async function initiateStkPush({ amount, phone_number, customer_id, description }) {
  try {
    const { data, error } = await supabase.functions.invoke('mpesa-stk-push', {
      body: { phone_number, amount, customer_id, description }
    });

    if (error) throw await handleInvokeError(error);
    if (data?.error) throw new Error(data.error);
    return { success: true, ...data };
  } catch (err) {
    console.error('[M-Pesa] STK Push failed:', err.message);
    throw err;
  }
}

/**
 * initiateB2cDisbursement
 * Triggers an M-Pesa B2C disbursement via the mpesa-b2c-disburse Edge Function.
 */
export async function initiateB2cDisbursement(loan_id) {
  try {
    const cfg = getSecConfig();
    if (!cfg.mpesaInitiator && !DEMO_MODE) {
       throw new Error('M-Pesa API Guard: Initiator Name is NOT configured in Security Settings. Operation blocked to prevent Safaricom lockout.');
    }

    const { data, error } = await supabase.functions.invoke('mpesa-b2c-disburse', {
      body: { loan_id }
    });

    if (error) throw await handleInvokeError(error);
    if (data?.error) throw new Error(data.error);
    return { success: true, ...data };
  } catch (err) {
    console.error('[M-Pesa] B2C Disbursement failed:', err.message);
    throw err;
  }
}

/**
 * initiateWorkerPayout
 * Triggers a salary B2C payout for a worker via the mpesa-b2c-disburse Edge Function.
 */
export async function initiateWorkerPayout({ worker_id, amount, phone }) {
  try {
    const cfg = getSecConfig();
    if (!cfg.mpesaInitiator && !DEMO_MODE) {
       throw new Error('M-Pesa API Guard: Initiator Name is not configured in Security Settings. Payout blocked to prevent lockout.');
    }

    const { data, error } = await supabase.functions.invoke('mpesa-b2c-disburse', {
      body: { worker_id, amount, phone, type: 'salary' }
    });

    if (error) throw await handleInvokeError(error);
    if (data?.error) throw new Error(data.error);
    return { success: true, ...data };
  } catch (err) {
    console.error('[M-Pesa] Worker payout failed:', err.message);
    throw err;
  }
}

/**
 * checkAccountBalance
 * Triggers the Daraja Account Balance API.
 * The result is sent asynchronously to the mpesa-balance-callback.
 */
export async function checkAccountBalance() {
  try {
    const cfg = getSecConfig();
    if (!cfg.mpesaInitiator && !DEMO_MODE) {
       throw new Error('M-Pesa API Guard: Initiator Name is not configured in Security Settings. Operation blocked to prevent lockout.');
    }

    const { data, error } = await supabase.functions.invoke('trigger-account-balance');

    if (error) throw await handleInvokeError(error);
    if (data?.error) throw new Error(data.error);
    return { success: true, ...data };
  } catch (err) {
    console.error('[M-Pesa] Balance check failed:', err.message);
    throw err;
  }
}

