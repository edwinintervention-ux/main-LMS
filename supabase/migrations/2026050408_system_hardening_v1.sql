
-- ================================================================
-- MIGRATION: System Hardening (One Active Loan + Auto-Allocation)
-- Focus: 
-- 1. Enforce a policy of only one active loan per customer.
-- 2. Automatically link unallocated payments to new loans upon creation.
-- 3. Fix the payment trigger to handle status updates (Unallocated -> Allocated).
-- ================================================================

-- 1. Prevent multiple active loans per customer
-- This ensures that a customer cannot be disbursed a second loan if they already have one Active or Overdue.
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_loan_per_customer 
ON public.loans (customer_id) 
WHERE status IN ('Active', 'Overdue');

-- 2. Improve the payment application trigger to handle UPDATES
-- Previously it only ran on INSERT. Now it runs whenever a payment becomes 'Allocated'.
CREATE OR REPLACE FUNCTION public.apply_payment_to_loan() 
RETURNS TRIGGER AS $$
DECLARE
    p_amount     DECIMAL := NEW.amount;
    l_penalties  DECIMAL;
    l_balance    DECIMAL;
    l_disbursed  DATE;
    l_status     TEXT;
BEGIN
    -- Only process if payment is newly Allocated to a valid loan
    IF NEW.loan_id IS NULL OR NEW.status != 'Allocated' THEN
        RETURN NEW;
    END IF;

    -- Avoid double-processing if it was already Allocated (for updates)
    IF (TG_OP = 'UPDATE') THEN
        IF (OLD.status = 'Allocated' AND OLD.loan_id = NEW.loan_id AND OLD.amount = NEW.amount) THEN
            RETURN NEW;
        END IF;
    END IF;

    -- A) Get current state with Row Level Locking
    SELECT penalties, balance, disbursed, status 
      INTO l_penalties, l_balance, l_disbursed, l_status
      FROM public.loans 
     WHERE id = NEW.loan_id FOR UPDATE;

    IF NOT FOUND THEN RETURN NEW; END IF;

    -- B) WATERFALL: PAY OFF PENALTIES FIRST
    IF l_penalties > 0 THEN
        IF p_amount >= l_penalties THEN
            p_amount := p_amount - l_penalties;
            l_penalties := 0;
        ELSE
            l_penalties := l_penalties - p_amount;
            p_amount := 0;
        END IF;
    END IF;

    -- C) WATERFALL: PAY OFF BALANCE (PRINCIPAL + INTEREST) SECOND
    IF p_amount > 0 THEN
        l_balance := GREATEST(l_balance - p_amount, 0);
    END IF;

    -- D) APPLY UPDATES TO LOAN
    UPDATE public.loans 
       SET balance   = l_balance,
           penalties = l_penalties,
           status    = CASE WHEN (l_balance <= 0 AND l_penalties <= 0) THEN 'Settled'::text ELSE l_status END,
           settled_at = CASE WHEN (l_balance <= 0 AND l_penalties <= 0) THEN NOW() ELSE settled_at END
     WHERE id = NEW.loan_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-attach trigger for both INSERT and UPDATE
DROP TRIGGER IF EXISTS trg_apply_payment ON public.payments;
CREATE TRIGGER trg_apply_payment
AFTER INSERT OR UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.apply_payment_to_loan();


-- 3. Create a trigger to automatically allocate "Unallocated" payments when a new loan is created.
-- This handles the case where a customer pays before their new loan record is officially in the system.
CREATE OR REPLACE FUNCTION public.allocate_pending_payments_to_new_loan()
RETURNS TRIGGER AS $$
BEGIN
    -- Identify and link any unallocated payments for this customer to the new loan.
    -- This update will fire the 'trg_apply_payment' trigger (on UPDATE), 
    -- which in turn will reduce the loan balance automatically.
    UPDATE public.payments
    SET loan_id = NEW.id,
        status = 'Allocated',
        allocated_by = 'System Hardening (Auto-Allocation on Loan Creation)'
    WHERE customer_id = NEW.customer_id
      AND status = 'Unallocated';
      
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_allocate_on_loan_creation ON public.loans;
CREATE TRIGGER trg_allocate_on_loan_creation
AFTER INSERT ON public.loans
FOR EACH ROW
WHEN (NEW.status IN ('Active', 'Overdue'))
EXECUTE FUNCTION public.allocate_pending_payments_to_new_loan();
