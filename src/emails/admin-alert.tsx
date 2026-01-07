import {
  Text,
  Section,
  Row,
  Column,
  Button,
  Hr,
} from '@react-email/components';
import { EmailLayout } from './components/email-layout';

interface AdminAlertEmailProps {
  estateName: string;
  title: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  details?: Record<string, string | number | boolean>;
  actionUrl?: string;
  actionLabel?: string;
  timestamp: string;
}

export function AdminAlertEmail({
  estateName,
  title,
  severity,
  message,
  details,
  actionUrl,
  actionLabel,
  timestamp,
}: AdminAlertEmailProps) {
  const severityColors = {
    info: { bg: '#e0f2fe', border: '#0ea5e9', text: '#0369a1' },
    warning: { bg: '#fef3c7', border: '#f59e0b', text: '#b45309' },
    critical: { bg: '#fee2e2', border: '#ef4444', text: '#b91c1c' },
  };

  const colors = severityColors[severity];

  return (
    <EmailLayout
      preview={`[${severity.toUpperCase()}] ${title}`}
      estateName={estateName}
    >
      {/* Alert Banner */}
      <Section
        style={{
          backgroundColor: colors.bg,
          borderLeft: `4px solid ${colors.border}`,
          padding: '16px 20px',
          borderRadius: '4px',
          marginBottom: '24px',
        }}
      >
        <Text
          style={{
            color: colors.text,
            fontSize: '14px',
            fontWeight: '600',
            margin: '0 0 4px 0',
            textTransform: 'uppercase',
          }}
        >
          {severity} Alert
        </Text>
        <Text
          style={{
            color: colors.text,
            fontSize: '18px',
            fontWeight: '700',
            margin: '0',
          }}
        >
          {title}
        </Text>
      </Section>

      {/* Message */}
      <Section style={{ marginBottom: '24px' }}>
        <Text style={paragraph}>{message}</Text>
      </Section>

      {/* Details Table */}
      {details && Object.keys(details).length > 0 && (
        <Section style={{ marginBottom: '24px' }}>
          <Text
            style={{
              fontSize: '14px',
              fontWeight: '600',
              color: '#374151',
              marginBottom: '12px',
            }}
          >
            Details:
          </Text>
          <Section
            style={{
              backgroundColor: '#f9fafb',
              borderRadius: '8px',
              padding: '16px',
            }}
          >
            {Object.entries(details).map(([key, value]) => (
              <Row key={key} style={{ marginBottom: '8px' }}>
                <Column style={{ width: '40%' }}>
                  <Text style={detailLabel}>{key}:</Text>
                </Column>
                <Column style={{ width: '60%' }}>
                  <Text style={detailValue}>{String(value)}</Text>
                </Column>
              </Row>
            ))}
          </Section>
        </Section>
      )}

      {/* Action Button */}
      {actionUrl && (
        <Section style={{ textAlign: 'center', marginBottom: '24px' }}>
          <Button
            href={actionUrl}
            style={{
              backgroundColor: colors.border,
              color: '#ffffff',
              padding: '12px 24px',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '600',
              textDecoration: 'none',
            }}
          >
            {actionLabel || 'View Details'}
          </Button>
        </Section>
      )}

      <Hr style={{ borderColor: '#e5e7eb', margin: '24px 0' }} />

      {/* Timestamp */}
      <Section>
        <Text style={footerText}>
          This alert was generated at {new Date(timestamp).toLocaleString('en-US', {
            dateStyle: 'full',
            timeStyle: 'long',
          })}
        </Text>
        <Text style={footerText}>
          This is an automated system notification. Please do not reply to this email.
        </Text>
      </Section>
    </EmailLayout>
  );
}

const paragraph = {
  fontSize: '15px',
  lineHeight: '24px',
  color: '#374151',
  margin: '0',
};

const detailLabel = {
  fontSize: '13px',
  color: '#6b7280',
  margin: '0',
};

const detailValue = {
  fontSize: '13px',
  color: '#111827',
  fontWeight: '500' as const,
  margin: '0',
};

const footerText = {
  fontSize: '12px',
  color: '#9ca3af',
  margin: '4px 0',
};

export default AdminAlertEmail;
