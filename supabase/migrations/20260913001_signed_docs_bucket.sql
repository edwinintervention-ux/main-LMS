-- Create the signed-docs storage bucket (private, no public access)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'signed-docs',
  'signed-docs',
  false,
  10485760,  -- 10 MB limit per file
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Allow upload to signed-docs
CREATE POLICY "Allow upload signed docs"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'signed-docs');

-- Allow update in signed-docs (needed for upsert: true)
CREATE POLICY "Allow update signed docs"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'signed-docs')
WITH CHECK (bucket_id = 'signed-docs');

-- Allow read for signed-docs
CREATE POLICY "Allow read signed docs"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'signed-docs');

-- Allow delete for authenticated users
CREATE POLICY "Allow delete signed docs"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'signed-docs');
