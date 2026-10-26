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

/**
 * The logo as a PNG/JPEG data URI for `@react-pdf/renderer`, which rejects the whole render when an
 * image URL cannot be fetched or decoded. Undefined on any failure, so the PDF keeps its text header.
 */
export async function estateLogoDataUri(raw: unknown): Promise<string | undefined> {
  const url = usableEstateLogoUrl(raw);
  if (!url) return undefined;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return undefined;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (!isPng && !isJpeg) return undefined;
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `data:${isPng ? 'image/png' : 'image/jpeg'};base64,${btoa(binary)}`;
  } catch (error) {
    console.error('Estate logo could not be loaded for the PDF; using the text header', error);
    return undefined;
  }
}
