import { describe, expect, it } from 'vitest';
import { parseWhatsAppOptInImport } from '@/lib/whatsapp/admin-import';

describe('WhatsApp opt-in import parser', () => {
  it('accepts a header, normalizes phones, and collapses duplicates', () => {
    const result = parseWhatsAppOptInImport([
      'resident_code,phone_number',
      'RES001,08000000000',
      'RES001,+2348000000000',
    ].join('\n'));

    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([{ residentCode: 'RES001', phoneNumber: '+2348000000000' }]);
  });

  it('reports malformed rows while retaining valid rows', () => {
    const result = parseWhatsAppOptInImport('RES001,+2348000000000\ninvalid');

    expect(result.rows).toHaveLength(1);
    expect(result.errors).toEqual([{ line: 2, error: 'Expected resident_code,phone_number' }]);
  });
});
