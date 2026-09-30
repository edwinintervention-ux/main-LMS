-- Create customer_refunds table
CREATE TABLE IF NOT EXISTS public.customer_refunds (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_id text NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    source_payment_id text REFERENCES public.payments(id) ON DELETE SET NULL,
    loan_id text REFERENCES public.loans(id) ON DELETE SET NULL,
    refund_type text NOT NULL CHECK (refund_type IN ('Unallocated Deposit', 'Loan Overpayment')),
    amount numeric(12, 2) NOT NULL CHECK (amount > 0),
    recipient_phone text NOT NULL,
    status text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Pending OTP', 'OTP Verified', 'Processing', 'Completed', 'Failed', 'Cancelled')),
    reason text,
    requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    otp_authorized_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    otp_verified_at timestamp with time zone,
    b2c_conversation_id text,
    b2c_originator_conversation_id text,
    mpesa_result_code text,
    mpesa_result_description text,
    requested_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    processing_at timestamp with time zone,
    completed_at timestamp with time zone,
    failed_at timestamp with time zone,
    failure_reason text,
    cancelled_at timestamp with time zone
);

-- RLS Policies for customer_refunds
ALTER TABLE public.customer_refunds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all authenticated users" ON public.customer_refunds
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable insert for authenticated users" ON public.customer_refunds
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Enable update for authenticated users" ON public.customer_refunds
    FOR UPDATE TO authenticated USING (true);

-- Create a view or helper to safely calculate refundable amount per payment/loan
-- We will handle the exact calculation in the edge function for safety, but this table is the ledger.
