import { Button, Heading, Hr, Section, Text } from '@react-email/components';
import { EmailLayout } from './components/email-layout';

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
}

/**
 * Content configuration for each escalation level
 */
const escalationContent: Record<
  ReminderEscalationLevel,
  {
    subject: string;
    greeting: string;
    mainMessage: (props: PaymentReminderEscalatedProps) => string;
    urgencyNote?: (props: PaymentReminderEscalatedProps) => string | undefined;
    closingNote: string;
    boxStyle: 'normal' | 'warning' | 'urgent' | 'critical';
    buttonText: string;
    buttonStyle: 'primary' | 'warning' | 'danger';
  }
> = {
  friendly: {
    subject: 'Friendly Payment Reminder',
    greeting: 'Hello',
    mainMessage: (props) =>
      `This is a friendly reminder that your payment of ${formatCurrency(props.amountDue)} for ${formatProperty(props)} is due ${formatDueText(props.daysUntilDue)}. We wanted to give you advance notice so you can plan accordingly.`,
    closingNote:
      'If you have already made this payment, please disregard this message. We appreciate your prompt attention to this matter.',
    boxStyle: 'normal',
    buttonText: 'View Invoice',
    buttonStyle: 'primary',
  },
  warning: {
    subject: 'Payment Reminder - Due Soon',
    greeting: 'Dear',
    mainMessage: (props) =>
      `Your payment of ${formatCurrency(props.amountDue)} for ${formatProperty(props)} is due ${formatDueText(props.daysUntilDue)}. Please ensure payment is made before the due date to avoid any late fees.`,
    urgencyNote: (props) =>
      props.lateFeesApplied
        ? `Please note: A late fee of ${formatCurrency(props.lateFeesApplied)} may be applied if payment is not received by the due date.`
        : undefined,
    closingNote:
      'To avoid any inconvenience, please make your payment at your earliest convenience.',
    boxStyle: 'warning',
    buttonText: 'Pay Now',
    buttonStyle: 'primary',
  },
  urgent: {
    subject: 'URGENT: Payment Due Tomorrow',
    greeting: 'Dear',
    mainMessage: (props) =>
      `This is an urgent reminder that your payment of ${formatCurrency(props.amountDue)} for ${formatProperty(props)} is due ${formatDueText(props.daysUntilDue)}. Immediate action is required to avoid late fees and potential service restrictions.`,
    urgencyNote: (props) =>
      `This is reminder #${props.reminderCount || 1}. Late fees will be applied after the due date.`,
    closingNote:
      'Please make payment immediately to maintain good standing with the estate.',
    boxStyle: 'urgent',
    buttonText: 'Pay Immediately',
    buttonStyle: 'warning',
  },
  final: {
    subject: 'FINAL NOTICE: Payment Due Today',
    greeting: 'Dear',
    mainMessage: (props) =>
      `This is your FINAL NOTICE. Your payment of ${formatCurrency(props.amountDue)} for ${formatProperty(props)} is due TODAY. Failure to pay may result in late fees and potential restrictions on estate services.`,
    urgencyNote: (props) =>
      props.accessRestrictionDate
        ? `Important: Estate access privileges may be affected starting ${props.accessRestrictionDate} if payment is not received.`
        : 'Important: Your account will be marked as overdue if payment is not received today.',
    closingNote:
      'Please make payment immediately to avoid any negative consequences. Contact estate management if you are experiencing difficulties.',
    boxStyle: 'critical',
    buttonText: 'Pay Now to Avoid Penalties',
    buttonStyle: 'danger',
  },
  overdue: {
    subject: 'OVERDUE: Immediate Payment Required',
    greeting: 'Dear',
    mainMessage: (props) =>
      `Your payment of ${formatCurrency(props.amountDue)} for ${formatProperty(props)} is now ${Math.abs(props.daysUntilDue)} day(s) OVERDUE. This matter requires your immediate attention.`,
    urgencyNote: (props) =>
      props.lateFeesApplied
        ? `A late fee of ${formatCurrency(props.lateFeesApplied)} has been applied to your account. Additional penalties may accrue.`
        : 'Late fees have been applied to your account. Please settle this amount immediately.',
    closingNote:
      'Please contact estate management immediately if you are unable to make payment. We are here to help find a solution.',
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

function formatDueText(daysUntilDue: number): string {
  if (daysUntilDue < 0) {
    const daysOverdue = Math.abs(daysUntilDue);
    return daysOverdue === 1 ? 'yesterday' : `${daysOverdue} days ago`;
  }
  if (daysUntilDue === 0) return 'today';
  if (daysUntilDue === 1) return 'tomorrow';
  return `in ${daysUntilDue} days`;
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
  } = props;

  const content = escalationContent[escalationLevel];
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
        {content.subject}
      </Heading>

      <Text style={greeting}>
        {content.greeting} {residentName},
      </Text>

      <Text style={paragraph}>{content.mainMessage(props)}</Text>

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

      <Text style={paragraph}>{content.closingNote}</Text>

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
  escalationLevel: ReminderEscalationLevel
): string {
  const prefix = escalationContent[escalationLevel].subject;
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
