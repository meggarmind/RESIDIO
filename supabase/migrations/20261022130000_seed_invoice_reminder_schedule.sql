-- Seeds the invoice reminder schedule row (#903), part of #794.
--
-- WHAT CHANGES
--   Inserts system_settings.invoice_reminder_schedule holding the default schedule (email on every
--   step, the same steps as DEFAULT_REMINDER_SCHEDULE in src/lib/notifications/types.ts).
--
-- WHY
--   The row existed on neither Residio_Stage nor Residio_Prod, and updateSetting only updated an
--   existing row, so adding a reminder step failed. The app now also creates the row on first save;
--   this seed makes the editor start from a stored schedule. Behaviour is unchanged: with no row the
--   app already fell back to this same default.
--
-- IDEMPOTENT: ON CONFLICT DO NOTHING (a schedule an admin already saved is kept).
--
-- ROLLBACK:
--   DELETE FROM public.system_settings WHERE key = 'invoice_reminder_schedule';
--   (The app then falls back to the same default in code.)
--
-- VERIFY (run on the database after applying):
--   SELECT key, jsonb_array_length(value->'steps') FROM public.system_settings WHERE key = 'invoice_reminder_schedule';  -- expect 7

INSERT INTO public.system_settings (key, value, description, category)
VALUES (
  'invoice_reminder_schedule',
  '{
  "id": "default",
  "name": "Standard Payment Reminder Schedule",
  "description": "Default escalating reminder schedule for invoice payments",
  "isDefault": true,
  "isActive": true,
  "createdAt": "2026-10-22T00:00:00.000Z",
  "updatedAt": "2026-10-22T00:00:00.000Z",
  "steps": [
    {
      "id": "step-7-before",
      "daysFromDue": -7,
      "escalationLevel": "friendly",
      "channels": [
        "email"
      ],
      "isActive": true,
      "priority": 5
    },
    {
      "id": "step-3-before",
      "daysFromDue": -3,
      "escalationLevel": "warning",
      "channels": [
        "email"
      ],
      "isActive": true,
      "priority": 4
    },
    {
      "id": "step-1-before",
      "daysFromDue": -1,
      "escalationLevel": "urgent",
      "channels": [
        "email"
      ],
      "isActive": true,
      "priority": 3
    },
    {
      "id": "step-due-date",
      "daysFromDue": 0,
      "escalationLevel": "final",
      "channels": [
        "email"
      ],
      "isActive": true,
      "priority": 2
    },
    {
      "id": "step-1-after",
      "daysFromDue": 1,
      "escalationLevel": "overdue",
      "channels": [
        "email"
      ],
      "isActive": true,
      "priority": 1
    },
    {
      "id": "step-3-after",
      "daysFromDue": 3,
      "escalationLevel": "overdue",
      "channels": [
        "email"
      ],
      "isActive": true,
      "priority": 1
    },
    {
      "id": "step-7-after",
      "daysFromDue": 7,
      "escalationLevel": "overdue",
      "channels": [
        "email"
      ],
      "isActive": true,
      "priority": 1
    }
  ]
}'::jsonb,
  'Invoice reminder schedule (JSON)',
  'notifications'
)
ON CONFLICT (key) DO NOTHING;
