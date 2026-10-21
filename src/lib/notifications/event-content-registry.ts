/**
 * Editable resident-email wording (#907). Pure: no server imports, so the React
 * Email components can read the defaults too. The defaults here are the single
 * source of truth for today's hard-coded text; stored overrides sit on top.
 */

export const EVENT_KEYS = [
  'welcome_resident',
  'payment_receipt',
  'payment_reminder',
  'payment_reminder_escalated',
  'invoice_generated',
] as const;

export type EventKey = (typeof EVENT_KEYS)[number];

export const ESCALATION_LEVELS = ['friendly', 'warning', 'urgent', 'final', 'overdue'] as const;

export interface EventField {
  /** Key in the flat overrides map. Escalated reminders use `<level>.<field>`. */
  key: string;
  label: string;
  multiline: boolean;
  default: string;
  group?: string;
}

export interface EventVariable {
  name: string;
  description: string;
}

export interface EventDefinition {
  key: EventKey;
  /** `notification_templates.name` of the row that stores this event's overrides. */
  templateName: string;
  displayName: string;
  description: string;
  variables: EventVariable[];
  fields: EventField[];
}

const V = {
  resident_name: { name: 'resident_name', description: "Resident's full name" },
  resident_code: { name: 'resident_code', description: "Resident's code" },
  estate_name: { name: 'estate_name', description: 'Estate name' },
  receipt_number: { name: 'receipt_number', description: 'Receipt number' },
  invoice_number: { name: 'invoice_number', description: 'Invoice number' },
  amount: { name: 'amount', description: 'Amount, formatted as currency' },
  due_date: { name: 'due_date', description: 'Invoice due date' },
  due_text: { name: 'due_text', description: 'When it is due, e.g. "tomorrow"' },
  days_overdue: { name: 'days_overdue', description: 'Days past the due date' },
  property: { name: 'property', description: 'House number and street' },
} satisfies Record<string, EventVariable>;

/** Sample values for the admin preview. */
export const SAMPLE_VARIABLES: Record<string, string> = {
  resident_name: 'Ada Okafor',
  resident_code: 'R-0042',
  estate_name: 'Residio Estate',
  receipt_number: 'RC-2026-0042',
  invoice_number: 'INV-2026-0042',
  amount: '₦150,000',
  due_date: 'January 15, 2027',
  due_text: 'tomorrow',
  days_overdue: '4',
  property: '12 Palm Avenue',
};

const f = (key: string, label: string, def: string, multiline = false, group?: string): EventField => ({
  key,
  label,
  multiline,
  default: def,
  group,
});

const LEVEL_LABELS: Record<(typeof ESCALATION_LEVELS)[number], string> = {
  friendly: 'Friendly (well before the due date)',
  warning: 'Warning (due soon)',
  urgent: 'Urgent (due tomorrow)',
  final: 'Final notice (due today)',
  overdue: 'Overdue',
};

export const ESCALATION_DEFAULTS: Record<
  (typeof ESCALATION_LEVELS)[number],
  { subject: string; body: string; closing: string }
> = {
  friendly: {
    subject: 'Friendly Payment Reminder',
    body: 'This is a friendly reminder that your payment of {{amount}} for {{property}} is due {{due_text}}. We wanted to give you advance notice so you can plan accordingly.',
    closing:
      'If you have already made this payment, please disregard this message. We appreciate your prompt attention to this matter.',
  },
  warning: {
    subject: 'Payment Reminder - Due Soon',
    body: 'Your payment of {{amount}} for {{property}} is due {{due_text}}. Please ensure payment is made before the due date to avoid any late fees.',
    closing: 'To avoid any inconvenience, please make your payment at your earliest convenience.',
  },
  urgent: {
    subject: 'URGENT: Payment Due Tomorrow',
    body: 'This is an urgent reminder that your payment of {{amount}} for {{property}} is due {{due_text}}. Immediate action is required to avoid late fees and potential service restrictions.',
    closing: 'Please make payment immediately to maintain good standing with the estate.',
  },
  final: {
    subject: 'FINAL NOTICE: Payment Due Today',
    body: 'This is your FINAL NOTICE. Your payment of {{amount}} for {{property}} is due TODAY. Failure to pay may result in late fees and potential restrictions on estate services.',
    closing:
      'Please make payment immediately to avoid any negative consequences. Contact estate management if you are experiencing difficulties.',
  },
  overdue: {
    subject: 'OVERDUE: Immediate Payment Required',
    body: 'Your payment of {{amount}} for {{property}} is now {{days_overdue}} day(s) OVERDUE. This matter requires your immediate attention.',
    closing:
      'Please contact estate management immediately if you are unable to make payment. We are here to help find a solution.',
  },
};

const escalatedFields = ESCALATION_LEVELS.flatMap((level) => [
  f(`${level}.subject`, 'Heading and subject', ESCALATION_DEFAULTS[level].subject, false, LEVEL_LABELS[level]),
  f(`${level}.body`, 'Message', ESCALATION_DEFAULTS[level].body, true, LEVEL_LABELS[level]),
  f(`${level}.closing`, 'Closing message', ESCALATION_DEFAULTS[level].closing, true, LEVEL_LABELS[level]),
]);

export const EVENT_REGISTRY: Record<EventKey, EventDefinition> = {
  welcome_resident: {
    key: 'welcome_resident',
    templateName: 'welcome_resident',
    displayName: 'Welcome email',
    description: 'Sent to a new resident when they are welcomed to the estate.',
    variables: [V.resident_name, V.resident_code, V.estate_name],
    fields: [
      f('subject', 'Subject', 'Welcome to {{estate_name}}!'),
      f('heading', 'Heading', 'Welcome to {{estate_name}}!'),
      f(
        'body',
        'Opening message',
        'We are delighted to welcome you to our community. Your account has been successfully created in the estate management system.',
        true
      ),
      f('sign_off', 'Sign-off', 'Welcome aboard!'),
    ],
  },
  payment_receipt: {
    key: 'payment_receipt',
    templateName: 'payment_received',
    displayName: 'Payment receipt',
    description: 'Sent when a payment is recorded against a resident.',
    variables: [V.resident_name, V.receipt_number, V.amount, V.estate_name],
    fields: [
      f('subject', 'Subject', 'Payment Receipt: {{receipt_number}}'),
      f('heading', 'Heading', 'Payment Receipt'),
      f('body', 'Opening message', 'Thank you for your payment. Please find your receipt details below.', true),
      f('sign_off', 'Sign-off', 'Thank you,'),
    ],
  },
  payment_reminder: {
    key: 'payment_reminder',
    templateName: 'invoice_reminder',
    displayName: 'Payment reminder (manual)',
    description: 'Sent by the manual "Send now" reminder action. Scheduled reminders use the escalating reminder below.',
    variables: [V.resident_name, V.invoice_number, V.amount, V.due_date, V.property, V.estate_name],
    fields: [
      f('subject', 'Subject', 'Payment Reminder: {{invoice_number}}'),
      f('heading', 'Heading', 'Payment Reminder'),
      f(
        'body',
        'Closing message',
        'If you have already made this payment, please disregard this reminder. For any questions, please contact the estate management.',
        true
      ),
      f('sign_off', 'Sign-off', 'Thank you,'),
    ],
  },
  payment_reminder_escalated: {
    key: 'payment_reminder_escalated',
    templateName: 'invoice_overdue',
    displayName: 'Payment reminder (escalating)',
    description:
      'Sent by the scheduled reminders. The wording changes with how close to, or past, the due date the invoice is.',
    variables: [
      V.resident_name,
      V.invoice_number,
      V.amount,
      V.due_date,
      V.due_text,
      V.days_overdue,
      V.property,
      V.estate_name,
    ],
    fields: escalatedFields,
  },
  invoice_generated: {
    key: 'invoice_generated',
    templateName: 'invoice_generated',
    displayName: 'New invoice',
    description: 'Sent when an invoice is generated for a resident.',
    variables: [V.resident_name, V.invoice_number, V.amount, V.due_date, V.property, V.estate_name],
    fields: [
      f('subject', 'Subject', 'New Invoice: {{invoice_number}}'),
      f('heading', 'Heading', 'New Invoice Generated'),
      f(
        'body',
        'Closing message',
        'Please ensure payment is made before the due date to avoid any late fees. For questions about this invoice, please contact the estate management.',
        true
      ),
      f('sign_off', 'Sign-off', 'Thank you,'),
    ],
  },
};

export function isEventKey(value: string): value is EventKey {
  return (EVENT_KEYS as readonly string[]).includes(value);
}

export function getEventDefaults(event: EventKey): Record<string, string> {
  return Object.fromEntries(EVENT_REGISTRY[event].fields.map((field) => [field.key, field.default]));
}

/** Stored overrides win over defaults; an empty or whitespace-only override means the default. */
export function mergeEventContent(event: EventKey, overrides: unknown): Record<string, string> {
  const merged = getEventDefaults(event);
  if (overrides && typeof overrides === 'object' && !Array.isArray(overrides)) {
    for (const [key, value] of Object.entries(overrides as Record<string, unknown>)) {
      if (Object.hasOwn(merged, key) && typeof value === 'string' && value.trim() !== '') merged[key] = value;
    }
  }
  return merged;
}

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** Substitute `{{name}}`. Plain text out: React escapes it, never inject it as HTML. */
export function renderEventText(text: string, variables: Record<string, string | number | undefined>): string {
  return text.replace(VARIABLE_PATTERN, (_match, name: string) => {
    const value = variables[name];
    return value === undefined ? '' : String(value);
  });
}

export function findUnknownVariables(event: EventKey, text: string): string[] {
  const allowed = new Set(EVENT_REGISTRY[event].variables.map((v) => v.name));
  const unknown = new Set<string>();
  for (const match of text.matchAll(VARIABLE_PATTERN)) {
    if (!allowed.has(match[1])) unknown.add(match[1]);
  }
  return [...unknown];
}

export type OverrideValidation = { ok: true } | { ok: false; errors: string[] };

/** Rejects unknown field keys and any `{{variable}}` outside the event's allowed list. */
export function validateOverrides(event: EventKey, overrides: Record<string, string>): OverrideValidation {
  const known = new Set(EVENT_REGISTRY[event].fields.map((field) => field.key));
  const errors: string[] = [];
  for (const [key, value] of Object.entries(overrides)) {
    if (!known.has(key)) {
      errors.push(`Unknown field "${key}"`);
      continue;
    }
    const unknown = findUnknownVariables(event, value);
    if (unknown.length > 0) {
      errors.push(`${key}: unknown variable ${unknown.map((name) => `{{${name}}}`).join(', ')}`);
    }
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/**
 * Text resolver for a component: `copy` (already merged by the sender, raw templates) over the
 * defaults, then variables substituted. With no `copy` the output is today's hard-coded text.
 */
export function makeCopy(
  event: EventKey,
  copy: Record<string, string> | undefined,
  variables: Record<string, string | number | undefined>
): (key: string) => string {
  const defaults = getEventDefaults(event);
  return (key) => renderEventText(copy?.[key] || defaults[key], variables);
}

/** "today", "tomorrow", "in 3 days", "yesterday", "4 days ago": the `{{due_text}}` value. */
export function formatDueText(daysUntilDue: number): string {
  if (daysUntilDue < 0) {
    const daysOverdue = Math.abs(daysUntilDue);
    return daysOverdue === 1 ? 'yesterday' : `${daysOverdue} days ago`;
  }
  if (daysUntilDue === 0) return 'today';
  if (daysUntilDue === 1) return 'tomorrow';
  return `in ${daysUntilDue} days`;
}

/** Same currency format the email components use, for subject lines. */
export function formatEventCurrency(amount: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(amount);
}

/** The `{{property}}` value: "house, street", the same string the email bodies show. */
export function formatEventProperty(houseNumber: string | undefined, streetName?: string | null): string {
  const house = houseNumber ?? '';
  return streetName ? `${house}, ${streetName}` : house;
}

/** Paragraphs are separated by blank lines. */
export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
