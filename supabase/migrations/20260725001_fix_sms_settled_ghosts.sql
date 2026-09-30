CREATE OR REPLACE FUNCTION public.queue_scheduled_reminders()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
      DECLARE
          v_allocated_total NUMERIC;
          v_last_caught_up_date DATE;
          v_days_behind INT;
          v_period_paid NUMERIC;
          v_loan RECORD;
          v_message TEXT;
          v_message_overdue TEXT;
          v_send_at TIMESTAMPTZ;
          v_overdue_send_at TIMESTAMPTZ;
          v_due_date DATE;
          v_od INT;
          v_capped_od INT;
          v_penalty INT;
          v_base_total NUMERIC;
          v_total_balance NUMERIC;
          v_amount_to_pay NUMERIC;
          v_num_slots INT;
          v_slots_elapsed INT;
          v_expected_paid NUMERIC;
          v_total_paid NUMERIC;
          v_today DATE;
          v_due_days INT[];
          v_d INT;
          v_loan_due_date DATE;
          
          v_payment_template TEXT;
          v_payment_details TEXT;
          v_customer_name TEXT;
          v_out_balance TEXT;
          v_due_date_send_at TIMESTAMPTZ;
          v_due_date_message TEXT;
      BEGIN
          v_today := (now() AT TIME ZONE 'Africa/Nairobi')::DATE;

          -- Clean up queued messages for ALL relevant loans, including those that were
          -- recently Settled or Written Off. This prevents "ghost" messages from
          -- continuing to send after a loan is closed.
          DELETE FROM public.queued_sms
          WHERE status = 'queued'
            AND send_at > now()
            AND loan_id IN (
                SELECT id FROM loans
                WHERE status IN ('Active', 'Overdue', 'Settled', 'Written off')
                  AND repayment_type IN ('Weekly', 'Biweekly', 'Bi-weekly', 'Monthly', 'Daily')
            );

          SELECT value->>'template' INTO v_payment_template
          FROM public.system_settings
          WHERE key = 'sms_payment_instructions';

          IF v_payment_template IS NULL THEN
              v_payment_template := 'Paybill 4166191, Account: {{account_number}}';
          END IF;

          FOR v_loan IN
              SELECT
                  l.id as loan_id,
                  l.amount as amount,
                  l.balance as balance,
                  l.disbursed as disbursed,
                  l.repayment_type as repayment_type,
                  l.penalty_accrued as penalty_accrued,
                  COALESCE(l.interest_discount, 0) as interest_discount,
                  c.id::TEXT as customer_id,
                  c.name as customer_name,
                  c.phone as phone,
                  COALESCE(c.account_number, c.id_no, c.id_number, l.id::TEXT) as acct_ref
              FROM loans l
              JOIN customers c ON l.customer_id = c.id
              WHERE l.status IN ('Active', 'Overdue')
                AND l.repayment_type IN ('Weekly', 'Biweekly', 'Bi-weekly', 'Monthly', 'Daily')
                AND l.balance > 0
                AND l.disbursed IS NOT NULL
                -- Auto write-off logic: Do not send SMS if loan is > 90 days old and overdue
                AND NOT ( ( (now() AT TIME ZONE 'Africa/Nairobi')::DATE - l.disbursed::DATE ) > 90 AND ( (now() AT TIME ZONE 'Africa/Nairobi')::DATE - (l.disbursed::DATE + 30) ) > 0 )
          LOOP
              IF v_loan.repayment_type = 'Weekly' THEN
                  v_due_days := ARRAY[7, 14, 21, 28];
                  v_num_slots := 4;
              ELSIF v_loan.repayment_type = 'Biweekly' OR v_loan.repayment_type = 'Bi-weekly' THEN
                  v_due_days := ARRAY[14, 28];
                  v_num_slots := 2;
              ELSIF v_loan.repayment_type IN ('Monthly', 'Daily') THEN
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
                  v_penalty := ROUND(v_loan.amount * 0.012 * v_capped_od);
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

              SELECT COALESCE(SUM(p.amount), 0) INTO v_total_paid
              FROM public.payments p
              WHERE p.loan_id = v_loan.loan_id
                AND p.status = 'Allocated';

              FOREACH v_d IN ARRAY v_due_days
              LOOP
                  v_due_date := v_loan.disbursed::DATE + v_d;
                  v_slots_elapsed := array_position(v_due_days, v_d);
                  
                  IF v_due_date >= v_today THEN
                      v_base_total := v_loan.amount * (1 + 0.3 * (1 - v_loan.interest_discount / 100.0));
                      v_od := v_today - v_loan_due_date;
                      IF v_od < 0 THEN v_od := 0; END IF;
                      
                      IF v_loan.penalty_accrued IS NOT NULL AND v_od > 0 THEN
                          v_total_balance := v_loan.balance + v_loan.penalty_accrued;
                      ELSE
                          v_capped_od := LEAST(v_od, 60);
                          v_penalty := ROUND(v_loan.amount * 0.012 * v_capped_od);
                          v_total_balance := v_loan.balance + v_penalty;
                      END IF;
                      
                      v_expected_paid := (v_base_total / v_num_slots) * v_slots_elapsed;
                      v_amount_to_pay := CEIL(v_expected_paid - v_total_paid);
                      
                      IF v_amount_to_pay > v_total_balance THEN
                          v_amount_to_pay := v_total_balance;
                      END IF;
                      
                      IF v_amount_to_pay > 0 THEN
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
                  END IF;

                  IF v_due_date + 1 >= v_today THEN
                      v_base_total := v_loan.amount * (1 + 0.3 * (1 - v_loan.interest_discount / 100.0));
                      v_od := v_today - v_loan_due_date;
                      IF v_od < 0 THEN v_od := 0; END IF;
                      
                      IF v_loan.penalty_accrued IS NOT NULL AND v_od > 0 THEN
                          v_total_balance := v_loan.balance + v_loan.penalty_accrued;
                      ELSE
                          v_capped_od := LEAST(v_od, 60);
                          v_penalty := ROUND(v_loan.amount * 0.012 * v_capped_od);
                          v_total_balance := v_loan.balance + v_penalty;
                      END IF;
                      
                      v_expected_paid := (v_base_total / v_num_slots) * v_slots_elapsed;
                      v_amount_to_pay := CEIL(v_expected_paid - v_total_paid);
                      
                      IF v_amount_to_pay > v_total_balance THEN
                          v_amount_to_pay := v_total_balance;
                      END IF;
                      
                      IF v_amount_to_pay > 0 THEN
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
                  END IF;
              END LOOP;

              IF v_loan.repayment_type = 'Daily' THEN
                  SELECT COALESCE(SUM(amount), 0) INTO v_allocated_total 
                  FROM public.payments 
                  WHERE loan_id = v_loan.loan_id AND status = 'Allocated';

                  SELECT MAX(d.date) INTO v_last_caught_up_date
                  FROM generate_series(v_loan.disbursed::DATE, v_today, '1 day'::interval) d(date)
                  WHERE v_allocated_total >= ( (v_base_total / 30.0) * (d.date::DATE - v_loan.disbursed::DATE) );

                  IF v_last_caught_up_date IS NULL THEN
                      v_last_caught_up_date := v_loan.disbursed::DATE;
                  END IF;

                  v_days_behind := v_today - v_last_caught_up_date;

                  IF v_days_behind >= 3 AND (v_days_behind % 3) = 0 THEN
                      v_send_at := (v_today + TIME '07:00:00') AT TIME ZONE 'Africa/Nairobi';
                      v_message := 'Dear ' || split_part(v_loan.customer_name, ' ', 1) || ', we noticed you are behind your daily payment schedule. Your outstanding balance is KES ' || to_char(v_total_balance, 'FM999,999,999') || '. Please pay via Paybill 4166191, Account: ' || v_loan.acct_ref || ' to stay on track.';

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
              END IF;

          END LOOP;
      END;
$function$;
