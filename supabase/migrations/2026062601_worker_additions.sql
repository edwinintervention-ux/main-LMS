-- Migration to add worker_additions table for salary bonuses/additions
CREATE TABLE IF NOT EXISTS public.worker_additions (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    worker_id UUID REFERENCES public.workers(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL,
    reason TEXT NOT NULL,
    month VARCHAR(7) NOT NULL, -- e.g. "2024-04"
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.worker_additions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage additions" ON public.worker_additions FOR ALL TO authenticated USING (public.is_admin());

CREATE POLICY "Workers can view their own additions" ON public.worker_additions
FOR SELECT TO authenticated
USING (
    worker_id IN (
        SELECT id FROM public.workers WHERE auth_id = auth.uid()
    )
);

-- Grant privileges
SELECT pg_temp.grant_if_exists('SELECT, INSERT, UPDATE, DELETE', 'worker_additions', 'authenticated');
SELECT pg_temp.grant_if_exists('ALL', 'worker_additions', 'service_role');
