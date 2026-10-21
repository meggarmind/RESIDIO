import { Button, Heading, Hr, Section, Text } from '@react-email/components';
import { EmailLayout } from './components/email-layout';
import {
  ESCALATION_DEFAULTS,
  formatDueText,
  makeCopy,
  renderEventText,
} from '@/lib/notifications/event-content-registry';

/**
 * Escalation levels for payment reminders
 * Each level has different tone and urgency
 */
export type ReminderEscalationLevel = 'friendly' | 'warning' | 'urgent' | 'final' | 'overdue';

interface PaymentReminderEscalatedProps {
  residentName: string;
  invoiceNumber: string;
  amountDue: number;
  dueDate: string;
  daysUntilDue: number; // Negative = overdue
  houseNumber: string;
  streetName?: string;
  estateName: string;
  estateEmail?: string;
  estatePhone?: string;
  estateAddress?: string;
  paymentUrl?: string;
  escalationLevel: ReminderEscalationLevel;
  reminderCount?: number; // How many reminders have been sent
  lateFeesApplied?: number; // Late fees that have been or will be applied
  accessRestrictionDate?: string; // Date when access may be restricted
  /** Admin-edited wording, flat `<level>.<field>` keys (merged templates). Omitted means the built-in text. */
  copy?: Record<string, string>;
}

/**
 * Content configuration for each escalation level. The editable wording (subject, message,
 * closing) lives in the event registry so admins can override it.
 */
const escalationContent: Record<
  ReminderEscalationLevel,
  {
    greeting: string;
    urgencyNote?: (props: PaymentReminderEscalatedProps) => string | undefined;
    boxStyle: 'normal' | 'warning' | 'urgent' | 'critical';
    buttonText: string;
    buttonStyle: 'primary' | 'warning' | 'danger';
  }
> = {
  friendly: {
    greeting: 'Hello',
    boxStyle: 'normal',
    buttonText: 'View Invoice',
    buttonStyle: 'primary',
  },
  warning: {
    greeting: 'Dear',
    urgencyNote: (props) =>
      props.lateFeesApplied
        ? `Please note: A late fee of ${formatCurrency(props.lateFeesApplied)} may be applied if payment is not received by the due date.`
        : undefined,
    boxStyle: 'warning',
    buttonText: 'Pay Now',
    buttonStyle: 'primary',
  },
  urgent: {
    greeting: 'Dear',
    urgencyNote: (props) =>
      `This is reminder #${props.reminderCount || 1}. Late fees will be applied after the due date.`,
    boxStyle: 'urgent',
    buttonText: 'Pay Immediately',
    buttonStyle: 'warning',
  },
  final: {
    greeting: 'Dear',
    urgencyNote: (props) =>
      props.accessRestrictionDate
        ? `Important: Estate access privileges may be affected starting ${props.accessRestrictionDate} if payment is not received.`
        : 'Important: Your account will be marked as overdue if payment is not received today.',
    boxStyle: 'critical',
    buttonText: 'Pay Now to Avoid Penalties',
    buttonStyle: 'danger',
  },
  overdue: {
    greeting: 'Dear',
    urgencyNote: (props) =>
      props.lateFeesApplied
        ? `A late fee of ${formatCurrency(props.lateFeesApplied)} has been applied to your account. Additional penalties may accrue.`
        : 'Late fees have been applied to your account. Please settle this amount immediately.',
    boxStyle: 'critical',
    buttonText: 'Settle Overdue Balance',
    buttonStyle: 'danger',
  },
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(amount);
}

function formatProperty(props: PaymentReminderEscalatedProps): string {
  return props.streetName
    ? `${props.houseNumber}, ${props.streetName}`
    : props.houseNumber;
}

export function PaymentReminderEscalatedEmail(props: PaymentReminderEscalatedProps) {
  const {
    residentName,
    invoiceNumber,
    amountDue,
    dueDate,
    daysUntilDue,
    estateName,
    estateEmail,
    estatePhone,
    estateAddress,
    paymentUrl,
    escalationLevel,
    reminderCount,
    copy,
  } = props;

  const content = escalationContent[escalationLevel];
  const text = makeCopy('payment_reminder_escalated', copy, {
    resident_name: residentName,
    invoice_number: invoiceNumber,
    amount: formatCurrency(amountDue),
    due_date: dueDate,
    due_text: formatDueText(daysUntilDue),
    days_overdue: Math.abs(daysUntilDue),
    property: formatProperty(props),
    estate_name: estateName,
  });
  const formattedAmount = formatCurrency(amountDue);
  const isOverdue = daysUntilDue < 0;

  // Generate preview text
  const previewText = isOverdue
    ? `OVERDUE: ${formattedAmount} payment required immediately`
    : `Payment reminder: ${formattedAmount} due ${formatDueText(daysUntilDue)}`;

  return (
    <EmailLayout
      preview={previewText}
      estateName={estateName}
      estateEmail={estateEmail}
      estatePhone={estatePhone}
      estateAddress={estateAddress}
    >
      <Heading style={getHeadingStyle(content.boxStyle)}>
        {text(`${escalationLevel}.subject`)}
      </Heading>

      <Text style={greeting}>
        {content.greeting} {residentName},
      </Text>

      <Text style={paragraph}>{text(`${escalationLevel}.body`)}</Text>

      <Section style={getBoxStyle(content.boxStyle)}>
        <Text style={invoiceLabel}>Invoice Number</Text>
        <Text style={invoiceValue}>{invoiceNumber}</Text>

        <Text style={invoiceLabel}>Amount Due</Text>
        <Text style={getAmountStyle(content.boxStyle)}>{formattedAmount}</Text>

        <Text style={invoiceLabel}>Due Date</Text>
        <Text style={invoiceValue}>{dueDate}</Text>

        {reminderCount && reminderCount > 1 && (
          <>
            <Text style={invoiceLabel}>Reminder Count</Text>
            <Text style={invoiceValue}>#{reminderCount}</Text>
          </>
        )}
      </Section>

      {content.urgencyNote && (
        <Text style={getUrgencyNoteStyle(content.boxStyle)}>
          {content.urgencyNote(props)}
        </Text>
      )}

      {paymentUrl && (
        <Section style={buttonSection}>
          <Button style={getButtonStyle(content.buttonStyle)} href={paymentUrl}>
            {content.buttonText}
          </Button>
        </Section>
      )}

      <Hr style={hr} />

      <Text style={paragraph}>{text(`${escalationLevel}.closing`)}</Text>

      <Text style={signoff}>
        Thank you,
        <br />
        {estateName} Management
      </Text>
    </EmailLayout>
  );
}

// Dynamic style getters
function getHeadingStyle(boxStyle: string) {
  const baseStyle = {
    fontSize: '24px',
    fontWeight: 'bold' as const,
    margin: '0 0 24px',
    padding: 0,
  };

  switch (boxStyle) {
    case 'critical':
      return { ...baseStyle, color: '#dc2626' };
    case 'urgent':
      return { ...baseStyle, color: '#ea580c' };
    case 'warning':
      return { ...baseStyle, color: '#d97706' };
    default:
      return { ...baseStyle, color: '#1a1a2e' };
  }
}

function getBoxStyle(boxStyle: string) {
  const baseStyle = {
    borderRadius: '8px',
    padding: '24px',
    margin: '24px 0',
  };

  switch (boxStyle) {
    case 'critical':
      return {
        ...baseStyle,
        backgroundColor: '#fef2f2',
        border: '2px solid #dc2626',
      };
    case 'urgent':
      return {
        ...baseStyle,
        backgroundColor: '#fff7ed',
        border: '2px solid #ea580c',
      };
    case 'warning':
      return {
        ...baseStyle,
        backgroundColor: '#fffbeb',
        border: '1px solid #d97706',
      };
    default:
      return {
        ...baseStyle,
        backgroundColor: '#f9fafb',
        border: '1px solid #e5e7eb',
      };
  }
}

function getAmountStyle(boxStyle: string) {
  const baseStyle = {
    fontSize: '24px',
    fontWeight: 'bold' as const,
    margin: '0 0 16px',
  };

  switch (boxStyle) {
    case 'critical':
      return { ...baseStyle, color: '#dc2626' };
    case 'urgent':
      return { ...baseStyle, color: '#ea580c' };
    case 'warning':
      return { ...baseStyle, color: '#d97706' };
    default:
      return { ...baseStyle, color: '#059669' };
  }
}

function getUrgencyNoteStyle(boxStyle: string) {
  const baseStyle = {
    fontSize: '14px',
    lineHeight: '22px',
    padding: '12px 16px',
    borderRadius: '6px',
    margin: '16px 0',
  };

  switch (boxStyle) {
    case 'critical':
      return {
        ...baseStyle,
        backgroundColor: '#fef2f2',
        color: '#991b1b',
        border: '1px solid #fecaca',
      };
    case 'urgent':
      return {
        ...baseStyle,
        backgroundColor: '#fff7ed',
        color: '#9a3412',
        border: '1px solid #fed7aa',
      };
    case 'warning':
      return {
        ...baseStyle,
        backgroundColor: '#fffbeb',
        color: '#92400e',
        border: '1px solid #fde68a',
      };
    default:
      return {
        ...baseStyle,
        backgroundColor: '#f0f9ff',
        color: '#0c4a6e',
        border: '1px solid #bae6fd',
      };
  }
}

function getButtonStyle(buttonStyle: string) {
  const baseStyle = {
    borderRadius: '6px',
    fontSize: '16px',
    fontWeight: '600' as const,
    padding: '12px 24px',
    textDecoration: 'none',
    color: '#ffffff',
  };

  switch (buttonStyle) {
    case 'danger':
      return { ...baseStyle, backgroundColor: '#dc2626' };
    case 'warning':
      return { ...baseStyle, backgroundColor: '#ea580c' };
    default:
      return { ...baseStyle, backgroundColor: '#2563eb' };
  }
}

// Static styles
const greeting = {
  color: '#333333',
  fontSize: '16px',
  lineHeight: '26px',
  margin: '0 0 16px',
};

const paragraph = {
  color: '#555555',
  fontSize: '15px',
  lineHeight: '26px',
  margin: '0 0 24px',
};

const invoiceLabel = {
  color: '#6b7280',
  fontSize: '12px',
  fontWeight: '600' as const,
  letterSpacing: '0.5px',
  margin: '0 0 4px',
  textTransform: 'uppercase' as const,
};

const invoiceValue = {
  color: '#111827',
  fontSize: '16px',
  fontWeight: '500' as const,
  margin: '0 0 16px',
};

const buttonSection = {
  textAlign: 'center' as const,
  margin: '32px 0',
};

const hr = {
  borderColor: '#e5e7eb',
  margin: '24px 0',
};

const signoff = {
  color: '#555555',
  fontSize: '15px',
  lineHeight: '26px',
  margin: '24px 0 0',
};

/**
 * Helper to generate email subject based on escalation level
 */
export function getEscalatedReminderSubject(
  invoiceNumber: string,
  escalationLevel: ReminderEscalationLevel,
  copy?: Record<string, string>,
  variables: Record<string, string | number | undefined> = {}
): string {
  const prefix = renderEventText(
    copy?.[`${escalationLevel}.subject`] || ESCALATION_DEFAULTS[escalationLevel].subject,
    { ...variables, invoice_number: invoiceNumber }
  );
  return `${prefix}: Invoice ${invoiceNumber}`;
}

/**
 * Helper to determine escalation level based on days until due
 */
export function determineEscalationLevel(
  daysUntilDue: number,
  reminderCount: number = 1
): ReminderEscalationLevel {
  if (daysUntilDue < 0) return 'overdue';
  if (daysUntilDue === 0) return 'final';
  if (daysUntilDue === 1) return 'urgent';
  if (daysUntilDue <= 3 || reminderCount >= 2) return 'warning';
  return 'friendly';
}

export default PaymentReminderEscalatedEmail;
