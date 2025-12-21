import { Button, Heading, Hr, Section, Text } from '@react-email/components';
import { EmailLayout } from './components/email-layout';

interface WelcomeResidentEmailProps {
  residentName: string;
  residentCode: string;
  houseNumber?: string;
  streetName?: string;
  estateName: string;
  estateEmail?: string;
  estatePhone?: string;
  estateAddress?: string;
  portalUrl?: string;
}

export function WelcomeResidentEmail({
  residentName,
  residentCode,
  houseNumber,
  streetName,
  estateName,
  estateEmail,
  estatePhone,
  estateAddress,
  portalUrl,
}: WelcomeResidentEmailProps) {
  return (
    <EmailLayout
      preview={`Welcome to ${estateName}!`}
      estateName={estateName}
      estateEmail={estateEmail}
      estatePhone={estatePhone}
      estateAddress={estateAddress}
    >
      <Heading style={heading}>Welcome to {estateName}!</Heading>

      <Text style={greeting}>Dear {residentName},</Text>

      <Text style={paragraph}>
        We are delighted to welcome you to our community. Your account has been successfully
        created in the estate management system.
      </Text>

      <Section style={infoBox}>
        <Text style={infoLabel}>Your Resident Code</Text>
        <Text style={codeValue}>{residentCode}</Text>

        {houseNumber && (
          <>
            <Text style={infoLabel}>Property</Text>
            <Text style={infoValue}>
              {houseNumber}
              {streetName ? `, ${streetName}` : ''}
            </Text>
          </>
        )}
      </Section>

      <Text style={importantNote}>
        <strong>Important:</strong> Please keep your resident code safe as it may be required
        for various estate services and identification purposes.
      </Text>

      {portalUrl && (
        <Section style={buttonSection}>
          <Button style={button} href={portalUrl}>
            Access Resident Portal
          </Button>
        </Section>
      )}

      <Hr style={hr} />

      <Text style={paragraph}>
        As a member of our community, you will have access to:
      </Text>

      <Section style={featureList}>
        <Text style={featureItem}>✓ Online payment management</Text>
        <Text style={featureItem}>✓ Security contact registration</Text>
        <Text style={featureItem}>✓ Estate announcements and updates</Text>
        <Text style={featureItem}>✓ Service request submission</Text>
      </Section>

      <Text style={paragraph}>
        If you have any questions or need assistance, please don&apos;t hesitate to contact
        the estate management team.
      </Text>

      <Text style={signoff}>
        Welcome aboard!
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

const infoBox = {
  backgroundColor: '#f0f9ff',
  borderRadius: '8px',
  border: '1px solid #bae6fd',
  padding: '24px',
  margin: '24px 0',
  textAlign: 'center' as const,
};

const infoLabel = {
  color: '#0369a1',
  fontSize: '12px',
  fontWeight: '600' as const,
  letterSpacing: '0.5px',
  margin: '0 0 8px',
  textTransform: 'uppercase' as const,
};

const codeValue = {
  backgroundColor: '#ffffff',
  borderRadius: '8px',
  color: '#0c4a6e',
  fontFamily: 'monospace',
  fontSize: '32px',
  fontWeight: 'bold' as const,
  letterSpacing: '4px',
  margin: '0 0 16px',
  padding: '12px 24px',
  display: 'inline-block' as const,
};

const infoValue = {
  color: '#0c4a6e',
  fontSize: '16px',
  fontWeight: '500' as const,
  margin: '0',
};

const importantNote = {
  backgroundColor: '#fef3c7',
  borderRadius: '6px',
  color: '#92400e',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '24px 0',
  padding: '12px 16px',
};

const buttonSection = {
  textAlign: 'center' as const,
  margin: '32px 0',
};

const button = {
  backgroundColor: '#059669',
  borderRadius: '6px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: '600' as const,
  padding: '12px 24px',
  textDecoration: 'none',
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

const signoff = {
  color: '#555555',
  fontSize: '15px',
  lineHeight: '26px',
  margin: '24px 0 0',
};

export default WelcomeResidentEmail;
