import { Heading, Section, Text } from '@react-email/components';
import { EmailLayout } from './components/email-layout';

export type WhatsAppAdminAlertEvent = 'linked' | 'locked';

interface WhatsAppAdminAlertEmailProps {
  firstName: string;
  event: WhatsAppAdminAlertEvent;
  /** Masked WhatsApp number, never the full number. */
  maskedNumber: string;
  estateName: string;
  estateEmail?: string;
  estatePhone?: string;
  estateAddress?: string;
  estateWebsite?: string;
  lockMinutes: number;
}

const HEADINGS: Record<WhatsAppAdminAlertEvent, string> = {
  linked: 'A WhatsApp number was linked to your admin account',
  locked: 'WhatsApp admin mode was locked on your number',
};

export function whatsAppAdminAlertSubject(event: WhatsAppAdminAlertEvent): string {
  return HEADINGS[event];
}

export function WhatsAppAdminAlertEmail({ firstName, event, maskedNumber, estateName, estateEmail, estatePhone, estateAddress, estateWebsite, lockMinutes }: WhatsAppAdminAlertEmailProps) {
  const what = event === 'linked'
    ? `The WhatsApp number ${maskedNumber} can now request admin information from the estate WhatsApp Assistant. Each request still needs a code from your authenticator app.`
    : `Too many wrong codes were sent for WhatsApp admin mode from ${maskedNumber}. Admin mode is locked on that number for ${lockMinutes} minutes.`;

  return (
    <EmailLayout preview={HEADINGS[event]} estateName={estateName} estateEmail={estateEmail} estatePhone={estatePhone} estateAddress={estateAddress} estateWebsite={estateWebsite}>
      <Heading style={heading}>{HEADINGS[event]}</Heading>
      <Text style={paragraph}>Hi {firstName},</Text>
      <Text style={paragraph}>{what}</Text>
      <Section style={warningBox}>
        <Text style={warningText}>
          <strong>Not you?</strong> Unlink the number under Settings &gt; WhatsApp admin access and contact the {estateName} super admin straight away.
        </Text>
      </Section>
    </EmailLayout>
  );
}

const heading = {
  color: '#1a1a2e',
  fontSize: '22px',
  fontWeight: 'bold' as const,
  margin: '0 0 24px',
  padding: 0,
};

const paragraph = {
  color: '#555555',
  fontSize: '15px',
  lineHeight: '26px',
  margin: '0 0 16px',
};

const warningBox = {
  backgroundColor: '#fef3c7',
  borderRadius: '8px',
  border: '1px solid #fbbf24',
  padding: '16px 20px',
  margin: '24px 0 0',
};

const warningText = {
  color: '#92400e',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0',
};

export default WhatsAppAdminAlertEmail;
