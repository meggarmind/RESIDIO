import { Heading, Section, Text } from '@react-email/components';
import { EmailLayout } from './components/email-layout';

interface WhatsAppStatementEmailProps {
  estateName: string;
  estateEmail?: string;
  estatePhone?: string;
  estateAddress?: string;
  residentName: string;
  propertyLabel: string;
  periodLabel: string;
  openingBalance: string;
  closingBalance: string;
}

/** The statement a resident asked for on WhatsApp when it was too long for chat (#804 decision 24). */
export function WhatsAppStatementEmail({
  estateName,
  estateEmail,
  estatePhone,
  estateAddress,
  residentName,
  propertyLabel,
  periodLabel,
  openingBalance,
  closingBalance,
}: WhatsAppStatementEmailProps) {
  return (
    <EmailLayout
      preview={`Your statement for ${propertyLabel}, ${periodLabel}`}
      estateName={estateName}
      estateEmail={estateEmail}
      estatePhone={estatePhone}
      estateAddress={estateAddress}
    >
      <Heading style={heading}>Your account statement</Heading>

      <Text style={paragraph}>Dear {residentName},</Text>
      <Text style={paragraph}>
        Here is the statement you asked for on WhatsApp. It is attached as a PDF.
      </Text>

      <Section style={infoBox}>
        <Text style={infoLabel}>Property</Text>
        <Text style={infoValue}>{propertyLabel}</Text>
        <Text style={infoLabel}>Period</Text>
        <Text style={infoValue}>{periodLabel}</Text>
        <Text style={infoLabel}>Opening balance</Text>
        <Text style={infoValue}>{openingBalance}</Text>
        <Text style={infoLabel}>Closing balance</Text>
        <Text style={infoValue}>{closingBalance}</Text>
      </Section>

      <Text style={disclaimer}>
        If you did not ask for this statement, contact the estate office.
      </Text>
    </EmailLayout>
  );
}

const heading = {
  fontSize: '24px',
  fontWeight: '600',
  color: '#18181b',
  margin: '0 0 24px 0',
};

const paragraph = {
  fontSize: '14px',
  lineHeight: '24px',
  color: '#3f3f46',
  margin: '0 0 16px 0',
};

const infoBox = {
  backgroundColor: '#f4f4f5',
  borderRadius: '8px',
  padding: '20px',
  margin: '24px 0',
};

const infoLabel = {
  fontSize: '12px',
  color: '#71717a',
  margin: '0 0 4px 0',
  textTransform: 'uppercase' as const,
};

const infoValue = {
  fontSize: '14px',
  color: '#18181b',
  margin: '0 0 16px 0',
  fontWeight: '500',
};

const disclaimer = {
  fontSize: '12px',
  color: '#a1a1aa',
  margin: '0',
};
