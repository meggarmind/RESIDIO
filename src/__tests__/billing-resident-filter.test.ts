import { describe, expect, it } from 'vitest';
import {
  buildBillingResidentOptions,
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
});
