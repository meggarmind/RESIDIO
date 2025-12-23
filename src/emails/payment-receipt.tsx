import { Heading, Hr, Section, Text } from '@react-email/components';
import { EmailLayout } from './components/email-layout';

interface PaymentReceiptEmailProps {
  residentName: string;
  receiptNumber: string;
  amount: number;
  paymentDate: string;
  paymentMethod?: string;
  houseNumber?: string;
  streetName?: string;
  residentCode: string;
  periodStart?: string;
  periodEnd?: string;
  notes?: string;
  estateName: string;
  estateEmail?: string;
  estatePhone?: string;
  estateAddress?: string;
}

export function PaymentReceiptEmail({
  residentName,
  receiptNumber,
  amount,
  paymentDate,
  paymentMethod,
  houseNumber,
  streetName,
  residentCode,
  periodStart,
  periodEnd,
  notes,
  estateName,
  estateEmail,
  estatePhone,
  estateAddress,
}: PaymentReceiptEmailProps) {
  const formattedAmount = new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(amount);

  return (
    <EmailLayout
      preview={`Payment Receipt ${receiptNumber}: ${formattedAmount}`}
      estateName={estateName}
      estateEmail={estateEmail}
      estatePhone={estatePhone}
      estateAddress={estateAddress}
    >
      <Heading style={heading}>Payment Receipt</Heading>

      <Text style={greeting}>Dear {residentName},</Text>

      <Text style={paragraph}>
        Thank you for your payment. Please find your receipt details below.
      </Text>

      <Section style={receiptBox}>
        <Section style={receiptHeader}>
          <Text style={receiptLabel}>Receipt Number</Text>
          <Text style={receiptValue}>{receiptNumber}</Text>
        </Section>

        <Hr style={divider} />

        <Section style={detailRow}>
          <Text style={detailLabel}>Received From</Text>
          <Text style={detailValue}>
            {residentName}
            <br />
            <span style={subText}>Code: {residentCode}</span>
          </Text>
        </Section>

        {houseNumber && (
          <Section style={detailRow}>
            <Text style={detailLabel}>Property</Text>
            <Text style={detailValue}>
              {houseNumber}
              {streetName ? `, ${streetName}` : ''}
            </Text>
          </Section>
        )}

        <Hr style={divider} />

        <Section style={totalRow}>
          <Text style={totalLabel}>Amount Paid</Text>
          <Text style={totalValue}>{formattedAmount}</Text>
        </Section>

        <Section style={detailRow}>
          <Text style={detailLabel}>Payment Date</Text>
          <Text style={detailValue}>{paymentDate}</Text>
        </Section>

        {paymentMethod && (
          <Section style={detailRow}>
            <Text style={detailLabel}>Payment Method</Text>
            <Text style={detailValue} className="capitalize">
              {paymentMethod.replace('_', ' ')}
            </Text>
          </Section>
        )}

        {periodStart && periodEnd && (
          <Section style={detailRow}>
            <Text style={detailLabel}>Period Covered</Text>
            <Text style={detailValue}>
              {periodStart} - {periodEnd}
            </Text>
          </Section>
        )}

        {notes && (
          <>
            <Hr style={divider} />
            <Section style={notesSection}>
              <Text style={detailLabel}>Notes</Text>
              <Text style={notesText}>{notes}</Text>
            </Section>
          </>
        )}
      </Section>

      <Hr style={hr} />

      <Text style={paragraph}>
        This receipt serves as confirmation of your payment. Please keep it for your records.
        For any questions, please contact the estate management.
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

const receiptBox = {
  backgroundColor: '#f9fafb',
  borderRadius: '8px',
  border: '1px solid #e5e7eb',
  padding: '24px',
  margin: '24px 0',
};

const receiptHeader = {
  marginBottom: '16px',
};

const receiptLabel = {
  color: '#6b7280',
  fontSize: '12px',
  fontWeight: '600' as const,
  letterSpacing: '0.5px',
  margin: '0 0 4px',
  textTransform: 'uppercase' as const,
};

const receiptValue = {
  color: '#111827',
  fontSize: '18px',
  fontWeight: '600' as const,
  fontFamily: 'monospace',
  margin: '0',
};

const divider = {
  borderColor: '#e5e7eb',
  margin: '16px 0',
};

const detailRow = {
  marginBottom: '12px',
};

const detailLabel = {
  color: '#6b7280',
  fontSize: '12px',
  fontWeight: '600' as const,
  letterSpacing: '0.5px',
  margin: '0 0 4px',
  textTransform: 'uppercase' as const,
};

const detailValue = {
  color: '#111827',
  fontSize: '14px',
  margin: '0',
};

const subText = {
  color: '#6b7280',
  fontSize: '12px',
};

const totalRow = {
  display: 'flex' as const,
  justifyContent: 'space-between' as const,
  alignItems: 'center' as const,
  marginBottom: '16px',
  padding: '12px',
  backgroundColor: '#059669',
  borderRadius: '6px',
};

const totalLabel = {
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: '600' as const,
  margin: 0,
};

const totalValue = {
  color: '#ffffff',
  fontSize: '24px',
  fontWeight: 'bold' as const,
  margin: 0,
};

const notesSection = {
  marginTop: '8px',
};

const notesText = {
  color: '#374151',
  fontSize: '14px',
  fontStyle: 'italic' as const,
  margin: '4px 0 0',
  padding: '12px',
  backgroundColor: '#ffffff',
  borderRadius: '4px',
  border: '1px solid #e5e7eb',
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

export default PaymentReceiptEmail;
