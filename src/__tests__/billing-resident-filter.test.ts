import { describe, expect, it } from 'vitest';
import {
  buildBillingResidentOptions,
  getPresetInvoiceDateRange,
  getInitialBillingResidentId,
} from '@/app/(dashboard)/billing/page';

describe('billing resident filter', () => {
  it('uses the resident_id URL value as the initial filter', () => {
    expect(getInitialBillingResidentId('resident-2')).toBe('resident-2');
    expect(getInitialBillingResidentId(null)).toBe('all');
  });

  it('sorts residents by first and last name and makes aliases searchable', () => {
    const options = buildBillingResidentOptions(
      [
        { id: '3', first_name: 'Zainab', last_name: 'Adeleke' },
        { id: '2', first_name: 'Ada', last_name: 'Okafor' },
        { id: '1', first_name: 'Ada', last_name: 'Balogun' },
      ],
      new Map([
        ['2', ['Ada-O']],
        ['3', ['Zee Homes']],
      ])
    );

    expect(options).toEqual([
      { value: 'all', label: 'All residents' },
      { value: '1', label: 'Ada Balogun' },
      { value: '2', label: 'Ada Okafor (Ada-O)' },
      { value: '3', label: 'Zainab Adeleke (Zee Homes)' },
    ]);
  });

  it('uses valid calendar boundaries for preset invoice period ranges', () => {
    expect(getPresetInvoiceDateRange('this_month', new Date(2026, 1, 15))).toEqual({
      periodFrom: '2026-02-01',
      periodTo: '2026-02-28',
    });
    expect(getPresetInvoiceDateRange('last_month', new Date(2024, 2, 15))).toEqual({
      periodFrom: '2024-02-01',
      periodTo: '2024-02-29',
    });
    expect(getPresetInvoiceDateRange('last_3_months', new Date(2026, 0, 15))).toEqual({
      periodFrom: '2025-11-01',
      periodTo: '2026-01-31',
    });
    expect(getPresetInvoiceDateRange('this_year', new Date(2026, 8, 9))).toEqual({
      periodFrom: '2026-01-01',
      periodTo: '2026-12-31',
    });
  });
});
