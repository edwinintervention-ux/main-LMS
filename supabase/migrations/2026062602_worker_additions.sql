-- Worker Additions Table
-- Records salary additions (bonuses, ex gratia, allowances) per worker per month

CREATE TABLE IF NOT EXISTS public.worker_additions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id   UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  amount      NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  reason      TEXT NOT NULL,
  month       TEXT NOT NULL, -- Format: YYYY-MM
  created_at  TIMESTAMPTZ DEFAULT now(),
  created_by  TEXT
);

-- Index for fast per-worker lookups
CREATE INDEX IF NOT EXISTS idx_worker_additions_worker_id ON public.worker_additions(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_additions_month ON public.worker_additions(month);

-- RLS (Row Level Security)
ALTER TABLE public.worker_additions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage worker additions"
  ON public.worker_additions
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
