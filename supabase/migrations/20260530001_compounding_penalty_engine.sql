-- ============================================================
-- MIGRATION: Compounding Penalty Engine
--
-- Changes the penalty model from:
--   Simple Interest → Principal × 1.2% × days_overdue
-- to:
--   Daily Compound  → Outstanding Balance × 1.2% per day
--
-- The outstanding balance shrinks as payments are made, so
-- a borrower who has paid off 95% of their loan is only
-- penalised on the remaining 5%, not the full original amount.
--
-- Implementation:
--  1. Add `penalty_accrued` column to loans (stores DB-managed total)
--  2. `recalculate_all_penalties()` — replays every loan's payment
--     history day-by-day to produce the correct retroactive total.
--  3. `apply_daily_penalties()` — runs every night at midnight to
--     add today's 1.2% on the current outstanding balance.
--  4. pg_cron schedule — wires up the nightly job.
-- ============================================================

-- ── 1. Add column ─────────────────────────────────────────────
ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS penalty_accrued NUMERIC(15,2) DEFAULT 0;

COMMENT ON COLUMN public.loans.penalty_accrued IS
  'DB-managed compounding late penalty. Accrues nightly at 1.2% of the outstanding balance after the loan due date. Updated by apply_daily_penalties() cron. Use this value — not on-the-fly math — for all balance displays.';

-- ── 2. Retroactive recalculation ──────────────────────────────
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
      AND (l.disbursed::DATE + INTERVAL '30 days')::DATE <= v_today
  LOOP
    v_due_date    := (v_loan.disbursed::DATE + INTERVAL '30 days')::DATE;
    v_base_total  := v_loan.amount * (1 + 0.3 * (1 - v_loan.interest_discount / 100.0));
    v_paid_so_far := 0;
    v_total_penalty := 0;
    v_days_replayed := 0;

    -- Seed the paid-so-far counter with all payments up to (but not including) due date
    SELECT COALESCE(SUM(p.amount), 0)
      INTO v_paid_so_far
      FROM public.payments p
     WHERE p.loan_id = v_loan.id
       AND p.status  = 'Allocated'
       AND p.date::DATE < v_due_date;

    -- Replay day by day from due_date to today (cap at 60 overdue days = freeze point)
    v_day := v_due_date;
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

-- ── 3. Nightly compounding job ────────────────────────────────
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
    SELECT
      l.id,
      l.amount,
      l.disbursed,
      COALESCE(l.interest_discount, 0) AS interest_discount,
      COALESCE(l.penalty_accrued,   0) AS penalty_accrued,
      COALESCE(l.penalty_waived,    0) AS penalty_waived
    FROM public.loans l
    WHERE l.status IN ('Active', 'Overdue', 'Frozen')
      AND l.disbursed IS NOT NULL
      -- Only loans past their 30-day due date
      AND (l.disbursed::DATE + INTERVAL '30 days')::DATE < v_today
      -- Freeze after 60 overdue days
      AND (v_today - (l.disbursed::DATE + INTERVAL '30 days')::DATE) <= 60
  LOOP
    v_base_total := v_loan.amount * (1 + 0.3 * (1 - v_loan.interest_discount / 100.0));

    -- Sum all allocated payments to date
    SELECT COALESCE(SUM(p.amount), 0)
      INTO v_total_paid
      FROM public.payments p
     WHERE p.loan_id = v_loan.id
       AND p.status  = 'Allocated';

    -- Outstanding balance = Principal+Interest+AccruedPenalty - TotalPaid
    v_outstanding := GREATEST(0, v_base_total + v_loan.penalty_accrued - v_total_paid);

    IF v_outstanding > 0 THEN
      v_daily_pen := ROUND(v_outstanding * 0.012, 2);

      UPDATE public.loans
         SET penalty_accrued = GREATEST(0, penalty_accrued + v_daily_pen)
       WHERE id = v_loan.id;
    END IF;
  END LOOP;
END;
$$;

-- ── 4. Schedule nightly cron at 00:01 EAT (= 21:01 UTC prev day) ──
SELECT cron.schedule(
  'apply-daily-penalties',
  '1 21 * * *',   -- 21:01 UTC = 00:01 EAT
  $$ SELECT public.apply_daily_penalties(); $$
) WHERE NOT EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'apply-daily-penalties'
);

-- ── 5. Run the retroactive recalculation NOW ──────────────────
SELECT * FROM public.recalculate_all_penalties();
