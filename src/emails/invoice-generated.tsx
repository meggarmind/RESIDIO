import { Button, Heading, Hr, Section, Text } from '@react-email/components';
import { EmailLayout } from './components/email-layout';

interface InvoiceItem {
  name: string;
  amount: number;
}

interface InvoiceGeneratedEmailProps {
  residentName: string;
  invoiceNumber: string;
  amountDue: number;
  dueDate: string;
  periodStart?: string;
  periodEnd?: string;
  houseNumber: string;
  streetName?: string;
  items: InvoiceItem[];
  estateName: string;
  estateEmail?: string;
  estatePhone?: string;
  estateAddress?: string;
  invoiceUrl?: string;
}

export function InvoiceGeneratedEmail({
  residentName,
  invoiceNumber,
  amountDue,
  dueDate,
  periodStart,
  periodEnd,
  houseNumber,
  streetName,
  items,
  estateName,
  estateEmail,
  estatePhone,
  estateAddress,
  invoiceUrl,
}: InvoiceGeneratedEmailProps) {
  const formattedAmount = new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(amountDue);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(amount);

  return (
    <EmailLayout
      preview={`New Invoice ${invoiceNumber}: ${formattedAmount}`}
      estateName={estateName}
      estateEmail={estateEmail}
      estatePhone={estatePhone}
      estateAddress={estateAddress}
    >
      <Heading style={heading}>New Invoice Generated</Heading>

      <Text style={greeting}>Dear {residentName},</Text>

      <Text style={paragraph}>
        A new invoice has been generated for your property at{' '}
        <strong>
          {houseNumber}
          {streetName ? `, ${streetName}` : ''}
        </strong>
        .
      </Text>

      <Section style={invoiceBox}>
        <Text style={invoiceLabel}>Invoice Number</Text>
        <Text style={invoiceValue}>{invoiceNumber}</Text>

        {periodStart && periodEnd && (
          <>
            <Text style={invoiceLabel}>Billing Period</Text>
            <Text style={invoiceValue}>
              {periodStart} - {periodEnd}
            </Text>
          </>
        )}

        <Hr style={itemDivider} />

        {items.map((item, index) => (
          <Section key={index} style={itemRow}>
            <Text style={itemName}>{item.name}</Text>
            <Text style={itemAmount}>{formatCurrency(item.amount)}</Text>
          </Section>
        ))}

        <Hr style={itemDivider} />

        <Section style={totalRow}>
          <Text style={totalLabel}>Total Amount Due</Text>
          <Text style={totalValue}>{formattedAmount}</Text>
        </Section>

        <Text style={invoiceLabel}>Due Date</Text>
        <Text style={invoiceValue}>{dueDate}</Text>
      </Section>

      {invoiceUrl && (
        <Section style={buttonSection}>
          <Button style={button} href={invoiceUrl}>
            View Invoice
          </Button>
        </Section>
      )}

      <Hr style={hr} />

      <Text style={paragraph}>
        Please ensure payment is made before the due date to avoid any late fees. For questions
        about this invoice, please contact the estate management.
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

const itemDivider = {
  borderColor: '#e5e7eb',
  margin: '16px 0',
};

const itemRow = {
  display: 'flex' as const,
  justifyContent: 'space-between' as const,
  alignItems: 'center' as const,
  marginBottom: '8px',
};

const itemName = {
  color: '#374151',
  fontSize: '14px',
  margin: 0,
};

const itemAmount = {
  color: '#374151',
  fontSize: '14px',
  fontWeight: '500' as const,
  margin: 0,
  textAlign: 'right' as const,
};

const totalRow = {
  display: 'flex' as const,
  justifyContent: 'space-between' as const,
  alignItems: 'center' as const,
  marginBottom: '16px',
};

const totalLabel = {
  color: '#111827',
  fontSize: '14px',
  fontWeight: '600' as const,
  margin: 0,
};

const totalValue = {
  color: '#059669',
  fontSize: '20px',
  fontWeight: 'bold' as const,
  margin: 0,
  textAlign: 'right' as const,
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

export default InvoiceGeneratedEmail;
