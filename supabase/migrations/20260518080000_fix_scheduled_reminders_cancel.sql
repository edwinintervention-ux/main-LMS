-- ================================================================
-- MIGRATION: Fix Scheduled Reminders Cancel and Re-queueing Logic
-- Goal: Ensure cancelled or sent reminders are not automatically 
--       re-created by duplicate checks.
-- ================================================================

CREATE OR REPLACE FUNCTION public.queue_scheduled_reminders()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_loan RECORD;
    v_message TEXT;
    v_send_at TIMESTAMPTZ;
    v_due_date DATE;
    v_od INT;
    v_capped_od INT;
    v_penalty INT;
    v_base_total NUMERIC;
    v_total_balance NUMERIC;
    v_amount_to_pay NUMERIC;
    v_num_slots INT;
    v_today DATE;
    v_due_days INT[];
    v_d INT;
    v_loan_due_date DATE;
BEGIN
    -- Get today's date in EAT for all calculations
    v_today := (now() AT TIME ZONE 'Africa/Nairobi')::DATE;

    -- Step 1: Clear existing unedited queued messages for weekly/biweekly/monthly loans
    DELETE FROM public.queued_sms
    WHERE status = 'queued'
      AND updated_at - created_at < INTERVAL '1 second'
      AND loan_id IN (
          SELECT id FROM loans 
          WHERE repayment_type IN ('Weekly', 'Biweekly', 'Monthly')
      );

    -- Step 2: Loop through all active weekly/biweekly/monthly loans
    FOR v_loan IN
        SELECT
            l.id as loan_id,
            l.amount as amount,
            l.balance as balance,
            l.disbursed as disbursed,
            l.repayment_type as repayment_type,
            c.id::TEXT as customer_id,
            c.name as customer_name,
            c.phone as phone,
            COALESCE(c.account_number, c.id_no, c.id_number, l.id) as acct_ref
        FROM loans l
        JOIN customers c ON l.customer_id = c.id
        WHERE l.status IN ('Active', 'Overdue')
          AND l.repayment_type IN ('Weekly', 'Biweekly', 'Monthly')
          AND l.balance > 0
          AND l.disbursed IS NOT NULL
    LOOP
        -- Define due day intervals based on repayment type
        IF v_loan.repayment_type = 'Weekly' THEN
            v_due_days := ARRAY[7, 14, 21, 28];
            v_num_slots := 4;
        ELSIF v_loan.repayment_type = 'Biweekly' THEN
            v_due_days := ARRAY[14, 28];
            v_num_slots := 2;
        ELSIF v_loan.repayment_type = 'Monthly' THEN
            v_due_days := ARRAY[30];
            v_num_slots := 1;
        ELSE
            CONTINUE;
        END IF;

        -- Loop through the due days
        FOREACH v_d IN ARRAY v_due_days
        LOOP
            -- Calculate target due date for this installment
            v_due_date := v_loan.disbursed::DATE + v_d;

            -- We only queue if the target due date is today or in the future
            IF v_due_date >= v_today THEN
                -- Calculate base total (with 30% interest)
                v_base_total := v_loan.amount * 1.3;
                
                -- Calculate penalties if the overall loan due date (30 days from disbursement) is exceeded
                v_loan_due_date := (v_loan.disbursed::DATE + INTERVAL '30 days')::DATE;
                v_od := v_today - v_loan_due_date;
                IF v_od < 0 THEN v_od := 0; END IF;
                v_capped_od := LEAST(v_od, 60);
                v_penalty := ROUND(v_base_total * 0.012 * v_capped_od);
                v_total_balance := v_loan.balance + v_penalty;

                -- Calculate installment amount
                v_amount_to_pay := CEIL(v_base_total / v_num_slots);
                IF v_amount_to_pay > v_total_balance THEN
                    v_amount_to_pay := v_total_balance;
                END IF;

                -- Define scheduled send time at 7:00 AM EAT on the target due date
                v_send_at := (v_due_date + TIME '07:00:00') AT TIME ZONE 'Africa/Nairobi';

                -- Construct friendly dynamic message
                IF v_loan.repayment_type = 'Monthly' THEN
                    v_message := 'Dear ' || split_part(v_loan.customer_name, ' ', 1) || 
                                 ', your payment is due today. Please pay KES ' || to_char(v_amount_to_pay, 'FM999,999,999') || 
                                 '. Your total balance is KES ' || to_char(v_total_balance, 'FM999,999,999') || 
                                 '. Pay via Paybill 4166191, Account: ' || v_loan.acct_ref || '. Thank you.';
                ELSE
                    v_message := 'Dear ' || split_part(v_loan.customer_name, ' ', 1) || 
                                 ', your ' || v_loan.repayment_type || 
                                 ' partial payment is due today. Please pay KES ' || to_char(v_amount_to_pay, 'FM999,999,999') || 
                                 '. Your total balance is KES ' || to_char(v_total_balance, 'FM999,999,999') || 
                                 '. Pay via Paybill 4166191, Account: ' || v_loan.acct_ref || '. Thank you.';
                END IF;

                -- Prevent duplicates or re-queueing of sent/cancelled/existing queued messages
                IF NOT EXISTS (
                    SELECT 1 FROM public.queued_sms 
                    WHERE loan_id = v_loan.loan_id 
                      AND status IN ('queued', 'sent', 'cancelled') 
                      AND send_at::DATE = v_send_at::DATE
                ) THEN
                    INSERT INTO public.queued_sms (customer_id, loan_id, message, send_at)
                    VALUES (v_loan.customer_id, v_loan.loan_id, v_message, v_send_at);
                END IF;
            END IF;
        END LOOP;
    END LOOP;
END;
$$;

-- Explicit GRANTS as per security policy
GRANT EXECUTE ON FUNCTION public.queue_scheduled_reminders() TO authenticated;
GRANT EXECUTE ON FUNCTION public.queue_scheduled_reminders() TO service_role;
