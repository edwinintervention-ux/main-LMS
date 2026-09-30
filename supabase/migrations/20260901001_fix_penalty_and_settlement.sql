-- MIGRATION: Fix Penalty Nullification and Settlement Logic
-- 1. Fix apply_daily_penalties to use COALESCE on penalty_accrued in the UPDATE statement
-- 2. Fix apply_payment_to_loan to account for penalty_accrued before marking as Settled

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
      -- FIX: Use COALESCE in the UPDATE to prevent NULL + value = NULL bug
      UPDATE public.loans 
      SET penalty_accrued = GREATEST(0, COALESCE(penalty_accrued, 0) + v_daily_pen) 
      WHERE id = v_loan.id;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_payment_to_loan()
 RETURNS trigger
 LANGUAGE plpgsql
AS $$
DECLARE
    p_amount         DECIMAL;
    l_balance        DECIMAL;
    l_amount         DECIMAL;
    l_discount       DECIMAL;
    l_penalty_acc    DECIMAL;
    l_status         TEXT;
    v_loan_id        TEXT;
    v_total_paid     DECIMAL;
    v_base_total     DECIMAL;
    v_outstanding    DECIMAL;
BEGIN
    IF (TG_OP = 'UPDATE') THEN
        IF (OLD.status = NEW.status OR NEW.status != 'Allocated' OR NEW.loan_id IS NULL) THEN
            RETURN NEW;
        END IF;
    ELSIF (TG_OP = 'INSERT') THEN
        IF (NEW.status != 'Allocated' OR NEW.loan_id IS NULL) THEN
            RETURN NEW;
        END IF;
    END IF;

    v_loan_id := NEW.loan_id;
    p_amount  := NEW.amount;

    SELECT balance, status, amount, COALESCE(interest_discount, 0), COALESCE(penalty_accrued, 0)
      INTO l_balance, l_status, l_amount, l_discount, l_penalty_acc
      FROM public.loans 
     WHERE id = v_loan_id FOR UPDATE;

    IF NOT FOUND THEN RETURN NEW; END IF;

    IF p_amount <> 0 THEN
        l_balance := GREATEST(l_balance - p_amount, 0);
    END IF;

    -- Calculate TRUE outstanding balance dynamically for correct settlement threshold
    v_base_total := l_amount * (1 + 0.3 * (1 - l_discount / 100.0));
    SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
      FROM public.payments
     WHERE loan_id = v_loan_id AND status = 'Allocated';
     
    v_outstanding := v_base_total + l_penalty_acc - v_total_paid;

    UPDATE public.loans 
       SET balance   = l_balance,
           status    = CASE 
                         WHEN (v_outstanding <= 0) THEN 'Settled'::text 
                         WHEN (v_outstanding > 0 AND l_status = 'Settled') THEN 'Active'::text 
                         ELSE l_status 
                       END,
           settled_at = CASE WHEN (v_outstanding <= 0) THEN NOW() ELSE NULL END
     WHERE id = v_loan_id;

    RETURN NEW;
END;
$$;
