import { Image, View } from '@react-pdf/renderer';
import { usableEstateLogoUrl } from '@/lib/branding/estate-logo';

/** The estate logo for a PDF header; renders nothing when there is no usable logo. */
export function PdfEstateLogo({ url, align = 'flex-start' }: { url?: string; align?: 'flex-start' | 'center' }) {
  const src = usableEstateLogoUrl(url);
  if (!src) return null;
  return (
    <View style={{ alignItems: align, marginBottom: 8 }}>
      {/* react-pdf Image has no alt prop */}
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <Image src={src} style={{ height: 40, maxWidth: 160, objectFit: 'contain' }} />
    </View>
  );
}
