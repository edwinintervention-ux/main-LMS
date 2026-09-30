-- ================================================================
-- MIGRATION: Fix false "missed payment" SMS for daily loans
-- Problem: queue_daily_reminders fires a "fallen behind" SMS
--          when days_since_pay = 3, even if the customer has
--          already paid enough to cover those 3 days' worth of
--          installments. This leads to customers who are up-to-date
--          receiving incorrect overdue reminders.
--
-- Fix: Before queueing the SMS, compare total_paid against the
--      expected cumulative payment (daily_installment * days_elapsed).
--      Only fire the reminder if the customer is ACTUALLY behind.
-- ================================================================

CREATE OR REPLACE FUNCTION public.queue_daily_reminders()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_loan RECORD;
    v_message TEXT;
    v_send_at TIMESTAMPTZ;
    v_days_since_pay INT;
    v_total_balance NUMERIC;
    v_base_total NUMERIC;
    v_total_paid NUMERIC;
    v_days_elapsed INT;
    v_daily_installment NUMERIC;
    v_expected_paid NUMERIC;
BEGIN
    v_send_at := ((CURRENT_DATE AT TIME ZONE 'Africa/Nairobi')::DATE + TIME '07:00:00') AT TIME ZONE 'Africa/Nairobi';

    FOR v_loan IN
        SELECT
            l.id as loan_id,
            l.amount as amount,
            l.balance as balance,
            l.disbursed as disbursed,
            l.term as term,
            COALESCE(l.penalty_accrued, 0) as penalty_accrued,
            COALESCE(l.interest_discount, 0) as interest_discount,
            c.id::TEXT as customer_id,
            c.name as customer_name,
            c.phone as phone,
            COALESCE(c.account_number, c.id_no, c.id_number, l.id) as acct_ref,
            COALESCE(
                (SELECT ((now() AT TIME ZONE 'Africa/Nairobi')::DATE - MAX(date::DATE))
                 FROM payments p
                 WHERE p.loan_id = l.id AND p.status = 'Allocated'),
                ((now() AT TIME ZONE 'Africa/Nairobi')::DATE - l.disbursed::DATE)
            ) as days_since_pay
        FROM loans l
        JOIN customers c ON l.customer_id = c.id
        WHERE l.status IN ('Active', 'Overdue')
          AND l.repayment_type = 'Daily'
          AND l.balance > 0
    LOOP
        v_days_since_pay := v_loan.days_since_pay;

        -- Compute total balance using penalty_accrued
        v_base_total := v_loan.amount * (1 + 0.3 * (1 - v_loan.interest_discount / 100.0));
        SELECT COALESCE(SUM(p.amount), 0) INTO v_total_paid
          FROM payments p
         WHERE p.loan_id = v_loan.loan_id AND p.status = 'Allocated';
        v_total_balance := GREATEST(0, v_base_total + v_loan.penalty_accrued - v_total_paid);

        IF v_days_since_pay = 3 THEN
            -- ── NEW GUARD: check if customer is actually behind ──────────
            -- Calculate how many days have elapsed since disbursement
            v_days_elapsed := (now() AT TIME ZONE 'Africa/Nairobi')::DATE - v_loan.disbursed::DATE;

            -- Daily installment = base_total / loan term (days)
            -- Fall back to 30 days if term is null/zero
            v_daily_installment := v_base_total / GREATEST(COALESCE(v_loan.term, 30), 1);

            -- Expected cumulative paid by today
            v_expected_paid := v_daily_installment * v_days_elapsed;

            -- Only send the reminder if the customer has paid LESS than expected
            IF v_total_paid >= v_expected_paid THEN
                CONTINUE; -- Customer is on track — skip this reminder
            END IF;
            -- ─────────────────────────────────────────────────────────────

            v_message := 'Dear ' || split_part(v_loan.customer_name, ' ', 1) ||
                         ', you have fallen behind on your daily payments. Your outstanding balance is KES ' ||
                         to_char(v_total_balance, 'FM999,999,999') ||
                         '. Please pay via Paybill 4166191, Account: ' || v_loan.acct_ref || '. Thank you.';

            IF NOT EXISTS (
                SELECT 1 FROM public.queued_sms
                WHERE loan_id = v_loan.loan_id
                  AND status = 'queued'
                  AND send_at::DATE = v_send_at::DATE
            ) THEN
                INSERT INTO public.queued_sms (customer_id, loan_id, message, send_at)
                VALUES (v_loan.customer_id, v_loan.loan_id, v_message, v_send_at);
            END IF;
        END IF;
    END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.queue_daily_reminders() TO authenticated, service_role;
