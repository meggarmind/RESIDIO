import { describe, expect, it } from 'vitest';
import { settingValueError } from '@/lib/validators/setting-value';

// The prune deletes audit logs by this setting (#815), so a save must not accept a value that wipes the trail.
describe('audit_log_retention_days', () => {
  it.each([30, '30', 365, 3650, '3650'])('accepts %s', (value) => {
    expect(settingValueError('audit_log_retention_days', value)).toBeNull();
  });

  it.each([0, '0', 29, 3651, 45.5, -1])('refuses %s', (value) => {
    expect(settingValueError('audit_log_retention_days', value)).toBe(
      'Setting "audit_log_retention_days" must be a whole number of days from 30 to 3650',
    );
  });
});
