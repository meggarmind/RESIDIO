import { describe, expect, it } from 'vitest';
import { isBridgeProvider } from '@/lib/whatsapp/bridge';

describe('isBridgeProvider', () => {
  it('is true only for the WhatsApp Web bridges', () => {
    expect(isBridgeProvider('chatmaid')).toBe(true);
    expect(isBridgeProvider('waha')).toBe(true);
    expect(isBridgeProvider('meta')).toBe(false);
    expect(isBridgeProvider('twilio')).toBe(false);
    expect(isBridgeProvider(null)).toBe(false);
  });
});
