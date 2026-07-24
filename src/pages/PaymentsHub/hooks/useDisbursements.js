import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/config/supabaseClient';

export function useDisbursements() {
  const [loading, setLoading] = useState(false);
  const [waitingForCallback, setWaitingForCallback] = useState(false);
  const [status, setStatus] = useState(null); // 'Pending' | 'Completed' | 'Failed'
  const [failureReason, setFailureReason] = useState(null);
  const [error, setError] = useState(null);
  const [activeLoanId, setActiveLoanId] = useState(null);
  const [requestId, setRequestId] = useState(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const { session } = useAuth();

  const fetchStatus = useCallback(async (isAutoPoll = false) => {
    if (!activeLoanId) return;
    try {
      let query = supabase.from('b2c_disbursements').select('*').eq('loan_id', activeLoanId);
      
      if (requestId) {
        query = query.eq('conversation_id', requestId);
      } else {
        query = query.eq('status', 'completed');
      }

      const { data, error: sbErr } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle();

      if (sbErr) throw sbErr;
      if (data) {
        setStatus(data.status);
        if (data.status === 'completed') {
          setWaitingForCallback(false);
          setIsSuccess(true);
          setFailureReason(null);
          setLoading(false);
        } else if (data.status === 'failed') {
          setWaitingForCallback(false);
          setIsSuccess(false);
          setFailureReason(data.result_desc || data.error_message || 'B2C Disbursement failed.');
          setLoading(false);
        }
      } else if (isAutoPoll && !requestId) {
          // If we've been polling for a while and still no record, we might have a sync issue
          console.warn('[Disbursement] No record found during poll for loan:', activeLoanId);
      }
    } catch (err) {
      console.error('[Disbursement Poll Error]', err.message);
    }
  }, [activeLoanId, requestId]);

  useEffect(() => {
    if (!waitingForCallback || !activeLoanId) return;
    
    // Safety Timeout: If no callback in 90 seconds, stop waiting
    const timeout = setTimeout(() => {
      if (waitingForCallback) {
        console.warn('[Disbursement] Polling timeout reached (90s)');
        setWaitingForCallback(false);
        setFailureReason('Disbursement is taking longer than expected. Please check the Audit Ledger in a few minutes to verify status.');
        setStatus('stuck');
      }
    }, 90000);

    const interval = setInterval(() => fetchStatus(true), 4000);
    return () => {
        clearInterval(interval);
        clearTimeout(timeout);
    };
  }, [waitingForCallback, activeLoanId, fetchStatus]);

  const disburse = useCallback(async (loanId) => {
    if (!session?.access_token) {
      setError('You are not logged in or your session has expired.');
      return;
    }
    
    setLoading(true);
    setError(null);
    setFailureReason(null);
    setIsSuccess(false);
    setWaitingForCallback(false);
    setStatus('pending');
    setActiveLoanId(loanId);
    setRequestId(null);

    try {
      // SECURITY (VULN-01): No phone is sent in the request body.
      // The server resolves the recipient phone from the verified
      // customer record. Sending a phone here was an attack vector.
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      const response = await fetch(`${supabaseUrl}/functions/v1/mpesa-b2c-disburse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'X-Idempotency-Key': `disburse-${loanId}-${Date.now()}`
        },
        body: JSON.stringify({ loan_id: loanId })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Disbursement failed');
      
      setRequestId(data.conversation_id);
      setWaitingForCallback(true);
      return data;
    } catch (err) {
      setError(err.message);
      setLoading(false);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [session]);

  const reset = useCallback(() => {
    setStatus(null);
    setWaitingForCallback(false);
    setFailureReason(null);
    setError(null);
    setIsSuccess(false);
    setActiveLoanId(null);
    setRequestId(null);
  }, []);

  return { disburse, loading, waitingForCallback, status, isSuccess, failureReason, error, reset };
}
