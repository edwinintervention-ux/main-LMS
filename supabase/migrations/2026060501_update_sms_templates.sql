-- ================================================================
-- MIGRATION: Update SMS templates for Loan Reminders
-- Goal: Improve the wording of Daily/Weekly/Biweekly/Monthly
--       SMS reminders to sound more natural and less repetitive.
--       Also adds a 1-day overdue reminder.
-- ================================================================

-- ── queue_daily_reminders (Daily loans) ──────────────────────
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
BEGIN
    v_send_at := ((CURRENT_DATE AT TIME ZONE 'Africa/Nairobi')::DATE + TIME '07:00:00') AT TIME ZONE 'Africa/Nairobi';

    FOR v_loan IN
        SELECT
            l.id as loan_id,
            l.amount as amount,
            l.balance as balance,
            l.disbursed as disbursed,
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

        v_base_total := v_loan.amount * (1 + 0.3 * (1 - v_loan.interest_discount / 100.0));
        SELECT COALESCE(SUM(p.amount), 0) INTO v_total_paid
          FROM payments p
         WHERE p.loan_id = v_loan.loan_id AND p.status = 'Allocated';
        v_total_balance := GREATEST(0, v_base_total + v_loan.penalty_accrued - v_total_paid);

        IF v_days_since_pay = 3 THEN
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

-- ── queue_scheduled_reminders (Weekly / Biweekly / Monthly) ──
CREATE OR REPLACE FUNCTION public.queue_scheduled_reminders()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_loan RECORD;
    v_message TEXT;
    v_message_overdue TEXT;
    v_send_at TIMESTAMPTZ;
    v_overdue_send_at TIMESTAMPTZ;
    v_base_total NUMERIC;
    v_total_paid NUMERIC;
    v_total_balance NUMERIC;
    v_amount_to_pay NUMERIC;
    v_num_slots INT;
    v_today DATE;
    v_due_days INT[];
    v_d INT;
    v_due_date DATE;
BEGIN
    v_today := (now() AT TIME ZONE 'Africa/Nairobi')::DATE;

    DELETE FROM public.queued_sms
    WHERE status = 'queued'
      AND updated_at - created_at < INTERVAL '1 second'
      AND loan_id IN (
          SELECT id FROM loans
          WHERE repayment_type IN ('Weekly', 'Biweekly', 'Monthly')
      );

    FOR v_loan IN
        SELECT
            l.id as loan_id,
            l.amount as amount,
            l.balance as balance,
            l.disbursed as disbursed,
            l.repayment_type as repayment_type,
            COALESCE(l.penalty_accrued, 0) as penalty_accrued,
            COALESCE(l.interest_discount, 0) as interest_discount,
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

        v_base_total := v_loan.amount * (1 + 0.3 * (1 - v_loan.interest_discount / 100.0));
        SELECT COALESCE(SUM(p.amount), 0) INTO v_total_paid
          FROM payments p
         WHERE p.loan_id = v_loan.loan_id AND p.status = 'Allocated';
        v_total_balance := GREATEST(0, v_base_total + v_loan.penalty_accrued - v_total_paid);

        FOREACH v_d IN ARRAY v_due_days
        LOOP
            v_due_date := v_loan.disbursed::DATE + v_d;

            -- Check if due date is today or in the future
            IF v_due_date >= v_today THEN
                v_amount_to_pay := CEIL(v_base_total / v_num_slots);
                IF v_amount_to_pay > v_total_balance THEN
                    v_amount_to_pay := v_total_balance;
                END IF;

                v_send_at := (v_due_date + TIME '07:00:00') AT TIME ZONE 'Africa/Nairobi';

                -- Standard Due Date Reminder
                IF v_loan.repayment_type = 'Monthly' THEN
                    v_message := 'Dear ' || split_part(v_loan.customer_name, ' ', 1) ||
                                 ', your loan is due today. Please clear your outstanding balance of KES ' || to_char(v_total_balance, 'FM999,999,999') ||
                                 ' via Paybill 4166191, Account: ' || v_loan.acct_ref || '. Thank you.';
                ELSE
                    v_message := 'Dear ' || split_part(v_loan.customer_name, ' ', 1) ||
                                 ', your ' || v_loan.repayment_type ||
                                 ' payment of KES ' || to_char(v_amount_to_pay, 'FM999,999,999') ||
                                 ' is due today. Your total outstanding balance is KES ' || to_char(v_total_balance, 'FM999,999,999') ||
                                 '. Pay via Paybill 4166191, Account: ' || v_loan.acct_ref || '. Thank you.';
                END IF;

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

            -- Check if 1 day overdue (due date was yesterday or later)
            IF v_due_date + 1 >= v_today THEN
                v_amount_to_pay := CEIL(v_base_total / v_num_slots);
                IF v_amount_to_pay > v_total_balance THEN
                    v_amount_to_pay := v_total_balance;
                END IF;

                v_overdue_send_at := (v_due_date + 1 + TIME '07:00:00') AT TIME ZONE 'Africa/Nairobi';

                -- 1 Day Overdue Reminder
                IF v_loan.repayment_type = 'Monthly' THEN
                    v_message_overdue := 'Dear ' || split_part(v_loan.customer_name, ' ', 1) ||
                                 ', your loan is now 1 day overdue. Please clear your outstanding balance of KES ' || to_char(v_total_balance, 'FM999,999,999') ||
                                 ' via Paybill 4166191, Account: ' || v_loan.acct_ref || ' to avoid further penalties. Thank you.';
                ELSE
                    v_message_overdue := 'Dear ' || split_part(v_loan.customer_name, ' ', 1) ||
                                 ', your ' || v_loan.repayment_type ||
                                 ' payment is 1 day overdue. Please pay KES ' || to_char(v_amount_to_pay, 'FM999,999,999') ||
                                 '. Total outstanding balance is KES ' || to_char(v_total_balance, 'FM999,999,999') ||
                                 '. Pay via Paybill 4166191, Account: ' || v_loan.acct_ref || ' to avoid penalties. Thank you.';
                END IF;

                IF NOT EXISTS (
                    SELECT 1 FROM public.queued_sms
                    WHERE loan_id = v_loan.loan_id
                      AND status IN ('queued', 'sent', 'cancelled')
                      AND send_at::DATE = v_overdue_send_at::DATE
                ) THEN
                    INSERT INTO public.queued_sms (customer_id, loan_id, message, send_at)
                    VALUES (v_loan.customer_id, v_loan.loan_id, v_message_overdue, v_overdue_send_at);
                END IF;
            END IF;

        END LOOP;
    END LOOP;
END;
$$;
