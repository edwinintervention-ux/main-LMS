CREATE TABLE IF NOT EXISTS public.worker_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id TEXT NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    location_lat DOUBLE PRECISION,
    location_lng DOUBLE PRECISION,
    business_name TEXT,
    status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending', 'In Progress', 'Completed', 'Failed', 'Cancelled')),
    due_date DATE,
    completed_at TIMESTAMPTZ,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.worker_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "all" ON public.worker_tasks
    FOR ALL TO authenticated USING (true);
