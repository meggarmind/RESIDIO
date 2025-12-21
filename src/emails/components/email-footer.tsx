import { Hr, Link, Section, Text } from '@react-email/components';

interface EmailFooterProps {
  estateName: string;
  estateEmail?: string;
  estatePhone?: string;
  estateAddress?: string;
  estateWebsite?: string;
}

export function EmailFooter({
  estateName,
  estateEmail,
  estatePhone,
  estateAddress,
  estateWebsite,
}: EmailFooterProps) {
  return (
    <Section style={footer}>
      <Hr style={hr} />
      <Text style={footerText}>
        <strong>{estateName}</strong>
      </Text>
      {estateAddress && <Text style={contactLine}>{estateAddress}</Text>}
      {estatePhone && <Text style={contactLine}>Tel: {estatePhone}</Text>}
      {estateEmail && (
        <Text style={contactLine}>
          Email: <Link href={`mailto:${estateEmail}`} style={link}>{estateEmail}</Link>
        </Text>
      )}
      {estateWebsite && (
        <Text style={contactLine}>
          <Link href={estateWebsite} style={link}>{estateWebsite}</Link>
        </Text>
      )}
      <Text style={disclaimer}>
        This is an automated message from {estateName}. Please do not reply directly to this email.
      </Text>
    </Section>
  );
}

const footer = {
  marginTop: '32px',
  textAlign: 'center' as const,
};

const hr = {
  borderColor: '#e6e6e6',
  marginBottom: '24px',
};

const footerText = {
  color: '#666666',
  fontSize: '14px',
  lineHeight: '24px',
  margin: '0 0 4px',
};

const contactLine = {
  color: '#888888',
  fontSize: '12px',
  lineHeight: '20px',
  margin: '0',
};

const link = {
  color: '#2563eb',
  textDecoration: 'none',
};

const disclaimer = {
  color: '#999999',
  fontSize: '11px',
  lineHeight: '16px',
  marginTop: '24px',
};
