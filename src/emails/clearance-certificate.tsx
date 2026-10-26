import { Heading, Section, Text } from '@react-email/components';
import { format } from 'date-fns';
import { EmailLayout } from './components/email-layout';

interface ClearanceCertificateEmailProps {
  residentName: string;
  houseAddress: string;
  certificateNumber: string;
  /** ISO date (yyyy-mm-dd). Shown as dd mmm yyyy. */
  validUntil: string;
  estateName: string;
  estateEmail?: string;
  estatePhone?: string;
  estateAddress?: string;
  estateWebsite?: string;
}

export function ClearanceCertificateEmail({
  residentName,
  houseAddress,
  certificateNumber,
  validUntil,
  estateName,
  estateEmail,
  estatePhone,
  estateAddress,
  estateWebsite,
}: ClearanceCertificateEmailProps) {
  const validUntilLabel = format(new Date(`${validUntil}T00:00:00`), 'dd MMM yyyy');

  return (
    <EmailLayout
      preview={`Move-Out Clearance Certificate ${certificateNumber}`}
      estateName={estateName}
      estateEmail={estateEmail}
      estatePhone={estatePhone}
      estateAddress={estateAddress}
      estateWebsite={estateWebsite}
    >
      <Heading style={heading}>Move-Out Clearance Certificate</Heading>

      <Text style={greeting}>Dear {residentName},</Text>

      <Text style={paragraph}>
        Your account with {estateName} is cleared. You have no outstanding balance for {houseAddress}.
      </Text>

      <Section style={box}>
        <Text style={label}>Certificate number</Text>
        <Text style={value}>{certificateNumber}</Text>
        <Text style={label}>Property</Text>
        <Text style={value}>{houseAddress}</Text>
        <Text style={label}>Valid until</Text>
        <Text style={value}>{validUntilLabel}</Text>
      </Section>

      <Text style={paragraph}>
        Keep this certificate number for your records. For any questions, please contact the estate management.
      </Text>

      <Text style={signoff}>
        Regards,
        <br />
        {estateName} Management
      </Text>
    </EmailLayout>
  );
}

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

const box = {
  backgroundColor: '#f9fafb',
  borderRadius: '8px',
  border: '1px solid #e5e7eb',
  padding: '24px',
  margin: '24px 0',
};

const label = {
  color: '#6b7280',
  fontSize: '12px',
  fontWeight: '600' as const,
  letterSpacing: '0.5px',
  margin: '0 0 4px',
  textTransform: 'uppercase' as const,
};

const value = {
  color: '#111827',
  fontSize: '15px',
  margin: '0 0 16px',
};

const signoff = {
  color: '#555555',
  fontSize: '15px',
  lineHeight: '26px',
  margin: '24px 0 0',
};

export default ClearanceCertificateEmail;
