import { Heading, Section, Text } from '@react-email/components';
import { EmailLayout } from './components/email-layout';

export type WhatsAppPinAlertEvent = 'set' | 'change' | 'reset';

interface WhatsAppPinAlertEmailProps {
  firstName: string;
  event: WhatsAppPinAlertEvent;
  /** Masked WhatsApp numbers, never the full number. */
  maskedNumbers: string[];
  estateName: string;
  estateEmail?: string;
  estatePhone?: string;
  estateAddress?: string;
  estateWebsite?: string;
}

const HEADINGS: Record<WhatsAppPinAlertEvent, string> = {
  set: 'Your WhatsApp PIN was set',
  change: 'Your WhatsApp PIN was changed',
  reset: 'Your WhatsApp PIN was reset',
};

export function whatsAppPinAlertSubject(event: WhatsAppPinAlertEvent): string {
  return HEADINGS[event];
}

export function WhatsAppPinAlertEmail({ firstName, event, maskedNumbers, estateName, estateEmail, estatePhone, estateAddress, estateWebsite }: WhatsAppPinAlertEmailProps) {
  const numbers = maskedNumbers.length ? maskedNumbers.join(', ') : 'your WhatsApp number';
  const what = event === 'reset'
    ? `The estate office reset the PIN that protects your financial standing on the estate WhatsApp Assistant (${numbers}). You will need a new setup code from the estate office to set a PIN again.`
    : `The PIN that protects your financial standing on the estate WhatsApp Assistant was ${event === 'set' ? 'set' : 'changed'} from ${numbers}.`;

  return (
    <EmailLayout preview={HEADINGS[event]} estateName={estateName} estateEmail={estateEmail} estatePhone={estatePhone} estateAddress={estateAddress} estateWebsite={estateWebsite}>
      <Heading style={heading}>{HEADINGS[event]}</Heading>
      <Text style={paragraph}>Hi {firstName},</Text>
      <Text style={paragraph}>{what}</Text>
      <Section style={warningBox}>
        <Text style={warningText}>
          <strong>Not you?</strong> Contact the {estateName} estate office straight away.
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

export default WhatsAppPinAlertEmail;
