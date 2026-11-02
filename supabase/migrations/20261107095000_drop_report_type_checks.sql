-- #1399: drop the report_type CHECK constraints on generated_reports and report_schedules.
--
-- The report list is owned by the app (reportTypes in src/lib/validators/reports.ts, #1397); every
-- request, schedule and loader validates against it. The two constraints were a stale second copy:
-- generated_reports still allowed only four types, so saving a Debtors Report, Indebtedness Report or
-- Development Levy report to History failed, and neither constraint knew the new `debtors_aging` type.
-- report_archive has no such constraint.
--
-- Rollback (restores the original lists; it fails if any row holds a type outside them, for example
-- debtors_aging, so delete or retype those rows first):
--   ALTER TABLE public.generated_reports ADD CONSTRAINT generated_reports_report_type_check
--     CHECK (report_type IN ('financial_overview', 'collection_report', 'invoice_aging', 'transaction_log'));
--   ALTER TABLE public.report_schedules ADD CONSTRAINT report_schedules_report_type_check
--     CHECK (report_type IN ('financial_overview', 'collection_report', 'invoice_aging', 'transaction_log',
--       'debtors_report', 'indebtedness_summary', 'development_levy'));

ALTER TABLE public.generated_reports
  DROP CONSTRAINT IF EXISTS generated_reports_report_type_check;

ALTER TABLE public.report_schedules
  DROP CONSTRAINT IF EXISTS report_schedules_report_type_check;
