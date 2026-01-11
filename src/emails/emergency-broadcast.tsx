import {
  Text,
  Section,
  Button,
  Hr,
} from '@react-email/components';
import { EmailLayout } from './components/email-layout';

interface EmergencyBroadcastEmailProps {
  estateName: string;
  estateEmail?: string;
  estatePhone?: string;
  estateAddress?: string;
  estateWebsite?: string;
  title: string;
  content: string;
  summary?: string;
  broadcastTime: string;
  viewUrl?: string;
}

export function EmergencyBroadcastEmail({
  estateName,
  estateEmail,
  estatePhone,
  estateAddress,
  estateWebsite,
  title,
  content,
  summary,
  broadcastTime,
  viewUrl,
}: EmergencyBroadcastEmailProps) {
  return (
    <EmailLayout
      preview={`EMERGENCY: ${title}`}
      estateName={estateName}
      estateEmail={estateEmail}
      estatePhone={estatePhone}
      estateAddress={estateAddress}
      estateWebsite={estateWebsite}
    >
      {/* Emergency Banner */}
      <Section
        style={{
          backgroundColor: '#fee2e2',
          borderLeft: '4px solid #dc2626',
          padding: '16px 20px',
          borderRadius: '4px',
          marginBottom: '24px',
        }}
      >
        <Text
          style={{
            color: '#dc2626',
            fontSize: '14px',
            fontWeight: '600',
            margin: '0 0 4px 0',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          EMERGENCY ALERT
        </Text>
        <Text
          style={{
            color: '#991b1b',
            fontSize: '20px',
            fontWeight: '700',
            margin: '0',
          }}
        >
          {title}
        </Text>
      </Section>

      {/* Summary (if provided) */}
      {summary && (
        <Section style={{ marginBottom: '16px' }}>
          <Text
            style={{
              fontSize: '16px',
              lineHeight: '24px',
              color: '#374151',
              fontWeight: '600',
              margin: '0',
            }}
          >
            {summary}
          </Text>
        </Section>
      )}

      {/* Main Content */}
      <Section style={{ marginBottom: '24px' }}>
        <Text style={paragraph}>{content}</Text>
      </Section>

      {/* Action Button */}
      {viewUrl && (
        <Section style={{ textAlign: 'center', marginBottom: '24px' }}>
          <Button
            href={viewUrl}
            style={{
              backgroundColor: '#dc2626',
              color: '#ffffff',
              padding: '14px 28px',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '600',
              textDecoration: 'none',
            }}
          >
            View Full Announcement
          </Button>
        </Section>
      )}

      <Hr style={{ borderColor: '#e5e7eb', margin: '24px 0' }} />

      {/* Emergency Contacts Section */}
      <Section style={{ marginBottom: '24px' }}>
        <Text
          style={{
            fontSize: '14px',
            fontWeight: '600',
            color: '#374151',
            marginBottom: '12px',
          }}
        >
          Emergency Contacts:
        </Text>
        <Section
          style={{
            backgroundColor: '#fef3c7',
            borderRadius: '8px',
            padding: '16px',
          }}
        >
          <Text style={emergencyContactText}>
            Estate Security Gate: Contact your estate security directly
          </Text>
          {estatePhone && (
            <Text style={emergencyContactText}>
              Estate Office: {estatePhone}
            </Text>
          )}
          <Text style={emergencyContactText}>
            Emergency Services: 112 (National Emergency Number)
          </Text>
          <Text style={emergencyContactText}>
            Fire Service: 01-7944929
          </Text>
          <Text style={emergencyContactText}>
            Police Emergency: 199
          </Text>
        </Section>
      </Section>

      <Hr style={{ borderColor: '#e5e7eb', margin: '24px 0' }} />

      {/* Timestamp */}
      <Section>
        <Text style={footerText}>
          This emergency broadcast was sent at{' '}
          {new Date(broadcastTime).toLocaleString('en-US', {
            dateStyle: 'full',
            timeStyle: 'long',
          })}
        </Text>
        <Text style={footerText}>
          If you believe you received this in error or are no longer a resident,
          please contact the estate management.
        </Text>
      </Section>
    </EmailLayout>
  );
}

const paragraph = {
  fontSize: '15px',
  lineHeight: '26px',
  color: '#374151',
  margin: '0',
  whiteSpace: 'pre-wrap' as const,
};

const emergencyContactText = {
  fontSize: '13px',
  color: '#92400e',
  margin: '4px 0',
  fontWeight: '500' as const,
};

const footerText = {
  fontSize: '12px',
  color: '#9ca3af',
  margin: '4px 0',
};

export default EmergencyBroadcastEmail;
