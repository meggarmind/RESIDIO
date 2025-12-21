import { Heading, Hr, Section, Text } from '@react-email/components';
import { EmailLayout } from './components/email-layout';

interface TestEmailProps {
  estateName: string;
  estateEmail?: string;
  estatePhone?: string;
  estateAddress?: string;
  recipientEmail: string;
}

export function TestEmail({
  estateName,
  estateEmail,
  estatePhone,
  estateAddress,
  recipientEmail,
}: TestEmailProps) {
  const timestamp = new Date().toLocaleString('en-NG', {
    dateStyle: 'full',
    timeStyle: 'short',
  });

  return (
    <EmailLayout
      preview={`Test Email from ${estateName}`}
      estateName={estateName}
      estateEmail={estateEmail}
      estatePhone={estatePhone}
      estateAddress={estateAddress}
    >
      <Heading style={heading}>Test Email</Heading>

      <Text style={paragraph}>
        This is a test email from <strong>{estateName}</strong> to verify that the email
        configuration is working correctly.
      </Text>

      <Section style={infoBox}>
        <Text style={infoLabel}>Sent To</Text>
        <Text style={infoValue}>{recipientEmail}</Text>

        <Text style={infoLabel}>Timestamp</Text>
        <Text style={infoValue}>{timestamp}</Text>

        <Text style={infoLabel}>Status</Text>
        <Text style={successValue}>✓ Email Delivery Successful</Text>
      </Section>

      <Hr style={hr} />

      <Text style={paragraph}>
        If you received this email, your email configuration is working properly. You can now
        enable email notifications for:
      </Text>

      <Section style={featureList}>
        <Text style={featureItem}>• Payment reminders</Text>
        <Text style={featureItem}>• Invoice notifications</Text>
        <Text style={featureItem}>• Welcome emails for new residents</Text>
        <Text style={featureItem}>• System notifications</Text>
      </Section>

      <Text style={disclaimer}>
        This is an automated test message. No action is required.
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

const paragraph = {
  color: '#555555',
  fontSize: '15px',
  lineHeight: '26px',
  margin: '0 0 24px',
};

const infoBox = {
  backgroundColor: '#f0fdf4',
  borderRadius: '8px',
  border: '1px solid #bbf7d0',
  padding: '24px',
  margin: '24px 0',
};

const infoLabel = {
  color: '#166534',
  fontSize: '12px',
  fontWeight: '600' as const,
  letterSpacing: '0.5px',
  margin: '0 0 4px',
  textTransform: 'uppercase' as const,
};

const infoValue = {
  color: '#14532d',
  fontSize: '16px',
  fontWeight: '500' as const,
  margin: '0 0 16px',
};

const successValue = {
  color: '#15803d',
  fontSize: '18px',
  fontWeight: 'bold' as const,
  margin: '0',
};

const hr = {
  borderColor: '#e5e7eb',
  margin: '24px 0',
};

const featureList = {
  margin: '0 0 24px',
  paddingLeft: '8px',
};

const featureItem = {
  color: '#374151',
  fontSize: '14px',
  lineHeight: '28px',
  margin: 0,
};

const disclaimer = {
  color: '#9ca3af',
  fontSize: '13px',
  fontStyle: 'italic' as const,
  margin: '24px 0 0',
  textAlign: 'center' as const,
};

export default TestEmail;
