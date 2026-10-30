import { describe, expect, it } from 'vitest';
import { IMPORT_RULES_MAX_ITEMS, parseRuleList, validateImportRules } from '@/lib/email-imports/import-rules';

// #1349: each sender becomes `from:<sender>` and each subject word `"<word>"` in the Gmail query.

describe('parseRuleList', () => {
  it('splits on lines and commas, trims, and drops blanks and repeats', () => {
    expect(parseRuleList(' a.com \n\nb.com, a.com ,')).toEqual(['a.com', 'b.com']);
  });
});

describe('validateImportRules', () => {
  const ok = (senders: string[], keywords: string[] = []) => validateImportRules({ senders, keywords });

  it('accepts domains and email addresses, lower-cased', () => {
    expect(ok(['FirstBankNigeria.com', 'opera4street@gmail.com'], ['FirstBank Alert'])).toEqual({
      rules: { senders: ['firstbanknigeria.com', 'opera4street@gmail.com'], keywords: ['FirstBank Alert'] },
      error: null,
    });
  });

  it('accepts no subject words', () => {
    expect(ok(['firstbank.com']).error).toBeNull();
  });

  it.each([
    ['a value with Gmail syntax', 'x.com OR in:anywhere'],
    ['a bare word', 'firstbank'],
    ['a value with a quote', 'a"b.com'],
  ])('refuses %s as a sender', (_label, sender) => {
    expect(ok([sender]).error).toMatch(/not an email address or a domain/);
  });

  it('needs at least one sender', () => {
    expect(ok(['  ']).error).toBe('Enter at least one sender.');
  });

  it('refuses more than the maximum number of senders', () => {
    const many = Array.from({ length: IMPORT_RULES_MAX_ITEMS + 1 }, (_, i) => `s${i}.com`);
    expect(ok(many).error).toMatch(/at most 20 senders/);
    expect(ok(many.slice(1)).error).toBeNull();
  });

  it('refuses a subject word with a quote or a backslash', () => {
    expect(ok(['a.com'], ['say "hi"']).error).toMatch(/no quotes/);
    expect(ok(['a.com'], ['a\\b']).error).toMatch(/no quotes/);
  });

  it('refuses input that is not a list of strings', () => {
    expect(validateImportRules({ senders: 'a.com', keywords: [] }).error).toMatch(/Senders must be a list/);
    expect(validateImportRules({ senders: ['a.com'], keywords: [1] }).error).toMatch(/Subject words must be a list/);
  });
});
