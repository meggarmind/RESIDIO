import { Button, Heading, Hr, Section, Text } from '@react-email/components';
import { EmailLayout } from './components/email-layout';

interface PaymentReminderEmailProps {
  residentName: string;
  invoiceNumber: string;
  amountDue: number;
  dueDate: string;
  daysUntilDue: number;
  houseNumber: string;
  streetName?: string;
  estateName: string;
  estateEmail?: string;
  estatePhone?: string;
  estateAddress?: string;
  paymentUrl?: string;
}

export function PaymentReminderEmail({
  residentName,
  invoiceNumber,
  amountDue,
  dueDate,
  daysUntilDue,
  houseNumber,
  streetName,
  estateName,
  estateEmail,
  estatePhone,
  estateAddress,
  paymentUrl,
}: PaymentReminderEmailProps) {
  const formattedAmount = new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(amountDue);

  const urgencyText =
    daysUntilDue === 0
      ? 'today'
      : daysUntilDue === 1
        ? 'tomorrow'
        : `in ${daysUntilDue} days`;

  const isUrgent = daysUntilDue <= 1;

  return (
    <EmailLayout
      preview={`Payment Reminder: ${formattedAmount} due ${urgencyText}`}
      estateName={estateName}
      estateEmail={estateEmail}
      estatePhone={estatePhone}
      estateAddress={estateAddress}
    >
      <Heading style={heading}>Payment Reminder</Heading>

      <Text style={greeting}>Dear {residentName},</Text>

      <Text style={paragraph}>
        This is a friendly reminder that your payment for{' '}
        <strong>
          {houseNumber}
          {streetName ? `, ${streetName}` : ''}
        </strong>{' '}
        is due {urgencyText}.
      </Text>

      <Section style={isUrgent ? invoiceBoxUrgent : invoiceBox}>
        <Text style={invoiceLabel}>Invoice Number</Text>
        <Text style={invoiceValue}>{invoiceNumber}</Text>

        <Text style={invoiceLabel}>Amount Due</Text>
        <Text style={invoiceAmountValue}>{formattedAmount}</Text>

        <Text style={invoiceLabel}>Due Date</Text>
        <Text style={invoiceValue}>{dueDate}</Text>
      </Section>

      {paymentUrl && (
        <Section style={buttonSection}>
          <Button style={button} href={paymentUrl}>
            Make Payment
          </Button>
        </Section>
      )}

      <Hr style={hr} />

      <Text style={paragraph}>
        If you have already made this payment, please disregard this reminder. For any
        questions, please contact the estate management.
      </Text>

      <Text style={signoff}>
        Thank you,
        <br />
        {estateName} Management
      </Text>
    </EmailLayout>
  );
}

// Styles
const heading = {
  color: '#1a1a2e',
  fontSize: '24px',
  fontWeight: 'bold' as const,
  margin: '0 0 24px',
  padding: 0,
};

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

const invoiceBox = {
  backgroundColor: '#f9fafb',
  borderRadius: '8px',
  border: '1px solid #e5e7eb',
  padding: '24px',
  margin: '24px 0',
};

const invoiceBoxUrgent = {
  ...invoiceBox,
  backgroundColor: '#fef2f2',
  border: '1px solid #fecaca',
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

const invoiceAmountValue = {
  color: '#059669',
  fontSize: '24px',
  fontWeight: 'bold' as const,
  margin: '0 0 16px',
};

const buttonSection = {
  textAlign: 'center' as const,
  margin: '32px 0',
};

const button = {
  backgroundColor: '#2563eb',
  borderRadius: '6px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: '600' as const,
  padding: '12px 24px',
  textDecoration: 'none',
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

export default PaymentReminderEmail;
