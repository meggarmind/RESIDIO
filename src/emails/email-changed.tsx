import { Heading, Text } from '@react-email/components';
import { EmailLayout } from './components/email-layout';

interface EmailChangedEmailProps {
  firstName: string;
  /** The new address, already masked (`n***@gmail.com`). */
  maskedNewEmail: string;
  estateName: string;
  estateEmail?: string;
  estatePhone?: string;
  estateAddress?: string;
}

/** Sent to the OLD address when a resident changes their email over WhatsApp (#816 decision 7). */
export function EmailChangedEmail({
  firstName,
  maskedNewEmail,
  estateName,
  estateEmail,
  estatePhone,
  estateAddress,
}: EmailChangedEmailProps) {
  return (
    <EmailLayout
      preview="Your email address was changed"
      estateName={estateName}
      estateEmail={estateEmail}
      estatePhone={estatePhone}
      estateAddress={estateAddress}
    >
      <Heading style={heading}>Your email was changed</Heading>

      <Text style={paragraph}>Hi {firstName},</Text>

      <Text style={paragraph}>
        Your email was changed to {maskedNewEmail} via WhatsApp. If this wasn&apos;t you, contact the
        estate office.
      </Text>

      <Text style={paragraph}>
        Best regards,
        <br />
        <strong>{estateName} Management</strong>
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
  textAlign: 'center' as const,
};

const paragraph = {
  color: '#555555',
  fontSize: '15px',
  lineHeight: '26px',
  margin: '0 0 24px',
};
