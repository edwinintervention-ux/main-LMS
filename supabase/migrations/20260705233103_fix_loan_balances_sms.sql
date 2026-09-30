-- Fix apply_payment_to_loan to not deduct from legacy penalties column
CREATE OR REPLACE FUNCTION public.apply_payment_to_loan()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    p_amount     DECIMAL;
    l_penalties  DECIMAL;
    l_balance    DECIMAL;
    l_disbursed  DATE;
    calc_penalty DECIMAL;
    v_loan_id    TEXT;
BEGIN
    -- Determine if we should process
    IF (TG_OP = 'UPDATE') THEN
        IF (OLD.status = NEW.status OR NEW.status != 'Allocated' OR NEW.loan_id IS NULL) THEN
            RETURN NEW;
        END IF;
    ELSIF (TG_OP = 'INSERT') THEN
        -- Allow negative payments (transfers/adjustments) to fire the trigger
        IF (NEW.status != 'Allocated' OR NEW.loan_id IS NULL) THEN
            RETURN NEW;
        END IF;
    END IF;

    v_loan_id := NEW.loan_id;
    p_amount  := NEW.amount;

    -- A) Get current state (Lock row)
    SELECT penalties, balance, disbursed 
      INTO l_penalties, l_balance, l_disbursed
      FROM public.loans 
     WHERE id = v_loan_id FOR UPDATE;

    IF NOT FOUND THEN RETURN NEW; END IF;

    -- B) NO LONGER PAYING OFF LEGACY PENALTIES
    -- Legacy code used to deduct from l_penalties here, preventing balance from reducing.
    -- We now apply 100% of the payment to the core balance.

    -- C) APPLY FULL PAYMENT TO CORE BALANCE
    IF p_amount <> 0 THEN
        l_balance := GREATEST(l_balance - p_amount, 0);
    END IF;

    -- D) APPLY UPDATES TO LOAN
    UPDATE public.loans 
       SET balance   = l_balance,
           status    = CASE 
                         WHEN (l_balance <= 0) THEN 'Settled'::text 
                         WHEN (l_balance > 0 AND status = 'Settled') THEN 'Active'::text 
                         ELSE status 
                       END,
           settled_at = CASE WHEN (l_balance <= 0) THEN NOW() ELSE NULL END
     WHERE id = v_loan_id;

    RETURN NEW;
END;
$function$;

-- Fix process_daily_loan_updates to not add to legacy penalties column
CREATE OR REPLACE FUNCTION public.process_daily_loan_updates()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    affected_count INT;
BEGIN
    -- A) Update days overdue for Active/Overdue loans where expected completion is past
    UPDATE public.loans 
    SET days_overdue = EXTRACT(DAY FROM (NOW() - expected_completion_date))::INT
    WHERE status IN ('Active', 'Overdue') AND expected_completion_date < NOW();
    
    -- B) Mark loans as Overdue if days overdue > 0
    UPDATE public.loans 
    SET status = 'Overdue' 
    WHERE status = 'Active' AND days_overdue > 0;

    -- C) APPLY PENALTY REMOVED
    -- The new dynamic engine handles this accurately.
    affected_count := 0;

    -- D) Update Loan Schedules Status
    UPDATE public.loan_schedules
    SET status = 'overdue', days_overdue = EXTRACT(DAY FROM (NOW() - due_date))::INT
    WHERE status IN ('upcoming', 'due_today', 'partial') AND due_date < NOW()::DATE;

    UPDATE public.loan_schedules
    SET status = 'due_today'
    WHERE status = 'upcoming' AND due_date = NOW()::DATE;

    -- E) Restore credit limits for suspended customers who completed 1-month break without borrowing
    UPDATE public.customers c
    SET credit_limit = ROUND(suspended_baseline_limit * 0.5),
        limit_suspended = FALSE,
        suspended_baseline_limit = NULL,
        last_overdue_clear_date = NULL
    WHERE c.limit_suspended = TRUE
      AND c.last_overdue_clear_date <= NOW() - INTERVAL '30 days'
      AND NOT EXISTS (
          SELECT 1 FROM public.loans l
          WHERE l.customer_id = c.id
            AND l.created_at > c.last_overdue_clear_date
      );

    RETURN json_build_object(
        'success', true,
        'timestamp', NOW(),
        'penalties_applied_to', affected_count
    );
END;
$function$;

-- Fix queue_scheduled_reminders to properly handle 0 penalty_accrued
CREATE OR REPLACE FUNCTION public.queue_scheduled_reminders()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
      DECLARE
          v_loan RECORD;
          v_today DATE := (now() AT TIME ZONE 'Africa/Nairobi')::DATE;
          v_due_days INT[];
          v_d INT;
          v_due_date DATE;
          v_loan_due_date DATE;
          v_send_at TIMESTAMP WITH TIME ZONE;
          v_overdue_send_at TIMESTAMP WITH TIME ZONE;
          v_due_date_send_at TIMESTAMP WITH TIME ZONE;
          v_message TEXT;
          v_message_overdue TEXT;
          v_due_date_message TEXT;
          v_base_total NUMERIC;
          v_penalty NUMERIC;
          v_total_balance NUMERIC;
          v_amount_to_pay NUMERIC;
          v_num_slots INT;
          v_od INT;
          v_capped_od INT;
          v_customer_name TEXT;
          v_out_balance TEXT;
          v_payment_template TEXT := 'Paybill 4166191, Account: {{account_number}}';
          v_payment_details TEXT;
      BEGIN
          FOR v_loan IN
              SELECT l.id as loan_id, l.amount, l.balance, l.disbursed, l.repayment_type, l.status,
                     c.id::TEXT as customer_id,
                     c.name as customer_name,
                     COALESCE(c.account_number, c.id_no, c.id_number, l.id::TEXT) as acct_ref,
                     l.penalty_accrued as penalty_accrued,
                     COALESCE(l.penalty_waived, 0) as penalty_waived,
                     COALESCE(l.interest_discount, 0) as interest_discount
              FROM public.loans l
              JOIN public.customers c ON c.id = l.customer_id
              WHERE l.status IN ('Active', 'Overdue')
                AND l.balance > 0
                AND l.disbursed IS NOT NULL
          LOOP
              IF v_loan.repayment_type = 'Weekly' THEN
                  v_due_days := ARRAY[7, 14, 21, 28]::INT[];
                  v_num_slots := 4;
              ELSIF v_loan.repayment_type = 'Bi-weekly' OR v_loan.repayment_type = 'Biweekly' THEN
                  v_due_days := ARRAY[15, 30]::INT[];
                  v_num_slots := 2;
              ELSIF v_loan.repayment_type = 'Monthly' OR v_loan.repayment_type = 'Daily' THEN
                  v_due_days := ARRAY[]::INT[];
                  v_num_slots := 1;
              ELSE
                  CONTINUE;
              END IF;

              v_loan_due_date := (v_loan.disbursed::DATE + INTERVAL '30 days')::DATE;
              v_base_total := v_loan.amount * (1 + 0.3 * (1 - v_loan.interest_discount / 100.0));
              v_od := v_today - v_loan_due_date;
              IF v_od < 0 THEN v_od := 0; END IF;
              
              IF v_loan.penalty_accrued IS NOT NULL AND v_od > 0 THEN
                  v_total_balance := v_loan.balance + v_loan.penalty_accrued;
              ELSE
                  v_capped_od := LEAST(v_od, 60);
                  v_penalty := GREATEST(0, ROUND(v_base_total * 0.012 * v_capped_od) - v_loan.penalty_waived);
                  v_total_balance := v_loan.balance + v_penalty;
              END IF;

              v_customer_name := split_part(v_loan.customer_name, ' ', 1);
              v_out_balance := to_char(v_total_balance, 'FM999,999,999');
              v_payment_details := replace(v_payment_template, '{{account_number}}', v_loan.acct_ref);

              IF v_loan_due_date - 2 >= v_today THEN
                  v_due_date_send_at := (v_loan_due_date - 2 + TIME '07:00:00') AT TIME ZONE 'Africa/Nairobi';
                  v_due_date_message := 'Dear ' || v_customer_name || ', your loan will be due in 2 days. Your outstanding balance is KES ' || v_out_balance || '.' || CHR(10) || CHR(10) || 'Please make your payment using the details below:' || CHR(10) || CHR(10) || v_payment_details;
                  IF NOT EXISTS (
                      SELECT 1 FROM public.queued_sms
                      WHERE loan_id = v_loan.loan_id
                        AND status IN ('queued', 'sent', 'cancelled')
                        AND send_at::DATE = v_due_date_send_at::DATE
                        AND message = v_due_date_message
                  ) THEN
                      INSERT INTO public.queued_sms (customer_id, loan_id, message, send_at)
                      VALUES (v_loan.customer_id, v_loan.loan_id, v_due_date_message, v_due_date_send_at);
                  END IF;
              END IF;

              IF v_loan_due_date - 1 >= v_today THEN
                  v_due_date_send_at := (v_loan_due_date - 1 + TIME '07:00:00') AT TIME ZONE 'Africa/Nairobi';
                  v_due_date_message := 'Dear ' || v_customer_name || ', your loan is due tomorrow. Your outstanding balance is KES ' || v_out_balance || '.' || CHR(10) || CHR(10) || 'Please make your payment using the details below:' || CHR(10) || CHR(10) || v_payment_details;
                  IF NOT EXISTS (
                      SELECT 1 FROM public.queued_sms
                      WHERE loan_id = v_loan.loan_id
                        AND status IN ('queued', 'sent', 'cancelled')
                        AND send_at::DATE = v_due_date_send_at::DATE
                        AND message = v_due_date_message
                  ) THEN
                      INSERT INTO public.queued_sms (customer_id, loan_id, message, send_at)
                      VALUES (v_loan.customer_id, v_loan.loan_id, v_due_date_message, v_due_date_send_at);
                  END IF;
              END IF;

              IF v_loan_due_date >= v_today THEN
                  v_due_date_send_at := (v_loan_due_date + TIME '07:00:00') AT TIME ZONE 'Africa/Nairobi';
                  v_due_date_message := 'Dear ' || v_customer_name || ', your loan is due today. Your outstanding balance is KES ' || v_out_balance || '.' || CHR(10) || CHR(10) || 'Please make your payment using the details below:' || CHR(10) || CHR(10) || v_payment_details;
                  IF NOT EXISTS (
                      SELECT 1 FROM public.queued_sms
                      WHERE loan_id = v_loan.loan_id
                        AND status IN ('queued', 'sent', 'cancelled')
                        AND send_at::DATE = v_due_date_send_at::DATE
                        AND message = v_due_date_message
                  ) THEN
                      INSERT INTO public.queued_sms (customer_id, loan_id, message, send_at)
                      VALUES (v_loan.customer_id, v_loan.loan_id, v_due_date_message, v_due_date_send_at);
                  END IF;
              END IF;

              IF v_today > v_loan_due_date THEN
                  v_due_date_send_at := (v_today + TIME '07:00:00') AT TIME ZONE 'Africa/Nairobi';
                  v_due_date_message := 'Dear ' || v_customer_name || ', your loan payment is overdue. Your current outstanding balance is KES ' || v_out_balance || '.' || CHR(10) || CHR(10) || 'Kindly make payment as soon as possible using the details below:' || CHR(10) || CHR(10) || v_payment_details;
                  IF NOT EXISTS (
                      SELECT 1 FROM public.queued_sms
                      WHERE loan_id = v_loan.loan_id
                        AND status IN ('queued', 'sent', 'cancelled')
                        AND send_at::DATE = v_due_date_send_at::DATE
                        AND message = v_due_date_message
                  ) THEN
                      INSERT INTO public.queued_sms (customer_id, loan_id, message, send_at)
                      VALUES (v_loan.customer_id, v_loan.loan_id, v_due_date_message, v_due_date_send_at);
                  END IF;
              END IF;

              FOREACH v_d IN ARRAY v_due_days
              LOOP
                  v_due_date := v_loan.disbursed::DATE + v_d;

                  IF v_due_date >= v_today THEN
                      v_base_total := v_loan.amount * (1 + 0.3 * (1 - v_loan.interest_discount / 100.0));
                      v_od := v_today - v_loan_due_date;
                      IF v_od < 0 THEN v_od := 0; END IF;
                      
                      IF v_loan.penalty_accrued IS NOT NULL AND v_od > 0 THEN
                          v_total_balance := v_loan.balance + v_loan.penalty_accrued;
                      ELSE
                          v_capped_od := LEAST(v_od, 60);
                          v_penalty := GREATEST(0, ROUND(v_base_total * 0.012 * v_capped_od) - v_loan.penalty_waived);
                          v_total_balance := v_loan.balance + v_penalty;
                      END IF;
                      
                      v_amount_to_pay := CEIL(v_base_total / v_num_slots);
                      IF v_amount_to_pay > v_total_balance THEN
                          v_amount_to_pay := v_total_balance;
                      END IF;
                      v_send_at := (v_due_date + TIME '07:00:00') AT TIME ZONE 'Africa/Nairobi';
                      v_message := 'Dear ' || split_part(v_loan.customer_name, ' ', 1) ||
                                   ', your ' || v_loan.repayment_type ||
                                   ' payment of KES ' || to_char(v_amount_to_pay, 'FM999,999,999') ||
                                   ' is due today. Your total outstanding balance is KES ' || to_char(v_total_balance, 'FM999,999,999') ||
                                   '. Pay via Paybill 4166191, Account: ' || v_loan.acct_ref || '. Thank you.';
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

                  IF v_due_date + 1 >= v_today THEN
                      v_base_total := v_loan.amount * (1 + 0.3 * (1 - v_loan.interest_discount / 100.0));
                      v_od := v_today - v_loan_due_date;
                      IF v_od < 0 THEN v_od := 0; END IF;
                      
                      IF v_loan.penalty_accrued IS NOT NULL AND v_od > 0 THEN
                          v_total_balance := v_loan.balance + v_loan.penalty_accrued;
                      ELSE
                          v_capped_od := LEAST(v_od, 60);
                          v_penalty := GREATEST(0, ROUND(v_base_total * 0.012 * v_capped_od) - v_loan.penalty_waived);
                          v_total_balance := v_loan.balance + v_penalty;
                      END IF;
                      
                      v_amount_to_pay := CEIL(v_base_total / v_num_slots);
                      IF v_amount_to_pay > v_total_balance THEN
                          v_amount_to_pay := v_total_balance;
                      END IF;
                      v_overdue_send_at := (v_due_date + 1 + TIME '07:00:00') AT TIME ZONE 'Africa/Nairobi';
                      v_message_overdue := 'Dear ' || split_part(v_loan.customer_name, ' ', 1) ||
                                   ', your ' || v_loan.repayment_type ||
                                   ' payment is overdue. Please pay KES ' || to_char(v_amount_to_pay, 'FM999,999,999') ||
                                   '. Your total outstanding balance is KES ' || to_char(v_total_balance, 'FM999,999,999') ||
                                   '. Pay via Paybill 4166191, Account: ' || v_loan.acct_ref || '. Thank you.';
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
      $function$;
