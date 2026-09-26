ALTER TABLE report_schedules
DROP CONSTRAINT IF EXISTS report_schedules_report_type_check;

ALTER TABLE report_schedules
ADD CONSTRAINT report_schedules_report_type_check
CHECK (report_type IN (
  'financial_overview',
  'collection_report',
  'invoice_aging',
  'transaction_log',
  'debtors_report',
  'indebtedness_summary',
  'development_levy'
));
