import { describe, expect, it } from 'vitest';
import { ADMIN_DAILY_ACTION_CAP, resolveAdminDailyCap } from '@/lib/whatsapp/admin';

describe('resolveAdminDailyCap', () => {
  it('uses a valid per-role limit, including zero', () => {
    expect(resolveAdminDailyCap({ chairman: 10 }, 'chairman')).toBe(10);
    expect(resolveAdminDailyCap('{"chairman":"7"}', 'chairman')).toBe(7);
    expect(resolveAdminDailyCap({ chairman: 0 }, 'chairman')).toBe(0);
  });

  it.each([null, '', '  ', false, [], 'abc', 1.5, -1])('falls back to the default for %j', (bad) => {
    expect(resolveAdminDailyCap({ chairman: bad }, 'chairman')).toBe(ADMIN_DAILY_ACTION_CAP);
  });
});
