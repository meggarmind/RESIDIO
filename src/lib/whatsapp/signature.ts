import { createHmac, timingSafeEqual } from 'node:crypto';

function normalizeSignature(signature: string): string | null {
  const value = signature.trim();
  return value.startsWith('sha256=') ? value.slice('sha256='.length) : null;
}

export function verifyWhatsAppSignature(
  rawBody: string,
  signature: string | null,
  appSecret: string
): boolean {
  if (!signature || !appSecret) {
    return false;
  }

  const provided = normalizeSignature(signature);
  if (!provided || !/^[a-f0-9]{64}$/i.test(provided)) {
    return false;
  }

  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const providedBuffer = Buffer.from(provided, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');

  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}

export function verifyWhatsAppToken(provided: string | null, expected: string): boolean {
  if (!provided || !expected) {
    return false;
  }

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}
