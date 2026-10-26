/**
 * The estate logo URL as emails and PDFs may use it, or undefined to keep the text header.
 * Blank values give undefined. So does a `.webp` logo saved before uploads refused WebP (#1202):
 * `@react-pdf/renderer` cannot draw it and some email clients do not show it.
 */
export function usableEstateLogoUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const url = raw.trim();
  if (!url) return undefined;
  const path = url.split(/[?#]/)[0].toLowerCase();
  return path.endsWith('.webp') ? undefined : url;
}
