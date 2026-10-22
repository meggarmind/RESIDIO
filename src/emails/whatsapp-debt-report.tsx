import { Heading, Text } from '@react-email/components';
import { EmailLayout } from './components/email-layout';

interface WhatsAppDebtReportEmailProps {
  firstName: string;
  estateName: string;
  scopeLabel: string;
}

/** The debt status report an admin asked for on WhatsApp (#982). The PDF is attached. */
export function WhatsAppDebtReportEmail({ firstName, estateName, scopeLabel }: WhatsAppDebtReportEmailProps) {
  return (
    <EmailLayout preview={`Debt status report: ${scopeLabel}`} estateName={estateName}>
      <Heading style={heading}>Debt status report</Heading>
      <Text style={paragraph}>Hi {firstName},</Text>
      <Text style={paragraph}>
        Here is the debt status report you asked for on WhatsApp ({scopeLabel}). It is attached as a PDF.
      </Text>
    </EmailLayout>
  );
}

const heading = { color: '#1a1a2e', fontSize: '22px', fontWeight: 'bold' as const, margin: '0 0 24px', padding: 0 };
const paragraph = { color: '#555555', fontSize: '15px', lineHeight: '26px', margin: '0 0 16px' };
