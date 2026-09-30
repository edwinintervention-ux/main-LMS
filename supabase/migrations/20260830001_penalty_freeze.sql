-- MIGRATION: Manual Penalty Freeze
-- Adds penalty_frozen column and updates both cron functions to skip frozen loans.

-- 1. Add column
ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS penalty_frozen BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.loans.penalty_frozen IS
  'When TRUE, the nightly apply_daily_penalties() cron skips this loan and no further penalty is accrued.';

-- 2. Update nightly cron
CREATE OR REPLACE FUNCTION public.apply_daily_penalties()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_loan        RECORD;
  v_base_total  NUMERIC;
  v_total_paid  NUMERIC;
  v_outstanding NUMERIC;
  v_daily_pen   NUMERIC;
  v_today       DATE;
BEGIN
  v_today := (now() AT TIME ZONE 'Africa/Nairobi')::DATE;
  FOR v_loan IN
    SELECT l.id, l.amount, l.disbursed,
      COALESCE(l.interest_discount, 0) AS interest_discount,
      COALESCE(l.penalty_accrued,   0) AS penalty_accrued,
      COALESCE(l.penalty_waived,    0) AS penalty_waived
    FROM public.loans l
    WHERE l.status IN ('Active', 'Overdue', 'Frozen')
      AND l.disbursed IS NOT NULL
      AND (l.disbursed::DATE + INTERVAL '30 days')::DATE < v_today
      AND (v_today - (l.disbursed::DATE + INTERVAL '30 days')::DATE) <= 60
      AND COALESCE(l.penalty_frozen, FALSE) = FALSE
  LOOP
    v_base_total := v_loan.amount * (1 + 0.3 * (1 - v_loan.interest_discount / 100.0));
    SELECT COALESCE(SUM(p.amount), 0) INTO v_total_paid
      FROM public.payments p WHERE p.loan_id = v_loan.id AND p.status = 'Allocated';
    v_outstanding := GREATEST(0, v_base_total + v_loan.penalty_accrued - v_total_paid);
    IF v_outstanding > 0 THEN
      v_daily_pen := ROUND(v_outstanding * 0.012, 2);
      UPDATE public.loans SET penalty_accrued = GREATEST(0, penalty_accrued + v_daily_pen) WHERE id = v_loan.id;
    END IF;
  END LOOP;
END;
$$;

-- 3. Update retroactive recalculation (also skips frozen loans)
CREATE OR REPLACE FUNCTION public.recalculate_all_penalties()
RETURNS TABLE(loan_id TEXT, days_replayed INT, penalty_set NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_loan          RECORD;
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
    SELECT l.id, l.amount, l.disbursed,
      COALESCE(l.interest_discount, 0) AS interest_discount
    FROM public.loans l
    WHERE l.disbursed IS NOT NULL
      AND l.status IN ('Active', 'Overdue', 'Frozen', 'Written off')
      AND (l.disbursed::DATE + INTERVAL '30 days')::DATE <= v_today
      AND COALESCE(l.penalty_frozen, FALSE) = FALSE
  LOOP
    v_due_date      := (v_loan.disbursed::DATE + INTERVAL '30 days')::DATE;
    v_base_total    := v_loan.amount * (1 + 0.3 * (1 - v_loan.interest_discount / 100.0));
    v_paid_so_far   := 0;
    v_total_penalty := 0;
    v_days_replayed := 0;

    SELECT COALESCE(SUM(p.amount), 0) INTO v_paid_so_far
      FROM public.payments p
     WHERE p.loan_id = v_loan.id AND p.status = 'Allocated' AND p.date::DATE < v_due_date;

    v_day := v_due_date;
    WHILE v_day <= v_today AND v_days_replayed < 60 LOOP
      SELECT COALESCE(SUM(p.amount), 0) INTO v_daily_penalty
        FROM public.payments p
       WHERE p.loan_id = v_loan.id AND p.status = 'Allocated' AND p.date::DATE = v_day;
      v_paid_so_far   := v_paid_so_far + v_daily_penalty;
      v_outstanding   := GREATEST(0, v_base_total + v_total_penalty - v_paid_so_far);
      IF v_outstanding > 0 THEN
        v_daily_penalty := ROUND(v_outstanding * 0.012, 2);
        v_total_penalty := v_total_penalty + v_daily_penalty;
      END IF;
      v_day           := v_day + INTERVAL '1 day';
      v_days_replayed := v_days_replayed + 1;
    END LOOP;

    DECLARE v_waived NUMERIC;
    BEGIN
      SELECT COALESCE(penalty_waived, 0) INTO v_waived FROM public.loans WHERE id = v_loan.id;
      v_total_penalty := GREATEST(0, v_total_penalty - v_waived);
    END;

    UPDATE public.loans SET penalty_accrued = v_total_penalty WHERE id = v_loan.id;
    loan_id       := v_loan.id;
    days_replayed := v_days_replayed;
    penalty_set   := v_total_penalty;
    RETURN NEXT;
  END LOOP;
END;
$$;