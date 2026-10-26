import { Heading, Section, Text } from '@react-email/components';
import { EmailLayout } from './components/email-layout';

interface LandlordDuesEmailProps {
  estateName: string;
  estateEmail?: string;
  estatePhone?: string;
  estateAddress?: string;
  estateLogoUrl?: string;
  heading: string;
  recipientName: string;
  paragraphs: string[];
  lines: Array<{ label: string; amount: string }>;
  total?: string;
}

/**
 * Dues paid by landlord (#1192): the landlord's reminder for their flats, the landlord's receipt
 * for a split, and the tenant's "paid by your landlord" receipt. Each lists an amount per flat.
 */
export function LandlordDuesEmail({
  estateName,
  estateEmail,
  estatePhone,
  estateAddress,
  estateLogoUrl,
  heading,
  recipientName,
  paragraphs,
  lines,
  total,
}: LandlordDuesEmailProps) {
  return (
    <EmailLayout
      preview={heading}
      estateName={estateName}
      estateEmail={estateEmail}
      estatePhone={estatePhone}
      estateAddress={estateAddress}
      estateLogoUrl={estateLogoUrl}
    >
      <Heading style={headingStyle}>{heading}</Heading>

      <Text style={paragraph}>Dear {recipientName},</Text>
      {paragraphs.map((text) => (
        <Text key={text} style={paragraph}>{text}</Text>
      ))}

      <Section style={infoBox}>
        {lines.map((line) => (
          <Text key={line.label} style={infoRow}>
            {line.label}: <strong>{line.amount}</strong>
          </Text>
        ))}
        {total && (
          <Text style={totalRow}>
            Total: <strong>{total}</strong>
          </Text>
        )}
      </Section>

      <Text style={disclaimer}>
        If anything here looks wrong, contact the estate office.
      </Text>
    </EmailLayout>
  );
}

const headingStyle = {
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

const infoRow = {
  fontSize: '14px',
  color: '#18181b',
  margin: '0 0 8px 0',
};

const totalRow = {
  fontSize: '14px',
  color: '#18181b',
  margin: '12px 0 0 0',
};

const disclaimer = {
  fontSize: '12px',
  color: '#a1a1aa',
  margin: '0',
};
