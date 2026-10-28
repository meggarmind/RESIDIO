import { Heading, Section, Text } from '@react-email/components';
import { EmailLayout } from './components/email-layout';

interface BackupCodesEmailProps {
  firstName: string;
  codes: string[];
  estateName: string;
  estateEmail?: string;
  estatePhone?: string;
  estateAddress?: string;
  estateLogoUrl?: string;
}

export function BackupCodesEmail({
  firstName,
  codes,
  estateName,
  estateEmail,
  estatePhone,
  estateAddress,
  estateLogoUrl,
}: BackupCodesEmailProps) {
  return (
    <EmailLayout
      preview="Your two-factor backup codes"
      estateName={estateName}
      estateEmail={estateEmail}
      estatePhone={estatePhone}
      estateAddress={estateAddress}
      estateLogoUrl={estateLogoUrl}
    >
      <Heading style={heading}>Your Backup Codes</Heading>

      <Text style={greeting}>Hi {firstName},</Text>

      <Text style={paragraph}>
        You asked us to send the two-factor backup codes you just made. Each code signs you in once if
        you lose your authenticator app.
      </Text>

      <Section style={codeBox}>
        <Text style={codeLabel}>Your Backup Codes</Text>
        {codes.map((code) => (
          <Text key={code} style={codeValue}>{code}</Text>
        ))}
      </Section>

      <Section style={warningBox}>
        <Text style={warningText}>
          <strong>Security Notice:</strong> Each code works once. Save the codes somewhere safe, then
          delete this email. Anyone who can open this inbox can use them. {estateName} staff will never
          ask you for these codes.
        </Text>
      </Section>

      <Text style={paragraph}>
        If you did not ask for these codes, make new backup codes in your settings and change your password.
      </Text>

      <Text style={signoff}>
        Best regards,
        <br />
        <strong>{estateName} Management</strong>
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
  textAlign: 'center' as const,
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

const codeBox = {
  backgroundColor: '#f0fdf4',
  borderRadius: '12px',
  border: '2px solid #86efac',
  padding: '24px',
  margin: '32px 0',
  textAlign: 'center' as const,
};

const codeLabel = {
  color: '#166534',
  fontSize: '12px',
  fontWeight: '600' as const,
  letterSpacing: '1px',
  margin: '0 0 16px',
  textTransform: 'uppercase' as const,
};

const codeValue = {
  color: '#166534',
  fontFamily: 'Monaco, Consolas, "Courier New", monospace',
  fontSize: '20px',
  fontWeight: 'bold' as const,
  letterSpacing: '4px',
  margin: '4px 0',
};

const warningBox = {
  backgroundColor: '#fef3c7',
  borderRadius: '8px',
  border: '1px solid #fbbf24',
  padding: '16px 20px',
  margin: '24px 0',
};

const warningText = {
  color: '#92400e',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0',
};

const signoff = {
  color: '#555555',
  fontSize: '15px',
  lineHeight: '26px',
  margin: '32px 0 0',
};

export default BackupCodesEmail;
