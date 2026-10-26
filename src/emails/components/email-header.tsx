import { usableEstateLogoUrl } from '@/lib/branding/estate-logo';
import { Heading, Img, Section } from '@react-email/components';

interface EmailHeaderProps {
  estateName: string;
  estateLogoUrl?: string;
}

export function EmailHeader({ estateName, estateLogoUrl }: EmailHeaderProps) {
  const logoSrc = usableEstateLogoUrl(estateLogoUrl);
  return (
    <Section style={header}>
      {logoSrc && <Img src={logoSrc} alt={estateName} height="48" style={logoImage} />}
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

const logoImage = {
  display: 'block',
  height: '48px',
  margin: '0 auto 12px',
  maxWidth: '200px',
  objectFit: 'contain' as const,
};

const logo = {
  color: '#ffffff',
  fontSize: '24px',
  fontWeight: 'bold' as const,
  margin: 0,
  letterSpacing: '0.5px',
};
