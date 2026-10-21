import { describe, expect, it } from 'vitest';
import { settingValueError } from '@/lib/validators/setting-value';

// Debt status settings (#980): four labels, the arrears threshold, the report footnote, the chat-PDF limit.
describe('debt status settings', () => {
  it.each(['debt_status_label_arrears', 'debt_status_label_outstanding', 'debt_status_label_paid_in_full', 'debt_status_label_credit'])(
    '%s takes 1 to 40 characters of text',
    (key) => {
      expect(settingValueError(key, 'Owing')).toBeNull();
      expect(settingValueError(key, 'x'.repeat(40))).toBeNull();
      for (const bad of ['', '   ', 'x'.repeat(41), 3, null]) {
        expect(settingValueError(key, bad)).toBe(`Setting "${key}" must be text of 1 to 40 characters`);
      }
    },
  );

  it('the footnote takes 1 to 300 characters of text', () => {
    expect(settingValueError('debt_status_report_footnote', 'For any unlisted residence, contact the Financial Secretary.')).toBeNull();
    expect(settingValueError('debt_status_report_footnote', '')).toMatch(/1 to 300 characters/);
    expect(settingValueError('debt_status_report_footnote', 'x'.repeat(301))).toMatch(/1 to 300 characters/);
  });

  it.each([1, 3, 24, '3'])('the threshold accepts %j', (value) => {
    expect(settingValueError('debt_status_arrears_threshold_months', value)).toBeNull();
  });

  it.each([0, 25, 2.5, '', 'three', -1])('the threshold refuses %j', (value) => {
    expect(settingValueError('debt_status_arrears_threshold_months', value)).toBe(
      'Setting "debt_status_arrears_threshold_months" must be a whole number of months from 1 to 24',
    );
  });

  it.each([1, 40, 500, '40'])('the chat-PDF house limit accepts %j', (value) => {
    expect(settingValueError('debt_status_chat_pdf_house_limit', value)).toBeNull();
  });

  it.each([0, 501, 1.5, ''])('the chat-PDF house limit refuses %j', (value) => {
    expect(settingValueError('debt_status_chat_pdf_house_limit', value)).toBe(
      'Setting "debt_status_chat_pdf_house_limit" must be a whole number of houses from 1 to 500',
    );
  });
});
