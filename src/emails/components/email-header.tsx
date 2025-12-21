import { Heading, Section, Text } from '@react-email/components';

interface EmailHeaderProps {
  estateName: string;
}

export function EmailHeader({ estateName }: EmailHeaderProps) {
  return (
    <Section style={header}>
      <Heading style={logo}>{estateName}</Heading>
    </Section>
  );
}

const header = {
  backgroundColor: '#1a1a2e',
  borderRadius: '8px 8px 0 0',
  padding: '24px 32px',
  textAlign: 'center' as const,
};

const logo = {
  color: '#ffffff',
  fontSize: '24px',
  fontWeight: 'bold' as const,
  margin: 0,
  letterSpacing: '0.5px',
};
