import { Heading, Section, Text } from '@react-email/components';
import { EmailLayout } from './components/email-layout';

interface WhatsAppPaymentApprovalAlertEmailProps {
  firstName: string;
  /** The admin who approved, as "Name (Role)". */
  approver: string;
  amount: string;
  property: string;
  resident: string;
  /** When it was approved, Lagos time. */
  approvedAt: string;
  estateName: string;
  estateEmail?: string;
  estatePhone?: string;
  estateAddress?: string;
  estateLogoUrl?: string;
  estateWebsite?: string;
}

export const WHATSAPP_PAYMENT_APPROVAL_ALERT_SUBJECT = 'A payment report was approved on WhatsApp without a code';

/**
 * Sent to the Financial Officer and the Chairman each time a payment report is approved in WhatsApp
 * Admin tools while no code was needed (#1290 decision 8, #1297).
 */
export function WhatsAppPaymentApprovalAlertEmail({ firstName, approver, amount, property, resident, approvedAt, estateName, estateEmail, estatePhone, estateAddress, estateWebsite, estateLogoUrl }: WhatsAppPaymentApprovalAlertEmailProps) {
  return (
    <EmailLayout preview={WHATSAPP_PAYMENT_APPROVAL_ALERT_SUBJECT} estateName={estateName} estateEmail={estateEmail} estatePhone={estatePhone} estateAddress={estateAddress} estateWebsite={estateWebsite} estateLogoUrl={estateLogoUrl}>
      <Heading style={heading}>{WHATSAPP_PAYMENT_APPROVAL_ALERT_SUBJECT}</Heading>
      <Text style={paragraph}>Hi {firstName},</Text>
      <Text style={paragraph}>
        {approver} approved a payment report in WhatsApp Admin tools at {approvedAt}. The payment is verified and the wallet is credited.
      </Text>
      <Section style={detailBox}>
        <Text style={detailText}>Amount: {amount}</Text>
        <Text style={detailText}>House: {property}</Text>
        <Text style={detailText}>Resident: {resident}</Text>
      </Section>
      <Text style={paragraph}>
        Admin tools did not need an authenticator code for this admin. If this approval is wrong, check it in the dashboard under Payments.
      </Text>
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

const detailBox = {
  backgroundColor: '#f8fafc',
  borderRadius: '8px',
  border: '1px solid #e2e8f0',
  padding: '16px 20px',
  margin: '0 0 16px',
};

const detailText = {
  color: '#1a1a2e',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0',
};

export default WhatsAppPaymentApprovalAlertEmail;
