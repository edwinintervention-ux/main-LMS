-- ================================================================
-- MIGRATION: Fix Credit Transfers & Unified Audit Visibility
-- 1. Update trigger to correctly handle negative payments (adjustments/transfers)
-- 2. Enhance unified_audit_ledger view to distinguish transfers from payments
-- 3. Add 'type' column to payments table for better categorization
-- ================================================================

-- 1. ADD TYPE COLUMN TO PAYMENTS
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'Payment' CHECK (type IN ('Payment', 'Transfer', 'Adjustment', 'Reversal'));

-- 2. UPDATE TRIGGER: Support Negative Amounts (Transfers/Adjustments)
CREATE OR REPLACE FUNCTION public.apply_payment_to_loan() 
RETURNS TRIGGER AS $$
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

    -- B) WATERFALL: PAY OFF PENALTIES
    -- Only pay off penalties if it's a positive payment
    IF p_amount > 0 AND l_penalties > 0 THEN
        IF p_amount >= l_penalties THEN
            p_amount := p_amount - l_penalties;
            l_penalties := 0;
        ELSE
            l_penalties := l_penalties - p_amount;
            p_amount := 0;
        END IF;
    END IF;

    -- C) WATERFALL: PAY OFF PRINCIPAL BALANCE
    -- We allow p_amount to be negative. 
    -- If p_amount is 500, balance decreases: balance - 500
    -- If p_amount is -500 (Transfer OUT), balance increases: balance - (-500) = balance + 500
    IF p_amount <> 0 THEN
        l_balance := GREATEST(l_balance - p_amount, 0);
    END IF;

    -- D) APPLY UPDATES TO LOAN
    UPDATE public.loans 
       SET balance   = l_balance,
           penalties = l_penalties,
           status    = CASE 
                         WHEN (l_balance <= 0 AND l_penalties <= 0) THEN 'Settled'::text 
                         WHEN (l_balance > 0 AND status = 'Settled') THEN 'Active'::text -- Re-activate if balance restored
                         ELSE status 
                       END,
           settled_at = CASE WHEN (l_balance <= 0 AND l_penalties <= 0) THEN NOW() ELSE NULL END
     WHERE id = v_loan_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. ENHANCE VIEW: Better transaction labeling
CREATE OR REPLACE VIEW public.unified_audit_ledger AS
SELECT 
    CASE 
      WHEN p.amount < 0 THEN 'transfer'
      WHEN p.is_reg_fee THEN 'reg_fee'
      WHEN p.notes ILIKE '%transfer%' THEN 'transfer'
      ELSE 'payment'
    END as tx_type,
    p.id,
    p.created_at,
    p.customer_name,
    p.amount,
    p.mpesa as reference,
    p.status,
    p.is_reg_fee,
    p.loan_id,
    p.notes
FROM public.payments p
UNION ALL
SELECT 
    'disbursement' as tx_type,
    d.id::text,
    d.created_at,
    c.name as customer_name,
    d.amount,
    d.transaction_id as reference,
    d.status,
    false as is_reg_fee,
    d.loan_id,
    NULL as notes
FROM public.b2c_disbursements d
LEFT JOIN public.customers c ON d.customer_id = c.id;

NOTIFY pgrst, 'reload schema';
