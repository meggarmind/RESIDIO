import { Text, Section } from '@react-email/components';
import { EmailLayout } from './components/email-layout';

interface ScheduledReportEmailProps {
  estateName: string;
  estateEmail?: string;
  estatePhone?: string;
  estateAddress?: string;
  estateWebsite?: string;
  reportLabel: string;
  /** Human-readable period, e.g. "01 Sep 2026 to 30 Sep 2026"; omitted for point-in-time reports. */
  periodLabel?: string;
}

export function ScheduledReportEmail({
  estateName,
  estateEmail,
  estatePhone,
  estateAddress,
  estateWebsite,
  reportLabel,
  periodLabel,
}: ScheduledReportEmailProps) {
  return (
    <EmailLayout
      preview={`${reportLabel} from ${estateName}`}
      estateName={estateName}
      estateEmail={estateEmail}
      estatePhone={estatePhone}
      estateAddress={estateAddress}
      estateWebsite={estateWebsite}
    >
      <Section style={{ marginBottom: '24px' }}>
        <Text style={paragraph}>
          The scheduled {reportLabel} from {estateName} is attached as a PDF.
        </Text>
        {periodLabel && <Text style={paragraph}>Period covered: {periodLabel}</Text>}
      </Section>
    </EmailLayout>
  );
}

const paragraph = {
  fontSize: '15px',
  lineHeight: '24px',
  color: '#374151',
  margin: '0 0 8px 0',
};

export default ScheduledReportEmail;
