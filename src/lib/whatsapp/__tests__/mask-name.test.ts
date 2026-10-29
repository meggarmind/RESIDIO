import { describe, expect, it } from 'vitest';
import { maskName } from '@/lib/whatsapp/mask-name';

describe('maskName (#1294)', () => {
  it.each([
    ['CONSTANCE OKA', 'CO*** OK***'],
    ['TIM AKENROYE (PASTOR) LANDLORD', 'TI*** AK*** (PASTOR) LANDLORD'],
    ['MR LEVI & BARR. LOVE BRAIDE', 'MR LE*** & BARR. LO*** BR***'],
    ['BILL OGBUJI (BILDIAMO LTD - SKYMALL)', 'BI*** OG*** (BI*** LTD - SK***)'],
    ['HOUSE OF MERCY CHURCH', 'HO*** OF ME*** CHURCH'],
    ['CHINONSO A. BENEDICT', 'CH*** A. BE***'],
    ['  Ada   Obi ', 'Ad*** Ob***'],
  ])('masks %s as %s', (name, masked) => {
    expect(maskName(name)).toBe(masked);
  });

  it('gives an empty string for no name', () => {
    expect(maskName(null)).toBe('');
    expect(maskName('')).toBe('');
  });
});
