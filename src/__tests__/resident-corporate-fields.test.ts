import { describe, expect, it } from 'vitest';
import { resolveSubmittedCorporateFields } from '@/lib/validators/resident';

describe('resolveSubmittedCorporateFields', () => {
  const corporate = {
    first_name: 'Ada',
    entity_type: 'corporate' as const,
    company_name: 'Acme Ltd',
    rc_number: 'RC123456',
    liaison_contact_name: 'Ben Ojo',
    liaison_contact_phone: '08012345678',
  };

  it('preserves corporate field values for corporate entities', () => {
    const result = resolveSubmittedCorporateFields(corporate);

    expect(result.company_name).toBe('Acme Ltd');
    expect(result.rc_number).toBe('RC123456');
    expect(result.liaison_contact_name).toBe('Ben Ojo');
    expect(result.liaison_contact_phone).toBe('08012345678');
  });

  it('clears corporate fields on submit when entity type is individual', () => {
    const result = resolveSubmittedCorporateFields({ ...corporate, entity_type: 'individual' as const });

    expect(result.company_name).toBe('');
    expect(result.rc_number).toBe('');
    expect(result.liaison_contact_name).toBe('');
    expect(result.liaison_contact_phone).toBe('');
  });

  it('clears corporate fields when entity type is missing', () => {
    const result = resolveSubmittedCorporateFields({ ...corporate, entity_type: undefined });

    expect(result.company_name).toBe('');
    expect(result.rc_number).toBe('');
    expect(result.liaison_contact_name).toBe('');
    expect(result.liaison_contact_phone).toBe('');
  });

  it('leaves non-corporate fields untouched when clearing', () => {
    const result = resolveSubmittedCorporateFields({ ...corporate, entity_type: 'individual' as const });

    expect(result.first_name).toBe('Ada');
    expect(result.entity_type).toBe('individual');
  });
});
