-- ============================================================
-- MIGRATION: Fix Retroactive Penalty Start Day
--
-- The previous recalculation function started applying penalties ON the due date (day 30)
-- instead of the day AFTER the due date (day 31). This caused loans to be penalized
-- 1 day early during the historical data recalculation, which the cron then continued.
--
-- This migration fixes `recalculate_all_penalties` to start loop on due_date + 1
-- and then re-runs it to correct all accrued penalties.
-- ============================================================

CREATE OR REPLACE FUNCTION public.recalculate_all_penalties()
RETURNS TABLE(loan_id TEXT, days_replayed INT, penalty_set NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_loan          RECORD;
  v_payment       RECORD;
  v_day           DATE;
  v_due_date      DATE;
  v_today         DATE;
  v_base_total    NUMERIC;
  v_paid_so_far   NUMERIC;
  v_outstanding   NUMERIC;
  v_daily_penalty NUMERIC;
  v_total_penalty NUMERIC;
  v_days_replayed INT;
BEGIN
  v_today := (now() AT TIME ZONE 'Africa/Nairobi')::DATE;

  FOR v_loan IN
    SELECT
      l.id,
      l.amount,
      l.disbursed,
      COALESCE(l.interest_discount, 0) AS interest_discount
    FROM public.loans l
    WHERE l.disbursed IS NOT NULL
      AND l.status IN ('Active', 'Overdue', 'Frozen', 'Written off')
      -- Only loans whose due date has passed
      AND (l.disbursed::DATE + INTERVAL '30 days')::DATE < v_today
  LOOP
    v_due_date    := (v_loan.disbursed::DATE + INTERVAL '30 days')::DATE;
    v_base_total  := v_loan.amount * (1 + 0.3 * (1 - v_loan.interest_discount / 100.0));
    v_paid_so_far := 0;
    v_total_penalty := 0;
    v_days_replayed := 0;

    -- Seed the paid-so-far counter with all payments up to AND INCLUDING the due date.
    -- (Since penalty only starts the day AFTER the due date).
    SELECT COALESCE(SUM(p.amount), 0)
      INTO v_paid_so_far
      FROM public.payments p
     WHERE p.loan_id = v_loan.id
       AND p.status  = 'Allocated'
       AND p.date::DATE <= v_due_date;

    -- Replay day by day from the day AFTER due_date to today (cap at 60 overdue days)
    v_day := v_due_date + INTERVAL '1 day';
    WHILE v_day <= v_today AND v_days_replayed < 60 LOOP

      -- Credit any payments that landed ON this day before calculating penalty
      SELECT COALESCE(SUM(p.amount), 0)
        INTO v_daily_penalty           -- temporarily reuse variable
        FROM public.payments p
       WHERE p.loan_id = v_loan.id
         AND p.status  = 'Allocated'
         AND p.date::DATE = v_day;

      v_paid_so_far := v_paid_so_far + v_daily_penalty;

      -- Outstanding balance at this point in time
      v_outstanding := GREATEST(0, v_base_total + v_total_penalty - v_paid_so_far);

      -- Apply 1.2% on outstanding balance for this day
      IF v_outstanding > 0 THEN
        v_daily_penalty  := ROUND(v_outstanding * 0.012, 2);
        v_total_penalty  := v_total_penalty + v_daily_penalty;
      END IF;

      v_day           := v_day + INTERVAL '1 day';
      v_days_replayed := v_days_replayed + 1;
    END LOOP;

    -- Apply any penalty_waived offset
    DECLARE
      v_waived NUMERIC;
    BEGIN
      SELECT COALESCE(penalty_waived, 0) INTO v_waived
        FROM public.loans WHERE id = v_loan.id;
      v_total_penalty := GREATEST(0, v_total_penalty - v_waived);
    END;

    -- Write result
    UPDATE public.loans
       SET penalty_accrued = v_total_penalty
     WHERE id = v_loan.id;

    loan_id      := v_loan.id;
    days_replayed := v_days_replayed;
    penalty_set   := v_total_penalty;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- Run the retroactive recalculation NOW to fix all balances
SELECT * FROM public.recalculate_all_penalties();
