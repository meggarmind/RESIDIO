import { describe, expect, it } from 'vitest';
import { settingValueError } from '@/lib/validators/setting-value';

// The clearance certificate copy group (#816): blank means no copies, anything else must be a group id.
describe('clearance_copy_recipient_group_id', () => {
  it.each(['', '3f9a1c20-1111-4222-8333-444455556666'])('accepts %j', (value) => {
    expect(settingValueError('clearance_copy_recipient_group_id', value)).toBeNull();
  });

  it.each(['estate officials', '123', null, 5, true])('refuses %j', (value) => {
    expect(settingValueError('clearance_copy_recipient_group_id', value)).toBe('Setting "clearance_copy_recipient_group_id" must be blank or a recipient group id');
  });
});
