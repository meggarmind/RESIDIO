CREATE TABLE IF NOT EXISTS public.report_archive (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type TEXT NOT NULL,
  schedule_id UUID REFERENCES public.report_schedules(id) ON DELETE SET NULL,
  generated_by UUID NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  file_path TEXT NOT NULL,
  file_size_bytes INTEGER,
  format TEXT NOT NULL DEFAULT 'pdf',
  recipients JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.report_archive IS 'Generated report PDF files with metadata for download and archival';

CREATE INDEX IF NOT EXISTS idx_report_archive_type ON public.report_archive(report_type);
CREATE INDEX IF NOT EXISTS idx_report_archive_schedule ON public.report_archive(schedule_id);
CREATE INDEX IF NOT EXISTS idx_report_archive_generated_at ON public.report_archive(generated_at DESC);

ALTER TABLE public.report_archive ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view report archive" ON public.report_archive
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users with report export can insert" ON public.report_archive
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p
    JOIN role_permissions rp ON rp.role_id = p.role_id
    JOIN app_permissions ap ON ap.id = rp.permission_id AND ap.name = 'reports.export'
    WHERE p.id = auth.uid()
  ));
