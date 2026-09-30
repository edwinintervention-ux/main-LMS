-- Feature 4: Expense / Reimbursement Tracking
CREATE TABLE IF NOT EXISTS public.worker_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id TEXT NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
    worker_name TEXT,
    category TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    description TEXT,
    receipt_url TEXT,
    status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending','Approved','Rejected')),
    rejection_reason TEXT,
    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,
    expense_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.worker_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all" ON public.worker_expenses FOR ALL TO authenticated USING (true);
