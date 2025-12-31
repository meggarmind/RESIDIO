import { Heading, Section, Text } from '@react-email/components';
import { EmailLayout } from './components/email-layout';

interface VerificationCodeEmailProps {
  firstName: string;
  otp: string;
  expiryMinutes: number;
  estateName: string;
  estateEmail?: string;
  estatePhone?: string;
  estateAddress?: string;
}

export function VerificationCodeEmail({
  firstName,
  otp,
  expiryMinutes,
  estateName,
  estateEmail,
  estatePhone,
  estateAddress,
}: VerificationCodeEmailProps) {
  return (
    <EmailLayout
      preview={`Your verification code is ${otp}`}
      estateName={estateName}
      estateEmail={estateEmail}
      estatePhone={estatePhone}
      estateAddress={estateAddress}
    >
      <Heading style={heading}>Verify Your Email</Heading>

      <Text style={greeting}>Hi {firstName},</Text>

      <Text style={paragraph}>
        Please use the verification code below to verify your email address.
        This code will expire in {expiryMinutes} minutes.
      </Text>

      <Section style={codeBox}>
        <Text style={codeLabel}>Your Verification Code</Text>
        <Text style={codeValue}>{otp}</Text>
      </Section>

      <Section style={warningBox}>
        <Text style={warningText}>
          <strong>Security Notice:</strong> Never share this code with anyone.
          {estateName} staff will never ask you for this code.
        </Text>
      </Section>

      <Text style={paragraph}>
        If you didn&apos;t request this code, you can safely ignore this email.
        Someone may have entered your email address by mistake.
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
  padding: '32px',
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
  backgroundColor: '#ffffff',
  borderRadius: '8px',
  color: '#166534',
  fontFamily: 'Monaco, Consolas, "Courier New", monospace',
  fontSize: '40px',
  fontWeight: 'bold' as const,
  letterSpacing: '8px',
  margin: '0',
  padding: '16px 32px',
  display: 'inline-block' as const,
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

export default VerificationCodeEmail;
