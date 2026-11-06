import { describe, expect, it } from 'vitest';
import { settingValueError } from '@/lib/validators/setting-value';

// The active SMS provider (#1462): only a known provider name may be stored.
describe('sms_provider', () => {
  it.each(['termii', 'hollatags'])('accepts %j', (value) => {
    expect(settingValueError('sms_provider', value)).toBeNull();
  });

  it.each(['', 'Termii', 'twilio', 'hollatags ', null, 5, true])('refuses %j', (value) => {
    expect(settingValueError('sms_provider', value)).toBe('Setting "sms_provider" must be one of: termii, hollatags');
  });
});
