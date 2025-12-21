import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Section,
} from '@react-email/components';
import { EmailHeader } from './email-header';
import { EmailFooter } from './email-footer';

interface EmailLayoutProps {
  preview: string;
  estateName: string;
  estateEmail?: string;
  estatePhone?: string;
  estateAddress?: string;
  estateWebsite?: string;
  children: React.ReactNode;
}

export function EmailLayout({
  preview,
  estateName,
  estateEmail,
  estatePhone,
  estateAddress,
  estateWebsite,
  children,
}: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <EmailHeader estateName={estateName} />
          <Section style={content}>{children}</Section>
          <EmailFooter
            estateName={estateName}
            estateEmail={estateEmail}
            estatePhone={estatePhone}
            estateAddress={estateAddress}
            estateWebsite={estateWebsite}
          />
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: '#f4f4f5',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  padding: '40px 0',
};

const container = {
  backgroundColor: '#ffffff',
  borderRadius: '8px',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
  margin: '0 auto',
  maxWidth: '580px',
};

const content = {
  padding: '32px',
};
