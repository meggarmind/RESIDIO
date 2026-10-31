import { format } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: vi.fn(), createAdminClient: vi.fn() }));

import { stripHtmlTags } from '@/lib/email-imports/parsers/first-bank-alert';
import { readSetting } from '@/lib/settings/service';

// #1375: fixes for the CodeQL alerts on Release v2.2.0.
describe('CodeQL fixes (#1375)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('decodes &amp; last, so an escaped entity is not unescaped twice', () => {
    expect(stripHtmlTags('<p>A &amp;lt;b&amp;gt; &amp; B</p>')).toBe('A &lt;b&gt; & B');
  });

  it('still strips tags and decodes entities as before', () => {
    expect(stripHtmlTags('Credited<br/>NGN 5,000&nbsp;by <b>JOHN &amp; SONS</b>')).toBe('Credited\nNGN 5,000 by JOHN & SONS');
  });

  it('logs a setting key verbatim, even when it holds a format specifier', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
    const supabase = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) };

    const result = await readSetting(supabase as never, 'odd_%s_key');

    expect(result).toEqual({ status: 'error', message: 'boom' });
    expect(format(...(spy.mock.calls[0] as [string, ...unknown[]]))).toContain('Get setting value "odd_%s_key" error:');
  });
});
